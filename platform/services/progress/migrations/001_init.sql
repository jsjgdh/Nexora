-- Progress schema: profiles, diagnostics, per-mission progress, evidence.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  languages TEXT[] NOT NULL DEFAULT '{}',
  tools TEXT[] NOT NULL DEFAULT '{}',
  can_build TEXT NOT NULL DEFAULT '',
  hours_per_week TEXT NOT NULL DEFAULT '',
  interests TEXT[] NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagnostics (
  user_id TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  results JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS mission_progress (
  user_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  content_version TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  checks_passed TEXT[] NOT NULL DEFAULT '{}',
  hints_used INT NOT NULL DEFAULT 0,
  max_hint_level INT NOT NULL DEFAULT 0,
  questions JSONB NOT NULL DEFAULT '{"answered": {}, "correct": {}}',
  completed_at TIMESTAMPTZ,
  mastered_at TIMESTAMPTZ,
  independent BOOLEAN NOT NULL DEFAULT FALSE,
  xp_awarded INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id)
);

CREATE TABLE IF NOT EXISTS evidence (
  user_id TEXT NOT NULL,
  competency_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'unseen',
  evidence JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competency_id)
);
