import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/* Signing and verification of run receipts — the evidence that the platform,
   not the client, ran a learner's program.

   The threat this closes: progress is uploaded by the learner's own device, so
   any "this check passed" list it sends is a claim, not proof. A learner could
   claim to have run Go without running it. The execution service therefore
   signs what it observed, and the progress service recomputes the check from
   that signed record. The client can forward a receipt; it can never mint or
   edit one.

   The key is derived from the mesh key rather than being the mesh key itself:
   the mesh key authenticates service-to-service calls, and signing evidence is
   a different job. Deriving means no new secret to deploy, and one purpose
   cannot be replayed as the other. */

const RECEIPT_PURPOSE = "nexora/run-receipt/v1";

/** How long a run receipt stays acceptable. A learner finishes a mission
    seconds after running it; a stale receipt means the work is old. */
export const RECEIPT_MAX_AGE_MS = 30 * 60 * 1000;

/** Tolerated clock skew between services, forward only. */
const CLOCK_SKEW_MS = 60 * 1000;

export function receiptKey(meshKey: string): Buffer {
  return createHmac("sha256", meshKey).update(RECEIPT_PURPOSE).digest();
}

/** The signature for an exact payload string. Deterministic. */
export function signReceipt(payload: string, meshKey: string): string {
  return createHmac("sha256", receiptKey(meshKey)).update(payload).digest("hex");
}

/**
 * Constant-time comparison of a receipt signature. Returns false for anything
 * that is not a well-formed signature of the expected length, so a malformed
 * header cannot short-circuit into an exception.
 */
export function verifyReceiptSignature(payload: string, sig: string, meshKey: string): boolean {
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = createHmac("sha256", receiptKey(meshKey)).update(payload).digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** Is the receipt recent enough to count as this session's work? */
export function receiptFresh(issuedAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  if (t > now + CLOCK_SKEW_MS) return false;
  return now - t <= RECEIPT_MAX_AGE_MS;
}

/**
 * Hash of submitted source, normalized so the two sides agree.
 *
 * The execution service hashes the file it ran; the progress service hashes the
 * draft it stored. Line endings are the one difference that appears in practice
 * (a browser and a container can disagree), so CRLF is normalized before
 * hashing. Everything else is byte-exact on purpose: if the learner edited after
 * running, the hashes must differ, and the completion is refused until they run
 * the code they actually have.
 */
export function codeSha256(code: string): string {
  return createHash("sha256").update(code.replace(/\r\n/g, "\n")).digest("hex");
}
