-- The learner's own work: the drafts they are writing, the attempts they made,
-- the phases they finished, their streak and where they were placed.
--
-- Why this lives on the platform and not only in the IDE. The IDE holds the
-- work while a learner is signed out; the platform holds it once they are
-- signed in. Both halves are needed: the account is what a second device
-- syncs into, and a guest's local work is what migrates into the account when
-- the learner signs in.
--
-- Every row is keyed by the account that owns it and cascades from users, so
-- one learner can never read another's work, and an erased account takes its
-- work with it (the erasure path deletes the account row and lets these
-- cascades do the rest).
--
-- Forward-only and additive, like every migration in this service: a running
-- deployment gains the tables on boot and no other row is touched.

-- One draft per phase per learner. The newest draft wins, so a stale copy
-- arriving from a second device cannot overwrite newer work, and re-saving
-- the same draft is one row rather than a history.
CREATE TABLE IF NOT EXISTS progress_drafts (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  phase_id   TEXT NOT NULL,
  content    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phase_id)
);

-- One row per attempt, keyed by the id the client minted. The key is the
-- client's own id and not a sequence, so a replayed attempt (a retry after a
-- dropped connection) is the same row rather than a second one.
CREATE TABLE IF NOT EXISTS progress_attempts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  phase_id   TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'run',
  outcome    TEXT NOT NULL DEFAULT 'unknown',
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS progress_attempts_user_idx ON progress_attempts (user_id, created_at DESC);

-- One completion per phase per learner. A phase is finished once: the second
-- answer is 409 already_completed rather than a second row, because two rows
-- would mean the learner finished the same phase twice.
--
-- `source` says where the row came from: the platform recorded it, or it came
-- from a guest device in a migration. The check refuses a value no route
-- would ever write.
CREATE TABLE IF NOT EXISTS progress_completions (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  phase_id     TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source       TEXT NOT NULL DEFAULT 'server',
  PRIMARY KEY (user_id, phase_id),
  CONSTRAINT progress_completions_source_check CHECK (source IN ('server', 'guest'))
);

-- The one row per learner that holds the numbers a phase list cannot derive:
-- the streak and the placement. The streak is the number of consecutive days
-- the learner was active and the day the streak is measured from; the
-- placement is whatever a diagnostic decided, kept as it was given.
CREATE TABLE IF NOT EXISTS progress_state (
  user_id        TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  streak_days    INTEGER NOT NULL DEFAULT 0,
  last_active_on DATE,
  placement      JSONB,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
