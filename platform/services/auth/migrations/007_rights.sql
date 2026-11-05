-- Lawful basis, data-subject rights, and the record of having answered them.
--
-- Four tables, and each one exists because a regime the product is held to
-- names the record it expects to see:
--
--   consents             GDPR Arts. 7(1) and 13-14 (proof the notice was
--                        given, per document and version), DPDP Rule 3 (an
--                        itemised notice, separately understandable), CCPA
--                        s.1798.100 (notice at collection).
--   rights_requests      GDPR Arts. 12(3), 15-21 (the request, its clock and
--                        its answer), CCPA s.1798.130 (records of requests kept
--                        24 months), DPDP Rule 14 (a published grievance route
--                        and response period).
--   erasures             GDPR Art. 5(2) accountability: what was deleted, what
--                        could not be, and why. Worthless if it deletes itself
--                        along with the account, which is why it is keyed by a
--                        pseudonym rather than by a foreign key.
--   processor_deletions  GDPR Art. 28(3)(g): the processors holding their own
--                        copy have to be told. This is the work order for that,
--                        and it is deliberately a row rather than an API call:
--                        the operator acts on it, and an unactioned row is
--                        visible instead of being a claim in a document.

/* What the learner accepted, at which version, on which basis.
 *
 * `purpose` and `basis` are columns rather than constants because they are the
 * two questions a regulator asks about a record of processing: what was this
 * for, and what made it lawful. An account row is `contract` — the courses
 * cannot be delivered without identity — and an AI-assistant row is `consent`,
 * which is the one basis a learner can withdraw and therefore the one row whose
 * `withdrawn_at` has to mean something.
 *
 * One row per document per learner: accepting an updated notice replaces the
 * version in place rather than appending, because the question this table
 * answers is "what is this learner currently bound to", and an append-only
 * history would answer it only by date-arithmetic. A withdrawal is a timestamp
 * on the same row, not a deletion: Art. 7(3) obliges the operator to be able to
 * show consent *was* given, so erasing the evidence would destroy the thing
 * being audited.
 */
CREATE TABLE IF NOT EXISTS consents (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  version TEXT NOT NULL,
  purpose TEXT NOT NULL,
  basis TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, document)
);
CREATE INDEX IF NOT EXISTS consents_user_idx ON consents (user_id);

/* The rights ledger: one row per request, with its statutory clock.
 *
 * `due_at` is computed at intake and stored, not derived at read time, so a
 * request's deadline cannot drift when a constant in the code changes later —
 * the answer the operator promised on the day it was received is the answer it
 * is held to.
 *
 * The subject is recorded twice on purpose. `user_id` is the live account and
 * cascades to NULL when the account is deleted; `subject_ref` is the sha256 of
 * that id and survives. That is what lets the ledger outlive the erasure that
 * it documents (CCPA requires a 24-month record of deletion requests), and it
 * is honestly a pseudonym rather than an anonymisation: no key here reverses it,
 * but the row remains personal data wherever it can still be linked, and the
 * retention schedule says so instead of claiming otherwise.
 */
CREATE TABLE IF NOT EXISTS rights_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  subject_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  nominee TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);
CREATE INDEX IF NOT EXISTS rights_requests_user_idx ON rights_requests (user_id, created_at);
CREATE INDEX IF NOT EXISTS rights_requests_open_idx ON rights_requests (status, due_at);

/* The erasure receipt: the record that an erasure happened and what it covered.
 *
 * No foreign key, deliberately — this row has to exist after the account it
 * refers to is gone, which is the only reason it can serve as proof the erasure
 * was performed. `deleted` and `retained` are JSONB because the shape of the
 * retention exceptions is the part that changes (tax law, a live dispute, a
 * regulatory hold) and a receipt that had to be migrated to record a new
 * exception would stop being a record of what was true at the time.
 */
CREATE TABLE IF NOT EXISTS erasures (
  id TEXT PRIMARY KEY,
  subject_ref TEXT NOT NULL UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  deleted JSONB NOT NULL DEFAULT '{}',
  retained JSONB NOT NULL DEFAULT '[]',
  reason TEXT
);

/* Work queued for the processors that hold their own copy of the record.
 *
 * Kinde holds the identity and Dodo holds the payment relationship; neither is
 * reachable by "delete the row here". An uncompleted row is the operator's open
 * work, and the retention schedule's manual procedure is exactly this queue.
 */
CREATE TABLE IF NOT EXISTS processor_deletions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  user_email TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  note TEXT
);
CREATE INDEX IF NOT EXISTS processor_deletions_open_idx ON processor_deletions (completed_at);

/* Deletion has to end the sessions too, and that means a cut-off that outlives
 * the account.
 *
 * Every other revocation table cascades from `users`, which is right for a
 * sign-out and wrong for an erasure: an access token is verified by signature
 * alone, so a token in someone's hands keeps working until it expires unless
 * something says otherwise — and the something is normally a row that the
 * deletion just removed. This table has no foreign key for that reason. It is
 * tiny and short-lived (a token cannot outlive the 900-second ceiling), and the
 * prune in index.ts drops rows once no token could still name them.
 */
CREATE TABLE IF NOT EXISTS deleted_subject_revocations (
  user_id TEXT PRIMARY KEY,
  revoked_before TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
