/* The institutional surface: cohorts, licences and seats (COHORTS.md).
 *
 * A cohort is a group of learners, in one course, in one term, taught by one
 * instructor, under one licence. The licence is the operator's to confirm, and
 * that is the whole security story of this surface:
 *
 *   - a cohort nobody confirmed entitles nobody;
 *   - the seat count that carries the money is the operator's number, never
 *     the instructor's claim;
 *   - a seat opens the course it was bought for and no other;
 *   - the seat check and the operator's confirmation are the mesh's, and the
 *     public surface cannot reach either of them;
 *   - one instructor cannot read another cohort's learners;
 *   - the file an instructor takes away says what it is and what it is not.
 *
 * The proof runs against a real database: a PGlite instance (Postgres
 * compiled to WebAssembly) behind a socket server, with the service's own
 * migrations applied in order. A fake pool would prove that the queries are
 * shaped like strings, which is not what has to be true here.
 *
 * The suite is in its own file because it needs a database and the rest of
 * the platform's suite does not. It runs as `npm run verify:cohorts`.
 *
 * The module under test is the service's own build output, the way the rest
 * of the platform's suites import it, so the suite runs under plain node
 * with nothing but the build. The service's own entry point is checked at
 * the source level as well, because a route module that is written and never
 * mounted is a 404 in production, and a suite that mounts the module on its
 * own app cannot see that from the outside.
 *
 * Nothing here reaches the local development database: the database is
 * PGlite, held in memory, created and dropped by this file. */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { createService } from "@nexora/service-kit";
import { registerCohortRoutes, SHIPPED_COURSE_IDS } from "../services/auth/dist/cohorts.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* A port the operating system picks, so the suite never collides with a
   running stack or with itself on a machine that already has one. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const PORT = await freePort();

/* The service chassis refuses to boot without a mesh key, because without one
   every internal route would trust a bare x-user-id header from any caller.
   The test is not a mesh, but it runs the real service, so it gives the
   service a real key rather than switching the check off. */
process.env.INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ?? "test-mesh-key-0123456789abcdef0123456789";
const MESH_KEY = process.env.INTERNAL_API_KEY;

/* The learners the suite acts as. Several of them, because a cohort is a
   group and every boundary here is about one member against another. The
   seat check asks about a learner, and a learner in two active cohorts is
   entitled to two courses, so the tests that count courses use a learner of
   their own. */
const LEARNERS = [
  "u-learner-1",
  "u-learner-2",
  "u-learner-3",
  "u-learner-4",
  "u-learner-5",
  "u-learner-6",
];

let db;
let server;
let pool;
let app;

/** The migrations the service applies, in the order it applies them. */
async function migrate() {
  const dir = join(root, "services", "auth", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

async function seed() {
  const people = [
    ["u-instructor", "instructor@example.com", "The Instructor"],
    ["u-instructor-2", "other@example.com", "The Other Instructor"],
    ...LEARNERS.map((id, i) => [id, `learner${i + 1}@example.com`, `Learner ${i + 1}`]),
  ];
  for (const [id, email, name] of people) {
    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, created_at, provider, email_verified_at) " +
        "VALUES ($1, $2, $3, 'x', now(), 'local', now())",
      [id, email, name]
    );
  }
  /* The verified ledger. The roster and the export read it, and the ledger
     is the member's own work rather than the cohort's, so one of the two
     proofs below belongs to a course the cohort is not about. The export has
     to list it anyway. */
  await pool.query(
    "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES " +
      "('u-learner-1', 'javascript-basics', 'practiced', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, " +
      "'sha-learner-1-run', now() - interval '2 minutes'), " +
      "('u-learner-1', 'go-fundamentals', 'practiced', '{\"facts\":{\"kind\":\"design\"}}'::jsonb, " +
      "'sha-learner-1-design', now() - interval '1 minute'), " +
      "('u-learner-6', 'javascript-basics', 'practiced', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, " +
      "'sha-learner-6-run', now() - interval '1 minute')"
  );
}

/* The chassis authenticates the caller before the route runs, so a test
   request carries the mesh key, the way the gateway does when it forwards.
   The identity still comes from the header the gateway injected, never from
   the body. */
const asUser = (id) => ({ "x-user-id": id, "x-internal-key": MESH_KEY });
const asMesh = () => ({ "x-internal-key": MESH_KEY });
/* A caller with no identity at all: the service must refuse it before it
   reads anything. */
const asCaller = () => ({ "x-internal-key": MESH_KEY });

/* The calls the suite makes over and over, written once so that every test
   says what it is about rather than how it is spelled. */
async function createCohort(overrides = {}) {
  /* The instructor is the caller, never a field of the body. */
  const { instructor = "u-instructor", ...body } = overrides;
  const res = await app.inject({
    method: "POST",
    url: "/cohorts",
    headers: asUser(instructor),
    payload: {
      name: "A Class",
      institution: "A School",
      courseId: "task-manager",
      term: "2026-autumn",
      seats: 20,
      ...body,
    },
  });
  assert.equal(res.statusCode, 201, "the cohort is created");
  return res.json().cohort;
}

async function joinCohort(userId, joinCode) {
  return app.inject({
    method: "POST",
    url: "/cohorts/join",
    headers: asUser(userId),
    payload: { joinCode },
  });
}

async function endCohort(cohortId) {
  return app.inject({
    method: "POST",
    url: `/cohorts/${cohortId}/end`,
    headers: asUser("u-instructor"),
  });
}

/* The operator's confirmation, over the mesh. The seat count is optional
   here on purpose: the test that says it is required has to be able to leave
   it out. */
async function activate(joinCode, seats, perStudentCents = 1200) {
  return app.inject({
    method: "POST",
    url: "/internal/cohorts/activate",
    headers: asMesh(),
    payload: seats === undefined ? { joinCode } : { joinCode, seats, perStudentCents },
  });
}

async function seatCheck(userId) {
  const res = await app.inject({
    method: "POST",
    url: "/internal/entitlement/seat",
    headers: asMesh(),
    payload: { userId },
  });
  assert.equal(res.statusCode, 200, "the seat check answers");
  return res.json();
}

async function memberCount(cohortId) {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1",
    [cohortId]
  );
  return Number(rows[0].n);
}

describe("the cohort surface (real database)", () => {
  before(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 8 });
    await server.start();
    pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`, max: 4 });
    await migrate();
    await seed();
    app = await createService("test-auth-cohorts");
    registerCohortRoutes(app, pool);
    await app.ready();
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    await server?.stop();
    await db?.close();
  });

  it("the courses a cohort can be bought for are the courses the platform ships", async () => {
    // The auth service holds a copy of the curriculum's course list, because it
    // does not know the curriculum. A copy is only as good as the check that
    // holds it to the original: a course that landed in the IDE and was not
    // added here is a course no cohort could be bought for, and a course that
    // was renamed here and not there is a cohort for a course that does not
    // exist. So the two are held to each other here.
    const curriculum = await import("../services/curriculum/dist/data/ide-courses.js");
    const shipped = Object.keys(curriculum.IDE_COURSES).sort();
    assert.deepEqual(
      [...SHIPPED_COURSE_IDS].sort(),
      shipped,
      "the auth service's course list is the curriculum service's catalogue"
    );
    for (const id of shipped) {
      const cohort = await createCohort({ courseId: id, seats: 1 });
      assert.equal(cohort.courseId, id, `a cohort can be bought for ${id}`);
    }
  });

  it("a cohort is created pending, with a join code, and it grants nothing", async () => {
    const cohort = await createCohort({ seats: 20 });
    assert.equal(cohort.status, "pending", "the cohort waits for the studio to confirm the licence");
    assert.match(cohort.joinCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "and it carries a join code a student can type");
    assert.ok(
      !/[01IO]/.test(cohort.joinCode.replace("-", "")),
      "and no character in it is one a student reads wrong"
    );
    assert.equal(cohort.seats, 20);
    assert.equal(
      cohort.perStudentCents,
      0,
      "a pending licence carries no price, because there has been no quote yet"
    );
    assert.equal(cohort.memberCount, 0);

    const { rows } = await pool.query("SELECT status FROM cohorts WHERE id = $1", [cohort.id]);
    assert.equal(rows[0].status, "pending", "and the row says so in the database, not only on the wire");

    // A student may join a pending cohort. The join is not the seat.
    const joined = await joinCohort("u-learner-1", cohort.joinCode);
    assert.equal(joined.statusCode, 200);
    assert.equal(joined.json().alreadyMember, false);

    const seat = await seatCheck("u-learner-1");
    assert.equal(seat.entitled, false, "a pending cohort grants nothing, whoever is in it");
    assert.deepEqual(seat.courses, []);
  });

  it("the join code is read by a human: with the dash, without it, in any case", async () => {
    const cohort = await createCohort({ seats: 10 });
    const bare = cohort.joinCode.replace("-", "");
    assert.notEqual(bare, cohort.joinCode, "the code has a dash in it to begin with");

    const withDash = await joinCohort("u-learner-1", cohort.joinCode);
    const withoutDash = await joinCohort("u-learner-2", bare);
    const lowerCase = await joinCohort("u-learner-3", bare.toLowerCase());
    const spaced = await joinCohort("u-learner-4", ` ${bare.toLowerCase()} `);

    assert.equal(withDash.json().alreadyMember, false);
    assert.equal(withoutDash.json().alreadyMember, false, "the dash is display only");
    assert.equal(lowerCase.json().alreadyMember, false, "and the case is not the code");
    assert.equal(spaced.json().alreadyMember, false, "and neither is the space around it");
    assert.equal(await memberCount(cohort.id), 4, "four students, one cohort");

    const again = await joinCohort("u-learner-1", cohort.joinCode);
    assert.equal(again.json().alreadyMember, true, "joining twice is not an error");
  });

  it("an unknown code is a 404, a full cohort is a 409, and an ended licence is a 410", async () => {
    const unknown = await joinCohort("u-learner-1", "ZZZZ-9999");
    assert.equal(unknown.statusCode, 404, "a code nobody holds is not a code");
    assert.equal(unknown.json().error.code, "not_found");

    const full = await createCohort({ seats: 1 });
    const first = await joinCohort("u-learner-2", full.joinCode);
    assert.equal(first.statusCode, 200);
    const refused = await joinCohort("u-learner-3", full.joinCode);
    assert.equal(refused.statusCode, 409, "a cohort with no seats left refuses a new member");
    assert.equal(refused.json().error.code, "cohort_full");
    assert.equal(await memberCount(full.id), 1);

    const ended = await createCohort({ seats: 5 });
    const stopped = await endCohort(ended.id);
    assert.equal(stopped.statusCode, 200);
    const afterEnd = await joinCohort("u-learner-4", ended.joinCode);
    assert.equal(afterEnd.statusCode, 410, "an ended licence does not take new members");
    assert.equal(afterEnd.json().error.code, "licence_ended");
  });

  it("the last seat cannot be taken twice: the count is inside the insert", async () => {
    // Two students join a one-seat cohort at the same moment. The seat bound
    // is checked in the INSERT itself, not only in the count the route takes
    // first, so the statement that writes the member counts the members again
    // and writes only if there is room.
    const cohort = await createCohort({ seats: 1 });
    const [a, b] = await Promise.all([
      joinCohort("u-learner-1", cohort.joinCode),
      joinCohort("u-learner-2", cohort.joinCode),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    assert.deepEqual(statuses, [200, 409], "one join takes the seat and the other is refused");
    assert.equal(await memberCount(cohort.id), 1, "the cohort holds one member and one seat, never two");
  });

  it("the operator's confirmation requires the seat count, and it is the operator's number", async () => {
    // The instructor declares a thousand seats. The quantity that carries the
    // money is the operator's to state, every time, and a confirmation
    // without a number is refused rather than falling back to the
    // instructor's claim.
    const cohort = await createCohort({ seats: 1000 });
    const withoutSeats = await activate(cohort.joinCode);
    assert.equal(withoutSeats.statusCode, 400, "a confirmation without a seat count is refused");
    assert.equal(withoutSeats.json().error.code, "bad_request");

    const { rows: unchanged } = await pool.query("SELECT status, seats FROM cohorts WHERE id = $1", [
      cohort.id,
    ]);
    assert.equal(unchanged[0].status, "pending", "and the licence is not confirmed");
    assert.equal(unchanged[0].seats, 1000, "and the instructor's number still stands, unused");

    const confirmed = await activate(cohort.joinCode, 30);
    assert.equal(confirmed.statusCode, 200);
    assert.equal(confirmed.json().cohort.status, "active");
    assert.equal(confirmed.json().cohort.seats, 30, "the operator's number is the one that stands");
    assert.equal(
      confirmed.json().cohort.perStudentCents,
      1200,
      "and so does the quote they stated"
    );
    const { rows: after } = await pool.query(
      "SELECT seats, per_student_cents FROM cohorts WHERE id = $1",
      [cohort.id]
    );
    assert.equal(after[0].seats, 30, "and it is the number in the database too");
    assert.equal(after[0].per_student_cents, 1200, "and so is the quote");
  });

  it("a confirmation without a quote is refused, because a licence needs a price", async () => {
    // The price is a quote, and a quote is made when the studio quotes it.
    // A confirmed licence with no price would be a licence nobody paid for,
    // and the record is the only place that would have said so.
    const cohort = await createCohort({ seats: 12 });
    const noPrice = await app.inject({
      method: "POST",
      url: "/internal/cohorts/activate",
      headers: asMesh(),
      payload: { joinCode: cohort.joinCode, seats: 12 },
    });
    assert.equal(noPrice.statusCode, 400, "a confirmation without a quote is refused");
    assert.equal(noPrice.json().error.code, "bad_request");

    const { rows } = await pool.query(
      "SELECT status, per_student_cents FROM cohorts WHERE id = $1",
      [cohort.id]
    );
    assert.equal(rows[0].status, "pending", "and the licence is not confirmed");
    assert.equal(rows[0].per_student_cents, 0, "and it still carries no price");
  });

  it("a seat covers its own course and no other", async () => {
    // A learner of its own, so the courses the seat check answers are this
    // cohort's courses and not another cohort's.
    const cohort = await createCohort({ courseId: "go-fundamentals", seats: 5 });
    await joinCohort("u-learner-5", cohort.joinCode);
    await activate(cohort.joinCode, 5);

    const seat = await seatCheck("u-learner-5");
    assert.equal(seat.entitled, true);
    assert.deepEqual(
      seat.courses,
      ["go-fundamentals"],
      "the seat covers the course the institution bought and nothing else"
    );
  });

  it("a member beyond the seats bought holds no seat", async () => {
    const cohort = await createCohort({ seats: 1 });
    await joinCohort("u-learner-1", cohort.joinCode);
    await activate(cohort.joinCode, 1);

    // A cohort that somehow holds more members than seats. The second member
    // is written straight to the table, which is the only way to reach that
    // state, and the seat lookup still has to hold the bound.
    await pool.query(
      "UPDATE cohort_members SET enrolled_at = now() - interval '2 minutes' " +
        "WHERE cohort_id = $1 AND user_id = 'u-learner-1'",
      [cohort.id]
    );
    await pool.query(
      "INSERT INTO cohort_members (cohort_id, user_id, enrolled_at) " +
        "VALUES ($1, 'u-learner-2', now() - interval '1 minute')",
      [cohort.id]
    );

    const first = await seatCheck("u-learner-1");
    const second = await seatCheck("u-learner-2");
    assert.equal(first.entitled, true, "the member who enrolled first holds the one seat that was bought");
    assert.equal(second.entitled, false, "and the member who enrolled after it holds none");
    assert.deepEqual(second.courses, []);
  });

  it("a pending licence and an ended licence entitle nobody", async () => {
    const pending = await createCohort({ seats: 5 });
    await joinCohort("u-learner-3", pending.joinCode);
    assert.equal((await seatCheck("u-learner-3")).entitled, false, "a pending licence grants nothing");

    const ended = await createCohort({ seats: 5 });
    await joinCohort("u-learner-3", ended.joinCode);
    await activate(ended.joinCode, 5);
    assert.equal((await seatCheck("u-learner-3")).entitled, true, "and an active one does");
    await endCohort(ended.id);
    assert.equal((await seatCheck("u-learner-3")).entitled, false, "but an ended one grants nothing again");
  });

  it("the internal routes are the mesh's: without the key they are not reachable", async () => {
    const seat = await app.inject({
      method: "POST",
      url: "/internal/entitlement/seat",
      headers: { "content-type": "application/json" },
      payload: { userId: "u-learner-1" },
    });
    assert.equal(seat.statusCode, 403, "the seat check is not a public surface");
    assert.equal(seat.json().error.code, "forbidden");

    const licence = await app.inject({
      method: "POST",
      url: "/internal/cohorts/activate",
      headers: { "content-type": "application/json" },
      payload: { joinCode: "ABCD-1234", seats: 5 },
    });
    assert.equal(licence.statusCode, 403, "and neither is the operator's confirmation");
    assert.equal(licence.json().error.code, "forbidden");
  });

  it("a caller with no identity is refused", async () => {
    const res = await app.inject({ method: "GET", url: "/cohorts", headers: asCaller() });
    assert.equal(res.statusCode, 401, "the identity comes from the header, never from the body");
  });

  it("the roster is the instructor's own cohort only", async () => {
    const cohort = await createCohort({ seats: 5 });
    await joinCohort("u-learner-1", cohort.joinCode);

    const own = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}`,
      headers: asUser("u-instructor"),
    });
    assert.equal(own.statusCode, 200);
    assert.equal(own.json().members.length, 1);
    assert.equal(own.json().members[0].userId, "u-learner-1");
    assert.equal(own.json().members[0].email, "learner1@example.com");

    const other = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}`,
      headers: asUser("u-instructor-2"),
    });
    assert.equal(other.statusCode, 404, "another instructor is not told the cohort exists");
    assert.equal(other.json().error.code, "not_found");

    const learner = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}`,
      headers: asUser("u-learner-2"),
    });
    assert.equal(learner.statusCode, 404, "and neither is a learner who is not the instructor");
    assert.equal(learner.json().error.code, "not_found");
  });

  it("the two lists are the caller's own: what they teach, and what they are in", async () => {
    const taught = await createCohort({ seats: 5 });
    const otherTaught = await createCohort({ instructor: "u-instructor-2", seats: 5 });
    await joinCohort("u-learner-6", taught.joinCode);

    const mine = await app.inject({ method: "GET", url: "/cohorts", headers: asUser("u-instructor") });
    assert.equal(mine.statusCode, 200);
    assert.ok(
      mine.json().cohorts.some((c) => c.id === taught.id),
      "the instructor sees the cohort they teach"
    );
    assert.ok(
      !mine.json().cohorts.some((c) => c.id === otherTaught.id),
      "and not one another instructor teaches"
    );

    const joined = await app.inject({ method: "GET", url: "/cohorts/mine", headers: asUser("u-learner-6") });
    assert.equal(joined.statusCode, 200);
    assert.ok(
      joined.json().cohorts.some((c) => c.id === taught.id),
      "a learner sees the cohort they are in"
    );
  });

  it("the export is the instructor's own, and it says what it is and what it is not", async () => {
    const cohort = await createCohort({ courseId: "task-manager", seats: 5 });
    await joinCohort("u-learner-1", cohort.joinCode);

    const res = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}/export`,
      headers: asUser("u-instructor"),
    });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"]), /text\/csv/);
    const csv = typeof res.body === "string" ? res.body : String(res.body);

    // What the file is not. A CSV that travels between a lecturer and a
    // student's employer is read as more than it is unless it says otherwise.
    assert.match(csv, /It is not a grade\./);
    assert.match(csv, /It is not a certificate\./);
    assert.match(csv, /It is not a transcript\./);
    assert.match(csv, /It carries no credit and it is not accredited\./);
    assert.doesNotMatch(
      csv,
      /^(Grade|Certificate|Transcript|Credit|Accredited):/m,
      "and it carries no field that reads as one of those"
    );

    // The header and the rows.
    assert.match(csv, /email,name,joined_at,competency_id,level,kind,issued_at,receipt_sha256/);
    assert.match(csv, /learner1@example\.com/);
    assert.match(csv, /javascript-basics/);
    assert.match(csv, /go-fundamentals/, "a member's proof is listed whatever course it is from");
    assert.match(csv, /A member's proofs are listed whatever course they are from/);
    assert.match(csv, /sha-learner-1-run/, "each row names the receipt that backs it");

    const other = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}/export`,
      headers: asUser("u-instructor-2"),
    });
    assert.equal(other.statusCode, 404, "the export is the instructor's own too");
  });

  it("ending the licence stops the entitlement and keeps the proofs", async () => {
    const cohort = await createCohort({ seats: 5 });
    await joinCohort("u-learner-6", cohort.joinCode);
    await activate(cohort.joinCode, 5);
    assert.equal((await seatCheck("u-learner-6")).entitled, true);

    const before = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}`,
      headers: asUser("u-instructor"),
    });
    assert.equal(before.statusCode, 200);
    assert.equal(before.json().members[0].proofs.length, 1);

    const ended = await endCohort(cohort.id);
    assert.equal(ended.statusCode, 200);
    assert.equal(ended.json().cohort.status, "ended");
    assert.equal(
      (await seatCheck("u-learner-6")).entitled,
      false,
      "the seat is read from the status, so an ended licence grants nothing"
    );

    const roster = await app.inject({
      method: "GET",
      url: `/cohorts/${cohort.id}`,
      headers: asUser("u-instructor"),
    });
    assert.equal(roster.statusCode, 200);
    assert.deepEqual(
      roster.json().members[0].proofs,
      before.json().members[0].proofs,
      "the proofs stay: ending a licence does not unprove the work"
    );
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM proofs WHERE user_id = 'u-learner-6'");
    assert.equal(rows[0].n, 1, "and the ledger still holds them");
  });

  it("a confirmed licence leaves a record", async () => {
    const cohort = await createCohort({ courseId: "go-in-production", seats: 40 });
    const confirmed = await activate(cohort.joinCode, 12);
    assert.equal(confirmed.statusCode, 200);

    const { rows } = await pool.query(
      "SELECT operator_id, action, target, detail FROM admin_actions " +
        "WHERE action = 'cohort.licence_confirmed' AND target = $1",
      [cohort.id]
    );
    assert.equal(rows.length, 1, "the confirmation is written down");
    assert.equal(rows[0].target, cohort.id, "the record names the cohort");
    assert.match(String(rows[0].detail), /12 seats/, "and the seats that were bought");
    assert.match(String(rows[0].detail), /go-in-production/);
    assert.equal(rows[0].operator_id, "the-operator-tooling", "and who confirmed it");
  });
});

describe("the gateway does not proxy an internal path", () => {
  /* The internal routes are the mesh's. The gateway injects the mesh key on
     everything it forwards, so a path under /internal/ that it proxied would
     be reachable by any client that can reach the public surface, carrying
     the real key. The gateway is booted here for real, against a stub
     upstream that records what it is asked for: the test is that the
     upstream never sees an internal path. */
  it("a path under /internal/ is not a path the public surface has", async () => {
    const hits = [];
    const upstream = createHttpServer((req, res) => {
      hits.push(req.url ?? "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const upstreamPort = upstream.address().port;
    const port = await freePort();

    const child = spawn(
      process.execPath,
      [
        join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        join(root, "services", "gateway", "src", "index.ts"),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          GATEWAY_PORT: String(port),
          AUTH_JWT_SECRET: "a".repeat(48),
          INTERNAL_API_KEY: MESH_KEY,
          AUTH_URL: `http://127.0.0.1:${upstreamPort}`,
          LOG_LEVEL: "warn",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout?.resume();

    try {
      await waitForGateway(port, child, () => stderr);
      const live = await fetch(`http://127.0.0.1:${port}/health/live`);
      assert.equal(live.status, 200, "the gateway is up");

      // The proxy works, so the refusal below is the refusal and not a broken
      // setup: a normal path reaches the upstream.
      const proxied = await fetch(`http://127.0.0.1:${port}/api/auth/health/live`);
      assert.equal(proxied.status, 200, "the gateway forwards a normal path to the upstream");
      assert.ok(hits.includes("/health/live"), "and the upstream saw it");

      const internal = await fetch(`http://127.0.0.1:${port}/api/auth/internal/entitlement/seat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-learner-1" }),
      });
      assert.equal(internal.status, 404, "an internal path is not a path the public surface has");

      const bare = await fetch(`http://127.0.0.1:${port}/api/internal/entitlement/seat`);
      assert.equal(bare.status, 404, "and the bare path is not one either");

      assert.deepEqual(
        hits.filter((h) => h.includes("/internal/")),
        [],
        "and the upstream never saw an internal path, so the mesh key never left the mesh"
      );
    } finally {
      child.kill();
      upstream.close();
    }
  });
});

describe("the service mounts the cohort routes", () => {
  const srcDir = join(root, "services", "auth", "src");

  it("the entry point mounts the cohort routes", () => {
    // The gap this asserts is the one that cost a session: the module was
    // written, the suite registered it on its own test app, and the service
    // never mounted it, so the service answered 404 for every cohort route
    // and the edge's seat lookup read the 404 as "we cannot check right now".
    const entry = readFileSync(join(srcDir, "index.ts"), "utf8");
    assert.match(
      entry,
      /registerCohortRoutes\s*\(\s*app\s*,/,
      "a route module that is written and not mounted is a 404 in production"
    );
  });

  it("the built entry point mounts them too", () => {
    const built = readFileSync(join(root, "services", "auth", "dist", "index.js"), "utf8");
    assert.match(built, /registerCohortRoutes\s*\(\s*app\s*,/, "the service that runs is the one that answers");
  });

  it("the path the edge asks the identity service for is a path it registers", () => {
    const gateway = readFileSync(join(root, "services", "gateway", "src", "entitlement.ts"), "utf8");
    const asked = gateway.match(/\/internal\/[a-z/-]+/)?.[0];
    assert.ok(asked, "the edge asks the identity service for something");
    const auth = readFileSync(join(srcDir, "cohorts.ts"), "utf8");
    assert.ok(
      auth.includes(`"${asked}"`),
      `the edge asks for ${asked} and the identity service does not register it, so every paid request answers 503 instead of 402`
    );
  });
});

/* Wait for the gateway to answer on its port, and say what it said when it
   did not start. */
async function waitForGateway(port, child, stderr) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the gateway did not start: ${stderr()}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health/live`);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the gateway did not answer on its port in time: ${stderr()}`);
}
