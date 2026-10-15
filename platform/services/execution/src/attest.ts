import { ApiError } from "@nexora/service-kit";

/* Server-side re-judging for IDE attestation (B-24).
 *
 * Mirrors the extension's `tap.ts` semantics exactly — same TAP line regex,
 * same rule (every named test present AND passing, anything else fails the
 * check). The two copies are asserted equivalent in `scripts/verify.mjs`
 * against shared TAP fixtures, so client and server cannot disagree about
 * what a run decided.
 *
 * What this module refuses, and why:
 * - anything but `node --test [--test-reporter=tap] <test paths>`: the runner
 *   sandbox executes code, and that stays behind the same constrained drivers
 *   as `/execute` — no npm, no shell, no flags that escape the sandbox.
 * - test paths that are not registered canonical suites: the learner owns
 *   their workspace including its test files, so a submitted test is a claim,
 *   not proof. Only the platform's own copy of a suite (registered here from
 *   committed fixtures) may decide a verdict. Unregistered → 503
 *   `attestation_unavailable`, never a pass and never a fail.
 * - a submission file that shadows a registered test path: the canonical copy
 *   always wins; a learner-supplied twin is rejected outright, because
 *   silently preferring one copy would hide which suite actually ran.
 */

export interface TapResult {
  name: string;
  passed: boolean;
}

/** Same regex as the extension's `parseTap`: `ok` / `not ok` lines only. */
export function parseTap(output: string): TapResult[] {
  const out: TapResult[] = [];
  for (const line of output.split("\n")) {
    const m = /^(not )?ok\b(?:\s+\d+)?(?:\s+-\s+|\s+)(.+?)\s*$/.exec(line.trim());
    if (!m) continue;
    out.push({ name: (m[2] ?? "").trim(), passed: !m[1] });
  }
  return out;
}

export interface AttestCheck {
  id: string;
  tests: string[];
}

/** Same rule as the extension's `judgeChecks`: present AND passing, else fail. */
export function judgeAttestChecks(
  checks: AttestCheck[],
  results: TapResult[]
): { checkId: string; passed: boolean; reason: string }[] {
  const byName = new Map(results.map((r) => [r.name, r.passed]));
  return checks.map((c) => {
    const missing = c.tests.filter((t) => !byName.has(t));
    const failing = c.tests.filter((t) => byName.get(t) === false);
    if (missing.length === 0 && failing.length === 0) {
      return { checkId: c.id, passed: true, reason: "Verified against your code, re-run on this platform." };
    }
    if (missing.length > 0) {
      return {
        checkId: c.id,
        passed: false,
        reason: `No run on record for: ${missing.join(", ")}.`,
      };
    }
    return { checkId: c.id, passed: false, reason: "The platform's re-run did not pass." };
  });
}

/**
 * Allowlist an IDE test command into runnable argv.
 *
 * Accepts exactly `node --test [--test-reporter=tap] <paths...>`, where every
 * path is a relative `.test.mjs` path with no escapes. Returns the argv tail
 * (after `node`). Anything else is a 400: the sandbox runs code, so the
 * command shape is validated before anything is written to disk.
 */
export function resolveAttestArgv(command: string): string[] {
  const parts = command.trim().split(/\s+/);
  if (parts[0] !== "node" || parts[1] !== "--test") {
    throw new ApiError(400, "bad_request", "Attestation runs `node --test` suites only.");
  }
  const rest = parts.slice(2).filter((p) => p !== "--test-reporter=tap");
  if (rest.length === 0 || rest.length > 8) {
    throw new ApiError(400, "bad_request", "Name the test file(s) to run (1–8).");
  }
  for (const p of rest) {
    if (p.startsWith("-") || p.includes("\0")) {
      throw new ApiError(400, "bad_request", `Invalid test path: ${p}`);
    }
    const norm = p.replace(/\\/g, "/");
    if (norm.startsWith("/") || norm.includes("..") || !norm.endsWith(".test.mjs")) {
      throw new ApiError(400, "bad_request", `Invalid test path: ${p}`);
    }
  }
  return ["--test", "--test-reporter=tap", ...rest];
}
