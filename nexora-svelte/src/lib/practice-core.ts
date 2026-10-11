import { stageById } from "./curriculum";
import { missionById } from "./missions";

/* The practice log — product principle #3, and the one surface where the
   product refuses to be a scoreboard.

   It exists because a failed check is the most informative thing a learner
   produces, and until now it was overwritten by the next attempt. A record
   here holds: which mission, which requirement, the code at the moment it
   failed, and the engine's own feedback. Nothing is scored, nothing is lost
   when you fix it — a later passing run dates the resolution beside the
   failure rather than deleting it.

   This module is pure: no browser, no framework, no DOM. The Svelte store
   (practice.svelte.ts) owns persistence and the assertion suite drives these
   functions directly, exactly like progress-core.ts. */

export const PRACTICE_STORAGE_KEY = "nexora-practice-v1";

/* Retention rule, stated rather than discovered: the log keeps the 40 most
   recent records and rotates out cleared work before open work. An open
   mistake is never dropped while a resolved one is still on the list, so the
   log can never quietly forget something the learner has not beaten yet. */
export const PRACTICE_CAP = 40;

/** Window used by "what beat you this week" phrasing. */
export const PRACTICE_WINDOW_DAYS = 7;

export interface FailedCheck {
  checkId: string;
  label: string;
  message: string;
}

export interface Mistake {
  /** Stable key: `${missionId}::${checkId}`. One record per requirement. */
  id: string;
  missionId: string;
  checkId: string;
  label: string;
  /** The engine's feedback verbatim — it points at the gap, never the answer. */
  message: string;
  /** The learner's code at the most recent failure. */
  code: string;
  firstFailedAt: string;
  lastFailedAt: string;
  /** How many times this requirement has beaten them. */
  failures: number;
  /** Null while open. A record is never removed by fixing it, only dated. */
  resolvedAt: string | null;
  /** The code that finally beat it — the second, passing run. */
  resolvedCode: string | null;
}

export interface PracticeState {
  version: 1;
  mistakes: Mistake[];
}

export function mistakeId(missionId: string, checkId: string): string {
  return `${missionId}::${checkId}`;
}

export function emptyPractice(): PracticeState {
  return { version: 1, mistakes: [] };
}

/**
 * Tolerant load. A practice log is the learner's own working record, so a
 * malformed one is normalised rather than thrown away: unknown fields are
 * dropped, missing ones are defaulted, and anything without an id or a
 * mission is discarded.
 */
export function normalizePractice(raw: unknown): PracticeState {
  if (!raw || typeof raw !== "object") return emptyPractice();
  const list = (raw as { mistakes?: unknown }).mistakes;
  if (!Array.isArray(list)) return emptyPractice();
  const mistakes: Mistake[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Partial<Mistake>;
    if (typeof m.missionId !== "string" || typeof m.checkId !== "string") continue;
    const at = typeof m.lastFailedAt === "string" ? m.lastFailedAt : new Date(0).toISOString();
    mistakes.push({
      id: typeof m.id === "string" ? m.id : mistakeId(m.missionId, m.checkId),
      missionId: m.missionId,
      checkId: m.checkId,
      label: typeof m.label === "string" ? m.label : m.checkId,
      message: typeof m.message === "string" ? m.message : "",
      code: typeof m.code === "string" ? m.code : "",
      firstFailedAt: typeof m.firstFailedAt === "string" ? m.firstFailedAt : at,
      lastFailedAt: at,
      failures: typeof m.failures === "number" && m.failures > 0 ? Math.floor(m.failures) : 1,
      resolvedAt: typeof m.resolvedAt === "string" ? m.resolvedAt : null,
      resolvedCode: typeof m.resolvedCode === "string" ? m.resolvedCode : null,
    });
  }
  return { version: 1, mistakes: rotate(mistakes) };
}

/**
 * Retention: open records first (most recently beaten first), then cleared
 * ones (most recently cleared first), truncated to the cap. Sorting by
 * open-ness before recency is what makes the rule a guarantee rather than a
 * hope — 40 resolved records can never push out the one open mistake.
 */
export function rotate(mistakes: Mistake[], cap = PRACTICE_CAP): Mistake[] {
  const byOpenThenRecency = (a: Mistake, b: Mistake): number => {
    const aOpen = a.resolvedAt === null ? 0 : 1;
    const bOpen = b.resolvedAt === null ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (aOpen === 1) return (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "");
    return b.lastFailedAt.localeCompare(a.lastFailedAt);
  };
  return [...mistakes].sort(byOpenThenRecency).slice(0, cap);
}

/**
 * Fold one attempt's verdicts into the log: every failed check is recorded
 * (or its existing record updated and counted), every passed check dates a
 * resolution. Failing something already cleared re-opens it — that is not a
 * punishment, it is the record telling the truth.
 */
export function observe(
  state: PracticeState,
  input: { missionId: string; code: string; at: string; failed: FailedCheck[]; passed: string[] }
): PracticeState {
  if (input.failed.length === 0 && input.passed.length === 0) return state;
  const byId = new Map(state.mistakes.map((m) => [m.id, m]));
  for (const f of input.failed) {
    const id = mistakeId(input.missionId, f.checkId);
    const prev = byId.get(id);
    byId.set(id, {
      id,
      missionId: input.missionId,
      checkId: f.checkId,
      label: f.label,
      message: f.message,
      code: input.code,
      firstFailedAt: prev?.firstFailedAt ?? input.at,
      lastFailedAt: input.at,
      failures: (prev?.failures ?? 0) + 1,
      // A regression is live again; the earlier resolution stays in the code
      // history if it was ever stored, but the record is honestly open.
      resolvedAt: null,
      resolvedCode: null,
    });
  }
  for (const checkId of input.passed) {
    const id = mistakeId(input.missionId, checkId);
    const prev = byId.get(id);
    if (!prev || prev.resolvedAt !== null) continue;
    byId.set(id, { ...prev, resolvedAt: input.at, resolvedCode: input.code });
  }
  return { version: 1, mistakes: rotate([...byId.values()]) };
}

/** Open records, most recently beaten first. */
export function openMistakes(state: PracticeState): Mistake[] {
  return state.mistakes
    .filter((m) => m.resolvedAt === null)
    .sort((a, b) => b.lastFailedAt.localeCompare(a.lastFailedAt));
}

/** Cleared records, most recently cleared first. */
export function resolvedMistakes(state: PracticeState): Mistake[] {
  return state.mistakes
    .filter((m) => m.resolvedAt !== null)
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
}

/** Everything that beat the learner inside the window, open or since cleared. */
export function beatenThisWeek(
  state: PracticeState,
  now: Date = new Date(),
  days = PRACTICE_WINDOW_DAYS
): Mistake[] {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return state.mistakes
    .filter((m) => m.lastFailedAt >= since)
    .sort((a, b) => b.lastFailedAt.localeCompare(a.lastFailedAt));
}

export interface PracticeSummary {
  open: number;
  cleared: number;
  thisWeek: number;
  /** Open records across more than one stage — i.e. worth mixing. */
  stages: number;
}

/** The bucket a record belongs to when a session is being mixed. */
function stageKey(m: Mistake): string {
  const mission = missionById(m.missionId);
  return mission ? (stageById(mission.stageId)?.id ?? mission.stageId) : m.missionId;
}

export function practiceSummary(
  state: PracticeState,
  now: Date = new Date()
): PracticeSummary {
  const open = openMistakes(state);
  const stages = new Set(open.map(stageKey));
  return {
    open: open.length,
    cleared: resolvedMistakes(state).length,
    thisWeek: beatenThisWeek(state, now).length,
    stages: stages.size,
  };
}

/**
 * A session: `n` past mistakes, newest first, round-robined across stages and
 * missions so a session is varied rather than five variations of the same
 * mistake. Open records come first; a session only reaches into cleared ones
 * when there is not enough open work to fill it (practice is allowed to be
 * revisiting something, never required to be).
 */
export function practiceSet(state: PracticeState, n = 5): Mistake[] {
  /** Round-robin one pool across its stages, appending into `out`. */
  const fill = (pool: Mistake[], out: Mistake[]): void => {
    const buckets = new Map<string, Mistake[]>();
    for (const m of pool) {
      const key = stageKey(m);
      const list = buckets.get(key) ?? [];
      list.push(m);
      buckets.set(key, list);
    }
    let progressed = true;
    while (out.length < n && progressed) {
      progressed = false;
      for (const list of buckets.values()) {
        const next = list.shift();
        if (!next) continue;
        out.push(next);
        progressed = true;
        if (out.length === n) break;
      }
    }
  };
  // Open work fills the session; cleared work is only reached to top it up.
  const out: Mistake[] = [];
  fill(openMistakes(state), out);
  if (out.length < n) fill(resolvedMistakes(state), out);
  return out;
}

/**
 * The copy this surface is allowed to use. Exported (rather than living only in
 * a template) so the suite can assert the product constraint — mistakes are the
 * work, never a score against the learner, and no break is punished.
 */
export const PRACTICE_COPY = {
  kicker: "practice log",
  heading: "What beat you, and what you do about it",
  promise:
    "Every requirement that turned you back is written down here with the code you had at the time. Nothing is scored. Clearing one does not erase it — a second, passing run is recorded beside the first.",
  emptyTitle: "Nothing has beaten you yet",
  emptyBody:
    "That is a fine place to be. When a check requests changes, its requirement, your code and the reason land here so you can come back to it deliberately.",
  retention:
    "The log keeps your 40 most recent records and rotates cleared work out before open work — an open requirement is never dropped.",
  itemVerb: "Practise this",
  clearedLabel: "cleared",
  openLabel: "open",
  /** The page's search-result description: the promise, short enough to be read
      whole rather than cut off by a crawler. Guarded with the rest of the copy. */
  metaDescription:
    "Every requirement that turned you back, with the code you had at the time — and a way to practise it. Nothing is scored.",
} as const;

/** Words this surface may never use. Kept next to the copy it polices. */
export const PRACTICE_BANNED_WORDS: string[] = [
  "failed",
  "failure",
  "wrong",
  "mistake",
  "punish",
  "lazy",
  "should have",
  "too late",
  "streak broken",
  "lost",
];
