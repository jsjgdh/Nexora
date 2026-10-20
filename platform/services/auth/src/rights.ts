import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  CURRENT_DOCUMENT_VERSIONS,
  RIGHTS_RESPONSE_DAYS,
  consentWithdrawSchema,
  deleteAccountSchema,
  rightsRequestSchema,
  type ConsentDocument,
  type ConsentRecordView,
  type LawfulBasis,
  type RightsRequestRecord,
} from "@nexora/contracts";
import { ApiError, newId, parseOr400, requireUserId, sha256 } from "@nexora/service-kit";

/* Lawful basis and data-subject rights, in one place.
 *
 * The audit this answers (company/LEGAL-COMPLIANCE-AUDIT.md, findings F-04,
 * F-05, F-06 and F-13) found the product collecting identities, payments and
 * learner code while having no way to give any of it back, erase it, or show
 * what a person had agreed to. A right with no mechanism is not a right; the
 * deadline still runs, and the failure is measured in days from the moment
 * somebody asks. So this module is the mechanism:
 *
 *   consents          what was agreed to, at which version, on which basis.
 *   rights_requests   the request, its statutory clock, and its answer.
 *   erasures          what was deleted, what could not be, and why.
 *   processor_deletions  the processors that hold their own copy.
 *
 * Three rules are structural rather than conventional here, and each one exists
 * because the obvious implementation of it is a lie:
 *
 *   1. Erasure is confirmed by a typed word, not a boolean. It takes every
 *      session, proof and consent with it, so a stray click must not be able to
 *      produce it.
 *   2. Deletion writes an account-wide credential cut-off *before* the account
 *      row goes, into a table with no foreign key (see
 *      deleted_subject_revocations). Without it the access token in the
 *      learner's hands keeps opening the door on a deleted account.
 *   3. The response names what was *retained* and the basis for keeping it. Tax
 *      and accounting law is why the transaction record survives an erasure, and
 *      a deletion flow that reports unqualified success would be the kind of
 *      compliance claim this codebase does not make.
 */

/**
 * What each accepted document is for, and what makes it lawful.
 *
 * The account's processing rests on the contract (Art. 6(1)(b)) — courses cannot
 * be delivered to nobody — so the terms and privacy acceptance is *evidence of
 * disclosure*, not the permission to process. The age affirmation is recorded on
 * the compliance basis: GDPR Art. 8, COPPA and DPDP s.9 all require the operator
 * to know which side of the line a learner is on, and the record is how it knows.
 */
export const CONSENT_META: Record<ConsentDocument, { purpose: string; basis: LawfulBasis }> = {
  terms: {
    purpose:
      "Delivering the service under the published terms of service, and holding an account to them",
    basis: "contract",
  },
  privacy: {
    purpose:
      "Processing the personal data described in the privacy notice, to the extent needed to deliver the service",
    basis: "contract",
  },
  "age-affirmation": {
    purpose:
      "Establishing that the learner is old enough to hold an account, or holds a guardian's permission",
    basis: "legal-obligation",
  },
};

/**
 * The processors whose copy of a learner's record no request to *us* can reach,
 * and which therefore become open work on the deletion queue.
 *
 * This is honest about the shape of the integration: Clerk holds the identity
 * and Dodo holds the payment relationship, and neither is reachable by deleting
 * a row in this database. Queuing is what makes the gap visible — an uncompleted
 * row is the operator's open task, and the retention schedule's manual procedure
 * is this queue rather than a paragraph promising it was done.
 */
export const PROCESSOR_HANDOFFS = ["Clerk (identity)", "Dodo Payments (merchant of record)"] as const;

/**
 * What an erasure retains, and why. Kept as data so the response, the receipt
 * and the published retention schedule all print the same sentences.
 */
export const ERASURE_RETENTIONS: { category: string; reason: string; basis: LawfulBasis }[] = [
  {
    category: "Payment and subscription records (amounts, dates, plan, invoice references)",
    reason:
      "Accounting and tax law requires the transaction record to be kept for the statutory period. The record is severed from you — your email, name and the payment provider's customer id are removed — and what remains is the transaction.",
    basis: "legal-obligation",
  },
  {
    category: "The erasure receipt (dates, and counts of what was deleted)",
    reason:
      "Recording that an erasure was performed, and what it covered, is how the operator can answer a regulator or an auditor that it did what it said. It holds no profile, no content and no contact details, and it is deleted on its own schedule.",
    basis: "legal-obligation",
  },
  {
    category: "A security cut-off for the credentials this account held",
    reason:
      "An access token is verified by signature, so without a cut-off a token already in your hands would keep working until it expired. The cut-off holds a user id and a timestamp, no token, and it is dropped within twelve hours.",
    basis: "legal-obligation",
  },
  {
    category: "Backups taken before the deletion",
    reason:
      "A backup is a copy of the database as it was; the deletion cannot reach into a sealed archive. The copy goes when the backup it lives in ages out under the retention schedule, and it is not used for anything in the meantime.",
    basis: "legal-obligation",
  },
];

/**
 * Whether this deployment refuses a registration that carries no recorded
 * notice. On by default in production, off elsewhere.
 *
 * The same shape as the execution runner's production refusal: the wire contract
 * stays permissive so a development build and the existing end-to-end suite keep
 * working, and the *policy* refuses — in one place, with one message, and with
 * the switch named so the reason is legible in an incident. A parser that
 * required the fields would put the legal decision in the wrong layer and break a
 * second, unrelated contract on the way.
 */
export function consentRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.NEXORA_REQUIRE_CONSENT?.trim();
  if (explicit === "1" || explicit?.toLowerCase() === "true") return true;
  if (explicit === "0" || explicit?.toLowerCase() === "false") return false;
  return env.NODE_ENV === "production";
}

/** The subject reference that outlives the account: a pseudonym, not a name. */
export function subjectRef(userId: string): string {
  return sha256(userId);
}

export interface DeclarationInput {
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
  ageAffirmed?: boolean;
  documentVersions?: { terms: string; privacy: string };
}

/**
 * The account and its acceptance record are created by ONE statement.
 *
 * This is a data-modifying CTE rather than an explicit `BEGIN`/`COMMIT` pair, and
 * the reason is not stylistic. The obvious implementation — insert the user, then
 * insert the declarations, wrapped in a transaction — needs a connection held
 * across statements, which is a thing that can fail between them, and it makes the
 * guarantee "no account exists without its record" a property of code that has to
 * remember to roll back. A single statement makes it a property of the database:
 * either the row and its declarations exist, or neither does, and there is no
 * window and no cleanup path to get wrong.
 *
 * Everything a learner is asked to affirm is validated *before* this runs, so a
 * refusal costs no SQL at all and leaves nothing to undo.
 */
export function signupStatement(
  body: DeclarationInput,
  user: { id: string; email: string; name: string | null; passwordHash: string }
): { sql: string; params: unknown[] } {
  const baseParams = [user.id, user.email, user.name, user.passwordHash];
  if (!declarationRowsNeeded(body)) {
    return {
      sql: "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, created_at",
      params: baseParams,
    };
  }
  const versions = CURRENT_DOCUMENT_VERSIONS;
  const versionFor: Record<ConsentDocument, string> = {
    terms: versions.terms,
    privacy: versions.privacy,
    // The age affirmation is not itself a published document; it is dated with
    // the privacy notice's version because both are rewritten together, and a
    // separate version number nobody publishes would be a fact a reader could
    // not check.
    "age-affirmation": versions.privacy,
  };
  const documents: ConsentDocument[] = ["terms", "privacy", "age-affirmation"];
  return {
    sql:
      "WITH u AS (INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4) " +
      "RETURNING id, email, name, created_at), d AS (" +
      "INSERT INTO consents (user_id, document, version, purpose, basis) " +
      "SELECT u.id, t.document, t.version, t.purpose, t.basis FROM u, " +
      "unnest($5::text[], $6::text[], $7::text[], $8::text[]) AS t(document, version, purpose, basis)) " +
      "SELECT id, email, name, created_at FROM u",
    params: [
      ...baseParams,
      documents,
      documents.map((d) => versionFor[d]),
      documents.map((d) => CONSENT_META[d].purpose),
      documents.map((d) => CONSENT_META[d].basis),
    ],
  };
}

/** Whether the given registration carries the declarations this deployment needs. */
function declarationRowsNeeded(body: DeclarationInput): boolean {
  return body.acceptTerms === true && body.acceptPrivacy === true && body.ageAffirmed === true;
}

/**
 * Refuse a registration that does not carry the notice, where this deployment
 * requires it, before any SQL runs.
 *
 * The version check is the part worth reading twice. The client says which wording
 * it showed; this compares that against the version this deployment serves. A
 * mismatch is refused rather than recorded, because accepting a version nobody
 * was shown is the record that would be worthless in an audit — and a front door
 * running a stale page against a newer service (a half-finished deploy) is a real
 * way for that to happen. Reloading is the fix, and the message says so.
 */
export function assertDeclarationsAllowed(body: DeclarationInput): void {
  if (!consentRequired()) {
    // Development, or an older client. Nothing is invented: an account with no
    // declaration simply has no declaration row, and the export says so.
    return;
  }
  const missing = [
    body.acceptTerms !== true ? "acceptance of the terms" : null,
    body.acceptPrivacy !== true ? "acceptance of the privacy notice" : null,
    body.ageAffirmed !== true ? "age affirmation" : null,
  ].filter((v): v is string => v !== null);
  if (missing.length > 0) {
    throw new ApiError(
      400,
      "notice_required",
      `This deployment requires the following before it will create an account: ${missing.join(", ")}. Nothing has been created.`
    );
  }
  if (
    body.documentVersions &&
    (body.documentVersions.terms !== CURRENT_DOCUMENT_VERSIONS.terms ||
      body.documentVersions.privacy !== CURRENT_DOCUMENT_VERSIONS.privacy)
  ) {
    throw new ApiError(
      409,
      "document_version_mismatch",
      "The documents you were shown are not the current ones. Reload the page and read them again — nothing has been created."
    );
  }
}

function toConsentView(row: {
  document: string;
  version: string;
  purpose: string;
  basis: string;
  accepted_at: Date;
  withdrawn_at: Date | null;
}): ConsentRecordView {
  return {
    document: row.document as ConsentDocument,
    version: row.version,
    purpose: row.purpose,
    basis: row.basis as LawfulBasis,
    acceptedAt: new Date(row.accepted_at).toISOString(),
    withdrawnAt: row.withdrawn_at ? new Date(row.withdrawn_at).toISOString() : null,
  };
}

function toRightsView(row: {
  id: string;
  kind: string;
  status: string;
  detail: string;
  created_at: Date;
  due_at: Date;
  resolved_at: Date | null;
  resolution: string | null;
}): RightsRequestRecord {
  return {
    id: row.id,
    kind: row.kind as RightsRequestRecord["kind"],
    status: row.status as RightsRequestRecord["status"],
    detail: row.detail,
    createdAt: new Date(row.created_at).toISOString(),
    dueAt: new Date(row.due_at).toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    resolution: row.resolution,
  };
}

/* What every export must say about itself: which service produced it, who is
   responsible, and — the clause that matters — what this half does NOT hold.
   An export that quietly omits the payment records is not the export the law
   describes, so the omission is printed rather than left for the reader to
   discover. */
const AUTH_EXPORT_NOT_INCLUDED = [
  {
    category: "Payment and subscription records",
    where: "Held by the billing service, in its own database; exported by its own endpoint and included in the download.",
  },
  {
    category: "Contents of the code you ran and its output",
    where: "Held by the execution service for the length of the run and not persisted; the signed run receipts are in this export as `proofs`.",
  },
  {
    category: "Your local IDE workspace (files, drafts, local practice records)",
    where: "Held only on your own machine and never sent to the platform; copy it from the IDE itself.",
  },
];

/**
 * The export's top-level keys, in the order the file carries them.
 *
 * The export is an artefact a person is entitled to keep, and the IDE will
 * read it one day, so its shape is a contract and not an accident. The keys
 * are listed here, in order, and the file is built in that order: a reader
 * that has to guess which key moved is a reader that breaks on a change that
 * was not a change of meaning.
 *
 * Adding a key is a version bump. Removing or renaming one is a new version
 * of the format, and the old files stay readable.
 */
export const ACCOUNT_EXPORT_KEYS = [
  "format",
  "version",
  "generatedAt",
  "controller",
  "service",
  "subject",
  "consents",
  "rightsRequests",
  "proofs",
  "sessions",
  "notIncluded",
] as const;

export function registerRightsRoutes(app: FastifyInstance, pool: Pool): void {
  /* The consents this account is currently bound to, oldest first. Read by the
     account page so a learner can see what they agreed to rather than being told
     that a record exists somewhere. */
  app.get("/consents", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query(
      "SELECT document, version, purpose, basis, accepted_at, withdrawn_at FROM consents WHERE user_id = $1 ORDER BY accepted_at",
      [userId]
    );
    return { consents: rows.map(toConsentView), currentVersions: CURRENT_DOCUMENT_VERSIONS };
  });

  /* Withdrawal, which GDPR Art. 7(3) requires to be as easy as giving consent
     was. This is why it is a route and not a support request.
     
     What it does NOT do is delete the account: withdrawing consent to a document
     is not the same act as erasing the account, and the two are separate buttons
     on the account page precisely so neither can be reached by accident. What
     withdrawing actually changes is that the processing resting on consent stops;
     where the basis is the contract (the terms, the privacy notice), the honest
     answer is that the account cannot continue on that basis, and the response
     says so and points at erasure. */
  app.post("/consents/withdraw", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(consentWithdrawSchema, req.body);

    const meta = CONSENT_META[body.document];
    const updated = await pool.query(
      "UPDATE consents SET withdrawn_at = now() WHERE user_id = $1 AND document = $2 AND withdrawn_at IS NULL RETURNING document",
      [userId, body.document]
    );
    if ((updated.rowCount ?? 0) === 0) {
      // Idempotent, and never an oracle on whether a row existed: withdrawing
      // something already withdrawn is not an error worth a message.
      return { withdrawn: true, document: body.document, effect: null };
    }
    req.log.info({ userId, document: body.document, basis: meta.basis }, "consent withdrawn");
    return {
      withdrawn: true,
      document: body.document,
      effect:
        meta.basis === "consent"
          ? "Processing that rested on this consent has stopped."
          : "This document records processing the service cannot be delivered without, so your account cannot continue on this basis. Deleting the account is the other control on this page.",
    };
  });

  /* The access and portability export for everything this service holds
     (GDPR Arts. 15 and 20, CCPA §1798.110/§1798.115, DPDP access).

     Machine-readable by construction — the artifact a person is entitled to, not
     a rendering of one — and complete for this half of the record. Sessions are
     reported as counts rather than contents: a refresh-token hash is a
     credential, and an export is a file people email to themselves.

     THE SHAPE, and it is a contract rather than an accident.

     The IDE reads this file one day. The reader it uses is
     `extensions/nexora/src/sync.ts` in the IDE, and it checks every proof row
     for four fields: competencyId, level, kind and issuedAt, with kind being
     one of run, design or incident. So the proof rows here carry exactly
     those four names, and the kind is derived the way the ledger route
     derives it, so a receipt of one kind is never reported as another. A
     debugging receipt used to be exported as a run, which is a false
     statement about somebody's work.

     The top-level keys are in the order ACCOUNT_EXPORT_KEYS names, because a
     file people keep has to be byte-stable across a change that did not
     change its meaning. */
  app.get("/account/export", async (req) => {
    const userId = requireUserId(req);
    const who = await pool.query(
      "SELECT id, email, name, created_at, provider FROM users WHERE id = $1",
      [userId]
    );
    const user = who.rows[0];
    if (!user) throw new ApiError(404, "not_found", "Account not found.");

    const [consents, rights, proofs, sessions] = await Promise.all([
      pool.query(
        "SELECT document, version, purpose, basis, accepted_at, withdrawn_at FROM consents WHERE user_id = $1 ORDER BY accepted_at",
        [userId]
      ),
      pool.query(
        "SELECT id, kind, status, detail, created_at, due_at, resolved_at, resolution FROM rights_requests WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      ),
      pool.query(
        "SELECT competency_id, level, CASE WHEN receipt->'facts'->>'kind' = 'design' THEN 'design' WHEN receipt->'facts'->>'kind' = 'incident' THEN 'incident' ELSE 'run' END AS kind, issued_at FROM proofs WHERE user_id = $1 ORDER BY issued_at DESC",
        [userId]
      ),
      pool.query(
        "SELECT " +
          "(SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()) AS active, " +
          "(SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NOT NULL) AS revoked, " +
          "(SELECT count(*) FROM device_codes WHERE approved_user_id = $1) AS device_codes",
        [userId]
      ),
    ]);

    /* A learner with nothing still gets a file.
     *
     * The empty case is not an error and not a missing key: the arrays are
     * there, empty, and the counts are zero. A learner who has signed up and
     * done nothing yet is entitled to their own record, and an export that
     * failed for them would be a rights surface that only works once you have
     * used the product. */
    return {
      format: "nexora-account-export" as const,
      version: 1 as const,
      generatedAt: new Date().toISOString(),
      controller: process.env.OPERATOR_LEGAL_NAME ?? "[[ operator legal name — set before publishing ]]",
      service: "auth" as const,
      subject: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        createdAt: new Date(user.created_at).toISOString(),
        provider: user.provider,
      },
      consents: consents.rows.map(toConsentView),
      rightsRequests: rights.rows.map(toRightsView),
      proofs: proofs.rows.map(
        (r: { competency_id: string; level: string; kind: string; issued_at: Date }) => ({
          competencyId: r.competency_id,
          level: r.level,
          kind: r.kind,
          issuedAt: new Date(r.issued_at).toISOString(),
        })
      ),
      sessions: {
        active: Number(sessions.rows[0]?.active ?? 0),
        revoked: Number(sessions.rows[0]?.revoked ?? 0),
        deviceCodes: Number(sessions.rows[0]?.device_codes ?? 0),
      },
      notIncluded: AUTH_EXPORT_NOT_INCLUDED,
    };
  });

  /* Erasure (GDPR Art. 17, CCPA §1798.105, DPDP erasure).
     *
     * Order matters here and is the whole design. Inside one transaction: take
     * the credential cut-off first, count what is about to go, write the receipt
     * and the processor handoffs, then delete the account row and let the
     * cascades do the rest. A cut-off written after the delete could not be
     * written at all (its table is keyed by a user that would no longer exist),
     * and a receipt written after it would not survive a crash in between.
     *
     * Anything that cannot be reached from here — the payment records in billing,
     * Clerk's copy of the identity — is recorded as open work rather than
     * described as done. Called after the commit, the billing handoff can fail
     * without taking the account deletion with it, which is the correct direction:
     * an account that is gone with a follow-up owed is a compliance task, and an
     * account that still exists with severed billing is a broken product. */
  app.post("/account/delete", async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(deleteAccountSchema, req.body);
    const ref = subjectRef(userId);
    const at = new Date();
    const receiptId = newId();
    const handoffs = [...PROCESSOR_HANDOFFS, "NEXORA billing service (payment records to be severed)"];

    /* ONE statement, for the same reason signup is one statement: "the account
     * and its erasure evidence are all-or-nothing" should be the database's
     * guarantee rather than something the code has to remember to undo. The
     * data-modifying CTEs run in this order of intent even though they share a
     * snapshot:
     *
     *   counts  what is about to be deleted, counted before the delete — and the
     *           gate for everything else: `WHERE counts.account = 1` means an
     *           erasure for an account that does not exist writes nothing at all,
     *           so a client cannot manufacture a receipt.
     *   cut     the credential cut-off that must outlive the account (see
     *           deleted_subject_revocations). Without it, the token in the
     *           learner's hands keeps opening a door whose account is gone.
     *   rec     the erasure receipt.
     *   hand    the processors that hold their own copy, queued as open work.
     *   del     the account row itself, whose cascades take the sessions, proofs
     *           and consents with it.
     *
     * The rights ledger is not updated here: `rights_requests.user_id` is
     * ON DELETE SET NULL and its `subject_ref` was written at intake, so the
     * cascade leaves exactly the pseudonymous record CCPA's 24-month
     * record-keeping duty (and GDPR accountability) needs.
     */
    const { rows } = await pool.query(
      "WITH counts AS (" +
        "SELECT" +
        " (SELECT count(*) FROM users WHERE id = $1)::int AS account," +
        " (SELECT email FROM users WHERE id = $1) AS email," +
        " (SELECT count(*) FROM refresh_tokens WHERE user_id = $1)::int AS sessions," +
        " (SELECT count(*) FROM revoked_tokens WHERE user_id = $1)::int AS \"revokedCredentials\"," +
        " (SELECT count(*) FROM user_revocations WHERE user_id = $1)::int AS \"sessionCutoffs\"," +
        " (SELECT count(*) FROM device_codes WHERE approved_user_id = $1)::int AS \"deviceCodes\"," +
        " (SELECT count(*) FROM proofs WHERE user_id = $1)::int AS \"verifiedProofs\"," +
        " (SELECT count(*) FROM consents WHERE user_id = $1)::int AS \"consentRecords\"" +
        "), cut AS (" +
        "INSERT INTO deleted_subject_revocations (user_id, revoked_before) " +
        "SELECT $1, $2 WHERE (SELECT account FROM counts) = 1 " +
        "ON CONFLICT (user_id) DO UPDATE SET revoked_before = GREATEST(deleted_subject_revocations.revoked_before, EXCLUDED.revoked_before)" +
        "), rec AS (" +
        "INSERT INTO erasures (id, subject_ref, requested_at, completed_at, deleted, retained, reason) " +
        "SELECT $3, $4, $2::timestamptz, $2::timestamptz, to_jsonb(counts), $5::jsonb, $6 " +
        "FROM counts WHERE counts.account = 1 RETURNING id" +
        "), hand AS (" +
        "INSERT INTO processor_deletions (id, provider, subject_ref, user_email, note) " +
        "SELECT t.id, t.provider, $4, (SELECT email FROM counts), t.note " +
        "FROM unnest($7::text[], $8::text[], $9::text[]) AS t(id, provider, note), counts " +
        "WHERE counts.account = 1" +
        "), del AS (" +
        "DELETE FROM users WHERE id = $1 RETURNING id" +
        ") SELECT (SELECT to_jsonb(counts) FROM counts) AS counts, (SELECT count(*) FROM del)::int AS deleted",
      [
        userId,
        at,
        receiptId,
        ref,
        JSON.stringify(ERASURE_RETENTIONS),
        body.reason ?? null,
        handoffs.map(() => newId()),
        handoffs,
        handoffs.map((p) =>
          p.startsWith("NEXORA")
            ? "Attempted automatically after the account row was deleted; completed_at is set when it succeeds."
            : "Manual: the processor's own dashboard, per company/legal/RETENTION-DELETION.md."
        ),
      ]
    );
    const counts = (rows[0]?.counts ?? {}) as Record<string, unknown>;
    const tally: Record<string, number> = {
      account: Number(counts.account ?? 0),
      sessions: Number(counts.sessions ?? 0),
      revokedCredentials: Number(counts.revokedCredentials ?? 0),
      sessionCutoffs: Number(counts.sessionCutoffs ?? 0),
      deviceCodes: Number(counts.deviceCodes ?? 0),
      verifiedProofs: Number(counts.verifiedProofs ?? 0),
      consentRecords: Number(counts.consentRecords ?? 0),
    };
    if (tally.account === 0) {
      // Nothing to erase. If a receipt already exists, this is a retry of a
      // completed erasure, and the first receipt is still the record — writing a
      // second one would make the ledger ambiguous about how many deletions
      // happened. Otherwise there was never an account.
      const prior = await pool.query("SELECT id FROM erasures WHERE subject_ref = $1", [ref]);
      if (prior.rows[0]) {
        return reply.code(200).send({
          deleted: {},
          retained: ERASURE_RETENTIONS,
          processorsQueued: [],
          receiptId: prior.rows[0].id,
        });
      }
      throw new ApiError(404, "not_found", "Account not found.");
    }

    const billingErased = await eraseBillingRecord(app, userId);
    if (billingErased) {
      await pool
        .query(
          "UPDATE processor_deletions SET completed_at = now() WHERE subject_ref = $1 AND provider LIKE 'NEXORA billing%' AND completed_at IS NULL",
          [ref]
        )
        .catch(() => undefined);
    }

    req.log.info(
      // No email in the log line, deliberately: application logs are retained on
      // their own schedule, and an erasure that copies a contact detail into one
      // would defeat the request it is recording.
      { userId, receiptId, deleted: tally, billingErased },
      "account erased: sessions cut off, records deleted, processor handoffs queued"
    );
    return reply.code(200).send({
      deleted: tally,
      retained: ERASURE_RETENTIONS,
      processorsQueued: billingErased
        ? [...PROCESSOR_HANDOFFS]
        : [...PROCESSOR_HANDOFFS, "NEXORA billing service (retrying; your account is already gone)"],
      receiptId,
    });
  });

  /* File a rights request (GDPR Arts. 15–21, CCPA §1798.130, DPDP Rule 14).
   *
   * The deadline is computed here, at intake, against the strictest of the three
   * clocks the product is held to (30 days, GDPR Art. 12(3)) and stored on the
   * row — so the date the learner was given on the day they asked is the date
   * they can hold the operator to, whatever happens to a constant later.
   *
   * This route is not the only way in, and must not be: CCPA requires that a
   * request not be answerable only from inside an account, and a person who
   * cannot sign in cannot reach this. The account page says so, and the privacy
   * notice publishes the contact address for exactly that case. A self-service
   * route that was the *only* route would be the failure mode the CNIL fined an
   * employer 300 000 EUR over in 2026.
   */
  app.post("/rights", async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(rightsRequestSchema, req.body);
    const id = newId();
    const dueAt = new Date(Date.now() + RIGHTS_RESPONSE_DAYS * 24 * 3600_000);
    const { rows } = await pool.query(
      "INSERT INTO rights_requests (id, user_id, subject_ref, kind, detail, nominee, due_at) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, kind, status, detail, created_at, due_at, resolved_at, resolution",
      [id, userId, subjectRef(userId), body.kind, body.detail, body.nominee ?? null, dueAt]
    );
    req.log.info({ userId, kind: body.kind, dueAt }, "rights request received");
    /* Two of the kinds are answerable immediately, by the learner, and the
       response says which control does it rather than leaving them to wait a
       month for something the product can already do. */
    const selfServe: Record<string, string> = {
      access: "Download it now from “Your data” on this page — the file is generated on request and covers everything the platform holds.",
      portability: "Download it now from “Your data” on this page. The file is JSON, and it is the same artifact an access request returns.",
      erasure: "You can do this yourself, immediately, with “Delete your account” on this page. This request is recorded as well, so the operator answers it either way.",
    };
    return reply.code(201).send({
      request: toRightsView(rows[0]),
      responseDays: RIGHTS_RESPONSE_DAYS,
      immediate: selfServe[body.kind] ?? null,
    });
  });

  /** The learner's own request history, with the clock on each one. */
  app.get("/rights", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query(
      "SELECT id, kind, status, detail, created_at, due_at, resolved_at, resolution FROM rights_requests WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return { requests: rows.map(toRightsView), responseDays: RIGHTS_RESPONSE_DAYS };
  });
}

/**
 * Ask the billing service to sever the learner from its transaction records.
 *
 * Over the mesh, with the mesh key: this is the same authenticated channel the
 * gateway uses, and the billing route is not under `/api`, so it is not reachable
 * from the public edge at all. A failure is logged and returned as false — the
 * caller has already queued the handoff, so an unreachable billing service
 * becomes visible open work instead of a silently skipped step. 404 counts as
 * success: it means billing holds nothing for this subject, which is the outcome
 * being asked for.
 */
/**
 * Enforce the retention schedule on a timer (GDPR Art. 5(1)(e), DPDP retention).
 *
 * The published schedule is only a control if something runs it, and before this
 * module existed the platform's honest position was that nothing was ever
 * deleted: rows were written and kept, whatever a document said. Every period
 * below is the number published in `company/legal/RETENTION-DELETION.md`, so the
 * code and the promise are one artefact rather than two that could disagree.
 *
 * Two of the deletions are deliberately constrained. An unresolved rights request
 * and an unactioned processor handoff are never pruned, because deleting the
 * evidence that work is outstanding is how an obligation quietly disappears
 * instead of being met. And the twenty-four-month figure on the request and
 * erasure ledgers is the CCPA's own record-keeping period (§1798.130) — longer
 * than the GDPR asks for, so it is the one that governs.
 */
export async function pruneRetention(pool: Pool): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const run = async (name: string, sql: string): Promise<void> => {
    const { rowCount } = await pool.query(sql);
    out[name] = rowCount ?? 0;
  };
  // A refresh token past its own expiry is dead: nothing can renew with it, and
  // the reuse-detection window it took part in closed with it.
  await run("refreshTokens", "DELETE FROM refresh_tokens WHERE expires_at < now()");
  // A spent or expired identity token is dead in the same way: it can never be
  // spent again, and a token that is gone is refused exactly as a token that
  // was never issued. The day of grace is for an odd host's clock, not for a
  // live token.
  await run("authTokens", "DELETE FROM auth_tokens WHERE expires_at < now() - interval '1 day'");
  // A device code is fifteen minutes of work; the day of grace is for an odd
  // host's clock, not for a live code.
  await run("deviceCodes", "DELETE FROM device_codes WHERE expires_at < now() - interval '1 day'");
  await run(
    "rightsRequests",
    "DELETE FROM rights_requests WHERE resolved_at IS NOT NULL AND resolved_at < now() - interval '24 months'"
  );
  await run("erasures", "DELETE FROM erasures WHERE completed_at < now() - interval '24 months'");
  await run(
    "processorDeletions",
    "DELETE FROM processor_deletions WHERE completed_at IS NOT NULL AND completed_at < now() - interval '24 months'"
  );
  return out;
}

/**
 * Ask the billing service to sever the learner from its transaction records.
 *
 * Over the mesh, with the mesh key: this is the same authenticated channel the
 * gateway uses, and the route is not under `/api`, so the public edge cannot
 * route to it at all. A failure is logged and reported as false rather than
 * swallowed — the caller has already queued the handoff, so an unreachable
 * billing service becomes visible open work instead of a step that silently did
 * not happen. A 404 counts as success: it means billing holds nothing for this
 * subject, which is the outcome being asked for.
 */
async function eraseBillingRecord(app: FastifyInstance, userId: string): Promise<boolean> {
  const base = (process.env.BILLING_URL ?? "http://localhost:8106").replace(/\/$/, "");
  const key = process.env.INTERNAL_API_KEY;
  try {
    const res = await fetch(`${base}/internal/erase`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "x-internal-key": key } : {}),
      },
      // The raw user id, not the pseudonym: billing keys its rows on it, and a
      // hash would arrive as a subject it has never heard of. It never leaves the
      // mesh — this route is not under /api and the public edge cannot route to
      // it — so the identifier moves between two services of one controller, and
      // the only copy that survives is the transaction key the tax record needs.
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok || res.status === 404) return true;
    app.log.warn({ status: res.status }, "billing erase was refused; the handoff stays open");
    return false;
  } catch (err) {
    app.log.warn({ err }, "billing service unreachable for erasure; the handoff stays open");
    return false;
  }
}
