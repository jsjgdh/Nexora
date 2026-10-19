-- Single-use tokens for the two identity flows the platform did not have: a
-- forgotten password and an unverified address.
--
-- One table, not two. The two flows share every property that matters (a
-- single-use secret, a hash-only store, an expiry, a used-at marker) and one
-- table means one place to prune, one set of invariants and one query shape
-- for the claim that spends a token. The `purpose` column says which promise
-- the token carries, so a password-reset link can never be spent on an email
-- confirmation and the other way round: the claim always names the purpose it
-- expects, so a token of the wrong kind is simply not found.
--
-- Forward-only, like every migration here: a deployment that has applied this
-- file keeps it, and a later change is a later file.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- What the token is for. A CHECK rather than a free string, so a token row
  -- cannot carry a purpose that no route will ever spend it for: a purpose
  -- nobody checks is a credential with no owner.
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verification')),
  -- The token is stored as a hash and never in the clear. The plaintext
  -- exists in exactly two places: the mail the learner receives, and the
  -- link they click. A database dump is therefore not a list of ways into
  -- somebody's account, which is the same rule the refresh-token table
  -- follows.
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the token stops working. Enforced by comparison, not by a sweeper:
  -- an expired row is dead whether or not anything deleted it.
  expires_at TIMESTAMPTZ NOT NULL,
  -- When the token was spent. A token that has been used is refused, and the
  -- answer it gets is the same answer an unknown token gets, so a client
  -- cannot tell a live token from a dead one by asking.
  used_at TIMESTAMPTZ
);
-- One lookup per confirmation: by hash (the unique index above) or by
-- account and purpose, which is what spends a token's older siblings when a
-- new one is issued.
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);
-- What the retention sweep reads.
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens (expires_at);

-- Whether the address has been confirmed.
--
-- A timestamp rather than a boolean, because "never asked" and "asked and did
-- not answer" are different facts and a boolean cannot hold both. It is
-- nullable, so a row that predates this migration reads as unverified rather
-- than as broken: the account works exactly as it did, and the address is
-- simply not confirmed yet.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
