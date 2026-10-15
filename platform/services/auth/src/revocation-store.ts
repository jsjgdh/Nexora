import type { Pool } from "pg";

/* The denylist and the account cut-off, in one place.
 *
 * Two ways a session can end before its token expires, and they need different
 * shapes:
 *
 *   a credential   one `jti`, revoked by the sign-out that used it. Revoking it
 *                  must leave every other session alone (another tab, another
 *                  device), so it is a row keyed by that id.
 *   an account     "sign out everywhere". Enumerating the live `jti`s of a
 *                  stateless token is impossible, so this is a per-user cut-off:
 *                  one row per account, and the check compares a token's own
 *                  `iat` against it. A token issued after the cut-off is a session
 *                  the learner asked for.
 *
 * The SQL lives here rather than inline in the routes because three callers have
 * to agree on exactly what counts as revoked: the sign-out that writes, the
 * gateway's check that reads, and the scheduler that prunes. Three copies of a
 * predicate is how a revocation story starts disagreeing with itself.
 *
 * `revoked_tokens.expires_at` is what makes the denylist prunable: a `jti` can
 * only matter until the token it names would have expired. The cut-off needs no
 * pruning — an old cut-off only refuses tokens that are long dead anyway — and
 * there is at most one row per account, so it is bounded by the user table.
 */

export interface DeniedCredential {
  jti: string;
  userId: string;
  /** When the token would have expired (ms). The row stops mattering then. */
  expiresAtMs: number;
}

/** Record one credential as revoked. Idempotent: signing out twice is not an error. */
export async function revokeCredential(pool: Pool, credential: DeniedCredential): Promise<void> {
  await pool.query(
    "INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (jti) DO NOTHING",
    [credential.jti, credential.userId, new Date(credential.expiresAtMs)]
  );
}

/**
 * Record that every access token for this account issued before `at` is refused.
 *
 * `GREATEST` on conflict rather than a plain overwrite: two "sign out everywhere"
 * requests racing (a learner on a flaky connection retrying) must not be able to
 * move the cut-off *backwards* and resurrect a session an earlier call ended.
 */
export async function revokeAccountBefore(pool: Pool, userId: string, at: Date): Promise<void> {
  await pool.query(
    "INSERT INTO user_revocations (user_id, revoked_before) VALUES ($1, $2) " +
      "ON CONFLICT (user_id) DO UPDATE SET revoked_before = GREATEST(user_revocations.revoked_before, EXCLUDED.revoked_before)",
    [userId, at]
  );
}

/**
 * Delete denylist rows whose token would have expired anyway, and say how many.
 *
 * Run on a timer (see index.ts) rather than on the read path: the check is in the
 * path of every authenticated request and must not pay for housekeeping, and a
 * deployment whose sign-outs are rare can afford to hold expired rows for one
 * interval.
 */
export async function pruneRevokedTokens(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query("DELETE FROM revoked_tokens WHERE expires_at < now()");
  return rowCount ?? 0;
}

export interface RevocationVerdict {
  revoked: boolean;
  reason: "credential" | "account" | null;
}

/**
 * The one question the gateway asks: has this token been refused?
 *
 * Two indexed lookups, and the second is skipped when the caller did not send a
 * subject. A token minted in the *same second* as the cut-off survives: `iat` has
 * one-second resolution, so the comparison cannot tell "issued just before the
 * sign-out" from "issued just after" — and of the two possible mistakes, signing
 * a learner straight back out of the session they just created is the worse one.
 * The exposure that leaves is a token minted in that same second, which dies at
 * its own expiry (minutes) or at its next renewal (the family is gone).
 */
export async function credentialStatus(
  pool: Pool,
  check: { jti: string; userId?: string; issuedAtMs?: number }
): Promise<RevocationVerdict> {
  const { rowCount } = await pool.query("SELECT 1 FROM revoked_tokens WHERE jti = $1", [check.jti]);
  if ((rowCount ?? 0) > 0) return { revoked: true, reason: "credential" };

  if (check.userId && check.issuedAtMs !== undefined) {
    const { rows } = await pool.query("SELECT revoked_before FROM user_revocations WHERE user_id = $1", [
      check.userId,
    ]);
    const before = rows[0] ? new Date(rows[0].revoked_before).getTime() : null;
    if (before !== null && Number.isFinite(before) && check.issuedAtMs + 1000 <= before) {
      return { revoked: true, reason: "account" };
    }
  }
  return { revoked: false, reason: null };
}
