/* The learner's first lesson, end to end.
 *
 * This is the acceptance test for the three surfaces a learner meets in their
 * first hour: the front door they register on, the IDE they work in, and the
 * platform that keeps the record. It walks the journey in order, against the
 * real services, and it fails loudly when the surfaces disagree.
 *
 * The journey, as a learner walks it:
 *
 *   1. a person who has never used NEXORA registers an account;
 *   2. they sign in with the password they chose, and they sign in to the IDE
 *      against the local platform (the device code flow, which is the only way
 *      the IDE signs in);
 *   3. they open the first phase of the first course, and the platform serves
 *      it with that phase's own rubric and provenance;
 *   4. the work itself completes the lesson's steps, and the platform records
 *      what they did: the draft, the attempt, the completion;
 *   5. they submit their work, the platform runs its own copy of the suite and
 *      signs what it saw, and the signed result reaches the ledger;
 *   6. a reader who looks at the ledger later reads the rubric's own account
 *      of that phase: which part the server recomputed, and which part rests
 *      on the learner's own word.
 *
 * The last step is the one this file is really about. The platform now serves,
 * per phase, a provenance record and a rubric, and the product's honesty
 * depends on the two agreeing with the record the learner can see. So the file
 * asserts the agreement in both directions: every proof in the ledger is for
 * something the rubric says the server recomputes, and nothing the rubric
 * calls the learner's own account or plain reading is dressed up as a proof.
 *
 * The database is PGlite (Postgres compiled to WebAssembly) behind a socket
 * server, with the services' own migrations applied in order, and the services
 * are started here with the real chassis. The gateway is started as a child
 * process, because the gateway is a separate program and the proof has to
 * cross the same edge a learner crosses.
 *
 * Nothing here reaches the local development database: the database is PGlite,
 * held in memory, created and dropped by this file. It runs as
 * `npm run verify:journey`. */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { createService } from "@nexora/service-kit";
import { CURRENT_DOCUMENT_VERSIONS } from "@nexora/contracts";
import { registerAuthRoutes } from "../services/auth/dist/routes.js";
import { registerProgressRoutes } from "../services/auth/dist/progress.js";
import { registerCohortRoutes } from "../services/auth/dist/cohorts.js";
import { registerCurriculumRoutes } from "../services/curriculum/dist/routes.js";
import { registerExecutionRoutes } from "../services/execution/dist/routes.js";
import { registerBillingRoutes } from "../services/billing/dist/routes.js";
import { JobQueue } from "../services/execution/dist/queue.js";
import { Quotas } from "../services/execution/dist/quotas.js";
import { SYNCED_ATTEST_FIXTURES } from "../services/execution/dist/data/attest-fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* The course a fresh install opens, and its first phase. Both are read from
   the platform's own catalogue rather than written here, so the suite follows
   the product when the curriculum moves. */
const DEFAULT_COURSE = "task-manager";
const FIRST_PHASE = "setup";

/* The mesh key and the token secret. The chassis refuses to boot without a
   mesh key, because without one every internal route would trust a bare
   x-user-id header from any caller, so the suite gives the services a real key
   rather than switching the check off. The token secret has to be the same on
   both sides of the edge: the identity service signs the access token and the
   gateway verifies it. */
process.env.INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ?? "test-mesh-key-0123456789abcdef0123456789";
process.env.AUTH_JWT_SECRET =
  process.env.AUTH_JWT_SECRET ?? "test-jwt-secret-0123456789abcdef0123456789ab";
/* The local stack runs with the notice switched on, so the suite does too: a
   registration without the terms, the privacy notice and the age affirmation
   is refused here exactly as it is in production. */
process.env.NEXORA_REQUIRE_CONSENT = "1";
const MESH_KEY = process.env.INTERNAL_API_KEY;

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

const DB_PORT = await freePort();
const AUTH_PORT = await freePort();
const CURRICULUM_PORT = await freePort();
const EXECUTION_PORT = await freePort();
const BILLING_PORT = await freePort();
const GATEWAY_PORT = await freePort();

const authBase = `http://127.0.0.1:${AUTH_PORT}`;
const curriculumBase = `http://127.0.0.1:${CURRICULUM_PORT}`;
const executionBase = `http://127.0.0.1:${EXECUTION_PORT}`;
const billingBase = `http://127.0.0.1:${BILLING_PORT}`;
const gatewayBase = `http://127.0.0.1:${GATEWAY_PORT}`;

/* The learner, the instructor, and the two tokens the journey hands out. */
const LEARNER = { email: "a.new.learner@example.com", password: "a-long-new-password" };
const INSTRUCTOR = { email: "an.instructor@example.com", password: "another-long-password" };

let db;
let socketServer;
let pool;
let authApp;
let curriculumApp;
let executionApp;
let billingApp;
let gateway;
let gatewayStderr = "";

let learner;
let learnerToken;
let ideToken;
let instructorToken;
let phasePayload;
let rubric;
let provenance;
let catalogueRubric;
let attestedReceipt;
let attestedActivityId;
let attestedActivity;
let attestedCompetencyId;

/* A call over the wire. The suite never reaches into a service's own objects:
   every fact it asserts came back over HTTP. */
async function api(base, path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const res = await fetch(base + path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

/* The registration the front door sends: the account, and the record of what
   the learner was shown. */
function registrationFor(person) {
  return {
    email: person.email,
    password: person.password,
    name: person.email.split("@")[0],
    acceptTerms: true,
    acceptPrivacy: true,
    ageAffirmed: true,
    documentVersions: { ...CURRENT_DOCUMENT_VERSIONS },
  };
}

/** The migrations a service applies, in the order it applies them. */
async function migrate(dir) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

/* The platform is started once for the whole file, because the front door's
   half runs after the journey's half and still needs the same gateway to be
   there. */
before(async () => {
  db = await PGlite.create();
  socketServer = new PGLiteSocketServer({
    db,
    port: DB_PORT,
    host: "127.0.0.1",
    maxConnections: 8,
  });
  await socketServer.start();
  pool = new Pool({
    connectionString: `postgres://nexora:nexora@127.0.0.1:${DB_PORT}/postgres`,
    max: 8,
  });
  await migrate(join(root, "services", "auth", "migrations"));
  await migrate(join(root, "services", "billing", "migrations"));

  authApp = await createService("auth");
  registerAuthRoutes(authApp, pool);
  registerProgressRoutes(authApp, pool);
  registerCohortRoutes(authApp, pool);
  await authApp.listen({ port: AUTH_PORT, host: "127.0.0.1" });

  curriculumApp = await createService("curriculum");
  registerCurriculumRoutes(curriculumApp);
  await curriculumApp.listen({ port: CURRICULUM_PORT, host: "127.0.0.1" });

  billingApp = await createService("billing");
  registerBillingRoutes(billingApp, pool, new Map());
  await billingApp.listen({ port: BILLING_PORT, host: "127.0.0.1" });

  executionApp = await createService("execution");
  const fixtures = new Map();
  for (const entry of SYNCED_ATTEST_FIXTURES) {
    fixtures.set(entry.key, entry.content);
  }
  registerExecutionRoutes(executionApp, {
    queue: new JobQueue(2),
    quotas: new Quotas(50, 2),
    runner: "subprocess",
    attestFixtures: fixtures,
  });
  await executionApp.listen({ port: EXECUTION_PORT, host: "127.0.0.1" });

  gateway = spawn(
    process.execPath,
    [
      join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      join(root, "services", "gateway", "src", "index.ts"),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        GATEWAY_PORT: String(GATEWAY_PORT),
        AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
        INTERNAL_API_KEY: MESH_KEY,
        AUTH_URL: authBase,
        BILLING_URL: billingBase,
        CURRICULUM_URL: curriculumBase,
        EXECUTION_URL: executionBase,
        FRONTEND_URL: "http://localhost:5173",
        /* The seat has to be visible at once: the proof waits on it, and a
           thirty second cache would make the suite wait rather than prove. */
        ENTITLEMENT_CACHE_TTL_MS: "1",
        LOG_LEVEL: "warn",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  gateway.stderr?.on("data", (chunk) => {
    gatewayStderr += String(chunk);
  });
  gateway.stdout?.resume();
  await waitForGateway(GATEWAY_PORT, gateway, () => gatewayStderr);
});

after(async () => {
  gateway?.kill();
  await authApp?.close();
  await curriculumApp?.close();
  await executionApp?.close();
  await billingApp?.close();
  await pool?.end();
  await socketServer?.stop();
  await db?.close();
});

describe("the learner's first lesson, end to end (real database)", () => {
  it("a person who has never used NEXORA can register an account", async () => {
    const res = await api(gatewayBase, "/api/auth/register", {
      method: "POST",
      body: registrationFor(LEARNER),
    });
    assert.equal(res.status, 201, `the registration was refused: ${res.text}`);
    assert.equal(res.body.user.email, LEARNER.email);
    assert.ok(res.body.tokens.accessToken, "the registration hands back a session");
    learner = res.body.user;
    learnerToken = res.body.tokens.accessToken;

    // The account is a row, and the notice the learner was shown is on the
    // record next to it: an account with no record of the declaration is an
    // account the platform cannot show it gave.
    const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1", [learner.id]);
    assert.equal(rows.length, 1, "the account is in the database");
    assert.equal(rows[0].email, LEARNER.email);
    const consents = await pool.query(
      "SELECT document FROM consents WHERE user_id = $1 ORDER BY document",
      [learner.id]
    );
    assert.deepEqual(
      consents.rows.map((r) => r.document),
      ["age-affirmation", "privacy", "terms"],
      "and the declarations are on the record"
    );
  });

  it("the account they just made is the account they can sign in to", async () => {
    const res = await api(gatewayBase, "/api/auth/login", {
      method: "POST",
      body: { email: LEARNER.email, password: LEARNER.password },
    });
    assert.equal(res.status, 200, `the sign-in was refused: ${res.text}`);
    assert.equal(res.body.user.id, learner.id, "and it is the same account");
    assert.ok(res.body.tokens.accessToken);

    const me = await api(gatewayBase, "/api/auth/me", { token: res.body.tokens.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, LEARNER.email);

    const wrong = await api(gatewayBase, "/api/auth/login", {
      method: "POST",
      body: { email: LEARNER.email, password: "not-the-password" },
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, "invalid_credentials");
  });

  it("they can sign in to the IDE against the local platform", async () => {
    // The IDE shows a code and opens the browser; the browser approves it as
    // the signed-in learner; the IDE polls with the device secret. Three
    // requests, and the session belongs to the learner who approved the code.
    const start = await api(gatewayBase, "/api/auth/device/start", { method: "POST", body: {} });
    assert.equal(start.status, 200, `the device flow did not start: ${start.text}`);
    assert.match(
      start.body.userCode,
      /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
      "the code is one a learner types without reading it wrong"
    );

    const pending = await api(gatewayBase, "/api/auth/device/poll", {
      method: "POST",
      body: { deviceCode: start.body.deviceCode },
    });
    assert.equal(pending.body.status, "pending", "and it is pending until the browser approves it");

    const approve = await api(gatewayBase, "/api/auth/device/approve", {
      method: "POST",
      body: { userCode: start.body.userCode },
      token: learnerToken,
    });
    assert.equal(approve.status, 200, `the code was not approved: ${approve.text}`);

    const poll = await api(gatewayBase, "/api/auth/device/poll", {
      method: "POST",
      body: { deviceCode: start.body.deviceCode },
    });
    assert.equal(poll.body.status, "approved");
    assert.equal(poll.body.user.id, learner.id, "the session is the approving learner's");
    ideToken = poll.body.tokens.accessToken;

    const spent = await api(gatewayBase, "/api/auth/device/poll", {
      method: "POST",
      body: { deviceCode: start.body.deviceCode },
    });
    assert.equal(spent.body.status, "pending", "and the code is spent: one code, one session");
  });

  it("the first phase of the first course is behind the licence until the licence is confirmed", async () => {
    const closed = await api(gatewayBase, `/api/curriculum/ide/phases/${FIRST_PHASE}`, {
      token: ideToken,
    });
    assert.equal(closed.status, 402, "a learner with no licence is refused the phase");
    assert.equal(closed.body.error.code, "entitlement_required");

    // The institutional route: an instructor asks for a licence, the learner
    // joins with the code, and the operator confirms it. Nothing grants a seat
    // until that confirmation.
    const instructor = await api(gatewayBase, "/api/auth/register", {
      method: "POST",
      body: registrationFor(INSTRUCTOR),
    });
    assert.equal(instructor.status, 201);
    instructorToken = instructor.body.tokens.accessToken;

    const created = await api(gatewayBase, "/api/auth/cohorts", {
      method: "POST",
      token: instructorToken,
      body: {
        name: "A Class",
        institution: "A School",
        courseId: DEFAULT_COURSE,
        term: "2026-autumn",
        seats: 20,
      },
    });
    assert.equal(created.status, 201, `the cohort was refused: ${created.text}`);
    assert.equal(created.body.cohort.status, "pending", "and it waits for the operator");

    const joined = await api(gatewayBase, "/api/auth/cohorts/join", {
      method: "POST",
      token: ideToken,
      body: { joinCode: created.body.cohort.joinCode },
    });
    assert.equal(joined.status, 200, `the learner did not join: ${joined.text}`);

    const stillClosed = await api(gatewayBase, `/api/curriculum/ide/phases/${FIRST_PHASE}`, {
      token: ideToken,
    });
    assert.equal(stillClosed.status, 402, "a pending licence grants nothing");

    // The operator's confirmation, over the mesh, where no browser can reach.
    const activated = await api(authBase, "/internal/cohorts/activate", {
      method: "POST",
      headers: { "x-internal-key": MESH_KEY },
      body: { joinCode: created.body.cohort.joinCode, seats: 20, perStudentCents: 1200 },
    });
    assert.equal(activated.status, 200, `the licence was not confirmed: ${activated.text}`);
    assert.equal(activated.body.cohort.status, "active");

    const open = await api(gatewayBase, `/api/curriculum/ide/phases/${FIRST_PHASE}`, {
      token: ideToken,
    });
    assert.equal(open.status, 200, `the phase was refused after the licence: ${open.text}`);
    phasePayload = open.body;
    rubric = phasePayload.rubric;
    provenance = phasePayload.provenance;
    assert.equal(phasePayload.phase.id, FIRST_PHASE);
  });

  it("the phase carries the rubric and the provenance a reader will be shown", async () => {
    assert.equal(rubric.phaseId, FIRST_PHASE);
    assert.equal(rubric.courseId, DEFAULT_COURSE);
    assert.equal(provenance.phaseId, FIRST_PHASE);
    assert.equal(provenance.courseId, DEFAULT_COURSE);
    assert.ok(provenance.author.length > 0, "the phase names its author");
    assert.equal(provenance.reviewer, null, "and no reviewer, because none has read it");
    assert.equal(provenance.reviewedOn, null);
    assert.ok(provenance.source.includes("nexora-ide"), "the phase says where it came from");
    assert.ok(provenance.licence.length > 0, "and what licence it ships under");

    // The three lists partition the phase: every activity the phase reaches is
    // in exactly one of them, so a reader cannot find an activity the rubric
    // does not account for.
    const activities = Object.keys(phasePayload.activities);
    const classified = [...rubric.attested, ...rubric.clientReported, ...rubric.material];
    assert.deepEqual(
      [...classified].sort(),
      [...activities].sort(),
      "the rubric accounts for every activity of the phase, and for each one once"
    );
    assert.equal(new Set(classified).size, classified.length);

    // The plain sentence, which is what a reader who will not read the lists
    // gets. It must not claim more than the lists hold, and it must say the
    // same number the lists say. The wording is read loosely on purpose: the
    // claim is the number, not the grammar.
    const attestedCount = rubric.attested.length;
    const reportedCount = rubric.clientReported.length;
    const attestedSentence = rubric.statement.match(/recomputes (\d+) of this phase's activities/);
    const reportedSentence = rubric.statement.match(
      /(\d+) of its activities rests? on the learner's own account/
    );
    if (attestedCount > 0) {
      assert.ok(attestedSentence, `the statement says what the server recomputes: ${rubric.statement}`);
      assert.equal(
        Number(attestedSentence[1]),
        attestedCount,
        `the statement counts ${attestedSentence[1]} and the list holds ${attestedCount}: ${rubric.statement}`
      );
    } else {
      assert.ok(
        rubric.statement.includes("Nothing in this phase is checked by the server."),
        `the statement says nothing is checked, and the list is empty: ${rubric.statement}`
      );
    }
    if (reportedCount > 0) {
      assert.ok(
        reportedSentence,
        `the statement says what rests on the learner's own account: ${rubric.statement}`
      );
      assert.equal(
        Number(reportedSentence[1]),
        reportedCount,
        `the statement counts ${reportedSentence[1]} and the list holds ${reportedCount}: ${rubric.statement}`
      );
    }
    assert.ok(rubric.statement.startsWith(`${phasePayload.phase.title}:`), "and it names the phase");
  });

  it("the catalogue a reader browses later says the same thing about that phase", async () => {
    const catalogue = await api(gatewayBase, "/api/curriculum/ide/provenance", {
      headers: { "x-internal-key": MESH_KEY },
    });
    assert.equal(catalogue.status, 200, `the catalogue did not answer: ${catalogue.text}`);
    const course = catalogue.body.courses.find((c) => c.id === DEFAULT_COURSE);
    assert.ok(course, "the catalogue holds the course");
    const entry = course.phases.find((p) => p.provenance.phaseId === FIRST_PHASE);
    assert.ok(entry, "and the phase");
    catalogueRubric = entry.rubric;
    assert.deepEqual(
      catalogueRubric,
      rubric,
      "the rubric on the phase payload and the rubric in the catalogue are one record"
    );
    assert.equal(entry.provenance.reviewer, null, "and the provenance says the same thing there");
  });

  it("the work itself is recorded: the draft, the attempt, the completion", async () => {
    // The extension's observation judges a terminal run by three facts: the
    // command the shell reported, the exit code it reported, and what the
    // command wrote. These are those facts, so the platform holds the same
    // account of the run the IDE judged.
    const draft = await api(gatewayBase, `/api/progress/drafts/${FIRST_PHASE}`, {
      method: "PUT",
      token: ideToken,
      body: {
        content: {
          step: "setup-learn-tools",
          command: "node -v",
          output: "v20.11.0",
          note: "the toolchain answers",
        },
        updatedAt: new Date().toISOString(),
      },
    });
    assert.equal(draft.status, 200, `the draft was refused: ${draft.text}`);
    assert.equal(draft.body.applied, true);

    const attempt = await api(gatewayBase, "/api/progress/attempts", {
      method: "POST",
      token: ideToken,
      body: {
        id: "attempt-setup-tools-1",
        phaseId: FIRST_PHASE,
        kind: "run",
        outcome: "passed",
        payload: { command: "node -v", exitCode: 0, output: "v20.11.0", confidence: "high" },
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(attempt.status, 201, `the attempt was refused: ${attempt.text}`);

    const completion = await api(gatewayBase, "/api/progress/complete", {
      method: "POST",
      token: ideToken,
      body: { phaseId: FIRST_PHASE, completedAt: new Date().toISOString() },
    });
    assert.equal(completion.status, 201, `the completion was refused: ${completion.text}`);
    assert.equal(completion.body.completion.phaseId, FIRST_PHASE);

    // The learner reads their own work back, and it is theirs alone.
    const progress = await api(gatewayBase, "/api/progress", { token: ideToken });
    assert.equal(progress.status, 200);
    assert.equal(progress.body.userId, learner.id);
    assert.equal(progress.body.drafts.length, 1);
    assert.equal(progress.body.drafts[0].phaseId, FIRST_PHASE);
    assert.equal(progress.body.drafts[0].content.command, "node -v");
    assert.equal(progress.body.attempts.length, 1);
    assert.equal(progress.body.attempts[0].payload.output, "v20.11.0");
    assert.equal(progress.body.completions.length, 1);
    assert.equal(progress.body.completions[0].phaseId, FIRST_PHASE);
    assert.equal(progress.body.streak.days, 1, "and the platform counted the day themselves were active");

    // The record is in the database, under the learner, and nowhere else.
    const { rows } = await pool.query(
      "SELECT user_id, phase_id, source FROM progress_completions WHERE user_id = $1",
      [learner.id]
    );
    assert.deepEqual(rows.map((r) => [r.user_id, r.phase_id]), [[learner.id, FIRST_PHASE]]);

    const other = await api(gatewayBase, "/api/progress", { token: instructorToken });
    assert.equal(other.body.completions.length, 0, "and another account sees none of it");
  });

  it("the work a guest did before signing in moves into the account", async () => {
    const migrated = await api(gatewayBase, "/api/progress/migrate", {
      method: "POST",
      token: ideToken,
      body: {
        drafts: [
          {
            phaseId: "fundamentals",
            content: { step: "fundamentals-notes" },
            updatedAt: new Date().toISOString(),
          },
        ],
        attempts: [
          {
            id: "attempt-guest-1",
            phaseId: "fundamentals",
            kind: "run",
            outcome: "passed",
            payload: { command: "node --test" },
            createdAt: new Date().toISOString(),
          },
        ],
        completions: [
          { phaseId: FIRST_PHASE, completedAt: new Date().toISOString() },
          { phaseId: "fundamentals", completedAt: new Date().toISOString() },
        ],
        streak: { days: 3, lastActiveOn: new Date().toISOString().slice(0, 10) },
        placement: { start: 1 },
      },
    });
    assert.equal(migrated.status, 200, `the migration was refused: ${migrated.text}`);
    const outcomes = migrated.body.migrated;
    assert.equal(outcomes.drafts[0].outcome, "migrated", "the guest's draft moved across");
    assert.equal(outcomes.attempts[0].outcome, "migrated", "and the guest's attempt");
    assert.equal(
      outcomes.completions[0].outcome,
      "server",
      "but the platform's own completion of that phase stands"
    );
    assert.equal(outcomes.completions[1].outcome, "migrated", "and the phase the platform had not seen came across");

    const progress = await api(gatewayBase, "/api/progress", { token: ideToken });
    assert.equal(progress.body.drafts.length, 2, "the learner sees the guest's work as their own");
    assert.equal(progress.body.attempts.length, 2);
    assert.equal(progress.body.completions.length, 2);
    assert.equal(progress.body.streak.days, 3, "and the longer streak stands");
    assert.deepEqual(progress.body.placement, { start: 1 });
  });

  it("the platform re-judges the learner's work itself, and signs what it saw", async () => {
    // The challenge of the phase, as the curriculum states it: the command it
    // runs, the checks it judges, and the files it is about.
    const challengeId = rubric.attested[0];
    const challenge = phasePayload.activities[challengeId];
    assert.ok(challenge, "the phase holds the activity the rubric calls attested");
    assert.ok(challenge.testCommand, "and that activity names the command the server runs");
    assert.ok(challenge.checks.length > 0, "and the checks it judges");
    attestedActivityId = challengeId;
    attestedActivity = challenge;

    // The learner's own project: the files the phase is about, written so the
    // platform's own copy of the suite has something to judge. The content is
    // the learner's; the suite that judges it is the platform's.
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({ name: "task-manager", scripts: { dev: "vite" } }, null, 2),
      },
      {
        path: "src/main.jsx",
        content:
          "import { createRoot } from 'react-dom/client';\n" +
          "import { App } from './App.jsx';\n\n" +
          "const root = document.getElementById('root');\n" +
          "createRoot(root).render(<App />);\n",
      },
    ];

    const verdict = await api(gatewayBase, "/api/execute/attest", {
      method: "POST",
      token: ideToken,
      body: {
        checkIds: challenge.checks.map((c) => c.id),
        checks: challenge.checks.map((c) => ({ id: c.id, tests: c.tests })),
        files,
        command: challenge.testCommand,
        project: DEFAULT_COURSE,
      },
    });
    assert.equal(verdict.status, 200, `the submission was refused: ${verdict.text}`);
    assert.equal(verdict.body.provenance, "attested", "the platform judged it, not the client");
    for (const check of verdict.body.checks) {
      assert.equal(check.passed, true, `the platform re-judged ${check.checkId} and it did not hold`);
    }
    assert.ok(verdict.body.receipt, "and the platform signed what it saw");
    assert.equal(verdict.body.receipt.facts.runner, "subprocess", "the run happened on the platform's own runner");
    assert.equal(verdict.body.receipt.facts.exitCode, 0, "and the suite passed there");

    // The receipt is the platform's own, and it names the work it judged.
    const receipt = verdict.body.receipt;
    attestedReceipt = receipt;
    attestedCompetencyId = challenge.competencyIds[0];
    // The command the platform ran is the one the curriculum names, and the
    // files it judged are the learner's own plus the suite it ran.
    assert.deepEqual(receipt.facts.command, challenge.testCommand.split(" "));
    const judged = receipt.facts.files.map((f) => f.path);
    for (const file of challenge.files) {
      assert.ok(judged.includes(file), `the receipt names ${file}, the file the phase is about`);
    }
    assert.equal(
      receipt.facts.files.length,
      files.length + 1,
      "and the suite the platform ran is the only other file in it"
    );
    assert.ok(
      judged.includes(challenge.testCommand.split(" ").at(-1)),
      "and that suite is the platform's own copy, not the learner's"
    );
  });

  it("the proof lands in the ledger, and the ledger holds nothing else", async () => {
    const competencyId = attestedCompetencyId;
    const synced = await api(gatewayBase, "/api/auth/proofs", {
      method: "POST",
      token: ideToken,
      body: {
        competencyId,
        level: "practiced",
        lastDemonstratedAt: new Date().toISOString(),
        lastRetrievedAt: null,
        receipt: attestedReceipt,
      },
    });
    assert.equal(synced.status, 201, `the proof was refused: ${synced.text}`);
    assert.equal(synced.body.stored, true);
    assert.equal(synced.body.proof.competencyId, competencyId);
    assert.equal(synced.body.proof.kind, "run");

    const ledger = await api(gatewayBase, "/api/auth/proofs", { token: ideToken });
    assert.equal(ledger.status, 200);
    assert.equal(ledger.body.proofs.length, 1, "the learner holds one verified proof");
    assert.equal(ledger.body.proofs[0].competencyId, competencyId);
    assert.equal(ledger.body.proofs[0].kind, "run");

    // The alias the front door uses is the same ledger, not a second one.
    const alias = await api(gatewayBase, "/api/proofs", { token: ideToken });
    assert.equal(alias.status, 200);
    assert.deepEqual(alias.body.proofs, ledger.body.proofs);

    // A receipt the platform did not sign is not a proof, and it never becomes
    // a row: the ledger only holds what the server can re-derive.
    const forged = await api(gatewayBase, "/api/auth/proofs", {
      method: "POST",
      token: ideToken,
      body: {
        competencyId: "project-setup",
        level: "demonstrated",
        lastDemonstratedAt: new Date().toISOString(),
        lastRetrievedAt: null,
        receipt: { ...attestedReceipt, sig: "0".repeat(64) },
      },
    });
    assert.equal(forged.status, 401, "a forged receipt is refused");
    const after = await api(gatewayBase, "/api/auth/proofs", { token: ideToken });
    assert.equal(after.body.proofs.length, 1, "and it left the ledger alone");
  });

  it("the rubric and the ledger agree about what the server recomputed", async () => {
    // The rubric's claim: these activities the server recomputes by running
    // the work, these rest on the learner's own account, and these are reading.
    // The ledger's claim: exactly one proof, and it is the one the platform
    // re-judged and signed for an activity the rubric calls attested.
    const attestedActivities = rubric.attested.map((id) => phasePayload.activities[id]);
    assert.ok(attestedActivities.length > 0, "the rubric names something the server recomputes");
    for (const activity of attestedActivities) {
      assert.ok(activity.testCommand, `${activity.id} is called attested and names no command`);
      assert.ok(
        Array.isArray(activity.checks) && activity.checks.length > 0,
        `${activity.id} is called attested and carries no checks`
      );
    }
    for (const id of rubric.clientReported) {
      const activity = phasePayload.activities[id];
      assert.ok(
        !activity.testCommand,
        `${id} rests on the learner's own account and must not name a command the server could run`
      );
    }
    for (const id of rubric.material) {
      const activity = phasePayload.activities[id];
      assert.ok(
        !activity.testCommand,
        `${id} is reading and must not name a command the server could run`
      );
      assert.ok(
        !activity.checks || activity.checks.length === 0,
        `${id} is reading and must not carry checks the server could hold to account`
      );
    }

    // The proof in the ledger is for an activity the rubric calls attested, and
    // the receipt names the work of that activity and no other.
    const receipt = attestedReceipt;
    const attestedIds = new Set(rubric.attested);
    assert.ok(
      attestedIds.has(attestedActivityId),
      "the proof in the ledger is for an activity the rubric calls attested"
    );
    assert.equal(
      attestedCompetencyId,
      attestedActivity.competencyIds[0],
      "and it is for that activity's own competency"
    );
    assert.deepEqual(
      receipt.facts.command,
      attestedActivity.testCommand.split(" "),
      "and the command the platform ran is that activity's own command"
    );
    for (const file of receipt.facts.files) {
      if (file.path === "test/setup.test.mjs") continue;
      assert.ok(
        attestedActivity.files.includes(file.path),
        `the receipt names ${file.path}, which the attested activity does not own`
      );
    }

    // And the learner's own work, the lesson they finished by running a
    // command, is recorded where it belongs and nowhere else: the platform
    // holds their completion of the phase, and holds no proof for it.
    const progress = await api(gatewayBase, "/api/progress", { token: ideToken });
    assert.ok(
      progress.body.completions.some((c) => c.phaseId === FIRST_PHASE),
      "the completion the learner earned is on the platform"
    );
    const ledger = await api(gatewayBase, "/api/auth/proofs", { token: ideToken });
    assert.equal(
      ledger.body.proofs.length,
      1,
      "and the ledger holds one proof, which is the one the server recomputed"
    );
  });

  it("the rubric the platform serves is the rubric the IDE's own document supports", async (t) => {
    // The platform's curriculum is a synced copy of the IDE's shipped
    // curriculum. If the two drift, the rubric stops describing the work the
    // learner is actually asked to do: the platform would name an activity the
    // learner never meets, and a reader would read the rubric as a claim
    // about a lesson that is not there. The IDE checkout is a sibling of this
    // repository; where it is absent there is nothing to compare against, and
    // the suite says so rather than passing quietly.
    const shipped = join(root, "..", "..", "nexora-ide", "extensions", "nexora", "curriculum", "shipped");
    const document = join(shipped, `${DEFAULT_COURSE}.json`);
    if (!existsSync(document)) {
      t.skip("the IDE checkout is not beside this repository");
      return;
    }
    const authored = JSON.parse(readFileSync(document, "utf8"));
    const phase = authored.phases.find((p) => p.id === FIRST_PHASE);
    assert.ok(phase, "the IDE's document holds the phase");

    const attested = [];
    const clientReported = [];
    const material = [];
    for (const id of phase.activities) {
      const activity = authored.activities[id];
      const checks = Array.isArray(activity.checks) ? activity.checks : [];
      const command = typeof activity.testCommand === "string" ? activity.testCommand.trim() : "";
      if ((checks.length > 0 && command.length > 0) || activity.incidentId || activity.designId) {
        attested.push(id);
      } else if (["lesson", "prose", "example", "keypoints"].includes(activity.kind)) {
        material.push(id);
      } else {
        clientReported.push(id);
      }
    }

    // Both directions, because either one is a disagreement a learner would
    // meet. The platform's own gate for the same drift is
    // `npm run sync:check` in this repository.
    const inIde = new Set(phase.activities);
    const inRubric = new Set([...rubric.attested, ...rubric.clientReported, ...rubric.material]);
    const onlyPlatform = [...inRubric].filter((id) => !inIde.has(id));
    const onlyIde = [...inIde].filter((id) => !inRubric.has(id));
    assert.deepEqual(
      onlyPlatform,
      [],
      `the platform's rubric names ${onlyPlatform.join(", ")}, which the IDE's shipped curriculum does not have`
    );
    assert.deepEqual(
      onlyIde,
      [],
      `the IDE's shipped curriculum has ${onlyIde.join(", ")}, which the platform's rubric does not account for`
    );
    assert.deepEqual([...rubric.attested].sort(), attested.sort(), "the rubric's attested list is the document's");
    assert.deepEqual(
      [...rubric.clientReported].sort(),
      clientReported.sort(),
      "and so is its client-reported list"
    );
    assert.deepEqual([...rubric.material].sort(), material.sort(), "and its material list");
  });
});

/* The front door's own register and sign-in routes, driven over HTTP.
 *
 * The front door is a SvelteKit app in the repository beside this one, and its
 * session routes are plain POST endpoints: no browser is needed to walk them.
 * The suite starts the built app with its gateway address pointed at the
 * gateway this file started, and asks it to do the two things a learner does
 * before the IDE is even open. */
describe("the front door registers and signs the learner in (real HTTP)", () => {
  const frontDoor = join(root, "..", "nexora-svelte");
  let child;
  let base;
  let frontDoorStderr = "";

  before(async () => {
    const build = join(frontDoor, "build", "index.js");
    if (!existsSync(build)) {
      console.log("  ~ the front door is not built here: its part was skipped");
      return;
    }
    /* A build older than the route it serves is a build of something else.
       The proof has to be about the code in this tree, so an old build is
       skipped and said out loud rather than quietly proving the wrong thing. */
    const route = join(frontDoor, "src", "routes", "auth", "session", "register", "+server.ts");
    if (existsSync(route) && statSync(build).mtimeMs < statSync(route).mtimeMs) {
      console.log("  ~ the front door build is older than its register route: its part was skipped");
      return;
    }
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [join(frontDoor, "build", "index.js")], {
      cwd: frontDoor,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        ORIGIN: base,
        GATEWAY_URL: gatewayBase,
        PUBLIC_API_URL: gatewayBase,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr?.on("data", (chunk) => {
      frontDoorStderr += String(chunk);
    });
    child.stdout?.resume();
    await waitForFrontDoor(base, child, () => frontDoorStderr);
  });

  after(async () => {
    child?.kill();
  });

  it("a learner registers on the front door and gets a session", async (t) => {
    if (!base) {
      t.skip("the front door is not built in this checkout");
      return;
    }
    const res = await api(base, "/auth/session/register", {
      method: "POST",
      body: registrationFor({
        email: "a.front.door.learner@example.com",
        password: "a-long-new-password",
      }),
    });
    assert.equal(res.status, 201, `the front door refused the registration: ${res.text}`);
    assert.equal(res.body.user.email, "a.front.door.learner@example.com");
    assert.ok(res.body.accessToken, "and it hands the page an access token");
    assert.equal(res.body.refreshToken, undefined, "and never the refresh token");
    const cookie = res.headers.get("set-cookie");
    assert.ok(cookie && cookie.includes("nexora_refresh"), "the refresh token goes into an HttpOnly cookie");
    assert.match(cookie, /HttpOnly/i);
  });

  it("and signs in again with the password they chose", async (t) => {
    if (!base) {
      t.skip("the front door is not built in this checkout");
      return;
    }
    const res = await api(base, "/auth/session/login", {
      method: "POST",
      body: { email: "a.front.door.learner@example.com", password: "a-long-new-password" },
    });
    assert.equal(res.status, 200, `the front door refused the sign-in: ${res.text}`);
    assert.equal(res.body.user.email, "a.front.door.learner@example.com");
    assert.ok(res.body.accessToken);
    assert.equal(res.body.refreshToken, undefined);
  });

  it("and refuses a wrong password the way the platform does", async (t) => {
    if (!base) {
      t.skip("the front door is not built in this checkout");
      return;
    }
    const res = await api(base, "/auth/session/login", {
      method: "POST",
      body: { email: "a.front.door.learner@example.com", password: "not-the-password" },
    });
    assert.equal(res.status, 401, `the front door refused the wrong password: ${res.text}`);
    assert.equal(res.body.error.code, "invalid_credentials");
  });
});

/* Wait for the gateway to answer on its port, and say what it said when it did
   not start. */
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

/* The same, for the front door. */
async function waitForFrontDoor(base, child, stderr) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the front door did not start: ${stderr()}`);
    }
    try {
      const res = await fetch(base + "/", { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the front door did not answer in time: ${stderr()}`);
}
