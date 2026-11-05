/* The three mesh bridges the IDE needs, proven over HTTP against a real
 * database.
 *
 *   1. The gateway verifies a real Kinde-shaped token against a real JWKS
 *      over HTTP, and refuses a token signed by another key, a token for
 *      another audience, and an expired token. It also proves the IDE's
 *      HS256 device token still reaches the local verifier in Kinde mode.
 *   2. Two accounts cannot see each other's work, and a guest's local work
 *      migrates into the account: server-wins completions, newest-draft-wins
 *      drafts, and a refused migration changes nothing.
 *   3. The Go job end to end: the same draft saved twice is one row, the Go
 *      program is compiled and run for real, and the same completion sent
 *      twice answers 409 already_completed with one row written.
 *
 * The harness is the one the cohort suite uses: a PGlite database (Postgres
 * compiled to WebAssembly) behind a socket server, the services' own
 * migrations, and the real services as real processes. Nothing here reaches
 * the local development database: the database is PGlite, held in memory,
 * created and dropped by this file.
 *
 * The services run from their own build output, the way the platform runs
 * them, and the requests are real HTTP requests to them. The Kinde proof
 * runs the gateway in Kinde mode against a JWKS served by a local HTTP
 * endpoint, which is the only way to exercise the key path the deployment
 * actually uses: the JWKS is fetched over the network, not pinned.
 *
 * It runs as `node --test scripts/verify-bridges.mjs`. */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import jwt from "jsonwebtoken";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* The Go toolchain is the teaching language, so its runner is exercised for
   real when the toolchain is there. An absent toolchain skips with a reason
   rather than passing quietly. */
const GO_AVAILABLE = spawnSync("go", ["version"], { encoding: "utf8" }).status === 0;
const GO_SKIP = GO_AVAILABLE ? false : "go toolchain not on PATH";

/* A port the operating system picks, so the suite never collides with a
   running stack or with itself. */
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

const MESH_KEY = randomBytes(32).toString("hex");
const JWT_SECRET = randomBytes(32).toString("hex");
/* The API audience the deployment is configured with. A token for another
   audience is not this platform's token. */
const AUDIENCE = "https://api.nexora.dev";
const OTHER_AUDIENCE = "https://elsewhere.example";
/* The front door's origin, used for CORS. */
const PARTY = "https://app.nexora.dev";

let db;
let socketServer;
let pool;
let authProc;
let execProc;
let gwLocal;
let gwKinde;
let jwksServer;
let jwksHits = [];
let authPort;
let execPort;
let gwLocalPort;
let gwKindePort;
let jwksPort;

/* ---------- the signing key and the JWKS ---------- */

/* The key the tokens are signed with, and the key the JWKS publishes. The
   second pair signs the rejected token: same kid, different key, so the key
   resolves and the signature does not match. */
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const KID = "ins_nexora_test";

/* The JWK the way a JWKS publishes it: the public modulus and exponent,
   base64url, under the key id the token names. */
function jwkFor(publicKeyPem) {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" });
  return { kid: KID, kty: "RSA", alg: "RS256", use: "sig", n: jwk.n, e: jwk.e };
}

/* A Kinde-shaped access token: the claims Kinde sets (iss the business, aud
   the registered API, sub the user, jti, exp and iat), signed RS256 under the
   key id the JWKS publishes. */
function kindeToken(overrides = {}, signer = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `http://127.0.0.1:${jwksPort}`,
    aud: AUDIENCE,
    sub: "kp_nexora_a",
    jti: "jti_nexora_a",
    nbf: now - 60,
    iat: now - 60,
    exp: now + 300,
    ...overrides,
  };
  return jwt.sign(payload, signer, { algorithm: "RS256", keyid: KID, header: { typ: "JWT" } });
}

/* A local-mode access token for the seeded accounts. No jti, so the edge has
   no credential id to ask the identity service about and the proof is about
   the work, not about revocation. */
function localToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });
}

/* ---------- process helpers ---------- */

function startNode(name, script, env) {
  const child = spawn(process.execPath, [join(root, script)], {
    cwd: root,
    env: { ...process.env, LOG_LEVEL: "warn", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout?.on("data", (c) => {
    out += String(c);
  });
  child.stderr?.on("data", (c) => {
    out += String(c);
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) out += `\n[${name} exited with ${code}]`;
  });
  return { name, child, output: () => out };
}

async function waitForHttp(url, proc, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`${label} did not start: ${proc.output()}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${label} did not answer on ${url} in time: ${proc.output()}`);
}

/* One call to the edge, the way the IDE makes it. */
async function api(base, path, { method = "GET", token, body } = {}) {
  const headers = body === undefined ? {} : { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // A body that is not JSON is reported as the status alone.
  }
  return { status: res.status, json, headers: res.headers };
}

/* ---------- the suite ---------- */

describe("the mesh bridges the IDE needs (real database, real HTTP)", () => {
  before(async () => {
    /* The database: PGlite behind the Postgres wire protocol. The identity
       service applies its own migrations at boot, so the tables under test
       are the ones the service creates in a deployment. */
    const dbPort = await freePort();
    db = await PGlite.create();
    socketServer = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1", maxConnections: 16 });
    await socketServer.start();
    const databaseUrl = `postgres://nexora:nexora@127.0.0.1:${dbPort}/postgres`;
    pool = new Pool({ connectionString: databaseUrl, max: 4 });

    /* The JWKS the gateway fetches the signing key from, over HTTP. It
       records what it was asked, so the proof can show the key really came
       over the network rather than from a pinned PEM. The path is Kinde's own:
       /.well-known/jwks.json. */
    jwksPort = await freePort();
    jwksServer = createHttpServer((req, res) => {
      jwksHits.push({ url: req.url, authorization: req.headers.authorization ?? null });
      if (req.url !== "/.well-known/jwks.json") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwkFor(publicKey)] }));
    });
    await new Promise((resolve) => jwksServer.listen(jwksPort, "127.0.0.1", resolve));

    /* The identity service: the account, the evidence ledger and the
       learner's own work. */
    authPort = await freePort();
    authProc = startNode("auth", "services/auth/dist/index.js", {
      PORT: String(authPort),
      DATABASE_URL: databaseUrl,
      INTERNAL_API_KEY: MESH_KEY,
    });
    await waitForHttp(`http://127.0.0.1:${authPort}/health/ready`, authProc, "the identity service");

    /* The execution service: the runner that compiles and runs the Go
       program for real. */
    execPort = await freePort();
    execProc = startNode("execution", "services/execution/dist/index.js", {
      PORT: String(execPort),
      INTERNAL_API_KEY: MESH_KEY,
      EXECUTION_RUNNER: "subprocess",
      EXECUTION_DAILY_QUOTA: "200",
    });
    await waitForHttp(`http://127.0.0.1:${execPort}/health/ready`, execProc, "the execution service");

    /* Two edges: one in local mode for the work proofs, one in Kinde mode
       for the token proof. The Kinde one is pointed at the local issuer. */
    gwLocalPort = await freePort();
    gwLocal = startNode("gateway(local)", "services/gateway/dist/index.js", {
      GATEWAY_PORT: String(gwLocalPort),
      AUTH_MODE: "local",
      AUTH_JWT_SECRET: JWT_SECRET,
      INTERNAL_API_KEY: MESH_KEY,
      AUTH_URL: `http://127.0.0.1:${authPort}`,
      EXECUTION_URL: `http://127.0.0.1:${execPort}`,
      FRONTEND_URL: PARTY,
    });
    await waitForHttp(`http://127.0.0.1:${gwLocalPort}/health/live`, gwLocal, "the local gateway");

    gwKindePort = await freePort();
    gwKinde = startNode("gateway(kinde)", "services/gateway/dist/index.js", {
      GATEWAY_PORT: String(gwKindePort),
      AUTH_MODE: "kinde",
      AUTH_JWT_SECRET: JWT_SECRET,
      INTERNAL_API_KEY: MESH_KEY,
      KINDE_ISSUER_URL: `http://127.0.0.1:${jwksPort}`,
      KINDE_AUDIENCE: AUDIENCE,
      AUTH_URL: `http://127.0.0.1:${authPort}`,
      EXECUTION_URL: `http://127.0.0.1:${execPort}`,
      FRONTEND_URL: PARTY,
    });
    await waitForHttp(`http://127.0.0.1:${gwKindePort}/health/live`, gwKinde, "the Kinde gateway");

    /* The two accounts the isolation proof acts as. Seeded directly, the way
       the identity service holds them: the point of the proof is what the
       edge and the service do with an identity, not how an account was
       made. */
    for (const [id, email] of [
      ["u-a", "a@example.com"],
      ["u-b", "b@example.com"],
    ]) {
      await pool.query(
        "INSERT INTO users (id, email, name, password_hash, created_at, provider, email_verified_at) " +
          "VALUES ($1, $2, $3, 'x', now(), 'local', now()) " +
          "ON CONFLICT (id) DO NOTHING",
        [id, email, id.toUpperCase()]
      );
    }
  });

  after(async () => {
    for (const proc of [gwKinde, gwLocal, execProc, authProc]) {
      try {
        proc?.child.kill();
      } catch {
        // Already gone.
      }
    }
    jwksServer?.close();
    await pool?.end();
    await socketServer?.stop();
    await db?.close();
  });

  /* ---------- 1. the Kinde token, verified against a JWKS, over HTTP ---------- */

  describe("the gateway verifies a real Kinde token against a real JWKS", () => {
    const base = () => `http://127.0.0.1:${gwKindePort}`;

    it("the signing key is fetched over HTTP, not pinned into the gateway", async () => {
      // One request with a good token, so the fetch has happened: the key is
      // fetched the first time a token is verified, not at boot. The route
      // asked for is the learner's own work, which answers for an account
      // that does not exist yet and writes nothing.
      const token = kindeToken();
      const work = await api(base(), "/api/progress", { token });
      assert.equal(work.status, 200, "the token verified");
      assert.ok(
        jwksHits.length > 0,
        "the gateway fetched the JWKS over HTTP from the configured Kinde issuer"
      );
      const hit = jwksHits[0];
      assert.equal(hit.url, "/.well-known/jwks.json", "the key came from Kinde's published path");
      assert.equal(hit.authorization, null, "the public key set needs no bearer credential");
    });

    it("a token for this deployment signs the learner in, and the platform holds the account", async () => {
      const token = kindeToken();
      const link = await api(base(), "/api/auth/link", {
        method: "POST",
        token,
        body: { email: "kinde@example.com", name: "Kinde Learner" },
      });
      assert.equal(link.status, 201, "the gateway accepted the Kinde token");

      const { rows } = await pool.query(
        "SELECT id, email, provider FROM users WHERE id = $1",
        ["kp_nexora_a"]
      );
      assert.equal(rows.length, 1, "the Kinde subject is the platform's own user id");
      assert.equal(rows[0].email, "kinde@example.com");
      assert.equal(rows[0].provider, "kinde", "and the account says who manages it");

      const me = await api(base(), "/api/auth/me", { token });
      assert.equal(me.status, 200, "the same token reads the account back");
      assert.equal(me.json.user.id, "kp_nexora_a");
    });

    it("a token signed by another key is refused", async () => {
      // The same kid, so the key resolves from the JWKS, and a signature that
      // does not match it.
      const token = kindeToken({}, otherPrivateKey);
      const me = await api(base(), "/api/auth/me", { token });
      assert.equal(me.status, 401, "a token nobody signed is not a token");
      assert.equal(me.json.error.code, "unauthorized");

      const progress = await api(base(), "/api/progress", { token });
      assert.equal(progress.status, 401, "and it opens no authenticated route either");
    });

    it("a token for another audience is refused", async () => {
      const token = kindeToken({ aud: OTHER_AUDIENCE });
      const me = await api(base(), "/api/auth/me", { token });
      assert.equal(me.status, 401, "this platform's tokens name this platform's API");
      const progress = await api(base(), "/api/progress", { token });
      assert.equal(progress.status, 401);
    });

    it("an expired token is refused", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = kindeToken({ exp: now - 600, iat: now - 1200, nbf: now - 1200 });
      const me = await api(base(), "/api/auth/me", { token });
      assert.equal(me.status, 401, "a token past its expiry is not a token");
    });

    it("a token that names no subject is refused", async () => {
      const token = kindeToken({ sub: "" });
      const me = await api(base(), "/api/auth/me", { token });
      assert.equal(me.status, 401);
    });

    it("a platform device token approved by Kinde still opens the IDE's work", async () => {
      // The desktop IDE receives an HS256 token from the device-code handoff,
      // not a Kinde token. Kinde mode must keep that path open: the browser
      // that approved the code was already authenticated by Kinde.
      const res = await api(base(), "/api/progress", { token: localToken("u-a") });
      assert.equal(res.status, 200, "the HS256 device token is routed to the local verifier");
    });
  });

  /* ---------- 2. two accounts, and a guest's work moving ---------- */

  describe("two accounts never see each other's work", () => {
    const base = () => `http://127.0.0.1:${gwLocalPort}`;
    const a = () => localToken("u-a");
    const b = () => localToken("u-b");

    it("account A's drafts, attempts and completions are not account B's", async () => {
      const draft = await api(base(), "/api/progress/drafts/go-values", {
        method: "PUT",
        token: a(),
        body: { content: { file: "main.go", text: "package main" } },
      });
      assert.equal(draft.status, 200);

      const attempt = await api(base(), "/api/progress/attempts", {
        method: "POST",
        token: a(),
        body: { id: "attempt-a-1", phaseId: "go-values", kind: "run", outcome: "passed" },
      });
      assert.equal(attempt.status, 201);

      const done = await api(base(), "/api/progress/complete", {
        method: "POST",
        token: a(),
        body: { phaseId: "go-values" },
      });
      assert.equal(done.status, 201);

      const seenByA = await api(base(), "/api/progress", { token: a() });
      assert.equal(seenByA.status, 200);
      assert.equal(seenByA.json.drafts.length, 1);
      assert.equal(seenByA.json.attempts.length, 1);
      assert.equal(seenByA.json.completions.length, 1);

      const seenByB = await api(base(), "/api/progress", { token: b() });
      assert.equal(seenByB.status, 200);
      assert.deepEqual(seenByB.json.drafts, [], "B sees no draft of A's");
      assert.deepEqual(seenByB.json.attempts, [], "no attempt of A's");
      assert.deepEqual(seenByB.json.completions, [], "no completion of A's");
      assert.equal(seenByB.json.streak.days, 0, "and no streak of A's");
    });

    it("each account writes its own row, and the rows are keyed by the account", async () => {
      await api(base(), "/api/progress/drafts/go-values", {
        method: "PUT",
        token: b(),
        body: { content: { file: "main.go", text: "package main // B" } },
      });
      const { rows } = await pool.query(
        "SELECT user_id, content FROM progress_drafts WHERE phase_id = 'go-values' ORDER BY user_id"
      );
      assert.equal(rows.length, 2, "two accounts, two rows, one phase");
      assert.deepEqual(
        rows.map((r) => r.user_id),
        ["u-a", "u-b"]
      );
      assert.match(rows[1].content.text, /B/);
    });

    it("a request with no token opens nothing", async () => {
      const res = await api(base(), "/api/progress");
      assert.equal(res.status, 401, "the identity comes from a verified token");
    });

    it("a body that names another account does not move the work", async () => {
      const res = await api(base(), "/api/progress/complete", {
        method: "POST",
        token: b(),
        body: { phaseId: "go-control-flow", userId: "u-a" },
      });
      assert.equal(res.status, 201, "the completion is B's");
      const { rows } = await pool.query(
        "SELECT user_id FROM progress_completions WHERE phase_id = 'go-control-flow'"
      );
      assert.deepEqual(
        rows.map((r) => r.user_id),
        ["u-b"],
        "the body did not choose the account"
      );
    });
  });

  describe("a guest's local work migrates into the account", () => {
    const base = () => `http://127.0.0.1:${gwLocalPort}`;
    const a = () => localToken("u-a");
    const b = () => localToken("u-b");
    const today = new Date().toISOString().slice(0, 10);

    it("drafts, attempts, completions, streak and placement all land", async () => {
      const res = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: {
          drafts: [
            {
              phaseId: "go-functions",
              content: { file: "main.go", text: "package main // guest" },
              updatedAt: new Date().toISOString(),
            },
          ],
          attempts: [
            {
              id: "guest-attempt-1",
              phaseId: "go-functions",
              kind: "run",
              outcome: "passed",
              createdAt: new Date().toISOString(),
            },
          ],
          completions: [{ phaseId: "go-functions", completedAt: new Date().toISOString() }],
          streak: { days: 4, lastActiveOn: today },
          placement: { course: "go-fundamentals", phase: "go-values" },
        },
      });
      assert.equal(res.status, 200, "the migration landed");
      assert.equal(res.json.migrated.drafts[0].outcome, "migrated");
      assert.equal(res.json.migrated.attempts[0].outcome, "migrated");
      assert.equal(res.json.migrated.completions[0].outcome, "migrated");

      const seen = await api(base(), "/api/progress", { token: a() });
      assert.ok(
        seen.json.drafts.some((d) => d.phaseId === "go-functions"),
        "the guest's draft is in the account"
      );
      assert.ok(
        seen.json.attempts.some((x) => x.id === "guest-attempt-1"),
        "and the guest's attempt"
      );
      assert.ok(
        seen.json.completions.some((c) => c.phaseId === "go-functions"),
        "and the guest's completion"
      );
      assert.equal(seen.json.streak.days, 4, "and the guest's streak");
      assert.deepEqual(seen.json.placement, { course: "go-fundamentals", phase: "go-values" });

      const { rows } = await pool.query(
        "SELECT source FROM progress_completions WHERE user_id = 'u-a' AND phase_id = 'go-functions'"
      );
      assert.equal(rows[0].source, "guest", "the row says where it came from");
    });

    it("the server's completion wins over the guest's", async () => {
      const before = await pool.query(
        "SELECT completed_at, source FROM progress_completions " +
          "WHERE user_id = 'u-a' AND phase_id = 'go-values'"
      );
      assert.equal(before.rows.length, 1, "the account had already finished this phase");

      const res = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: {
          completions: [
            { phaseId: "go-values", completedAt: new Date(Date.now() + 60_000).toISOString() },
          ],
        },
      });
      assert.equal(res.status, 200);
      assert.equal(
        res.json.migrated.completions[0].outcome,
        "server",
        "the account's own record of a finished phase stands"
      );

      const after = await pool.query(
        "SELECT completed_at, source FROM progress_completions " +
          "WHERE user_id = 'u-a' AND phase_id = 'go-values'"
      );
      assert.equal(
        new Date(after.rows[0].completed_at).toISOString(),
        new Date(before.rows[0].completed_at).toISOString(),
        "the stored completion is the one the platform wrote"
      );
      assert.equal(after.rows[0].source, "server");
    });

    it("the newest draft wins", async () => {
      const now = Date.now();
      // The account's draft is the newer one: the guest's older copy stands
      // down.
      await api(base(), "/api/progress/drafts/go-newest", {
        method: "PUT",
        token: a(),
        body: {
          content: { text: "server" },
          updatedAt: new Date(now - 1000).toISOString(),
        },
      });
      const stale = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: {
          drafts: [
            {
              phaseId: "go-newest",
              content: { text: "guest older" },
              updatedAt: new Date(now - 60_000).toISOString(),
            },
          ],
        },
      });
      assert.equal(stale.json.migrated.drafts[0].outcome, "server", "the newer draft stands");

      // The guest's copy is the newer one: it takes the phase.
      const fresh = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: {
          drafts: [
            {
              phaseId: "go-newest",
              content: { text: "guest newer" },
              updatedAt: new Date(now + 1000).toISOString(),
            },
          ],
        },
      });
      assert.equal(fresh.json.migrated.drafts[0].outcome, "migrated");
      const { rows } = await pool.query(
        "SELECT content FROM progress_drafts WHERE user_id = 'u-a' AND phase_id = 'go-newest'"
      );
      assert.equal(rows[0].content.text, "guest newer", "the newest draft is the one that stands");
    });

    it("a refused migration changes nothing, and the work can be sent again", async () => {
      /* An attempt id that belongs to another account. The migration refuses
         it, and the refusal is the whole transaction: the draft that came
         with it is not written either. */
      await api(base(), "/api/progress/attempts", {
        method: "POST",
        token: b(),
        body: { id: "attempt-b-1", phaseId: "go-points", kind: "run", outcome: "passed" },
      });

      const before = await pool.query(
        "SELECT count(*)::int AS n FROM progress_drafts WHERE user_id = 'u-a'"
      );
      const refused = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: {
          drafts: [
            {
              phaseId: "go-refused",
              content: { text: "guest" },
              updatedAt: new Date().toISOString(),
            },
          ],
          attempts: [
            {
              id: "attempt-b-1",
              phaseId: "go-points",
              kind: "run",
              outcome: "passed",
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
      assert.equal(refused.status, 409, "the migration is refused");
      assert.equal(refused.json.error.code, "conflict");

      const after = await pool.query(
        "SELECT count(*)::int AS n FROM progress_drafts WHERE user_id = 'u-a'"
      );
      assert.equal(after.rows[0].n, before.rows[0].n, "and nothing was written");
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM progress_drafts WHERE user_id = 'u-a' AND phase_id = 'go-refused'"
      );
      assert.equal(rows[0].n, 0, "the draft that came with the refused migration is not there");

      /* The same guest work, without the item the platform refused, lands. The
         failed attempt consumed nothing. */
      const again = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: {
          drafts: [
            {
              phaseId: "go-refused",
              content: { text: "guest" },
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      });
      assert.equal(again.status, 200, "the work is still there to send");
      const landed = await pool.query(
        "SELECT count(*)::int AS n FROM progress_drafts WHERE user_id = 'u-a' AND phase_id = 'go-refused'"
      );
      assert.equal(landed.rows[0].n, 1, "and it lands when the platform can take it");
    });

    it("sending the same migration twice changes nothing the second time", async () => {
      const payload = {
        attempts: [
          {
            id: "guest-attempt-replay",
            phaseId: "go-replay",
            kind: "run",
            outcome: "passed",
            createdAt: new Date().toISOString(),
          },
        ],
        completions: [{ phaseId: "go-replay", completedAt: new Date().toISOString() }],
      };
      const first = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: payload,
      });
      assert.equal(first.json.migrated.attempts[0].outcome, "migrated");
      const second = await api(base(), "/api/progress/migrate", {
        method: "POST",
        token: a(),
        body: payload,
      });
      assert.equal(second.json.migrated.attempts[0].outcome, "server", "the attempt is already there");
      assert.equal(second.json.migrated.completions[0].outcome, "server", "and so is the completion");
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM progress_attempts WHERE user_id = 'u-a' AND id = 'guest-attempt-replay'"
      );
      assert.equal(rows[0].n, 1, "one attempt, not two");
    });
  });

  /* ---------- 3. the Go job, end to end ---------- */

  describe("the Go job end to end: draft, run, complete, twice", () => {
    const base = () => `http://127.0.0.1:${gwLocalPort}`;
    const a = () => localToken("u-a");

    const GO_PROGRAM = [
      "package main",
      "",
      'import "fmt"',
      "",
      "func main() {",
      '\tfmt.Println("hello from go")',
      "}",
      "",
    ].join("\n");

    it("the same draft saved twice is one row", async () => {
      const body = { content: { path: "main.go", text: GO_PROGRAM } };
      const first = await api(base(), "/api/progress/drafts/go-ledger", {
        method: "PUT",
        token: a(),
        body,
      });
      assert.equal(first.status, 200);
      const second = await api(base(), "/api/progress/drafts/go-ledger", {
        method: "PUT",
        token: a(),
        body,
      });
      assert.equal(second.status, 200, "the same draft is the same answer");
      assert.equal(second.json.applied, true);
      assert.deepEqual(second.json.draft.content, first.json.draft.content);

      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM progress_drafts WHERE user_id = 'u-a' AND phase_id = 'go-ledger'"
      );
      assert.equal(rows[0].n, 1, "one row, not two");
    });

    it("the Go program is compiled and run for real", { skip: GO_SKIP }, async () => {
      const run = await api(base(), "/api/execute/execute", {
        method: "POST",
        token: a(),
        body: { language: "go", files: [{ path: "main.go", content: GO_PROGRAM }] },
      });
      assert.equal(run.status, 200, "the execution service answered");
      assert.equal(run.json.exitCode, 0, `the program ran: ${run.json.stderr}`);
      assert.equal(run.json.stdout.trim(), "hello from go", "and printed what it was told to");
      assert.equal(run.json.timedOut, false);
      assert.equal(run.json.runner, "subprocess");
    });

    it("the same completion sent twice answers 409 already_completed, with one row", async () => {
      const first = await api(base(), "/api/progress/complete", {
        method: "POST",
        token: a(),
        body: { phaseId: "go-ledger" },
      });
      assert.equal(first.status, 201, "the phase is finished");

      const second = await api(base(), "/api/progress/complete", {
        method: "POST",
        token: a(),
        body: { phaseId: "go-ledger" },
      });
      assert.equal(second.status, 409, "the second answer is a refusal");
      assert.equal(second.json.error.code, "already_completed");

      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM progress_completions WHERE user_id = 'u-a' AND phase_id = 'go-ledger'"
      );
      assert.equal(rows[0].n, 1, "one completion row, not two");
    });
  });
});
