import type { RunAssert, RunOutcome } from "./types";

/* Verdicts over a real execution — pure, framework-free, and DOM-free.
 *
 * Two callers must agree on these rules exactly: the learner's app, which shows
 * the verdict, and the progress service, which recomputes it from the runner's
 * signed record before it will complete an execution mission. If they could
 * drift, a learner would see "passed" while the server recorded otherwise — so
 * the server runs *this* module (vendored by `npm run sync:curriculum`),
 * not a second implementation of the same idea.
 *
 * Everything here reads the runner's own output. Nothing reads the client's
 * opinion, and nothing is inferred: if the assertion asks for output, absent
 * output fails.
 */

/**
 * Does the program's own output satisfy every assertion?
 *
 * An empty assertion list is not a pass: a check that asserts nothing proves
 * nothing, and must never be able to complete a mission.
 */
export function evaluateRunAssertions(outcome: RunOutcome, assertions: RunAssert[]): boolean {
  if (assertions.length === 0) return false;
  return assertions.every((a) => {
    switch (a.target) {
      case "stdout":
        return textMatches(outcome.stdout, a);
      case "stderr":
        return textMatches(outcome.stderr, a);
      case "exitCode": {
        const ok = outcome.exitCode === (a.code ?? 0);
        return a.not ? !ok : ok;
      }
      case "diagnostics": {
        const ok = diagnosticsMatch(outcome, a);
        return a.not ? !ok : ok;
      }
    }
  });
}

function textMatches(text: string, a: RunAssert): boolean {
  const trimmed = text.trim();
  let ok: boolean;
  if (a.equals !== undefined) ok = trimmed === a.equals.trim();
  else if (a.matches !== undefined) ok = safeRegex(a.matches).test(trimmed);
  else ok = trimmed.length > 0; // "produced output"
  return a.not ? !ok : ok;
}

function diagnosticsMatch(outcome: RunOutcome, a: RunAssert): boolean {
  const list = outcome.diagnostics;
  if (a.kind) {
    return list.some(
      (d) => d.kind === a.kind && (a.matches === undefined || safeRegex(a.matches).test(d.message))
    );
  }
  if (a.matches !== undefined) return list.some((d) => safeRegex(a.matches!).test(d.message));
  if (a.phase !== undefined) return outcome.phase === a.phase;
  return list.length > 0;
}

/** A malformed pattern fails the assertion rather than throwing the check. */
export function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return /(?!)/; // never matches
  }
}
