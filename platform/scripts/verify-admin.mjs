/* The operator's console, on the platform side.
 *
 * The proof runs against a real database: a PGlite instance (Postgres
 * compiled to WebAssembly) behind a socket server, with the service's own
 * migrations applied in order. A fake pool would prove that the queries are
 * shaped like strings, which is not what has to be true here.
 *
 * The suite is in its own file because it needs a database and the rest of
 * the platform's suite does not. It runs as `npm run verify:admin`. */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { createService } from "@nexora/service-kit";
import { registerAdminRoutes } from "../services/auth/dist/admin.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PORT = 55499;

/* The service chassis refuses to boot without a mesh key, because without one
   every internal route would trust a bare x-user-id header from any caller.
   The test is not a mesh, but it runs the real service, so it gives the
   service a real key rather than switching the check off. */
process.env.INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ?? "test-mesh-key-0123456789abcdef0123456789";

/* The refresh tokens the test holds, in the form the service stores them: a
   hash, never the token. */
const OP_TOKEN = "operator-refresh-token";
const LEARNER_TOKEN = "learner-refresh-token";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
  /* The verified ledger. The console reads it from the identity service, and
     in some builds the ledger lives in a service of its own, so the test owns
     the table rather than inheriting whatever the migrations happen to say
     today. That way both shapes are covered: the ledger here, and the ledger
     somewhere else. */
  await pool.query(
    "CREATE TABLE IF NOT EXISTS proofs (" +
      "user_id TEXT NOT NULL, competency_id TEXT NOT NULL, level TEXT NOT NULL, " +
      "receipt JSONB NOT NULL DEFAULT '{}'::jsonb, payload_sha256 TEXT NOT NULL DEFAULT '', " +
      "issued_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  await pool.query(
    "INSERT INTO users (id, email, name, password_hash, created_at, provider, email_verified_at) " +
      "VALUES ('u-op', 'operator@example.com', 'The Operator', 'x', now(), 'local', now()), " +
      "('u-learner', 'learner@example.com', 'A Learner', 'x', now(), 'local', NULL)"
  );
  await pool.query(
    "INSERT INTO operators (user_id, role, granted_by) VALUES ('u-op', 'operator', 'tooling')"
  );
  await pool.query(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at) VALUES " +
      "('r-op', 'u-op', $1, now(), now() + interval '30 days'), " +
      "('r-learner', 'u-learner', $2, now(), now() + interval '30 days')",
    [sha256(OP_TOKEN), sha256(LEARNER_TOKEN)]
  );
  await pool.query(
    "INSERT INTO consents (user_id, document, version, purpose, basis) VALUES " +
      "('u-learner', 'terms', '2026-10-16', 'Delivering the service', 'contract')"
  );
  await pool.query(
    "INSERT INTO rights_requests (id, user_id, subject_ref, kind, detail, due_at) VALUES " +
      "('q-1', 'u-learner', 'ref-1', 'access', 'A copy of my data', now() + interval '30 days')"
  );
  await pool.query(
    "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES " +
      "('u-learner', 'javascript-basics', 'practiced', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, 'sha-1', now())"
  );
}

/* The chassis authenticates the caller before the route runs, so a test
   request carries the mesh key, the way the gateway does when it forwards.
   The identity still comes from the header the gateway injected, never from
   the body. */
const asUser = (id) => ({ "x-user-id": id, "x-internal-key": process.env.INTERNAL_API_KEY });
const asCaller = () => ({ "x-internal-key": process.env.INTERNAL_API_KEY });

describe("the operator's console (real database)", () => {
  before(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 8 });
    await server.start();
    pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`, max: 2 });
    await migrate();
    await seed();
    app = await createService("test-auth-admin");
    registerAdminRoutes(app, pool);
    await app.ready();
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    await server?.stop();
    await db?.close();
  });

  it("a caller with no session is refused before the flag is even read", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/overview", headers: asCaller() });
    assert.equal(res.statusCode, 401);
  });

  it("a signed-in learner without the flag is refused, and told why", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/overview", headers: asUser("u-learner") });
    assert.equal(res.statusCode, 403);
    const body = res.json();
    assert.equal(body.error.code, "not_an_operator");
    assert.match(body.error.message, /not an operator/i);
  });

  it("the check route reads the session without spending it", async () => {
    // A token the service never issued is refused.
    const bogus = await app.inject({
      method: "POST",
      url: "/admin/check",
      headers: asCaller(),
      payload: { refreshToken: "not-a-real-token" },
    });
    assert.equal(bogus.statusCode, 401);

    // An operator's live session answers, and says so.
    const op = await app.inject({
      method: "POST",
      url: "/admin/check",
      headers: asCaller(),
      payload: { refreshToken: OP_TOKEN },
    });
    assert.equal(op.statusCode, 200);
    assert.equal(op.json().operator, true);
    assert.equal(op.json().email, "operator@example.com");

    // A learner's live session answers too, and says no.
    const learner = await app.inject({
      method: "POST",
      url: "/admin/check",
      headers: asCaller(),
      payload: { refreshToken: LEARNER_TOKEN },
    });
    assert.equal(learner.statusCode, 200);
    assert.equal(learner.json().operator, false);

    // And the check did not spend the token: it is still a live session.
    const { rows } = await pool.query("SELECT revoked_at FROM refresh_tokens WHERE id = 'r-op'");
    assert.equal(rows[0].revoked_at, null, "a check must not rotate the session it reads");
  });

  it("the operator's overview counts what is there", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/overview", headers: asUser("u-op") });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.counts.accounts, 2);
    assert.equal(body.counts.operators, 1);
    assert.equal(body.counts.openRightsRequests, 1);
    assert.equal(body.operator.email, "operator@example.com");
    // The configuration is a set of flags, never a key.
    assert.equal(typeof body.configuration.mailConfigured, "boolean");
    assert.equal(typeof body.configuration.meshKeyPresent, "boolean");
    assert.equal(JSON.stringify(body).includes(process.env.INTERNAL_API_KEY ?? "@@none@@"), false);
  });

  it("the account search finds the account and counts its sessions and proofs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/accounts?q=learner",
      headers: asUser("u-op"),
    });
    assert.equal(res.statusCode, 200);
    const accounts = res.json().accounts;
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].email, "learner@example.com");
    assert.equal(accounts[0].sessions, 1);
    assert.equal(accounts[0].requests, 1);
    assert.equal(accounts[0].emailVerified, false);
  });

  it("one account shows its sessions, its consents and its requests", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/accounts/u-learner", headers: asUser("u-op") });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.account.email, "learner@example.com");
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].active, true);
    assert.equal(body.consents[0].document, "terms");
    assert.equal(body.requests[0].kind, "access");
    // The console says where the verified ledger is, so an empty list is never
    // read as "this learner has done nothing".
    assert.equal(typeof body.proofsAvailable, "boolean");
    assert.ok(Array.isArray(body.proofs));
  });

  it("the console says where the verified ledger is, in both shapes", async () => {
    // The ledger is here: the account shows its work, and the console says so.
    const here = await app.inject({ method: "GET", url: "/admin/accounts/u-learner", headers: asUser("u-op") });
    assert.equal(here.statusCode, 200);
    assert.equal(here.json().proofsAvailable, true);

    // The ledger is elsewhere: the console still answers, and it says that it
    // cannot show that work rather than showing an empty list as if the
    // learner had done nothing.
    await pool.query("ALTER TABLE proofs RENAME TO proofs_moved");
    try {
      const elsewhere = await app.inject({
        method: "GET",
        url: "/admin/accounts/u-learner",
        headers: asUser("u-op"),
      });
      assert.equal(elsewhere.statusCode, 200, "a ledger in another service is not an error");
      assert.equal(elsewhere.json().proofsAvailable, false);
      assert.deepEqual(elsewhere.json().proofs, []);
      const overview = await app.inject({ method: "GET", url: "/admin/overview", headers: asUser("u-op") });
      assert.equal(overview.statusCode, 200);
      assert.equal(overview.json().configuration.proofsAvailable, false);
      assert.equal(overview.json().counts.proofs, 0, "and it does not count a ledger it cannot see");
    } finally {
      await pool.query("ALTER TABLE proofs_moved RENAME TO proofs");
    }
  });

  it("an account that does not exist is a 404, not an empty page", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/accounts/u-nobody", headers: asUser("u-op") });
    assert.equal(res.statusCode, 404);
  });

  it("ending every session ends them, writes the cut-off, and is logged", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/accounts/u-learner/sessions/revoke",
      headers: asUser("u-op"),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().sessions, 1);

    const { rows } = await pool.query("SELECT revoked_at FROM refresh_tokens WHERE id = 'r-learner'");
    assert.ok(rows[0].revoked_at, "the refresh token is revoked");
    const cut = await pool.query("SELECT revoked_before FROM user_revocations WHERE user_id = 'u-learner'");
    assert.equal(cut.rows.length, 1, "the account cut-off is written, so the access token dies with it");
    const log = await pool.query("SELECT operator_id, action FROM admin_actions WHERE action = 'sessions.revoked'");
    assert.equal(log.rows.length, 1);
    assert.equal(log.rows[0].operator_id, "u-op", "the log names the operator, and the operator is the caller");
  });

  it("granting the flag names the caller, never a body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/operators",
      headers: asUser("u-op"),
      payload: { email: "learner@example.com", operatorId: "u-somebody-else" },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().operator.email, "learner@example.com");
    const { rows } = await pool.query("SELECT granted_by FROM operators WHERE user_id = 'u-learner'");
    assert.equal(rows[0].granted_by, "u-op", "the giver is the caller, not what the body said");
  });

  it("an operator cannot take their own flag away", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/operators/revoke",
      headers: asUser("u-op"),
      payload: { email: "operator@example.com" },
    });
    assert.equal(res.statusCode, 400);
    const { rows } = await pool.query("SELECT 1 FROM operators WHERE user_id = 'u-op'");
    assert.equal(rows.length, 1, "the flag is still there");
  });

  it("the rights ledger lists the request that has a clock on it", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/rights", headers: asUser("u-op") });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].kind, "access");
    assert.ok(body.requests[0].dueAt, "a request with a due date shows the due date");
  });

  it("the operator's log is readable and names the operator", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/actions", headers: asUser("u-op") });
    assert.equal(res.statusCode, 200);
    const actions = res.json().actions;
    assert.ok(actions.length >= 2);
    assert.ok(actions.every((a) => typeof a.operatorId === "string"));
  });
});
