import { COMPETENCIES, stageById } from "./curriculum";
import { ALL_MISSIONS, missionById } from "./missions";
import { openMistakes, resolvedMistakes, type PracticeState } from "./practice-core";
import { APPROVED_LEVELS, proficiencyWord } from "./review";
import type { LearnerState, Proficiency } from "./types";

/* "Proof of skill" is the positioning claim, and until now it was not
   portable: the evidence lived in one browser's localStorage and nothing
   could leave the app. This module turns the learner's own assessed record
   into a document they can keep, send, or read later — derived only from
   what the engine actually decided, with the unproven parts named rather
   than dressed up.

   Pure: no browser APIs, no framework. The skills page calls it and hands
   the string to a download; the assertion suite imports it directly. */

export interface EvidenceSkill {
  competencyId: string;
  name: string;
  domain: string;
  level: Proficiency;
  /** The level in the review world's words ("approved", "under review"). */
  word: string;
  /** Explicit criterion for the level, in the same words the app uses. */
  criterion: string;
  evidence: string[];
  updatedAt: string | null;
}

export interface EvidenceMission {
  id: string;
  title: string;
  stage: string;
  completedAt: string;
  masteredAt: string | null;
  independent: boolean;
  attempts: number;
  hintsUsed: number;
  checksPassed: string[];
  xpAwarded: number;
}

export interface EvidencePractice {
  open: number;
  cleared: number;
  items: {
    missionId: string;
    missionTitle: string;
    checkId: string;
    label: string;
    failures: number;
    firstFailedAt: string;
    lastFailedAt: string;
    resolvedAt: string | null;
  }[];
}

export interface EvidenceDocument {
  format: "nexora.evidence";
  version: 1;
  exportedAt: string;
  learner: { name: string; goal: string; hoursPerWeek: string };
  summary: {
    skillsApproved: number;
    skillsTracked: number;
    missionsCompleted: number;
    missionsMastered: number;
    xp: number;
    activeDays: number;
  };
  skills: EvidenceSkill[];
  missions: EvidenceMission[];
  practice: EvidencePractice;
  /** What this document is not — printed in it, not only in the app. */
  caveat: string;
}

export const EVIDENCE_CAVEAT =
  "Generated from assessed work in this learner's own copy of NEXORA: checks passed, " +
  "requirements re-derived from the saved drafts and runs, and the missions' own words for " +
  "what each level means. It is not a certificate, not an accredited qualification, and it " +
  "excludes the checks this build could not decide (invite the reader to re-run them).";

export function buildEvidence(
  state: LearnerState,
  practiceState: PracticeState | null = null,
  now: Date = new Date()
): EvidenceDocument {
  const skills: EvidenceSkill[] = COMPETENCIES.map((c) => {
    const ev = state.competencies[c.id];
    const level: Proficiency = ev?.level ?? "unseen";
    const word = proficiencyWord(level);
    return {
      competencyId: c.id,
      name: c.name,
      domain: c.domain,
      level,
      word: word.word,
      criterion: word.note,
      evidence: [...(ev?.evidence ?? [])],
      updatedAt: ev?.level && ev.level !== "unseen" ? (ev.updatedAt ?? null) : null,
    };
  });

  const missions: EvidenceMission[] = ALL_MISSIONS.filter(
    (m) => state.missions[m.id]?.completedAt
  ).map((m) => {
    const p = state.missions[m.id];
    return {
      id: m.id,
      title: m.title,
      stage: stageById(m.stageId)?.title ?? m.stageId,
      completedAt: p.completedAt!,
      masteredAt: p.masteredAt,
      independent: p.independent,
      attempts: p.attempts,
      hintsUsed: p.hintsUsed,
      checksPassed: [...p.checksPassed].sort(),
      xpAwarded: p.xpAwarded,
    };
  });

  const all = practiceState
    ? [...openMistakes(practiceState), ...resolvedMistakes(practiceState)]
    : [];
  const practiceItems: EvidencePractice["items"] = all.slice(0, 10).map((m) => ({
    missionId: m.missionId,
    missionTitle: missionById(m.missionId)?.title ?? m.missionId,
    checkId: m.checkId,
    label: m.label,
    failures: m.failures,
    firstFailedAt: m.firstFailedAt,
    lastFailedAt: m.lastFailedAt,
    resolvedAt: m.resolvedAt,
  }));

  // One definition of "approved" in the codebase, shared with the skills page.
  const approved = skills.filter((s) => APPROVED_LEVELS.includes(s.level)).length;

  return {
    format: "nexora.evidence",
    version: 1,
    exportedAt: now.toISOString(),
    learner: {
      name: state.profile.name,
      goal: state.profile.goal,
      hoursPerWeek: state.profile.hoursPerWeek,
    },
    summary: {
      skillsApproved: approved,
      skillsTracked: COMPETENCIES.length,
      missionsCompleted: missions.length,
      missionsMastered: missions.filter((m) => m.masteredAt !== null).length,
      xp: state.xp,
      activeDays: state.activeDays.length,
    },
    skills,
    missions,
    practice: {
      open: practiceState ? openMistakes(practiceState).length : 0,
      cleared: practiceState ? resolvedMistakes(practiceState).length : 0,
      items: practiceItems,
    },
    caveat: EVIDENCE_CAVEAT,
  };
}

export function evidenceJson(doc: EvidenceDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** A readable companion to the JSON — the version a learner would send a human. */
export function evidenceMarkdown(doc: EvidenceDocument): string {
  const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : "—");
  const lines: string[] = [];
  lines.push("# Evidence of assessed work");
  lines.push("");
  lines.push(`Exported ${day(doc.exportedAt)}${doc.learner.name ? ` · ${doc.learner.name}` : ""}`);
  if (doc.learner.goal) lines.push(`Working toward: ${doc.learner.goal}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| Skills approved | ${doc.summary.skillsApproved} of ${doc.summary.skillsTracked} |`);
  lines.push(`| Missions completed | ${doc.summary.missionsCompleted} |`);
  lines.push(`| Missions mastered | ${doc.summary.missionsMastered} |`);
  lines.push(`| Requirements that beat this learner (open) | ${doc.practice.open} |`);
  lines.push("");
  lines.push("## Skills");
  for (const domain of [...new Set(doc.skills.map((s) => s.domain))]) {
    lines.push("");
    lines.push(`### ${domain}`);
    for (const s of doc.skills.filter((x) => x.domain === domain)) {
      lines.push(`- **${s.name}** — ${s.word}`);
      lines.push(`  - means: ${s.criterion}`);
      for (const e of s.evidence) lines.push(`  - ${e}`);
    }
  }
  lines.push("");
  lines.push("## Missions");
  if (doc.missions.length === 0) {
    lines.push("");
    lines.push("None completed yet.");
  }
  for (const m of doc.missions) {
    lines.push("");
    lines.push(`- **${m.title}** (${m.stage}) — completed ${day(m.completedAt)}`);
    lines.push(
      `  - ${m.masteredAt ? "mastered" : "completed"}${
        m.independent ? ", unaided" : ", with guidance"
      } · attempts ${m.attempts} · hints ${m.hintsUsed}`
    );
    if (m.checksPassed.length > 0) {
      lines.push(`  - requirements met: ${m.checksPassed.join(", ")}`);
    }
  }
  lines.push("");
  lines.push("## Work that resisted");
  lines.push("");
  lines.push(
    `${doc.practice.cleared} cleared, ${doc.practice.open} still open. Practice is recorded ` +
      "beside the failure, never instead of it."
  );
  for (const p of doc.practice.items) {
    const state = p.resolvedAt ? `cleared ${day(p.resolvedAt)}` : "open";
    lines.push(
      `- ${p.missionTitle} · ${p.label} — ${state}, turned this learner back ${p.failures}×` +
        ` (first ${day(p.firstFailedAt)}, latest ${day(p.lastFailedAt)})`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(doc.caveat);
  return `${lines.join("\n")}\n`;
}
