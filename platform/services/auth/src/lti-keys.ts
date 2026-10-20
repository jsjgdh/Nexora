import { createCipheriv, createDecipheriv, createHmac, createPublicKey, randomBytes, randomUUID, type webcrypto } from "node:crypto";
import jwt from "jsonwebtoken";
import { sha256 } from "@nexora/service-kit";

/* LTI 1.3 keys and secrets: the tool's own key pair, the LMS's published
 * keys, and the seal on the client secret.
 *
 * Who signs what in LTI 1.3, stated once so the rest of the module does not
 * have to restate it:
 *
 *   The LMS is the platform, we are the client. The LMS signs the id token
 *   with its own key and publishes that key at a JWKS URI we were told about
 *   when the deployment was registered. We verify the launch against those
 *   keys and against nothing else.
 *
 *   Our own key pair is the other half: it signs the client assertion the
 *   platform presents to the LMS's token endpoint, and its public half is
 *   published at our JWKS so the LMS can check what we signed. It never signs
 *   an id token, because the id token is the LMS's to issue.
 *
 * LTI.md describes this the other way round (the tool signs the id token and
 * validates it against our own JWKS). That is not how LTI 1.3 works, and the
 * shape it describes would have the tool verifying its own signature, which
 * proves nothing about who sent the launch. The implementation follows LTI
 * 1.3: the LMS signs, we verify against the LMS's published keys.
 */

/** The signature algorithms a launch may carry. `none` and the HMAC family are not in the list, and the list is not configurable. */
export const LAUNCH_ALGORITHMS = ["RS256", "ES256"] as const;

/** How long a fetched key set is trusted before it is fetched again. */
const JWKS_TTL_MS = 5 * 60_000;

/** How long a key fetch may take before the launch is refused. */
const JWKS_TIMEOUT_MS = 5_000;

/** A refusal that names the reason, and never the value that caused it. */
export class LtiRefusal extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.reason = reason;
  }
}

/* ---------- the tool's own key pair ---------- */

/** The operator-held key the platform signs with, or null when this deployment has none. */
export function toolKey(): { kid: string; privateKey: string } | null {
  const pem = process.env.LTI_TOOL_KEY?.replace(/\\n/g, "\n");
  if (!pem) return null;
  return { kid: process.env.LTI_TOOL_KEY_ID ?? "tool-1", privateKey: pem };
}

/**
 * The tool's public key set, as a JWKS.
 *
 * Published so the LMS can check the client assertion we sign with the
 * private half. The private half never leaves this process.
 */
export function toolJwks(): { keys: Record<string, string>[] } | null {
  const key = toolKey();
  if (!key) return null;
  const jwk = createPublicKey(key.privateKey).export({ format: "jwk" }) as Record<string, string>;
  return {
    keys: [
      {
        ...jwk,
        kid: key.kid,
        use: "sig",
        alg: jwk.kty === "EC" ? "ES256" : "RS256",
      },
    ],
  };
}

/**
 * The client assertion the platform presents to a course's token endpoint.
 *
 * Some courses want a signed assertion rather than a shared secret, and that
 * is what the tool's own key pair is for: the assertion names the client id
 * as both issuer and subject, the token endpoint as the audience, and is
 * signed with the private half whose public half the course reads from our
 * JWKS. One assertion per request, and it says nothing the client id does
 * not already say.
 */
export function clientAssertion(
  clientId: string,
  tokenUrl: string,
  key: { kid: string; privateKey: string }
): string {
  let audience: string;
  try {
    audience = new URL(tokenUrl).origin;
  } catch {
    audience = tokenUrl;
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: clientId,
      sub: clientId,
      aud: audience,
      jti: randomUUID(),
      iat: now,
      exp: now + 300,
    },
    key.privateKey,
    { algorithm: "RS256", keyid: key.kid }
  );
}

/* ---------- the client secret, sealed ---------- */
/**
 * The key the client secret is sealed with, derived from the mesh key.
 *
 * The same discipline the receipt signing uses: a purpose string mixed into
 * the mesh key, so the credential that authenticates service-to-service calls
 * cannot be replayed as the credential that decrypts a stored secret. There is
 * no new secret to deploy, and no second key to rotate.
 */
function sealKey(): Buffer {
  const meshKey = process.env.INTERNAL_API_KEY ?? "";
  if (!meshKey) throw new Error("no mesh key: the client secret cannot be sealed");
  return createHmac("sha256", meshKey).update("nexora/lti-client-secret/v1").digest();
}

/** Seal a client secret for storage. The output is iv, tag and ciphertext, base64url. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Open a sealed client secret. Throws when the seal does not hold. */
export function openSecret(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new Error("the sealed secret is malformed");
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/* ---------- the LMS's published keys ---------- */

interface Jwk {
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
}

const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

/**
 * The LMS's key set, fetched from the URI the deployment was registered with.
 *
 * Cached for five minutes, because a launch is a hot path and the key set
 * changes rarely. A key id that is not in the cached set triggers one fresh
 * fetch before the launch is refused, because a rotated key is the ordinary
 * reason for a miss and a miss is not evidence of a forgery.
 */
export async function fetchJwks(url: string, fresh = false): Promise<Jwk[]> {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (!fresh && cached && now - cached.at < JWKS_TTL_MS) return cached.keys;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(JWKS_TIMEOUT_MS) });
  } catch {
    throw new LtiRefusal("jwks_unavailable", "The course's published keys could not be reached.");
  }
  if (!response.ok) {
    throw new LtiRefusal("jwks_unavailable", "The course's published keys could not be read.");
  }
  let body: { keys?: unknown };
  try {
    body = (await response.json()) as { keys?: unknown };
  } catch {
    throw new LtiRefusal("jwks_unavailable", "The course's published keys could not be read.");
  }
  const keys = Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
  if (keys.length === 0) {
    throw new LtiRefusal("jwks_unavailable", "The course's published keys could not be read.");
  }
  jwksCache.set(url, { at: now, keys });
  return keys;
}

/** Forget the cached key sets. Used by the suite and by a key rotation. */
export function resetJwksCache(): void {
  jwksCache.clear();
}

/**
 * Verify a launch token against the LMS's published keys and the deployment's
 * own claims, and return the claims.
 *
 * Every check here is fail closed, and every refusal is a refusal of the
 * whole launch rather than a warning:
 *
 *   - the algorithm is one of RSA or ECDSA, never `none` and never an HMAC;
 *   - the signature verifies against a key the LMS published;
 *   - the issuer is the registered issuer, exactly;
 *   - the audience is the registered client id;
 *   - the token has not expired (jsonwebtoken checks `exp` and `nbf`);
 *   - the deployment id in the token is the deployment the launch was started
 *     for;
 *   - the nonce is the one this state was issued with.
 */
export function verifyLaunchToken(
  token: string,
  keys: Jwk[],
  expected: { issuer: string; audience: string; deploymentId: string; nonceHash: string }
): Record<string, unknown> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new LtiRefusal("malformed_launch", "The launch could not be read.");
  }
  const header = decoded.header as { alg?: string; kid?: string };
  if (!header.alg || !(LAUNCH_ALGORITHMS as readonly string[]).includes(header.alg)) {
    throw new LtiRefusal("bad_algorithm", "The launch was refused: its signature algorithm is not one we accept.");
  }
  const candidates = keys.filter((k) => {
    if (k.use && k.use !== "sig") return false;
    if (k.alg && k.alg !== header.alg) return false;
    if (!header.kid) return true;
    return !k.kid || k.kid === header.kid;
  });
  const chosen = candidates.length === 1 ? candidates[0] : candidates.find((k) => k.kid && k.kid === header.kid);
  if (!chosen) {
    throw new LtiRefusal("unknown_key", "The launch was refused: it was signed by a key the course has not published.");
  }
  let publicKey;
  try {
    publicKey = createPublicKey({ key: chosen as unknown as webcrypto.JsonWebKey, format: "jwk" });
  } catch {
    throw new LtiRefusal("unknown_key", "The launch was refused: it was signed by a key the course has not published.");
  }
  let claims: Record<string, unknown>;
  try {
    claims = jwt.verify(token, publicKey, {
      algorithms: [...LAUNCH_ALGORITHMS],
      issuer: expected.issuer,
      audience: expected.audience,
      clockTolerance: 30,
    }) as Record<string, unknown>;
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    const message = (err as { message?: string }).message ?? "";
    if (name === "TokenExpiredError") {
      throw new LtiRefusal("expired_launch", "The launch was refused: it has expired.");
    }
    if (message.includes("audience")) {
      throw new LtiRefusal("wrong_audience", "The launch was refused: it was not issued for this course.");
    }
    if (message.includes("issuer")) {
      throw new LtiRefusal("wrong_issuer", "The launch was refused: it was issued by another platform.");
    }
    throw new LtiRefusal("bad_signature", "The launch was refused: its signature does not verify.");
  }
  /* The deployment id and the nonce are checked here rather than in the
     signature, because they are claims about the launch rather than about the
     signature: a token signed by the right key but naming another deployment
     is still a launch we did not start. */
  if (expected.deploymentId && claims["https://purl.imsglobal.org/spec/lti/claim/deployment_id"] !== expected.deploymentId) {
    throw new LtiRefusal("deployment_mismatch", "The launch was refused: it names a deployment this course has not registered.");
  }
  if (sha256(String(claims.nonce ?? "")) !== expected.nonceHash) {
    throw new LtiRefusal("nonce_mismatch", "The launch was refused: it carries a nonce we did not issue.");
  }
  return claims;
}
