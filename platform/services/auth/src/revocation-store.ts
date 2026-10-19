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
 * The same cut-off, in the table that survives the account.
 *
 * Deleting an account cascades `user_revocations` away with it, and the access
 * token in a learner's hands is verified by signature alone — so without this, an
 * erasure would leave a working credential behind for the rest of its TTL. That
 * is a privacy failure (a session outliving the account that authorised it) and
 * the kind that is invisible in a test: the row is gone, the account is gone, and
 * the token still opens the door.
 *
 * Written *before* the `users` row is deleted, in the same transaction, so there
 * is no window in which the account is gone and the credential is not yet cut
 * off.
 */
export async function revokeDeletedSubject(pool: Pool, userId: string, at: Date): Promise<void> {
  await pool.query(
    "INSERT INTO deleted_subject_revocations (user_id, revoked_before) VALUES ($1, $2) " +
      "ON CONFLICT (user_id) DO UPDATE SET revoked_before = GREATEST(deleted_subject_revocations.revoked_before, EXCLUDED.revoked_before)",
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

/**
 * Drop deletion cut-offs that can no longer refuse anything.
 *
 * A cut-off only ever refuses tokens issued before it, and no access token this
 * service mints outlives the TTL ceiling (`ACCESS_TOKEN_TTL_SECONDS`, at most
 * fifteen minutes). Twelve hours is therefore two orders of magnitude past the
 * point where the row can matter — slack for clock skew and for a deployment
 * whose ceiling was raised — and keeping it that long costs nothing while a
 * too-eager prune would silently re-open a deleted account's token.
 */
export async function pruneDeletedSubjectRevocations(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    "DELETE FROM deleted_subject_revocations WHERE created_at < now() - interval '12 hours'"
  );
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
    /* The cut-off an erasure left behind, and why it is judged differently from
     * the one above.
     *
     * A "sign out everywhere" cut-off has to spare a token issued *after* it — the
     * learner asked for that session by signing back in, and revoking it would sign
     * them straight back out. A deleted account has no "after": the subject does
     * not exist, no new token can be minting, and the only correct answer for any
     * credential presented for it is refusal. So the row's existence decides, and
     * its timestamp is kept for the record and for pruning rather than for
     * comparison.
     *
     * This is the difference the +1000-second tolerance above must not be copied
     * into: with whole-second `iat`, a token minted in the same second as a
     * full-precision deletion would compare as "issued before" only by luck. Being
     * wrong in that direction here means a deleted account's credential keeps
     * working — which is the failure that looks like success.
     */
    const deleted = await pool.query("SELECT revoked_before FROM deleted_subject_revocations WHERE user_id = $1", [
      check.userId,
    ]);
    if (deleted.rows[0]) return { revoked: true, reason: "account" };
  }
  return { revoked: false, reason: null };
}
