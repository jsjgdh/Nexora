-- LTI 1.3: the tool's registrations, the identities a launch binds, and the
-- grade passback (LTI.md).
--
-- Six tables, and each one answers a question the next one asks:
--
--   lti_deployments     who may launch our course. One row per (issuer,
--                       client id, deployment id): the tuple an LMS sends with
--                       every login initiation and every launch. The row is
--                       added by the operator, because a deployment is a trust
--                       decision about who may launch, and it names the cohort
--                       whose seats the launch draws on, so the licence is the
--                       same object on both sides.
--   lti_identities      which platform account an LMS user is bound to. The
--                       LMS owns the identity: the first launch creates the
--                       account from the LMS's sub and email claim, and the
--                       binding is recorded so a later launch finds the same
--                       account. One way only.
--   lti_login_states    the state and the nonce a login initiation issued, and
--                       the one-shot use of both. A state is spent by the launch
--                       that redeems it, so a captured launch cannot be replayed.
--   lti_launch_grants   the one-time code that turns a verified launch into a
--                       platform session. The code is hashed at rest and spent
--                       by the exchange, so a launch never puts a token in a
--                       URL.
--   lti_ags_contexts    where a score for this learner goes, as the LMS's own
--                       launch said. Keyed by deployment and LMS subject,
--                       because one LMS user sits in more than one course and
--                       each course has its own line item.
--   lti_grade_posts     what was already posted. The unique key is the
--                       attempt (deployment, LMS subject, receipt hash): one
--                       receipt is posted once, ever, and a failed post is
--                       retried rather than repeated.
--
-- No column here holds a refresh token. The platform asks the LMS for an
-- access token when it posts a score and keeps it for the length of that
-- request, so there is no long-lived credential of the LMS's to store.

CREATE TABLE IF NOT EXISTS lti_deployments (
  id                TEXT PRIMARY KEY,
  issuer            TEXT NOT NULL,
  client_id         TEXT NOT NULL,
  deployment_id     TEXT NOT NULL,
  institution       TEXT NOT NULL,
  cohort_id         TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  authorization_url TEXT NOT NULL,
  token_url         TEXT NOT NULL,
  jwks_url          TEXT NOT NULL,
  -- The client secret the platform presents to the LMS's token endpoint,
  -- sealed with a key derived from the mesh key (see lti-keys.ts). It is the
  -- operator's secret to give us, and it is not readable in the database.
  client_secret_enc TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, client_id, deployment_id)
);

-- The registration is looked up by the tuple the LMS sends on every request,
-- so the index is on that tuple rather than on the row id.
CREATE INDEX IF NOT EXISTS lti_deployments_lookup_idx
  ON lti_deployments (issuer, client_id, deployment_id);

-- The LMS's user is bound to a platform account. One row per (issuer, subject):
-- the same LMS user is the same account, whatever course they launch.
CREATE TABLE IF NOT EXISTS lti_identities (
  id             TEXT PRIMARY KEY,
  issuer         TEXT NOT NULL,
  subject        TEXT NOT NULL,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deployment_id  TEXT REFERENCES lti_deployments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_launch_at TIMESTAMPTZ,
  UNIQUE (issuer, subject)
);
CREATE INDEX IF NOT EXISTS lti_identities_user_idx ON lti_identities (user_id);

-- The state and the nonce a login initiation issued. `expires_at` is compared
-- rather than swept: an expired row is dead whether or not anything deleted it.
CREATE TABLE IF NOT EXISTS lti_login_states (
  state            TEXT PRIMARY KEY,
  nonce            TEXT NOT NULL,
  deployment_id    TEXT NOT NULL REFERENCES lti_deployments(id) ON DELETE CASCADE,
  login_hint       TEXT,
  target_link_uri  TEXT,
  lti_message_hint TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  consumed_at      TIMESTAMPTZ
);

-- The one-time code a verified launch hands the browser. Hashed at rest, spent
-- by the exchange, and never a bearer token: a URL that travels is a URL that
-- ends up in a log.
CREATE TABLE IF NOT EXISTS lti_launch_grants (
  code_hash     TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL REFERENCES lti_deployments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ
);

-- Where a score goes, as the launch said. The line item is the LMS's
-- assignment; the scope is what the LMS will let the platform do with it.
CREATE TABLE IF NOT EXISTS lti_ags_contexts (
  deployment_id TEXT NOT NULL REFERENCES lti_deployments(id) ON DELETE CASCADE,
  lms_subject   TEXT NOT NULL,
  lineitem      TEXT,
  lineitem_url  TEXT,
  scope         TEXT,
  resource_link TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, lms_subject)
);

-- What was posted, and what failed. The unique key is the attempt, so a
-- receipt is posted once and a retry of a failed post updates the row rather
-- than writing a second one.
CREATE TABLE IF NOT EXISTS lti_grade_posts (
  id            TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES lti_deployments(id) ON DELETE CASCADE,
  lms_subject   TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proof_sha256  TEXT NOT NULL,
  lineitem      TEXT,
  score_given   DOUBLE PRECISION NOT NULL,
  score_maximum DOUBLE PRECISION NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('posted', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  posted_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, lms_subject, proof_sha256)
);
