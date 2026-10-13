-- IDE device authorization (GitHub-style browser sign-in).
--
-- The IDE shows a short user code and polls with a long device secret; the
-- learner approves the user code in the browser while signed in. Only hashes
-- of the device secret are stored: a database read must never yield a credential
-- that polls as approved. At most one approval per device code (consumed on
-- first poll success), and expired rows are dead rather than deleted by a
-- sweeper the service does not run.
CREATE TABLE IF NOT EXISTS device_codes (
  id TEXT PRIMARY KEY,
  device_code_hash TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS device_codes_user_code_idx ON device_codes (user_code);
CREATE INDEX IF NOT EXISTS device_codes_expires_idx ON device_codes (expires_at);
