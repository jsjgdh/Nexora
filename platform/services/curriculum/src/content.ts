import type {
  CurriculumVersion,
  DiagnosticItemPublic,
  MissionSummary,
  StageSummary,
} from "@nexora/contracts";
import { ALL_MISSIONS, missionById } from "./data/missions.js";
import { COMPETENCIES, STAGES } from "./data/curriculum.js";
import { DIAGNOSTIC_ITEMS } from "./data/diagnostic.js";
import { CONTENT_VERSION } from "./data/version.js";

export function getVersion(): CurriculumVersion {
  return {
    version: CONTENT_VERSION,
    stages: STAGES.length,
    missions: ALL_MISSIONS.length,
    diagnosticItems: DIAGNOSTIC_ITEMS.length,
  };
}

export function getStages(): StageSummary[] {
  return STAGES.map((s) => ({
    id: s.id,
    num: s.num,
    title: s.title,
    goal: s.goal,
    description: s.description,
    missionIds: [...s.missionIds],
  }));
}

export function toSummary(m: (typeof ALL_MISSIONS)[number]): MissionSummary {
  return {
    id: m.id,
    stageId: m.stageId,
    title: m.title,
    tagline: m.tagline,
    type: m.type,
    difficulty: m.difficulty,
    estMinutes: m.estMinutes,
    objectives: [...m.objectives],
    prereqIds: [...m.prereqIds],
    competencyIds: [...m.competencyIds],
    isBoss: !!m.isBoss,
    needsScript: !!m.needsScript,
  };
}

export function getMissions(stage?: string, type?: string): MissionSummary[] {
  return ALL_MISSIONS.filter(
    (m) => (!stage || m.stageId === stage) && (!type || m.type === type)
  ).map(toSummary);
}

/** Full mission detail. Ships complete (hints, questions, check rules):
    the client evaluates checks locally, so it needs the rules — and they are
    all visible in the public client bundle anyway. The only content EVER
    withheld is diagnostic answer keys (see getDiagnosticItems). */
export function getMission(id: string) {
  const m = missionById(id);
  if (!m) return null;
  return structuredClone(m);
}

/** Diagnostic items WITHOUT answer keys — the client must never see them. */
export function getDiagnosticItems(): DiagnosticItemPublic[] {
  return DIAGNOSTIC_ITEMS.map((d) => ({
    id: d.id,
    competencyId: d.competencyId,
    skill: d.skill,
    prompt: d.prompt,
    code: d.code,
    options: [...d.options],
    explanation: d.explanation,
  }));
}

export function getCompetencies() {
  return COMPETENCIES.map((c) => ({ ...c }));
}
