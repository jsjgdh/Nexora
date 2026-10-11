import {
  runReceiptPayload,
  type ExecuteResponse,
  type RunFacts,
  type RunReceipt,
} from "@nexora/contracts";
import { codeSha256, signReceipt } from "@nexora/service-kit";
import type { ValidatedJob } from "./validate.js";

/* The evidence half of executing code.
 *
 * Progress is uploaded by the learner's own device, so "this check passed" is a
 * claim, not proof. This service is the one that actually ran the program, so it
 * is the one that can say what happened — it signs the run's facts and the
 * learner's client forwards that receipt to the progress service, which
 * recomputes the mission's execution checks from it. The client can carry a
 * receipt; it cannot produce one.
 *
 * The signing key is the mesh key, which is mandatory in production (service-kit
 * refuses to boot without it). Without a key there is nothing to sign with, and
 * the run is simply not provable: the response carries no receipt, and the
 * progress service records the execution check as unproven rather than trusting
 * a client's word for it. */

/** The key receipts are signed with, or null when this deployment has none. */
export function receiptSigningKey(): string | null {
  return process.env.INTERNAL_API_KEY || null;
}

/**
 * Sign one run.
 *
 * `files` carries a hash of every submitted file, so the receipt is bound to
 * the exact program that ran. That is what stops a learner from running a
 * trivial program and using the receipt to finish a different mission, and it
 * makes an edit-after-running fail closed: the progress service compares the
 * hash of the file it stored for this mission against the hash the runner saw.
 */
export function mintReceipt(
  job: ValidatedJob,
  result: ExecuteResponse,
  meshKey: string,
  now: Date = new Date()
): RunReceipt {
  const facts: RunFacts = {
    language: job.language,
    command: job.command,
    files: job.files.map((f) => ({ path: f.path, sha256: codeSha256(f.content) })),
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated,
    durationMs: result.durationMs,
    phase: result.phase ?? null,
    diagnostics: result.diagnostics ?? [],
    runner: result.runner,
  };
  const issuedAt = now.toISOString();
  return { v: 1, issuedAt, facts, sig: signReceipt(runReceiptPayload(facts, issuedAt), meshKey) };
}
