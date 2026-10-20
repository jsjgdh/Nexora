/* The platform's half of the four P1 items, proven over real HTTP.
   Run with: npx tsx scripts/verify-platform.mjs
   (needs the platform built: cd ../platform && npm run build)

   Everything here talks to the real services over a real socket, with a real
   Postgres (PGlite over the Postgres wire protocol) behind them. The services
   are the ones that ship: the auth service's admin and rights routes, and the
   billing service's routes.

   It proves three things.

   1. The operator's read log. A read of a learner's record writes a row that
      says who read it, which route was called, which account it was, when,
      and the request id it ran under. An operator can read the log back. A
      learner cannot read it at all. A forged identity header cannot write
      into it, because the mesh key is what authenticates the caller and the
      service never trusts a bare x-user-id.

   2. The billing states. An unconfigured provider is visible as such. A
      subscription is pending until the webhook grants it, and the grant is
      the webhook and not the redirect. A past-due subscription keeps access
      for a bounded grace period and loses it after.

   3. The evidence export. A learner with nothing gets a valid, empty, well
      formed file. The file's shape is explicit and stable across a change,
      and it is the shape the IDE's own reader expects. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const platform = join(here, "..", "..", "platform");
const ide = join(here, "..", "..", "..", "nexora-ide");

const require = createRequire(join(platform, "package.json"));
const { Pool } = require("pg");
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");

const load = async (...parts) => import(pathToFileURL(join(platform, ...parts)).href);
const { createService } = await load("packages", "service-kit", "dist", "index.js");
const { registerAdminRoutes } = await load("services", "auth", "dist", "admin.js");
const { registerRightsRoutes, ACCOUNT_EXPORT_KEYS } = await load(
  "services",
  "auth",
  "dist",
  "rights.js"
);
const { registerBillingRoutes } = await load("services", "billing", "dist", "routes.js");
const { loadPlans, signTestVector } = await load("services", "billing", "dist", "dodo.js");

let passed = 0;
function ok(name, cond, detail) {
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}

/* The mesh key. The chassis refuses to boot without one, and every request
   has to carry it, so the caller is authenticated by something a client
   cannot forge. */
const MESH_KEY = "test-mesh-key-0123456789abcdef0123456789";
process.env.INTERNAL_API_KEY = MESH_KEY;
/* No payment provider key: the unconfigured case is the one the front door
   has to be able to say out loud. The plans are configured, so the answer
   about the provider is the only thing standing between the learner and a
   checkout: that is the case the front door has to get right. */
delete process.env.DODO_PAYMENTS_API_KEY;
process.env.BILLING_PLANS_JSON = JSON.stringify({
  pro: { product_id: "prod_test_pro", name: "Pro" },
});
const WEBHOOK_SECRET = "whsec_testsecret_testsecret_testsecret";
process.env.DODO_PAYMENTS_WEBHOOK_SECRET = WEBHOOK_SECRET;

async function freePort() {
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
const AUTH_PORT = await freePort();
const BILLING_PORT = await freePort();

let db;
let server;
let pool;
let authApp;
let billingApp;

const asUser = (id, extra = {}) => ({
  "x-user-id": id,
  "x-internal-key": MESH_KEY,
  ...extra,
});

async function applyMigrations(service) {
  const dir = join(platform, "services", service, "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

async function seed() {
  await pool.query(
    "INSERT INTO users (id, email, name, password_hash, created_at, provider, email_verified_at) VALUES " +
      "('u-op', 'operator@example.com', 'The Operator', 'x', now(), 'local', now()), " +
      "('u-learner', 'learner@example.com', 'A Learner', 'x', now(), 'local', now()), " +
      "('u-empty', 'empty@example.com', 'An Empty Account', 'x', now(), 'local', now())"
  );
  await pool.query(
    "INSERT INTO operators (user_id, role, granted_by) VALUES ('u-op', 'super', 'tooling')"
  );
  await pool.query(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at) VALUES " +
      "('r-learner', 'u-learner', $1, now(), now() + interval '30 days')",
    [createHash("sha256").update("learner-token").digest("hex")]
  );
  /* Three proofs, one of each kind, so the export's kind column has to be
     honest about all three. The receipt bodies are what the ledger stores;
     only facts.kind is read by the export. */
  const proofs = [
    ["u-learner", "js-basics", "practiced", "run"],
    ["u-learner", "api-design", "demonstrated", "design"],
    ["u-learner", "go-incident", "demonstrated", "incident"],
  ];
  for (const [userId, competency, level, kind] of proofs) {
    await pool.query(
      "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) " +
        "VALUES ($1, $2, $3, $4::jsonb, $5, now())",
      [
        userId,
        competency,
        level,
        JSON.stringify({ v: 1, issuedAt: new Date().toISOString(), facts: { kind } }),
        createHash("sha256").update(`${userId}:${competency}`).digest("hex"),
      ]
    );
  }
}

try {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 8 });
  await server.start();
  pool = new Pool({
    connectionString: `postgres://nexora:nexora@127.0.0.1:${PORT}/postgres`,
    max: 4,
  });
  await applyMigrations("auth");
  await applyMigrations("billing");
  await seed();

  authApp = await createService("test-auth");
  registerRightsRoutes(authApp, pool);
  registerAdminRoutes(authApp, pool);
  await authApp.listen({ port: AUTH_PORT, host: "127.0.0.1" });

  billingApp = await createService("test-billing");
  registerBillingRoutes(billingApp, pool, loadPlans());
  await billingApp.listen({ port: BILLING_PORT, host: "127.0.0.1" });

  const auth = `http://127.0.0.1:${AUTH_PORT}`;
  const billing = `http://127.0.0.1:${BILLING_PORT}`;

  console.log("== the operator's read is written down, and only an operator can read it ==");
  {
    const requestId = "req-read-0000000000000001";
    const before = await pool.query(
      "SELECT count(*) AS n FROM admin_actions WHERE action = 'account.viewed'"
    );
    const res = await fetch(`${auth}/admin/accounts/u-learner`, {
      headers: asUser("u-op", { "x-request-id": requestId }),
    });
    assert.equal(res.status, 200, "the operator's read answers");
    const after = await pool.query(
      "SELECT operator_id, action, target, route, request_id, created_at FROM admin_actions " +
        "WHERE action = 'account.viewed' AND target = 'u-learner'"
    );
    assert.equal(
      after.rows.length,
      Number(before.rows[0].n) + 1,
      "the read left exactly one row"
    );
    const row = after.rows[0];
    ok("the row names the operator who read", row.operator_id === "u-op");
    ok("the row names the account that was read", row.target === "u-learner");
    ok("the row names the route that was called", row.route === "/admin/accounts/:id", String(row.route));
    ok("the row carries the request id", row.request_id === requestId, String(row.request_id));
    ok("the row carries the time", !Number.isNaN(Date.parse(row.created_at)));

    const log = await fetch(`${auth}/admin/actions?target=u-learner`, {
      headers: asUser("u-op"),
    });
    assert.equal(log.status, 200);
    const body = await log.json();
    const read = body.actions.find((a) => a.action === "account.viewed");
    ok(
      "and the operator can read it back: who, what, which route, which request id",
      read &&
        read.operatorId === "u-op" &&
        read.target === "u-learner" &&
        read.route === "/admin/accounts/:id" &&
        read.requestId === requestId,
      JSON.stringify(read)
    );

    const learner = await fetch(`${auth}/admin/actions`, { headers: asUser("u-learner") });
    assert.equal(learner.status, 403, "a learner cannot read the log");
    const learnerBody = await learner.json();
    ok(
      "and is told why, in the platform's own words",
      learnerBody.error.code === "not_an_operator",
      JSON.stringify(learnerBody)
    );

    const beforeForged = await pool.query("SELECT count(*) AS n FROM admin_actions");
    const forged = await fetch(`${auth}/admin/accounts/u-learner`, {
      headers: { "x-user-id": "u-op", "x-request-id": "forged-request-0000000001" },
    });
    assert.equal(forged.status, 403, "a forged identity header is refused at the door");
    const wrongKey = await fetch(`${auth}/admin/accounts/u-learner`, {
      headers: { "x-user-id": "u-op", "x-internal-key": "not-the-mesh-key" },
    });
    assert.equal(wrongKey.status, 403, "and so is a forged mesh key");
    const afterForged = await pool.query("SELECT count(*) AS n FROM admin_actions");
    ok(
      "and neither of them wrote a row into the log",
      Number(afterForged.rows[0].n) === Number(beforeForged.rows[0].n)
    );

    const search = await fetch(`${auth}/admin/accounts?q=learner`, { headers: asUser("u-op") });
    assert.equal(search.status, 200);
    const listed = await pool.query(
      "SELECT operator_id, route FROM admin_actions WHERE action = 'accounts.listed'"
    );
    ok(
      "a search over the accounts is written down too, with the route it used",
      listed.rows.length >= 1 && listed.rows[0].operator_id === "u-op" &&
        listed.rows[0].route === "/admin/accounts",
      JSON.stringify(listed.rows)
    );
  }

  console.log("\n== the billing states: unconfigured, pending, and past due ==");
  {
    const plans = await fetch(`${billing}/plans`, { headers: asUser("u-learner") });
    assert.equal(plans.status, 200);
    const planBody = await plans.json();
    ok(
      "the plans answer says the payment provider is not configured, so the front door can say so",
      planBody.paymentsConfigured === false,
      JSON.stringify(planBody)
    );

    const checkout = await fetch(`${billing}/checkout`, {
      method: "POST",
      headers: { ...asUser("u-learner"), "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro", email: "learner@example.com" }),
    });
    assert.equal(checkout.status, 503, "an unconfigured provider refuses the checkout");
    const checkoutBody = await checkout.json();
    ok(
      "and says why, in plain words",
      checkoutBody.error.code === "billing_not_configured",
      JSON.stringify(checkoutBody)
    );

    const pending = await fetch(`${billing}/subscription`, { headers: asUser("u-learner") });
    const pendingBody = await pending.json();
    ok(
      "before the webhook grants it, the subscription is pending and grants nothing",
      pendingBody.subscription.entitled === false &&
        pendingBody.subscription.status === null,
      JSON.stringify(pendingBody)
    );

    /* The webhook grants it, not the redirect. The event is signed the way the
       provider signs it, so this is the provider's own path and not a shortcut
       through the database. */
    const raw = JSON.stringify({
      type: "subscription.active",
      data: {
        id: "sub_test_1",
        metadata: { user_id: "u-learner", plan: "pro" },
        current_period_end: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const webhookId = "evt_test_00000001";
    const signature = signTestVector(WEBHOOK_SECRET, webhookId, timestamp, raw);
    const hook = await fetch(`${billing}/webhooks/dodo`, {
      method: "POST",
      headers: {
        ...asUser("u-learner"),
        "content-type": "application/json",
        "webhook-id": webhookId,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
      },
      body: raw,
    });
    assert.equal(hook.status, 200, `the webhook is accepted: ${JSON.stringify(await hook.clone().json())}`);
    const granted = await fetch(`${billing}/subscription`, { headers: asUser("u-learner") });
    const grantedBody = await granted.json();
    ok(
      "after the webhook grants it, the subscription is active and it entitles",
      grantedBody.subscription.status === "active" && grantedBody.subscription.entitled === true,
      JSON.stringify(grantedBody)
    );

    /* A failed renewal: past due, with a bounded grace period. */
    const periodEnd = new Date(Date.now() + 2 * 24 * 3600_000);
    await pool.query(
      "UPDATE billing_subscriptions SET status = 'past_due', current_period_end = $2 WHERE user_id = $1",
      ["u-learner", periodEnd]
    );
    const pastDue = await fetch(`${billing}/subscription`, { headers: asUser("u-learner") });
    const pastDueBody = await pastDue.json();
    ok(
      "a past-due subscription keeps access while the grace period runs",
      pastDueBody.subscription.status === "past_due" && pastDueBody.subscription.entitled === true,
      JSON.stringify(pastDueBody)
    );
    const graceUntil = new Date(pastDueBody.subscription.graceUntil).getTime();
    ok(
      "and the grace period is bounded and named: the period end plus seven days",
      pastDueBody.subscription.graceDays === 7 &&
        Math.abs(graceUntil - (periodEnd.getTime() + 7 * 24 * 3600_000)) < 1000,
      JSON.stringify(pastDueBody.subscription)
    );

    await pool.query(
      "UPDATE billing_subscriptions SET current_period_end = $2 WHERE user_id = $1",
      ["u-learner", new Date(Date.now() - 9 * 24 * 3600_000)]
    );
    const expired = await fetch(`${billing}/subscription`, { headers: asUser("u-learner") });
    const expiredBody = await expired.json();
    ok(
      "and after the grace period the access stops",
      expiredBody.subscription.entitled === false,
      JSON.stringify(expiredBody)
    );
  }

  console.log("\n== the evidence export: an empty file is still a file, and its shape is fixed ==");
  {
    const empty = await fetch(`${auth}/account/export`, { headers: asUser("u-empty") });
    assert.equal(empty.status, 200, "a learner with nothing gets an answer");
    const text = await empty.text();
    const body = JSON.parse(text);
    ok("the file is well formed JSON", typeof body === "object" && body !== null);
    ok(
      "and it names its format and version",
      body.format === "nexora-account-export" && body.version === 1
    );
    ok(
      "the top-level keys are exactly the shape, in the order the shape names",
      JSON.stringify(Object.keys(body)) === JSON.stringify([...ACCOUNT_EXPORT_KEYS]),
      Object.keys(body).join(",")
    );
    ok(
      "and the empty case is empty, not missing: no consents, no requests, no proofs",
      Array.isArray(body.consents) && body.consents.length === 0 &&
        Array.isArray(body.rightsRequests) && body.rightsRequests.length === 0 &&
        Array.isArray(body.proofs) && body.proofs.length === 0
    );
    ok(
      "the session counts are there, and they are zero",
      body.sessions.active === 0 && body.sessions.revoked === 0 && body.sessions.deviceCodes === 0
    );
    ok(
      "and the file says what it does not hold, so it cannot mislead",
      Array.isArray(body.notIncluded) && body.notIncluded.length >= 3
    );

    /* Byte-stability: the same learner, asked twice, gives the same bytes
       apart from the timestamp the file is stamped with. */
    const again = await fetch(`${auth}/account/export`, { headers: asUser("u-empty") });
    const againBody = await again.json();
    const strip = (value) => {
      const copy = { ...value };
      delete copy.generatedAt;
      return JSON.stringify(copy);
    };
    ok(
      "the same export twice is the same bytes apart from its timestamp",
      strip(body) === strip(againBody)
    );

    const withProofs = await fetch(`${auth}/account/export`, { headers: asUser("u-learner") });
    const proofsBody = await withProofs.json();
    const kinds = proofsBody.proofs.map((p) => p.kind).sort();
    ok(
      "a proof row carries exactly the four fields the IDE's reader reads",
      proofsBody.proofs.every((p) =>
        JSON.stringify(Object.keys(p)) ===
        JSON.stringify(["competencyId", "level", "kind", "issuedAt"])
      ),
      JSON.stringify(proofsBody.proofs[0])
    );
    ok(
      "and the kind is the kind of the receipt, so a debugging proof is not sold as a run",
      JSON.stringify(kinds) === JSON.stringify(["design", "incident", "run"]),
      kinds.join(",")
    );

    /* The IDE's own reader, read from the IDE. This is the shape the export
       has to match, and it is checked against the file rather than against a
       comment about it. */
    const readerPath = join(ide, "extensions", "nexora", "src", "sync.ts");
    assert.ok(existsSync(readerPath), `the IDE's reader is at ${readerPath}`);
    const reader = readFileSync(readerPath, "utf8");
    const readerFields = ["competencyId", "level", "kind", "issuedAt"];
    ok(
      "the IDE's reader asks for the four names the export carries",
      readerFields.every((field) => reader.includes(`q.${field}`)),
      readerFields.join(",")
    );
    ok(
      "and the kinds it accepts are the kinds the export writes",
      ["run", "design", "incident"].every((kind) => reader.includes(`'${kind}'`))
    );
    ok(
      "and every exported kind is one the reader accepts",
      proofsBody.proofs.every((p) => ["run", "design", "incident"].includes(p.kind))
    );
  }
} finally {
  await authApp?.close();
  await billingApp?.close();
  await pool?.end();
  await server?.stop();
  await db?.close();
}

console.log(`\n${passed} PLATFORM ASSERTIONS PASSED`);
