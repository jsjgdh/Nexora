/* LTI 1.3: a course launched from an LMS (LTI.md).
 *
 * The proof runs against a real database and over real HTTP, and the LMS is
 * played by a harness rather than stubbed inside the product: a local HTTP
 * server that generates an RSA key pair, publishes the JWKS the way an LMS
 * does, issues the authorization response, mints the id token, acts as the
 * token endpoint, and receives the grade. The product code is the code a real
 * LMS would exercise; the only thing that is fake is the other side of the
 * wire.
 *
 * The database is PGlite (Postgres compiled to WebAssembly) behind a socket
 * server, with the service's own migrations applied in order, because a
 * deployment, a seat and a binding are all things that have to be real rows
 * for the refusals to mean anything.
 *
 * What is proved here, one assertion per item of the contract:
 *
 *   1. the login initiation redirects to the course's authorization endpoint
 *      with a state and a nonce;
 *   2. a launch with a bad signature is refused;
 *   3. a launch with a replayed nonce is refused;
 *   4. a launch with the wrong audience, and an expired one, are refused;
 *   5. a launch without a registered deployment is refused;
 *   6. the same LMS user lands on the same platform account;
 *   7. a launch takes a seat, and a learner with no seat left is refused;
 *   8. a verified launch hands the browser a session;
 *   9. a score is posted to the course's grade service, with the right score
 *      and the right activity, and a replayed passback does not post it twice;
 *  10. a statement is issued and its signature verifies against the published
 *      key;
 *  11. the registration of a deployment is the mesh's and not a public route;
 *  12. the service mounts the LTI routes.
 *
 * The suite is in its own file because it needs a database and the rest of
 * the platform's suite does not. It runs as `node --test scripts/verify-lti.mjs`
 * from the platform directory.
 */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { generateKeyPairSync, createPublicKey, sign, verify as verifySignature } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import { createService } from "@nexora/service-kit";
import { registerLtiRoutes } from "../services/auth/dist/lti.js";
import { registerCohortRoutes } from "../services/auth/dist/cohorts.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

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

const DB_PORT = await freePort();
const AUTH_PORT = await freePort();
const LMS_PORT = await freePort();

const BASE = `http://127.0.0.1:${AUTH_PORT}`;
const LMS_BASE = `http://127.0.0.1:${LMS_PORT}`;

/* The mesh key, the JWT secret and the statement key are the deployment's
   real configuration. The suite gives the service real ones rather than
   switching the checks off: a suite that runs with verification off proves
   nothing about a deployment that runs with it on. */
const MESH_KEY = "test-mesh-key-0123456789abcdef0123456789";
const JWT_SECRET = "s".repeat(48);
const statementKeys = generateKeyPairSync("ed25519");
const STATEMENT_PRIVATE_PEM = statementKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const STATEMENT_PUBLIC_PEM = statementKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const toolKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const TOOL_PRIVATE_PEM = toolKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

process.env.INTERNAL_API_KEY = MESH_KEY;
process.env.AUTH_JWT_SECRET = JWT_SECRET;
process.env.LTI_BASE_URL = BASE;
process.env.LTI_COMPLETE_URL = `${BASE}/lti/complete`;
process.env.LTI_STATEMENT_ED25519_KEY = STATEMENT_PRIVATE_PEM;
process.env.LTI_TOOL_KEY = TOOL_PRIVATE_PEM;
process.env.LTI_TOOL_KEY_ID = "tool-1";
process.env.LOG_LEVEL = "warn";

/* The keys every request carries: the mesh key the chassis demands, and the
   identity the edge would have resolved from a bearer token. */
const asMesh = () => ({ "x-internal-key": MESH_KEY });
const asUser = (id) => ({ "x-internal-key": MESH_KEY, "x-user-id": id });

let db;
let server;
let pool;
let app;
let lms;

/* ---------- the fake LMS ---------- */

/**
 * An LMS, played over HTTP.
 *
 * It does what a real one does and nothing more: it publishes a key set, it
 * answers the authorization request with an auto-posting form that carries an
 * id token, it issues access tokens for the client credentials, and it
 * receives scores. Everything it receives is recorded, so the suite can
 * assert on what the platform actually sent rather than on what it meant to.
 */
function makeFakeLms() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "lms-key-1";
  const jwk = publicKey.export({ format: "jwk" });
  Object.assign(jwk, { kid, use: "sig", alg: "RS256" });

  const recorded = {
    authRequests: [],
    tokenRequests: [],
    scores: [],
    lastClaims: null,
    failNextScores: 0,
  };

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const mint = (claims, key = privateKey) => {
    const header = { alg: "RS256", typ: "JWT", kid };
    const signingInput = `${encode(header)}.${encode(claims)}`;
    const signature = sign("RSA-SHA256", Buffer.from(signingInput), key).toString("base64url");
    return `${signingInput}.${signature}`;
  };

  const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  };

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", LMS_BASE);
    if (url.pathname === "/jwks") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname === "/auth") {
      const query = Object.fromEntries(url.searchParams.entries());
      recorded.authRequests.push(query);
      const sub = query.login_hint ?? "lms-user-1";
      const user = recorded.users?.[sub] ?? { email: `${sub}@example.edu`, name: "LMS Learner" };
      const claims = {
        iss: recorded.issuer,
        aud: query.client_id,
        sub,
        nonce: query.nonce,
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        email: user.email,
        email_verified: true,
        name: user.name,
        "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest",
        "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
        "https://purl.imsglobal.org/spec/lti/claim/deployment_id": query.lti_deployment_id ?? recorded.deploymentId,
        "https://purl.imsglobal.org/spec/lti/claim/target_link_uri": query.target_link_uri ?? `${BASE}/lti/launch`,
        "https://purl.imsglobal.org/spec/lti/claim/roles": ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
        "https://purl.imsglobal.org/spec/lti/claim/context": {
          id: "context-1",
          label: "CS 202",
          type: ["http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering"],
        },
        "https://purl.imsglobal.org/spec/lti/claim/resource_link": { id: "phase-setup", title: "Project setup" },
        "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": {
          scope: [
            "https://purl.imsglobal.org/spec/lti-ags/scope/score",
            "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
          ],
          lineitem: `${LMS_BASE}/ags/scores`,
          lineitemurl: `${LMS_BASE}/ags/lineitem`,
        },
      };
      recorded.lastClaims = claims;
      const idToken = mint(claims);
      /* What a real LMS answers with: a page that posts the token to the
         tool. The suite reads the form out of the HTML, exactly as a browser
         would submit it. */
      const html =
        `<!doctype html><html><body onload="document.forms[0].submit()">` +
        `<form method="POST" action="${query.redirect_uri ?? `${BASE}/lti/launch`}">` +
        `<input type="hidden" name="id_token" value="${idToken}"/>` +
        `<input type="hidden" name="state" value="${query.state ?? ""}"/>` +
        `</form></body></html>`;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (url.pathname === "/token") {
      const body = await readBody(req);
      const fields = Object.fromEntries(new URLSearchParams(body).entries());
      let assertion = null;
      if (fields.client_assertion) {
        /* A course that wants a signed assertion checks it against the
           public half the platform publishes. The harness does the same, so
           the assertion is proved rather than assumed. */
        const jwksRes = await fetch(`${BASE}/lti/jwks`, { headers: { "x-internal-key": MESH_KEY } });
        const jwks = await jwksRes.json();
        const key = jwks.keys?.[0];
        try {
          const claims = jwt.verify(fields.client_assertion, createPublicKey({ key, format: "jwk" }), {
            algorithms: ["RS256"],
            audience: LMS_BASE,
          });
          assertion = { verified: true, iss: claims.iss, aud: claims.aud, kid: key.kid };
        } catch (err) {
          assertion = { verified: false, error: String(err?.message ?? err) };
        }
      }
      recorded.tokenRequests.push({
        ...fields,
        client_assertion: fields.client_assertion ? "(a signed assertion)" : undefined,
        assertion,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: "lms-access-token-1",
          token_type: "Bearer",
          expires_in: 3600,
          scope: fields.scope ?? "https://purl.imsglobal.org/spec/lti-ags/scope/score",
        })
      );
      return;
    }
    if (url.pathname === "/ags/scores") {
      const body = await readBody(req);
      recorded.scores.push({
        url: req.url,
        authorization: req.headers.authorization ?? "",
        contentType: req.headers["content-type"] ?? "",
        body: body ? JSON.parse(body) : null,
      });
      if (recorded.failNextScores > 0) {
        recorded.failNextScores -= 1;
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "the grade service is busy" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  return {
    recorded,
    mint,
    attackerKey: attacker.privateKey,
    setUser(sub, user) {
      recorded.users = recorded.users ?? {};
      recorded.users[sub] = user;
    },
    setIssuer(issuer) {
      recorded.issuer = issuer;
    },
    setDeploymentId(deploymentId) {
      recorded.deploymentId = deploymentId;
    },
    async start() {
      await new Promise((resolve) => server.listen(LMS_PORT, "127.0.0.1", resolve));
    },
    async stop() {
      server.close();
    },
  };
}

/* The harness's browser: it follows the platform's redirect to the course,
   reads the form the course answers with, and posts it to the launch
   endpoint the way a browser would. */
function readHiddenFields(html) {
  const fields = {};
  const pattern = /<input type="hidden" name="([^"]+)" value="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) fields[match[1]] = match[2];
  return fields;
}

async function loginToCourse(deployment, { sub, email, name, extraClaims } = {}) {
  const params = new URLSearchParams({
    iss: deployment.issuer,
    login_hint: sub ?? "lms-user-1",
    target_link_uri: `${BASE}/lti/launch`,
    lti_message_hint: "lti-launch",
    client_id: deployment.clientId,
    lti_deployment_id: deployment.deploymentId,
  });
  const res = await fetch(`${BASE}/lti/login?${params.toString()}`, { redirect: "manual", headers: asMesh() });
  return res;
}

async function launchCourse(deployment, options = {}) {
  /* The course knows which of its own deployments the learner launched, and
     it says so in the id token. The harness tells the fake course which one
     is in play before the browser goes there. */
  if (options.deploymentId) lms.setDeploymentId(options.deploymentId);
  else lms.setDeploymentId(deployment.deploymentId);
  const loginRes = await loginToCourse(deployment, options);
  if (loginRes.status !== 302) return { loginRes };
  const location = loginRes.headers.get("location");
  const authRes = await fetch(location, { redirect: "manual" });
  const html = await authRes.text();
  const fields = readHiddenFields(html);
  let idToken = fields.id_token;
  if (options.mint) idToken = options.mint(lms.recorded.lastClaims);
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    ...asMesh(),
    ...(options.sessionUserId ? { "x-user-id": options.sessionUserId } : {}),
  };
  const res = await fetch(`${BASE}/lti/launch`, {
    method: "POST",
    headers,
    body: new URLSearchParams({ id_token: idToken, state: fields.state }).toString(),
    redirect: "manual",
  });
  return { loginRes, authRes, fields, res };
}

/* The code a verified launch hands the browser, and the session it becomes. */
async function exchangeCode(location) {
  const code = new URL(location).searchParams.get("code");
  const res = await fetch(`${BASE}/lti/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json", ...asMesh() },
    body: JSON.stringify({ code }),
  });
  return { code, res };
}

/* ---------- the platform under test ---------- */

async function migrate() {
  const dir = join(root, "services", "auth", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

async function seed() {
  const people = [
    ["u-instructor", "instructor@example.com", "The Instructor"],
    ["u-learner-1", "learner1@example.com", "Learner One"],
    ["u-learner-2", "learner2@example.com", "Learner Two"],
    ["u-local", "taken@example.edu", "A Learner Who Signed Up"],
  ];
  for (const [id, email, name] of people) {
    await pool.query(
      "INSERT INTO users (id, email, name, password_hash, created_at, provider, email_verified_at) " +
        "VALUES ($1, $2, $3, 'x', now(), 'local', now())",
      [id, email, name]
    );
  }
}

async function createCohort({ seats, courseId = "task-manager" }) {
  const res = await fetch(`${BASE}/cohorts`, {
    method: "POST",
    headers: { "content-type": "application/json", ...asUser("u-instructor") },
    body: JSON.stringify({
      name: "CS 202",
      institution: "Delft University",
      courseId,
      term: "2026-autumn",
      seats,
    }),
  });
  assert.equal(res.status, 201, "the cohort is created");
  const cohort = (await res.json()).cohort;
  const activate = await fetch(`${BASE}/internal/cohorts/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...asMesh() },
    body: JSON.stringify({ joinCode: cohort.joinCode, seats, perStudentCents: 1200 }),
  });
  assert.equal(activate.status, 200, "the operator confirms the licence");
  return cohort;
}

async function registerDeployment({ cohortId, deploymentId, clientSecret = "lms-client-secret" }) {
  const res = await fetch(`${BASE}/internal/lti/deployments`, {
    method: "POST",
    headers: { "content-type": "application/json", ...asMesh() },
    body: JSON.stringify({
      issuer: `${LMS_BASE}`,
      clientId: "client-100",
      deploymentId,
      institution: "Delft University",
      cohortId,
      authorizationUrl: `${LMS_BASE}/auth`,
      tokenUrl: `${LMS_BASE}/token`,
      jwksUrl: `${LMS_BASE}/jwks`,
      ...(clientSecret ? { clientSecret } : {}),
    }),
  });
  assert.equal(res.status, 201, "the deployment is registered");
  return (await res.json()).deployment;
}

async function memberCount(cohortId) {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1", [cohortId]);
  return Number(rows[0].n);
}

describe("LTI 1.3 (real database, real HTTP, a course played by a harness)", () => {
  let deployment;
  let smallCohort;
  let smallDeployment;
  let assertionDeployment;

  before(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 8 });
    await server.start();
    pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${DB_PORT}/postgres`, max: 4 });
    await migrate();
    await seed();

    lms = makeFakeLms();
    lms.setIssuer(`${LMS_BASE}`);
    lms.setDeploymentId("deployment-1");
    await lms.start();

    app = await createService("test-auth-lti");
    registerCohortRoutes(app, pool);
    await registerLtiRoutes(app, pool);
    await app.listen({ port: AUTH_PORT, host: "127.0.0.1" });

    const cohort = await createCohort({ seats: 30 });
    deployment = await registerDeployment({ cohortId: cohort.id, deploymentId: "deployment-1" });
    smallCohort = await createCohort({ seats: 1 });
    smallDeployment = await registerDeployment({
      cohortId: smallCohort.id,
      deploymentId: "deployment-2",
    });
    const assertionCohort = await createCohort({ seats: 5 });
    assertionDeployment = await registerDeployment({
      cohortId: assertionCohort.id,
      deploymentId: "deployment-4",
      clientSecret: null,
    });
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    await lms?.stop();
    await server?.stop();
    await db?.close();
  });

  it("the login initiation redirects to the course with a state and a nonce", async () => {
    const res = await loginToCourse(deployment, { sub: "lms-user-login" });
    assert.equal(res.status, 302, "the browser is sent to the course");
    const location = new URL(res.headers.get("location"));
    assert.equal(location.origin + location.pathname, `${LMS_BASE}/auth`);
    assert.ok(location.searchParams.get("state"), "and the redirect carries a state");
    assert.ok(location.searchParams.get("nonce"), "and a nonce");
    assert.equal(location.searchParams.get("client_id"), deployment.clientId);
    assert.equal(location.searchParams.get("redirect_uri"), `${BASE}/lti/launch`);
    assert.equal(location.searchParams.get("response_mode"), "form_post");

    const { rows } = await pool.query("SELECT state, nonce FROM lti_login_states");
    assert.equal(rows.length, 1, "and the state is recorded");
    assert.notEqual(rows[0].state, location.searchParams.get("state"), "hashed at rest");
    assert.notEqual(rows[0].nonce, location.searchParams.get("nonce"), "and so is the nonce");
  });

  it("a launch whose signature does not verify is refused, and creates nothing", async () => {
    const before = await pool.query("SELECT count(*)::int AS n FROM users");
    const { res } = await launchCourse(deployment, {
      sub: "lms-user-forged",
      mint: (claims) => lms.mint(claims, lms.attackerKey),
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "bad_signature");
    const after = await pool.query("SELECT count(*)::int AS n FROM users");
    assert.equal(after.rows[0].n, before.rows[0].n, "a refused launch creates no account");
  });

  it("a launch that is played back is refused", async () => {
    const first = await launchCourse(deployment, { sub: "lms-user-replay" });
    assert.equal(first.res.status, 302, "the first launch is accepted");
    const again = await fetch(`${BASE}/lti/launch`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...asMesh() },
      body: new URLSearchParams({ id_token: first.fields.id_token, state: first.fields.state }).toString(),
    });
    assert.equal(again.status, 401, "the same launch a second time is refused");
    assert.equal((await again.json()).error.code, "replayed_launch");
  });

  it("a launch with the wrong audience is refused", async () => {
    const { res } = await launchCourse(deployment, {
      sub: "lms-user-audience",
      mint: (claims) => lms.mint({ ...claims, aud: "some-other-client" }),
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "wrong_audience");
  });

  it("an expired launch is refused", async () => {
    const { res } = await launchCourse(deployment, {
      sub: "lms-user-expired",
      mint: (claims) => lms.mint({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }),
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "expired_launch");
  });

  it("a launch with a nonce this platform did not issue is refused", async () => {
    const { res } = await launchCourse(deployment, {
      sub: "lms-user-nonce",
      mint: (claims) => lms.mint({ ...claims, nonce: "a-nonce-nobody-issued" }),
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "nonce_mismatch");
  });

  it("a launch without a registered deployment is refused", async () => {
    const unknown = await loginToCourse({ ...deployment, deploymentId: "deployment-nobody-registered" });
    assert.equal(unknown.status, 404, "the course is not registered, so there is no login");
    assert.equal((await unknown.json()).error.code, "no_such_deployment");

    const wrongIssuer = await loginToCourse({ ...deployment, issuer: "https://another-lms.example" });
    assert.equal(wrongIssuer.status, 404, "and an issuer we do not hold is not a deployment either");

    const { res } = await launchCourse(deployment, {
      sub: "lms-user-deployment",
      mint: (claims) => lms.mint({ ...claims, "https://purl.imsglobal.org/spec/lti/claim/deployment_id": "deployment-9" }),
    });
    assert.equal(res.status, 401, "and a launch naming another deployment is refused");
    assert.equal((await res.json()).error.code, "deployment_mismatch");
  });

  it("a launch with no role is refused", async () => {
    const { res } = await launchCourse(deployment, {
      sub: "lms-user-role",
      mint: (claims) => lms.mint({ ...claims, "https://purl.imsglobal.org/spec/lti/claim/roles": [] }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "no_role");
  });

  it("the same LMS user lands on the same platform account", async () => {
    lms.setUser("lms-user-bound", { email: "bound@example.edu", name: "Bound Learner" });
    const first = await launchCourse(deployment, { sub: "lms-user-bound" });
    assert.equal(first.res.status, 302);
    const firstSession = await exchangeCode(first.res.headers.get("location"));
    assert.equal(firstSession.res.status, 200);
    const firstUser = (await firstSession.res.json()).user;

    const second = await launchCourse(deployment, { sub: "lms-user-bound" });
    assert.equal(second.res.status, 302, "the same course user launches again");
    const secondSession = await exchangeCode(second.res.headers.get("location"));
    const secondUser = (await secondSession.res.json()).user;
    assert.equal(secondUser.id, firstUser.id, "and lands on the same platform account");

    const { rows } = await pool.query("SELECT user_id FROM lti_identities WHERE issuer = $1 AND subject = $2", [
      `${LMS_BASE}`,
      "lms-user-bound",
    ]);
    assert.equal(rows.length, 1, "one binding, not one per launch");
    assert.equal(rows[0].user_id, firstUser.id);

    const accounts = await pool.query("SELECT count(*)::int AS n FROM users WHERE lower(email) = 'bound@example.edu'");
    assert.equal(accounts.rows[0].n, 1, "and one account, not one per launch");
  });

  it("a launch with an email that belongs to somebody else is refused", async () => {
    lms.setUser("lms-user-collide", { email: "taken@example.edu", name: "Colliding Learner" });
    const { res } = await launchCourse(deployment, { sub: "lms-user-collide" });
    assert.equal(res.status, 409, "a collision is a refusal, not a merge");
    assert.equal((await res.json()).error.code, "email_taken");
    const { rows } = await pool.query("SELECT id FROM lti_identities WHERE subject = 'lms-user-collide'");
    assert.equal(rows.length, 0, "and nothing was bound");
  });

  it("a launch from a signed-in browser binds to the account that browser is on", async () => {
    lms.setUser("lms-user-session", { email: "signedin@example.edu", name: "Signed In Learner" });
    const { res } = await launchCourse(deployment, { sub: "lms-user-session", sessionUserId: "u-learner-1" });
    assert.equal(res.status, 302);
    const session = await exchangeCode(res.headers.get("location"));
    const user = (await session.res.json()).user;
    assert.equal(user.id, "u-learner-1", "the launch lands on the account the browser is already on");
  });

  it("a launch takes a seat, and a learner with no seat left is refused", async () => {
    lms.setUser("lms-user-seat-1", { email: "seat1@example.edu", name: "Seat One" });
    lms.setUser("lms-user-seat-2", { email: "seat2@example.edu", name: "Seat Two" });
    const first = await launchCourse(smallDeployment, { sub: "lms-user-seat-1", deploymentId: "deployment-2" });
    assert.equal(first.res.status, 302, "the first learner takes the seat");
    assert.equal(await memberCount(smallCohort.id), 1, "and the cohort holds one member");

    const second = await launchCourse(smallDeployment, { sub: "lms-user-seat-2", deploymentId: "deployment-2" });
    assert.equal(second.res.status, 409, "the second learner has no seat to take");
    assert.equal((await second.res.json()).error.code, "no_seat");
    assert.equal(await memberCount(smallCohort.id), 1, "and the cohort still holds one member");
    const refused = await pool.query("SELECT count(*)::int AS n FROM users WHERE lower(email) = 'seat2@example.edu'");
    assert.equal(refused.rows[0].n, 0, "and a refused launch creates no account either");
  });

  it("a launch in a class whose licence is not confirmed is refused", async () => {
    const res = await fetch(`${BASE}/cohorts`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asUser("u-instructor") },
      body: JSON.stringify({
        name: "CS 203",
        institution: "Delft University",
        courseId: "task-manager",
        term: "2026-autumn",
        seats: 5,
      }),
    });
    const pending = (await res.json()).cohort;
    const pendingDeployment = await registerDeployment({ cohortId: pending.id, deploymentId: "deployment-3" });
    lms.setUser("lms-user-pending", { email: "pending@example.edu", name: "Pending Learner" });
    const launch = await launchCourse(pendingDeployment, { sub: "lms-user-pending", deploymentId: "deployment-3" });
    assert.equal(launch.res.status, 409);
    assert.equal((await launch.res.json()).error.code, "licence_not_confirmed");
  });

  it("a verified launch hands the browser a session, and the code is one-time", async () => {
    lms.setUser("lms-user-session-grant", { email: "grant@example.edu", name: "Grant Learner" });
    const { res } = await launchCourse(deployment, { sub: "lms-user-session-grant" });
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.match(location.pathname, /lti\/complete/, "the browser goes to the front door");
    const code = location.searchParams.get("code");
    assert.ok(code, "with a one-time code");
    assert.ok(!code.includes("ey"), "and no token in the URL");

    const exchange = await fetch(`${BASE}/lti/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ code }),
    });
    assert.equal(exchange.status, 200);
    const body = await exchange.json();
    const claims = jwt.verify(body.tokens.accessToken, JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(claims.sub, body.user.id, "the session is the learner's");
    assert.ok(body.tokens.refreshToken, "and it can be renewed");

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1", [body.user.id]);
    assert.equal(rows[0].n, 1, "the refresh token is on file");

    const again = await fetch(`${BASE}/lti/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ code }),
    });
    assert.equal(again.status, 401, "and the code cannot be used twice");
  });

  it("a score is posted to the course's grade service, and a replay does not post it twice", async () => {
    lms.setUser("lms-user-grade", { email: "grade@example.edu", name: "Grade Learner" });
    const launched = await launchCourse(deployment, { sub: "lms-user-grade" });
    assert.equal(launched.res.status, 302);
    const session = await exchangeCode(launched.res.headers.get("location"));
    const user = (await session.res.json()).user;

    /* The ledger: what the platform verified. Nothing is posted without it. */
    await pool.query(
      "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES " +
        "($1, 'project-setup', 'demonstrated', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, $2, now())",
      [user.id, `sha-${user.id}`]
    );

    const before = lms.recorded.scores.length;
    const posted = await fetch(`${BASE}/internal/lti/grades`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ userId: user.id, deploymentId: deployment.id }),
    });
    assert.equal(posted.status, 200);
    const results = (await posted.json()).results;
    assert.equal(results.length, 1, "one receipt, one score");
    assert.equal(results[0].status, "posted");

    assert.equal(lms.recorded.scores.length, before + 1, "the course received one score");
    const score = lms.recorded.scores.at(-1);
    assert.equal(score.url, "/ags/scores", "posted to the line item the launch named");
    assert.equal(score.authorization, "Bearer lms-access-token-1", "with the access token the course issued");
    assert.equal(score.body.userId, "lms-user-grade", "for the course's own user id");
    assert.equal(score.body.scoreGiven, 1);
    assert.equal(score.body.scoreMaximum, 1);
    assert.equal(score.body.activityProgress, "Completed", "the activity is finished");
    assert.equal(score.body.gradingProgress, "FullyGraded");
    assert.match(score.body.comment, /sha-/, "and the receipt the score rests on travels with it");

    const tokenRequest = lms.recorded.tokenRequests.at(-1);
    assert.equal(tokenRequest.grant_type, "client_credentials");
    assert.equal(tokenRequest.client_id, deployment.clientId, "with the client's own credentials");
    assert.equal(tokenRequest.client_secret, "lms-client-secret");
    assert.match(
      tokenRequest.scope ?? "",
      /lti-ags\/scope\/score/,
      "and for the scope the launch named, so the course lets the platform post a score"
    );

    const { rows: sealed } = await pool.query("SELECT client_secret_enc FROM lti_deployments WHERE id = $1", [
      deployment.id,
    ]);
    assert.notEqual(sealed[0].client_secret_enc, "lms-client-secret", "and the secret is not readable in the database");

    const replay = await fetch(`${BASE}/internal/lti/grades`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ userId: user.id, deploymentId: deployment.id }),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).results[0].posted, false, "the second passback posts nothing");
    assert.equal(lms.recorded.scores.length, before + 1, "and the course received no second score");
  });

  it("a failed post is recorded as failed and is retried", async () => {
    lms.setUser("lms-user-retry", { email: "retry@example.edu", name: "Retry Learner" });
    const launched = await launchCourse(deployment, { sub: "lms-user-retry" });
    const session = await exchangeCode(launched.res.headers.get("location"));
    const user = (await session.res.json()).user;
    await pool.query(
      "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES " +
        "($1, 'project-setup', 'demonstrated', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, $2, now())",
      [user.id, `sha-${user.id}`]
    );

    lms.recorded.failNextScores = 1;
    const failed = await fetch(`${BASE}/internal/lti/grades`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ userId: user.id, deploymentId: deployment.id }),
    });
    const failedResults = (await failed.json()).results;
    assert.equal(failedResults[0].status, "failed", "the failure is recorded, not hidden");
    assert.equal(failedResults[0].attempts, 1);

    const retried = await fetch(`${BASE}/internal/lti/grades`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ userId: user.id, deploymentId: deployment.id }),
    });
    const retriedResults = (await retried.json()).results;
    assert.equal(retriedResults[0].status, "posted", "and the retry posts it");
    assert.equal(retriedResults[0].attempts, 2);
  });

  it("nothing is posted for work the platform has not verified", async () => {
    lms.setUser("lms-user-nothing", { email: "nothing@example.edu", name: "Nothing Learner" });
    const launched = await launchCourse(deployment, { sub: "lms-user-nothing" });
    const session = await exchangeCode(launched.res.headers.get("location"));
    const user = (await session.res.json()).user;
    const before = lms.recorded.scores.length;
    const res = await fetch(`${BASE}/internal/lti/grades`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ userId: user.id, deploymentId: deployment.id }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).results, [], "there is nothing to post");
    assert.equal(lms.recorded.scores.length, before, "and the course received nothing");
  });

  it("a course with no shared secret is met with a signed client assertion", async () => {
    const jwks = await fetch(`${BASE}/lti/jwks`, { headers: asMesh() });
    assert.equal(jwks.status, 200, "the platform publishes its own key");
    const key = (await jwks.json()).keys[0];
    assert.equal(key.kid, "tool-1");
    assert.equal(key.kty, "RSA");

    lms.setUser("lms-user-assertion", { email: "assertion@example.edu", name: "Assertion Learner" });
    const launched = await launchCourse(assertionDeployment, { sub: "lms-user-assertion" });
    assert.equal(launched.res.status, 302);
    const session = await exchangeCode(launched.res.headers.get("location"));
    const user = (await session.res.json()).user;
    await pool.query(
      "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES " +
        "($1, 'project-setup', 'demonstrated', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, $2, now())",
      [user.id, `sha-${user.id}`]
    );
    const res = await fetch(`${BASE}/internal/lti/grades`, {
      method: "POST",
      headers: { "content-type": "application/json", ...asMesh() },
      body: JSON.stringify({ userId: user.id, deploymentId: assertionDeployment.id }),
    });
    assert.equal(res.status, 200);

    const request = lms.recorded.tokenRequests.at(-1);
    assert.equal(request.client_secret, undefined, "no shared secret was sent");
    assert.equal(
      request.assertion?.verified,
      true,
      "and the course verified the platform's signed assertion against the published key"
    );
    assert.equal(request.assertion.iss, "client-100");
    assert.equal(request.assertion.aud, LMS_BASE);
    assert.equal(request.assertion.kid, "tool-1");
  });

  it("a statement is issued, and its signature verifies against the published key", async () => {
    lms.setUser("lms-user-statement", { email: "statement@example.edu", name: "Statement Learner" });
    const launched = await launchCourse(deployment, { sub: "lms-user-statement" });
    const session = await exchangeCode(launched.res.headers.get("location"));
    const user = (await session.res.json()).user;
    await pool.query(
      "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES " +
        "($1, 'project-setup', 'demonstrated', '{\"facts\":{\"kind\":\"run\"}}'::jsonb, $2, now())",
      [user.id, `sha-statement-${user.id}`]
    );

    const res = await fetch(`${BASE}/lti/statement`, { headers: asUser(user.id) });
    assert.equal(res.status, 200);
    const { statement, signature } = await res.json();
    assert.equal(statement.learner.email, "statement@example.edu", "the statement names the learner");
    assert.equal(statement.entries.length, 1, "and the verified work");
    assert.equal(statement.entries[0].competencyId, "project-setup");
    assert.ok(statement.entries[0].receipt, "with the receipt that proves it");
    assert.ok(statement.classes.length >= 1, "and the class it was done in");

    const keyRes = await fetch(`${BASE}/lti/statement/verify-key`, { headers: asMesh() });
    assert.equal(keyRes.status, 200);
    const { publicKey } = await keyRes.json();
    assert.equal(publicKey, STATEMENT_PUBLIC_PEM, "the published key is the one the platform signs with");
    const bytes = Buffer.from(JSON.stringify(statement), "utf8");
    assert.ok(
      verifySignature(null, bytes, createPublicKey(publicKey), Buffer.from(signature.sigEd, "base64")),
      "and the signature verifies over the statement's own bytes"
    );
  });

  it("a statement for a named learner is the instructor's only", async () => {
    const learner = await pool.query("SELECT id FROM users WHERE email = 'statement@example.edu'");
    const learnerId = learner.rows[0].id;
    const instructor = await fetch(`${BASE}/lti/statements/${learnerId}`, { headers: asUser("u-instructor") });
    assert.equal(instructor.status, 200, "the instructor of the class can produce it");
    const stranger = await fetch(`${BASE}/lti/statements/${learnerId}`, { headers: asUser("u-learner-2") });
    assert.equal(stranger.status, 404, "and nobody else can");
  });

  it("registering a deployment is the mesh's, and it is written down", async () => {
    const withoutKey = await fetch(`${BASE}/internal/lti/deployments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issuer: `${LMS_BASE}`, clientId: "x", deploymentId: "y" }),
    });
    assert.equal(withoutKey.status, 403, "the registration is not a public surface");

    const { rows } = await pool.query(
      "SELECT operator_id, action, target FROM admin_actions WHERE action = 'lti.deployment_registered' AND target = $1",
      [deployment.id]
    );
    assert.equal(rows.length, 1, "and the registration leaves a record");
    assert.equal(rows[0].operator_id, "the-operator-tooling");
    assert.equal(rows[0].target, deployment.id);
  });

  it("the service mounts the LTI routes", () => {
    // A route module that is written and never mounted is a 404 in
    // production, and the suite that registers the module on its own test app
    // cannot see that from the outside.
    const entry = readFileSync(join(root, "services", "auth", "src", "index.ts"), "utf8");
    assert.match(entry, /registerLtiRoutes\s*\(/, "the service that runs is the one that answers");
  });
});
