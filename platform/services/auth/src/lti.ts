import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { ApiError, newId, receiptEdPublicKey, sha256, signReceipt, signReceiptEd } from "@nexora/service-kit";
import { randomBytes } from "node:crypto";
import { newRefreshToken, signAccessToken } from "./crypto.js";
import { toPublic } from "./public-user.js";
import { fetchJwks, LtiRefusal, clientAssertion, openSecret, sealSecret, toolJwks, toolKey, verifyLaunchToken } from "./lti-keys.js";

/* LTI 1.3: a course launched from an LMS (LTI.md).
 *
 * The shape of the thing, and the reason it lives in this service: a launch
 * has to answer three questions, and all three are answered by data this
 * service already owns.
 *
 *   Who is this?     The LMS's user is bound to a platform account. The
 *                     account is created on the first launch and found again
 *                     on every later one, so an LMS user is one platform
 *                     account and not one per course.
 *   May they launch? A deployment is registered by the operator, and it names
 *                     the cohort whose seats the launch draws on. A launch from
 *                     an unregistered deployment is refused, and a launch with
 *                     no seat left is refused in plain words.
 *   What did they do? The ledger of verified work is here, so the grade the
 *                     LMS is told about is a receipt the platform signed and
 *                     not a number anybody made up.
 *
 * So the tables are here, the identity is here, the cohort is here and the
 * proofs are here, and a launch is one request that touches all four.
 *
 * Two rules the whole surface rests on:
 *
 *   - Every untrusted value is checked against something the platform holds:
 *     the issuer is the registered issuer exactly, the audience is the
 *     registered client id, the nonce is the one this login issued, the
 *     deployment id is the one this login was started for, and the signature
 *     verifies against a key the LMS published. There is no mode in which
 *     these checks are skipped: a deployment cannot be registered without the
 *     URI the keys are published at, so there is no "local" deployment to run
 *     without verification.
 *   - A launch that cannot be verified creates nothing: no account, no seat,
 *     no session, no row. It is a refusal, and the refusal says which one.
 */

/** The LTI claim namespace. */
const LTI = "https://purl.imsglobal.org/spec/lti/claim";
/** The Assignment and Grade Services claim namespace. */
const AGS = "https://purl.imsglobal.org/spec/lti-ags/claim";

/** How long a login initiation stays usable. */
const LOGIN_STATE_TTL_MS = 10 * 60_000;
/** How long a launch grant stays usable. */
const LAUNCH_GRANT_TTL_MS = 5 * 60_000;
/** How long a refresh token minted by a launch stays usable. */
const REFRESH_DAYS = 30;

/** The base URL the LMS is told about. */
function baseUrl(): string {
  return (process.env.LTI_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

/** The URL the LMS posts the launch to. */
export function launchUrl(): string {
  return `${baseUrl()}/lti/launch`;
}

/** Where the browser goes once the launch is verified. */
function completeUrl(): string {
  return process.env.LTI_COMPLETE_URL ?? `${baseUrl()}/lti/complete`;
}

/** The key the statements are signed with, or null when this deployment has none. */
function statementKey(): string | null {
  const pem = process.env.LTI_STATEMENT_ED25519_KEY?.replace(/\\n/g, "\n");
  return pem || null;
}

/** The published name of the statement key. */
function statementKeyId(): string {
  return process.env.LTI_STATEMENT_KEY_ID ?? "statement-ed1";
}

interface DeploymentRow {
  id: string;
  issuer: string;
  client_id: string;
  deployment_id: string;
  institution: string;
  cohort_id: string;
  authorization_url: string;
  token_url: string;
  jwks_url: string;
  client_secret_enc: string | null;
  created_at: Date | string;
}

/** The signed-in learner, when the browser presented a session the edge verified. */
function signedInUserId(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const v = req.headers["x-user-id"];
  const id = Array.isArray(v) ? v[0] : v;
  return id && id.length > 0 ? id : null;
}

/** A form body as a plain object. */
function formToObject(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) out[key] = value;
  return out;
}

/**
 * The roles that may launch.
 *
 * The LTI roles claim carries full URNs ("http://purl.imsglobal.org/vocab/lis/
 * v2/membership#Learner"), and some systems send the short name. Both are read
 * here, and only the roles that mean "a person in this class" are accepted:
 * a learner, an instructor, or an administrator of the system or the
 * institution. A role claim that names nobody in particular is a refusal,
 * because a launch with no role is a launch we cannot place.
 */
function hasLaunchRole(roles: unknown): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  const accepted = new Set(["learner", "instructor", "administrator", "mentor"]);
  return roles.some((role) => {
    if (typeof role !== "string") return false;
    const tail = role.split("#").pop() ?? role;
    return accepted.has(tail.trim().toLowerCase());
  });
}

/** The email the LMS claims, and whether it says the address is verified. */
function emailClaims(claims: Record<string, unknown>): { email: string | null; verified: boolean } {
  const direct = claims.email;
  const namespaced = claims[`${LTI}/email`];
  const raw = typeof direct === "string" && direct ? direct : typeof namespaced === "string" ? namespaced : null;
  const verifiedClaim = claims[`${LTI}/email_verified`] ?? claims.email_verified;
  return { email: raw ? raw.trim().toLowerCase() : null, verified: verifiedClaim === true };
}

/* ---------- the identity binding ---------- */

/**
 * Bind the LMS's user to a platform account.
 *
 * The rule, stated once because it is the part of LTI that can take somebody
 * else's account if it is written carelessly:
 *
 *   The LMS owns the identity. The first launch from a given (issuer, subject)
 *   creates the account from the LMS's own claims and records the binding, so
 *   a later launch finds the same account. A launch never overwrites an
 *   account the learner made themselves: if the email the LMS claims is
 *   already taken by an account that is not this learner's binding, the
 *   launch is refused rather than merged, because the alternative is one
 *   learner taking another's account. The one exception is a browser that is
 *   already signed in: then the session is the proof of who the learner is,
 *   and the binding is attached to that account.
 *
 * So: the binding wins over everything, an established session wins over a
 * new account, and an email collision is a refusal and never a merge.
 */
async function bindIdentity(
  pool: Pool,
  deployment: DeploymentRow,
  claims: Record<string, unknown>,
  sessionUserId: string | null
): Promise<{ userId: string; created: boolean }> {
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!subject) {
    throw new ApiError(400, "bad_request", "The launch carried no user identity.");
  }
  const { email, verified } = emailClaims(claims);

  const bound = await pool.query(
    "SELECT id, user_id FROM lti_identities WHERE issuer = $1 AND subject = $2",
    [deployment.issuer, subject]
  );
  const binding = bound.rows[0] as { id: string; user_id: string } | undefined;
  if (binding) {
    if (sessionUserId && sessionUserId !== binding.user_id) {
      // The LMS says this is one learner; the browser says it is another.
      // Neither is overwritten: the launch is refused.
      throw new ApiError(
        409,
        "identity_bound_elsewhere",
        "This course account is already linked to another platform account. Sign in as that account and try again."
      );
    }
    await pool.query("UPDATE lti_identities SET last_launch_at = now() WHERE id = $1", [binding.id]);
    return { userId: binding.user_id, created: false };
  }

  if (sessionUserId) {
    const other = await pool.query("SELECT id FROM lti_identities WHERE user_id = $1 AND issuer = $2", [
      sessionUserId,
      deployment.issuer,
    ]);
    if (other.rows[0]) {
      throw new ApiError(
        409,
        "identity_already_bound",
        "This platform account is already linked to a different course account. Sign in as that account and try again."
      );
    }
    if (email) {
      const taken = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
      if (taken.rows[0] && taken.rows[0].id !== sessionUserId) {
        throw new ApiError(
          409,
          "email_taken",
          "This course account uses an email address that belongs to another platform account, so it cannot be linked."
        );
      }
    }
    await pool.query(
      "INSERT INTO lti_identities (id, issuer, subject, user_id, deployment_id, last_launch_at) VALUES ($1, $2, $3, $4, $5, now())",
      [newId(), deployment.issuer, subject, sessionUserId, deployment.id]
    );
    return { userId: sessionUserId, created: false };
  }

  if (!email) {
    throw new ApiError(
      400,
      "no_email_claim",
      "This course did not send an email address, so there is no account to create. Sign in on the platform first and launch again."
    );
  }
  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (existing.rows[0]) {
    // A collision is a refusal, and it is a real one: the platform cannot
    // tell whether the course's learner is the person who owns that address.
    throw new ApiError(
      409,
      "email_taken",
      "An account with this email already exists, so this course account cannot be linked to it. Sign in on the platform and launch again."
    );
  }
  const userId = newId();
  await pool.query(
    "INSERT INTO users (id, email, name, password_hash, provider, email_verified_at) VALUES ($1, $2, $3, NULL, 'lti', $4)",
    [userId, email, typeof claims.name === "string" ? claims.name.slice(0, 200) : null, verified ? new Date() : null]
  );
  await pool.query(
    "INSERT INTO lti_identities (id, issuer, subject, user_id, deployment_id, last_launch_at) VALUES ($1, $2, $3, $4, $5, now())",
    [newId(), deployment.issuer, subject, userId, deployment.id]
  );
  return { userId, created: true };
}

/* ---------- the seat ---------- */

/**
 * Whether there is a seat to take, before anything is created.
 *
 * The check runs before the account is created, so a learner who cannot have
 * a seat does not get an account as a side effect of being refused. The
 * insert below is still the thing that decides, because a seat can be taken
 * between this check and the write.
 */
async function checkSeat(pool: Pool, cohortId: string, userId: string | null): Promise<void> {
  const { rows } = await pool.query("SELECT * FROM cohorts WHERE id = $1", [cohortId]);
  const cohort = rows[0] as { id: string; status: string; seats: number } | undefined;
  if (!cohort) {
    throw new ApiError(409, "no_cohort", "The class this course is registered against no longer exists.");
  }
  if (cohort.status === "ended") {
    throw new ApiError(410, "licence_ended", "This class's licence has ended, so the course cannot be launched.");
  }
  if (cohort.status !== "active") {
    throw new ApiError(
      409,
      "licence_not_confirmed",
      "This class's licence has not been confirmed yet, so it cannot be launched. Ask the studio to confirm it."
    );
  }
  const members = await pool.query("SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1", [cohortId]);
  if (Number(members.rows[0].n) >= cohort.seats && userId) {
    const already = await pool.query("SELECT 1 FROM cohort_members WHERE cohort_id = $1 AND user_id = $2", [
      cohortId,
      userId,
    ]);
    if (!already.rows[0]) {
      throw new ApiError(409, "no_seat", "This class has no seats left. Ask the instructor for another code.");
    }
  } else if (Number(members.rows[0].n) >= cohort.seats) {
    throw new ApiError(409, "no_seat", "This class has no seats left. Ask the instructor for another code.");
  }
}

/**
 * Take a seat in the cohort the deployment is registered against.
 *
 * The bound is the same one the join code enforces: the members are counted
 * inside the insert, so two learners arriving at the same instant cannot both
 * take the last seat. A cohort whose licence the operator has not confirmed
 * carries no seat, and a licence that has ended carries none either, so both
 * are refusals with their own words.
 */
async function reserveSeat(pool: Pool, cohortId: string, userId: string): Promise<void> {
  await checkSeat(pool, cohortId, userId);
  const already = await pool.query("SELECT 1 FROM cohort_members WHERE cohort_id = $1 AND user_id = $2", [
    cohortId,
    userId,
  ]);
  if (already.rows[0]) return;
  await pool.query("SELECT id FROM cohorts WHERE id = $1 FOR UPDATE", [cohortId]);
  const inserted = await pool.query(
    "INSERT INTO cohort_members (cohort_id, user_id) " +
      "SELECT $1, $2 WHERE (SELECT count(*) FROM cohort_members WHERE cohort_id = $1) " +
      "< (SELECT seats FROM cohorts WHERE id = $1) ON CONFLICT DO NOTHING RETURNING user_id",
    [cohortId, userId]
  );
  if (inserted.rows.length === 0) {
    throw new ApiError(409, "no_seat", "This class has no seats left. Ask the instructor for another code.");
  }
}

/* ---------- the session ---------- */

/** Mint a session for a verified launch and hand the browser a one-time code. */
async function issueLaunchGrant(pool: Pool, userId: string, deploymentId: string): Promise<string> {
  const code = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO lti_launch_grants (code_hash, user_id, deployment_id, expires_at) VALUES ($1, $2, $3, now() + $4::interval)",
    [sha256(code), userId, deploymentId, `${Math.floor(LAUNCH_GRANT_TTL_MS / 1000)} seconds`]
  );
  return code;
}

/* ---------- the statement ---------- */

/**
 * The signed statement of verified work.
 *
 * The bytes are canonical: the same object, the same order, every time, so
 * that a holder of the statement and the published key can re-derive the
 * verdict without asking the platform anything. The signature is the
 * platform's, over exactly those bytes.
 */
export function statementPayload(statement: Record<string, unknown>): string {
  return JSON.stringify(statement);
}

/** Build and sign the statement for one learner. */
async function buildStatement(
  pool: Pool,
  userId: string
): Promise<{ statement: Record<string, unknown>; signature: { sig: string; sigEd?: string; keyId?: string } }> {
  const { rows: userRows } = await pool.query("SELECT id, email, name, created_at FROM users WHERE id = $1", [userId]);
  const user = userRows[0] as { id: string; email: string; name: string | null; created_at: Date | string } | undefined;
  if (!user) throw new ApiError(404, "not_found", "No such account.");

  const { rows: cohortRows } = await pool.query(
    "SELECT c.id, c.name, c.institution, c.term, c.course_id FROM cohorts c " +
      "JOIN cohort_members m ON m.cohort_id = c.id WHERE m.user_id = $1 ORDER BY c.created_at",
    [userId]
  );
  const { rows: proofRows } = await pool.query(
    "SELECT competency_id, level, receipt, payload_sha256, issued_at FROM proofs WHERE user_id = $1 ORDER BY issued_at, competency_id",
    [userId]
  );

  const statement: Record<string, unknown> = {
    v: 1,
    kind: "nexora-statement",
    issuedAt: new Date().toISOString(),
    learner: { id: user.id, email: user.email, name: user.name ?? "" },
    classes: (cohortRows as { id: string; name: string; institution: string; term: string; course_id: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
      institution: c.institution,
      term: c.term,
      courseId: c.course_id,
    })),
    entries: (proofRows as { competency_id: string; level: string; receipt: unknown; payload_sha256: string; issued_at: Date | string }[]).map(
      (p) => {
        const facts = (p.receipt as { facts?: { kind?: unknown } } | null)?.facts;
        return {
          competencyId: p.competency_id,
          level: p.level,
          kind: facts?.kind === "design" ? "design" : facts?.kind === "incident" ? "incident" : "run",
          issuedAt: new Date(p.issued_at).toISOString(),
          receiptSha256: p.payload_sha256,
          receipt: p.receipt,
        };
      }
    ),
  };

  const payload = statementPayload(statement);
  const signature: { sig: string; sigEd?: string; keyId?: string } = {
    // The mesh half: only this platform can recompute it.
    sig: signReceipt(payload, process.env.INTERNAL_API_KEY ?? ""),
  };
  const key = statementKey();
  if (key) {
    // The half a stranger can check, against the published key.
    signature.sigEd = signReceiptEd(payload, key);
    signature.keyId = statementKeyId();
  }
  return { statement, signature };
}

/* ---------- the grade passback ---------- */

/** Ask the LMS's token endpoint for an access token, with the client's own credentials. */
async function lmsAccessToken(deployment: DeploymentRow, scope?: string | null): Promise<string> {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", deployment.client_id);
  const tool = toolKey();
  if (deployment.client_secret_enc) {
    body.set("client_secret", openSecret(deployment.client_secret_enc));
  } else if (tool) {
    /* No shared secret: the platform proves itself with a signed assertion
       instead, and the course checks it against the public half this
       platform publishes at its JWKS. */
    body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    body.set("client_assertion", clientAssertion(deployment.client_id, deployment.token_url, tool));
  } else {
    throw new ApiError(
      502,
      "no_client_credentials",
      "This course has no client secret registered and this platform has no key to sign an assertion with."
    );
  }
  /* The scope the launch asked for. The course said what the platform may do
     with the grade (a score, a line item), and asking for less than that
     would make the course refuse the token for the wrong reason. */
  if (scope) body.set("scope", scope);
  let response: Response;
  try {
    response = await fetch(deployment.token_url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(502, "lms_unavailable", "The course's server could not be reached to get an access token.");
  }
  if (!response.ok) {
    throw new ApiError(502, "lms_refused", "The course's server refused the platform's request for an access token.");
  }
  const payload = (await response.json().catch(() => ({}))) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new ApiError(502, "lms_refused", "The course's server did not return an access token.");
  }
  return payload.access_token;
}

/**
 * Post the learner's verified work to the LMS.
 *
 * One score per receipt: the receipt is the attempt, and the same receipt is
 * posted once, ever. A post that failed is recorded as failed and may be
 * retried; a post that succeeded is never repeated, so a retried request
 * cannot double-post a grade.
 *
 * The score itself is not a mark the platform invented. The platform issues
 * no grades, so the score says one thing: this phase was verified. The
 * receipt rides along as the comment, with the competency, the level the
 * platform judged, and the hash the receipt can be re-derived from.
 */
async function postGrades(pool: Pool, deployment: DeploymentRow, userId: string): Promise<
  { proofSha256: string; status: string; attempts: number; posted: boolean }[]
> {
  const context = await pool.query(
    "SELECT lineitem, lineitem_url, scope FROM lti_ags_contexts WHERE deployment_id = $1 AND lms_subject = $2",
    [deployment.id, (await lmsSubjectFor(pool, deployment, userId)) ?? ""]
  );
  const ctx = context.rows[0] as { lineitem: string | null; lineitem_url: string | null; scope: string | null } | undefined;
  if (!ctx || !ctx.lineitem) return [];

  const subject = await lmsSubjectFor(pool, deployment, userId);
  if (!subject) return [];
  const { rows: proofRows } = await pool.query(
    "SELECT competency_id, level, payload_sha256, receipt, issued_at FROM proofs WHERE user_id = $1 ORDER BY issued_at",
    [userId]
  );
  if (proofRows.length === 0) return [];

  const accessToken = await lmsAccessToken(deployment, ctx.scope);
  const results: { proofSha256: string; status: string; attempts: number; posted: boolean }[] = [];

  for (const proof of proofRows as {
    competency_id: string;
    level: string;
    payload_sha256: string;
    receipt: unknown;
    issued_at: Date | string;
  }[]) {
    const existing = await pool.query(
      "SELECT id, status, attempts FROM lti_grade_posts WHERE deployment_id = $1 AND lms_subject = $2 AND proof_sha256 = $3",
      [deployment.id, subject, proof.payload_sha256]
    );
    const row = existing.rows[0] as { id: string; status: string; attempts: number } | undefined;
    if (row && row.status === "posted") {
      results.push({ proofSha256: proof.payload_sha256, status: "posted", attempts: row.attempts, posted: false });
      continue;
    }
    const rowId = row?.id ?? newId();
    if (!row) {
      await pool.query(
        "INSERT INTO lti_grade_posts (id, deployment_id, lms_subject, user_id, proof_sha256, lineitem, score_given, score_maximum, status, attempts) " +
          "VALUES ($1, $2, $3, $4, $5, $6, 1, 1, 'failed', 0)",
        [rowId, deployment.id, subject, userId, proof.payload_sha256, ctx.lineitem]
      );
    }
    const comment =
      `NEXORA verified ${proof.competency_id} at level ${proof.level}. ` +
      `Receipt sha256 ${proof.payload_sha256}. This is a statement of verified work, not a grade.`;
    const score = {
      userId: subject,
      scoreGiven: 1,
      scoreMaximum: 1,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
      timestamp: new Date(proof.issued_at).toISOString(),
      comment,
    };
    let failure: string | null = null;
    try {
      const response = await fetch(ctx.lineitem, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(score),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) failure = `the course's server answered ${response.status}`;
    } catch {
      failure = "the course's server could not be reached";
    }
    if (failure) {
      await pool.query(
        "UPDATE lti_grade_posts SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1",
        [rowId, failure]
      );
      results.push({ proofSha256: proof.payload_sha256, status: "failed", attempts: (row?.attempts ?? 0) + 1, posted: false });
      continue;
    }
    await pool.query(
      "UPDATE lti_grade_posts SET status = 'posted', attempts = attempts + 1, last_error = NULL, posted_at = now() WHERE id = $1",
      [rowId]
    );
    results.push({ proofSha256: proof.payload_sha256, status: "posted", attempts: (row?.attempts ?? 0) + 1, posted: true });
  }
  return results;
}

/** The LMS's own id for this learner, as the launch recorded it. */
async function lmsSubjectFor(pool: Pool, deployment: DeploymentRow, userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT subject FROM lti_identities WHERE issuer = $1 AND user_id = $2 LIMIT 1",
    [deployment.issuer, userId]
  );
  const row = rows[0] as { subject: string } | undefined;
  return row?.subject ?? null;
}

/* ---------- the routes ---------- */

export async function registerLtiRoutes(app: FastifyInstance, pool: Pool): Promise<void> {
  /* The public surface lives in its own scope, because it parses bodies the
   * rest of this service does not: an LTI launch arrives as a form post.
   *
   * The form parser is registered here so it applies to these routes and not
   * to the rest of the service. The JSON parser is overridden for the same
   * scope, because the edge labels every forwarded request application/json
   * and a form-encoded launch therefore arrives mislabelled: both are read,
   * and what is checked afterwards does not depend on which one it was. */
  await app.register(
    async (lti) => {
      lti.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
        done(null, formToObject(String(body)));
      });
      lti.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
        const raw = String(body);
        try {
          done(null, JSON.parse(raw));
        } catch {
          const asForm = formToObject(raw);
          done(null, Object.keys(asForm).length > 0 ? asForm : {});
        }
      });

      /* The OIDC login initiation, third-party initiated.
       *
       * The LMS sends the browser here with its issuer, its client id, the
       * deployment id and the login hint. The platform checks the tuple
       * against the registered deployments: an unknown one is refused here,
       * before any state exists. Then it mints a state and a nonce, records
       * them, and sends the browser to the LMS's authorization endpoint.
       *
       * The state and the nonce are stored hashed, so a copy of the database
       * holds nothing that could be replayed into a launch. Neither value is
       * ever logged. */
      lti.get("/login", async (req, reply) => {
        const query = (req.query ?? {}) as Record<string, string | undefined>;
        const issuer = typeof query.iss === "string" ? query.iss.trim() : "";
        const clientId = typeof query.client_id === "string" ? query.client_id.trim() : "";
        const deploymentId = typeof query.lti_deployment_id === "string" ? query.lti_deployment_id.trim() : "";
        if (!issuer || !clientId || !deploymentId) {
          throw new ApiError(400, "bad_request", "The login request did not say which course it is for.");
        }
        const { rows } = await pool.query(
          "SELECT * FROM lti_deployments WHERE issuer = $1 AND client_id = $2 AND deployment_id = $3",
          [issuer, clientId, deploymentId]
        );
        const deployment = rows[0] as DeploymentRow | undefined;
        if (!deployment) {
          throw new ApiError(404, "no_such_deployment", "This course is not registered with the platform.");
        }
        const state = randomBytes(32).toString("hex");
        const nonce = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO lti_login_states (state, nonce, deployment_id, login_hint, target_link_uri, lti_message_hint, expires_at) " +
            "VALUES ($1, $2, $3, $4, $5, $6, now() + $7::interval)",
          [
            sha256(state),
            sha256(nonce),
            deployment.id,
            typeof query.login_hint === "string" ? query.login_hint : null,
            typeof query.target_link_uri === "string" ? query.target_link_uri : null,
            typeof query.lti_message_hint === "string" ? query.lti_message_hint : null,
            `${Math.floor(LOGIN_STATE_TTL_MS / 1000)} seconds`,
          ]
        );
        const target = new URL(deployment.authorization_url);
        target.searchParams.set("scope", "openid");
        target.searchParams.set("response_type", "id_token");
        target.searchParams.set("response_mode", "form_post");
        target.searchParams.set("prompt", "none");
        target.searchParams.set("client_id", deployment.client_id);
        target.searchParams.set("redirect_uri", launchUrl());
        target.searchParams.set("state", state);
        target.searchParams.set("nonce", nonce);
        if (typeof query.login_hint === "string" && query.login_hint) target.searchParams.set("login_hint", query.login_hint);
        if (typeof query.lti_message_hint === "string" && query.lti_message_hint) {
          target.searchParams.set("lti_message_hint", query.lti_message_hint);
        }
        req.log.info({ deploymentId: deployment.deployment_id, institution: deployment.institution }, "lti login started");
        return reply.code(302).header("location", target.toString()).send();
      });

      /* The launch.
       *
       * Everything that decides anything happens before a single row is
       * written: the state has to be one this platform issued and has not
       * spent, the token has to verify against the LMS's published keys, and
       * the claims have to name this deployment, this client and this nonce.
       * A launch that fails any of those creates nothing at all.
       *
       * A launch that passes them binds the identity, takes the seat, and
       * hands the browser a one-time code. The code is exchanged for a
       * session by the front door, so no token ever travels in a URL. */
      lti.post("/launch", async (req, reply) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const idToken = typeof body.id_token === "string" ? body.id_token : "";
        const state = typeof body.state === "string" ? body.state : "";
        if (!idToken) throw new ApiError(400, "bad_request", "The launch carried no token.");
        if (!state) throw new ApiError(400, "bad_request", "The launch carried no state.");

        const { rows: stateRows } = await pool.query("SELECT * FROM lti_login_states WHERE state = $1", [sha256(state)]);
        const loginState = stateRows[0] as
          | { state: string; nonce: string; deployment_id: string; expires_at: Date | string; consumed_at: Date | string | null }
          | undefined;
        if (!loginState) {
          throw new ApiError(401, "invalid_launch", "The launch was refused: it does not continue a login this platform started.");
        }
        if (loginState.consumed_at) {
          throw new ApiError(401, "replayed_launch", "The launch was refused: it has already been used.");
        }
        if (new Date(loginState.expires_at).getTime() < Date.now()) {
          throw new ApiError(401, "expired_launch", "The launch was refused: the login it continues has expired.");
        }
        const { rows: deploymentRows } = await pool.query("SELECT * FROM lti_deployments WHERE id = $1", [
          loginState.deployment_id,
        ]);
        const deployment = deploymentRows[0] as DeploymentRow | undefined;
        if (!deployment) {
          throw new ApiError(404, "no_such_deployment", "This course is not registered with the platform.");
        }

        let claims: Record<string, unknown>;
        try {
          const keys = await fetchJwks(deployment.jwks_url);
          try {
            claims = verifyLaunchToken(idToken, keys, {
              issuer: deployment.issuer,
              audience: deployment.client_id,
              deploymentId: deployment.deployment_id,
              nonceHash: loginState.nonce,
            });
          } catch (err) {
            // A key id the cached set does not hold is the ordinary reason for
            // a miss (a rotation), so the set is fetched once more before the
            // launch is refused.
            if (err instanceof LtiRefusal && err.reason === "unknown_key") {
              const fresh = await fetchJwks(deployment.jwks_url, true);
              claims = verifyLaunchToken(idToken, fresh, {
                issuer: deployment.issuer,
                audience: deployment.client_id,
                deploymentId: deployment.deployment_id,
                nonceHash: loginState.nonce,
              });
            } else {
              throw err;
            }
          }
        } catch (err) {
          if (err instanceof LtiRefusal) {
            req.log.warn({ deploymentId: deployment.deployment_id, reason: err.reason }, "lti launch refused");
            throw new ApiError(401, err.reason, err.message);
          }
          throw err;
        }

        const messageType = claims[`${LTI}/message_type`];
        if (messageType !== "LtiResourceLinkRequest") {
          throw new ApiError(400, "unsupported_message", "The launch was refused: this kind of LTI request is not supported.");
        }
        if (!hasLaunchRole(claims[`${LTI}/roles`])) {
          throw new ApiError(403, "no_role", "The launch was refused: the course did not say the person is a learner or an instructor.");
        }

        // The state is spent here, atomically: of any number of launches
        // carrying it, exactly one finds the row unspent.
        const spent = await pool.query(
          "UPDATE lti_login_states SET consumed_at = now() WHERE state = $1 AND consumed_at IS NULL RETURNING state",
          [sha256(state)]
        );
        if (spent.rows.length === 0) {
          throw new ApiError(401, "replayed_launch", "The launch was refused: it has already been used.");
        }

        const subject = typeof claims.sub === "string" ? claims.sub : "";
        /* The seat is checked before the account is created, so a learner who
           cannot have a seat does not get one as a side effect of the
           refusal. */
        const bound0 = await pool.query("SELECT user_id FROM lti_identities WHERE issuer = $1 AND subject = $2", [
          deployment.issuer,
          subject,
        ]);
        await checkSeat(pool, deployment.cohort_id, (bound0.rows[0] as { user_id: string } | undefined)?.user_id ?? null);
        const bound = await bindIdentity(pool, deployment, claims, signedInUserId(req));
        await reserveSeat(pool, deployment.cohort_id, bound.userId);

        // Where a score for this learner goes, as the launch said.
        const ags = claims[`${AGS}/endpoint`] as { scope?: unknown; lineitem?: unknown; lineitemurl?: unknown } | undefined;
        const resourceLink = claims[`${LTI}/resource_link`] as { id?: unknown } | undefined;
        await pool.query(
          "INSERT INTO lti_ags_contexts (deployment_id, lms_subject, lineitem, lineitem_url, scope, resource_link, updated_at) " +
            "VALUES ($1, $2, $3, $4, $5, $6, now()) " +
            "ON CONFLICT (deployment_id, lms_subject) DO UPDATE SET lineitem = EXCLUDED.lineitem, lineitem_url = EXCLUDED.lineitem_url, " +
            "scope = EXCLUDED.scope, resource_link = EXCLUDED.resource_link, updated_at = now()",
          [
            deployment.id,
            subject,
            typeof ags?.lineitem === "string" ? ags.lineitem : null,
            typeof ags?.lineitemurl === "string" ? ags.lineitemurl : null,
            Array.isArray(ags?.scope) ? ags.scope.join(" ") : typeof ags?.scope === "string" ? ags.scope : null,
            typeof resourceLink?.id === "string" ? resourceLink.id : null,
          ]
        );

        const code = await issueLaunchGrant(pool, bound.userId, deployment.id);
        req.log.info(
          { deploymentId: deployment.deployment_id, userId: bound.userId, accountCreated: bound.created },
          "lti launch accepted"
        );
        const target = new URL(completeUrl());
        target.searchParams.set("code", code);
        return reply.code(302).header("location", target.toString()).send();
      });

      /* The exchange: a verified launch becomes a session.
       *
       * The code is one-time and short-lived, and it is hashed at rest, so
       * the URL that carries it is not a credential that outlives its first
       * use. */
      lti.post("/exchange", async (req) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const code = typeof body.code === "string" ? body.code : "";
        if (!code) throw new ApiError(400, "bad_request", "No code was given.");
        const { rows } = await pool.query("SELECT * FROM lti_launch_grants WHERE code_hash = $1", [sha256(code)]);
        const grant = rows[0] as
          | { code_hash: string; user_id: string; expires_at: Date | string; consumed_at: Date | string | null }
          | undefined;
        if (!grant) throw new ApiError(401, "invalid_grant", "That launch code is not valid.");
        if (grant.consumed_at) throw new ApiError(401, "invalid_grant", "That launch code has already been used.");
        if (new Date(grant.expires_at).getTime() < Date.now()) {
          throw new ApiError(401, "expired", "That launch code has expired.");
        }
        const claimed = await pool.query(
          "UPDATE lti_launch_grants SET consumed_at = now() WHERE code_hash = $1 AND consumed_at IS NULL RETURNING code_hash",
          [sha256(code)]
        );
        if (claimed.rows.length === 0) throw new ApiError(401, "invalid_grant", "That launch code has already been used.");

        const access = signAccessToken(grant.user_id);
        const refresh = newRefreshToken();
        const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 3600_000);
        await pool.query(
          "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
          [newId(), grant.user_id, sha256(refresh), expiresAt]
        );
        const { rows: userRows } = await pool.query("SELECT id, email, name, created_at, email_verified_at FROM users WHERE id = $1", [
          grant.user_id,
        ]);
        return {
          user: toPublic(userRows[0]),
          tokens: { accessToken: access.token, refreshToken: refresh, expiresIn: access.expiresIn },
        };
      });

      /* The tool's public key set, so the LMS can check what we sign. */
      lti.get("/jwks", async () => {
        const jwks = toolJwks();
        if (!jwks) throw new ApiError(503, "verification_unavailable", "This platform publishes no tool key.");
        return jwks;
      });

      /* The statement key, for checking a statement offline. */
      lti.get("/statement/verify-key", async () => {
        const key = statementKey();
        if (!key) throw new ApiError(503, "verification_unavailable", "This platform publishes no statement key.");
        return { algorithm: "Ed25519", keyId: statementKeyId(), publicKey: receiptEdPublicKey(key) };
      });

      /* The caller's own statement. */
      lti.get("/statement", async (req) => {
        const userId = signedInUserId(req);
        if (!userId) throw new ApiError(401, "unauthorized", "Missing authenticated user.");
        return buildStatement(pool, userId);
      });

      /* A named learner's statement, for the instructor of the class they are in. */
      lti.get("/statements/:userId", async (req) => {
        const caller = signedInUserId(req);
        if (!caller) throw new ApiError(401, "unauthorized", "Missing authenticated user.");
        const userId = (req.params as { userId: string }).userId;
        const { rows } = await pool.query(
          "SELECT 1 FROM cohorts c JOIN cohort_members m ON m.cohort_id = c.id " +
            "WHERE c.instructor_id = $1 AND m.user_id = $2 LIMIT 1",
          [caller, userId]
        );
        if (!rows[0]) {
          throw new ApiError(404, "not_found", "No such learner in a class you teach.");
        }
        return buildStatement(pool, userId);
      });
    },
    { prefix: "/lti" }
  );

  /* The operator's registration of a deployment, over the mesh.
   *
   * Not a public surface and not self-service: a deployment is a trust
   * decision about who may launch our course, so the operator adds it. The
   * gateway refuses to proxy a path under /internal/, and the service chassis
   * requires the mesh key for every other route, so this is reachable only
   * from inside the mesh. */
  app.post("/internal/lti/deployments", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const issuer = typeof body.issuer === "string" ? body.issuer.trim() : "";
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const deploymentId = typeof body.deploymentId === "string" ? body.deploymentId.trim() : "";
    const institution = typeof body.institution === "string" ? body.institution.trim() : "";
    const cohortId = typeof body.cohortId === "string" ? body.cohortId.trim() : "";
    const authorizationUrl = typeof body.authorizationUrl === "string" ? body.authorizationUrl.trim() : "";
    const tokenUrl = typeof body.tokenUrl === "string" ? body.tokenUrl.trim() : "";
    const jwksUrl = typeof body.jwksUrl === "string" ? body.jwksUrl.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : "";
    if (!issuer || !clientId || !deploymentId || !institution || !cohortId || !authorizationUrl || !tokenUrl || !jwksUrl) {
      throw new ApiError(400, "bad_request", "A deployment needs its issuer, client id, deployment id, institution, class and the course's three URLs.");
    }
    for (const [name, value] of [
      ["issuer", issuer],
      ["authorizationUrl", authorizationUrl],
      ["tokenUrl", tokenUrl],
      ["jwksUrl", jwksUrl],
    ] as const) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("scheme");
      } catch {
        throw new ApiError(400, "bad_request", `The ${name} is not a URL.`);
      }
    }
    const { rows: cohortRows } = await pool.query("SELECT id FROM cohorts WHERE id = $1", [cohortId]);
    if (!cohortRows[0]) throw new ApiError(404, "not_found", "No such class.");
    const existing = await pool.query(
      "SELECT id FROM lti_deployments WHERE issuer = $1 AND client_id = $2 AND deployment_id = $3",
      [issuer, clientId, deploymentId]
    );
    if (existing.rows[0]) {
      throw new ApiError(409, "conflict", "That deployment is already registered.");
    }
    const id = newId();
    const { rows } = await pool.query(
      "INSERT INTO lti_deployments (id, issuer, client_id, deployment_id, institution, cohort_id, authorization_url, token_url, jwks_url, client_secret_enc) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
      [
        id,
        issuer,
        clientId,
        deploymentId,
        institution,
        cohortId,
        authorizationUrl,
        tokenUrl,
        jwksUrl,
        clientSecret ? sealSecret(clientSecret) : null,
      ]
    );
    const row = rows[0] as DeploymentRow;
    await pool.query(
      "INSERT INTO admin_actions (id, operator_id, action, target, detail) VALUES ($1, $2, $3, $4, $5)",
      [
        newId(),
        "the-operator-tooling",
        "lti.deployment_registered",
        row.id,
        `${row.deployment_id} at ${row.issuer} for ${row.institution}`,
      ]
    );
    req.log.info({ deploymentId: row.deployment_id, issuer: row.issuer }, "lti deployment registered");
    return reply.code(201).send({
      deployment: {
        id: row.id,
        issuer: row.issuer,
        clientId: row.client_id,
        deploymentId: row.deployment_id,
        institution: row.institution,
        cohortId: row.cohort_id,
        authorizationUrl: row.authorization_url,
        tokenUrl: row.token_url,
        jwksUrl: row.jwks_url,
        hasClientSecret: row.client_secret_enc !== null,
      },
    });
  });

  /* The registered deployments, for the operator. */
  app.get("/internal/lti/deployments", async () => {
    const { rows } = await pool.query(
      "SELECT id, issuer, client_id, deployment_id, institution, cohort_id, created_at FROM lti_deployments ORDER BY created_at DESC"
    );
    return {
      deployments: (rows as DeploymentRow[]).map((d) => ({
        id: d.id,
        issuer: d.issuer,
        clientId: d.client_id,
        deploymentId: d.deployment_id,
        institution: d.institution,
        cohortId: d.cohort_id,
        createdAt: new Date(d.created_at).toISOString(),
      })),
    };
  });

  /* The grade passback.
   *
   * Over the mesh, because it is the platform's own action and not something
   * a browser may ask for: it posts what the ledger holds. The trigger a
   * deployment would use is the same route.
   *
   * Nothing is posted for work the platform has not verified, and nothing is
   * posted twice: the receipt is the attempt, and a receipt that was already
   * posted is not posted again. */
  app.post("/internal/lti/grades", async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const deploymentRowId = typeof body.deploymentId === "string" ? body.deploymentId.trim() : "";
    if (!userId || !deploymentRowId) {
      throw new ApiError(400, "bad_request", "A passback needs the learner and the deployment.");
    }
    const { rows } = await pool.query("SELECT * FROM lti_deployments WHERE id = $1", [deploymentRowId]);
    const deployment = rows[0] as DeploymentRow | undefined;
    if (!deployment) throw new ApiError(404, "not_found", "No such deployment.");
    const results = await postGrades(pool, deployment, userId);
    return { results };
  });
}
