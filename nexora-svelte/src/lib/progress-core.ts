import type {
  LearnerState,
  Mission,
  MissionProgress,
  Profile,
  Proficiency,
} from "./types";
import { COMPETENCIES } from "./curriculum";

/* Pure progress logic — no framework, no browser APIs. Shared by the
   Svelte store (store.svelte.ts) and the Node verification harness. */

export const STORAGE_KEY = "nexora-state-v1";

function defaultProfile(): Profile {
  return {
    name: "",
    goal: "",
    experience: "",
    languages: [],
    tools: [],
    canBuild: "",
    hoursPerWeek: "",
    interests: [],
    completedAt: null,
  };
}

export function defaultState(): LearnerState {
  const competencies: LearnerState["competencies"] = {};
  for (const c of COMPETENCIES) {
    competencies[c.id] = {
      competencyId: c.id,
      level: "unseen",
      evidence: [],
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    version: 1,
    profile: defaultProfile(),
    diagnostic: { completedAt: null, results: [] },
    missions: {},
    competencies,
    xp: 0,
    activeDays: [],
    lastActiveDate: null,
    practiceQueue: [],
    viewedRecommendation: null,
  };
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultMissionProgress(
  missionId: string,
  starterCode: string
): MissionProgress {
  return {
    missionId,
    code: starterCode,
    startedAt: null,
    attempts: 0,
    checksPassed: [],
    hintsUsed: 0,
    maxHintLevel: 0,
    questionsAnswered: {},
    questionsCorrect: {},
    completedAt: null,
    masteredAt: null,
    independent: false,
    xpAwarded: 0,
  };
}

/** Pure completion math (testable): mastery needs clean checks with minimal
    help; heavy assistance or many attempts route to targeted practice. */
export function computeFinalization(
  mission: Mission,
  cur: MissionProgress
): { mastered: boolean; independent: boolean; xpGained: number; needsPractice: boolean } {
  const mastered =
    cur.maxHintLevel <= 1 &&
    cur.attempts <= 3 &&
    (mission.questions ?? []).every((q) => cur.questionsCorrect[q.id]);
  const independent = cur.maxHintLevel <= 3;
  const base = mission.isBoss ? 300 : 50 + 25 * mission.difficulty;
  const bonus = mastered ? (mission.isBoss ? 100 : 50) : 0;
  return {
    mastered,
    independent,
    xpGained: base + bonus,
    needsPractice: !mastered && (cur.maxHintLevel >= 3 || cur.attempts >= 5),
  };
}

const PROFICIENCY_RANK: Proficiency[] = [
  "unseen",
  "introduced",
  "practiced",
  "demonstrated",
  "independent",
  "strong",
];

export function bump(
  competencies: LearnerState["competencies"],
  id: string,
  to: Proficiency,
  note: string
): LearnerState["competencies"] {
  const prev = competencies[id];
  if (!prev) return competencies;
  const next = { ...competencies };
  if (PROFICIENCY_RANK.indexOf(to) > PROFICIENCY_RANK.indexOf(prev.level)) {
    next[id] = {
      ...prev,
      level: to,
      evidence: [...prev.evidence, note].slice(-12),
      updatedAt: new Date().toISOString(),
    };
  } else if (note && !prev.evidence.includes(note)) {
    next[id] = { ...prev, evidence: [...prev.evidence, note].slice(-12) };
  }
  return next;
}
