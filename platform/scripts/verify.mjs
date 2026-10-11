#!/usr/bin/env node
/* Platform verification, part 1: host-level. No Docker daemon required.
   Run: npm run verify
   Covers: contracts, service-kit, auth crypto, gateway (pure + live proxy
   against stub upstreams), execution (validation + live subprocess + docker
   arg construction + queue + quotas), curriculum + tutor + billing routes
   (in-process via fastify.inject), boot fail-fast paths, sync freshness,
   migrations sanity, compose validity. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { verifyWebhookSignature, signTestVector, signingKey, loadPlans } from "../services/billing/dist/dodo.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = randomBytes(32).toString("hex");
const MESH = randomBytes(32).toString("hex");

process.env.BCRYPT_ROUNDS = "4"; // speed up tests only; production default is 12

const contracts = await import("../packages/contracts/dist/index.js");
const kit = await import("../packages/service-kit/dist/index.js");
const authCrypto = await import("../services/auth/dist/crypto.js");
const gwConfig = await import("../services/gateway/dist/config.js");
const gwAuth = await import("../services/gateway/dist/auth.js");
const gwLimits = await import("../services/gateway/dist/limits.js");
const gwProxy = await import("../services/gateway/dist/proxy.js");
const execValidate = await import("../services/execution/dist/validate.js");
const execSub = await import("../services/execution/dist/runners/subprocess.js");
const execDocker = await import("../services/execution/dist/runners/docker.js");
const execQueue = await import("../services/execution/dist/queue.js");
const execQuotas = await import("../services/execution/dist/quotas.js");
const execGoDiag = await import("../services/execution/dist/go-diagnostics.js");
const execReceipt = await import("../services/execution/dist/receipt.js");
const progressRunVerification = await import("../services/progress/dist/verify-runs.js");

// The Go toolchain is the product's teaching language, so its runner is tested
// for real when it is present. An absent toolchain skips with a reason rather
// than passing quietly — CI installs Go precisely so this never skips there.
const GO_AVAILABLE = spawnSync("go", ["version"], { encoding: "utf8" }).status === 0;
const GO_SKIP = GO_AVAILABLE ? false : "go toolchain not on PATH";

// The docker tier is opt-in: it needs a daemon and the purpose-built Go image.
// When both are present the container path is exercised for real, not just
// asserted on its argument list.
const DOCKER_READY =
  spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" }).status === 0;
const GO_IMAGE_READY =
  DOCKER_READY &&
  spawnSync("docker", ["image", "inspect", "nexora-go-runner:1"], { encoding: "utf8" }).status === 0;

describe("contracts", () => {
  it("register accepts good input, rejects bad", () => {
    assert.ok(contracts.registerSchema.safeParse({ email: "a@b.co", password: "0123456789" }).success);
    assert.ok(!contracts.registerSchema.safeParse({ email: "nope", password: "0123456789" }).success);
    assert.ok(!contracts.registerSchema.safeParse({ email: "a@b.co", password: "short" }).success);
  });
  it("execute schema bounds are enforced", () => {
    const base = { language: "node", files: [{ path: "m.js", content: "1" }] };
    assert.ok(contracts.executeSchema.safeParse(base).success);
    assert.ok(!contracts.executeSchema.safeParse({ ...base, language: "ruby" }).success);
    assert.ok(!contracts.executeSchema.safeParse({ ...base, files: [] }).success);
    assert.ok(!contracts.executeSchema.safeParse({ ...base, limits: { timeoutMs: 1 } }).success);
    // Go is the product's teaching language: it must be accepted by the wire
    // contract, not merely by the runner.
    assert.ok(
      contracts.executeSchema.safeParse({
        language: "go",
        files: [{ path: "main.go", content: "package main" }],
      }).success
    );
  });
  it("tutor + checkout schemas", () => {
    assert.ok(contracts.tutorAskSchema.safeParse({ missionId: "x" }).success);
    assert.ok(!contracts.tutorAskSchema.safeParse({ missionId: "x", hintLevel: 9 }).success);
    assert.ok(contracts.checkoutSchema.safeParse({ plan: "pro", email: "a@b.co" }).success);
    assert.ok(!contracts.checkoutSchema.safeParse({ plan: "pro", email: "bad" }).success);
  });
});

describe("service-kit", () => {
  it("parseOr400 accepts valid, throws ApiError 400 with issues", () => {
    const v = kit.parseOr400(contracts.loginSchema, { email: "a@b.co", password: "x" });
    assert.equal(v.email, "a@b.co");
    try {
      kit.parseOr400(contracts.loginSchema, { email: "bad" });
      assert.fail("should throw");
    } catch (e) {
      assert.equal(e.status, 400);
      assert.ok(Array.isArray(e.details));
    }
  });
  it("requireUserId reads gateway header, 401 without it", () => {
    assert.equal(kit.requireUserId({ headers: { "x-user-id": "u1" } }), "u1");
    try {
      kit.requireUserId({ headers: {} });
      assert.fail("should throw");
    } catch (e) {
      assert.equal(e.status, 401);
    }
  });
});

describe("auth crypto", () => {
  it("bcrypt roundtrip + wrong password fails", async () => {
    const h = await authCrypto.hashPassword("correct-horse-batter");
    assert.ok(await authCrypto.verifyPassword("correct-horse-batter", h));
    assert.ok(!(await authCrypto.verifyPassword("wrong", h)));
    assert.ok(!(await authCrypto.verifyPassword("x", "not-a-hash")));
  });
  it("JWT roundtrip, tamper rejected, short secret refused", async () => {
    process.env.AUTH_JWT_SECRET = SECRET;
    const { token } = authCrypto.signAccessToken("user-1");
    const { verifyAccessToken } = await import("../services/auth/dist/crypto.js");
    assert.equal(verifyAccessToken(token), "user-1");
    assert.throws(() => verifyAccessToken(token + "x"));
    process.env.AUTH_JWT_SECRET = "short";
    assert.throws(() => authCrypto.signAccessToken("u"), /32 characters/);
    process.env.AUTH_JWT_SECRET = SECRET;
  });
});

describe("gateway pure units", () => {
  it("loadConfig defaults + validation", () => {
    const c = gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH });
    assert.equal(c.port, 8080);
    assert.ok(c.routes.some((r) => r.prefix === "/api/billing" && r.auth));
    const billing = c.routes.find((r) => r.prefix === "/api/billing");
    assert.deepEqual(billing.publicPaths, ["/api/billing/webhooks/dodo"]);
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: "x" }), /32 characters/);
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, FRONTEND_URL: "notaurl" }), /http/);
    assert.equal(gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, PORT: "18080" }).port, 18080);
    assert.equal(
      gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, PORT: "18080", GATEWAY_PORT: "19090" }).port,
      19090
    );
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, AUTH_MODE: "weird" }), /AUTH_MODE/);
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, AUTH_MODE: "clerk" }),
      /CLERK_SECRET_KEY or CLERK_JWT_KEY/
    );
    const clerkCfg = gwConfig.loadConfig({
      AUTH_JWT_SECRET: SECRET,
      AUTH_MODE: "clerk",
      CLERK_JWT_KEY: "pem",
      CLERK_AUTHORIZED_PARTIES: "https://a.dev, https://b.dev",
    });
    assert.equal(clerkCfg.authMode, "clerk");
    assert.deepEqual(clerkCfg.clerkAuthorizedParties, ["https://a.dev", "https://b.dev"]);
    const clerkDefault = gwConfig.loadConfig({
      AUTH_JWT_SECRET: SECRET,
      AUTH_MODE: "clerk",
      CLERK_JWT_KEY: "pem",
      FRONTEND_URL: "https://app.example.com",
    });
    assert.deepEqual(clerkDefault.clerkAuthorizedParties, ["https://app.example.com"]);
  });
  it("bearer parsing + local verification", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const local = gwAuth.localVerifier(SECRET);
    const t = jwt.sign({ sub: "u9" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    assert.equal(await gwAuth.bearerUserId(`Bearer ${t}`, local), "u9");
    assert.equal(await gwAuth.bearerUserId(undefined, local), null);
    assert.equal(await gwAuth.bearerUserId("Bearer garbage", local), null);
    assert.equal(await gwAuth.bearerUserId("Basic abc", local), null);
  });
  it("clerk verification against a self-signed RS256 key", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const jwt = (await import("jsonwebtoken")).default;
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://clerk.test.dev",
      sub: "user_clerk_1",
      sid: "sess_1",
      iat: now,
      nbf: now,
      exp: now + 300,
      azp: "http://localhost:3000",
    };
    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
    const v = gwAuth.clerkVerifier({ jwtKey: publicKey, authorizedParties: ["http://localhost:3000"] });
    assert.equal(await v.verify(token), "user_clerk_1");
    await assert.rejects(v.verify(token + "x"));
    const expired = jwt.sign({ ...payload, iat: now - 600, nbf: now - 600, exp: now - 300 }, privateKey, {
      algorithm: "RS256",
    });
    await assert.rejects(v.verify(expired));
    assert.throws(() => gwAuth.clerkVerifier({ authorizedParties: [] }), /CLERK_SECRET_KEY or CLERK_JWT_KEY/);
  });
  it("fixed window allows then blocks, then recovers", () => {
    const w = new gwLimits.FixedWindow(60_000, 2);
    assert.ok(w.take("k"));
    assert.ok(w.take("k"));
    assert.ok(!w.take("k"));
    assert.ok(w.retryAfterMs("k") > 0);
    assert.ok(w.take("other"));
  });
  it("route matching prefers longest prefix", () => {
    const routes = [
      { prefix: "/api", target: "x", auth: false, timeoutMs: 1, limit: { windowMs: 1, max: 1 } },
      { prefix: "/api/billing", target: "y", auth: true, timeoutMs: 1, limit: { windowMs: 1, max: 1 } },
    ];
    assert.equal(gwProxy.matchRoute("/api/billing/webhooks/dodo", routes)?.target, "y");
    assert.equal(gwProxy.matchRoute("/api/other", routes)?.target, "x");
    assert.equal(gwProxy.matchRoute("/nope", routes), null);
  });
  it("forward headers strip identity, inject mesh + user + trace", () => {
    const h = gwProxy.buildForwardHeaders(
      {
        authorization: "Bearer abc",
        cookie: "s=1",
        host: "example.com",
        connection: "keep-alive",
        "content-length": "5",
        "x-custom": "keep",
      },
      { userId: "u1", internalKey: MESH, requestId: "r1" }
    );
    assert.equal(h.authorization, undefined);
    assert.equal(h.cookie, undefined);
    assert.equal(h.host, undefined);
    assert.equal(h.connection, undefined);
    assert.equal(h["x-custom"], "keep");
    assert.equal(h["x-user-id"], "u1");
    assert.equal(h["x-internal-key"], MESH);
    assert.equal(h["x-request-id"], "r1");
    assert.equal(h["content-type"], "application/json");
  });

  it("a client cannot choose its own identity, mesh key, trace id or proxy hop", () => {
    // Every one of these is attacker-controlled input. A service reads
    // x-user-id as the authenticated user with no further check, so forwarding
    // a client copy is impersonation the moment any anonymous route asks.
    const spoofed = {
      "x-user-id": "victim",
      "x-internal-key": "guess",
      "x-request-id": "client-chosen",
      "x-forwarded-for": "1.2.3.4",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
      "x-real-ip": "1.2.3.4",
      forwarded: "for=1.2.3.4",
      "x-custom": "keep",
    };
    // Anonymous request (e.g. a public webhook path): nothing may survive.
    const anon = gwProxy.buildForwardHeaders(spoofed, { userId: null, internalKey: "", requestId: "r1" });
    assert.equal(anon["x-user-id"], undefined, "no client-chosen identity");
    assert.equal(anon["x-internal-key"], undefined, "no client-chosen mesh key");
    assert.equal(anon["x-request-id"], "r1", "the trace id is ours, not theirs");
    for (const h of ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded"]) {
      assert.equal(anon[h], undefined, `${h} must not be forwarded`);
    }
    assert.equal(anon["x-custom"], "keep", "unrelated headers still pass through");
    // Authenticated request: identity is the verified one, never the spoof.
    const authed = gwProxy.buildForwardHeaders(spoofed, { userId: "u1", internalKey: MESH, requestId: "r2" });
    assert.equal(authed["x-user-id"], "u1");
    assert.equal(authed["x-internal-key"], MESH);
    assert.equal(authed["x-request-id"], "r2");
  });

  it("proxy trust is opt-in and refuses a blanket true", () => {
    // The rate-limit key is req.ip. Trusting every hop let a caller set their
    // own X-Forwarded-For and rotate the anonymous/global caps away.
    assert.equal(gwConfig.parseTrustProxy({}), false, "default trusts no proxy");
    assert.equal(gwConfig.parseTrustProxy({ TRUST_PROXY: "0" }), false);
    assert.equal(gwConfig.parseTrustProxy({ TRUST_PROXY: "false" }), false);
    assert.throws(() => gwConfig.parseTrustProxy({ TRUST_PROXY: "true" }), /hop count/);
    assert.throws(() => gwConfig.parseTrustProxy({ TRUST_PROXY: "-1" }), /non-negative/);
    assert.throws(() => gwConfig.parseTrustProxy({ TRUST_PROXY: "abc" }), /non-negative/);
    assert.equal(gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET }).trustProxy, false);
    // One trusted hop in front: the address next to the socket is the proxy,
    // the one after it is the client we believe.
    const one = gwConfig.parseTrustProxy({ TRUST_PROXY: "1" });
    assert.equal(typeof one, "function");
    assert.equal(one("proxy", 0), true);
    assert.equal(one("client", 1), false);
    const two = gwConfig.parseTrustProxy({ TRUST_PROXY: "2" });
    assert.equal(two("proxy", 0), true);
    assert.equal(two("proxy", 1), true);
    assert.equal(two("client", 2), false);
  });
});

describe("gateway live proxy against stubs", () => {
  let gwProc = null;
  let stubHits = [];
  let stub;
  const GW_PORT = 18080;
  before(async () => {
    stub = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        stubHits.push({ url: req.url, method: req.method, headers: req.headers, body });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ stub: true }));
      });
    });
    await new Promise((r) => stub.listen(18081, "127.0.0.1", r));
    gwProc = spawn("node", ["services/gateway/dist/index.js"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(GW_PORT),
        FRONTEND_URL: "http://localhost:3000",
        AUTH_JWT_SECRET: SECRET,
        INTERNAL_API_KEY: MESH,
        AUTH_URL: "http://127.0.0.1:18081",
        CURRICULUM_URL: "http://127.0.0.1:18081",
        PROGRESS_URL: "http://127.0.0.1:18081",
        EXECUTION_URL: "http://127.0.0.1:18081",
        TUTOR_URL: "http://127.0.0.1:18081",
        BILLING_URL: "http://127.0.0.1:18081",
      },
      stdio: "ignore",
    });
    // wait for readiness
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${GW_PORT}/health/live`);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  it("proxies with mesh key + trace id, strips bearer", async () => {
    stubHits = [];
    const jwt = (await import("jsonwebtoken")).default;
    const t = jwt.sign({ sub: "u1" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/progress/summary`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(res.status, 200);
    assert.equal(stubHits.length, 1);
    assert.equal(stubHits[0].url, "/summary", "gateway strips the /api/<service> prefix");
    const h = stubHits[0].headers;
    assert.equal(h["x-user-id"], "u1");
    assert.equal(h["x-internal-key"], MESH);
    assert.ok(h["x-request-id"]);
    assert.equal(h["authorization"], undefined);
    assert.equal(res.headers.get("x-request-id"), h["x-request-id"]);
  });
  it("auth routes reject missing/invalid tokens without proxying", async () => {
    stubHits = [];
    const r1 = await fetch(`http://127.0.0.1:${GW_PORT}/api/progress/summary`);
    assert.equal(r1.status, 401);
    const r2 = await fetch(`http://127.0.0.1:${GW_PORT}/api/progress/summary`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(r2.status, 401);
    assert.equal(stubHits.length, 0);
  });
  it("optional-auth routes forward identity for presented tokens, reject bad ones", async () => {
    stubHits = [];
    const jwt = (await import("jsonwebtoken")).default;
    const t = jwt.sign({ sub: "u7" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(res.status, 200);
    assert.equal(stubHits[0].headers["x-user-id"], "u7");
    assert.equal(stubHits[0].headers["authorization"], undefined, "bearer still stripped");
    const bad = await fetch(`http://127.0.0.1:${GW_PORT}/api/auth/me`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(bad.status, 401);
    const none = await fetch(`http://127.0.0.1:${GW_PORT}/api/curriculum/stages`);
    assert.equal(none.status, 200, "no bearer still proxies anonymously");
    assert.equal(stubHits[stubHits.length - 1].headers["x-user-id"], undefined);
  });
  it("webhook public path bypasses auth but still proxies", async () => {
    stubHits = [];
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/billing/webhooks/dodo`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ hello: 1 }),
    });
    assert.equal(res.status, 200);
    assert.equal(stubHits.length, 1);
    assert.equal(stubHits[0].headers["x-user-id"], undefined);
    assert.equal(
      res.headers.get("access-control-expose-headers"),
      "X-Execution-Daily-Remaining, X-Request-Id"
    );
  });
  it("a spoofed x-user-id never reaches a service on an anonymous path", async () => {
    stubHits = [];
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/billing/webhooks/dodo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "victim",
        "x-internal-key": "guessed",
        "x-forwarded-for": "9.9.9.9",
      },
      body: JSON.stringify({ hello: 1 }),
    });
    assert.equal(res.status, 200);
    assert.equal(stubHits[0].headers["x-user-id"], undefined, "identity is not a client input");
    assert.equal(stubHits[0].headers["x-internal-key"], MESH, "still the real mesh key");
    assert.equal(stubHits[0].headers["x-forwarded-for"], undefined, "no client-chosen IP");
  });
  it("an authenticated request keeps its verified identity, not a spoofed header", async () => {
    stubHits = [];
    const jwt = (await import("jsonwebtoken")).default;
    const t = jwt.sign({ sub: "u1" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/progress/summary`, {
      headers: { Authorization: `Bearer ${t}`, "x-user-id": "victim" },
    });
    assert.equal(res.status, 200);
    assert.equal(stubHits[0].headers["x-user-id"], "u1", "the token decides, not the header");
  });
  it("a malformed request is the client's fault, never a 500", async () => {
    stubHits = [];
    const jwt = (await import("jsonwebtoken")).default;
    const t = jwt.sign({ sub: "u1" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const post = (headers, body) =>
      fetch(`http://127.0.0.1:${GW_PORT}/api/progress/missions/x/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, ...headers },
        body,
      });

    // What a naive client (or a probe) does: claim a JSON body and send none.
    // Fastify rejects it with its own statusCode; the edge must pass that
    // through. Answering "Something went wrong." blames the platform for a
    // request it handled correctly — and files it under the error rate.
    const empty = await post({ "content-type": "application/json" });
    // One read of the body: the assertion message and the envelope are the same
    // bytes, and a second read of a consumed stream is a test bug, not a 400.
    const emptyText = await empty.text();
    assert.equal(empty.status, 400, emptyText);
    const emptyBody = JSON.parse(emptyText);
    assert.equal(emptyBody.error.code, "bad_request");
    assert.ok(emptyBody.error.requestId, "the envelope still traces the request");
    assert.equal(stubHits.length, 0, "a request we reject never reaches a service");

    // Malformed JSON is the same class of answer, not an internal error.
    const broken = await post({ "content-type": "application/json" }, "{not json");
    assert.equal(broken.status, 400, await broken.text());
    assert.equal(stubHits.length, 0);

    // And the legitimate shape — no body, no JSON content type — still proxies.
    const ok = await post({});
    assert.equal(ok.status, 200, await ok.text());
    assert.equal(stubHits.length, 1);
    assert.equal(stubHits[0].url, "/missions/x/complete");
  });
  it("unknown prefix 404s; CORS preflight honored for configured origin", async () => {
    const r404 = await fetch(`http://127.0.0.1:${GW_PORT}/api/nope`);
    assert.equal(r404.status, 404);
    const pre = await fetch(`http://127.0.0.1:${GW_PORT}/api/progress/summary`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "GET" },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(
      pre.headers.get("access-control-expose-headers"),
      "X-Execution-Daily-Remaining, X-Request-Id"
    );
  });

  // cleanup in e2e file scope is unnecessary; kill here via process exit hook
  after(async () => {
    try {
      gwProc?.kill("SIGKILL");
    } catch {}
    try {
      await new Promise((resolve) => stub?.close(() => resolve(undefined)));
    } catch {}
  });
});

describe("execution validation", () => {
  it("rejects traversal, absolute, duplicate, oversized", () => {
    const base = { language: "node", files: [{ path: "m.js", content: "1" }] };
    for (const bad of ["../evil.js", "a/../../b.js", "/etc/passwd", "C:\\win.js", ""]) {
      assert.throws(() => execValidate.validateJob({ ...base, files: [{ path: bad, content: "1" }] }), /path/i);
    }
    assert.throws(
      () => execValidate.validateJob({ ...base, files: [{ path: "a.js", content: "1" }, { path: "a.js", content: "2" }] }),
      /duplicate/i
    );
    assert.throws(() => execValidate.validateJob({ ...base, files: [] }), /between 1/i);
  });
  it("rejects disallowed commands, clamps timeouts", () => {
    const base = { language: "node", files: [{ path: "m.js", content: "1" }] };
    assert.throws(() => execValidate.validateJob({ ...base, command: ["rm", "-rf"] }), /not allowed/);
    const j = execValidate.validateJob({ ...base, command: ["node", "m.js"], limits: { timeoutMs: 999999 } });
    assert.equal(j.timeoutMs, 30000);
    const j2 = execValidate.validateJob(base);
    assert.deepEqual(j2.command, ["node", "m.js"]);
  });
  it("no command argument may escape the submission directory", () => {
    // The first argument is allowlisted; the rest of argv is where a learner
    // (or an attacker) would try to reach outside the sandbox.
    const go = { language: "go", files: [{ path: "main.go", content: "1" }] };
    for (const arg of ["/etc/passwd", "../secrets.go", "a/../../b.go", "C:\\win.go", "x\0y"]) {
      assert.throws(
        () => execValidate.validateJob({ ...go, command: ["go", "run", arg] }),
        /Invalid command argument/,
        `rejected: ${arg}`
      );
    }
    assert.ok(execValidate.validateJob({ ...go, command: ["go", "run", "main.go"] }));
  });
  it("go gets a default command and a compile-sized timeout", () => {
    const job = execValidate.validateJob({
      language: "go",
      files: [{ path: "main.go", content: "package main" }],
    });
    assert.deepEqual(job.command, ["go", "run", "main.go"]);
    // Compiling costs more than interpreting a script, and a cold cache is the
    // normal case for a learner's first program.
    assert.ok(job.timeoutMs >= 20000, `expected >=20000, got ${job.timeoutMs}`);
    assert.equal(job.language, "go");
  });
});

describe("execution subprocess runner (live)", () => {
  it("runs node, captures stdout", async () => {
    const job = execValidate.validateJob({
      language: "node",
      files: [{ path: "main.js", content: "const fib=(n)=>n<2?n:fib(n-1)+fib(n-2); console.log(fib(20));" }],
    });
    const r = await execSub.runSubprocess(job);
    assert.equal(r.timedOut, false);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.trim(), "6765");
    assert.equal(r.runner, "subprocess");
  });
  it("kills infinite loops (timeout, not hang)", async () => {
    const job = execValidate.validateJob({
      language: "node",
      files: [{ path: "main.js", content: "while(true){}" }],
      limits: { timeoutMs: 600 },
    });
    const t0 = Date.now();
    const r = await execSub.runSubprocess(job);
    assert.equal(r.timedOut, true);
    assert.ok(Date.now() - t0 < 8000, "kill was prompt");
  });
  it("scrubs the parent environment", async () => {
    process.env.SECRET_FOR_TEST = "leak-me";
    const job = execValidate.validateJob({
      language: "node",
      files: [{ path: "main.js", content: "console.log(process.env.SECRET_FOR_TEST);" }],
    });
    const r = await execSub.runSubprocess(job);
    assert.equal(r.stdout.trim(), "undefined");
    delete process.env.SECRET_FOR_TEST;
  });
  it("truncates runaway output", async () => {
    const job = execValidate.validateJob({
      language: "node",
      files: [{ path: "main.js", content: "let s='x'.repeat(100000); console.log(s); console.log(s);" }],
      limits: { outputKb: 1 },
    });
    const r = await execSub.runSubprocess(job);
    assert.equal(r.truncated, true);
    assert.ok(r.stdout.length <= 2048);
  });
  it("reports runtime errors with exit codes", async () => {
    const job = execValidate.validateJob({
      language: "node",
      files: [{ path: "main.js", content: "throw new Error('boom');" }],
    });
    const r = await execSub.runSubprocess(job);
    assert.equal(r.timedOut, false);
    assert.notEqual(r.exitCode, 0);
    assert.match(r.stderr, /boom/);
  });
  it("runs real Go with a hermetic environment", { skip: GO_SKIP }, async () => {
    const job = execValidate.validateJob({
      language: "go",
      files: [
        {
          path: "main.go",
          content:
            'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello from go")\n}\n',
        },
      ],
      limits: { timeoutMs: 30000 },
    });
    const r = await execSub.runSubprocess(job);
    assert.equal(r.timedOut, false, `timed out; stderr: ${r.stderr}`);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout.trim(), "hello from go");
  });
  it("a Go compile error never runs the program", { skip: GO_SKIP }, async () => {
    const job = execValidate.validateJob({
      language: "go",
      files: [
        {
          path: "main.go",
          content:
            'package main\n\nfunc main() {\n\tfmt.Println("missing import")\n}\n',
        },
      ],
      limits: { timeoutMs: 30000 },
    });
    const r = await execSub.runSubprocess(job);
    assert.notEqual(r.exitCode, 0);
    assert.equal(r.stdout, "");
    const diags = execGoDiag.parseGoDiagnostics(r.stderr);
    assert.ok(diags.length > 0, `expected diagnostics in: ${r.stderr}`);
    assert.equal(diags[0].kind, "compile");
    assert.equal(diags[0].file, "main.go");
    assert.equal(execGoDiag.goPhase(diags), "compile");
  });
});

describe("execution go diagnostics (pure)", () => {
  // Fixtures are the exact shapes the Go toolchain prints; the parser is tested
  // against the compiler's output, not against our idea of it.
  const COMPILE = [
    "# command-line-arguments",
    "./main.go:4:2: undefined: fmt",
    "./main.go:7:9: too many arguments in call to println",
  ].join("\n");
  const PANIC = [
    "panic: runtime error: index out of range [5] with length 3",
    "",
    "goroutine 1 [running]:",
    "main.main()",
    "\t/tmp/nexora-exec-abc123/main.go:6 +0x25",
    "exit status 2",
  ].join("\n");

  it("reads compile errors with file, line and column", () => {
    const d = execGoDiag.parseGoDiagnostics(COMPILE);
    assert.equal(d.length, 2);
    assert.deepEqual(d[0], {
      kind: "compile",
      file: "main.go",
      line: 4,
      column: 2,
      message: "undefined: fmt",
    });
    assert.equal(d[1].line, 7);
    assert.equal(d[1].column, 9);
    assert.match(d[1].message, /too many arguments/);
  });
  it("reads a panic as a runtime failure at the failing frame", () => {
    const d = execGoDiag.parseGoDiagnostics(PANIC);
    assert.equal(d.length, 1);
    assert.equal(d[0].kind, "runtime");
    assert.equal(d[0].file, "main.go");
    assert.equal(d[0].line, 6);
    assert.match(d[0].message, /index out of range/);
    assert.equal(execGoDiag.goPhase(d), "run");
  });
  it("says nothing when there is nothing to say", () => {
    assert.deepEqual(execGoDiag.parseGoDiagnostics(""), []);
    assert.deepEqual(execGoDiag.parseGoDiagnostics("hello from go\n"), []);
    assert.equal(execGoDiag.goPhase([]), "run");
  });
  it("never repeats a diagnostic", () => {
    const doubled = COMPILE + "\n" + COMPILE;
    assert.equal(execGoDiag.parseGoDiagnostics(doubled).length, 2);
  });
  it("drops go run's exit-status noise only when diagnostics explain it", () => {
    const d = execGoDiag.parseGoDiagnostics(PANIC);
    const trimmed = execGoDiag.trimGoStderr(PANIC, d);
    assert.ok(!/exit status 2/.test(trimmed), "trailer removed alongside a real diagnostic");
    assert.match(trimmed, /index out of range/);
    // Without diagnostics the raw output is left exactly as it was: we never
    // hide output we could not explain.
    const raw = "exit status 2\n";
    assert.equal(execGoDiag.trimGoStderr(raw, []), raw);
  });
});

describe("execution service routes (in-process)", () => {
  let app;
  before(async () => {
    const routes = await import("../services/execution/dist/routes.js");
    app = await kit.createService("test-execution");
    routes.registerExecutionRoutes(app, {
      queue: new execQueue.JobQueue(2),
      quotas: new execQuotas.Quotas(500, 2),
      runner: "subprocess",
    });
    await app.ready();
  });
  const as = (body) => ({
    method: "POST",
    url: "/execute",
    headers: { "x-user-id": "u-go", "content-type": "application/json" },
    payload: body,
  });

  it("capabilities are reported honestly, per language", async () => {
    const r = await app.inject({ method: "GET", url: "/capabilities", headers: { "x-user-id": "u-go" } });
    assert.equal(r.statusCode, 200);
    const body = r.json();
    assert.equal(body.runner, "subprocess");
    assert.ok(Array.isArray(body.languages));
    // Node is always present in this suite's environment; the shape must be
    // there whether or not a Go toolchain is.
    assert.ok(body.defaultTimeoutByLanguage.go >= 20000);
    assert.equal(body.dailyQuota, 500);
    assert.equal(body.dailyRemaining, 500);
  });
  it("401 without an authenticated user", async () => {
    const capabilities = await app.inject({ method: "GET", url: "/capabilities" });
    assert.equal(capabilities.statusCode, 401);
    const r = await app.inject({ method: "POST", url: "/execute", payload: {} });
    assert.equal(r.statusCode, 401);
  });
  it("runs Go and returns stdout through the route", { skip: GO_SKIP }, async () => {
    const r = await app.inject(
      as({
        language: "go",
        files: [
          {
            path: "main.go",
            content:
              'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(6 * 7)\n}\n',
          },
        ],
        limits: { timeoutMs: 30000 },
      })
    );
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.equal(body.exitCode, 0, body.stderr);
    assert.equal(body.stdout.trim(), "42");
    assert.equal(body.phase, "run");
    assert.deepEqual(body.diagnostics, []);
    assert.equal(r.headers["x-execution-daily-remaining"], "499");
    const refreshed = await app.inject({
      method: "GET",
      url: "/capabilities",
      headers: { "x-user-id": "u-go" },
    });
    assert.equal(refreshed.json().dailyRemaining, 499);
  });
  it("attaches structured compile diagnostics for broken Go", { skip: GO_SKIP }, async () => {
    const r = await app.inject(
      as({
        language: "go",
        files: [
          {
            path: "main.go",
            content: 'package main\n\nfunc main() {\n\tfmt.Println(1)\n}\n',
          },
        ],
        limits: { timeoutMs: 30000 },
      })
    );
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.notEqual(body.exitCode, 0);
    assert.equal(body.phase, "compile");
    assert.ok(body.diagnostics.length >= 1);
    assert.equal(body.diagnostics[0].kind, "compile");
    assert.equal(body.diagnostics[0].file, "main.go");
    assert.equal(typeof body.diagnostics[0].line, "number");
    assert.ok(!/exit status/.test(body.stderr), "noise trailer dropped");
  });
  it("a Go panic is reported as runtime, not as a compile failure", { skip: GO_SKIP }, async () => {
    const r = await app.inject(
      as({
        language: "go",
        files: [
          {
            path: "main.go",
            content:
              'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar xs []int\n\tfmt.Println(xs[3])\n}\n',
          },
        ],
        limits: { timeoutMs: 30000 },
      })
    );
    const body = r.json();
    assert.equal(body.phase, "run");
    assert.equal(body.diagnostics[0].kind, "runtime");
    assert.equal(body.diagnostics[0].file, "main.go");
  });
  it("runs a scenario's test suite against the learner's file", async () => {
    // A scenario mission in the app: the learner edits src/task.js, the mission
    // supplies verify-merge.js. This is the server half of that contract —
    // nested paths land where the suite expects them, and an explicit command
    // runs the fixture rather than the learner's file.
    const conflicted =
      'function renderTask(task) {\n<<<<<<< HEAD\n  return "Task: " + task.title;\n=======\n' +
      '  return task.done ? "✓ " + task.title : task.title;\n>>>>>>> feature/status\n}\n';
    const suite =
      'const { renderTask } = require("./src/task.js");\n' +
      'const ok = renderTask({ title: "Write the brief", done: true }) === "✓ Task: Write the brief";\n' +
      'console.log(ok ? "ALL TESTS PASSED" : "FAIL expected the check mark");\n' +
      'process.exit(ok ? 0 : 1);\n';
    const submit = (content) =>
      app.inject(
        as({
          language: "node",
          files: [
            { path: "src/task.js", content },
            { path: "verify-merge.js", content: suite },
          ],
          command: ["node", "verify-merge.js"],
          limits: { timeoutMs: 20000 },
        })
      );

    // The broken state, exactly as Git leaves it: a real failure, not a hang.
    const broken = await submit(conflicted);
    assert.equal(broken.statusCode, 200, broken.body);
    const brokenBody = broken.json();
    assert.notEqual(brokenBody.exitCode, 0, "the conflicted file cannot pass");
    assert.match(brokenBody.stderr, /SyntaxError|Unexpected token|Invalid or unexpected/, brokenBody.stderr);

    // The resolved file: both behaviours, and a clean exit.
    const resolved =
      'function renderTask(task) {\n  const label = "Task: " + task.title;\n' +
      '  return task.done ? "✓ " + label : label;\n}\n\nmodule.exports = { renderTask };\n';
    const fixed = await submit(resolved);
    assert.equal(fixed.statusCode, 200, fixed.body);
    const fixedBody = fixed.json();
    assert.equal(fixedBody.exitCode, 0, fixedBody.stderr);
    assert.equal(fixedBody.stdout.trim(), "ALL TESTS PASSED");
    assert.equal(fixedBody.runner, "subprocess");
  });
  it("runs the duration-repair fixture and returns the failing case instead of grading hidden output", async () => {
    const starter =
      'function formatDuration(totalSeconds) {\n' +
      '  const minutes = Math.floor(totalSeconds / 60);\n' +
      '  const seconds = totalSeconds % 60;\n' +
      '  return minutes + ":" + seconds;\n' +
      '}\nmodule.exports = { formatDuration };\n';
    const suite = `const { formatDuration } = require("./src/duration.js");
const cases = [["zero seconds", 0, "0:00"], ["short remainder", 123, "2:03"], ["two-digit remainder", 610, "10:10"]];
let failed = 0;
for (const [name, input, expected] of cases) {
  const actual = formatDuration(input);
  if (actual === expected) console.log("ok   " + name);
  else { failed++; console.log("FAIL " + name); console.log("       input:    " + input); console.log("       expected: " + JSON.stringify(expected)); console.log("       actual:   " + JSON.stringify(actual)); }
}
console.log(failed === 0 ? "ALL TESTS PASSED" : failed + " of " + cases.length + " tests failed");
process.exit(failed === 0 ? 0 : 1);
`;
    const submit = (content) =>
      app.inject(
        as({
          language: "node",
          files: [
            { path: "src/duration.js", content },
            { path: "verify-duration.js", content: suite },
          ],
          command: ["node", "verify-duration.js"],
          limits: { timeoutMs: 20000 },
        })
      );

    const broken = await submit(starter);
    assert.equal(broken.statusCode, 200, broken.body);
    assert.notEqual(broken.json().exitCode, 0);
    assert.match(broken.json().stdout, /FAIL zero seconds/);
    assert.match(broken.json().stdout, /expected: "0:00"/);
    assert.match(broken.json().stdout, /actual:   "0:0"/);

    const repaired = `function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}
module.exports = { formatDuration };
`;
    const fixed = await submit(repaired);
    assert.equal(fixed.statusCode, 200, fixed.body);
    assert.equal(fixed.json().exitCode, 0, fixed.json().stderr);
    assert.match(fixed.json().stdout, /ALL TESTS PASSED/);
    assert.equal(fixed.json().stdout.match(/ok   /g)?.length, 3);
  });
  it("reproduces the new-workspace crash while keeping existing-project cases in the same fixture", async () => {
    const starter =
      'function dashboardTitle(tasks) {\n' +
      '  return "First: " + tasks[0].title;\n' +
      '}\nmodule.exports = { dashboardTitle };\n';
    const suite = `const { dashboardTitle } = require("./src/dashboard.js");
const cases = [["saved sample workspace", [{ title: "Fix startup" }], "First: Fix startup"], ["workspace just created", [], "No tasks yet"], ["workspace with several tasks", [{ title: "Fix startup" }, { title: "Add a test" }], "First: Fix startup"]];
let failed = 0;
for (const [name, tasks, expected] of cases) {
  let actual;
  try { actual = dashboardTitle(tasks); } catch (error) { actual = "THREW " + error.name; }
  if (actual === expected) console.log("ok   " + name);
  else { failed++; console.log("FAIL " + name); console.log("       task count: " + tasks.length); console.log("       expected:   " + JSON.stringify(expected)); console.log("       actual:     " + JSON.stringify(actual)); }
}
console.log(failed === 0 ? "ALL TESTS PASSED" : failed + " of " + cases.length + " tests failed");
process.exit(failed === 0 ? 0 : 1);
`;
    const submit = (content) =>
      app.inject(
        as({
          language: "node",
          files: [
            { path: "src/dashboard.js", content },
            { path: "verify-dashboard.js", content: suite },
          ],
          command: ["node", "verify-dashboard.js"],
          limits: { timeoutMs: 20000 },
        })
      );

    const broken = await submit(starter);
    assert.equal(broken.statusCode, 200, broken.body);
    assert.notEqual(broken.json().exitCode, 0);
    assert.match(broken.json().stdout, /FAIL workspace just created/);
    assert.match(broken.json().stdout, /task count: 0/);
    assert.match(broken.json().stdout, /actual:     "THREW TypeError"/);
    assert.match(broken.json().stdout, /ok   saved sample workspace/);
    assert.match(broken.json().stdout, /ok   workspace with several tasks/);

    const repaired = `function dashboardTitle(tasks) {
  if (tasks.length === 0) return "No tasks yet";
  return "First: " + tasks[0].title;
}
module.exports = { dashboardTitle };
`;
    const fixed = await submit(repaired);
    assert.equal(fixed.statusCode, 200, fixed.body);
    assert.equal(fixed.json().exitCode, 0, fixed.json().stderr);
    assert.match(fixed.json().stdout, /ALL TESTS PASSED/);
    assert.equal(fixed.json().stdout.match(/ok   /g)?.length, 3);
  });

  it("a language with no runtime answers 503, not a learner-facing failure", {
    skip: GO_AVAILABLE ? "go is installed here" : false,
  }, async () => {
    const r = await app.inject(as({ language: "go", files: [{ path: "main.go", content: "package main" }] }));
    assert.equal(r.statusCode, 503);
    assert.match(r.body, /not installed/);
  });
});

describe("execution docker args + queue + quotas", () => {
  it("docker args lock down the container", () => {
    const job = execValidate.validateJob({
      language: "node",
      files: [{ path: "main.js", content: "1" }],
      command: ["node", "main.js"],
      limits: { memoryMb: 128 },
    });
    const args = execDocker.buildDockerArgs(job, "/tmp/w");
    const has = (...xs) => xs.every((x) => args.includes(x));
    assert.ok(has("run", "--rm", "--network", "none", "--read-only"));
    assert.ok(has("--memory", "128m", "--memory-swap", "128m", "--pids-limit", "64", "--cpus", "0.5"));
    assert.ok(args.includes("node:22-alpine"));
    assert.ok(has("-v", "/tmp/w:/work:rw", "-w", "/work", "node", "main.js"));
    assert.ok(!args.join(" ").includes("SECRET_FOR_TEST"));
    // Interpreters need no executable /tmp.
    assert.ok(args.includes("/tmp:rw,noexec,size=64m"));
    // Capability dropping and no-privilege-escalation apply to every language.
    assert.ok(has("--cap-drop", "ALL", "--security-opt", "no-new-privileges"));
  });
  it("go containers trade --read-only for a usable, prewarmed build cache", () => {
    const job = execValidate.validateJob({
      language: "go",
      files: [{ path: "main.go", content: "package main" }],
      limits: { memoryMb: 256 },
    });
    const args = execDocker.buildDockerArgs(job, "/tmp/w");
    const has = (...xs) => xs.every((x) => args.includes(x));
    assert.ok(args.includes("nexora-go-runner:1"));
    // Go compiles a binary and runs it: /tmp must be writable AND executable.
    // Docker's tmpfs defaults include noexec, so `exec` is requested explicitly.
    assert.ok(args.includes("/tmp:rw,exec,size=512m"));
    assert.ok(!args.join(" ").includes("noexec"));
    // Deliberate: a read-only root would discard the image's prewarmed Go
    // build cache, so Go jobs keep the isolation that matters (no network,
    // dropped capabilities, no escalation, cgroup caps) and write only into
    // the container layer that --rm destroys.
    assert.ok(!args.includes("--read-only"));
    assert.ok(has("--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges"));
    assert.ok(has("--memory", "256m", "--memory-swap", "256m"));
    // The compiler forks per package: the interpreter-sized pid cap starves it.
    assert.ok(has("--pids-limit", "256", "GOMAXPROCS=2"));
    // The image's own GOCACHE must not be overridden, or the prewarm is wasted.
    assert.ok(!args.join(" ").includes("GOCACHE"), "GOCACHE must come from the image");
  });
  it("queue bounds concurrency FIFO", async () => {
    const q = new execQueue.JobQueue(2);
    const order = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        q.run(async () => {
          order.push(i);
          await new Promise((r) => setTimeout(r, 60));
          return i;
        })
      )
    );
    assert.ok(q.maxObserved.n <= 2);
    assert.deepEqual(order, [1, 2, 3, 4, 5]);
  });
  it("runs Go in a real container with the prewarmed cache", {
    // Say which of the two it is: a stopped daemon and a missing image look
    // identical from here, and the fix is different for each.
    skip: GO_IMAGE_READY
      ? false
      : DOCKER_READY
        ? "nexora-go-runner:1 not built (docker build -t nexora-go-runner:1 images/go-runner)"
        : "no Docker daemon reachable",
  }, async () => {
    const job = execValidate.validateJob({
      language: "go",
      files: [
        {
          path: "main.go",
          content: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(6 * 7)\n}\n',
        },
      ],
      limits: { timeoutMs: 30000 },
    });
    const t0 = Date.now();
    const r = await execDocker.runDocker(job);
    const ms = Date.now() - t0;
    assert.equal(r.runner, "docker");
    assert.equal(r.timedOut, false, `timed out: ${r.stderr}`);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout.trim(), "42");
    // The prewarm is the whole point of the custom image: a cold standard
    // library build inside a 0.5-CPU container does not fit the 20s wall clock
    // that Go jobs get by default.
    assert.ok(ms < 30000, `container run took ${ms}ms`);
    process.stdout.write(`      (go container run: ${ms}ms)\n`);
  });
  it("quotas cap daily use and concurrency", () => {
    const q = new execQuotas.Quotas(2, 1);
    assert.equal(q.remaining("u"), 2);
    assert.equal(q.check("u"), null);
    const r1 = q.acquire("u");
    assert.equal(q.remaining("u"), 1);
    assert.match(q.check("u") ?? "", /concurrent/);
    r1();
    assert.equal(q.check("u"), null);
    const r2 = q.acquire("u");
    assert.equal(q.remaining("u"), 0);
    r2();
    assert.match(q.check("u") ?? "", /Daily/);
  });
  it("capabilities and 200/429 responses report the authenticated account's exact remaining quota", async () => {
    const routes = await import("../services/execution/dist/routes.js");
    const app = await kit.createService("test-execution-quota");
    const quotas = new execQuotas.Quotas(1, 2);
    routes.registerExecutionRoutes(app, {
      queue: new execQueue.JobQueue(1),
      quotas,
      runner: "subprocess",
    });
    await app.ready();
    try {
      const caps = (userId) =>
        app.inject({ method: "GET", url: "/capabilities", headers: { "x-user-id": userId } });
      assert.equal((await caps("quota-a")).json().dailyRemaining, 1);
      assert.equal((await caps("quota-b")).json().dailyRemaining, 1);

      const payload = {
        language: "node",
        files: [{ path: "main.js", content: 'console.log("ok")' }],
      };
      const first = await app.inject({
        method: "POST",
        url: "/execute",
        headers: { "x-user-id": "quota-a", "content-type": "application/json" },
        payload,
      });
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(first.headers["x-execution-daily-remaining"], "0");
      assert.equal((await caps("quota-a")).json().dailyRemaining, 0);
      assert.equal((await caps("quota-b")).json().dailyRemaining, 1);

      const exhausted = await app.inject({
        method: "POST",
        url: "/execute",
        headers: { "x-user-id": "quota-a", "content-type": "application/json" },
        payload,
      });
      assert.equal(exhausted.statusCode, 429);
      assert.equal(exhausted.headers["x-execution-daily-remaining"], "0");
    } finally {
      await app.close();
    }
  });
});


describe("curriculum service (in-process)", () => {
  let app;
  before(async () => {
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/curriculum/dist/routes.js");
    app = await kit.createService("test-curriculum");
    routes.registerCurriculumRoutes(app);
    await app.ready();
  });
  it("version + stages + missions", async () => {
    const v = await app.inject({ method: "GET", url: "/version" });
    assert.equal(v.statusCode, 200);
    const body = v.json();
    assert.equal(body.missions, 46);
    assert.equal(body.stages, 15);
    assert.match(body.version, /^[0-9a-f]{12}$/);
    const m = await app.inject({ method: "GET", url: "/missions?stage=css" });
    assert.equal(m.json().missions.length, 8);
    // The foundations layer travels with the curriculum too, in path order: it
    // is the first thing the tutor and the progress service reason about for a
    // learner who has just placed into the language layer.
    const goBasics = await app.inject({ method: "GET", url: "/missions?stage=go-basics" });
    assert.deepEqual(
      goBasics.json().missions.map((x) => x.id),
      ["go-first-program", "go-values", "go-control-flow", "go-functions"]
    );
    // The scenario layer travels with the curriculum: a mission the services
    // cannot see is a mission the tutor and progress cannot speak about.
    const git = await app.inject({ method: "GET", url: "/missions?stage=git" });
    assert.deepEqual(
      git.json().missions.map((x) => x.id),
      ["git-resolve-conflict", "scenario-duration-format", "scenario-new-workspace-crash"]
    );
  });
  it("diagnostic items never include answer keys", async () => {
    const r = await app.inject({ method: "GET", url: "/diagnostic/items" });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().items.length, 9);
    for (const item of r.json().items) {
      assert.equal("answer" in item, false);
      assert.ok(Array.isArray(item.options) && item.options.length > 1);
    }
  });
  it("mission detail is complete; unknown id 404s; version header present", async () => {
    const r = await app.inject({ method: "GET", url: "/missions/js-counter" });
    assert.equal(r.statusCode, 200);
    assert.ok(r.json().mission.checks[0].rule);
    assert.equal(r.headers["x-content-version"]?.length, 12);
    const n = await app.inject({ method: "GET", url: "/missions/nope" });
    assert.equal(n.statusCode, 404);
  });
});

describe("tutor service (in-process, no pg)", () => {
  let app;
  before(async () => {
    delete process.env.NEXORA_AI_URL;
    delete process.env.NEXORA_AI_KEY;
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/tutor/dist/routes.js");
    app = await kit.createService("test-tutor");
    routes.registerTutorRoutes(app, null);
    await app.ready();
  });
  it("falls back to the authored ladder, honestly labeled", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/ask",
      headers: { "x-user-id": "u1", "content-type": "application/json" },
      payload: { missionId: "first-page", failingChecks: ["missing h1"], hintLevel: 2 },
    });
    assert.equal(r.statusCode, 200);
    const body = r.json();
    assert.equal(body.source, "curriculum");
    assert.match(body.text, /Concept \(level 2 of 5\)/);
  });
  it("401 without user, 404 for unknown mission", async () => {
    const r1 = await app.inject({
      method: "POST",
      url: "/ask",
      headers: { "content-type": "application/json" },
      payload: { missionId: "first-page" },
    });
    assert.equal(r1.statusCode, 401);
    const r2 = await app.inject({
      method: "POST",
      url: "/ask",
      headers: { "x-user-id": "u1", "content-type": "application/json" },
      payload: { missionId: "nope" },
    });
    assert.equal(r2.statusCode, 404);
  });
});

describe("billing webhooks (in-process, fake pg)", () => {
  let app;
  const seen = [];
  const seenEvents = new Set();
  const fakePool = {
    query: async (sql, params) => {
      seen.push({ sql: sql.slice(0, 60), params });
      if (sql.startsWith("SELECT 1 FROM billing_events")) {
        const has = seenEvents.has(params[0]);
        return { rows: has ? [{}] : [], rowCount: has ? 1 : 0 };
      }
      if (sql.startsWith("INSERT INTO billing_events")) {
        seenEvents.add(params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT 1")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM billing_subscriptions")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
  before(async () => {
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET = "whsec-test-1234567890";
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/billing/dist/routes.js");
    app = await kit.createService("test-billing");
    routes.registerBillingRoutes(app, fakePool, new Map([["pro", { productId: "pdt_x", name: "Pro" }]]));
    await app.ready();
  });
  it("plans listed; checkout without provider key 503s clearly", async () => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    const p = await app.inject({ method: "GET", url: "/plans", headers: { "x-user-id": "u" } });
    assert.deepEqual(p.json().plans, [{ slug: "pro", name: "Pro" }]);
    const c = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: { "x-user-id": "u", "content-type": "application/json" },
      payload: { plan: "pro", email: "a@b.co" },
    });
    assert.equal(c.statusCode, 503);
    assert.equal(c.json().error.code, "billing_not_configured");
  });
  it("rejects unsigned, tampered, stale, and mis-versioned webhooks", async () => {
    const raw = JSON.stringify({ business_id: "b1", type: "subscription.active", timestamp: "2026-01-01T00:00:00Z", data: {} });
    const id = "evt_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const good = signTestVector("whsec-test-1234567890", id, ts, raw);
    const base = { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts };
    const noSig = await app.inject({ method: "POST", url: "/webhooks/dodo", headers: base, payload: raw });
    assert.equal(noSig.statusCode, 401);
    const tampered = await app.inject({
      method: "POST", url: "/webhooks/dodo",
      headers: { ...base, "webhook-signature": good }, payload: raw + " ",
    });
    assert.equal(tampered.statusCode, 401);
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    const staleSig = signTestVector("whsec-test-1234567890", id, oldTs, raw);
    const stale = await app.inject({
      method: "POST", url: "/webhooks/dodo",
      headers: { ...base, "webhook-timestamp": oldTs, "webhook-signature": staleSig }, payload: raw,
    });
    assert.equal(stale.statusCode, 401);
    const wrongKey = signTestVector("other-secret", id, ts, raw);
    const wrong = await app.inject({
      method: "POST", url: "/webhooks/dodo",
      headers: { ...base, "webhook-signature": wrongKey }, payload: raw,
    });
    assert.equal(wrong.statusCode, 401);
  });
  it("accepts a valid subscription.active and records entitlement state", async () => {
    const payload = {
      business_id: "b1",
      type: "subscription.active",
      timestamp: new Date().toISOString(),
      data: { id: "sub_1", metadata: { user_id: "u9", plan: "pro" }, current_period_end: "2027-01-01T00:00:00Z" },
    };
    const raw = JSON.stringify(payload);
    const id = "evt_2";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signTestVector("whsec-test-1234567890", id, ts, raw);
    const res = await app.inject({
      method: "POST", url: "/webhooks/dodo",
      headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig },
      payload: raw,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true });
    const upsert = seen.find((s) => s.sql.includes("billing_subscriptions"));
    assert.ok(upsert, "subscription upsert issued");
    assert.deepEqual(upsert.params.slice(0, 3), ["u9", "pro", "active"]);
    const again = await app.inject({
      method: "POST", url: "/webhooks/dodo",
      headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig },
      payload: raw,
    });
    assert.deepEqual(again.json(), { ok: true, duplicate: true });
  });
  it("loadPlans validates operator config", () => {
    process.env.BILLING_PLANS_JSON = JSON.stringify({ pro: { product_id: "pdt_1", name: "Pro" } });
    assert.equal(loadPlans().get("pro")?.productId, "pdt_1");
    process.env.BILLING_PLANS_JSON = "{bad json";
    assert.throws(() => loadPlans(), /valid JSON/);
    process.env.BILLING_PLANS_JSON = JSON.stringify({ pro: { name: "x" } });
    assert.throws(() => loadPlans(), /product_id/);
    delete process.env.BILLING_PLANS_JSON;
  });
  it("webhook signatures follow the vendor key derivation (whsec_ + base64)", async () => {
    // Genuine Dodo secrets are base64 after the whsec_ prefix, and the HMAC
    // key is the DECODED bytes. A signature made with the raw secret string
    // must fail — that is exactly the bug that would accept our own test
    // vectors while rejecting every real delivery.
    const { createHmac, randomBytes: rb } = await import("node:crypto");
    const vendorSecret = "whsec_" + rb(24).toString("base64");
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET = vendorSecret;
    const raw = JSON.stringify({ business_id: "b1", type: "payment.succeeded", timestamp: "2026-01-01T00:00:00Z", data: {} });
    const id = "evt_vendor";
    const ts = String(Math.floor(Date.now() / 1000));
    const decoded = Buffer.from(vendorSecret.slice("whsec_".length), "base64");
    const genuine = "v1," + createHmac("sha256", decoded).update(`${id}.${ts}.${raw}`).digest("base64");
    const rawKey = "v1," + createHmac("sha256", vendorSecret).update(`${id}.${ts}.${raw}`).digest("base64");
    const base = { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts };
    const okRes = await app.inject({ method: "POST", url: "/webhooks/dodo", headers: { ...base, "webhook-signature": genuine }, payload: raw });
    assert.equal(okRes.statusCode, 200);
    const badRes = await app.inject({ method: "POST", url: "/webhooks/dodo", headers: { ...base, "webhook-signature": rawKey }, payload: raw });
    assert.equal(badRes.statusCode, 401);
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET = "whsec-test-1234567890";
  });
  it("a replayed event changes state once, not twice", async () => {
    seen.length = 0;
    const payload = {
      business_id: "b1",
      type: "subscription.active",
      timestamp: new Date().toISOString(),
      data: { id: "sub_replay", metadata: { user_id: "u-replay", plan: "pro" } },
    };
    const raw = JSON.stringify(payload);
    const id = "evt_replay";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signTestVector("whsec-test-1234567890", id, ts, raw);
    const headers = {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": sig,
    };
    const first = await app.inject({ method: "POST", url: "/webhooks/dodo", headers, payload: raw });
    const replay = await app.inject({ method: "POST", url: "/webhooks/dodo", headers, payload: raw });
    assert.equal(first.json().ok, true);
    assert.deepEqual(replay.json(), { ok: true, duplicate: true });
    const upserts = seen.filter((s) => s.sql.includes("billing_subscriptions"));
    assert.equal(upserts.length, 1, "the replay must not re-apply the subscription");
  });
});

describe("billing subscription view (in-process, fake pg)", () => {
  let app;
  let row = null;
  const ids = [];
  const fakePool = {
    query: async (sql, params) => {
      ids.push(params?.[0]);
      if (sql.startsWith("SELECT * FROM billing_subscriptions")) {
        return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  before(async () => {
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/billing/dist/routes.js");
    app = await kit.createService("test-billing-view");
    routes.registerBillingRoutes(app, fakePool, new Map());
    await app.ready();
  });
  const sub = (status) => {
    row = { plan: "pro", status, current_period_end: new Date("2027-01-01T00:00:00Z") };
    return app.inject({ method: "GET", url: "/subscription", headers: { "x-user-id": "u" } });
  };
  it("active entitles; past_due keeps access through the grace period", async () => {
    assert.equal((await sub("active")).json().subscription.entitled, true);
    assert.equal((await sub("past_due")).json().subscription.entitled, true);
  });
  it("on_hold, expired, cancelled and failed do not entitle; nobody gets nothing", async () => {
    for (const s of ["on_hold", "expired", "cancelled", "failed", "unknown"]) {
      assert.equal((await sub(s)).json().subscription.entitled, false, s);
    }
    row = null;
    const none = await app.inject({ method: "GET", url: "/subscription", headers: { "x-user-id": "u" } });
    assert.deepEqual(none.json().subscription, { plan: null, status: null, entitled: false, currentPeriodEnd: null });
  });
  it("reads only the authenticated account's row, never a client-supplied id", async () => {
    row = { plan: "pro", status: "active", current_period_end: null };
    ids.length = 0;
    const res = await app.inject({
      method: "GET",
      url: "/subscription",
      headers: { "x-user-id": "u-me", "x-query-user": "victim" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(ids, ["u-me"]);
  });
});

describe("billing customer portal (in-process, fake pg, fake provider)", () => {
  let app;
  let customerId = null;
  let calls = [];
  let realFetch;
  let realKey;
  let realBase;
  let queries = [];
  const fakePool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT dodo_customer_id FROM billing_subscriptions")) {
        return customerId
          ? { rows: [{ dodo_customer_id: customerId }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const okProvider = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ link: "https://test.dodopayments.com/portal/sess_1" }),
      text: async () => "",
    };
  };
  before(async () => {
    realFetch = globalThis.fetch;
    realKey = process.env.DODO_PAYMENTS_API_KEY;
    realBase = process.env.DODO_PAYMENTS_BASE;
    globalThis.fetch = okProvider;
    const routes = await import("../services/billing/dist/routes.js");
    app = await kit.createService("test-billing-portal");
    routes.registerBillingRoutes(app, fakePool, new Map());
    await app.ready();
  });
  after(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.DODO_PAYMENTS_API_KEY;
    else process.env.DODO_PAYMENTS_API_KEY = realKey;
    if (realBase === undefined) delete process.env.DODO_PAYMENTS_BASE;
    else process.env.DODO_PAYMENTS_BASE = realBase;
  });
  const post = (body) =>
    app.inject({
      method: "POST",
      url: "/portal",
      headers: { "x-user-id": "u", "content-type": "application/json" },
      payload: body ?? {},
    });

  it("explains a learner with no customer record instead of minting a dead link", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    customerId = null;
    calls = [];
    const res = await post({});
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, "no_billing_customer");
    assert.equal(calls.length, 0, "never calls the provider without a stored customer");
  });

  it("mints a portal link for the stored customer, return url as a query parameter", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    process.env.DODO_PAYMENTS_BASE = "https://test.dodopayments.com";
    customerId = "cus_123";
    calls = [];
    const res = await post({ returnUrl: "https://nexora.example/profile" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().portalUrl, "https://test.dodopayments.com/portal/sess_1");
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.Authorization, "Bearer test_key");
    assert.ok(
      call.url.startsWith("https://test.dodopayments.com/customers/cus_123/customer-portal/session"),
      `portal path: ${call.url}`
    );
    // A returning learner must land back at the app, and the return url is a
    // query parameter (the endpoint takes no body) — encoded, not raw.
    assert.ok(call.url.includes("return_url=https%3A%2F%2Fnexora.example%2Fprofile"), call.url);
    assert.equal(call.init.body, undefined, "the portal endpoint takes no body");
  });

  it("omits the query entirely when there is no return url", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    customerId = "cus_123";
    calls = [];
    const res = await post({});
    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].url, "https://test.dodopayments.com/customers/cus_123/customer-portal/session");
  });

  it("refuses to call the provider at all when payments are unconfigured", async () => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    customerId = "cus_123";
    calls = [];
    const res = await post({});
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, "billing_not_configured");
    assert.equal(calls.length, 0);
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
  });

  it("reports an upstream failure as 502 without echoing provider detail", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    customerId = "cus_123";
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "internal provider stack trace",
    });
    const res = await post({});
    globalThis.fetch = okProvider;
    assert.equal(res.statusCode, 502);
    const body = res.json();
    assert.equal(body.error.code, "billing_upstream");
    assert.doesNotMatch(JSON.stringify(body), /stack trace/, "provider detail stays server-side");
  });

  it("refuses an unauthenticated caller and never touches the provider", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    customerId = "cus_123";
    calls = [];
    const res = await app.inject({
      method: "POST",
      url: "/portal",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(res.statusCode, 401);
    assert.equal(calls.length, 0);
  });

  it("cannot name someone else's customer: the stored id is the only source", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    customerId = "cus_ours";
    calls = [];
    queries = [];
    // A learner who guesses a customer id in the body must not reach it.
    const res = await post({ customerId: "cus_victim", customer_id: "cus_victim", customer: "cus_victim" });
    assert.equal(res.statusCode, 200);
    assert.ok(calls[0].url.includes("/customers/cus_ours/"), calls[0].url);
    assert.ok(!calls[0].url.includes("cus_victim"), "a body field must never choose the customer");
    // The lookup is scoped by the authenticated id, not a client value.
    const lookup = queries.find((q) => q.sql.startsWith("SELECT dodo_customer_id"));
    assert.deepEqual(lookup.params, ["u"]);
  });
});

describe("auth link (in-process, fake pg)", () => {
  let app;
  const users = new Map();
  const fakePool = {
    query: async (sql, params) => {
      if (sql.startsWith("SELECT id, email, name, created_at FROM users WHERE id =")) {
        const u = users.get(params[0]);
        return u ? { rows: [u], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT id FROM users WHERE lower(email)")) {
        const hit = [...users.values()].find((u) => u.email.toLowerCase() === params[0]);
        return hit ? { rows: [{ id: hit.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT * FROM users WHERE lower(email)")) {
        const hit = [...users.values()].find((u) => u.email.toLowerCase() === params[0]);
        return hit ? { rows: [{ ...hit, password_hash: hit.passwordHash ?? null }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO users")) {
        const u = { id: params[0], email: params[1], name: params[2], created_at: new Date("2026-01-01T00:00:00Z") };
        users.set(u.id, u);
        return { rows: [u], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  before(async () => {
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/auth/dist/routes.js");
    app = await kit.createService("test-auth-link");
    routes.registerAuthRoutes(app, fakePool);
    await app.ready();
  });
  it("first sight creates a passwordless clerk row; replay is idempotent and rewrites nothing", async () => {
    const first = await app.inject({
      method: "POST", url: "/link",
      headers: { "x-user-id": "user_clerk1", "content-type": "application/json" },
      payload: { email: "Ada@Example.com", name: "Ada" },
    });
    assert.equal(first.statusCode, 201);
    assert.deepEqual(first.json(), {
      user: { id: "user_clerk1", email: "ada@example.com", name: "Ada", createdAt: "2026-01-01T00:00:00.000Z" },
      linked: true,
    });
    const replay = await app.inject({
      method: "POST", url: "/link",
      headers: { "x-user-id": "user_clerk1", "content-type": "application/json" },
      payload: { email: "someone-else@example.com" },
    });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().linked, false);
    assert.equal(replay.json().user.email, "ada@example.com");
  });
  it("a taken email 409s instead of merging two identities", async () => {
    const clash = await app.inject({
      method: "POST", url: "/link",
      headers: { "x-user-id": "user_clerk2", "content-type": "application/json" },
      payload: { email: "ada@example.com" },
    });
    assert.equal(clash.statusCode, 409);
    assert.equal(clash.json().error.code, "conflict");
  });
  it("password login against a clerk row fails closed with the same 401", async () => {
    const login = await app.inject({
      method: "POST", url: "/login",
      headers: { "content-type": "application/json" },
      payload: { email: "ada@example.com", password: "whatever-password" },
    });
    assert.equal(login.statusCode, 401);
    assert.equal(login.json().error.code, "invalid_credentials");
  });
  it("link without identity is refused, not provisioned", async () => {
    const anon = await app.inject({
      method: "POST", url: "/link",
      headers: { "content-type": "application/json" },
      payload: { email: "anon@example.com" },
    });
    assert.equal(anon.statusCode, 401);
  });
});

describe("progress state + reset (in-process, fake pg)", () => {
  let app;
  const seen = [];
  const now = new Date();
  const fakePool = {
    query: async (sql, params) => {
      seen.push({ sql: sql.trim(), params });
      if (sql.includes("SUM(xp_awarded)")) return { rows: [{ xp: "250" }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM profiles")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT * FROM diagnostics")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT * FROM mission_progress"))
        return {
          rows: [
            {
              mission_id: "first-page",
              content_version: "v-test",
              code: "<h1>x</h1>",
              started_at: now,
              attempts: 2,
              checks_passed: ["one-h1"],
              hints_used: 1,
              max_hint_level: 1,
              questions: { answered: {}, correct: {} },
              completed_at: now,
              mastered_at: now,
              independent: true,
              xp_awarded: 250,
            },
          ],
          rowCount: 1,
        };
      if (sql.startsWith("SELECT * FROM evidence"))
        return { rows: [{ competency_id: "html-structure", level: "demonstrated", evidence: ["note"] }], rowCount: 1 };
      if (sql.startsWith("DELETE FROM")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  before(async () => {
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/progress/dist/routes.js");
    app = await kit.createService("test-progress");
    routes.registerProgressRoutes(app, fakePool);
    await app.ready();
  });
  it("GET /state returns full learner state + derived xp; 401 without user", async () => {
    const anon = await app.inject({ method: "GET", url: "/state" });
    assert.equal(anon.statusCode, 401);
    const r = await app.inject({ method: "GET", url: "/state", headers: { "x-user-id": "u1" } });
    assert.equal(r.statusCode, 200);
    const { state, savedAt } = r.json();
    assert.equal(state.version, 1);
    assert.equal(state.xp, 250);
    assert.ok(state.missions["first-page"].completedAt, "mission restored");
    assert.equal(state.missions["first-page"].xpAwarded, 250);
    assert.equal(state.missions["first-page"].checksPassed[0], "one-h1");
    assert.equal(state.competencies["html-structure"].level, "demonstrated");
    assert.equal(state.profile.completedAt, null);
    assert.equal(state.diagnostic.completedAt, null);
    assert.ok(savedAt, "savedAt present");
  });
  it("DELETE /state wipes every progress table for that user only", async () => {
    seen.length = 0;
    const r = await app.inject({ method: "DELETE", url: "/state", headers: { "x-user-id": "u1" } });
    assert.equal(r.statusCode, 200);
    const deletes = seen.filter((s) => s.sql.startsWith("DELETE FROM"));
    // `mission_runs` is in this list because a learner's run history is their
    // data: an erase that left the transcripts behind would not be an erase.
    assert.deepEqual(deletes.map((d) => d.sql), [
      "DELETE FROM mission_runs WHERE user_id = $1",
      "DELETE FROM mission_progress WHERE user_id = $1",
      "DELETE FROM evidence WHERE user_id = $1",
      "DELETE FROM diagnostics WHERE user_id = $1",
      "DELETE FROM profiles WHERE user_id = $1",
    ]);
    for (const d of deletes) assert.deepEqual(d.params, ["u1"]);
    assert.ok(seen.some((s) => s.sql === "COMMIT"), "committed");
  });
});

/* Execution checks are the only checks that prove someone can write and run a
   program, and progress is uploaded by the learner's own device — so until now
   a client could claim a Go pass it never earned. These two suites are the
   other half of that story: the execution service signs what it ran, and the
   progress service refuses to complete anything it cannot recompute from that
   signature. */
describe("run receipts: the execution service signs what it ran", () => {
  let app;
  const KEY = "test-receipt-key-execution";
  const saved = process.env.INTERNAL_API_KEY;

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const routes = await import("../services/execution/dist/routes.js");
    app = await kit.createService("test-execution-receipts");
    routes.registerExecutionRoutes(app, {
      queue: new execQueue.JobQueue(1),
      quotas: new execQuotas.Quotas(50, 2),
      runner: "subprocess",
    });
    await app.ready();
  });
  after(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = saved;
  });

  const SOURCE = ['console.log("signed");', ""].join("\n");
  const runNode = () =>
    app.inject({
      method: "POST",
      url: "/execute",
      headers: {
        "x-user-id": "u-receipt",
        "content-type": "application/json",
        "x-internal-key": KEY,
      },
      payload: { language: "node", files: [{ path: "main.js", content: SOURCE }] },
    });

  it("signs the run it performed, and the signature covers every fact", async () => {
    const r = await runNode();
    assert.equal(r.statusCode, 200, r.body);
    const { receipt, stdout } = r.json();
    assert.equal(stdout.trim(), "signed");
    assert.equal(receipt?.v, 1, "the response carries a receipt");
    const payload = contracts.runReceiptPayload(receipt.facts, receipt.issuedAt);
    assert.equal(kit.verifyReceiptSignature(payload, receipt.sig, KEY), true);
    // The output is inside the signature: editing it after the fact does not
    // survive, which is the property the completion gate leans on.
    const edited = { ...receipt.facts, stdout: "signed\nand more\n" };
    assert.equal(
      kit.verifyReceiptSignature(
        contracts.runReceiptPayload(edited, receipt.issuedAt),
        receipt.sig,
        KEY
      ),
      false
    );
    // The timestamp is signed too, so an old run cannot be re-dated to look new.
    const reDated = new Date(Date.now() - 60_000).toISOString();
    assert.equal(
      kit.verifyReceiptSignature(
        contracts.runReceiptPayload(receipt.facts, reDated),
        receipt.sig,
        KEY
      ),
      false
    );
    // And no other key could have produced it.
    assert.equal(kit.verifyReceiptSignature(payload, receipt.sig, "another-key"), false);
    assert.equal(
      kit.verifyReceiptSignature(
        contracts.runReceiptPayload(receipt.facts, receipt.issuedAt),
        "0".repeat(64),
        KEY
      ),
      false
    );
    // Bound to the exact bytes submitted: the run is tied to this program.
    assert.deepEqual(receipt.facts.files, [{ path: "main.js", sha256: kit.codeSha256(SOURCE) }]);
  });

  it("issues no receipt when there is no key to sign with, rather than faking proof", async () => {
    delete process.env.INTERNAL_API_KEY;
    try {
      const r = await runNode();
      assert.equal(r.statusCode, 200);
      assert.equal("receipt" in r.json(), false, "an unsigned run is never dressed up as verified");
    } finally {
      process.env.INTERNAL_API_KEY = KEY;
    }
  });
});

describe("completion is decided by the platform's own record", () => {
  const KEY = "test-receipt-key-progress";
  const saved = process.env.INTERNAL_API_KEY;
  const SOLUTION = [
    "package main",
    "",
    'import "fmt"',
    "",
    "func main() {",
    '\tfmt.Println("Hello, Go")',
    "}",
    "",
  ].join("\n");

  let app;
  let mission;
  let draft = null;
  const writes = [];

  const draftRow = ({ code, checksPassed }) => ({
    mission_id: "go-first-program",
    content_version: "v-test",
    code,
    started_at: new Date(),
    attempts: 1,
    checks_passed: checksPassed,
    hints_used: 0,
    max_hint_level: 0,
    questions: { answered: {}, correct: {} },
    completed_at: null,
    mastered_at: null,
    independent: false,
    xp_awarded: 0,
  });
  const setDraft = (opts) => {
    draft = draftRow(opts);
  };

  /* A pg stand-in holding one mission row, so the completion path runs for
     real: same route, same verification, same transaction shape. */
  const pool = {
    query: async (sql, params) => {
      writes.push({ sql: sql.trim(), params });
      if (sql.startsWith("SELECT * FROM mission_progress")) {
        return { rows: draft ? [draft] : [], rowCount: draft ? 1 : 0 };
      }
      if (sql.startsWith("SELECT * FROM evidence")) return { rows: [], rowCount: 0 };
      if (sql.includes("SUM(xp_awarded)")) return { rows: [{ xp: "100" }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO mission_progress")) {
        draft = { ...draft, completed_at: params[10], mastered_at: params[11], xp_awarded: params[13] };
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const routes = await import("../services/progress/dist/routes.js");
    const missions = await import("../services/progress/dist/vendor/missions.js");
    mission = missions.missionById("go-first-program");
    app = await kit.createService("test-progress-receipts");
    routes.registerProgressRoutes(app, pool);
    await app.ready();
  });
  after(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = saved;
  });

  /** A genuine receipt, produced by the same code the execution service runs. */
  const receiptFor = ({ code, stdout, exitCode = 0, issuedAt, key = KEY }) => {
    const job = execValidate.validateJob({
      language: "go",
      files: [{ path: "main.go", content: code }],
    });
    return execReceipt.mintReceipt(
      job,
      {
        stdout,
        stderr: "",
        exitCode,
        timedOut: false,
        truncated: false,
        durationMs: 15,
        runner: "subprocess",
        diagnostics: [],
        phase: "run",
      },
      key,
      issuedAt ? new Date(issuedAt) : new Date()
    );
  };
  const completeAt = (missionId, body) =>
    app.inject({
      method: "POST",
      url: `/missions/${missionId}/complete`,
      // Both headers the gateway sends: identity, and the mesh key that
      // authenticates a service call. Nothing here is client-supplied in
      // production, which is the point.
      headers: { "x-user-id": "u-receipt", "x-internal-key": KEY },
      payload: body,
    });
  const complete = (body) => completeAt("go-first-program", body);
  const insertedChecks = () => {
    const ins = writes.filter((w) => w.sql.startsWith("INSERT INTO mission_progress")).pop();
    return ins ? ins.params[6] : null;
  };

  it("refuses a completion whose only evidence is the client's own pass list", async () => {
    writes.length = 0;
    setDraft({ code: SOLUTION, checksPassed: ["run-answer"] });
    const r = await complete({});
    assert.equal(r.statusCode, 422, r.body);
    assert.equal(r.json().error.code, "run_unverified");
    assert.match(r.json().error.message, /no record of a run/);
    assert.equal(draft.completed_at, null, "nothing was recorded as done");
  });

  it("refuses a receipt this platform did not issue", async () => {
    setDraft({ code: SOLUTION, checksPassed: [] });
    const forged = { ...receiptFor({ code: SOLUTION, stdout: "Hello, Go\n" }), sig: "0".repeat(64) };
    const r = await complete({ runs: [{ checkId: "run-answer", receipt: forged }] });
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /did not issue/);
    assert.equal(draft.completed_at, null);
  });

  it("refuses a run record whose output was edited after signing", async () => {
    setDraft({ code: SOLUTION, checksPassed: [] });
    // What the starter really printed, rewritten to look like the answer.
    const real = receiptFor({ code: SOLUTION, stdout: "TODO\n" });
    const edited = { ...real, facts: { ...real.facts, stdout: "Hello, Go\n" } };
    const r = await complete({ runs: [{ checkId: "run-answer", receipt: edited }] });
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /did not issue/);
    assert.equal(draft.completed_at, null);
  });

  it("refuses an old run — a receipt is evidence about now, not forever", async () => {
    setDraft({ code: SOLUTION, checksPassed: [] });
    const old = receiptFor({
      code: SOLUTION,
      stdout: "Hello, Go\n",
      issuedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    });
    const r = await complete({ runs: [{ checkId: "run-answer", receipt: old }] });
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /30 minutes/);
  });

  it("refuses a genuine receipt for a different program", async () => {
    setDraft({ code: SOLUTION, checksPassed: [] });
    const other = receiptFor({ code: "package main\n\nfunc main() {}\n", stdout: "Hello, Go\n" });
    const r = await complete({ runs: [{ checkId: "run-answer", receipt: other }] });
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /different code/);
  });

  it("decides on the runner's output, not on what the client claimed", async () => {
    setDraft({ code: mission.starterCode, checksPassed: ["run-answer"] });
    const starterRun = receiptFor({ code: mission.starterCode, stdout: "TODO\n" });
    const r = await complete({ runs: [{ checkId: "run-answer", receipt: starterRun }] });
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /did not meet/);
    assert.equal(draft.completed_at, null, "a claimed pass is not a pass");
  });

  it("completes on a genuine run of the learner's current code", async () => {
    writes.length = 0;
    setDraft({ code: SOLUTION, checksPassed: [] });
    const r = await complete({
      runs: [{ checkId: "run-answer", receipt: receiptFor({ code: SOLUTION, stdout: "Hello, Go\n" }) }],
    });
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.equal(body.completed, true);
    assert.deepEqual(body.verifiedChecks, ["run-answer"]);
    assert.ok(draft.completed_at, "completion was recorded");
    // The stored pass list is the one the server derived, not the client's.
    assert.deepEqual(insertedChecks(), ["run-answer"]);
  });

  it("cannot confirm a run with no signing key, and says so instead of trusting the claim", async () => {
    delete process.env.INTERNAL_API_KEY;
    try {
      setDraft({ code: SOLUTION, checksPassed: ["run-answer"] });
      const r = await complete({
        runs: [{ checkId: "run-answer", receipt: receiptFor({ code: SOLUTION, stdout: "Hello, Go\n" }) }],
      });
      assert.equal(r.statusCode, 503, r.body);
      assert.equal(r.json().error.code, "verification_unavailable");
      assert.match(r.json().error.message, /INTERNAL_API_KEY/);
      assert.equal(draft.completed_at, null);
    } finally {
      process.env.INTERNAL_API_KEY = KEY;
    }
});

/* A run that never became a completion used to leave nothing behind: the
   receipt was spent and discarded, so a learner who ran their program, closed
   the tab, and opened the mission on another device could not read back what
   they had tried — and neither could the attempt transcripts the IDE will one
   day show. These routes are the durable half of a run: the facts the
   execution service signed, kept against the mission they were run for. */
describe("submission history: every run the platform performed is kept", () => {
  const KEY = "test-receipt-key-history";
  const savedKey = process.env.INTERNAL_API_KEY;
  const SOLUTION = [
    "package main",
    "",
    'import "fmt"',
    "",
    "func main() {",
    '\tfmt.Println("Hello, Go")',
    "}",
    "",
  ].join("\n");

  let app;
  let mission;
  /** An in-memory stand-in for `mission_runs`, unique index included. */
  const rows = [];
  const seen = [];
  let draftCode = SOLUTION;
  let nextId = 1;

  const pool = {
    query: async (sql, params = []) => {
      const s = sql.trim();
      seen.push({ sql: s, params });
      if (s.startsWith("SELECT code FROM mission_progress")) {
        return draftCode === null
          ? { rows: [], rowCount: 0 }
          : { rows: [{ code: draftCode }], rowCount: 1 };
      }
      if (s.startsWith("INSERT INTO mission_runs")) {
        const [
          userId, missionId, checkIds, language, command, entryPath, entrySha256, draftSha256,
          stdout, stderr, exitCode, timedOut, truncated, durationMs, phase, diagnostics,
          runner, receiptSig, contentVersion, issuedAt,
        ] = params;
        const clash = rows.some(
          (r) => r.user_id === userId && r.mission_id === missionId && r.receipt_sig === receiptSig
        );
        if (clash) return { rows: [], rowCount: 0 }; // the unique index refuses it
        rows.push({
          id: nextId++, user_id: userId, mission_id: missionId, check_ids: checkIds, language,
          command, entry_path: entryPath, entry_sha256: entrySha256, draft_sha256: draftSha256,
          stdout, stderr, exit_code: exitCode, timed_out: timedOut, truncated, duration_ms: durationMs,
          phase, diagnostics: JSON.parse(diagnostics), runner, receipt_sig: receiptSig,
          content_version: contentVersion, issued_at: issuedAt, recorded_at: new Date(),
        });
        return { rows: [{ id: nextId - 1 }], rowCount: 1 };
      }
      if (s.startsWith("UPDATE mission_runs")) {
        const [userId, missionId, sig, added] = params;
        const row = rows.find(
          (r) => r.user_id === userId && r.mission_id === missionId && r.receipt_sig === sig
        );
        if (row) row.check_ids = [...new Set([...row.check_ids, ...added])];
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      if (s.includes("COUNT(*)::int AS n FROM mission_runs")) {
        const [userId, missionId] = params;
        return {
          rows: [{ n: rows.filter((r) => r.user_id === userId && r.mission_id === missionId).length }],
          rowCount: 1,
        };
      }
      if (s.startsWith("SELECT * FROM mission_runs")) {
        const [userId, missionId, third] = params;
        let list = rows.filter((r) => r.user_id === userId && r.mission_id === missionId);
        if (Array.isArray(third)) list = list.filter((r) => third.includes(r.receipt_sig));
        else if (typeof third === "number") list = list.slice(0, third);
        return { rows: list.slice().sort((a, b) => b.id - a.id), rowCount: list.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const routes = await import("../services/progress/dist/routes.js");
    const missions = await import("../services/progress/dist/vendor/missions.js");
    mission = missions.missionById("go-first-program");
    app = await kit.createService("test-progress-history");
    routes.registerProgressRoutes(app, pool);
    await app.ready();
  });
  after(() => {
    if (savedKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = savedKey;
  });

  const receiptFor = ({ code = SOLUTION, stdout = "Hello, Go\n", entry = "main.go", key = KEY }) => {
    const job = execValidate.validateJob({ language: "go", files: [{ path: entry, content: code }] });
    return execReceipt.mintReceipt(
      job,
      {
        stdout,
        stderr: "",
        exitCode: 0,
        timedOut: false,
        truncated: false,
        durationMs: 12,
        runner: "subprocess",
        diagnostics: [{ kind: "compile", file: "main.go", line: 3, column: 1, message: "example" }],
        phase: "run",
      },
      key,
      new Date()
    );
  };
  const record = (runs) =>
    app.inject({
      method: "POST",
      url: "/missions/go-first-program/runs",
      headers: { "x-user-id": "u-history", "x-internal-key": KEY },
      payload: { runs },
    });
  // Both headers the gateway sends: identity, and the mesh key that
  // authenticates every internal call. Neither is client-supplied in
  // production, which is the point.
  const history = (query = "") =>
    app.inject({
      method: "GET",
      url: `/missions/go-first-program/runs${query}`,
      headers: { "x-user-id": "u-history", "x-internal-key": KEY },
    });

  it("records a run the platform performed, and reads it back", async () => {
    rows.length = 0;
    seen.length = 0;
    const r = await record([{ checkId: "run-answer", receipt: receiptFor({}) }]);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.equal(body.stored, 1);
    assert.equal(body.duplicates, 0);
    assert.equal(body.total, 1);
    assert.equal(rows.length, 1, "one row for one run");
    assert.equal(rows[0].stdout, "Hello, Go\n");
    assert.equal(rows[0].language, "go");
    assert.equal(rows[0].entry_path, "main.go");
    assert.equal(rows[0].diagnostics[0].message, "example");
    assert.equal(rows[0].draft_sha256, kit.codeSha256(SOLUTION), "the draft it was run against");
    assert.ok(rows[0].issued_at instanceof Date, "when the runner signed it");

    const read = await history();
    assert.equal(read.statusCode, 200, read.body);
    const list = read.json();
    assert.equal(list.missionId, "go-first-program");
    assert.equal(list.total, 1);
    assert.equal(list.runs.length, 1);
    const entry = list.runs[0];
    assert.equal(entry.stdout, "Hello, Go\n");
    assert.deepEqual(entry.checkIds, ["run-answer"]);
    assert.equal(entry.matchesSavedDraft, true);
    assert.equal(entry.exitCode, 0);
    assert.ok(entry.recordedAt && entry.issuedAt);
    // A receipt is a capability: the history describes the run and never hands
    // back something a client could spend at completion.
    assert.equal("sig" in entry, false);
    assert.equal("receiptSig" in entry, false);
  });

  it("keeps an attempt that never completed, marked as edited-past", async () => {
    rows.length = 0;
    // The learner ran the starter and then carried on editing. That is most of
    // what a learner actually does, and until now it left no trace anywhere.
    draftCode = "package main\n\n// moved on\n";
    const starter = mission.starterCode;
    const r = await record([
      { checkId: "run-answer", receipt: receiptFor({ code: starter, stdout: "TODO\n" }) },
    ]);
    assert.equal(r.statusCode, 200, r.body);
    const entry = (await history()).json().runs[0];
    assert.equal(entry.stdout, "TODO\n");
    assert.equal(entry.matchesSavedDraft, false, "the run is not the code now saved");
    assert.equal(entry.entrySha256, kit.codeSha256(starter));
    assert.equal(entry.draftSha256, kit.codeSha256(draftCode));
    draftCode = SOLUTION;
  });

  it("records nothing when the service holds no draft at all", async () => {
    rows.length = 0;
    draftCode = null;
    try {
      const r = await record([{ checkId: "run-answer", receipt: receiptFor({}) }]);
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(rows[0].draft_sha256, null);
      const entry = (await history()).json().runs[0];
      assert.equal(entry.draftSha256, null);
      assert.equal(entry.matchesSavedDraft, false);
    } finally {
      draftCode = SOLUTION;
    }
  });

  it("recording a run never marks a check passed", async () => {
    rows.length = 0;
    seen.length = 0;
    const r = await record([{ checkId: "run-answer", receipt: receiptFor({}) }]);
    assert.equal(r.statusCode, 200, r.body);
    // Only the draft *read* touches progress: nothing about a record is a
    // verdict, so a history entry can never stand in for evidence.
    const wrote = seen.filter((s) => /mission_progress|evidence/.test(s.sql));
    assert.deepEqual(
      wrote.map((s) => s.sql),
      ["SELECT code FROM mission_progress WHERE user_id = $1 AND mission_id = $2"]
    );
  });

  it("offering the same run twice is idempotent, not a second record", async () => {
    rows.length = 0;
    seen.length = 0;
    const receipt = receiptFor({});
    const first = await record([{ checkId: "run-answer", receipt }]);
    assert.equal(first.json().stored, 1);
    const again = await record([{ checkId: "run-answer", receipt }]);
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().stored, 0);
    assert.equal(again.json().duplicates, 1);
    assert.equal(again.json().total, 1);
    assert.equal(rows.length, 1, "the same execution is one record");
    // The duplicate still merges the check it was offered for onto that record.
    const union = seen.filter((s) => s.sql.startsWith("UPDATE mission_runs")).pop();
    assert.deepEqual(union.params, ["u-history", "go-first-program", receipt.sig, ["run-answer"]]);
    assert.deepEqual(rows[0].check_ids, ["run-answer"]);
  });

  it("refuses a record this platform did not issue, and writes nothing", async () => {
    rows.length = 0;
    const forged = { ...receiptFor({}), sig: "0".repeat(64) };
    const r = await record([{ checkId: "run-answer", receipt: forged }]);
    assert.equal(r.statusCode, 422, r.body);
    assert.equal(r.json().error.code, "run_unverified");
    assert.match(r.json().error.message, /did not issue/);
    assert.equal(rows.length, 0);
    // A receipt signed with somebody else's key is not ours either.
    const foreign = await record([{ checkId: "run-answer", receipt: receiptFor({ key: "another-key" }) }]);
    assert.equal(foreign.statusCode, 422, foreign.body);
    assert.equal(rows.length, 0);
  });

  it("refuses a genuine run that does not include the mission's own file", async () => {
    rows.length = 0;
    const r = await record([{ checkId: "run-answer", receipt: receiptFor({ entry: "not-this-one.go" }) }]);
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /main\.go/);
    assert.equal(rows.length, 0);
  });

  it("refuses a check id this mission does not have, before writing anything", async () => {
    rows.length = 0;
    const r = await record([
      { checkId: "run-answer", receipt: receiptFor({}) },
      { checkId: "invented-check", receipt: receiptFor({}) },
    ]);
    assert.equal(r.statusCode, 400, r.body);
    assert.match(r.json().error.message, /invented-check/);
    assert.equal(rows.length, 0, "a request records all of what it offered or none of it");
  });

  it("records nothing with no signing key, and says why", async () => {
    rows.length = 0;
    delete process.env.INTERNAL_API_KEY;
    try {
      const r = await record([{ checkId: "run-answer", receipt: receiptFor({}) }]);
      assert.equal(r.statusCode, 503, r.body);
      assert.equal(r.json().error.code, "verification_unavailable");
      assert.match(r.json().error.message, /INTERNAL_API_KEY/);
      assert.equal(rows.length, 0);
    } finally {
      process.env.INTERNAL_API_KEY = KEY;
    }
  });

  it("a history read is the learner's own, and only theirs", async () => {
    rows.length = 0;
    seen.length = 0;
    await record([{ checkId: "run-answer", receipt: receiptFor({}) }]);
    // A second account's run of the same mission, written straight into the table.
    rows.push({
      id: nextId++, user_id: "u-someone-else", mission_id: "go-first-program", check_ids: ["run-answer"],
      language: "go", command: [], entry_path: "main.go", entry_sha256: "0".repeat(64),
      draft_sha256: null, stdout: "not yours\n", stderr: "", exit_code: 0, timed_out: false,
      truncated: false, duration_ms: 1, phase: "run", diagnostics: [], runner: "subprocess",
      receipt_sig: "f".repeat(64), content_version: "v-test", issued_at: new Date(),
      recorded_at: new Date(),
    });
    const read = await history();
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(read.json().total, 1, "another learner's runs are not in the count");
    assert.equal(read.json().runs.length, 1);
    assert.notEqual(read.json().runs[0].stdout, "not yours\n");
    // The scope travels in the query, not in a filter applied afterwards.
    const reads = seen.filter((s) => s.sql.startsWith("SELECT * FROM mission_runs"));
    assert.equal(reads.length, 2);
    for (const s of reads) assert.equal(s.params[0], "u-history");

    // Meshed as the gateway would be, but with no identity: the route refuses.
    const anon = await app.inject({
      method: "GET",
      url: "/missions/go-first-program/runs",
      headers: { "x-internal-key": KEY },
    });
    assert.equal(anon.statusCode, 401);
    const unknown = await app.inject({
      method: "GET",
      url: "/missions/no-such-mission/runs",
      headers: { "x-user-id": "u-history", "x-internal-key": KEY },
    });
    assert.equal(unknown.statusCode, 404);
  });

  it("a read asks for a page, and a nonsense page size is clamped, not fatal", async () => {
    const limitFor = async (q) => {
      seen.length = 0;
      const r = await history(q);
      assert.equal(r.statusCode, 200, r.body);
      return seen.find((s) => s.sql.startsWith("SELECT * FROM mission_runs"))?.params[2];
    };
    assert.equal(await limitFor("?limit=1"), 1);
    assert.equal(await limitFor("?limit=9999"), 100, "capped, never unbounded");
    assert.equal(await limitFor("?limit=zero"), 20, "the default, not an error");
  });
});

describe("run evidence is bound to authored scenario fixtures", () => {
  const KEY = "test-receipt-fixture-key";
  let scenario;
  let check;
  let verify;

  before(async () => {
    const missions = await import("../services/progress/dist/vendor/missions.js");
    scenario = missions.missionById("scenario-duration-format");
    check = scenario.checks.find((c) => c.rule.kind === "runs");
    verify = progressRunVerification.verifyRunEvidence;
  });

  const receiptForFiles = (files) => {
    const job = execValidate.validateJob({ language: "node", files });
    return execReceipt.mintReceipt(job, {
      stdout: "ALL TESTS PASSED\n", stderr: "", exitCode: 0,
      timedOut: false, truncated: false, durationMs: 10,
      runner: "subprocess", diagnostics: [], phase: "run",
    }, KEY, new Date());
  };
  const verdict = (receipt) => verify({
    check, receipt, meshKey: KEY, draftCode: scenario.starterCode,
    entryPath: scenario.fileName,
  });

  it("accepts an authentic run with the exact authored fixture", () => {
    const receipt = receiptForFiles([
      { path: scenario.fileName, content: scenario.starterCode },
      ...check.rule.harness,
    ]);
    assert.equal(verdict(receipt).passed, true);
  });

  it("rejects a genuine runner receipt with a replaced test fixture", () => {
    const receipt = receiptForFiles([
      { path: scenario.fileName, content: scenario.starterCode },
      { path: check.rule.harness[0].path, content: "console.log('ALL TESTS PASSED')" },
    ]);
    const result = verdict(receipt);
    assert.equal(result.passed, false);
    assert.match(result.reason, /changed or missing mission test fixture/);
  });

  it("rejects extra submitted files even when the trusted fixture is present", () => {
    const receipt = receiptForFiles([
      { path: scenario.fileName, content: scenario.starterCode },
      ...check.rule.harness,
      { path: "extra.js", content: "// alters the run environment" },
    ]);
    const result = verdict(receipt);
    assert.equal(result.passed, false);
    assert.match(result.reason, /different set of files/);
  });
});

/* Web missions are most of the curriculum, and until now a client could mark
     one done without its saved draft satisfying a single rule — the pass list
     it uploaded *was* the record. Now the platform re-derives those checks from
     the draft it stores, using the identical interpreter the learner's screen
     runs (vendored from the frontend, so the two cannot drift apart). */
  const PAGE = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Ada's notes</title>",
    "  </head>",
    "  <body>",
    "    <h1>Things I am learning</h1>",
    "    <p>HTML is simpler than I expected.</p>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
  const docMission = async (id) => {
    const missions = await import("../services/progress/dist/vendor/missions.js");
    return missions.missionById(id);
  };
  const claimAll = (m) => ({ code: m.starterCode, checksPassed: m.checks.map((c) => c.id) });

  it("refuses a web completion the saved draft does not satisfy", async () => {
    const doc = await docMission("first-page");
    setDraft({ code: "<h1>x</h1>", checksPassed: doc.checks.map((c) => c.id) });
    draft.mission_id = "first-page";
    const r = await completeAt("first-page", {});
    assert.equal(r.statusCode, 422, r.body);
    assert.equal(r.json().error.code, "document_unverified");
    // The refusal names the unmet rule in the mission's own authored words.
    assert.match(r.json().error.message, /meaningful <title>/);
    assert.match(r.json().error.message, /Untitled page/);
    assert.equal(draft.completed_at, null, "a claimed pass is not a pass");
  });

  it("reports only what is unmet, and passes what the draft does satisfy", async () => {
    const doc = await docMission("first-page");
    // Title and heading are there; the paragraph is missing.
    setDraft({ code: "<title>My page</title><h1>Hi there</h1>", checksPassed: doc.checks.map((c) => c.id) });
    draft.mission_id = "first-page";
    const r = await completeAt("first-page", {});
    assert.equal(r.statusCode, 422, r.body);
    assert.match(r.json().error.message, /paragraph/);
    assert.doesNotMatch(r.json().error.message, /meaningful <title>/);
  });

  it("completes a draft that satisfies every rule, even when the client claimed nothing", async () => {
    writes.length = 0;
    setDraft({ code: PAGE, checksPassed: [] });
    draft.mission_id = "first-page";
    const r = await completeAt("first-page", {});
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.equal(body.completed, true);
    // What passed came from the draft, not from the (empty) claim.
    assert.deepEqual(insertedChecks(), ["has-title", "has-h1", "has-p"]);
    assert.deepEqual(body.verifiedChecks, ["has-title", "has-h1", "has-p"]);
  });

  it("will not complete a mission the learner never wrote code for", async () => {
    const doc = await docMission("first-page");
    // No saved draft: the server judges the code the mission starts with — the
    // code the learner is looking at — and the starter code does not satisfy
    // the mission's own rules. Claiming otherwise is exactly the hole this
    // closes, so the claim has to lose.
    setDraft({ code: null, checksPassed: doc.checks.map((c) => c.id) });
    draft.mission_id = "first-page";
    const r = await completeAt("first-page", {});
    assert.equal(r.statusCode, 422, r.body);
    assert.equal(r.json().error.code, "document_unverified");
    assert.match(r.json().error.message, /untitled page/i);
    assert.equal(draft.completed_at, null);
  });

  it("leaves the rules only a browser can decide as the client's own evidence", async () => {
    // The stored boundary, executable: `h1 { color: … }` is decided by a real
    // cascade, and no parser reproduces one faithfully — so this mission still
    // travels on the client's report, and the code says so rather than guessing
    // (TODO 2.2). If that ever changes, this test fails and the limitation gets
    // rewritten instead of quietly outliving the fix.
    const css = await docMission("css-selectors");
    assert.ok(
      css.checks.every((c) => c.rule.kind === "computed-style"),
      "the example mission is still a computed-style one"
    );
    const { documentChecks } = await import("../services/progress/dist/verify-document.js");
    assert.deepEqual(documentChecks(css.checks), []);
    setDraft(claimAll(css));
    draft.mission_id = "css-selectors";
    const r = await completeAt("css-selectors", {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().completed, true);
  });
});

describe("the platform decides document checks with the learner's own interpreter", () => {
  let documentChecks;
  let verifyDocumentChecks;
  before(async () => {
    ({ documentChecks, verifyDocumentChecks } = await import(
      "../services/progress/dist/verify-document.js"
    ));
  });

  /** One rule, one draft: the whole surface, without a route or a database. */
  const verdict = (code, rule) =>
    verifyDocumentChecks({
      checks: [{ id: "c", label: "a rule", feedback: "what to do about it", rule }],
      draftCode: code,
    })[0];

  it("decides every document rule kind, in both directions", () => {
    const cases = [
      ['<img src="a.png" alt="A cat">', { kind: "has-element", selector: "img[alt]" }, true],
      ["<div></div>", { kind: "has-element", selector: "img[alt]" }, false],
      ["<div></div>", { kind: "missing-element", selector: "table" }, true],
      ["<table></table>", { kind: "missing-element", selector: "table" }, false],
      ["<ul><li>a</li><li>b</li></ul>", { kind: "count-min", selector: "li", min: 2 }, true],
      ["<ul><li>a</li></ul>", { kind: "count-min", selector: "li", min: 2 }, false],
      ["<ul><li>a</li></ul>", { kind: "count-exact", selector: "li", exact: 1 }, true],
      ["<ul><li>a</li><li>b</li></ul>", { kind: "count-exact", selector: "li", exact: 1 }, false],
      ["<h1>Hi</h1>", { kind: "text-match", selector: "h1", pattern: "^hi$" }, true],
      ["<h1>x</h1>", { kind: "text-match", selector: "h1", pattern: "^hi$" }, false],
      // Missing element, not an error and not a pass: no element, no match.
      ["<div></div>", { kind: "text-match", selector: "h1", pattern: "." }, false],
      ["<p>Hello world</p>", { kind: "doc-text-match", pattern: "hello" }, true],
      ["<p>Goodbye</p>", { kind: "doc-text-match", pattern: "hello" }, false],
      ['<a href="https://example.com">x</a>', { kind: "attr-match", selector: "a", attr: "href", pattern: "^https://" }, true],
      ['<a href="x.html">x</a>', { kind: "attr-match", selector: "a", attr: "href", pattern: "^https://" }, false],
      ['<nav><a href="x.html">x</a></nav>', { kind: "nested", ancestor: "nav", child: "a" }, true],
      ["<div><a href=\"x.html\">x</a></div>", { kind: "nested", ancestor: "nav", child: "a" }, false],
      ['<label for="n">Name</label><input id="n" />', { kind: "labeled-inputs" }, true],
      ["<input id=\"n\" />", { kind: "labeled-inputs" }, false],
      ["<p>no fields here</p>", { kind: "labeled-inputs" }, false],
      ['<a href="page.html">x</a>', { kind: "no-placeholder-links" }, true],
      ['<a href="#">x</a>', { kind: "no-placeholder-links" }, false],
      ["<style>.a { color: red; }</style>", { kind: "style-text-match", pattern: "\\.a\\s*\\{[^}]*color" }, true],
      ["<style>.a { color: red; }</style>", { kind: "style-text-match", pattern: "display\\s*:\\s*flex" }, false],
    ];
    for (const [code, rule, expected] of cases) {
      const v = verdict(code, rule);
      assert.equal(v.passed, expected, `${rule.kind} ${JSON.stringify(rule)} on ${JSON.stringify(code)}`);
    }
  });

  it("claims the document kinds, and never the browser's or the runner's", () => {
    const ids = documentChecks([
      { id: "doc", label: "", feedback: "", rule: { kind: "has-element", selector: "p" } },
      { id: "rendered", label: "", feedback: "", rule: { kind: "computed-style", selector: "p", property: "color", pattern: "red" } },
      { id: "driven", label: "", feedback: "", rule: { kind: "scripted", ops: [], assertions: [] } },
      { id: "ran", label: "", feedback: "", rule: { kind: "runs", assertions: [] } },
    ]).map((c) => c.id);
    assert.deepEqual(ids, ["doc"]);
  });

  it("fails closed with no draft, and on a rule it cannot evaluate", () => {
    const rule = { kind: "has-element", selector: "p" };
    for (const draftCode of [null, "", "   "]) {
      const v = verifyDocumentChecks({
        checks: [{ id: "c", label: "a rule", feedback: "write something", rule }],
        draftCode,
      })[0];
      assert.equal(v.passed, false, `no draft (${JSON.stringify(draftCode)}) cannot pass`);
      assert.match(v.reason, /no saved draft/);
    }
    // A pattern the engine cannot compile must not become a pass. Authored
    // mission data is checked elsewhere; this is the guarantee that a broken
    // rule never silently opens the gate.
    const broken = verdict("<p>x</p>", { kind: "text-match", selector: "p", pattern: "(" });
    assert.equal(broken.passed, false);
    assert.equal(broken.reason, "what to do about it");
  });
});

describe("boot fail-fast + migrations + sync + compose", () => {
  it("auth/progress/billing refuse to boot without DATABASE_URL", () => {
    for (const svc of ["auth", "progress", "billing"]) {
      const env = { ...process.env };
      delete env.DATABASE_URL;
      const r = spawnSync("node", [`services/${svc}/dist/index.js`], {
        cwd: root,
        env: { ...env, PORT: "18991", AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH },
        timeout: 15000,
        encoding: "utf8",
      });
      assert.notEqual(r.status, 0, `${svc} must not boot without a database`);
      assert.match(r.stderr + r.stdout, /DATABASE_URL/);
    }
  });
  it("migrations create the tables they claim", () => {
    const checks = [
      ["auth", ["CREATE TABLE IF NOT EXISTS users", "CREATE TABLE IF NOT EXISTS refresh_tokens"]],
      ["progress", ["CREATE TABLE IF NOT EXISTS profiles", "CREATE TABLE IF NOT EXISTS mission_progress", "CREATE TABLE IF NOT EXISTS evidence"]],
      ["tutor", ["CREATE TABLE IF NOT EXISTS tutor_requests"]],
      ["billing", ["CREATE TABLE IF NOT EXISTS billing_checkouts", "CREATE TABLE IF NOT EXISTS billing_subscriptions", "CREATE TABLE IF NOT EXISTS billing_events"]],
    ];
    for (const [svc, needles] of checks) {
      const sql = readFileSync(join(root, "services", svc, "migrations", "001_init.sql"), "utf8");
      for (const n of needles) assert.ok(sql.includes(n), `${svc}: ${n}`);
    }
    // Clerk provisioning rides a forward-only migration: existing rows stay
    // local with their passwords intact; new rows may be passwordless.
    const auth002 = readFileSync(join(root, "services", "auth", "migrations", "002_clerk_link.sql"), "utf8");
    assert.ok(auth002.includes("provider"), "auth 002 tracks the account provider");
    assert.ok(auth002.includes("DROP NOT NULL"), "auth 002 allows passwordless rows");
    // Submission history rides a forward-only migration of its own: an existing
    // deployment gains the table without any progress row being touched, and
    // the runner's signature is what keeps one execution to one record.
    const progress002 = readFileSync(join(root, "services", "progress", "migrations", "002_runs.sql"), "utf8");
    assert.ok(progress002.includes("CREATE TABLE IF NOT EXISTS mission_runs"), "progress 002 records runs");
    assert.ok(progress002.includes("receipt_sig"), "progress 002 keys a record by the runner's signature");
    assert.ok(
      progress002.includes("UNIQUE INDEX IF NOT EXISTS mission_runs_one_row_per_receipt"),
      "progress 002 makes re-offering one run idempotent"
    );
  });
  it("vendor snapshots match frontend source (run sync on drift)", async () => {
    const { createHash } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const manifest = {
      "services/curriculum/src/data": ["types.ts", "curriculum.ts", "diagnostic.ts", "missions.ts", "missions-a.ts", "missions-b.ts", "missions-c.ts", "missions-d.ts", "missions-e.ts", "missions-f.ts", "missions-g.ts", "missions-h.ts", "missions-i.ts", "missions-j.ts", "missions-k.ts", "missions-l.ts", "missions-m.ts", "missions-n.ts", "missions-o.ts", "missions-p.ts", "missions-q.ts", "missions-r.ts", "missions-orientation.ts"],
      "services/progress/src/vendor": ["types.ts", "curriculum.ts", "diagnostic.ts", "missions.ts", "missions-a.ts", "missions-b.ts", "missions-c.ts", "missions-d.ts", "missions-e.ts", "missions-f.ts", "missions-g.ts", "missions-h.ts", "missions-i.ts", "missions-j.ts", "missions-k.ts", "missions-l.ts", "missions-m.ts", "missions-n.ts", "missions-o.ts", "missions-p.ts", "missions-q.ts", "missions-r.ts", "missions-orientation.ts", "format.ts", "recommend.ts", "progress-core.ts", "run-evidence.ts", "document-rules.ts"],
      "services/tutor/src/vendor": ["types.ts", "missions.ts", "missions-a.ts", "missions-b.ts", "missions-c.ts", "missions-d.ts", "missions-e.ts", "missions-f.ts", "missions-g.ts", "missions-h.ts", "missions-i.ts", "missions-j.ts", "missions-k.ts", "missions-l.ts", "missions-m.ts", "missions-n.ts", "missions-o.ts", "missions-p.ts", "missions-q.ts", "missions-r.ts", "missions-orientation.ts"],
    };
    const stripExt = (content) =>
      content.replace(/(from\s+["'])(\.[^"']+)(["'])/g, (m, pre, p, post) =>
        p.endsWith(".js") || p.endsWith(".json") ? m : pre + p + ".js" + post
      );
    const hash = createHash("sha256");
    for (const [dir, files] of Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (const f of [...files].sort()) {
        const src = await readFile(join(root, "..", "nexora-svelte", "src", "lib", f), "utf8");
        // Hash input mirrors sync-curriculum.mjs exactly (keys carry ../).
        hash.update("../" + dir + "/" + f + "\n" + src + "\n");
        const vendor = await readFile(join(root, dir, f), "utf8");
        assert.equal(vendor, stripExt(src), `${dir}/${f} matches source (run npm run sync:curriculum)`);
      }
    }
    const ver = await import("../services/curriculum/dist/data/version.js");
    assert.equal(ver.CONTENT_VERSION, hash.digest("hex").slice(0, 12));
  });
  it("every relative import in vendor/data ends with .js (NodeNext)", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    for (const dir of ["services/curriculum/src/data", "services/progress/src/vendor", "services/tutor/src/vendor"]) {
      const files = (await readdir(join(root, dir))).filter((f) => f.endsWith(".ts"));
      for (const f of files) {
        const content = await readFile(join(root, dir, f), "utf8");
        const bad = [...content.matchAll(/from\s+["'](\.[^"']+)["']/g)]
          .map((m) => m[1])
          .filter((p) => !p.endsWith(".js") && !p.endsWith(".json"));
        assert.deepEqual(bad, [], `${dir}/${f} extensionless imports`);
      }
    }
  });
  it("compose config is valid; postgres stays internal; gateway published", () => {
    const dir = mkdtempSync(join(tmpdir(), "nexora-env-"));
    const envFile = join(dir, ".env");
    const example = readFileSync(join(root, ".env.example"), "utf8")
      .replace(/change-me[^"\n]*/g, "test-secret-0123456789abcdef0123456789");
    writeFileSync(envFile, example);
    let out;
    try {
      out = execSync(`docker compose --env-file "${envFile}" -f docker-compose.yml config --format json`, {
        cwd: root,
        encoding: "utf8",
        timeout: 60000,
      });
    } catch (e) {
      assert.fail(`docker compose config failed: ${(e.stderr ?? e.message ?? e).toString().slice(0, 500)}`);
    }
    const cfg = JSON.parse(out);
    const names = Object.keys(cfg.services);
    for (const s of ["postgres", "auth", "curriculum", "progress", "execution", "tutor", "billing", "gateway", "frontend"]) {
      assert.ok(names.includes(s), `service ${s} present`);
    }
    assert.equal(cfg.services.postgres.ports, undefined, "postgres not published");
    assert.ok(JSON.stringify(cfg.services.gateway.ports).includes("8080"));
    assert.ok(existsSync(join(root, "Dockerfile")));
  });
});
