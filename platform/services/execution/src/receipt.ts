import {
  designReceiptPayload,
  runReceiptPayload,
  type DesignFacts,
  type DesignReceipt,
  type ExecuteResponse,
  type RunFacts,
  type RunReceipt,
} from "@nexora/contracts";
import { codeSha256, receiptEdPublicKey, signReceipt, signReceiptEd } from "@nexora/service-kit";
import type { ValidatedJob } from "./validate.js";

/* The evidence half of executing code.
 *
 * IDE runs happen on the learner's own device, so "this check passed" is a
 * claim, not proof. This service is the one that actually ran the program, so it
 * is the one that can say what happened — it signs the run's facts and
 * attestation re-judges from that signed record. The client can carry a
 * receipt; it cannot produce one.
 *
 * The signing key is the mesh key, which is mandatory in production (service-kit
 * refuses to boot without it). Without a key there is nothing to sign with, and
 * the run is simply not provable: the response carries no receipt, and
 * attestation stays unavailable rather than trusting a client's word for it. */

/** The key receipts are signed with, or null when this deployment has none. */
export function receiptSigningKey(): string | null {
  return process.env.INTERNAL_API_KEY || null;
}

/* The operator-held Ed25519 receipt key (PKCS#8 PEM), or null when this
   deployment has none. Unlike the mesh key it is never derived and never
   shared: it lives in this service's environment only, and its public half is
   what strangers verify against. Absent, receipts carry the HMAC alone and
   `/verify-key` answers 503 — offline verification is unavailable, not faked. */
export function receiptEdKey(): string | null {
  return process.env.RECEIPT_ED25519_KEY || null;
}

/** The published key id, naming which key signed. Defaults so rotation has a name to use. */
export function receiptKeyId(): string {
  return process.env.RECEIPT_KEY_ID || "ed1";
}

/**
 * Sign one run.
 *
 * `files` carries a hash of every submitted file, so the receipt is bound to
 * the exact program that ran. That is what stops a learner from running a
 * trivial program and spending the receipt on different work, and it makes an
 * edit-after-running fail closed: attestation compares the hash of the
 * submitted file against the hash the runner saw.
 */
export function mintReceipt(
  job: ValidatedJob,
  result: ExecuteResponse,
  meshKey: string,
  now: Date = new Date(),
  userId?: string
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
    // Bound when the caller knows whose work this is; omitted otherwise, so
    // older callers mint byte-identical receipts to before.
    ...(userId === undefined ? {} : { userId }),
  };
  const issuedAt = now.toISOString();
  const payload = runReceiptPayload(facts, issuedAt);
  const receipt: RunReceipt = { v: 1, issuedAt, facts, sig: signReceipt(payload, meshKey) };
  // Second signature when the operator configured a receipt key. Its absence
  // is not a failure — HMAC-only receipts from before the migration still
  // verify — but its presence is what makes this receipt checkable offline.
  const edKey = receiptEdKey();
  if (edKey) {
    receipt.sigEd = signReceiptEd(payload, edKey);
    receipt.keyId = receiptKeyId();
  }
  return receipt;
}

/* The evidence half of judging a design. A design verdict is the structural
   analogue of a run receipt: the platform re-derived the deterministic checks
   over the graph itself, so it can sign that outcome the same way it signs a
   run. It carries the challenge id, a canonical hash of the graph, and which
   structural checks held — never a rubric weight and never a model score, so
   what this signs is exactly the part of a design a machine can re-check. */

/**
 * Sign one design verdict.
 *
 * `graphSha256` binds the receipt to the exact graph that was judged, so it
 * cannot be replayed against a different design. `checks` are the structural
 * results the platform re-derived from its own canonical checks. `sigEd`/
 * `keyId` ride along only when a receipt key is configured; absent, the receipt
 * is HMAC-only — offline verification is unavailable, not faked, exactly as
 * `mintReceipt`.
 */
export function mintDesignReceipt(
  challengeId: string,
  graphSha256: string,
  checks: DesignFacts["checks"],
  meshKey: string,
  now: Date = new Date(),
  userId?: string
): DesignReceipt {
  const facts: DesignFacts = {
    kind: "design",
    challengeId,
    graphSha256,
    checks,
    runner: "platform",
    ...(userId === undefined ? {} : { userId }),
  };
  const issuedAt = now.toISOString();
  const payload = designReceiptPayload(facts, issuedAt);
  const receipt: DesignReceipt = { v: 1, issuedAt, facts, sig: signReceipt(payload, meshKey) };
  const edKey = receiptEdKey();
  if (edKey) {
    receipt.sigEd = signReceiptEd(payload, edKey);
    receipt.keyId = receiptKeyId();
  }
  return receipt;
}

/** The published half of the receipt key, for `GET /verify-key`. Throws when unconfigured. */
export function receiptPublicKey(): { keyId: string; publicKey: string } {
  const edKey = receiptEdKey();
  if (!edKey) throw new Error("receipt key not configured");
  return { keyId: receiptKeyId(), publicKey: receiptEdPublicKey(edKey) };
}
