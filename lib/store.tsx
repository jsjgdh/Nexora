"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  DiagnosticResult,
  LearnerState,
  Mission,
  MissionProgress,
  Profile,
  Proficiency,
} from "./types";
import { COMPETENCIES } from "./curriculum";
import { DIAGNOSTIC_ITEMS } from "./diagnostic";
import { missionById } from "./missions";

const STORAGE_KEY = "nexora-state-v1";

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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultMissionProgress(missionId: string, starterCode: string): MissionProgress {
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

interface Store {
  state: LearnerState;
  loaded: boolean;
  saveProfile: (p: Partial<Profile> & { completedAt?: string | null }) => void;
  saveDiagnostic: (results: DiagnosticResult[]) => void;
  progressOf: (missionId: string) => MissionProgress;
  touchMission: (missionId: string) => void;
  saveCode: (missionId: string, code: string) => void;
  recordAttempt: (missionId: string, passedCheckIds: string[]) => void;
  recordHint: (missionId: string, level: number) => void;
  answerQuestion: (missionId: string, questionId: string, selected: number) => boolean;
  finalizeMission: (missionId: string) => { completed: boolean; mastered: boolean; xpGained: number };
  resetAll: () => void;
}

const Ctx = createContext<Store | null>(null);

const PROFICIENCY_RANK: Proficiency[] = [
  "unseen",
  "introduced",
  "practiced",
  "demonstrated",
  "independent",
  "strong",
];

function bump(
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

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LearnerState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  // Synchronous mirror: lets actions compute results from the latest state
  // immediately (setState updaters run asynchronously on next render).
  const stateRef = React.useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LearnerState;
        if (parsed && parsed.version === 1) {
          setState(parsed);
        }
      }
    } catch {
      /* corrupted storage → start fresh */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Track forgiving active-day streak (never punishes missed days).
    setState((prev) => {
      const today = todayKey();
      if (prev.lastActiveDate === today) return prev;
      const activeDays = prev.activeDays.includes(today)
        ? prev.activeDays
        : [...prev.activeDays.slice(-60), today];
      const next = { ...prev, activeDays, lastActiveDate: today };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full/blocked → session-only */
      }
      return next;
    });
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, loaded]);

  const saveProfile = useCallback((p: Partial<Profile> & { completedAt?: string | null }) => {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...p } }));
  }, []);

  const saveDiagnostic = useCallback((results: DiagnosticResult[]) => {
    setState((prev) => {
      let competencies = prev.competencies;
      const assessed = new Set(
        results
          .filter((r) => !r.skipped)
          .map((r) => DIAGNOSTIC_ITEMS.find((d) => d.id === r.itemId)?.competencyId)
          .filter((x): x is string => !!x)
      );
      for (const id of assessed) {
        competencies = bump(competencies, id, "introduced", "Assessed in onboarding diagnostic");
      }
      return {
        ...prev,
        diagnostic: { completedAt: new Date().toISOString(), results },
        competencies,
      };
    });
  }, []);

  const progressOf = useCallback(
    (missionId: string): MissionProgress => {
      const existing = state.missions[missionId];
      if (existing) return existing;
      const mission = missionById(missionId);
      return defaultMissionProgress(missionId, mission?.starterCode ?? "");
    },
    [state.missions]
  );

  const touchMission = useCallback((missionId: string) => {
    setState((prev) => {
      const cur =
        prev.missions[missionId] ??
        defaultMissionProgress(missionId, missionById(missionId)?.starterCode ?? "");
      if (cur.startedAt) return prev;
      return {
        ...prev,
        missions: {
          ...prev.missions,
          [missionId]: { ...cur, startedAt: new Date().toISOString() },
        },
      };
    });
  }, []);

  const saveCode = useCallback((missionId: string, code: string) => {
    setState((prev) => {
      const cur =
        prev.missions[missionId] ??
        defaultMissionProgress(missionId, missionById(missionId)?.starterCode ?? "");
      if (cur.code === code) return prev;
      return {
        ...prev,
        missions: { ...prev.missions, [missionId]: { ...cur, code } },
      };
    });
  }, []);

  const recordAttempt = useCallback((missionId: string, passedCheckIds: string[]) => {
    setState((prev) => {
      const cur =
        prev.missions[missionId] ??
        defaultMissionProgress(missionId, missionById(missionId)?.starterCode ?? "");
      return {
        ...prev,
        missions: {
          ...prev.missions,
          [missionId]: {
            ...cur,
            attempts: cur.attempts + 1,
            checksPassed: passedCheckIds,
            startedAt: cur.startedAt ?? new Date().toISOString(),
          },
        },
      };
    });
  }, []);

  const recordHint = useCallback((missionId: string, level: number) => {
    setState((prev) => {
      const cur =
        prev.missions[missionId] ??
        defaultMissionProgress(missionId, missionById(missionId)?.starterCode ?? "");
      return {
        ...prev,
        missions: {
          ...prev.missions,
          [missionId]: {
            ...cur,
            hintsUsed: cur.hintsUsed + 1,
            maxHintLevel: Math.max(cur.maxHintLevel, level),
            startedAt: cur.startedAt ?? new Date().toISOString(),
          },
        },
      };
    });
  }, []);

  const answerQuestion = useCallback(
    (missionId: string, questionId: string, selected: number): boolean => {
      const mission = missionById(missionId);
      const q = mission?.questions?.find((x) => x.id === questionId);
      const correct = q ? q.answer === selected : false;
      setState((prev) => {
        const cur =
          prev.missions[missionId] ??
          defaultMissionProgress(missionId, mission?.starterCode ?? "");
        return {
          ...prev,
          missions: {
            ...prev.missions,
            [missionId]: {
              ...cur,
              questionsAnswered: { ...cur.questionsAnswered, [questionId]: selected },
              questionsCorrect: { ...cur.questionsCorrect, [questionId]: correct },
              startedAt: cur.startedAt ?? new Date().toISOString(),
            },
          },
        };
      });
      return correct;
    },
    []
  );

  const finalizeMission = useCallback((missionId: string) => {
    const mission = missionById(missionId);
    if (!mission) return { completed: false, mastered: false, xpGained: 0 };
    // Compute synchronously from the latest snapshot so callers can react
    // immediately (e.g. open the completion modal).
    const snap = stateRef.current;
    const cur =
      snap.missions[missionId] ?? defaultMissionProgress(missionId, mission.starterCode);
    if (cur.completedAt) return { completed: false, mastered: false, xpGained: 0 };
    const { mastered, independent, xpGained, needsPractice } = computeFinalization(mission, cur);
    const stamp = new Date().toISOString();
    setState((prev) => {
      const prevCur =
        prev.missions[missionId] ?? defaultMissionProgress(missionId, mission.starterCode);
      if (prevCur.completedAt) return prev; // idempotent under double-clicks
      const note = `${mastered ? "Mastered" : "Completed"} “${mission.title}” (${stamp.slice(0, 10)})`;
      let competencies = prev.competencies;
      for (const cid of mission.competencyIds) {
        competencies = bump(
          competencies,
          cid,
          mastered ? "independent" : independent ? "demonstrated" : "practiced",
          note
        );
      }
      return {
        ...prev,
        xp: prev.xp + xpGained,
        missions: {
          ...prev.missions,
          [missionId]: {
            ...prevCur,
            completedAt: stamp,
            masteredAt: mastered ? stamp : null,
            independent,
            xpAwarded: xpGained,
          },
        },
        competencies,
        practiceQueue: needsPractice
          ? Array.from(new Set([...prev.practiceQueue, missionId]))
          : prev.practiceQueue,
      };
    });
    return { completed: true, mastered, xpGained };
  }, []);

  const resetAll = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setState(defaultState());
  }, []);

  const value = useMemo<Store>(
    () => ({
      state,
      loaded,
      saveProfile,
      saveDiagnostic,
      progressOf,
      touchMission,
      saveCode,
      recordAttempt,
      recordHint,
      answerQuestion,
      finalizeMission,
      resetAll,
    }),
    [
      state,
      loaded,
      saveProfile,
      saveDiagnostic,
      progressOf,
      touchMission,
      saveCode,
      recordAttempt,
      recordHint,
      answerQuestion,
      finalizeMission,
      resetAll,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProgress must be used inside ProgressProvider");
  return ctx;
}
