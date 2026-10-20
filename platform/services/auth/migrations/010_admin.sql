-- Operators: the people who run the studio.
--
-- An operator is a learner account with a row here. That is deliberate: the
-- operator is a person who signed up like anybody else, and the flag is a
-- trust decision with a moment and a giver, which a column on `users` could
-- not record. The first operator is granted by the operator's tooling
-- (npm run operator:grant), because a panel that could grant itself the
-- right to exist would not be a boundary.
CREATE TABLE IF NOT EXISTS operators (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'operator',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by TEXT
);

-- The operator's own log.
--
-- An operator's action is a thing somebody did to somebody's data, so it is
-- written down: who, what, to whom, and when. It is not a security control
-- (the service log already has the request), it is the record an operator
-- can be asked about six months later.
CREATE TABLE IF NOT EXISTS admin_actions (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON admin_actions (created_at DESC);
