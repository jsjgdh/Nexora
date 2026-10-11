import { JSDOM } from "jsdom";
import { evalDocumentRule, isServerDecidable, type DocLike } from "./vendor/document-rules.js";
import type { CheckDef } from "./vendor/types.js";

/* Server-side verdicts on document checks.
 *
 * The gap this closes: a learner's device uploads its own progress, so the
 * pass list it sends is a claim. Execution checks are already re-decided from
 * the execution service's signed record; the web missions were not, so a
 * client could mark a page or a stylesheet done without the saved draft
 * satisfying a single one of its rules — and web missions are most of the
 * curriculum.
 *
 * The draft itself is the artifact of record, so that is what gets judged:
 * the same declarative rules, evaluated by the identical interpreter the
 * learner's screen runs (vendored from the frontend, so the two can never
 * drift), against the code the server already stores for this mission.
 *
 * The parser is a real one (jsdom, an implementation of the HTML parsing
 * spec), not a tolerant shortcut. That detail is load-bearing rather than
 * pedantic: a lighter parser kept fragment content outside <body> and put a
 * top-level <style> in the body, so `doc-text-match` — the one rule that reads
 * the document's own text — would have answered differently here than in the
 * browser. A verdict a learner can see is correct must not depend on which
 * side did the parsing.
 *
 * What is deliberately *not* decided here is as important as what is, and the
 * split lives in the interpreter rather than in a comment: `scripted` checks
 * need a page to be driven (clicks, input, reads) and `computed-style` needs a
 * real cascade, so both stay the client's own report for now (TODO 2.2), and
 * the interpreter returns null rather than guessing for them.
 *
 * Every failure is refused rather than downgraded: a learner is told which
 * requirement the saved draft does not meet, in the mission's own words.
 */

export interface DocumentVerdict {
  checkId: string;
  /** The check's own label, so the refusal can name what is unmet. */
  label: string;
  passed: boolean;
  /** Learner-readable reason, used verbatim in the 422 when it fails. */
  reason: string;
}

/** The mission's checks that this service can decide from the saved draft. */
export function documentChecks(checks: CheckDef[]): CheckDef[] {
  return checks.filter((c) => isServerDecidable(c.rule));
}

export function verifyDocumentChecks(args: {
  checks: CheckDef[];
  /** The code the server holds for this mission (the learner's saved draft). */
  draftCode: string | null;
}): DocumentVerdict[] {
  const { checks, draftCode } = args;
  const doc = draftCode && draftCode.trim().length > 0 ? parseDraft(draftCode) : null;
  return checks.map((check) => {
    const fail = (reason: string): DocumentVerdict => ({
      checkId: check.id,
      label: check.label,
      passed: false,
      reason,
    });
    if (!doc) {
      // No draft means nothing was ever written down for this mission, so no
      // rule about it can be observed. Refuse, and say the useful thing.
      return fail("there is no saved draft for this mission yet — write your code, press Check, and try again.");
    }
    let passed: boolean;
    try {
      passed = evalDocumentRule(doc, check.rule) === true;
    } catch {
      // A rule the interpreter cannot evaluate is not a rule the learner has
      // satisfied. Failing closed keeps the gate's promise: no pass without
      // the thing that was asked for.
      return fail(check.feedback);
    }
    // On success the mission's feedback would be wrong (it is written for the
    // failure), so a pass gets its own plain sentence.
    return passed
      ? { checkId: check.id, label: check.label, passed: true, reason: "matches the saved draft." }
      : fail(check.feedback);
  });
}

/**
 * The same call the client makes — `parseFromString(code, "text/html")` — so
 * both sides build the same tree from the same bytes. jsdom's document is a
 * structural superset of the interpreter's `DocLike` (the same way the
 * browser's DOM is), so the cast is about variance, not a real mismatch.
 * Nothing here asks it to render: `getComputedStyle` is exactly what the
 * server does not decide.
 */
function parseDraft(code: string): DocLike {
  const document = new JSDOM(code).window.document;
  return document as unknown as DocLike;
}
