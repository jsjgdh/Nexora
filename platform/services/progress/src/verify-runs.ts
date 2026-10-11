import { runReceiptPayload, type RunReceipt } from "@nexora/contracts";
import { codeSha256, receiptFresh, verifyReceiptSignature } from "@nexora/service-kit";
import { evaluateRunAssertions } from "./vendor/run-evidence.js";
import type { CheckDef, RunOutcome } from "./vendor/types.js";

/* Server-side verdicts on execution checks.
 *
 * The problem this solves: a learner's device uploads their own progress, so a
 * pass list it sends is a claim. Before this, an execution check — the only
 * kind of check that proves someone can actually write and run a program —
 * could be satisfied by editing the upload. Now the only way it passes is a
 * receipt signed by the execution service, whose facts are then re-judged here
 * with the same evaluator the browser uses (vendored from the frontend, so the
 * two can never drift).
 *
 * Every failure below is refused rather than downgraded. A learner sees which
 * one applies, in words that say what to do: run the program again. */

export interface RunVerdict {
  checkId: string;
  passed: boolean;
  /** Learner-readable reason, used verbatim in the 422 when it fails. */
  reason: string;
}

/** Where the learner's own file sits in a submission (the runner's default too). */
export function entryPathFor(fileName: string | undefined): string {
  return fileName ?? "main.go";
}

export function verifyRunEvidence(args: {
  check: CheckDef;
  receipt: RunReceipt | null | undefined;
  meshKey: string;
  /** The code the server holds for this mission (the learner's draft). */
  draftCode: string;
  entryPath: string;
  now?: number;
}): RunVerdict {
  const { check, receipt, meshKey, draftCode, entryPath, now = Date.now() } = args;
  const fail = (reason: string): RunVerdict => ({ checkId: check.id, passed: false, reason });

  if (check.rule.kind !== "runs") {
    // Not reachable from the caller (it selects runs checks), and if it ever
    // became reachable the safe answer is still "not proven".
    return fail("is not an execution check, so it cannot be decided from a run.");
  }
  if (!receipt) {
    return fail("has no record of a run from this platform — run the program, then finish.");
  }
  const payload = runReceiptPayload(receipt.facts, receipt.issuedAt);
  if (!verifyReceiptSignature(payload, receipt.sig, meshKey)) {
    return fail("came with a run record this platform did not issue.");
  }
  if (!receiptFresh(receipt.issuedAt, now)) {
    return fail("was run more than 30 minutes ago — run the program again so the platform can confirm it.");
  }
  const ran = receipt.facts.files.find((f) => f.path === entryPath);
  if (!ran) {
    return fail(`was not run together with ${entryPath}, so it does not show this mission's own work.`);
  }
  if (ran.sha256 !== codeSha256(draftCode)) {
    // The receipt is genuine but describes a different program than the one
    // saved for this mission: the learner edited after running. Refusing here
    // is the honest answer, and re-running is one keystroke.
    return fail("was run on different code than the version saved here — run your current code, then finish.");
  }
  // A valid runner signature proves what was executed, not that the browser
  // supplied the mission's real test suite. Bind every fixture (and the full
  // submitted file set) to the curriculum before trusting its output.
  const fixtures = check.rule.harness ?? [];
  const expectedPaths = new Set([entryPath, ...fixtures.map((f) => f.path)]);
  if (expectedPaths.size !== fixtures.length + 1 || receipt.facts.files.length !== expectedPaths.size) {
    return fail("was run with a different set of files than this mission supplies — restore the starter files and run again.");
  }
  for (const fixture of fixtures) {
    const file = receipt.facts.files.find((f) => f.path === fixture.path);
    if (!file || file.sha256 !== codeSha256(fixture.content)) {
      return fail("was run with a changed or missing mission test fixture — run the supplied test suite again.");
    }
  }
  if (receipt.facts.files.some((f) => !expectedPaths.has(f.path))) {
    return fail("was run with extra files not supplied by this mission — run the supplied files again.");
  }
  const outcome: RunOutcome = {
    ran: true,
    stdout: receipt.facts.stdout,
    stderr: receipt.facts.stderr,
    exitCode: receipt.facts.exitCode,
    timedOut: receipt.facts.timedOut,
    diagnostics: receipt.facts.diagnostics,
    phase: receipt.facts.phase,
    durationMs: receipt.facts.durationMs,
  };
  const passed = evaluateRunAssertions(outcome, check.rule.assertions);
  return {
    checkId: check.id,
    passed,
    reason: passed
      ? "verified against the program's own output."
      : `ran, but its output did not meet “${check.label}” — read the output pane, not your code, to see what it actually printed.`,
  };
}
