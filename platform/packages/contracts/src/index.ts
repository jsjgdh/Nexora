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

/* ---------- curriculum ---------- */

export interface StageSummary {
  id: string;
  num: number;
  title: string;
  goal: string;
  description: string;
  missionIds: string[];
}

export interface MissionSummary {
  id: string;
  stageId: string;
  title: string;
  tagline: string;
  type: string;
  difficulty: number;
  estMinutes: number;
  objectives: string[];
  prereqIds: string[];
  competencyIds: string[];
  isBoss: boolean;
  needsScript: boolean;
}

export interface CurriculumVersion {
  version: string;
  stages: number;
  missions: number;
  diagnosticItems: number;
}

export interface DiagnosticItemPublic {
  id: string;
  competencyId: string;
  skill: string;
  prompt: string;
  code?: string;
  options: string[];
  explanation: string;
}

/* ---------- run receipts: proof that the platform ran the code ---------- */

/**
 * What the runner observed, exactly as the learner's client received it.
 *
 * These facts are the evidence an execution check reads, so the copy that
 * travels back to the progress service must be the copy the execution service
 * signed — not one the client can edit on the way. `files` binds the run to the
 * submission: the progress service matches the mission's own file against the
 * saved draft, so a receipt cannot be replayed for a different program.
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
}

/**
 * A capability the execution service issues after a run and the progress
 * service accepts at completion. The signature is an HMAC over
 * `runReceiptPayload` keyed by a receipt key derived from the mesh key, so
 * only a service inside the mesh can produce one — a client can forward a
 * receipt, never mint or alter one.
 */
export interface RunReceipt {
  v: 1;
  issuedAt: string;
  facts: RunFacts;
  /** hex HMAC-SHA256 of `runReceiptPayload(facts, issuedAt)`. */
  sig: string;
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
});

export const runReceiptSchema = z.object({
  v: z.literal(1),
  issuedAt: z.string().min(20).max(40),
  facts: runFactsSchema,
  sig: z.string().regex(/^[0-9a-f]{64}$/),
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

export interface ExecutionCapabilities {
  runner: string;
  languages: string[];
  concurrency: number;
  defaultTimeoutMs: number;
  /** Per-language default wall clock, so clients do not have to guess. */
  defaultTimeoutByLanguage?: Record<string, number>;
  queueDepth?: number;
}

/* ---------- progress ---------- */

export const profileSchema = z.object({
  name: z.string().max(80).default(""),
  goal: z.string().max(40).default(""),
  experience: z.string().max(40).default(""),
  languages: z.array(z.string().max(40)).max(30).default([]),
  tools: z.array(z.string().max(40)).max(30).default([]),
  canBuild: z.string().max(500).default(""),
  hoursPerWeek: z.string().max(40).default(""),
  interests: z.array(z.string().max(60)).max(30).default([]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const diagnosticResultSchema = z.object({
  itemId: z.string().min(1).max(80),
  selected: z.number().int().min(-1).max(20),
  correct: z.boolean(),
  skipped: z.boolean(),
});
export const diagnosticSubmitSchema = z.object({
  results: diagnosticResultSchema.array().min(1).max(50),
});
export type DiagnosticSubmit = z.infer<typeof diagnosticSubmitSchema>;

export const runEvidenceSchema = z.object({
  checkId: z.string().min(1).max(80),
  receipt: runReceiptSchema,
});
export type RunEvidenceInput = z.infer<typeof runEvidenceSchema>;

/**
 * Completion carries the run evidence the client holds. The client does not
 * decide execution checks — it only supplies the platform's own records; the
 * progress service recomputes every `runs` check from them.
 */
export const missionCompleteSchema = z
  .object({ runs: runEvidenceSchema.array().max(32).default([]) })
  .default({ runs: [] });
export type MissionCompleteInput = z.infer<typeof missionCompleteSchema>;

export const missionDraftSchema = z.object({
  code: z.string().max(256_000).optional(),
  checksPassed: z.array(z.string().max(80)).max(64).optional(),
  attempts: z.number().int().min(0).max(10_000).optional(),
  hintsUsed: z.number().int().min(0).max(10_000).optional(),
  maxHintLevel: z.number().int().min(0).max(5).optional(),
  questionsAnswered: z.record(z.string(), z.number().int()).optional(),
  questionsCorrect: z.record(z.string(), z.boolean()).optional(),
});
export type MissionDraftInput = z.infer<typeof missionDraftSchema>;

export interface MissionProgressView {
  missionId: string;
  code: string;
  startedAt: string | null;
  attempts: number;
  checksPassed: string[];
  hintsUsed: number;
  maxHintLevel: number;
  questionsAnswered: Record<string, number>;
  questionsCorrect: Record<string, boolean>;
  completedAt: string | null;
  masteredAt: string | null;
  independent: boolean;
  xpAwarded: number;
  contentVersion: string;
}

export interface CompleteResponse {
  completed: boolean;
  mastered: boolean;
  xpGained: number;
  xpTotal: number;
  /** Execution checks this completion *proved*, from the runner's own record. */
  verifiedChecks?: string[];
}

export interface RecommendationResponse {
  primaryId: string | null;
  refresherIds: string[];
  reason: string;
  done: boolean;
}

export interface SummaryResponse {
  xp: number;
  completed: number;
  mastered: number;
  skills: { id: string; name: string; level: string; evidenceCount: number }[];
}

/* ---------- submission history ---------- */

/**
 * A run the learner offers to the record, carrying the platform's own signed
 * report of it. One request holds the execution checks that ran together: a
 * single program is one submission, however many checks read it.
 */
export const runRecordSchema = z.object({
  runs: runEvidenceSchema.array().min(1).max(32),
});
export type RunRecordInput = z.infer<typeof runRecordSchema>;

/**
 * One execution, as the platform recorded it.
 *
 * This is the learner's attempt transcript: what was run, what it printed, and
 * whether it died, kept where a device change cannot lose it. It is a *record*
 * of a run, not a verdict about it — a check still passes only where the
 * completion path recomputes it — which is why no signature travels back out
 * of here. A receipt is a capability: the platform stores what it issued and
 * hands the client a description, never a token it could replay.
 */
export interface RunHistoryEntry {
  id: number;
  missionId: string;
  /** The mission's execution checks this run was offered for. */
  checkIds: string[];
  language: RunFacts["language"];
  command: string[];
  /** The mission's own file, as it ran (the runner's entry path for it). */
  entryPath: string;
  /** sha256 of the file that ran: the learner's code at that moment. */
  entrySha256: string;
  /** sha256 of the draft this service held when the run was recorded. */
  draftSha256: string | null;
  /** Did the program that ran match the draft saved at that moment? */
  matchesSavedDraft: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  phase: RunFacts["phase"];
  diagnostics: ExecDiagnostic[];
  runner: string;
  /** When the runner signed it — the moment the program ran. */
  issuedAt: string;
  /** When this platform recorded it. */
  recordedAt: string;
}

export interface RunHistoryResponse {
  missionId: string;
  /** Newest first, so a transcript reads from the last run backwards. */
  runs: RunHistoryEntry[];
  /** Runs on record for this mission, not just the page returned. */
  total: number;
}

export interface RunRecordResponse {
  missionId: string;
  /** Rows this call added to the history. */
  stored: number;
  /** Runs already on record: re-offering one is idempotent, never a second row. */
  duplicates: number;
  total: number;
  runs: RunHistoryEntry[];
}

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
  /** Languages with a supported runner. `go` is the product's teaching
      language: the language layer's missions run real Go, not a simulation. */
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
   * key. A client forwards it to the progress service at completion, which is
   * how an execution check is decided by the engine that ran the code rather
   * than by the client's own pass list. Omitted when no signing key is
   * configured (development), and then the run cannot be proven — see
   * `POST /missions/:id/complete`.
   */
  receipt?: RunReceipt;
}

/* ---------- tutor ---------- */

export const tutorAskSchema = z.object({
  missionId: z.string().min(1).max(80),
  code: z.string().max(32_000).default(""),
  failingChecks: z.array(z.string().max(300)).max(32).default([]),
  /**
   * The program's own output: compiler diagnostics or a runtime failure.
   *
   * Sent so the tutor can explain the error the learner is actually looking at
   * instead of guessing from the code. The server treats it as data to quote,
   * never as an instruction, and it can only ever describe a real run — the
   * assessment still decides pass or fail.
   */
  errorOutput: z.string().max(4000).default(""),
  hintLevel: z.number().int().min(1).max(5).default(1),
});
export type TutorAskRequest = z.infer<typeof tutorAskSchema>;

export interface TutorAskResponse {
  text: string;
  source: "ai" | "curriculum";
}

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
