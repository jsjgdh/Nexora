import type { LearnerState, MissionProgress } from "./vendor/types.js";
import { defaultState } from "./vendor/progress-core.js";
import { missionById } from "./vendor/missions.js";

/* Row shapes (pg) ↔ LearnerState: lets the server reuse the exact same
   recommendation + finalization rules as the client. */

export interface ProgressRow {
  mission_id: string;
  content_version: string;
  code: string;
  started_at: Date | null;
  attempts: number;
  checks_passed: string[];
  hints_used: number;
  max_hint_level: number;
  questions: { answered: Record<string, number>; correct: Record<string, boolean> };
  completed_at: Date | null;
  mastered_at: Date | null;
  independent: boolean;
  xp_awarded: number;
}

export interface EvidenceRow {
  competency_id: string;
  level: string;
  evidence: string[];
}

export interface ProfileRow {
  name: string;
  goal: string;
  experience: string;
  languages: string[];
  tools: string[];
  can_build: string;
  hours_per_week: string;
  interests: string[];
  completed_at: Date | null;
}

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

export function rowToProgress(r: ProgressRow): MissionProgress {
  const starter = missionById(r.mission_id)?.starterCode ?? "";
  return {
    missionId: r.mission_id,
    code: r.code || starter,
    startedAt: iso(r.started_at),
    attempts: r.attempts,
    checksPassed: r.checks_passed ?? [],
    hintsUsed: r.hints_used,
    maxHintLevel: r.max_hint_level,
    questionsAnswered: r.questions?.answered ?? {},
    questionsCorrect: r.questions?.correct ?? {},
    completedAt: iso(r.completed_at),
    masteredAt: iso(r.mastered_at),
    independent: r.independent,
    xpAwarded: r.xp_awarded,
  };
}

export function buildLearnerState(parts: {
  profile: ProfileRow | null;
  diagnostic: { completed_at: Date; results: LearnerState["diagnostic"]["results"] } | null;
  missions: ProgressRow[];
  evidence: EvidenceRow[];
}): LearnerState {
  const s = defaultState();
  if (parts.profile) {
    const p = parts.profile;
    s.profile = {
      name: p.name,
      goal: p.goal,
      experience: p.experience,
      languages: p.languages ?? [],
      tools: p.tools ?? [],
      canBuild: p.can_build,
      hoursPerWeek: p.hours_per_week,
      interests: p.interests ?? [],
      completedAt: iso(p.completed_at),
    };
  }
  if (parts.diagnostic) {
    s.diagnostic = {
      completedAt: iso(parts.diagnostic.completed_at) ?? new Date().toISOString(),
      results: parts.diagnostic.results ?? [],
    };
  }
  for (const r of parts.missions) s.missions[r.mission_id] = rowToProgress(r);
  for (const e of parts.evidence) {
    if (s.competencies[e.competency_id]) {
      s.competencies[e.competency_id] = {
        competencyId: e.competency_id,
        level: e.level as LearnerState["competencies"][string]["level"],
        evidence: e.evidence ?? [],
        updatedAt: new Date().toISOString(),
      };
    }
  }
  return s;
}
