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
  | { kind: "scripted"; ops: HarnessOp[]; assertions: HarnessAssert[] };

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
}

export interface Stage {
  id: string;
  num: number;
  title: string;
  goal: string;
  description: string;
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
