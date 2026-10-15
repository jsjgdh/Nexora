import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { assertSecret } from "@nexora/service-kit";

function rounds(): number {
  const v = Number(process.env.BCRYPT_ROUNDS ?? "12");
  return Number.isFinite(v) && v >= 4 && v <= 15 ? Math.floor(v) : 12;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, rounds());
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false; // malformed hash can never authenticate
  }
}

/* A real bcrypt hash of a secret nobody holds, for the sign-in path to compare
 * against when there is nothing to compare with.
 *
 * `/login` answers unknown emails, Clerk-managed accounts and wrong passwords
 * with one identical body, and that was only half the job: skipping the compare
 * for the first two made those answers arrive in a fraction of the time, which is
 * an oracle for exactly what the identical body was hiding — whether an account
 * exists, and whether it has a password at all. So an absent hash is replaced by
 * this one and the work happens anyway.
 *
 * Built lazily, once per process, at the deployment's own cost factor (`rounds()`),
 * so the dummy compare is never cheaper *or dearer* than a real one: a hard-coded
 * 12-round constant would itself become the oracle on a deployment running 10.
 * `bcrypt.hashSync` on 32 random bytes is fast relative to the boot it happens in,
 * and it is computed on first use rather than at import so a process that never
 * serves a sign-in never pays for it.
 */
let dummyHash: { cost: number; hash: string } | undefined;

export function dummyPasswordHash(): string {
  const cost = rounds();
  // Keyed on the cost factor rather than memoised blindly: if the configured
  // factor moves, a hash built at the old one would make the dummy compare
  // cheaper (or dearer) than the real one and re-create the oracle it exists to
  // remove. The test suite changes this setting; production never does.
  if (!dummyHash || dummyHash.cost !== cost) {
    dummyHash = { cost, hash: bcrypt.hashSync(randomBytes(32).toString("hex"), cost) };
  }
  return dummyHash.hash;
}

export function jwtSecret(): string {
  // Length is not enough: this value signs every access token, so the copy-paste
  // placeholder from .env.example would let anyone who has read the repo mint a
  // token for any user id. assertSecret rejects the documented placeholders too.
  return assertSecret("AUTH_JWT_SECRET", process.env.AUTH_JWT_SECRET ?? "");
}

/* Access-token lifetime: minutes, not the quarter-hour.
 *
 * The token is stateless and the gateway verifies it by signature, so the
 * lifetime is what bounds the damage when nothing else can be consulted: sign-out
 * records the token's `jti` in `revoked_tokens` (see routes.ts) and the gateway
 * asks about a presented `jti` before trusting it, which is what makes a sign-out
 * immediate — but that check is a network call the edge must be able to answer,
 * and this window is what a token is worth if the answer never comes. Fifteen
 * minutes was long enough to be worth stealing; five is short enough that a
 * stolen copy stops working while the thief is still orienting, and the client
 * refreshes silently in the background, so the shorter window costs a learner
 * nothing.
 *
 * Clamped to [60, 900]: below a minute the client spends its life refreshing
 * (and a clock-skewed device would flap in and out of a session), and above
 * fifteen minutes there is nothing this buys over the value it replaced. */
const DEFAULT_ACCESS_TTL_S = 5 * 60;
const MIN_ACCESS_TTL_S = 60;
const MAX_ACCESS_TTL_S = 15 * 60;

export function accessTokenTtlSeconds(): number {
  const raw = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? String(DEFAULT_ACCESS_TTL_S));
  if (!Number.isFinite(raw)) return DEFAULT_ACCESS_TTL_S;
  return Math.min(Math.max(Math.floor(raw), MIN_ACCESS_TTL_S), MAX_ACCESS_TTL_S);
}

export function signAccessToken(userId: string): { token: string; expiresIn: number; jti: string } {
  const expiresIn = accessTokenTtlSeconds();
  // Identified per token: this is the handle the denylist records at sign-out and
  // the gateway asks about, so revoking one credential never touches another
  // session's token (or the same learner's next one).
  const jti = randomBytes(16).toString("hex");
  const token = jwt.sign({ sub: userId, jti }, jwtSecret(), { algorithm: "HS256", expiresIn });
  return { token, expiresIn, jti };
}

/** Opaque refresh token (random, stored only as a hash — never reversible). */
export function newRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export interface AccessTokenClaims {
  userId: string;
  /** Null only for a token minted before `jti` existed; nothing can revoke one. */
  jti: string | null;
  /** Where the denylist row stops mattering. Null when the token carried no exp. */
  expiresAtMs: number | null;
}

/**
 * Verify a token and read the claims revocation needs, or null if it is not ours.
 *
 * Never throws: this runs on the sign-out path, where the answer for a tampered,
 * expired or foreign token is "nothing to revoke", not a failed sign-out. The
 * signature check is still the thing that decides — an unverified token can never
 * name a `jti`, or anyone could revoke another learner's session by presenting
 * their jti.
 */
export function accessTokenClaims(token: string): AccessTokenClaims | null {
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub || typeof payload.sub !== "string") return null;
    const jti = (payload as { jti?: unknown }).jti;
    const exp = (payload as { exp?: unknown }).exp;
    return {
      userId: payload.sub,
      jti: typeof jti === "string" && jti.length > 0 ? jti : null,
      expiresAtMs: typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null,
    };
  } catch {
    return null;
  }
}

export function verifyAccessToken(token: string): string {
  const claims = accessTokenClaims(token);
  if (!claims) throw new Error("invalid token");
  return claims.userId;
}
