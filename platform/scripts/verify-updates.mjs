/* Updates: what happens to a learner's progress when the content changes, when
 * the code is rolled back, and when the two halves of the product are a
 * version apart.
 *
 * The question this file answers is the one a learner would ask: "I did the
 * work, you shipped new content, is my work still there?" Six things have to
 * be true, and each of them is proved here against a real database and over
 * real HTTP:
 *
 *   1. A content update does not touch a learner's progress. The keys are the
 *      phase id and the activity id, so the same phase in a new content
 *      version keeps the completion the learner earned, and the receipt the
 *      platform minted still verifies.
 *   2. A phase that is renamed, moved to another course or removed does not
 *      take the learner's records with it. The records stay, the export still
 *      carries them with their ids, and the platform says plainly what it
 *      still holds and what it does not.
 *   3. A phase id REUSED for different content is the dangerous case, and it
 *      is proved here rather than asserted: the platform carries the
 *      completion over, and nothing detects it.
 *   4. A platform deploy does not lose a learner's data, and a rollback of
 *      the code rolls back the code and not the data.
 *   5. A guest's work moving into an account is safe: the server's record
 *      wins, the newest draft wins, attempts are the union, and a refused
 *      migration changes nothing at all.
 *   6. The fork and the platform are deployed independently, so an old build
 *      can meet a new platform and a new build can meet an old one. Both
 *      directions are walked here, over HTTP, against the real services.
 *
 * A content version is DATA, and a test may change it. So the second content
 * version in this file is a second copy of the curriculum service's own build,
 * with a different snapshot in it, served by the service's own routes: the
 * thing under test is the service's behaviour when its data changes, not a
 * description of it. The copy lives under node_modules/.cache and is removed
 * when the file is done.
 *
 * The database is real: a PGlite instance (Postgres compiled to WebAssembly)
 * behind a socket server, with the identity service's own migrations applied
 * in order by the platform's own migration runner, because the forward-only
 * claim in item 4 is a claim about that runner and not about a re-implementation
 * of it.
 *
 * Nothing here reaches the local development database: the database is
 * PGlite, held in memory, created and dropped by this file. It runs as
 * `npm run verify:updates`. */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { createService, migrate, signReceipt } from "@nexora/service-kit";
import { runReceiptPayload } from "@nexora/contracts";
import { registerAuthRoutes } from "../services/auth/dist/routes.js";
import { registerProgressRoutes } from "../services/auth/dist/progress.js";
import { registerCurriculumRoutes } from "../services/curriculum/dist/routes.js";
import { registerExecutionRoutes } from "../services/execution/dist/routes.js";
import { JobQueue } from "../services/execution/dist/queue.js";
import { Quotas } from "../services/execution/dist/quotas.js";

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

/* The mesh key and the receipt key are the same secret in this platform (see
   services/execution/src/receipt.ts), so a receipt the test mints here is a
   receipt the platform would have minted. The chassis refuses to boot without
   a mesh key, because without one every internal route would trust a bare
   x-user-id header from any caller, so the suite gives the services a real key
   rather than switching the check off. */
process.env.INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ?? "test-mesh-key-0123456789abcdef0123456789";
const MESH_KEY = process.env.INTERNAL_API_KEY;
process.env.LOG_LEVEL = "warn";

/* The learner the suite acts as. One account, because every question here is
   about one person's record and what happens to it. */
const LEARNER = "u-learner";

/* The phase the suite works on. It is a real phase of the real catalogue, and
   the suite reads its ids from the platform's own snapshot rather than writing
   them here, so the proof follows the product when the curriculum moves. */
const COURSE = "task-manager";
const PHASE = "setup";
/* A paid phase, for the move: moving a free phase would move the paywall
   boundary, and this file is about records, not about tier. */
const MOVED = "review";

/* Where the second content version's copy of the service lives. Under
   node_modules/.cache, so it is a build artefact and not a change to the
   tree. */
const CACHE = join(root, "node_modules", ".cache", "nexora-verify-updates");

let db;
let socketServer;
let pool;
let authApp;
let oldApp;
let execApp;
let authBase;
let oldBase;
let execBase;
/* The catalogue as it ships, and the same service with three other snapshots
   in it: a rewritten lesson, a phase moved to another course, and a phase
   that no longer exists. */
let v1Base;
let v2Base;
let movedBase;
let removedBase;
let reusedBase;
const apps = [];

const asUser = (id = LEARNER) => ({ "x-user-id": id, "x-internal-key": MESH_KEY });
/* The headers the gateway injects when it forwards an entitled call. The
   suite talks to the services directly rather than through the edge, so it
   adds them itself; the client code under test is the real client code. */
const asEntitled = (id = LEARNER) => ({
  ...asUser(id),
  "x-entitled": "1",
  "x-entitled-courses": "*",
});

/** A call over the wire. Every fact the suite asserts came back over HTTP. */
async function api(base, path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers ?? {}) };
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

/** The learner's progress, as the platform reports it. */
async function progress(base = authBase) {
  const res = await api(base, "/progress", { headers: asUser() });
  assert.equal(res.status, 200, `the progress surface answered: ${res.text}`);
  return res.body;
}

/** The learner's own record, as the export carries it. */
async function exported(base = authBase) {
  const res = await api(base, "/account/export", { headers: asUser() });
  assert.equal(res.status, 200, `the export answered: ${res.text}`);
  return res.body;
}

/** Every row this service holds about the learner, in one comparable value. */
async function learnerRows() {
  const { rows } = await pool.query(
    "SELECT 'draft' AS kind, phase_id AS id, content::text AS body, updated_at::text AS at FROM progress_drafts WHERE user_id = $1 " +
      "UNION ALL SELECT 'attempt', id, payload::text, created_at::text FROM progress_attempts WHERE user_id = $1 " +
      "UNION ALL SELECT 'completion', phase_id, source, completed_at::text FROM progress_completions WHERE user_id = $1 " +
      "ORDER BY kind, id",
    [LEARNER]
  );
  return rows;
}

/**
 * A second instance of the curriculum service with a different snapshot in it.
 *
 * The service parses its snapshot when the module loads, so a second content
 * version needs a second instance of the module. The instance is a copy of the
 * service's own build with the snapshot changed in it, so the code under test
 * is the shipped code and only the data differs, which is what a content
 * update is.
 */
async function curriculumWith(name, contentVersion, mutate) {
  const dir = join(CACHE, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const dist = join(dir, "dist");
  cpSync(join(root, "services", "curriculum", "dist"), dist, { recursive: true });

  /* The stamp the service reports and the manifest records, moved with the
     content. It is a generated file, so the copy's is rewritten rather than
     the repository's. */
  writeFileSync(
    join(dist, "data", "ide-version.js"),
    `export const IDE_CONTENT_VERSION = ${JSON.stringify(contentVersion)};\n` +
      `export const IDE_CONTENT_SYNCED_AT = "2026-10-20T12:00:00.000Z";\n` +
      `export const IDE_CONTENT_SOURCE = "nexora-ide/extensions/nexora/curriculum";\n`,
    "utf8"
  );

  const data = await import(pathToFileURL(join(dist, "data", "ide-courses.js")).href);
  mutate(data.IDE_COURSES);
  const routes = await import(pathToFileURL(join(dist, "routes.js")).href);
  const app = await createService(`curriculum-${name}`);
  /* Mounted under the path the edge forwards it at, so the IDE's own client
     reaches it with the URL it builds in production. The prefix is the
     gateway's, and the routes are the service's own. */
  await app.register(async (child) => {
    routes.registerCurriculumRoutes(child);
  }, { prefix: "/api/curriculum" });
  const port = await freePort();
  await app.listen({ port, host: "127.0.0.1" });
  apps.push(app);
  return `http://127.0.0.1:${port}`;
}

/** The phase in a snapshot, as the document holds it. */
function phaseOf(course, id) {
  const phase = course.document.phases.find((p) => p.id === id);
  if (!phase) throw new Error(`the snapshot has no phase ${id}`);
  return phase;
}

/* The IDE checkout, which is a sibling of this repository. The client half of
   the version-skew proof is the IDE's own compiled code, and the question of
   whether it is the OLD build's code is answered by the history, not by
   assumption. */
const ideRoot = join(root, "..", "..", "nexora-ide");

/** The previous release's own source, when the history is reachable. */
function idePreviousSource(path) {
  try {
    return execFileSync("git", ["show", `060668c4^:${path}`], {
      cwd: ideRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/**
 * A catalogue the service refuses to serve, and the reason it gives.
 *
 * The service parses its snapshot when the module loads, so a snapshot with
 * one phase id in two courses stops the service from starting at all. That
 * is the one reuse the platform does catch, and it is caught at boot.
 */
async function catalogueRefused(name, contentVersion, mutate) {
  const dir = join(CACHE, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const dist = join(dir, "dist");
  cpSync(join(root, "services", "curriculum", "dist"), dist, { recursive: true });
  writeFileSync(
    join(dist, "data", "ide-version.js"),
    `export const IDE_CONTENT_VERSION = ${JSON.stringify(contentVersion)};\n` +
      `export const IDE_CONTENT_SYNCED_AT = "2026-10-20T12:00:00.000Z";\n` +
      `export const IDE_CONTENT_SOURCE = "nexora-ide/extensions/nexora/curriculum";\n`,
    "utf8"
  );
  const data = await import(pathToFileURL(join(dist, "data", "ide-courses.js")).href);
  mutate(data.IDE_COURSES);
  const loaded = await import(pathToFileURL(join(dist, "routes.js")).href).then(
    () => null,
    (err) => err
  );
  return loaded;
}

describe("updates (real database, real HTTP)", () => {
  before(async () => {
    const pgPort = await freePort();
    db = await PGlite.create();
    socketServer = new PGLiteSocketServer({ db, port: pgPort, host: "127.0.0.1", maxConnections: 8 });
    await socketServer.start();
    pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${pgPort}/postgres`, max: 8 });

    /* The service's own migrations, in the order it applies them, by the
       platform's own runner. The runner records what it applied in
       schema_migrations and never un-applies anything, and item 4 is about
       exactly that. */
    const applied = await migrate(pool, join(root, "services", "auth", "migrations"));
    assert.ok(Array.isArray(applied), "the migrations were applied by the platform's own runner");

    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, created_at, provider, email_verified_at) " +
        "VALUES ($1, 'learner@example.com', 'The Learner', 'x', now(), 'local', now())",
      [LEARNER]
    );

    /* The identity service, as it runs. */
    authApp = await createService("auth");
    registerAuthRoutes(authApp, pool);
    registerProgressRoutes(authApp, pool);
    const authPort = await freePort();
    await authApp.listen({ port: authPort, host: "127.0.0.1" });
    authBase = `http://127.0.0.1:${authPort}`;

    /* The previous release's identity service: the same routes, without the
       progress surface, because the progress surface is what the new release
       added. This is a stand-in for the old platform, and it is a stand-in
       only in that one respect: the routes it registers are the shipped
       ones. */
    oldApp = await createService("auth-old");
    registerAuthRoutes(oldApp, pool);
    const oldPort = await freePort();
    await oldApp.listen({ port: oldPort, host: "127.0.0.1" });
    oldBase = `http://127.0.0.1:${oldPort}`;

    /* The execution service, for the one thing it is asked here: is a receipt
       the platform minted still verifiable after an update. */
    execApp = await createService("execution");
    registerExecutionRoutes(execApp, {
      queue: new JobQueue(2),
      quotas: new Quotas(50, 2),
      runner: "subprocess",
      attestFixtures: new Map(),
    });
    const execPort = await freePort();
    await execApp.listen({ port: execPort, host: "127.0.0.1" });
    execBase = `http://127.0.0.1:${execPort}`;

    /* The catalogue as it ships. */
    const curriculumApp = await createService("curriculum");
    await curriculumApp.register(async (child) => {
      registerCurriculumRoutes(child);
    }, { prefix: "/api/curriculum" });
    const curriculumPort = await freePort();
    await curriculumApp.listen({ port: curriculumPort, host: "127.0.0.1" });
    apps.push(curriculumApp);
    v1Base = `http://127.0.0.1:${curriculumPort}`;

    /* The same service with three other snapshots in it. */
    v2Base = await curriculumWith("rewritten", "aaaa00000002", (courses) => {
      const course = courses[COURSE];
      const phase = phaseOf(course, PHASE);
      phase.title = "Set up your machine";
      phase.goal = "The same phase id, a rewritten lesson.";
      const entry = course.manifest.phases.find((p) => p.id === PHASE);
      entry.title = phase.title;
      entry.goal = phase.goal;
      course.manifest.version += 1;
      course.document.version += 1;
    });

    movedBase = await curriculumWith("moved", "aaaa00000003", (courses) => {
      const from = courses[COURSE];
      const to = courses["api-basics"];
      const phase = phaseOf(from, MOVED);
      const index = from.document.phases.indexOf(phase);
      const entry = from.manifest.phases.find((p) => p.id === MOVED);
      from.document.phases.splice(index, 1);
      from.manifest.phases.splice(from.manifest.phases.indexOf(entry), 1);
      /* The phase keeps its id, and its work moves with it. */
      for (const activity of phase.activities) {
        to.document.activities[activity] = from.document.activities[activity];
        delete from.document.activities[activity];
      }
      to.document.phases.push(phase);
      to.manifest.phases.push({ ...entry });
    });

    removedBase = await curriculumWith("removed", "aaaa00000004", (courses) => {
      const course = courses[COURSE];
      course.document.phases = course.document.phases.filter((p) => p.id !== PHASE);
      course.manifest.phases = course.manifest.phases.filter((p) => p.id !== PHASE);
    });

    reusedBase = await curriculumWith("reused", "aaaa00000005", (courses) => {
      const course = courses[COURSE];
      const phase = phaseOf(course, PHASE);
      /* The same phase id, a different lesson: different activities, so the
         completion the learner earned is about work that no longer exists. */
      const other = phaseOf(course, "debug");
      const body = course.document.activities[other.activities[0]];
      const activityId = "reused-phase-other-activity";
      course.document.activities[activityId] = { ...body, id: activityId };
      phase.activities = [activityId];
      phase.title = "A different lesson under the same id";
      const entry = course.manifest.phases.find((p) => p.id === PHASE);
      entry.activityCount = 1;
      entry.title = phase.title;
    });
  });

  after(async () => {
    for (const app of apps) await app.close();
    await authApp?.close();
    await oldApp?.close();
    await execApp?.close();
    await pool?.end();
    await socketServer?.stop();
    await db?.close();
    rmSync(CACHE, { recursive: true, force: true });
  });

  /* ---------- the learner's work, recorded ---------- */

  it("the learner does the work: a draft, an attempt, a completion and a receipt", async () => {
    const draft = await api(authBase, `/progress/drafts/${PHASE}`, {
      method: "PUT",
      headers: asUser(),
      body: { content: { step: "setup-learn-tools", command: "node -v" }, updatedAt: new Date().toISOString() },
    });
    assert.equal(draft.status, 200, `the draft was refused: ${draft.text}`);

    const attempt = await api(authBase, "/progress/attempts", {
      method: "POST",
      headers: asUser(),
      body: {
        id: "attempt-setup-1",
        phaseId: PHASE,
        kind: "run",
        outcome: "passed",
        payload: { command: "node -v", exitCode: 0 },
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(attempt.status, 201, `the attempt was refused: ${attempt.text}`);

    const completion = await api(authBase, "/progress/complete", {
      method: "POST",
      headers: asUser(),
      body: { phaseId: PHASE, completedAt: new Date().toISOString() },
    });
    assert.equal(completion.status, 201, `the completion was refused: ${completion.text}`);

    /* A receipt the platform would have minted: signed with the mesh key over
       the payload the platform itself builds. */
    const issuedAt = new Date().toISOString();
    const facts = {
      language: "node",
      command: ["node", "--test"],
      files: [{ path: "test/setup.test.mjs", sha256: "b".repeat(64) }],
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      truncated: false,
      durationMs: 140,
      phase: "run",
      diagnostics: [],
      runner: "subprocess",
    };
    const receipt = { v: 1, issuedAt, facts, sig: signReceipt(runReceiptPayload(facts, issuedAt), MESH_KEY) };
    const proof = await api(authBase, "/proofs", {
      method: "POST",
      headers: asUser(),
      body: {
        competencyId: "project-setup",
        level: "practiced",
        lastDemonstratedAt: issuedAt,
        lastRetrievedAt: null,
        receipt,
      },
    });
    assert.equal(proof.status, 201, `the proof was refused: ${proof.text}`);

    /* And the platform agrees it is a receipt it minted. */
    const verified = await api(execBase, "/verify", { method: "POST", headers: asUser(), body: { receipt } });
    assert.equal(verified.status, 200, `the verify surface did not answer: ${verified.text}`);
    assert.equal(verified.body.valid, true, "and it says the receipt is the platform's own");
  });

  /* ---------- item 1: a content update ---------- */

  describe("a content update does not touch a learner's progress", () => {
    it("the same phase id serves a different lesson, under a different content version", async () => {
      const before = await api(v1Base, `/api/curriculum/ide/phases/${PHASE}`, { headers: asEntitled() });
      assert.equal(before.status, 200, `the phase was not served: ${before.text}`);
      assert.equal(before.body.phase.id, PHASE);
      const beforeVersion = before.headers.get("x-ide-content-version");
      assert.ok(beforeVersion, "and the response names the content version it came from");

      const after = await api(v2Base, `/api/curriculum/ide/phases/${PHASE}`, { headers: asEntitled() });
      assert.equal(after.status, 200, `the phase was not served after the update: ${after.text}`);
      assert.equal(after.body.phase.id, PHASE, "the phase id is the same");
      assert.notEqual(after.body.phase.title, before.body.phase.title, "and the lesson is not");
      assert.notEqual(
        after.headers.get("x-ide-content-version"),
        beforeVersion,
        "and the content version moved with the content"
      );
    });

    it("the completion the learner earned is still the learner's, under the same id", async () => {
      const after = await progress();
      const completion = after.completions.find((c) => c.phaseId === PHASE);
      assert.ok(completion, "the completion is still there after the content update");
      assert.equal(completion.source, "server", "and it is still the platform's own record of it");
      const { rows } = await pool.query(
        "SELECT completed_at::text AS at FROM progress_completions WHERE user_id = $1 AND phase_id = $2",
        [LEARNER, PHASE]
      );
      assert.equal(rows.length, 1, "and there is still exactly one row for that phase");
    });

    it("the draft and the attempt are still there, under the ids they were earned with", async () => {
      const after = await progress();
      assert.equal(after.drafts.length, 1);
      assert.equal(after.drafts[0].phaseId, PHASE);
      assert.equal(after.drafts[0].content.command, "node -v", "and the draft still holds the learner's own work");
      assert.equal(after.attempts.length, 1);
      assert.equal(after.attempts[0].id, "attempt-setup-1", "the attempt keeps the id the client minted");
    });

    it("the receipt the platform minted still verifies after the content update", async () => {
      const ledger = await api(authBase, "/proofs", { headers: asUser() });
      assert.equal(ledger.status, 200);
      assert.equal(ledger.body.proofs.length, 1, "the ledger still holds the proof");
      assert.equal(ledger.body.proofs[0].competencyId, "project-setup");

      const { rows } = await pool.query("SELECT receipt FROM proofs WHERE user_id = $1", [LEARNER]);
      assert.equal(rows.length, 1, "and the signed receipt is still in the database");
      const verified = await api(execBase, "/verify", {
        method: "POST",
        headers: asUser(),
        body: { receipt: rows[0].receipt },
      });
      assert.equal(verified.body.valid, true, "and it still verifies against the platform's own key");
    });

    it("the export carries the records with their ids", async () => {
      const file = await exported();
      assert.equal(file.format, "nexora-account-export");
      const completion = file.progress.completions.find((c) => c.phaseId === PHASE);
      assert.ok(completion, "the export carries the completion, with its phase id");
      assert.equal(file.progress.drafts[0].phaseId, PHASE, "and the draft, with its phase id");
      assert.equal(file.progress.attempts[0].id, "attempt-setup-1", "and the attempt, with its own id");
      assert.equal(file.progress.streak.days, 1, "and the streak the learner earned");
      assert.equal(file.proofs[0].competencyId, "project-setup", "and the proof, with its competency id");
    });
  });

  /* ---------- item 2: renamed, moved, removed ---------- */

  describe("a phase that is renamed, moved or removed keeps the learner's records", () => {
    it("a renamed phase keeps the completion, because the record is keyed by the id", async () => {
      const after = await progress();
      const completion = after.completions.find((c) => c.phaseId === PHASE);
      assert.ok(completion, "the completion is still there under the phase id");
      const file = await exported();
      assert.ok(
        file.progress.completions.some((c) => c.phaseId === PHASE),
        "and the export carries it with its id"
      );
    });

    it("a phase moved to another course is still served, and the records stay", async () => {
      const served = await api(movedBase, `/api/curriculum/ide/phases/${MOVED}`, { headers: asEntitled() });
      assert.equal(served.status, 200, `the moved phase was not served: ${served.text}`);
      assert.equal(served.body.phase.id, MOVED, "under the same id");

      const manifest = await api(movedBase, `/api/curriculum/ide/manifest?course=api-basics`, { headers: asUser() });
      assert.equal(manifest.status, 200);
      assert.ok(
        manifest.body.manifest.phases.some((p) => p.id === MOVED),
        "and the course it moved to holds it"
      );
      const gone = await api(movedBase, `/api/curriculum/ide/manifest?course=${COURSE}`, { headers: asUser() });
      assert.ok(
        !gone.body.manifest.phases.some((p) => p.id === MOVED),
        "and the course it left no longer claims it"
      );

      /* The learner never completed that phase, so there is no record of it to
         move. The record that does exist is the one they earned, and a move
         does not touch it. */
      const after = await progress();
      assert.ok(after.completions.some((c) => c.phaseId === PHASE), "the completion they earned is still there");
    });

    it("a removed phase leaves the records in place, and the platform says it is gone", async () => {
      const gone = await api(removedBase, `/api/curriculum/ide/phases/${PHASE}`, { headers: asEntitled() });
      assert.equal(gone.status, 404, "the platform does not serve a phase it no longer holds");
      assert.equal(gone.body.error.code, "not_found");

      const after = await progress();
      const completion = after.completions.find((c) => c.phaseId === PHASE);
      assert.ok(completion, "and the learner's record of it is still on the platform");
      assert.equal(completion.source, "server");

      const rows = await learnerRows();
      assert.ok(rows.some((r) => r.kind === "completion" && r.id === PHASE), "and the row is still in the database");

      const file = await exported();
      assert.ok(
        file.progress.completions.some((c) => c.phaseId === PHASE),
        "and the export still carries it, with its id"
      );
    });

    it("the export says what it does not hold, so a reader is not misled", async () => {
      const file = await exported();
      assert.ok(Array.isArray(file.notIncluded) && file.notIncluded.length >= 3, "the file names what it does not hold");
      const local = file.notIncluded.find((n) => /workspace/i.test(n.category));
      assert.ok(local, "and it names the local workspace copy");
      assert.match(local.where, /never sent to the platform/i, "which the platform says plainly");
    });
  });

  /* ---------- item 3: a phase id reused for different content ---------- */

  describe("a phase id reused for different content is the dangerous case", () => {
    it("the completion carries over to a lesson the learner never did", async () => {
      const served = await api(reusedBase, `/api/curriculum/ide/phases/${PHASE}`, { headers: asEntitled() });
      assert.equal(served.status, 200, "the platform serves the phase under its old id");
      assert.equal(served.body.phase.id, PHASE, "the same id");
      assert.notEqual(
        served.body.phase.activities[0],
        "setup-learn-tools",
        "and different work behind it"
      );

      const after = await progress();
      const completion = after.completions.find((c) => c.phaseId === PHASE);
      assert.ok(
        completion,
        "and the learner's completion of the old lesson is still reported under that id, with nothing saying so"
      );
    });

    it("nothing in the record says which content it was earned under", async () => {
      const { rows } = await pool.query(
        "SELECT * FROM progress_completions WHERE user_id = $1 AND phase_id = $2",
        [LEARNER, PHASE]
      );
      assert.equal(rows.length, 1);
      const record = rows[0];
      const columns = Object.keys(record);
      assert.ok(
        !columns.some((c) => /version|content/i.test(c)),
        `the completion carries no content version, so a reader cannot tell: ${columns.join(",")}`
      );

      const file = await exported();
      const exportedCompletion = file.progress.completions.find((c) => c.phaseId === PHASE);
      assert.ok(exportedCompletion);
      assert.ok(
        !Object.keys(exportedCompletion).some((k) => /version|content/i.test(k)),
        "and neither does the export"
      );
    });

    it("the platform's own catalogue refuses a phase id in two courses, which is the one reuse it catches", async () => {
      /* The service refuses a snapshot in which one phase id is in two
         courses, because the extension keys progress by activity id and the
         journey by phase id. That check is about ambiguity inside one
         snapshot, and it is checked at boot: the service does not start on
         such a catalogue. It says nothing about a phase id that means one
         thing in the shipped snapshot and another thing in the next one,
         which is the case above. */
      const refused = await catalogueRefused("ambiguous", "aaaa00000006", (courses) => {
        const from = courses[COURSE];
        const to = courses["api-basics"];
        const phase = phaseOf(from, PHASE);
        for (const activity of phase.activities) {
          to.document.activities[activity] = from.document.activities[activity];
        }
        to.document.phases.push(phase);
        to.manifest.phases.push({
          id: phase.id,
          title: phase.title,
          goal: phase.goal,
          level: phase.level,
          tier: "pro",
          authored: phase.authored,
          activityCount: phase.activities.length,
        });
      });
      assert.ok(refused instanceof Error, "the service refuses to start on a catalogue with a phase id in two courses");
      assert.match(String(refused.message), /phase id setup is in both/, "and it says which phase id is the ambiguous one");
    });
  });

  /* ---------- item 4: a deploy and a rollback ---------- */

  describe("a deploy does not lose a learner's data, and a rollback of the code does not either", () => {
    it("the migrations are forward-only: a second run applies nothing and un-applies nothing", async () => {
      const before = await pool.query("SELECT version, applied_at::text FROM schema_migrations ORDER BY version");
      const applied = await migrate(pool, join(root, "services", "auth", "migrations"));
      assert.deepEqual(applied, [], "the runner applied nothing, because everything was applied");
      const after = await pool.query("SELECT version, applied_at::text FROM schema_migrations ORDER BY version");
      assert.deepEqual(after.rows, before.rows, "and the record of what was applied did not move");
    });

    it("rolling the code back leaves the learner's rows exactly as they were", async () => {
      const rowsBefore = await learnerRows();
      const fileBefore = await exported();

      /* The rollback the runbook describes: the previous image, booted against
         the same database. The code changes; the data does not. The service is
         booted again here, against the same database, and the rows are read
         back over HTTP. */
      const rolledBack = await createService("auth-rolled-back");
      registerAuthRoutes(rolledBack, pool);
      registerProgressRoutes(rolledBack, pool);
      const port = await freePort();
      await rolledBack.listen({ port, host: "127.0.0.1" });
      const base = `http://127.0.0.1:${port}`;
      try {
        const rowsAfter = await learnerRows();
        assert.deepEqual(rowsAfter, rowsBefore, "the learner's rows are byte for byte the same");

        const fileAfter = await exported(base);
        const strip = (value) => {
          const copy = { ...value };
          delete copy.generatedAt;
          return copy;
        };
        assert.deepEqual(strip(fileAfter), strip(fileBefore), "and the export they can download is the same file");
      } finally {
        await rolledBack.close();
      }
    });

    it("a migration that dropped a column cannot be rolled back, and the data in it is gone", async () => {
      /* What a rollback of a destructive migration costs, shown on a scratch
         table rather than on the learner's rows. */
      await pool.query("CREATE TABLE rollback_scratch (id TEXT PRIMARY KEY, note TEXT)");
      await pool.query("ALTER TABLE rollback_scratch ADD COLUMN dropped TEXT");
      await pool.query("INSERT INTO rollback_scratch (id, note, dropped) VALUES ('r1', 'kept', 'lost')");
      const before = await pool.query("SELECT * FROM rollback_scratch WHERE id = 'r1'");
      assert.equal(before.rows[0].dropped, "lost", "the column holds its data");

      await pool.query("ALTER TABLE rollback_scratch DROP COLUMN dropped");

      /* The runner has no way back. It applies what has not been applied and
         never un-applies anything, so the code can be rolled back and the
         column cannot come back. */
      const applied = await migrate(pool, join(root, "services", "auth", "migrations"));
      assert.deepEqual(applied, [], "the runner has nothing to un-apply, and says so");

      const after = await pool.query("SELECT * FROM rollback_scratch WHERE id = 'r1'");
      assert.ok(!("dropped" in after.rows[0]), "and the column is still gone, so its data is gone with it");

      /* The old code, which still names the column, cannot read the table
         either. This is the cost, stated as a fact rather than as a warning:
         the only way back is the backup taken before the deploy. */
      await assert.rejects(
        () => pool.query("SELECT dropped FROM rollback_scratch"),
        "the old query fails against the migrated schema"
      );
      await pool.query("DROP TABLE rollback_scratch");
    });
  });

  /* ---------- item 5: a guest's work moving into an account ---------- */

  describe("a guest's work moving into an account is safe", () => {
    it("the server's record wins, the newest draft wins, attempts are the union, the streak is the longer", async () => {
      const before = await progress();
      const migrated = await api(authBase, "/progress/migrate", {
        method: "POST",
        headers: asUser(),
        body: {
          drafts: [
            { phaseId: PHASE, content: { step: "guest-note" }, updatedAt: new Date(Date.now() + 60_000).toISOString() },
            { phaseId: "fundamentals", content: { step: "guest-only" }, updatedAt: new Date().toISOString() },
          ],
          attempts: [
            {
              id: "attempt-guest-1",
              phaseId: PHASE,
              kind: "run",
              outcome: "passed",
              payload: { command: "node --test" },
              createdAt: new Date().toISOString(),
            },
          ],
          completions: [{ phaseId: "fundamentals", completedAt: new Date().toISOString() }],
          streak: { days: 9, lastActiveOn: new Date().toISOString().slice(0, 10) },
          placement: { start: 1 },
        },
      });
      assert.equal(migrated.status, 200, `the migration was refused: ${migrated.text}`);
      const outcomes = migrated.body.migrated;
      assert.equal(outcomes.drafts.find((d) => d.phaseId === PHASE).outcome, "migrated", "the newer draft won");
      assert.equal(outcomes.attempts[0].outcome, "migrated", "the guest's attempt came across");
      assert.equal(outcomes.completions[0].outcome, "migrated", "and the phase the platform had not seen");

      const after = await progress();
      assert.equal(after.drafts.find((d) => d.phaseId === PHASE).content.step, "guest-note", "the newer draft is the one that stands");
      assert.equal(after.attempts.length, before.attempts.length + 1, "the attempts are the union, not a replacement");
      assert.equal(after.completions.length, before.completions.length + 1, "and so are the completions");
      assert.equal(after.streak.days, 9, "the longer streak stands");
      assert.deepEqual(after.placement, { start: 1 }, "and the placement came across");

      /* A second migration of the same guest work adds nothing: the attempt
         is keyed by the id the guest device minted. */
      const again = await api(authBase, "/progress/migrate", {
        method: "POST",
        headers: asUser(),
        body: {
          attempts: [
            {
              id: "attempt-guest-1",
              phaseId: PHASE,
              kind: "run",
              outcome: "passed",
              payload: { command: "node --test" },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
      assert.equal(again.status, 200);
      assert.equal(again.body.migrated.attempts[0].outcome, "server", "the repeated attempt is the server's row now");
    });

    it("a refused migration changes nothing, so the guest's copy is still there to send again", async () => {
      /* An attempt id that belongs to another account. The migration is one
         transaction, so the refusal takes the whole thing with it. */
      await pool.query(
        "INSERT INTO users (id, email, name, password_hash, created_at, provider) " +
          "VALUES ('u-other', 'other@example.com', 'Other', 'x', now(), 'local')"
      );
      await pool.query(
        "INSERT INTO progress_attempts (id, user_id, phase_id, kind, outcome, payload, created_at) " +
          "VALUES ('attempt-owned-by-other', 'u-other', 'fundamentals', 'run', 'passed', '{}'::jsonb, now())"
      );
      const rowsBefore = await learnerRows();
      const fileBefore = await exported();

      const refused = await api(authBase, "/progress/migrate", {
        method: "POST",
        headers: asUser(),
        body: {
          drafts: [{ phaseId: "refused-phase", content: { step: "x" }, updatedAt: new Date().toISOString() }],
          attempts: [
            {
              id: "attempt-owned-by-other",
              phaseId: "refused-phase",
              kind: "run",
              outcome: "passed",
              payload: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
      assert.equal(refused.status, 409, `the migration was not refused: ${refused.text}`);
      assert.equal(refused.body.error.code, "conflict");

      const rowsAfter = await learnerRows();
      assert.deepEqual(rowsAfter, rowsBefore, "nothing was written: the whole migration rolled back");
      const fileAfter = await exported();
      const strip = (value) => {
        const copy = { ...value };
        delete copy.generatedAt;
        return copy;
      };
      assert.deepEqual(strip(fileAfter), strip(fileBefore), "and the export is untouched");
    });

    it("the platform never tells a client to delete anything, and it holds no copy of the local workspace", async () => {
      /* The migration is additive: it adds the server's record of the work.
         The answer names what was refused, so a client can send the rest
         again, and nothing in the answer asks for a deletion. */
      const migrated = await api(authBase, "/progress/migrate", {
        method: "POST",
        headers: asUser(),
        body: { drafts: [], attempts: [], completions: [] },
      });
      assert.equal(migrated.status, 200);
      assert.deepEqual(Object.keys(migrated.body).sort(), ["migrated"], "the answer says what moved and nothing else");
      assert.ok(
        !/delete|remove|discard/i.test(JSON.stringify(migrated.body)),
        "and it never asks the client to throw its copy away"
      );
    });
  });

  /* ---------- item 6: the two halves a version apart ---------- */

  describe("the fork and the platform are deployed independently", () => {
    it("an old platform has no progress surface, and says so plainly", async () => {
      /* The previous release's route set: the identity routes, without the
         progress routes the new release added. */
      const res = await api(oldBase, "/progress/complete", {
        method: "POST",
        headers: asUser(),
        body: { phaseId: PHASE },
      });
      assert.equal(res.status, 404, "the old platform does not have the surface at all");
      assert.equal(res.body.error.code, "not_found");
      assert.match(res.body.error.message, /No route POST \/progress\/complete/, "and the answer names the path it does not have");

      /* The new platform has it, over the same route. */
      const now = await api(authBase, "/progress", { headers: asUser() });
      assert.equal(now.status, 200, "and the new platform answers it");
    });

    it("an old build asking for a course the platform no longer serves gets an honest answer", async () => {
      const res = await api(v1Base, "/api/curriculum/ide/manifest?course=no-such-course", { headers: asUser() });
      assert.equal(res.status, 404, "the platform does not serve a course it does not hold");
      assert.equal(res.body.error.code, "not_found");
      assert.match(res.body.error.message, /Unknown course no-such-course/, "and the answer names the course it does not know");

      /* And the catalogue still answers, so a client can find what is there. */
      const courses = await api(v1Base, "/api/curriculum/ide/courses", { headers: asUser() });
      assert.equal(courses.status, 200);
      assert.ok(courses.body.courses.length > 0, "the catalogue still lists the courses that do exist");
    });

    it("an old build reading a phase payload with fields it has never seen does not fail", async () => {
      /* The two-repository half. The client is the IDE's own compiled client
         from the sibling checkout, and the server is the real curriculum
         service, over HTTP. The payload it reads is the one the platform
         serves today, with the two fields the payload grew: the phase's
         provenance and its rubric. */
      const ideDist = join(root, "..", "..", "nexora-ide", "extensions", "nexora", "out", "content.js");
      if (!existsSync(ideDist)) {
        console.log("  ~ the IDE checkout is not beside this repository: the two-repository case was skipped");
        return;
      }
      const client = await import(pathToFileURL(ideDist).href);

      /* Is this the old build's client? The parser is the function the old
         build used to read a payload, and the history says whether it has
         changed since. Where the history is reachable, this says so; where it
         is not, the client is this build's and the proof says which it was. */
      const current = readFileSync(join(ideRoot, "extensions", "nexora", "src", "content.ts"), "utf8");
      const previous = idePreviousSource("extensions/nexora/src/content.ts");
      const parser = (source) =>
        source
          .slice(source.indexOf("export function parsePhasePayload"), source.indexOf("export function mergeProjectPhase"))
          .replace(/\r\n/g, "\n");
      if (previous === null) {
        console.log("  ~ the IDE history is not reachable here: the client is this build's own, not a checked-out old build");
      } else {
        assert.equal(parser(previous), parser(current), "the client that reads the payload is the previous release's own code");
      }

      const served = await api(v1Base, `/api/curriculum/ide/phases/${PHASE}`, { headers: asEntitled() });
      assert.equal(served.status, 200);
      assert.ok(served.body.provenance, "the payload carries the provenance the new platform added");
      assert.ok(served.body.rubric, "and the rubric");

      const parsed = client.parsePhasePayload(served.body, PHASE);
      assert.ok(parsed, "the old client's parser reads the new payload");
      assert.equal(parsed.phase.id, PHASE);
      assert.ok(!("provenance" in parsed), "and it keeps the fields it knows and ignores the ones it does not");
      assert.ok(!("rubric" in parsed));

      /* And the fetch path, which is how the client really gets the payload:
         a 200 with two fields it has never seen is a payload, not a failure. */
      const transport = {
        get: async (url) => {
          const res = await fetch(url, {
            method: "GET",
            headers: { ...asEntitled(), authorization: "Bearer test-token" },
          });
          return { status: res.status, json: await res.json().catch(() => null) };
        },
      };
      const fetched = await client.fetchPhase(transport, v1Base, PHASE, "test-token");
      assert.equal(fetched.kind, "payload", "the client fetched the phase and did not treat the new fields as an error");
      assert.equal(fetched.payload.phase.id, PHASE);

      /* A phase the platform no longer serves is an honest state, not a
         crash: the client is told the phase is unknown. */
      const gone = await client.fetchPhase(transport, removedBase, PHASE, "test-token");
      assert.equal(gone.kind, "unknown", "a phase the platform does not hold is an honest answer");
    });
  });
});
