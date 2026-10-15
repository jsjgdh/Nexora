-- Access-token denylist: the `jti` of a token that must stop working now.
--
-- Why this table exists. The access token is verified by signature alone — that
-- is what keeps the gateway stateless, and it also meant the token's lifetime was
-- the entire revocation story: signing out killed the refresh family (so nothing
-- new could be minted) and the token already in someone's hands kept working
-- until it expired. Now sign-out also records that token's `jti` here, and the
-- gateway asks about a presented `jti` before it trusts it, so the credential
-- dies with the session rather than minutes later.
--
-- Expiry is part of the row, not an afterthought: a `jti` can only ever matter
-- until the token it names would have expired, so `expires_at` is what lets the
-- table be pruned instead of growing for the life of the deployment, and what
-- bounds a gateway's cache of revoked ids.
--
-- ON DELETE CASCADE matches refresh_tokens: deleting an account takes its
-- denylist with it. Forward-only and additive like every migration here — an
-- existing deployment gains the table on boot and no other row is touched.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pruning walks by expiry, and the check itself is a primary-key hit.
CREATE INDEX IF NOT EXISTS revoked_tokens_expires_idx ON revoked_tokens (expires_at);
