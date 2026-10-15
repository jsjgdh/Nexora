import { createHash, createHmac, createPublicKey, sign, timingSafeEqual, verify } from "node:crypto";

/* Signing and verification of run receipts — the evidence that the platform,
   not the client, ran a learner's program.

   The threat this closes: IDE runs happen on the learner's own device, so
   any "this check passed" list it sends is a claim, not proof. A learner could
   claim to have run the suite without running it. The execution service therefore
   signs what it observed, and attestation re-judges from that signed record.
   The client can forward a receipt; it can never mint or edit one.

   The key is derived from the mesh key rather than being the mesh key itself:
   the mesh key authenticates service-to-service calls, and signing evidence is
   a different job. Deriving means no new secret to deploy, and one purpose
   cannot be replayed as the other. */

const RECEIPT_PURPOSE = "nexora/run-receipt/v1";

/** How long a run receipt stays acceptable. An attestation arrives seconds
    after the run it proves; a stale receipt means the work is old. */
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

/* ---------- Offline third-party verification (B-24) ---------- */

/* The HMAC above proves the platform issued a receipt, but only to someone
   holding the mesh-derived secret — handing a stranger the secret so they can
   verify would let them forge. So receipts carry a second signature, Ed25519
   over the same payload bytes, whose public key is published. A stranger with
   the receipt and the public key re-derives the verdict without asking the
   platform anything and without learning anything that mints. The HMAC stays:
   mesh-internal checks keep their existing shape, and a receipt from before
   the migration still verifies on the old signature. */

/** Sign the exact payload bytes with an Ed25519 private key (PKCS#8 PEM or JWK). */
export function signReceiptEd(payload: string, privateKey: string): string {
  return sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
}

/** Verify an Ed25519 receipt signature against the published public key. False for anything malformed. */
export function verifyReceiptEd(payload: string, sigB64: string, publicKey: string): boolean {
  let sig: Buffer;
  try {
    sig = Buffer.from(sigB64, "base64");
    if (sig.length !== 64) return false;
  } catch {
    return false;
  }
  try {
    return verify(null, Buffer.from(payload, "utf8"), publicKey, sig);
  } catch {
    return false;
  }
}

/** Derive the publishable public key (SPKI PEM) from the operator-held private key. */
export function receiptEdPublicKey(privateKey: string): string {
  return createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
}

/**
 * Hash of submitted source, normalized so the two sides agree.
 *
 * The execution service hashes the file it ran; attestation hashes the
 * submission it received. Line endings are the one difference that appears in
 * practice, so CRLF is normalized before hashing. Everything else is
 * byte-exact on purpose: if the learner edited after running, the hashes must
 * differ, and attestation is refused until they run the code they actually have.
 */
export function codeSha256(code: string): string {
  return createHash("sha256").update(code.replace(/\r\n/g, "\n")).digest("hex");
}
