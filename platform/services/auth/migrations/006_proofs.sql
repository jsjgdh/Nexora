-- Verified proof ledger: attested records the IDE syncs for profile display.
--
-- One row per verified competency per learner. Only receipts the platform's
-- own signatures verify are stored here — the route recomputes the signed
-- payload and checks it before anything is INSERTed, so this table holds
-- what the platform attested, never what a client claimed. A row is history,
-- not a live verdict: freshness is not required at ingest (an old receipt is
-- still proof of old work), and trust always comes from re-deriving at
-- /verify, never from presence in this table.
--
-- Dedupe is by payload hash: syncing the same receipt twice (reinstall,
-- second machine) is one row, and a receipt can never appear under two
-- accounts as two different claims about the same bytes — the second sync
-- reports the existing row instead of forking it.
CREATE TABLE IF NOT EXISTS proofs (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL,
  level TEXT NOT NULL,
  receipt JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competency_id)
);
CREATE INDEX IF NOT EXISTS proofs_user_idx ON proofs (user_id);
