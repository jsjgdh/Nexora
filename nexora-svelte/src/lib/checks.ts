import type { CheckDef, HarnessObs, RunOutcome } from "./types";
import { evaluateAssertions } from "./harness";
import { evaluateRunAssertions } from "./run-evidence";
import { evalDocumentRule, type DocLike } from "./document-rules";

/* The run-evidence verdicts live in run-evidence.ts (pure, DOM-free) because
   the progress service recomputes execution checks with the same code. They are
   re-exported here so callers keep one import for “decide these checks”. */
export { evaluateRunAssertions } from "./run-evidence";

export interface CheckOutcome {
  checkId: string;
  label: string;
  passed: boolean;
  /** On failure: the check's actionable feedback. On success: confirmation. */
  message: string;
}

/**
 * Deterministic assessment: parse the learner's HTML with DOMParser and
 * evaluate declarative rules. No LLM, no hidden test code in the client
 * beyond these generic, inspectable rule interpreters.
 *
 * @param liveDoc Optional rendered document (the sandboxed preview) used by
 *   `computed-style` rules. The preview runs with scripts blocked, so reading
 *   computed styles from it is a safe, deterministic observation.
 * @param scriptObs Optional harness observations keyed by check id, used by
 *   `scripted` rules. Absent observations fail closed (press Check to run).
 * @param runObs Optional real-execution outcomes keyed by check id, used by
 *   `runs` rules. Absent, failed, or unrun outcomes fail closed: a check can
 *   never pass without the evidence it asks for.
 */
export function runChecks(
  code: string,
  checks: CheckDef[],
  liveDoc: Document | null = null,
  scriptObs: Map<string, HarnessObs[]> | null = null,
  runObs: Map<string, RunOutcome> | null = null
): CheckOutcome[] {
  const doc = new DOMParser().parseFromString(code, "text/html");
  return checks.map((check) => {
    try {
      const passed = evalRule(doc, check.rule, liveDoc, check.id, scriptObs, runObs);
      return {
        checkId: check.id,
        label: check.label,
        passed,
        message: passed ? `${check.label} — passed.` : check.feedback,
      };
    } catch {
      return {
        checkId: check.id,
        label: check.label,
        passed: false,
        message: check.feedback,
      };
    }
  });
}

/**
 * One rule, one document. The document kinds are interpreted by
 * `document-rules.ts` — the same module the progress service runs when it
 * re-derives a submission — and the two kinds that need equipment this file
 * has are decided here: `scripted` from the harness round-trip, `runs` from a
 * real execution (the client reads that from a signed receipt).
 *
 * Absent evidence fails closed in both cases: a check can never pass without
 * what it asks for.
 */
function evalRule(
  doc: Document,
  rule: CheckDef["rule"],
  liveDoc: Document | null,
  checkId: string,
  scriptObs: Map<string, HarnessObs[]> | null,
  runObs: Map<string, RunOutcome> | null
): boolean {
  // The narrow surface the shared interpreter declares; the browser's DOM is a
  // superset of it, so this cast is about variance, not about a mismatch.
  const verdict = evalDocumentRule(doc as unknown as DocLike, rule, liveDoc as unknown as DocLike);
  if (verdict !== null) return verdict;
  switch (rule.kind) {
    case "scripted": {
      // Observations come from the harness round-trip; missing data fails
      // closed so a check can never pass without executing.
      if (!scriptObs) return false;
      const obs = scriptObs.get(checkId);
      if (!obs) return false;
      const byId = new Map(obs.map((o) => [o.id, o]));
      return evaluateAssertions(byId, rule.assertions);
    }
    case "runs": {
      // The program must actually have run, and the assertions read what it
      // did. No run, no pass — the same fail-closed rule as `scripted`.
      if (!runObs) return false;
      const outcome = runObs.get(checkId);
      if (!outcome || !outcome.ran) return false;
      return evaluateRunAssertions(outcome, rule.assertions);
    }
    // evalDocumentRule returned false rather than null for every other kind.
    default:
      return false;
  }
}
