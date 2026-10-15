-- Account-wide sign-out: every access token this user was issued before
-- `revoked_before` is refused.
--
-- Why a cut-off and not more rows in the denylist. An access token is verified by
-- signature and carries no server-side record, so "sign out everywhere" cannot
-- enumerate the credentials it has to kill — it can only say *when* the account's
-- sessions were all ended. The gateway sends each token's own `iat` with its
-- revocation check, and this timestamp is what that claim is compared against, so
-- a token minted after the learner signed back in is a session they asked for and
-- stays valid.
--
-- One row per account (a later sign-out overwrites an earlier one, and never moves
-- backwards), so this cannot grow with sign-outs — only with accounts, and it
-- cascades away with the account itself. No pruning is needed either: an old
-- cut-off only refuses tokens that expired long ago.
CREATE TABLE IF NOT EXISTS user_revocations (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  revoked_before TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
