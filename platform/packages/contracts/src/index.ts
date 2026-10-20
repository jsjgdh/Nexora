import { z } from "zod";

/* Shared API contracts: request schemas (validated at every edge) and
   response shapes. Single source of truth for gateway ↔ services ↔ clients. */

export interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/* ---------- auth ---------- */

/* ---------- the password policy, in one place ----------
 *
 * There is exactly one rule set, and a password that is accepted anywhere in
 * the product is accepted everywhere: the same floor, the same ceiling, the
 * same words. A policy that is written twice is a policy that drifts, and the
 * drift shows up as an account that can be created with a password the sign-in
 * path would have refused.
 */

/** The floor. Ten characters, and no composition rules (see below). */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * The ceiling. Long enough that a passphrase fits and short enough that the
 * hash is not a denial-of-service weapon against our own CPU.
 */
export const PASSWORD_MAX_LENGTH = 200;

/**
 * The rule, as a schema.
 *
 * Length only, deliberately: a composition rule ("one capital, one digit, one
 * symbol") measures how well a password resists a dictionary, and it is
 * answered by "Password1!" every time. A long passphrase is stronger and
 * easier to remember, so the policy asks for length and nothing else.
 */
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/**
 * Which rule a password breaks, in words, or null when it breaks none.
 *
 * The schema says only "invalid". A learner who is told "Invalid request
 * body" learns nothing and guesses; a learner who is told "Your password must
 * be at least 10 characters" can fix it on the spot. This is why the message
 * exists, and why the flows that set a password (registration, password
 * reset) use it rather than the bare schema error.
 */
export function passwordPolicyMessage(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Your password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Your password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * An address, as the wire carries it.
 *
 * One definition, used by sign-up, sign-in and both of the address-keyed
 * flows, so the same string is accepted and rejected in the same places.
 */
export const emailAddressSchema = z.string().email().max(254);

/* Registration, and the four affirmations that ride with it.
 *
 * The account itself is processed on the contract basis (GDPR Art. 6(1)(b)) —
 * we cannot deliver courses to someone without an identity to attach them to —
 * so no consent is required to sign up, only *information*. What the four
 * fields below record is not the permission to process: it is the evidence that
 * the information was given. GDPR Arts. 13–14, India's DPDP Rules (notice,
 * itemised and separate from other information) and California's notice-at-
 * collection all require the notice to be delivered at the point of collection,
 * and the operator has to be able to show it was.
 *
 *   acceptTerms / acceptPrivacy  the learner was shown a document of a known
 *                                version and affirmed it. Art. 7(1) proof of
 *                                consent is the analogue; here it is proof of
 *                                disclosure, which is what the notice duty
 *                                actually asks for.
 *   ageAffirmed                  the learner is 16 or over, or has a parent's
 *                                or guardian's permission. GDPR Art. 8 makes
 *                                under-16s a special case, COPPA covers
 *                                under-13s, and DPDP sets the line at 18 — the
 *                                strictest of the three is the one this product
 *                                applies to a self-serve signup.
 *   documentVersions             which wording the learner says they read,
 *                                refused unless it matches the version this
 *                                deployment serves. A client cannot invent a
 *                                version number to get out of the notice duty.
 *
 * All four are optional in the schema and required by policy, not by parsing:
 * the deployment switch `NEXORA_REQUIRE_CONSENT` (on by default in production)
 * is what refuses a registration without them, so a development build and the
 * existing end-to-end suite keep their old wire shape and the refusal lives
 * where the law does — in the refusal to operate, not in a parser.
 */

export const registerSchema = z.object({
  email: emailAddressSchema,
  password: passwordSchema,
  name: z.string().min(1).max(80).optional(),
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
  ageAffirmed: z.boolean().optional(),
  documentVersions: z
    .object({
      terms: z.string().min(1).max(32),
      privacy: z.string().min(1).max(32),
    })
    .optional(),
});
export type RegisterRequest = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailAddressSchema,
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export type RefreshRequest = z.infer<typeof refreshSchema>;

/* Sign-out, and why it carries two credentials.
 *
 * The refresh token is the family the sign-out ends, and it is the only
 * credential the browser itself never holds (it lives in the broker's HttpOnly
 * cookie). The access token is the half already in the learner's hands — the one
 * a script on the page could have taken, and the one that would otherwise stay
 * valid for the rest of its TTL — so if the caller presents it, the service
 * records its `jti` as revoked and the gateway refuses it from the next request
 * on. Both are optional: signing out with neither is still a valid, idempotent
 * request (an unknown token must not be distinguishable from a known one), and
 * the service simply ends whatever it can name. */
export const logoutSchema = z.object({
  refreshToken: z.string().min(32).max(512).optional(),
  accessToken: z.string().min(1).max(4096).optional(),
});
export type LogoutRequest = z.infer<typeof logoutSchema>;

/* Signing out of every device at once.
 *
 * The access token is required rather than optional, and that is the point: this
 * ends sessions the caller cannot see, so the caller has to prove it holds one of
 * them. The token is verified by the service and its subject decides whose
 * sessions end — never a body-supplied user id, or one learner could sign another
 * out everywhere by typing their id. */
export const logoutAllSchema = z.object({
  accessToken: z.string().min(1).max(4096),
});
export type LogoutAllRequest = z.infer<typeof logoutAllSchema>;

/* IDE device authorization (GitHub-style browser sign-in).
 *
 * The IDE cannot hold a password prompt it should not see and cannot read the
 * browser's HttpOnly session cookie — so it shows a short user code, opens the
 * browser to /auth/ide, and polls until the signed-in learner approves it.
 * The browser never sees the device secret and the IDE never sees the password:
 * each side presents only its own credential.
 *
 * Wire shape, deliberately boring:
 *   POST /device/start   → { deviceCode, userCode, verificationUri, expiresIn }
 *   POST /device/poll    → { status: "pending" } | { status: "approved", user, tokens }
 *   POST /device/approve → { ok: true } (authenticated: the approving learner)
 *
 * The device code is a bearer credential for one poll loop, so it travels only
 * in bodies (never query strings that land in logs) and only its sha256 is
 * stored. The user code is short and human-typed, so approve is rate-limited
 * like login and a wrong code is indistinguishable from an unknown one. */
export const devicePollSchema = z.object({
  deviceCode: z.string().min(32).max(512),
});
export type DevicePollRequest = z.infer<typeof devicePollSchema>;

export const deviceApproveSchema = z.object({
  userCode: z.string().min(4).max(16),
});
export type DeviceApproveRequest = z.infer<typeof deviceApproveSchema>;

export interface DeviceStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

/* Access-token denylist check, gateway → auth over the mesh.
 *
 * The gateway verifies tokens by signature alone, which is what keeps it
 * stateless — and what used to make the lifetime the whole revocation story. It
 * asks this instead, naming the token's `jti`, and gets one of two answers. The
 * third answer (the service did not answer) is not representable here on purpose:
 * it is a failure the gateway must not read as "still valid". */
export const revocationCheckSchema = z.object({
  jti: z.string().min(1).max(128),
  /**
   * The token's subject. Optional because a caller that only wants the per-token
   * answer need not send it, but an account-wide sign-out is recorded against a
   * *person*, so without this the check can only see that half of the denylist.
   */
  userId: z.string().min(1).max(128).optional(),
  /**
   * The token's own `iat`, in milliseconds. This is what a per-account cut-off is
   * compared against: a token issued *after* the moment of "sign out everywhere"
   * is a session the learner asked for, and revoking it would sign them straight
   * back out. Sent by the gateway from the very token it is asking about, so it is
   * never a client-supplied claim.
   */
  issuedAtMs: z.number().int().nonnegative().optional(),
});
export type RevocationCheckRequest = z.infer<typeof revocationCheckSchema>;

export interface RevocationCheckResponse {
  revoked: boolean;
  /**
   * Which denylist row decided, for the edge's log line — never for the message a
   * client sees, which stays the same either way (no oracle on how a session
   * ended).
   */
  reason?: "credential" | "account";
}

/* Clerk-mode provisioning: the gateway verified the Clerk session token and
   forwarded its subject as the user id, so this id IS the authenticated
   user. Creates the local profile row on first sight; idempotent after that.
   Email is immutable here — never merges two identities. */
export const linkSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(80).optional(),
});
export type LinkRequest = z.infer<typeof linkSchema>;

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  /**
   * Whether the address has been confirmed.
   *
   * Optional on the wire, and optional here: a client written before the
   * verification flow existed ignores the field and keeps working, and a
   * client that reads it must treat "absent" as "not known" rather than as
   * "not verified". A required field would have been a breaking change to
   * every client that parses this shape.
   */
  emailVerified?: boolean;
}

/* ---------- forgotten password and unverified address ----------
 *
 * The two flows the platform did not have. A learner who forgot their
 * password was locked out permanently, with no mail and no way back in, and
 * an address was never confirmed at all.
 *
 * Both request routes answer the same way whatever the address turns out to
 * be: an existing local account, a Clerk-managed account, an address nobody
 * has heard of. There is no enumeration here, ever. The bodies are identical,
 * the statuses are identical, and the work done before the answer is the same
 * work in every case, so the answer does not arrive faster for an address
 * that does not exist. A prober who can tell those apart can walk the
 * customer list of a product people pay for.
 */

/**
 * The body of a request route: an address and nothing else.
 *
 * The same shape for both flows, because the answer is the same shape and
 * there is no reason for the wire to differ.
 */
export const emailRequestSchema = z.object({
  email: emailAddressSchema,
});
export type EmailRequest = z.infer<typeof emailRequestSchema>;

/**
 * The body of a password-reset confirmation: the token from the link and the
 * new password.
 *
 * The password is bounded loosely here on purpose. The policy is checked by
 * the service and reported in words ("Your password must be at least 10
 * characters"), and a bare schema refusal would say only "Invalid request
 * body" and teach the learner nothing.
 */
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1).max(4096),
  newPassword: z.string().min(1).max(2000),
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmSchema>;

/**
 * The body of an email-verification confirmation: the token from the link.
 */
export const emailVerifyConfirmSchema = z.object({
  token: z.string().min(1).max(4096),
});
export type EmailVerifyConfirmRequest = z.infer<typeof emailVerifyConfirmSchema>;

/**
 * The one answer a token that cannot be spent gets.
 *
 * Unknown, expired, already used and malformed are four different facts, and
 * the client is told the same thing about all four: one message, one code.
 * A client that could tell them apart could probe for live tokens, and a
 * live token is a way into somebody else's account.
 */
export const INVALID_TOKEN_CODE = "invalid_token";

/* ---------- lawful basis, consent records and data-subject rights ----------
 *
 * One vocabulary shared by the service that writes the records, the front door
 * that displays them and the verification suite that asserts them. Everything a
 * regulator asks for about a *request* — what was asked, when it arrived, when
 * it was answered and what the answer was — has one shape here rather than a
 * convention per endpoint.
 *
 * The deadline constants are the statutory ones, kept in one place because a
 * page that promises "within one month" and a service that computes a different
 * `due_at` is a misstatement the suite cannot see unless they agree by
 * construction.
 */

/** The documents a learner can accept, and the purposes consent is asked for. */
export const CONSENT_DOCUMENTS = ["terms", "privacy", "age-affirmation"] as const;

/**
 * The version stamp of the documents this deployment serves, and the one fact a
 * client cannot be trusted to supply.
 *
 * Registration carries the versions the learner says they read, and the service
 * refuses anything that is not listed here. That makes the recorded version an
 * assertion by the party with something at stake rather than a claim by the
 * party filling in a form — a client cannot quietly report "terms v1" while the
 * page rendered v3, and a document that is rewritten without bumping this is
 * caught by the suite instead of by a regulator.
 *
 * These two values are the `EFFECTIVE_DATE` of the published documents. The
 * front door sends its own copy of that date (it does not import this package),
 * so a drift between the two surfaces makes sign-up fail loudly with a version
 * mismatch — which is the direction this failure should point.
 */
export const CURRENT_DOCUMENT_VERSIONS = { terms: "2026-10-16", privacy: "2026-10-16" } as const;
export type ConsentDocument = (typeof CONSENT_DOCUMENTS)[number];

/**
 * Why each purpose is legitimate processing, in the only three words that
 * matter: which GDPR Article 6 basis the operator relies on. `contract` is the
 * account, the courses and the payment (and is what makes the account itself
 * lawful without a checkbox); `consent` is everything genuinely optional, which
 * today is the AI assistants and nothing else.
 */
export const LAWFUL_BASES = ["contract", "consent", "legal-obligation", "legitimate-interests"] as const;
export type LawfulBasis = (typeof LAWFUL_BASES)[number];

/**
 * The statutory clocks, in days, that a rights request is answered against —
 * and the shorter internal target the operator actually commits to.
 *
 * GDPR Art. 12(3) is one month; CCPA §1798.130 is 45 calendar days with one
 * further 45; India's DPDP Rules set 90 days for a grievance. The strictest is
 * therefore one month, and a single 30-day clock satisfies all three, which is
 * why there is one number here instead of a branch per jurisdiction.
 */
export const RIGHTS_RESPONSE_DAYS = 30;
export const RIGHTS_STATUTORY_DAYS = { gdpr: 30, ccpa: 45, dpdp: 90 } as const;

/**
 * The rights a person can exercise, named once.
 *
 * `erasure`, `access`, `portability`, `rectification`, `restriction` and
 * `objection` are the GDPR set; `withdraw-consent` is Art. 7(3); `nomination` is
 * DPDP s.14 ("in the event of death or incapacity"); `opt-out-sale` is kept in
 * the list although nothing is sold or shared — a request to stop selling
 * personal data has to be answerable in words, and the honest answer is that it
 * was never happening.
 */
export const RIGHTS_KINDS = [
  "access",
  "erasure",
  "portability",
  "rectification",
  "restriction",
  "objection",
  "withdraw-consent",
  "nomination",
  "opt-out-sale",
] as const;
export type RightsKind = (typeof RIGHTS_KINDS)[number];

/** A request a person files, and the answer the operator gives it. */
export const rightsRequestSchema = z.object({
  kind: z.enum(RIGHTS_KINDS),
  /** The requester's own words. Kept because an obligation to act cannot be
   * judged from a dropdown, and because the reasoned answer quotes it back. */
  detail: z.string().min(1).max(4000),
  /** The person a nomination names, only for `nomination`. */
  nominee: z.string().min(1).max(200).optional(),
});
export type RightsRequest = z.infer<typeof rightsRequestSchema>;

export interface RightsRequestRecord {
  id: string;
  kind: RightsKind;
  status: "received" | "in-progress" | "completed" | "refused";
  detail: string;
  createdAt: string;
  /** The statutory date this must be answered by, computed at intake. */
  dueAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

/**
 * Withdrawing a consent (GDPR Art. 7(3), DPDP s.6(4)).
 *
 * A route rather than a support request, because the right is that withdrawal be
 * as easy as giving consent was — and the day it takes an email to an operator is
 * the day it is not. The document is named rather than implied so the record
 * shows which acceptance was withdrawn, and the answer says what changed as a
 * result instead of only that a row was updated.
 */
export const consentWithdrawSchema = z.object({
  document: z.enum(CONSENT_DOCUMENTS),
});
export type ConsentWithdrawRequest = z.infer<typeof consentWithdrawSchema>;

/** One recorded acceptance, as the learner sees it back. */
export interface ConsentRecordView {
  document: ConsentDocument;
  version: string;
  /** Which basis the processing under this document rests on. */
  basis: LawfulBasis;
  purpose: string;
  acceptedAt: string;
  withdrawnAt: string | null;
}

/**
 * Erasure is confirmed by the requester typing the word, never by a checkbox:
 * the action is irreversible and takes every session, proof and consent with
 * it, so the confirmation has to be something a stray click cannot produce.
 * A literal in the schema (not an optional boolean) is what makes that
 * structural rather than a convention the client is trusted to follow.
 */
export const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
  /** Free-text reason, optional, recorded on the erasure receipt only if given. */
  reason: z.string().max(500).optional(),
  /** What the learner was told would be retained, echoed so the record shows
   * they were told. Never trusted for control flow — the service decides what
   * it keeps. */
  acknowledgedRetention: z.boolean().optional(),
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountSchema>;

/**
 * What erasure actually deleted, and what it could not — the two lists are the
 * point. A deletion flow that reports only success is the kind of claim this
 * codebase refuses to make, so the response names the retained categories and
 * the reason each is retained (tax records, and the erasure receipt itself).
 */
export interface DeleteAccountResponse {
  deleted: Record<string, number>;
  retained: { category: string; reason: string; basis: LawfulBasis }[];
  /** Handed to the processors that hold their own copy, to be actioned there. */
  processorsQueued: string[];
  receiptId: string;
}

/**
 * The export (GDPR Art. 15 access and Art. 20 portability, CCPA §1798.110/115,
 * DPDP access) for everything this service holds. Machine-readable by
 * construction: it is the artifact a person is entitled to, not a rendering of
 * it. Billing lives in its own service and its own database, so it is exported
 * by its own endpoint and merged by whoever assembles the download — stated here
 * rather than silently omitted, because an export that quietly misses the
 * payment records is not the export the law describes.
 */
export interface AccountExport {
  format: "nexora-account-export";
  version: 1;
  generatedAt: string;
  controller: string;
  /** Which service produced this half of the record. */
  service: "auth" | "billing";
  subject: PublicUser & { provider: string };
  consents: ConsentRecordView[];
  rightsRequests: RightsRequestRecord[];
  proofs: ProofRecord[];
  /** Counts, not contents: a refresh-token hash is a credential, and an export
   * is a file that will be emailed around. */
  sessions: { active: number; revoked: number; deviceCodes: number };
  /** Everything this service does NOT hold, named so the reader is not misled
   * into thinking the file is the whole of the operator's record. */
  notIncluded: { category: string; where: string }[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/* ---------- curriculum (IDE only) ---------- */

/* The curriculum service serves the IDE curriculum: a public roadmap of phase
   names and tiers, plus paid phase payloads behind entitlement. The
   browser-classroom summaries (stages, missions, diagnostic items) are deleted
   with the classroom — one way to learn, the desktop IDE. */

/* ---------- run receipts: proof that the platform ran the code ---------- */

/**
 * What the runner observed, exactly as the learner's client received it.
 *
 * These facts are the evidence attestation reads, so the copy that travels
 * onward must be the copy the execution service signed — not one the client
 * can edit on the way. `files` binds the run to the submission: the entry
 * file's sha256 is matched against the code the platform holds, so a receipt
 * cannot be replayed for a different program.
 */
export interface RunFacts {
  language: "node" | "python" | "go";
  command: string[];
  files: { path: string; sha256: string }[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  phase: "compile" | "run" | null;
  diagnostics: ExecDiagnostic[];
  runner: string;
  /** The learner this run is bound to. Absent on receipts minted before the
   * binding landed — those verify on their original bytes, unchanged. */
  userId?: string;
}

/**
 * A capability the execution service issues after a run and attestation
 * accepts as proof. Two signatures over the same `runReceiptPayload` bytes:
 * `sig` is an HMAC keyed by a receipt key derived from the mesh key (mesh-
 * internal checks keep this shape), and `sigEd` is Ed25519 by the operator-
 * held receipt key, verifiable by anyone holding the published public key —
 * a stranger re-derives the verdict without asking the platform and without
 * learning anything that mints. `sigEd` is absent on receipts minted before
 * the operator configured a receipt key; those still verify on the HMAC.
 */
export interface RunReceipt {
  v: 1;
  issuedAt: string;
  facts: RunFacts;
  /** hex HMAC-SHA256 of `runReceiptPayload(facts, issuedAt)`. */
  sig: string;
  /** base64 Ed25519 over the same payload bytes. Absent before the migration. */
  sigEd?: string;
  /** Which published key signed it, so rotation does not orphan old receipts. */
  keyId?: string;
}

export const runFactsSchema = z.object({
  language: z.enum(["node", "python", "go"]),
  command: z.array(z.string().max(200)).max(8),
  files: z
    .array(z.object({ path: z.string().min(1).max(200), sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
    .min(1)
    .max(32),
  stdout: z.string().max(1_100_000),
  stderr: z.string().max(1_100_000),
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  truncated: z.boolean(),
  durationMs: z.number().int().min(0),
  phase: z.enum(["compile", "run"]).nullable(),
  diagnostics: z
    .array(
      z.object({
        kind: z.enum(["compile", "runtime"]),
        file: z.string().nullable(),
        line: z.number().int().nullable(),
        column: z.number().int().nullable(),
        message: z.string().max(4000),
      })
    )
    .max(64),
  runner: z.string().max(40),
  userId: z.string().min(1).max(120).optional(),
});

export const runReceiptSchema = z.object({
  v: z.literal(1),
  issuedAt: z.string().min(20).max(40),
  facts: runFactsSchema,
  sig: z.string().regex(/^[0-9a-f]{64}$/),
  sigEd: z.string().min(86).max(90).optional(),
  keyId: z.string().min(1).max(64).optional(),
});

/**
 * Deterministic serialization of the signed facts.
 *
 * Hand-built rather than `JSON.stringify(facts)`: a signed string must not
 * depend on key insertion order, or two processes building the same facts could
 * disagree about what was signed. Both sides call this function, so the bytes
 * are identical by construction.
 */
export function runReceiptPayload(facts: RunFacts, issuedAt: string): string {
  return JSON.stringify({
    v: 1,
    // Identity first when bound; omitted entirely when not, so receipts
    // minted before the binding verify on their original bytes.
    ...(facts.userId === undefined ? {} : { userId: facts.userId }),
    issuedAt,
    language: facts.language,
    command: facts.command,
    files: facts.files.map((f) => [f.path, f.sha256]),
    stdout: facts.stdout,
    stderr: facts.stderr,
    exitCode: facts.exitCode,
    timedOut: facts.timedOut,
    truncated: facts.truncated,
    durationMs: facts.durationMs,
    phase: facts.phase,
    diagnostics: facts.diagnostics.map((d) => [d.kind, d.file, d.line, d.column, d.message]),
    runner: facts.runner,
  });
}

/* ---------- attestation (IDE re-judging, B-24) ---------- */

/**
 * What the IDE submits for re-judging. The command is the activity's own
 * test command; the server allowlists its shape (`node --test ...` over
 * registered test paths) and runs the platform's own copy of those tests —
 * never the learner's. `localTap` is context for logs only, never evidence.
 */
export const attestSubmissionSchema = z.object({
  checkIds: z.array(z.string().min(1).max(80)).min(1).max(64),
  checks: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        tests: z.array(z.string().min(1).max(300)).min(1).max(64),
      })
    )
    .min(1)
    .max(64),
  files: z
    .array(z.object({ path: z.string().min(1).max(200), content: z.string().max(256_000) }))
    .min(1)
    .max(32),
  command: z.string().min(1).max(500),
  localTap: z.string().max(1_100_000).default(""),
  /** The phase project the submission belongs to (`task-manager` and friends).
   * Optional so older IDEs keep working; absent means `task-manager`, mirroring
   * the curriculum's own default. It disambiguates suites two projects own
   * under one relative path — without it a Go merge and a JS merge would be
   * judged by whichever suite a bare path happened to name. */
  project: z.string().min(1).max(120).optional(),
});
export type AttestSubmission = z.infer<typeof attestSubmissionSchema>;

export const attestVerdictSchema = z.object({
  provenance: z.literal("attested"),
  outcome: z.string().min(1).max(500),
  checks: z
    .array(
      z.object({
        checkId: z.string().min(1).max(80),
        passed: z.boolean(),
        reason: z.string().min(1).max(1000),
      })
    )
    .min(1)
    .max(64),
  /**
   * The canonical run's own receipt, when the deployment holds a signing key.
   * This is the handoff object: the IDE stores it beside the attested record
   * so the learner can hand a stranger proof that stands without a live
   * platform. Absent when unconfigured — the verdict is still attested (its
   * authority is the re-judging, not the receipt), but there is nothing to hand over.
   */
  receipt: runReceiptSchema.optional(),
});
export type AttestVerdict = z.infer<typeof attestVerdictSchema>;

/* ---------- design attestation (structural verdicts, B-24 for the Studio) ---------- */

/*
 * A design verdict is the structural analogue of a code run receipt: it signs
 * only what a machine can re-derive — the deterministic structural checks over
 * the submitted graph — and never the AI-scored rubric. The rubric weights and
 * any model output are not in this schema by construction, because AI explains
 * and never decides (D-025, "Explicitly not in v2"). Only the platform's own
 * registered canonical checks decide; anything the client claims about its own
 * graph is ignored on the way in.
 */

/** What a connection means on the wire — the same four kinds the Studio engine reads. */
export const designEdgeKindSchema = z.enum(["sync", "async", "replication", "observe"]);

/**
 * The Studio's graph, on the wire. Only fields a structural check reads travel:
 * a node's id/type/props and an edge's endpoints/kind. A node's `type` is a
 * plain string, not an enum — the engine treats a type outside the canonical
 * challenge as inert (it satisfies nothing and forbids nothing), so refusing it
 * here would reject a valid-but-odd submission rather than judge it. Labels and
 * rationale are the learner's own prose, recorded in the IDE ledger and never
 * part of what this endpoint judges or hashes.
 */
export const designGraphSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        type: z.string().min(1).max(40),
        props: z.record(z.string(), z.string().max(120)).default({}),
      })
    )
    .min(1)
    .max(64),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(80),
        to: z.string().min(1).max(80),
        kind: designEdgeKindSchema,
      })
    )
    .max(256),
});
export type DesignGraphWire = z.infer<typeof designGraphSchema>;

/** A design submission names a registered canonical challenge and the graph to judge against it. */
export const designAttestSubmissionSchema = z.object({
  challengeId: z.string().min(1).max(120),
  /** The authored revision the learner's IDE holds. Optional so older IDEs keep
   * working; when present and stale the route refuses rather than misjudges. */
  challengeVersion: z.number().int().min(1).max(1000000).optional(),
  graph: designGraphSchema,
});
export type DesignAttestSubmission = z.infer<typeof designAttestSubmissionSchema>;

/** One re-derived structural verdict: which check, whether it held, why — never a rubric score. */
export const designCheckResultSchema = z.object({
  checkId: z.string().min(1).max(80),
  passed: z.boolean(),
  reason: z.string().min(1).max(1000),
});
export type DesignCheckResult = z.infer<typeof designCheckResultSchema>;

/**
 * What a design receipt signs. `kind: "design"` is the discriminator `/verify`
 * branches on, and it carries no `language`/`command`/`stdout` because nothing
 * ran: a design verdict is pure computation over a graph, which is what keeps
 * it strictly safer than code attestation — no sandbox, no subprocess.
 */
export interface DesignFacts {
  kind: "design";
  challengeId: string;
  graphSha256: string;
  checks: DesignCheckResult[];
  runner: string;
  /** The learner this verdict is bound to. Absent on receipts minted before
   * the binding landed — those verify on their original bytes, unchanged. */
  userId?: string;
}

export const designFactsSchema = z.object({
  kind: z.literal("design"),
  challengeId: z.string().min(1).max(120),
  graphSha256: z.string().regex(/^[0-9a-f]{64}$/),
  checks: z.array(designCheckResultSchema).min(1).max(64),
  runner: z.string().max(40),
  userId: z.string().min(1).max(120).optional(),
});

/** A design receipt: same two-signature shape as a run receipt, over design bytes. */
export interface DesignReceipt {
  v: 1;
  issuedAt: string;
  facts: DesignFacts;
  /** hex HMAC-SHA256 of `designReceiptPayload(facts, issuedAt)`. */
  sig: string;
  /** base64 Ed25519 over the same payload bytes. Absent before the migration. */
  sigEd?: string;
  keyId?: string;
}

export const designReceiptSchema = z.object({
  v: z.literal(1),
  issuedAt: z.string().min(20).max(40),
  facts: designFactsSchema,
  sig: z.string().regex(/^[0-9a-f]{64}$/),
  sigEd: z.string().min(86).max(90).optional(),
  keyId: z.string().min(1).max(64).optional(),
});

/**
 * Deterministic serialization of the signed design facts, hand-built exactly
 * like `runReceiptPayload` so a signed string never depends on key insertion
 * order and both sides agree on the bytes by construction.
 */
export function designReceiptPayload(facts: DesignFacts, issuedAt: string): string {
  return JSON.stringify({
    v: 1,
    // Identity first when bound; omitted entirely when not, so receipts
    // minted before the binding verify on their original bytes.
    ...(facts.userId === undefined ? {} : { userId: facts.userId }),
    kind: "design",
    issuedAt,
    challengeId: facts.challengeId,
    graphSha256: facts.graphSha256,
    checks: facts.checks.map((c) => [c.checkId, c.passed, c.reason]),
    runner: facts.runner,
  });
}

export const designAttestVerdictSchema = z.object({
  provenance: z.literal("attested"),
  outcome: z.string().min(1).max(500),
  checks: z.array(designCheckResultSchema).min(1).max(64),
  /** The authored revision actually judged — the registry's own, so a stranger
   * knows which check set decided this verdict. */
  challengeVersion: z.number().int().min(1).max(1000000),
  /** The design receipt — the handoff object — when this deployment holds a signing key. */
  receipt: designReceiptSchema.optional(),
});
export type DesignAttestVerdict = z.infer<typeof designAttestVerdictSchema>;

/* ---------- incident attestation (debugging labs) ---------- */

/*
 * A debugging lab is judged by the platform, never by the machine the learner
 * works on. The IDE ships the lab — the symptom, the log, the failing tests,
 * the candidate fixes as OPTIONS — and not the answer: the cause the incident is
 * built around, and which option addresses it. So what crosses here is the
 * learner's attempt and nothing else, and the platform judges that attempt
 * against its OWN canonical copy of the labs, exactly as it re-judges a design
 * against its own canonical checks.
 *
 * The same honesty rules as the code and design paths: no model, no rubric
 * weight, no score — only facts a machine can re-derive, and a refusal rather
 * than a guess when the lab is not registered.
 */

/** One step of the learner's own investigation. The order is the order it happened in. */
export const incidentEventSchema = z.object({
  seq: z.number().int().min(0).max(100000),
  kind: z.enum(["hypothesis", "choose-fix", "verify", "defend"]),
  /** For a hypothesis: the learner's own words. Read for presence, never for quality. */
  text: z.string().max(2000).optional(),
  /** For a choose-fix: which candidate the learner picked. */
  fixId: z.string().min(1).max(80).optional(),
  /** For a verify: the host's own note about a run. Never read as a verdict. */
  passed: z.boolean().optional(),
});
export type IncidentEventWire = z.infer<typeof incidentEventSchema>;

/**
 * The attempt: what the learner did, and nothing about whether it was right.
 *
 * The fix they stand behind is not a field: it is the LAST choose-fix event in
 * the log, because the moment they chose it is part of what is judged and a
 * field cannot carry a moment. The platform reads the same log the IDE shows.
 */
export const incidentAttemptSchema = z.object({
  events: z.array(incidentEventSchema).min(1).max(256),
  citedEvidence: z.array(z.string().min(1).max(120)).max(32),
});
export type IncidentAttemptWire = z.infer<typeof incidentAttemptSchema>;

/** A debugging-lab submission names a registered lab and the attempt to judge. */
export const incidentAttestSubmissionSchema = z.object({
  incidentId: z.string().min(1).max(120),
  /** The authored revision of the lab document the learner's IDE holds. Optional so
   *  older IDEs keep working; when present and stale the route refuses rather than
   *  misjudges — the same rule the design route follows. */
  incidentVersion: z.number().int().min(1).max(1000000).optional(),
  attempt: incidentAttemptSchema,
});
export type IncidentAttestSubmission = z.infer<typeof incidentAttestSubmissionSchema>;

/** One re-derived fact about the attempt: which check, whether it held, why. */
export const incidentCheckResultSchema = z.object({
  checkId: z.string().min(1).max(80),
  passed: z.boolean(),
  reason: z.string().min(1).max(1000),
});
export type IncidentCheckResult = z.infer<typeof incidentCheckResultSchema>;

/**
 * What an incident receipt signs. `kind: "incident"` is the discriminator
 * `/verify` branches on, and it carries no code, no stdout and no rubric: an
 * incident verdict is pure computation over the submitted attempt, judged against
 * the platform's own copy of the lab.
 *
 * The attempt's own process claims (that a hypothesis was recorded before the
 * fix) travel inside the attempt and are covered by `attemptSha256`. They are
 * the learner's own account of their own work, exactly as a design graph is; what
 * this receipt adds is the platform's re-derivation of WHICH FIX resolves the
 * incident, which no learner-owned document can decide.
 */
export interface IncidentFacts {
  kind: "incident";
  incidentId: string;
  attemptSha256: string;
  checks: IncidentCheckResult[];
  runner: string;
  /** The learner this verdict is bound to. Absent on receipts minted before the binding landed. */
  userId?: string;
}

export const incidentFactsSchema = z.object({
  kind: z.literal("incident"),
  incidentId: z.string().min(1).max(120),
  attemptSha256: z.string().regex(/^[0-9a-f]{64}$/),
  checks: z.array(incidentCheckResultSchema).min(1).max(16),
  runner: z.string().max(40),
  userId: z.string().min(1).max(120).optional(),
});

/** An incident receipt: same two-signature shape as a run receipt, over the judged attempt. */
export interface IncidentReceipt {
  v: 1;
  issuedAt: string;
  facts: IncidentFacts;
  /** hex HMAC-SHA256 of `incidentReceiptPayload(facts, issuedAt)`. */
  sig: string;
  /** base64 Ed25519 over the same payload bytes. Absent before the migration. */
  sigEd?: string;
  keyId?: string;
}

export const incidentReceiptSchema = z.object({
  v: z.literal(1),
  issuedAt: z.string().min(20).max(40),
  facts: incidentFactsSchema,
  sig: z.string().regex(/^[0-9a-f]{64}$/),
  sigEd: z.string().min(86).max(90).optional(),
  keyId: z.string().min(1).max(64).optional(),
});

/**
 * Deterministic serialization of the signed incident facts, hand-built exactly
 * like `designReceiptPayload` so a signed string never depends on key insertion
 * order and both sides agree on the bytes by construction.
 */
export function incidentReceiptPayload(facts: IncidentFacts, issuedAt: string): string {
  return JSON.stringify({
    v: 1,
    ...(facts.userId === undefined ? {} : { userId: facts.userId }),
    kind: "incident",
    issuedAt,
    incidentId: facts.incidentId,
    attemptSha256: facts.attemptSha256,
    checks: facts.checks.map((c) => [c.checkId, c.passed, c.reason]),
    runner: facts.runner,
  });
}

export const incidentAttestVerdictSchema = z.object({
  provenance: z.literal("attested"),
  outcome: z.string().min(1).max(500),
  checks: z.array(incidentCheckResultSchema).min(1).max(16),
  /** The incident receipt — the handoff object — when this deployment holds a signing key. */
  receipt: incidentReceiptSchema.optional(),
});
export type IncidentAttestVerdict = z.infer<typeof incidentAttestVerdictSchema>;

/* ---------- proofs (verified ledger) ---------- */

/* One synced attested record: which competency, at what level, and the receipt
 * proving it. Either receipt kind travels — the route discriminates on the
 * facts and re-derives that kind's payload before anything is stored. `level`
 * is the IDE's proficiency word, echoed for display; it confers nothing, and
 * the route never upgrades, judges, or re-levels from it. */
export const proofReceiptSchema = z.union([runReceiptSchema, designReceiptSchema, incidentReceiptSchema]);
export type ProofReceipt = z.infer<typeof proofReceiptSchema>;

export const proofSubmitSchema = z.object({
  competencyId: z.string().min(1).max(120),
  level: z.enum(["introduced", "practiced", "demonstrated", "retained"]),
  lastDemonstratedAt: z.string().min(20).max(40).nullable(),
  lastRetrievedAt: z.string().min(20).max(40).nullable(),
  receipt: proofReceiptSchema,
});
export type ProofSubmit = z.infer<typeof proofSubmitSchema>;

export const proofRecordSchema = z.object({
  competencyId: z.string().min(1).max(120),
  level: z.enum(["introduced", "practiced", "demonstrated", "retained"]),
  kind: z.enum(["run", "design", "incident"]),
  issuedAt: z.string().min(20).max(40),
});
export type ProofRecord = z.infer<typeof proofRecordSchema>;

export interface ExecutionCapabilities {
  runner: string;
  languages: string[];
  concurrency: number;
  defaultTimeoutMs: number;
  /** Per-language default wall clock, so clients do not have to guess. */
  defaultTimeoutByLanguage?: Record<string, number>;
  queueDepth?: number;
}

/* ---------- progress (retired) ---------- */

/* The progress service stored browser-classroom state — profiles, diagnostic
   submissions, mission drafts, completions, run history, recommendations,
   summaries. It is deleted with the classroom: the IDE keeps its own local
   state and earns attestation through the execution service, so no platform
   schema carries learner progress anymore. */

/* ---------- execution ---------- */

export const executeFileSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().max(256_000),
});
export const executeLimitsSchema = z.object({
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
  memoryMb: z.number().int().min(16).max(1024).optional(),
  outputKb: z.number().int().min(1).max(1024).optional(),
});
export const executeSchema = z.object({
  /** Languages with a supported runner. */
  language: z.enum(["node", "python", "go"]),
  files: executeFileSchema.array().min(1).max(32),
  command: z.array(z.string().max(200)).min(1).max(8).optional(),
  stdin: z.string().max(64_000).default(""),
  limits: executeLimitsSchema.optional(),
});
export type ExecuteRequest = z.infer<typeof executeSchema>;

/**
 * A structured Go diagnostic, extracted from the compiler's/run's stderr.
 *
 * Why structured: the compiler is the teacher in the language layer. A learner
 * sees `undefined: fmt` on the line and column that caused it, in the editor,
 * not as a wall of text in a terminal pane. Parsing happens server-side so
 * every client shows the same truth.
 */
export interface ExecDiagnostic {
  /** `compile` = the program never ran; `runtime` = it ran and died. */
  kind: "compile" | "runtime";
  /** Path as the learner wrote it (relative to the submission root). */
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
}

export interface ExecuteResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  runner: string;
  /** Go only: structured diagnostics for the editor gutter. */
  diagnostics?: ExecDiagnostic[];
  /** Go only: which phase the run reached. Absent when the language has one. */
  phase?: "compile" | "run";
  /**
   * The platform's signed record of this run, when the service holds a signing
   * key. The IDE forwards it where attestation needs proof the platform ran
   * the code, rather than the client's own word. Omitted when no signing key
   * is configured (development), and then the run cannot be proven.
   */
  receipt?: RunReceipt;
}

/* ---------- tutor (retired) ---------- */

/* The tutor service answered over browser missions — hint ladders keyed by
   mission id. It is deleted with the classroom: no missions, no ladder, no
   ask endpoint. AI may still explain IDE failures inside the IDE; it never
   decides, and there is no platform tutor route anymore. */

/* ---------- billing (Dodo Payments) ---------- */

export const checkoutSchema = z.object({
  plan: z.string().min(1).max(60),
  email: z.string().email().max(254),
  name: z.string().max(80).optional(),
  returnUrl: z.string().url().max(500).optional(),
});
export type CheckoutRequest = z.infer<typeof checkoutSchema>;

export interface PlanInfo {
  slug: string;
  name: string;
}

export interface CheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

/* The customer portal is the provider's own surface, not ours: cancel, card
   update and invoice history live there. We only mint a session link for the
   stored customer. `returnUrl` is optional and only decides where the portal
   sends the learner back. */
export const portalSchema = z.object({
  returnUrl: z.string().url().max(500).optional(),
});
export type PortalRequest = z.infer<typeof portalSchema>;

export interface PortalResponse {
  portalUrl: string;
}

export interface SubscriptionView {
  plan: string | null;
  status: string | null;
  entitled: boolean;
  currentPeriodEnd: string | null;
}

/*
 * Billing's half of a data-subject request.
 *
 * A subscription record is the one category the operator may lawfully keep after
 * an erasure request — tax and accounting law requires the transaction record,
 * and GDPR Art. 17(3)(b) is the exception that says so — so this service's job
 * on a deletion is not to destroy the row but to sever it from the person: the
 * email, the display name and the provider's customer id go, the amounts and
 * dates stay, and the record says plainly that it did.
 */
export interface BillingExport {
  format: "nexora-account-export";
  version: 1;
  generatedAt: string;
  controller: string;
  service: "billing";
  subscription: SubscriptionView & { dodoCustomerId: string | null };
  checkouts: { plan: string; status: string; createdAt: string; paidAt: string | null }[];
  /** Webhook payloads are kept for reconciliation and are summarised here
   * rather than dumped: they are vendor records about a payment, and an export
   * should not become a second copy of the payment provider's logs. */
  webhookEvents: { type: string; receivedAt: string }[];
  notIncluded: { category: string; where: string }[];
}

export const billingEraseSchema = z.object({
  /** The learner the records belong to. Never taken from a body in a public
   * route — only the auth service, over the mesh, may ask for this. */
  userId: z.string().min(1).max(128),
});
export type BillingEraseRequest = z.infer<typeof billingEraseSchema>;

export interface BillingEraseResponse {
  anonymised: boolean;
  retained: { category: string; reason: string; basis: LawfulBasis }[];
}

/* ---------- cohorts: the institutional surface ----------
 *
 * A cohort is a group of learners, in one course, in one term, taught by one
 * instructor, under one licence. The licence is the operator's: a cohort a
 * learner creates is `pending` and entitles nobody, and only the operator can
 * make it `active`. These schemas are the bodies that say so, and the seat
 * check the edge asks over the mesh.
 *
 * The course id is the one thing the auth service cannot check for itself: it
 * does not know the curriculum. The list of shipped courses lives with the
 * curriculum service, which owns the truth, and the verification suite holds
 * the two to each other.
 */

/** The body of a cohort creation. The instructor is the caller, never a field. */
export const cohortCreateSchema = z.object({
  name: z.string().min(1).max(120),
  institution: z.string().min(1).max(120),
  courseId: z.string().min(1).max(64),
  term: z.string().min(1).max(64),
  /** Seats bought. The price is the platform's, not the caller's: there is no
   *  amount on this body, because the platform does not take the money. */
  seats: z.number().int().min(1).max(1000),
});
export type CohortCreateRequest = z.infer<typeof cohortCreateSchema>;

/**
 * The body of a join: the code, and nothing else.
 *
 * The code is a human-typed credential (eight unambiguous characters, the dash
 * is display-only), so it is accepted with or without the dash and in any case.
 * Who is joining is the caller's identity, never a field.
 */
export const cohortJoinSchema = z.object({
  joinCode: z.string().min(1).max(32),
});
export type CohortJoinRequest = z.infer<typeof cohortJoinSchema>;

/**
 * The seat check, gateway to auth over the mesh.
 *
 * The subject is in the body because this route is reached only with the mesh
 * key, by the edge, which has already resolved the identity from the
 * learner's own token. It is never a public surface.
 */
export const seatCheckSchema = z.object({
  userId: z.string().min(1).max(128),
});
export type SeatCheckRequest = z.infer<typeof seatCheckSchema>;

export interface SeatCheckResponse {
  /** True when the learner holds a seat in at least one active cohort. */
  entitled: boolean;
  /** The courses those seats cover. Empty means no seat. */
  courses: string[];
}

/**
 * The operator's confirmation of a licence, over the mesh.
 *
 * The code names the cohort and the seat count says how many seats were bought.
 * Nothing here lets a caller grant a seat to itself: the route is the operator's
 * and is unreachable without the mesh key.
 */
export const cohortActivateSchema = z.object({
  joinCode: z.string().min(1).max(32),
  /** Optional: the cohort's own seat count stands when the operator does not
   *  say otherwise. An operator correcting a seat count says it. */
  seats: z.number().int().min(1).max(1000).optional(),
});
export type CohortActivateRequest = z.infer<typeof cohortActivateSchema>;

/** A cohort as the wire carries it. The join code is in it: it goes on a slide. */
export interface Cohort {
  id: string;
  name: string;
  institution: string;
  courseId: string;
  term: string;
  /** 'pending' | 'active' | 'ended'. Only 'active' carries a seat. */
  status: "pending" | "active" | "ended";
  seats: number;
  perStudentCents: number;
  joinCode: string;
  memberCount: number;
  createdAt: string;
}
