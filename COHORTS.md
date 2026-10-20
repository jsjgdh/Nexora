# Cohorts: the institutional surface

> The teaching page says what is not built: no roster, no instructor
> dashboard, no gradebook export, no LMS integration. This note is the
> decision for building the first three, and the shape they take. It is a
> contract between the platform, the mesh and the front door, so it is
> written down rather than held in one person's head.
>
> Status: decided 2026-10-20. Not yet built.

## What a cohort is

A cohort is a group of learners, in one course, in one term, taught by one
instructor, under one licence. It exists so that a lecturer can see the
work rather than the learners, and so that a student in a class can open a
paid phase without a card.

The licence is the commercial object and it is the operator's, not the
instructor's. The public price is $19 a student for a term, twenty students
or more, invoiced and not a checkout. The platform records the licence so
that entitlement can be real; it does not take the money.

## The hole this design closes first

A cohort created by an instructor must not entitle anybody.

If creating a cohort granted seats, then anybody could create a cohort with
a thousand seats and hand out the whole paid curriculum for nothing. So the
licence has two states, and only the second one carries entitlement:

- `pending`: the cohort exists, the instructor can see it, the students who
  join get nothing beyond the free nine phases. The instructor is told the
  studio has to confirm the licence, and sees that state.
- `active`: the operator has confirmed the licence and the seats are real.
  Members of this cohort are entitled to the paid phases of the cohort's
  course, and only that course, until the licence ends.

The operator confirms it. Two ways, both real: a CLI in the platform
(`npm run cohort:activate -- <join-code> --seats <n>`) and an internal
route over the mesh, for automation. Neither is reachable from the public
surface without the mesh key.

An ended licence (`ended`) stops entitlement. The members keep what they
have proved: a receipt is a record of work, and ending a licence does not
unprove it.

## The data

In the auth service's database, because the auth service owns the users,
the proofs and the rights ledger, and a cohort is a group of users with a
licence over them.

```sql
CREATE TABLE IF NOT EXISTS cohorts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,          -- "CS 202: distributed systems"
  institution       TEXT NOT NULL,          -- "Delft University"
  course_id         TEXT NOT NULL,          -- one of the five shipped course ids
  term              TEXT NOT NULL,          -- "2026 autumn"
  instructor_id     TEXT NOT NULL REFERENCES users(id),
  join_code         TEXT NOT NULL UNIQUE,   -- 8 unambiguous characters, "KQ7M-XR42"
  seats             INTEGER NOT NULL,       -- seats bought
  per_student_cents INTEGER NOT NULL,       -- 1900
  status            TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'ended'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id   TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);
```

The join code uses the same alphabet as the device code (no 0/O, no 1/I),
because a student reads it off a slide and types it once. The course id is
one of the five the platform ships: `task-manager`, `go-fundamentals`,
`go-in-production`, `rust-ledger`, `api-basics`.

## The routes

Public surface, through the gateway, under `/api/auth`. The caller is
identified by the gateway from the learner's own token, so a route never
takes an id of whose value it is not sure.

| route | who | what it does |
|---|---|---|
| `POST /cohorts` | any signed-in learner | creates a cohort in `pending`, returns it with its join code |
| `GET /cohorts` | any signed-in learner | the cohorts the caller teaches |
| `GET /cohorts/:id` | the cohort's instructor | the cohort, its members, and what the platform has verified for each member |
| `GET /cohorts/:id/export` | the cohort's instructor | a CSV statement of the cohort's judged work |
| `POST /cohorts/:id/end` | the cohort's instructor | ends the licence, so no new entitlement is granted |
| `POST /cohorts/join` | any signed-in learner | joins with a join code, and is told what that gives them |
| `GET /cohorts/mine` | any signed-in learner | the cohorts the caller is in |

Internal, over the mesh only, for the edge:

| route | who | what it does |
|---|---|---|
| `POST /internal/entitlement/seat` | the gateway, with the mesh key | `{ userId }` and the answer whether the user holds a seat in an `active` cohort, and in which course |

## Entitlement at the edge, and the course a seat covers

The gateway resolves a paid phase in one place, and it asks two questions
now:

1. Does billing have a subscription for this learner?
2. Does the auth service say this learner holds a seat in an active cohort?

Either answer grants entitlement. A failure in either is `unknown`, never a
denial, exactly as a billing outage is today: the extension must be able to
tell "we cannot check" from "you have not bought it". The cache is the one
that already exists, with the same TTL and the same rule that a cached
denial is dropped when a webhook says otherwise. The cohort check adds a
second lookup, not a second cache.

A seat is scoped to a course, because an institution buys one course for
one class. So the verdict carries the courses it covers, and the service
that owns the phase checks the phase's course against it:

- The seat route answers `{ entitled: boolean, courses: string[] }`, the
  courses the learner holds an active seat in. Empty means no seat.
- The gateway's lookup answers the same shape, with `courses: null` meaning
  every course, which is what a subscription means.
- The gateway injects `x-entitled: 1` and `x-entitled-courses`, a
  comma-separated list, or `*`.
- The curriculum service, which owns the phase to course map, refuses a
  paid phase whose course is not in that list, with the same 402 it already
  uses for a learner who has not bought it. The check is about the course,
  and the seat's course is the one the institution bought.

A seat does not open the other four courses, and it does not survive the
licence ending.

## The front door

- `/teach` is the instructor's page: their cohorts, a form to create one,
  the roster of each cohort with the work the platform has verified for each
  member, the join code to put on a slide, the export, and the honest gaps.
- `/teach/join?code=...` is how a student joins, and it says what joining
  gives them and what it does not.
- The account home names the cohort a learner is in.
- The site keeps saying that the licence is invoiced, that the studio
  confirms it, and that the entitlement begins when the licence is active
  and not when the cohort is created.

## What is still not built, and stays on the page

- No LTI. A course cannot be launched from Canvas or Moodle yet. The shape
  is LTI 1.3 with AGS grade passback, and it needs a per-institution
  registration to be testable at all, so it is the next piece of work and
  not part of this one.
- No grade passback. There is nothing to pass back to yet, because there is
  no LTI.
- No certificates. A receipt is the record, and a certificate would be a PDF
  of the same claim with a seal on it. The export is a statement of what
  the platform judged, and it says so.
- No credit, and no accreditation. Those are the institution's to grant and
  the regulator's to recognise, and this product does not issue them.
- No attendance, no timetable, no marks, no transcripts.
- No outcome data. No cohort has been taught, so there is no pass rate to
  report.

## The proof

A cohort is real when this has been walked end to end, over HTTP and in a
browser:

1. An instructor creates a cohort, and sees it in `pending`, with a join code.
2. A learner joins with the code, and gets nothing beyond the free nine
   phases, because the licence is not confirmed.
3. The operator activates the licence, with the CLI.
4. The same learner can now open a paid phase of the cohort's course, and
   the edge's answer says why.
5. The instructor sees the learner in the roster with what has been verified.
6. The export produces a CSV that says what it is and is not.
7. Ending the licence stops the entitlement, and the receipts stay.
