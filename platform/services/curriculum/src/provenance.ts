/* What the curriculum is, and what its evidence rests on.
 *
 * Two records, both of them data, both of them served where a portfolio can
 * read them:
 *
 *   - the provenance of a phase: who wrote it, who read it, where it came
 *     from, and the licence it ships under. The reviewer field is `null` for
 *     every phase today, and that is the truth: the curriculum has one author
 *     and no second reader. The record says so instead of implying a review
 *     that never happened.
 *
 *   - the rubric of a phase: which of its activities the platform can
 *     recompute, and which rest on the learner's own word. The platform runs a
 *     challenge's test command and the checks under it either hold or do not,
 *     so a challenge is `attested`. A question, a retrieval, a quick check or
 *     a written task is the learner's account of their own work, and the
 *     server cannot re-derive it, so it is `client-reported`. A lesson, a
 *     prose block, an example and a key-points list carry no claim at all, so
 *     they are `material`.
 *
 * The rule is deliberately fail-closed: an activity that carries checks but no
 * command to run them is not attested, because nothing would recompute it.
 * A class the platform cannot justify is not one it claims. */

export type EvidenceBasis = "attested" | "client-reported" | "material";

export interface PhaseProvenance {
  phaseId: string;
  courseId: string;
  title: string;
  author: string;
  /** null when nobody other than the author has read the phase. */
  reviewer: string | null;
  reviewedOn: string | null;
  source: string;
  licence: string;
}

export interface PhaseRubric {
  phaseId: string;
  courseId: string;
  /** Activity ids whose checks the platform recomputes by running the work. */
  attested: string[];
  /** Activity ids where the learner's own account is the whole of the evidence. */
  clientReported: string[];
  /** Activity ids that carry reading, and make no claim. */
  material: string[];
  /** One plain sentence, for a reader who will not read the lists. */
  statement: string;
}

/** The kinds that carry reading. */
const MATERIAL_KINDS = new Set(["lesson", "prose", "example", "keypoints"]);

/** The kinds where the learner answers, and the server cannot re-derive it. */
const REPORTED_KINDS = new Set(["question", "retrieval", "quickcheck", "task"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * The basis of one activity, read off the activity itself.
 *
 * `attested` needs the platform to be able to re-derive the claim, and there
 * are three ways it can: the activity carries checks and the command that
 * runs them, so the platform executes the work; or the activity names an
 * incident, and the platform judges it from its own incident catalogue; or it
 * names a design, and the platform judges it from its own design catalogue.
 * With checks but no command there is nothing to re-derive, so the activity
 * falls back to the learner's word.
 */
export function activityBasis(activity: unknown): EvidenceBasis {
  if (!isRecord(activity)) return "material";
  const kind = typeof activity.kind === "string" ? activity.kind : "";
  const checks = Array.isArray(activity.checks) ? activity.checks : [];
  const command = typeof activity.testCommand === "string" ? activity.testCommand.trim() : "";
  const names = (field: string) => typeof activity[field] === "string" && (activity[field] as string).length > 0;
  if ((checks.length > 0 && command.length > 0) || names("incidentId") || names("designId")) {
    return "attested";
  }
  if (MATERIAL_KINDS.has(kind)) return "material";
  if (REPORTED_KINDS.has(kind)) return "client-reported";
  // An activity the document does not describe in a way this service can read
  // is treated as the learner's own account, never as something the platform
  // claims to have checked.
  return "client-reported";
}

/** The rubric of one phase, read off the activities it reaches. */
export function phaseRubric(
  courseId: string,
  phaseId: string,
  phaseTitle: string,
  activityIds: string[],
  activities: Record<string, unknown>
): PhaseRubric {
  const attested: string[] = [];
  const clientReported: string[] = [];
  const material: string[] = [];
  for (const id of activityIds) {
    const basis = activityBasis(activities[id]);
    if (basis === "attested") attested.push(id);
    else if (basis === "material") material.push(id);
    else clientReported.push(id);
  }
  const parts: string[] = [];
  parts.push(
    attested.length === 0
      ? "Nothing in this phase is checked by the server."
      : `The server recomputes ${attested.length} of this phase's activities.`
  );
  parts.push(
    clientReported.length === 0
      ? "No part of it rests on the learner's own account."
      : `${clientReported.length} of its activities rest on the learner's own account, which the server cannot re-derive.`
  );
  return {
    phaseId,
    courseId,
    attested,
    clientReported,
    material,
    statement: `${phaseTitle}: ${parts.join(" ")}`,
  };
}

/* The authorship of the curriculum, stated once.
 *
 * The author is the repository that holds the authored document. The reviewer
 * is nobody: the phases were written by one hand and read by no second
 * reader, and a provenance record that implied a review would be a false
 * claim about the product's own integrity. When a second reader exists, this
 * record is the place to say so. */
const AUTHOR = "The NEXORA maintainers, in the IDE repository that holds the authored curriculum";
const SOURCE = "nexora-ide/extensions/nexora/curriculum, synced into this service by npm run sync:curriculum";

/* The licence question is not settled in the repository yet, and the record
 * says so rather than naming a licence the code does not carry. The decision
 * and its reason live in LICENSE-POSTURE.md. */
const LICENCE = "unresolved";
const LICENCE_NOTE =
  "The repository ships no licence file yet, so this phase has no licence to name. See LICENSE-POSTURE.md for the decision and what it blocks.";

export function phaseProvenance(
  courseId: string,
  phaseId: string,
  phaseTitle: string,
  contentVersion: string
): PhaseProvenance {
  return {
    phaseId,
    courseId,
    title: phaseTitle,
    author: AUTHOR,
    reviewer: null,
    reviewedOn: null,
    source: `${SOURCE} (content version ${contentVersion})`,
    licence: LICENCE,
  };
}

export const LICENCE_NOTE_TEXT = LICENCE_NOTE;
