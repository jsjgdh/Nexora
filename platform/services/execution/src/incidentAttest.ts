import { codeSha256 } from "@nexora/service-kit";

/* Server-side re-judging for the debugging labs (B-24, incident half).
 *
 * Mirrors the extension's `incident.ts` exactly — same four checks, same rules,
 * same fail-closed posture — so client and server cannot disagree about what an
 * attempt decided. The two copies are asserted equivalent in `scripts/verify.mjs`
 * against shared attempt fixtures, the same way the Studio engine and this one
 * are pinned for designs.
 *
 * Why this half exists at all, and why it lives HERE: a modelled debugging lab is
 * judged by comparing the learner's chosen fix with the cause the incident is
 * built around. That cause is the answer, so the IDE cannot ship it — the
 * artefact carries the lab (the symptom, the log, the failing tests, the
 * candidate fixes as OPTIONS) and the platform carries the key. A shipped IDE
 * that could judge its own lab would have to ship the answer with it.
 *
 * What this module refuses, and why:
 * - the client's own verdict: a submission is an attempt, never a claim. The
 *   checks below are the only thing that decides.
 * - a model, a rubric, a score: four deterministic facts and nothing else. The
 *   learner may prove reasoning, never be graded on it.
 * - an unregistered lab: the route answers 503 `attestation_unavailable` — never
 *   a pass and never a fail.
 *
 * An incident verdict is pure computation over the submitted attempt, so like a
 * design verdict it needs no sandbox and no subprocess: nothing learner-supplied
 * ever runs here. */

/** One candidate fix, as the platform holds it: the id and the cause it addresses. */
export interface CanonicalFix {
  id: string;
  /** The cause this action addresses. Equality with the incident's `rootCause` is what makes it resolve the incident. */
  addresses: string;
  /** A fix that addresses the cause but breaks something else. Rejected on its own check. */
  regression?: boolean;
}

/** A debugging lab, as the platform holds it: the key and nothing else. */
export interface CanonicalIncident {
  id: string;
  /** The authored revision of the lab document this copy came from. */
  version: number;
  /** The single cause the incident is built around. */
  rootCause: string;
  candidateFixes: CanonicalFix[];
  /** Which evidence ids a sound investigation must cite. */
  requiredEvidence: string[];
}

/** One step of the learner's own investigation, as it travels. */
export interface AttemptEvent {
  seq: number;
  kind: string;
  text?: string;
  fixId?: string;
  passed?: boolean;
}

/** The attempt: what the learner did, and nothing about whether it was right. */
export interface SubmittedAttempt {
  events: AttemptEvent[];
  citedEvidence: string[];
}

/** One re-derived fact, in the shape the contracts and the IDE both read. */
export interface IncidentVerdictCheck {
  checkId: string;
  passed: boolean;
  reason: string;
}

/**
 * A sentence, not a grade — the same forty-character floor the extension's defend
 * layer sets, borrowed deliberately so "I don't know" cannot pass as a
 * hypothesis. The platform applies the SAME floor the IDE does, because the rule
 * is one rule read in two places.
 */
const HYPOTHESIS_MIN = 40;

function bySeq<T extends { seq: number }>(events: T[]): T[] {
  return events.slice().sort((a, b) => a.seq - b.seq);
}

/**
 * Judge a submitted attempt against the platform's OWN copy of the lab.
 *
 * The four checks, in the order the extension lists them:
 * - `fix-resolves-root-cause`: the chosen fix addresses the declared cause.
 * - `no-regression`: that fix breaks nothing else.
 * - `evidence-cited`: every required observation was cited.
 * - `hypothesis-precedes-fix`: a real hypothesis was recorded before the fix the
 *   learner stands behind. The fix they stand behind is the LAST choice in the
 *   log: a learner who weighs two options is judged on the one they settled on,
 *   and an attempt that records no choice at all has no fix whose moment is on
 *   the record, which is not credit.
 */
export function judgeIncident(incident: CanonicalIncident, attempt: SubmittedAttempt): IncidentVerdictCheck[] {
  const events = bySeq(attempt.events);
  const choices = events.filter((e) => e.kind === "choose-fix");
  const choice = choices.length === 0 ? undefined : choices[choices.length - 1];
  const hypothesis = events.find((e) => e.kind === "hypothesis" && (e.text ?? "").trim().length >= HYPOTHESIS_MIN);
  const chosen = choice?.fixId ? incident.candidateFixes.find((f) => f.id === choice.fixId) : undefined;
  const cited = incident.requiredEvidence.filter((e) => attempt.citedEvidence.includes(e));
  const evidenceComplete = incident.requiredEvidence.length > 0 && cited.length === incident.requiredEvidence.length;

  return [
    {
      checkId: "fix-resolves-root-cause",
      passed: !!chosen && chosen.addresses === incident.rootCause,
      reason: chosen
        ? chosen.addresses === incident.rootCause
          ? "The fix you chose addresses the cause this incident is built around, judged against the platform's own copy of it."
          : "The fix you chose does not address the cause this incident is built around."
        : "Your attempt does not name a fix, so nothing addresses the cause.",
    },
    {
      checkId: "no-regression",
      passed: !!chosen && !chosen.regression,
      reason: chosen
        ? chosen.regression
          ? "The fix you chose addresses the cause but breaks something else."
          : "The fix you chose addresses the cause without breaking anything else."
        : "No fix was chosen, so there is nothing that could be free of a regression.",
    },
    {
      checkId: "evidence-cited",
      passed: evidenceComplete,
      reason: evidenceComplete
        ? `Every required observation was cited (${cited.join(", ")}).`
        : `The observations a sound investigation must cite are not all cited: ${incident.requiredEvidence.filter((e) => !cited.includes(e)).join(", ")}.`,
    },
    {
      checkId: "hypothesis-precedes-fix",
      passed: !!hypothesis && !!choice && hypothesis.seq < choice.seq,
      reason: !hypothesis
        ? "No hypothesis was recorded, so the fix is a guess rather than a debugging step."
        : !choice
          ? "Your attempt does not record the fix you stand behind, so there is no moment for the hypothesis to come before."
          : hypothesis.seq < choice.seq
            ? "Your hypothesis was recorded before the fix you chose — debugging, not a lucky edit."
            : "The fix was chosen before the hypothesis was recorded, which is trial and error.",
    },
  ];
}

/**
 * A stable hash of the attempt's content: the ordered log and the cited
 * evidence, so the receipt binds to the exact attempt that was judged and
 * cannot be replayed over a different one.
 */
export function canonicalAttemptHash(attempt: SubmittedAttempt): string {
  const events = bySeq(attempt.events).map((e) => JSON.stringify([e.seq, e.kind, e.text ?? "", e.fixId ?? ""]));
  const cited = attempt.citedEvidence.slice().sort().map((c) => JSON.stringify(c));
  return codeSha256(`{"events":[${events.join(",")}],"cited":[${cited.join(",")}]}`);
}
