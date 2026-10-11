import type {
  DiagnosticResult,
  LearnerState,
  MissionProgress,
  Profile,
  RunReceipt,
  RunReceiptClaim,
} from "./types";
import { missionById } from "./missions";
import { defaultMissionProgress } from "./progress-core";

/* Cloud-sync merge logic — pure and framework-free so the Node verification
   harness can test it directly.

   Model: the server (progress service) is authoritative for anything it
   holds; the client is authoritative only for work the server has never
   seen (guest progress being brought online for the first time, or a newer
   draft on the device you are holding right now).

   Rules:
   - Restore: server-only records are adopted as-is.
   - First sync: local-only records are kept AND planned for push.
   - Same mission on both sides: a completion beats an in-progress record;
     two completions defer to the server; two drafts pick the richer work
     (more attempts, then the later start), preferring the local device on a
     tie because that is where the learner is actively working.
   - XP is recomputed from the merged completions; competency evidence is
     unioned with the higher proficiency level winning.

   The plan is a list of pushes the engine replays in order. Each mission
   entry pushes a draft first and completes afterwards, mirroring how the
   progress service gates completion on stored evidence. */

export interface MissionDraft {
  code: string;
  checksPassed: string[];
  attempts: number;
  hintsUsed: number;
  maxHintLevel: number;
  questionsAnswered: Record<string, number>;
  questionsCorrect: Record<string, boolean>;
}

export interface MissionPush {
  missionId: string;
  draft: MissionDraft;
  /** true → also call POST /missions/:id/complete after the draft lands. */
  complete: boolean;
}

export interface SyncPlan {
  /** push the local profile (PUT /profile) */
  profile: boolean;
  /** push the local diagnostic results (POST /diagnostic) */
  diagnostic: DiagnosticResult[] | null;
  /** completions first, then drafts */
  missions: MissionPush[];
}

export interface MergeResult {
  merged: LearnerState;
  plan: SyncPlan;
}

const PROFICIENCY_RANK = ["unseen", "introduced", "practiced", "demonstrated", "independent", "strong"];

/**
 * The run evidence a completion push carries: only claims that actually hold a
 * signed receipt, one per check, the later run winning.
 *
 * Pure and tested here because it encodes the rule the server depends on — a
 * claim without a receipt must never be sent as if it were evidence. Dropping
 * the empty ones is not a convenience: sending `receipt: null` would invite a
 * server that trusts its input to treat "no proof" as "passed".
 */
export function receiptEvidenceFor(claims: RunReceiptClaim[]): { checkId: string; receipt: RunReceipt }[] {
  const byCheck = new Map<string, { checkId: string; receipt: RunReceipt }>();
  for (const c of claims) {
    if (!c.receipt) continue;
    // Re-insertion keeps first-seen order while letting a later run supersede
    // an earlier one for the same check.
    byCheck.delete(c.checkId);
    byCheck.set(c.checkId, { checkId: c.checkId, receipt: c.receipt });
  }
  return [...byCheck.values()];
}

export function draftOf(p: MissionProgress): MissionDraft {
  return {
    code: p.code,
    checksPassed: [...p.checksPassed],
    attempts: p.attempts,
    hintsUsed: p.hintsUsed,
    maxHintLevel: p.maxHintLevel,
    questionsAnswered: { ...p.questionsAnswered },
    questionsCorrect: { ...p.questionsCorrect },
  };
}

function sameRecord(a: MissionProgress, b: MissionProgress): boolean {
  return (
    a.code === b.code &&
    a.attempts === b.attempts &&
    a.hintsUsed === b.hintsUsed &&
    a.maxHintLevel === b.maxHintLevel &&
    a.checksPassed.slice().sort().join(",") === b.checksPassed.slice().sort().join(",") &&
    JSON.stringify(a.questionsAnswered) === JSON.stringify(b.questionsAnswered) &&
    JSON.stringify(a.questionsCorrect) === JSON.stringify(b.questionsCorrect)
  );
}

/** Has the learner actually done anything worth persisting? A record that is
    still just the untouched starter is never pushed. */
export function meaningfulWork(p: MissionProgress): boolean {
  if (p.completedAt || p.startedAt || p.attempts > 0 || p.hintsUsed > 0 || p.checksPassed.length > 0) {
    return true;
  }
  const starter = missionById(p.missionId)?.starterCode ?? defaultMissionProgress(p.missionId, "").code;
  return p.code !== starter && p.code !== "";
}

function pickRicherDraft(local: MissionProgress, server: MissionProgress): MissionProgress {
  if (local.attempts !== server.attempts) return local.attempts > server.attempts ? local : server;
  const lt = local.startedAt ? new Date(local.startedAt).getTime() : -Infinity;
  const st = server.startedAt ? new Date(server.startedAt).getTime() : -Infinity;
  if (lt !== st) return lt > st ? local : server;
  return local;
}

function laterOf<T extends { completedAt: string | null }>(local: T, server: T): { winner: T; localWins: boolean } {
  if (!server.completedAt && local.completedAt) return { winner: local, localWins: true };
  if (server.completedAt && !local.completedAt) return { winner: server, localWins: false };
  if (server.completedAt && local.completedAt) {
    const localLater = new Date(local.completedAt).getTime() > new Date(server.completedAt).getTime();
    return { winner: localLater ? local : server, localWins: localLater };
  }
  return { winner: local, localWins: false };
}

function mergeProfile(local: Profile, server: Profile): { profile: Profile; push: boolean } {
  const { winner, localWins } = laterOf(local, server);
  if (!local.completedAt && !server.completedAt) {
    // Neither finished onboarding: keep whichever has content, local first.
    const localHas = local.goal !== "" || local.name !== "";
    return { profile: localHas ? local : server, push: false };
  }
  return { profile: winner, push: localWins };
}

function mergeCompetencies(local: LearnerState["competencies"], server: LearnerState["competencies"]) {
  const out: LearnerState["competencies"] = {};
  const ids = new Set([...Object.keys(local), ...Object.keys(server)]);
  for (const id of ids) {
    const a = local[id];
    const b = server[id];
    if (!a || !b) {
      out[id] = (a ?? b)!;
      continue;
    }
    const level =
      PROFICIENCY_RANK.indexOf(a.level) >= PROFICIENCY_RANK.indexOf(b.level) ? a.level : b.level;
    const evidence = [...new Set([...a.evidence, ...b.evidence])].slice(-12);
    out[id] = {
      competencyId: id,
      level,
      evidence,
      updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    };
  }
  return out;
}

export function mergeStates(local: LearnerState, server: LearnerState): MergeResult {
  const { profile, push: pushProfile } = mergeProfile(local.profile, server.profile);

  const diag = laterOf(
    { completedAt: local.diagnostic.completedAt, results: local.diagnostic.results },
    { completedAt: server.diagnostic.completedAt, results: server.diagnostic.results }
  );
  const diagnostic =
    local.diagnostic.completedAt || server.diagnostic.completedAt
      ? diag.winner.results
      : local.diagnostic.results.length
        ? local.diagnostic.results
        : server.diagnostic.results;
  const completedAt =
    local.diagnostic.completedAt || server.diagnostic.completedAt ? diag.winner.completedAt : null;
  const pushDiagnostic = diag.localWins && local.diagnostic.completedAt ? local.diagnostic.results : null;

  const missions: Record<string, MissionProgress> = {};
  const pushes: MissionPush[] = [];
  const ids = new Set([...Object.keys(local.missions), ...Object.keys(server.missions)]);
  for (const id of ids) {
    const L = local.missions[id] ?? null;
    const S = server.missions[id] ?? null;
    if (L && !S) {
      missions[id] = L;
      if (L.completedAt) pushes.push({ missionId: id, draft: draftOf(L), complete: true });
      else if (meaningfulWork(L)) pushes.push({ missionId: id, draft: draftOf(L), complete: false });
    } else if (!L && S) {
      missions[id] = S;
    } else if (L && S) {
      if (S.completedAt && !L.completedAt) {
        missions[id] = S; // server finished it elsewhere — completion wins
      } else if (L.completedAt && !S.completedAt) {
        missions[id] = L;
        pushes.push({ missionId: id, draft: draftOf(L), complete: true });
      } else if (L.completedAt && S.completedAt) {
        missions[id] = S; // canonical
      } else {
        const richer = pickRicherDraft(L, S);
        missions[id] = richer;
        if (richer === L && !sameRecord(L, S)) {
          pushes.push({ missionId: id, draft: draftOf(L), complete: false });
        }
      }
    }
    const mergedMission = missions[id];
    if (mergedMission) {
      // Reflection belongs to the local mission draft, but is not part of the
      // server's MissionDraft contract. Keep it when a cloud completion or a
      // richer server draft wins the code/progress merge.
      missions[id] = {
        ...mergedMission,
        reflection: L?.reflection ?? S?.reflection ?? { expected: "", observed: "", nextChange: "" },
      };
    }
  }

  const xp = Object.values(missions).reduce((sum, m) => sum + (m.completedAt ? m.xpAwarded : 0), 0);

  const activeDays = [...new Set([...local.activeDays, ...server.activeDays])].sort();
  const lastActiveDate =
    (local.lastActiveDate ?? "") > (server.lastActiveDate ?? "") ? local.lastActiveDate : server.lastActiveDate;

  const merged: LearnerState = {
    version: 1,
    profile,
    diagnostic: { completedAt, results: diagnostic },
    missions,
    competencies: mergeCompetencies(local.competencies, server.competencies),
    xp,
    activeDays,
    lastActiveDate,
    practiceQueue: [...new Set([...local.practiceQueue, ...server.practiceQueue])],
    viewedRecommendation: local.viewedRecommendation ?? server.viewedRecommendation,
  };

  const plan: SyncPlan = {
    profile: pushProfile,
    diagnostic: pushDiagnostic,
    // Completions first: they change recommendations and evidence downstream.
    missions: [...pushes.filter((p) => p.complete), ...pushes.filter((p) => !p.complete)],
  };

  return { merged, plan };
}

/** Guard for adopting a server snapshot mid-session: never regress a record
    the learner has completed locally while the request was in flight. */
export function protectCompleted(adopted: LearnerState, current: LearnerState): LearnerState {
  const missions = { ...adopted.missions };
  let touched = false;
  for (const [id, m] of Object.entries(current.missions)) {
    const s = missions[id];
    if (m.completedAt && (!s || !s.completedAt)) {
      missions[id] = m;
      touched = true;
    }
  }
  return touched ? { ...adopted, missions } : adopted;
}
