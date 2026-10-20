-- Cohorts: the institutional surface (COHORTS.md).
--
-- Two tables. A cohort is a group of learners, in one course, in one term,
-- taught by one instructor, under one licence. The licence is the commercial
-- object and it is the operator's, not the instructor's, so the row that
-- carries it also carries the state that decides whether it entitles anybody:
--
--   cohorts          the licence. `status` is 'pending' | 'active' | 'ended',
--                    and only 'active' carries a seat. A cohort created by an
--                    instructor is 'pending', so creating one entitles nobody:
--                    that is the hole this design closes, and it is closed by
--                    the schema rather than by a route that remembers to check.
--   cohort_members   who is in it, and when they joined.
--
-- The tables live in the auth service because it owns the users, the proofs and
-- the rights ledger, and a cohort is a group of users with a licence over them.
CREATE TABLE IF NOT EXISTS cohorts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  institution       TEXT NOT NULL,
  course_id         TEXT NOT NULL,
  term              TEXT NOT NULL,
  instructor_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  join_code         TEXT NOT NULL UNIQUE,
  seats             INTEGER NOT NULL CHECK (seats > 0),
  per_student_cents INTEGER NOT NULL CHECK (per_student_cents > 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'ended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The instructor's own list, and the licence's own state. The status index is
-- what the seat lookup reads on the hot path: it asks which courses a learner
-- holds an ACTIVE seat in, and it must not have to walk the pending and ended
-- licences to find them.
CREATE INDEX IF NOT EXISTS cohorts_instructor_idx ON cohorts (instructor_id);
CREATE INDEX IF NOT EXISTS cohorts_status_idx ON cohorts (status);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id   TEXT NOT NULL REFERENCES cohorts (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);

-- The learner's own list, and the seat lookup's join. A learner holds a seat in
-- a cohort, so the lookup reads this table by user and finds the courses.
CREATE INDEX IF NOT EXISTS cohort_members_user_idx ON cohort_members (user_id);
