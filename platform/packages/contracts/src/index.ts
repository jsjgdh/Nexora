import { z } from "zod";

/* Shared API contracts: request schemas (validated at every edge) and
   response shapes. Single source of truth for gateway ↔ services ↔ clients. */

export interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/* ---------- auth ---------- */

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(80).optional(),
});
export type RegisterRequest = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
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

/* ---------- proofs (verified ledger) ---------- */

/* One synced attested record: which competency, at what level, and the receipt
 * proving it. Either receipt kind travels — the route discriminates on the
 * facts and re-derives that kind's payload before anything is stored. `level`
 * is the IDE's proficiency word, echoed for display; it confers nothing, and
 * the route never upgrades, judges, or re-levels from it. */
export const proofReceiptSchema = z.union([runReceiptSchema, designReceiptSchema]);
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
  kind: z.enum(["run", "design"]),
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
