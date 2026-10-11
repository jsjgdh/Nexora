import type { LearnerState, Mission, NodeState } from "./types";
import { ALL_MISSIONS, missionById } from "./missions";
import { DIAGNOSTIC_ITEMS, htmlStartIndex } from "./diagnostic";
import { actionVerb } from "./format";

/* Explicit, inspectable adaptation rules (PRD §9.3). The engine decides
   eligibility and ordering; prose explanations keep it understandable. */

export function prereqsMet(mission: Mission, state: LearnerState): boolean {
  if (mission.prereqIds.length === 0) return true;
  if (!state.diagnostic.completedAt) {
    return mission.prereqIds.every((id) => isCompleted(id, state));
  }
  // Diagnostic placement ("test out", PRD §5.3/§6.4): prerequisites that lie
  // strictly before the placed starting point are waived — the learner
  // demonstrated enough to begin there. Waived missions are NOT marked
  // complete (no XP, no mastery); they stay open as optional review.
  const sIdx = startIndex(state);
  const mIdx = ALL_MISSIONS.findIndex((m) => m.id === mission.id);
  if (mIdx !== -1 && mIdx < sIdx) return true; // review lane: always open
  return mission.prereqIds.every((id) => {
    if (isCompleted(id, state)) return true;
    const pIdx = ALL_MISSIONS.findIndex((m) => m.id === id);
    return pIdx !== -1 && pIdx < sIdx;
  });
}

function startIndex(state: LearnerState): number {
  const id = diagnosticStartMissionId(state);
  const i = ALL_MISSIONS.findIndex((m) => m.id === id);
  return i === -1 ? 0 : i;
}

export function isCompleted(missionId: string, state: LearnerState): boolean {
  return !!state.missions[missionId]?.completedAt;
}

export function isMastered(missionId: string, state: LearnerState): boolean {
  return !!state.missions[missionId]?.masteredAt;
}

/** Diagnostic-derived entry point into Stage 1 (mission id). */
export function diagnosticStartMissionId(state: LearnerState): string {
  if (!state.diagnostic.completedAt) return ALL_MISSIONS[0].id;
  const aligned = DIAGNOSTIC_ITEMS.map((item) => {
    const r = state.diagnostic.results.find((x) => x.itemId === item.id);
    return { correct: r?.correct ?? false, skipped: !r || r.skipped };
  });
  const idx = htmlStartIndex(aligned);
  return ALL_MISSIONS[Math.min(idx, ALL_MISSIONS.length - 1)].id;
}

export interface Recommendation {
  primaryId: string | null;
  refresherIds: string[];
  reason: string;
  done: boolean;
}

export function recommend(state: LearnerState): Recommendation {
  if (!state.profile.completedAt) {
    return {
      primaryId: null,
      refresherIds: [],
      reason: "Tell us your goal so we can build your roadmap.",
      done: false,
    };
  }
  if (!state.diagnostic.completedAt) {
    return {
      primaryId: null,
      refresherIds: [],
      reason: "Complete the short practical diagnostic to find your starting point.",
      done: false,
    };
  }
  const startId = diagnosticStartMissionId(state);
  const startIdx = ALL_MISSIONS.findIndex((m) => m.id === startId);

  const inProgress = ALL_MISSIONS.find(
    (m) => state.missions[m.id]?.startedAt && !state.missions[m.id]?.completedAt
  );
  if (inProgress) {
    return {
      primaryId: inProgress.id,
      refresherIds: refresherIds(state),
      reason: `You already started “${inProgress.title}” — pick up where you left off.`,
      done: false,
    };
  }

  // Practice-queue items whose prerequisites are satisfied get priority only
  // if they unblock nothing else; normally the next new mission wins.
  // Diagnostic placement is honored: prefer missions at/after the starting
  // point so "tested out" intros don't become the recommendation.
  const sIdx = state.diagnostic.completedAt ? startIndex(state) : 0;
  const eligible = (m: Mission) => !isCompleted(m.id, state) && prereqsMet(m, state);
  const nextNew =
    ALL_MISSIONS.find((m, i) => i >= sIdx && eligible(m)) ?? ALL_MISSIONS.find(eligible);
  if (nextNew) {
    const idx = ALL_MISSIONS.indexOf(nextNew);
    const wasSkippedByDiagnostic = idx < sIdx && !!state.diagnostic.completedAt;
    return {
      primaryId: nextNew.id,
      refresherIds: refresherIds(state),
      reason: wasSkippedByDiagnostic
        ? `Your diagnostic showed strength here, but “${nextNew.title}” still has open prerequisites — a quick pass keeps the foundation solid.`
        : nextNew.prereqIds.length === 0
          ? `Start at the beginning: “${nextNew.title}”. Your diagnostic set the pace from here.`
          : `Prerequisites met — “${nextNew.title}” is the next step on your path.`,
      done: false,
    };
  }

  const refreshers = refresherIds(state);
  if (refreshers.length > 0) {
    const m = missionById(refreshers[0])!;
    return {
      primaryId: m.id,
      refresherIds: refreshers.slice(1),
      reason: `Everything required is done. Revisit “${m.title}” to convert it from completed to mastered.`,
      done: false,
    };
  }

  return {
    primaryId: null,
    refresherIds: [],
    reason:
      "Stage 1 complete. Stages 2–10 open next — CSS Foundations is on the horizon.",
    done: true,
  };
}

function refresherIds(state: LearnerState): string[] {
  return ALL_MISSIONS.filter(
    (m) =>
      isCompleted(m.id, state) &&
      !isMastered(m.id, state) &&
      prereqsMet(m, state)
  ).map((m) => m.id);
}

export function nodeStateFor(
  mission: Mission,
  state: LearnerState,
  recommendedId: string | null
): NodeState {
  if (isMastered(mission.id, state)) return "mastered";
  if (isCompleted(mission.id, state)) {
    return state.practiceQueue.includes(mission.id) ? "needs-practice" : "completed";
  }
  if (!prereqsMet(mission, state)) return "locked";
  if (recommendedId === mission.id) return "recommended";
  const p = state.missions[mission.id];
  if (p?.startedAt) return "in-progress";
  if (mission.isOptional) return "optional";
  // Diagnostic skips: pass placement but keep eligible.
  const startId = diagnosticStartMissionId(state);
  const startIdx = ALL_MISSIONS.findIndex((m) => m.id === startId);
  const idx = ALL_MISSIONS.indexOf(mission);
  if (state.diagnostic.completedAt && idx < startIdx) return "optional";
  return "available";
}

/** The one verb a mission's primary button should show. Resume wins over
    state verbs for in-progress work; everything else follows the node state. */
export function missionActionLabel(
  mission: Mission,
  state: LearnerState,
  recommendedId: string | null
): string {
  const p = state.missions[mission.id];
  if (p?.startedAt && !p.completedAt) return "Resume mission";
  return actionVerb(nodeStateFor(mission, state, recommendedId));
}

/** Continue-learning destination for the persistent primary action. */
export function continueTarget(state: LearnerState): {
  href: string;
  label: string;
  detail: string;
} {
  if (!state.profile.completedAt)
    return { href: "/onboarding", label: "Start onboarding", detail: "Set your goal" };
  if (!state.diagnostic.completedAt)
    return { href: "/diagnostic", label: "Continue diagnostic", detail: "Find your level" };
  const rec = recommend(state);
  if (rec.primaryId) {
    const m = missionById(rec.primaryId)!;
    const started = state.missions[m.id]?.startedAt;
    return {
      href: `/mission/${m.id}`,
      label: started ? "Resume mission" : "Continue learning",
      detail: m.title,
    };
  }
  return { href: "/projects", label: "View portfolio", detail: "Stage 1 complete" };
}
