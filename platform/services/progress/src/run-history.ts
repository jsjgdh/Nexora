import {
  runReceiptPayload,
  type ExecDiagnostic,
  type RunHistoryEntry,
  type RunReceipt,
} from "@nexora/contracts";
import { codeSha256, verifyReceiptSignature } from "@nexora/service-kit";

/* Submission history: the platform's record of every run it performed.
 *
 * A run receipt is a capability — the client forwards it, the platform spends
 * it, and it proves an execution check at completion. What it does not do is
 * leave anything behind: a learner who ran their program, closed the tab, and
 * opened a mission on another laptop had no way to read back what they tried.
 * This module turns a forwarded receipt into a durable record for exactly that
 * purpose, and nothing more.
 *
 * Two rules keep the record honest:
 *
 *   - A row is only ever written from a receipt this platform signed. The
 *     signature is the whole claim: without it we would be storing whatever a
 *     client asserted about a run, which is the thing the receipt exists to
 *     stop. No signing key therefore means no record at all — refusing is the
 *     honest answer, not a best-effort write.
 *
 *   - The run must include the mission's own entry file, so a history entry
 *     cannot be misfiled against a mission whose work it does not show.
 *
 * Deliberately *not* a verdict: freshness is not required here. The 30-minute
 * window in verify-runs.ts exists because a completion is a claim about what
 * the learner can do now; an attempt transcript is a claim about what
 * happened, and a run recorded an hour later is still a true record of that
 * run. Recording never marks a check as passed — the completion path still
 * asks for a fresh receipt before it will believe one.
 */

export interface RecordVerdict {
  ok: boolean;
  /** Learner-readable reason, used verbatim in the 422 when it fails. */
  reason: string;
}

export function recordableRun(args: {
  receipt: RunReceipt | null | undefined;
  meshKey: string;
  /** The mission's own file, as verify-runs.ts defines it. */
  entryPath: string;
}): RecordVerdict {
  const { receipt, meshKey, entryPath } = args;
  if (!receipt) {
    return { ok: false, reason: "it carries no record of a run from this platform." };
  }
  const payload = runReceiptPayload(receipt.facts, receipt.issuedAt);
  if (!verifyReceiptSignature(payload, receipt.sig, meshKey)) {
    return { ok: false, reason: "it came with a run record this platform did not issue." };
  }
  const ran = receipt.facts.files.find((f) => f.path === entryPath);
  if (!ran) {
    return {
      ok: false,
      reason: `it was not run together with ${entryPath}, so it does not show this mission's own work.`,
    };
  }
  return { ok: true, reason: "signed by this platform's execution service." };
}

/** Everything a history row holds, derived from the receipt it came from. */
export interface RunRecordValues {
  entryPath: string;
  entrySha256: string;
  language: string;
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  phase: "compile" | "run" | null;
  diagnostics: ExecDiagnostic[];
  runner: string;
  receiptSig: string;
  issuedAt: string;
}

/**
 * The row's values, read from the receipt.
 *
 * The caller has already accepted the run (see `recordableRun`); this only
 * copies facts out of the signed payload, so nothing a client sent directly
 * reaches the table.
 */
export function runRecordValues(receipt: RunReceipt, entryPath: string): RunRecordValues {
  const { facts } = receipt;
  const ran = facts.files.find((f) => f.path === entryPath);
  if (!ran) {
    // Unreachable: recordableRun refuses first. Fail loudly rather than write a
    // row whose hash describes no file.
    throw new Error(`run receipt has no entry file ${entryPath}`);
  }
  return {
    entryPath,
    entrySha256: ran.sha256,
    language: facts.language,
    command: facts.command,
    stdout: facts.stdout,
    stderr: facts.stderr,
    exitCode: facts.exitCode,
    timedOut: facts.timedOut,
    truncated: facts.truncated,
    durationMs: facts.durationMs,
    phase: facts.phase,
    diagnostics: facts.diagnostics,
    runner: facts.runner,
    receiptSig: receipt.sig,
    issuedAt: receipt.issuedAt,
  };
}

/** A `mission_runs` row, as pg returns it. */
export interface RunHistoryRow {
  id: string | number;
  mission_id: string;
  check_ids: string[] | null;
  language: string;
  command: string[] | null;
  entry_path: string;
  entry_sha256: string;
  draft_sha256: string | null;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
  duration_ms: number;
  phase: "compile" | "run" | null;
  diagnostics: ExecDiagnostic[] | null;
  runner: string;
  issued_at: Date | string;
  recorded_at: Date | string;
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/**
 * Row → what a client reads.
 *
 * `receipt_sig` is left out on purpose: it is the capability the platform
 * accepts at completion, and a history read must not hand one back. The facts
 * are what makes the transcript useful; the signature stays here.
 */
export function runRowToView(r: RunHistoryRow): RunHistoryEntry {
  const draftSha256 = r.draft_sha256 ?? null;
  return {
    id: Number(r.id),
    missionId: r.mission_id,
    checkIds: r.check_ids ?? [],
    language: r.language as RunHistoryEntry["language"],
    command: r.command ?? [],
    entryPath: r.entry_path,
    entrySha256: r.entry_sha256,
    draftSha256,
    matchesSavedDraft: draftSha256 !== null && draftSha256 === r.entry_sha256,
    stdout: r.stdout,
    stderr: r.stderr,
    exitCode: r.exit_code,
    timedOut: r.timed_out,
    truncated: r.truncated,
    durationMs: r.duration_ms,
    phase: r.phase,
    diagnostics: r.diagnostics ?? [],
    runner: r.runner,
    issuedAt: iso(r.issued_at),
    recordedAt: iso(r.recorded_at),
  };
}

/**
 * The hash of the draft the server holds, or null when it holds none.
 *
 * Normalized through the same `codeSha256` the runner hashed its submission
 * with, so "did they edit after running?" is one comparison and both sides
 * answer it identically. Exported for the route and its tests.
 */
export function draftSha256Of(code: string | null | undefined): string | null {
  return code === null || code === undefined ? null : codeSha256(code);
}

/** How much history a single read returns, and how much it will ever return. */
export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 100;

/**
 * The page size a read asked for.
 *
 * Clamped rather than rejected: a client asking for more than the cap gets the
 * cap, and a nonsense value gets the default. A read must never fail because
 * of how much it asked for.
 */
export function historyLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return HISTORY_DEFAULT_LIMIT;
  return Math.min(n, HISTORY_MAX_LIMIT);
}
