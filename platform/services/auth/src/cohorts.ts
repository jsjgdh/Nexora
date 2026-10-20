import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  cohortActivateSchema,
  cohortCreateSchema,
  cohortJoinSchema,
  seatCheckSchema,
  type Cohort,
} from "@nexora/contracts";
import { ApiError, newId, parseOr400, requireUserId } from "@nexora/service-kit";
import { randomInt } from "node:crypto";

/* Cohorts: the institutional surface (COHORTS.md).
 *
 * A cohort is a group of learners, in one course, in one term, taught by one
 * instructor, under one licence. The licence is the commercial object and it is
 * the operator's, not the instructor's: the public price is $19 a student for a
 * term, invoiced, and the platform records the licence so that entitlement can
 * be real. It does not take the money.
 *
 * The hole this module closes first, and the reason it is worth reading twice:
 *
 *   A cohort created by an instructor must not entitle anybody.
 *
 * If creating a cohort granted seats, then anybody could create a cohort with a
 * thousand seats and hand out the whole paid curriculum for nothing. So a
 * cohort has two states that matter, and only the second one carries a seat:
 *
 *   pending   the cohort exists, the instructor sees it, the students who join
 *             get nothing beyond the free nine phases, and the instructor is
 *             told the studio has to confirm the licence.
 *   active    the operator has confirmed the licence. The members hold seats in
 *             the cohort's course, and only that course, until the licence ends.
 *
 * An ended licence stops the entitlement and keeps the proofs: a receipt is a
 * record of work, and ending a licence does not unprove it.
 *
 * Two rules the whole surface rests on:
 *
 *   - The caller is whoever the gateway resolved. Every public route reads
 *     `x-user-id` and never a body field, so no learner can act as anybody else
 *     by typing an id.
 *   - The internal routes are the mesh's. They carry a subject in the body
 *     because the only caller is the edge, which has already resolved the
 *     identity, and they are unreachable without the mesh key (the service
 *     chassis requires `x-internal-key` for every non-health route, and the
 *     gateway refuses to proxy a path under /internal/).
 */

/**
 * The courses the platform ships.
 *
 * The curriculum service owns this list: it serves the courses, and a course
 * added or removed in the IDE changes there and not here. The auth service does
 * not know the curriculum, so this constant is a copy of a truth held
 * elsewhere, and it is here so that a cohort cannot name a course that does
 * not exist. The verification suite holds the two to each other: this list and
 * the curriculum service's own catalogue must be the same five ids, and the
 * suite fails when they drift.
 */
export const SHIPPED_COURSE_IDS = [
  "task-manager",
  "go-fundamentals",
  "go-in-production",
  "rust-ledger",
  "api-basics",
] as const;

/**
 * The characters a join code is made of.
 *
 * The same alphabet as the device code: no 0/O and no 1/I, because a student
 * reads this off a slide and types it once, by hand, while looking at two
 * screens. A code that can be misread is a code that will be mistyped.
 */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** What one seat costs, in cents, for a term. The platform records it; it does not take it. */
const PER_STUDENT_CENTS = 1900;

/**
 * How many times a code is regenerated when the database says one is taken.
 *
 * The unique index is the real guarantee that no code is ever handed out twice.
 * This loop is what makes a collision invisible to the caller: eight attempts
 * against a space of 31^8 codes is not a number that will ever come up, and
 * when it does come up the caller gets a cohort, not an error.
 */
const JOIN_CODE_ATTEMPTS = 8;

/** Eight unambiguous characters, e.g. "KQ7M-XR42". The dash is display-only. */
function randomJoinCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * The code as the database holds it.
 *
 * Upper case, the dash is display-only: a code typed with or without the dash,
 * with or without spaces, is the same code. The same normalisation the device
 * code gets, because it is the same job: a human reading one screen and typing
 * into another.
 */
function normalizeJoinCode(raw: string): string {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

interface CohortRow {
  id: string;
  name: string;
  institution: string;
  course_id: string;
  term: string;
  instructor_id: string;
  join_code: string;
  seats: number;
  per_student_cents: number;
  status: "pending" | "active" | "ended";
  created_at: Date | string;
  member_count?: number;
}

/** One cohort as the wire carries it. */
function toCohort(row: CohortRow): Cohort {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    courseId: row.course_id,
    term: row.term,
    status: row.status,
    seats: row.seats,
    perStudentCents: row.per_student_cents,
    joinCode: row.join_code,
    memberCount: Number(row.member_count ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** One member, with the work the platform has verified for them. */
interface MemberView {
  userId: string;
  email: string;
  /** Empty when the account carries no name. A page prints the email then. */
  name: string;
  joinedAt: string;
  proofs: { competencyId: string; level: string; kind: string; issuedAt: string }[];
}

/**
 * A field of a CSV.
 *
 * Quoted when it needs to be, and never otherwise, so the file opens in a
 * spreadsheet and reads correctly in a text editor. The escape is the standard
 * one: a quote inside a quoted field is written twice.
 */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function registerCohortRoutes(app: FastifyInstance, pool: Pool): void {
  /* Creating a cohort.
   *
   * The cohort is created `pending`, and that is the whole point: the
   * instructor has asked for a licence, and the licence is the operator's to
   * confirm. Nothing here grants a seat, and nothing here can: the seat is
   * read from the row's status, and a row this route writes says 'pending'.
   *
   * The price is not a field on the body. The platform records what a seat
   * costs so the export and the front door can say what the institution is
   * being invoiced, and it does not take the money.
   */
  app.post("/cohorts", async (req, reply) => {
    const instructorId = requireUserId(req);
    const body = parseOr400(cohortCreateSchema, req.body);
    if (!(SHIPPED_COURSE_IDS as readonly string[]).includes(body.courseId)) {
      throw new ApiError(400, "bad_request", "Pick one of the courses the platform ships.");
    }

    /* The join code, and the only way a code is ever handed out.
     *
     * The unique index on `join_code` is the arbiter: two cohorts cannot hold
     * the same code, whatever the generator does. A collision is therefore
     * impossible to miss, and the only sane response to it is to draw another
     * code and try again, which is what the loop does. The caller never sees a
     * collision, and never sees a code that is already taken. */
    let row: CohortRow | undefined;
    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt++) {
      try {
        const inserted = await pool.query(
          "INSERT INTO cohorts (id, name, institution, course_id, term, instructor_id, join_code, seats, per_student_cents, status) " +
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING *",
          [
            newId(),
            body.name.trim(),
            body.institution.trim(),
            body.courseId,
            body.term.trim(),
            instructorId,
            randomJoinCode(),
            body.seats,
            PER_STUDENT_CENTS,
          ]
        );
        row = inserted.rows[0] as CohortRow;
        break;
      } catch (err) {
        // 23505 is the unique index on join_code: another cohort took this code
        // between the draw and the write. Draw another one. Any other failure is
        // a real failure and is not swallowed.
        if ((err as { code?: string }).code === "23505") continue;
        throw err;
      }
    }
    if (!row) {
      throw new ApiError(503, "unavailable", "Could not issue a join code just now. Try again.");
    }
    req.log.info(
      { cohortId: row.id, instructorId, courseId: row.course_id },
      "cohort created in pending: the studio has to confirm the licence before it carries any seat"
    );
    return reply.code(201).send({ cohort: toCohort(row) });
  });

  /* The cohorts the caller teaches. */
  app.get("/cohorts", async (req) => {
    const instructorId = requireUserId(req);
    const { rows } = await pool.query(
      "SELECT c.*, (SELECT count(*)::int FROM cohort_members m WHERE m.cohort_id = c.id) AS member_count " +
        "FROM cohorts c WHERE c.instructor_id = $1 ORDER BY c.created_at DESC",
      [instructorId]
    );
    return { cohorts: (rows as CohortRow[]).map(toCohort) };
  });

  /* The cohorts the caller is in.
   *
   * Membership, not teaching: this is the list a learner reads to see which
   * class they are in, and the one the account home names. A cohort the caller
   * teaches is on the other list, and being the instructor is not the same as
   * holding a seat. */
  app.get("/cohorts/mine", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query(
      "SELECT c.*, (SELECT count(*)::int FROM cohort_members m WHERE m.cohort_id = c.id) AS member_count " +
        "FROM cohorts c JOIN cohort_members m ON m.cohort_id = c.id " +
        "WHERE m.user_id = $1 ORDER BY c.created_at DESC",
      [userId]
    );
    return { cohorts: (rows as CohortRow[]).map(toCohort) };
  });

  /* The roster, and only to the instructor.
   *
   * A learner asking for a cohort they do not teach gets a 404, not a 403: a
   * 403 would confirm that the cohort exists, and the roster of somebody
   * else's class is not the caller's to know about. */
  app.get("/cohorts/:id", async (req) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    const { rows } = await pool.query(
      "SELECT c.*, (SELECT count(*)::int FROM cohort_members m WHERE m.cohort_id = c.id) AS member_count " +
        "FROM cohorts c WHERE c.id = $1 AND c.instructor_id = $2",
      [id, userId]
    );
    const row = rows[0] as CohortRow | undefined;
    if (!row) throw new ApiError(404, "not_found", "No such cohort.");

    const { rows: memberRows } = await pool.query(
      "SELECT m.user_id, u.email, u.name, m.enrolled_at " +
        "FROM cohort_members m JOIN users u ON u.id = m.user_id " +
        "WHERE m.cohort_id = $1 ORDER BY m.enrolled_at, m.user_id",
      [id]
    );
    const members = memberRows as {
      user_id: string;
      email: string;
      name: string | null;
      enrolled_at: Date | string;
    }[];

    /* The work the platform has verified for each member, and only that.
     *
     * These are the same rows the ledger holds: a receipt the platform's own
     * signatures verified when it was synced. The roster says what the platform
     * judged, and it says nothing about marks, because there are none. */
    const proofsByUser = new Map<string, MemberView["proofs"]>();
    if (members.length > 0) {
      const placeholders = members.map((_, i) => `$${i + 1}`).join(", ");
      const { rows: proofRows } = await pool.query(
        "SELECT user_id, competency_id, level, " +
          "CASE WHEN receipt->'facts'->>'kind' = 'design' THEN 'design' " +
          "WHEN receipt->'facts'->>'kind' = 'incident' THEN 'incident' ELSE 'run' END AS kind, " +
          "issued_at FROM proofs WHERE user_id IN (" +
          placeholders +
          ") ORDER BY issued_at",
        members.map((m) => m.user_id)
      );
      for (const p of proofRows as {
        user_id: string;
        competency_id: string;
        level: string;
        kind: string;
        issued_at: Date | string;
      }[]) {
        const list = proofsByUser.get(p.user_id) ?? [];
        list.push({
          competencyId: p.competency_id,
          level: p.level,
          kind: p.kind,
          issuedAt: new Date(p.issued_at).toISOString(),
        });
        proofsByUser.set(p.user_id, list);
      }
    }

    const roster: MemberView[] = members.map((m) => ({
      userId: m.user_id,
      email: m.email,
      name: m.name ?? "",
      joinedAt: new Date(m.enrolled_at).toISOString(),
      proofs: proofsByUser.get(m.user_id) ?? [],
    }));
    return { cohort: toCohort(row), members: roster };
  });

  /* Joining with a code.
   *
   * The code is the only credential here, and it is a short human-typed one, so
   * an unknown code gets the same answer whatever the reason: "that code is not
   * valid". The code is normalised the way the device code is, because it is
   * the same job.
   *
   * Two refusals, and both of them are the licence talking:
   *
   *   - an ended licence does not take new members, and its code stops working;
   *   - a cohort with no seats left refuses a new member, and says so.
   *
   * The seat bound is enforced in the INSERT itself, so two students joining at
   * the same instant cannot both take the last seat: the statement counts the
   * members and compares them with the seats bought, and it writes only if
   * there is room. */
  app.post("/cohorts/join", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(cohortJoinSchema, req.body);
    const code = normalizeJoinCode(body.joinCode);
    const { rows } = await pool.query("SELECT * FROM cohorts WHERE join_code = $1", [code]);
    const cohort = rows[0] as CohortRow | undefined;
    if (!cohort) {
      throw new ApiError(404, "not_found", "That join code is not valid. Check the code on the slide and try again.");
    }
    if (cohort.status === "ended") {
      throw new ApiError(410, "licence_ended", "This cohort's licence has ended, so the join code no longer works.");
    }

    const { rows: memberRows } = await pool.query(
      "SELECT 1 FROM cohort_members WHERE cohort_id = $1 AND user_id = $2",
      [cohort.id, userId]
    );
    const { rows: countRows } = await pool.query(
      "SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1",
      [cohort.id]
    );
    const members = Number(countRows[0]?.n ?? 0);

    if (memberRows.length > 0) {
      return { cohort: toCohort({ ...cohort, member_count: members }), alreadyMember: true };
    }
    if (members >= cohort.seats) {
      throw new ApiError(409, "cohort_full", "This cohort has no seats left. Ask the instructor for another code.");
    }

    const joined = await pool.query(
      "INSERT INTO cohort_members (cohort_id, user_id) " +
        "SELECT $1, $2 WHERE (SELECT count(*) FROM cohort_members WHERE cohort_id = $1) " +
        "< (SELECT seats FROM cohorts WHERE id = $1) ON CONFLICT DO NOTHING RETURNING user_id",
      [cohort.id, userId]
    );
    if (joined.rows.length === 0) {
      // The write did not happen: the cohort filled up between the count and the
      // insert, or the learner was already in it. Either way the answer is the
      // one the situation deserves, not an error.
      const { rows: again } = await pool.query(
        "SELECT 1 FROM cohort_members WHERE cohort_id = $1 AND user_id = $2",
        [cohort.id, userId]
      );
      if (again.length > 0) {
        return { cohort: toCohort({ ...cohort, member_count: members }), alreadyMember: true };
      }
      throw new ApiError(409, "cohort_full", "This cohort has no seats left. Ask the instructor for another code.");
    }
    req.log.info({ cohortId: cohort.id, userId }, "learner joined a cohort");
    return { cohort: toCohort({ ...cohort, member_count: members + 1 }), alreadyMember: false };
  });

  /* Ending the licence.
   *
   * The instructor ends it, and ending it stops the entitlement: the seat is
   * read from the status, so an ended cohort grants nothing. The proofs stay,
   * because a receipt is a record of work and ending a licence does not
   * unprove it. The code stops working at the same time, because the join
   * route refuses an ended cohort.
   *
   * Idempotent: ending an ended licence is the same 200 with the same cohort,
   * because a retried click is not a mistake worth an error. */
  app.post("/cohorts/:id/end", async (req) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    const { rows } = await pool.query(
      "UPDATE cohorts SET status = 'ended' WHERE id = $1 AND instructor_id = $2 RETURNING *",
      [id, userId]
    );
    const row = rows[0] as CohortRow | undefined;
    if (!row) throw new ApiError(404, "not_found", "No such cohort.");
    const { rows: countRows } = await pool.query(
      "SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1",
      [id]
    );
    req.log.info({ cohortId: id, instructorId: userId }, "cohort licence ended: the entitlement stops, the proofs stay");
    return { ok: true, cohort: toCohort({ ...row, member_count: Number(countRows[0]?.n ?? 0) }) };
  });

  /* The export.
   *
   * A statement of what the platform judged, in plain sentences, followed by one
   * row per member per verified proof. The header says what the file is and is
   * not, because a CSV that travels between a lecturer and a student's
   * employer is exactly the kind of document that gets read as more than it
   * is: it is not a grade, not a certificate, not a transcript, it carries no
   * credit, and it is not accredited.
   *
   * Each row names the receipt that backs it, so a reader can ask the platform
   * to re-derive it rather than take the file's word for it. */
  app.get("/cohorts/:id/export", async (req, reply) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    const { rows } = await pool.query(
      "SELECT c.*, (SELECT count(*)::int FROM cohort_members m WHERE m.cohort_id = c.id) AS member_count " +
        "FROM cohorts c WHERE c.id = $1 AND c.instructor_id = $2",
      [id, userId]
    );
    const cohort = rows[0] as CohortRow | undefined;
    if (!cohort) throw new ApiError(404, "not_found", "No such cohort.");

    const { rows: memberRows } = await pool.query(
      "SELECT m.user_id, u.email, u.name, m.enrolled_at " +
        "FROM cohort_members m JOIN users u ON u.id = m.user_id " +
        "WHERE m.cohort_id = $1 ORDER BY m.enrolled_at, m.user_id",
      [id]
    );
    const members = memberRows as {
      user_id: string;
      email: string;
      name: string | null;
      enrolled_at: Date | string;
    }[];

    const lines: string[] = [];
    lines.push(`Cohort: ${cohort.name}`);
    lines.push(`Institution: ${cohort.institution}`);
    lines.push(`Course: ${cohort.course_id}`);
    lines.push(`Term: ${cohort.term}`);
    lines.push(`Licence status: ${cohort.status}`);
    lines.push(`Members: ${members.length}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("This file is a statement of the work the NEXORA platform judged for this cohort.");
    lines.push("It is not a grade. It is not a certificate. It is not a transcript.");
    lines.push("It carries no credit and it is not accredited.");
    lines.push("The institution decides what this work is worth, and the regulator decides what is accredited.");
    lines.push("Each row below is one verified proof by one member.");
    lines.push(
      "A member's proofs are listed whatever course they are from, because the ledger is the member's work and not the cohort's."
    );
    lines.push("The receipt that identifies a row is the signed payload whose sha256 is in the receipt_sha256 column.");
    lines.push("To re-derive a row, post that receipt to /verify and compare the answer with the row.");
    lines.push("");
    lines.push(
      ["email", "name", "joined_at", "competency_id", "level", "kind", "issued_at", "receipt_sha256"]
        .map(csvField)
        .join(",")
    );

    if (members.length > 0) {
      const placeholders = members.map((_, i) => `$${i + 1}`).join(", ");
      const { rows: proofRows } = await pool.query(
        "SELECT p.user_id, p.competency_id, p.level, p.payload_sha256, p.issued_at, " +
          "CASE WHEN p.receipt->'facts'->>'kind' = 'design' THEN 'design' " +
          "WHEN p.receipt->'facts'->>'kind' = 'incident' THEN 'incident' ELSE 'run' END AS kind " +
          "FROM proofs p WHERE p.user_id IN (" +
          placeholders +
          ") ORDER BY p.issued_at, p.user_id, p.competency_id",
        members.map((m) => m.user_id)
      );
      const emailOf = new Map(members.map((m) => [m.user_id, m]));
      for (const p of proofRows as {
        user_id: string;
        competency_id: string;
        level: string;
        payload_sha256: string;
        issued_at: Date | string;
        kind: string;
      }[]) {
        const member = emailOf.get(p.user_id);
        lines.push(
          [
            member?.email ?? "",
            member?.name ?? "",
            new Date(member?.enrolled_at ?? 0).toISOString(),
            p.competency_id,
            p.level,
            p.kind,
            new Date(p.issued_at).toISOString(),
            p.payload_sha256,
          ]
            .map(csvField)
            .join(",")
        );
      }
    }

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(lines.join("\n") + "\n");
  });

  /* The seat check, over the mesh, for the edge.
   *
   * The question is narrow: does this learner hold a seat in an active cohort,
   * and in which courses. A pending cohort grants nothing and an ended one
   * grants nothing, so the answer is 'no seat' for both.
   *
   * The seats are a bound, not a hint. A cohort bought twenty seats grants
   * twenty, and the members beyond that count hold no seat: the members are
   * ordered by when they enrolled, and the seat lookup counts the members ahead
   * of the one it is judging. So a cohort that somehow holds more members than
   * seats still cannot hand out more seats than were bought.
   *
   * A failure here is not a denial: the statement throws, the edge sees the
   * failure, and the edge answers "we cannot check" rather than "you have not
   * bought it". */
  app.post("/internal/entitlement/seat", async (req) => {
    const body = parseOr400(seatCheckSchema, req.body);
    const { rows } = await pool.query(
      "SELECT DISTINCT c.course_id FROM cohorts c JOIN cohort_members m ON m.cohort_id = c.id " +
        "WHERE m.user_id = $1 AND c.status = 'active' " +
        "AND (SELECT count(*) FROM cohort_members earlier WHERE earlier.cohort_id = c.id " +
        "AND (earlier.enrolled_at, earlier.user_id) < (m.enrolled_at, m.user_id)) < c.seats",
      [body.userId]
    );
    const courses = (rows as { course_id: string }[]).map((r) => r.course_id).sort();
    return { entitled: courses.length > 0, courses };
  });

  /* The operator's confirmation of a licence, over the mesh.
   *
   * The two ways the operator confirms a licence are the CLI
   * (npm run cohort:activate -- <join-code> --seats <n>) and this route, and
   * both of them come through here: the CLI calls this route over the mesh, so
   * there is one place where a licence becomes active and one set of rules
   * about what it takes.
   *
   * An ended licence is not re-activated: ending is final, and a code that
   * stopped working does not start working again. */
  app.post("/internal/cohorts/activate", async (req) => {
    const body = parseOr400(cohortActivateSchema, req.body);
    const code = normalizeJoinCode(body.joinCode);
    const { rows } = await pool.query("SELECT * FROM cohorts WHERE join_code = $1", [code]);
    const cohort = rows[0] as CohortRow | undefined;
    if (!cohort) throw new ApiError(404, "not_found", "No cohort has that join code.");
    if (cohort.status === "ended") {
      throw new ApiError(409, "conflict", "That licence has ended and cannot be confirmed again.");
    }
    const { rows: updated } = await pool.query(
      "UPDATE cohorts SET status = 'active', seats = $2 WHERE id = $1 RETURNING *",
      [cohort.id, body.seats ?? cohort.seats]
    );
    const row = updated[0] as CohortRow;
    const { rows: countRows } = await pool.query(
      "SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1",
      [cohort.id]
    );
    req.log.info(
      { cohortId: row.id, seats: row.seats, courseId: row.course_id },
      "cohort licence confirmed by the operator: the seats are real"
    );
    return { cohort: toCohort({ ...row, member_count: Number(countRows[0]?.n ?? 0) }) };
  });
}
