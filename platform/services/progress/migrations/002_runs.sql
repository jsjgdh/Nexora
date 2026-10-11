-- Submission history: every execution the platform performed for a learner.
--
-- Why this exists: a signed receipt is a capability, not state. Until now it
-- was spent at completion and thrown away, so a run that never led to a
-- completion left no trace anywhere — a learner who changed device could not
-- read back what they had tried. This table is the durable half: the facts the
-- execution service observed and signed, stored against the mission it was run
-- for, so attempt transcripts survive a device change.
--
-- It records runs, never verdicts. Nothing here decides a check: the completion
-- path still recomputes every execution check from a fresh receipt, and a row
-- in this table is not evidence that a mission was passed.
--
-- One row per execution. `receipt_sig` is the execution service's signature
-- over the facts, so the same run offered twice — for two checks, or on two
-- retries — is one row with both check ids, never two rows of the same facts.
CREATE TABLE IF NOT EXISTS mission_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  -- The execution checks this run was offered for. Grows, never shrinks: a
  -- second check reading the same run adds its id to the same record.
  check_ids TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL,
  command TEXT[] NOT NULL DEFAULT '{}',
  -- The mission's own file as the runner saw it; `entry_sha256` is the code
  -- that ran, `draft_sha256` is the code this service held at that moment.
  -- They differ exactly when the learner edited after running, which is the
  -- same comparison the completion path refuses on.
  entry_path TEXT NOT NULL DEFAULT '',
  entry_sha256 TEXT NOT NULL DEFAULT '',
  draft_sha256 TEXT,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  exit_code INT,
  timed_out BOOLEAN NOT NULL DEFAULT FALSE,
  truncated BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INT NOT NULL DEFAULT 0,
  phase TEXT,
  diagnostics JSONB NOT NULL DEFAULT '[]',
  runner TEXT NOT NULL DEFAULT '',
  -- The platform's signature over these facts. Never leaves this service: a
  -- receipt is a capability and is not handed back on a history read.
  receipt_sig TEXT NOT NULL,
  content_version TEXT NOT NULL DEFAULT '',
  issued_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency key: one execution, one row, per learner and mission.
CREATE UNIQUE INDEX IF NOT EXISTS mission_runs_one_row_per_receipt
  ON mission_runs (user_id, mission_id, receipt_sig);

-- The read path: a mission's history for one learner, newest first.
CREATE INDEX IF NOT EXISTS mission_runs_history
  ON mission_runs (user_id, mission_id, recorded_at DESC, id DESC);
