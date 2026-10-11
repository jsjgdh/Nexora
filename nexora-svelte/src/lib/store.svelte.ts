import { browser } from "$app/environment";
import type {
  DiagnosticResult,
  LearnerState,
  MissionReflection,
  MissionProgress,
  Profile,
} from "./types";
import { DIAGNOSTIC_ITEMS } from "./diagnostic";
import { missionById } from "./missions";
import {
  STORAGE_KEY,
  bump,
  computeFinalization,
  defaultMissionProgress,
  defaultState,
  normalizeReflections,
  todayKey,
} from "./progress-core";

/* Reactive progress store (Svelte 5 runes). Single module-level instance is
   shared across all routes client-side; progress persists to localStorage
   under the same keys as the React build, so learners keep their progress.
   Learner-driven changes also notify onChange subscribers — the cloud sync
   engine uses this to push drafts, completions, and profile updates. */

export type ProgressEvent =
  | { kind: "profile" }
  | { kind: "diagnostic" }
  | { kind: `mission:${string}` };

class ProgressStore {
  state = $state<LearnerState>(defaultState());
  loaded = $state(false);
  private listeners = new Set<(e: ProgressEvent) => void>();

  constructor() {
    if (!browser) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LearnerState;
        if (parsed && parsed.version === 1) {
          this.state = normalizeReflections(parsed);
        }
      }
    } catch {
      /* corrupted storage → start fresh */
    }
    // Forgiving active-day tracking (never punishes missed days).
    const today = todayKey();
    if (this.state.lastActiveDate !== today) {
      const activeDays = this.state.activeDays.includes(today)
        ? this.state.activeDays
        : [...this.state.activeDays.slice(-60), today];
      this.state = { ...this.state, activeDays, lastActiveDate: today };
    }
    this.persist();
    this.loaded = true;
  }

  private persist(event?: ProgressEvent) {
    if (!browser) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage full/blocked → session-only */
    }
    if (event) {
      for (const l of [...this.listeners]) l(event);
    }
  }

  /** Subscribe to learner-driven changes. Sync adoptions never notify —
      pulling server state must never re-trigger a push. */
  onChange(fn: (e: ProgressEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Replace the whole state with a merged/cloud result, silently. */
  adopt(next: LearnerState) {
    this.state = next;
    this.persist();
  }

  private cur(missionId: string): MissionProgress {
    return (
      this.state.missions[missionId] ??
      defaultMissionProgress(missionId, missionById(missionId)?.starterCode ?? "")
    );
  }

  private setCur(missionId: string, next: MissionProgress) {
    this.state = {
      ...this.state,
      missions: { ...this.state.missions, [missionId]: next },
    };
  }

  saveProfile(p: Partial<Profile> & { completedAt?: string | null }) {
    this.state = { ...this.state, profile: { ...this.state.profile, ...p } };
    this.persist({ kind: "profile" });
  }

  saveDiagnostic(results: DiagnosticResult[]) {
    let competencies = this.state.competencies;
    const assessed = new Set(
      results
        .filter((r) => !r.skipped)
        .map((r) => DIAGNOSTIC_ITEMS.find((d) => d.id === r.itemId)?.competencyId)
        .filter((x): x is string => !!x)
    );
    for (const id of assessed) {
      competencies = bump(competencies, id, "introduced", "Assessed in onboarding diagnostic");
    }
    this.state = {
      ...this.state,
      diagnostic: { completedAt: new Date().toISOString(), results },
      competencies,
    };
    this.persist({ kind: "diagnostic" });
  }

  progressOf(missionId: string): MissionProgress {
    return this.cur(missionId);
  }

  touchMission(missionId: string) {
    const cur = this.cur(missionId);
    if (cur.startedAt) return;
    this.setCur(missionId, { ...cur, startedAt: new Date().toISOString() });
    this.persist({ kind: `mission:${missionId}` });
  }

  saveCode(missionId: string, code: string) {
    const cur = this.cur(missionId);
    if (cur.code === code) return;
    this.setCur(missionId, { ...cur, code });
    this.persist({ kind: `mission:${missionId}` });
  }

  /** Keep reflection beside the local draft without sending it to cloud sync. */
  saveReflection(missionId: string, field: keyof MissionReflection, value: string) {
    const cur = this.cur(missionId);
    const reflection = cur.reflection ?? { expected: "", observed: "", nextChange: "" };
    if (reflection[field] === value) return;
    this.setCur(missionId, {
      ...cur,
      reflection: { ...reflection, [field]: value },
    });
    this.persist();
  }

  recordAttempt(missionId: string, passedCheckIds: string[]) {
    const cur = this.cur(missionId);
    this.setCur(missionId, {
      ...cur,
      attempts: cur.attempts + 1,
      checksPassed: passedCheckIds,
      startedAt: cur.startedAt ?? new Date().toISOString(),
    });
    this.persist({ kind: `mission:${missionId}` });
  }

  recordHint(missionId: string, level: number) {
    const cur = this.cur(missionId);
    this.setCur(missionId, {
      ...cur,
      hintsUsed: cur.hintsUsed + 1,
      maxHintLevel: Math.max(cur.maxHintLevel, level),
      startedAt: cur.startedAt ?? new Date().toISOString(),
    });
    this.persist({ kind: `mission:${missionId}` });
  }

  answerQuestion(missionId: string, questionId: string, selected: number): boolean {
    const mission = missionById(missionId);
    const q = mission?.questions?.find((x) => x.id === questionId);
    const correct = q ? q.answer === selected : false;
    const cur = this.cur(missionId);
    this.setCur(missionId, {
      ...cur,
      questionsAnswered: { ...cur.questionsAnswered, [questionId]: selected },
      questionsCorrect: { ...cur.questionsCorrect, [questionId]: correct },
      startedAt: cur.startedAt ?? new Date().toISOString(),
    });
    this.persist({ kind: `mission:${missionId}` });
    return correct;
  }

  finalizeMission(missionId: string): { completed: boolean; mastered: boolean; xpGained: number } {
    const mission = missionById(missionId);
    if (!mission) return { completed: false, mastered: false, xpGained: 0 };
    const cur = this.cur(missionId);
    if (cur.completedAt) return { completed: false, mastered: false, xpGained: 0 };
    const { mastered, independent, xpGained, needsPractice } = computeFinalization(mission, cur);
    const stamp = new Date().toISOString();
    const note = `${mastered ? "Mastered" : "Completed"} “${mission.title}” (${stamp.slice(0, 10)})`;
    let competencies = this.state.competencies;
    for (const cid of mission.competencyIds) {
      competencies = bump(
        competencies,
        cid,
        mastered ? "independent" : independent ? "demonstrated" : "practiced",
        note
      );
    }
    this.setCur(missionId, {
      ...cur,
      completedAt: stamp,
      masteredAt: mastered ? stamp : null,
      independent,
      xpAwarded: xpGained,
    });
    this.state = {
      ...this.state,
      xp: this.state.xp + xpGained,
      competencies,
      practiceQueue: needsPractice
        ? Array.from(new Set([...this.state.practiceQueue, missionId]))
        : this.state.practiceQueue,
    };
    this.persist({ kind: `mission:${missionId}` });
    return { completed: true, mastered, xpGained };
  }

  resetAll() {
    if (browser) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    this.state = defaultState();
    this.persist();
  }
}

export const progress = new ProgressStore();
