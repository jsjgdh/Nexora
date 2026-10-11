/* NEXORA core data model.
   Curriculum is a directed graph (stages, missions, competencies, prerequisites).
   The roadmap is a visual representation of this graph, never the source of truth. */

export type MissionType =
  | "concept"
  | "prediction"
  | "practice"
  | "build"
  | "debugging"
  | "review"
  | "project"
  | "recall"
  | "assessment";

export type NodeState =
  | "locked"
  | "available"
  | "recommended"
  | "in-progress"
  | "completed"
  | "mastered"
  | "needs-practice"
  | "optional";

export type Proficiency =
  | "unseen"
  | "introduced"
  | "practiced"
  | "demonstrated"
  | "independent"
  | "strong";

/* ---------- Declarative assessment rules ----------
   Checks are data, not code. The engine in lib/checks.ts interprets them
   against the learner's document with DOMParser — deterministic, no LLM. */

export type CheckRule =
  | { kind: "has-element"; selector: string }
  | { kind: "missing-element"; selector: string }
  | { kind: "count-min"; selector: string; min: number }
  | { kind: "count-exact"; selector: string; exact: number }
  | { kind: "text-match"; selector: string; pattern: string }
  | { kind: "doc-text-match"; pattern: string }
  | { kind: "attr-match"; selector: string; attr: string; pattern: string }
  | { kind: "nested"; child: string; ancestor: string }
  | { kind: "labeled-inputs" }
  | { kind: "no-placeholder-links" }
  /** Regex against the concatenated text of all <style> elements. */
  | { kind: "style-text-match"; pattern: string }
  /** Regex against the live computed style of the first matching element.
      Requires the rendered preview document (scripts never run there). */
  | { kind: "computed-style"; selector: string; property: string; pattern: string }
  /** Interactive test: drive the rendered page via the sandbox harness
      (clicks, input, function calls, reads) and assert on observations.
      Assessment logic runs parent-side; the frame returns raw observations. */
  | { kind: "scripted"; ops: HarnessOp[]; assertions: HarnessAssert[] }
  /** Runs the learner's program for real, then asserts on what it did.
      The program is executed by the platform's runner service (never in the
      browser): stdout, exit code, and the compiler's own diagnostics are the
      evidence. Absent a completed run, the check fails closed. */
  | {
      kind: "runs";
      language: RunLanguage;
      /** Extra files the learner does not write (fixtures), merged with theirs. */
      harness?: { path: string; content: string }[];
      /** Entry file the runner executes. Defaults to the mission's file. */
      entry?: string;
      stdin?: string;
      assertions: RunAssert[];
    };

/**
 * Languages the platform runner can execute.
 *
 * `go` is the teaching language: the language layer's missions are real Go
 * programs. `node` exists for *scenarios* — missions where the learner repairs
 * a small repository and the evidence is a test suite that runs against their
 * work. The suite is supplied by the mission (a fixture the learner cannot
 * edit), so the verdict is the real runner's, never the client's.
 */
export type RunLanguage = "go" | "node";

/**
 * One requirement on a real execution. Deliberately small: a teaching check
 * should read like a sentence — "printing 42 exits cleanly".
 */
export interface RunAssert {
  target: "stdout" | "stderr" | "exitCode" | "diagnostics";
  /** Text targets: exact match after trimming ("42"). */
  equals?: string;
  /** Text targets: regular expression, case-insensitive. */
  matches?: string;
  /** exitCode: the status the program must exit with (default 0). */
  code?: number;
  /** diagnostics: the phase the run must have reached. */
  phase?: "compile" | "run";
  /** diagnostics: the kind of diagnostic that must be present. */
  kind?: "compile" | "runtime";
  /** Invert: the assertion holds when nothing matches. */
  not?: boolean;
}

/** One submitted file, as the execution service hashed it. The hash is what
    ties a run to the program it ran, so a receipt cannot be replayed against
    a different submission. */
export interface RunFileHash {
  path: string;
  sha256: string;
}

/** What the runner observed, exactly as this client received it. The progress
    service recomputes execution checks from these facts rather than from the
    client's pass list, so they must travel back unedited. */
export interface RunFacts {
  language: string;
  command: string[];
  files: RunFileHash[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  phase: "compile" | "run" | null;
  diagnostics: RunDiagnostic[];
  runner: string;
}

/**
 * The platform's signed record of one run.
 *
 * The client can forward this and nothing more: the signature is an HMAC only
 * a service inside the platform mesh can produce, so a client cannot invent or
 * alter the evidence a mission is completed on. It is a capability, not learner
 * state — it is not persisted as progress and is dropped once it is spent.
 */
export interface RunReceipt {
  v: 1;
  issuedAt: string;
  facts: RunFacts;
  sig: string;
}

/** A receipt offered for one check. `receipt` is null when the run produced
    none (local mode, no platform, or a signing key the service does not hold). */
export interface RunReceiptClaim {
  checkId: string;
  receipt: RunReceipt | null;
}

/** What a single execution produced. The runner's own vocabulary, verbatim. */
export interface RunOutcome {
  /** True only when the program actually ran and the service answered. */
  ran: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  diagnostics: RunDiagnostic[];
  phase: "compile" | "run" | null;
  durationMs: number | null;
  /** Account runs left today according to the execution service, when known. */
  quotaRemaining?: number;
  /** Why the run could not happen. Present only when `ran` is false. */
  error?: string;
  /** True when the failure was environmental (no runner, no quota). */
  unavailable?: boolean;
  /**
   * The platform's signed record of this run, when the platform signed it.
   *
   * Absent in local mode (no platform at all) and when the service holds no
   * signing key. A mission whose checks execute the learner's program cannot be
   * completed without one — the server recomputes those checks from this record
   * and refuses a client-reported pass, so "no receipt" means "not proven",
   * never "assume passed".
   */
  receipt?: RunReceipt | null;
}

export interface RunDiagnostic {
  kind: "compile" | "runtime";
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
}

export interface CheckDef {
  id: string;
  label: string;
  /** Actionable feedback shown when the check fails — never reveals the answer outright. */
  feedback: string;
  rule: CheckRule;
}

export interface LessonBlock {
  kind: "objectives" | "prose" | "example" | "task" | "reference";
  /** Minimal markdown (headings ####, **bold**, `code`, fenced blocks, lists). */
  body: string;
  code?: string;
  codeCaption?: string;
}

export interface Mission {
  id: string;
  stageId: string;
  title: string;
  tagline: string;
  type: MissionType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estMinutes: number;
  objectives: string[];
  prereqIds: string[];
  competencyIds: string[];
  whyItMatters: string;
  /** Ordered lesson content: orient → understand → attempt. */
  lesson: LessonBlock[];
  starterCode: string;
  /** Files shown in the workspace. Exactly one is editable; fixture content is read-only. */
  files?: MissionFile[];
  /** Empty for pure concept/prediction missions (assessed via inline questions). */
  checks: CheckDef[];
  /** Level 1 nudge → Level 5 solution review (transfer follow-up included). */
  hintLadder: [string, string, string, string, string];
  misconceptions: string[];
  completionNote: string;
  masteryNote: string;
  /** Inline knowledge/prediction questions embedded in the mission flow. */
  questions?: MissionQuestion[];
  isBoss?: boolean;
  isOptional?: boolean;
  /** True when the mission's page must execute JavaScript. The workspace then
      sandboxes the preview with allow-scripts (opaque origin: scripts run but
      the frame cannot reach the parent) and assesses behavior via the harness
      protocol instead of direct DOM access. */
  needsScript?: boolean;
  /**
   * The file the learner's editor represents. Defaults to `index.html` for web
   * missions; code missions name their real file (e.g. `main.go`) because a Go
   * program's filename is part of what a beginner is learning, and a scenario
   * names the path it lives at in the repository (`src/task.js`).
   */
  fileName?: string;
  /** Editor/diagnostic language. Defaults to `html`. */
  language?: "html" | "go" | "node";
}

export interface MissionFile {
  path: string;
  content: string;
  editable: boolean;
}

export interface MissionQuestion {
  id: string;
  prompt: string;
  code?: string;
  options: string[];
  answer: number;
  explanation: string;
}

/* ---------- Sandbox harness protocol (scripted rules) ---------- */

export interface HarnessOp {
  id: string;
  act: "click" | "fill" | "call" | "read" | "wait";
  selector?: string;
  /** fill: value to type; call: JSON-able args live here instead */
  value?: string;
  /** call: name of a global function in the learner page */
  fn?: string;
  args?: unknown[];
  /** read: which observation to take */
  prop?: "text" | "value" | "exists" | "count" | "attr";
  attr?: string;
  /** wait: milliseconds (capped by the driver) */
  ms?: number;
}

export interface HarnessObs {
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface HarnessAssert {
  op: string;
  equals?: unknown;
  matches?: string;
  truthy?: boolean;
  /** Passes iff the op FAILED and its error matches (e.g. expected rejection). */
  expectError?: string;
}

/* ---------- The path's four layers ----------
   The order a real beginner actually needs, confirmed with the user:
   understand software → learn one language → learn to reason about data and
   algorithms → then apply it in a track. Specialisation is the LAST decision,
   never the first: you do not pick a career before you can write a loop. */

export type LayerId = "orientation" | "language" | "dsa" | "application";

export interface Layer {
  id: LayerId;
  num: number;
  /** Short label used in wayfinding ("Foundations"). */
  title: string;
  /** The layer's heading in full ("Language foundations"). */
  heading: string;
  claim: string;
  /** Why this layer sits exactly here in the path. */
  rationale: string;
}

/** A language and the stages that teach it. Several tracks can share a layer. */
export interface Track {
  id: string;
  name: string;
  /** The language this track is written in, or "web" for the platform stack. */
  language: string;
  layerId: LayerId;
  blurb: string;
}

export interface Stage {
  id: string;
  num: number;
  title: string;
  goal: string;
  description: string;
  /** Which of the four layers this stage belongs to. */
  layerId: LayerId;
  /** Track id this stage teaches in (see TRACKS). */
  trackId: string;
  /** Canonical order of the main path. Boss challenge is last. */
  missionIds: string[];
}

export interface Competency {
  id: string;
  name: string;
  domain: string;
  description: string;
  proficientLooksLike: string;
}

export interface DiagnosticItem {
  id: string;
  /** Which layer this item probes. Omitted means "application" — the original
      six items all test the web track. */
  layerId?: LayerId;
  competencyId: string;
  /** Short label shown in results, e.g. "HTML structure". */
  skill: string;
  prompt: string;
  code?: string;
  options: string[];
  answer: number;
  explanation: string;
}

/* ---------- Learner state (persisted to localStorage) ---------- */

export interface MissionProgress {
  missionId: string;
  /** draft code, autosaved */
  code: string;
  /** Post-run reflection is device-local and deliberately excluded from cloud drafts. */
  reflection?: MissionReflection;
  startedAt: string | null;
  attempts: number;
  checksPassed: string[];
  hintsUsed: number;
  /** highest hint level revealed (1-5) */
  maxHintLevel: number;
  questionsAnswered: Record<string, number>;
  questionsCorrect: Record<string, boolean>;
  completedAt: string | null;
  masteredAt: string | null;
  /** completed without level-4+ hints → counts as independent evidence */
  independent: boolean;
  xpAwarded: number;
}

export interface MissionReflection {
  expected: string;
  observed: string;
  nextChange: string;
}

export interface CompetencyEvidence {
  competencyId: string;
  level: Proficiency;
  evidence: string[];
  updatedAt: string;
}

export interface DiagnosticResult {
  itemId: string;
  /** selected option index, or -1 for skipped */
  selected: number;
  correct: boolean;
  skipped: boolean;
}

export interface Profile {
  name: string;
  goal: string;
  experience: string;
  languages: string[];
  tools: string[];
  canBuild: string;
  hoursPerWeek: string;
  interests: string[];
  completedAt: string | null;
}

export interface LearnerState {
  version: 1;
  profile: Profile;
  diagnostic: {
    completedAt: string | null;
    results: DiagnosticResult[];
  };
  missions: Record<string, MissionProgress>;
  competencies: Record<string, CompetencyEvidence>;
  xp: number;
  activeDays: string[];
  lastActiveDate: string | null;
  /** mission ids the engine flagged for targeted practice */
  practiceQueue: string[];
  viewedRecommendation: string | null;
}
