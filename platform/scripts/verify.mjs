#!/usr/bin/env node
/* Platform verification, part 1: host-level. No Docker daemon required.
   Run: npm run verify
   Covers: contracts, service-kit, auth crypto, gateway (pure + live proxy
   against stub upstreams), execution (validation + live subprocess + docker
   arg construction + queue + quotas), curriculum + billing routes
   (in-process via fastify.inject), boot fail-fast paths, sync freshness,
   migrations sanity, compose validity. */
import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import { verifyWebhookSignature, signTestVector, signingKey, loadPlans } from "../services/billing/dist/dodo.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = randomBytes(32).toString("hex");
const MESH = randomBytes(32).toString("hex");

process.env.BCRYPT_ROUNDS = "4"; // speed up tests only; production default is 12

/* Mesh posture for this suite (B-27). The platform now refuses to serve without
   mesh auth unless a development boot asks for it explicitly, so the suites that
   drive keyless services in-process declare that posture once, here, instead of
   each one re-deriving it. A configured INTERNAL_API_KEY always beats the
   opt-in, and the fail-closed path is asserted in its own describe below. */
process.env.ALLOW_INSECURE_MESH = "1";

const contracts = await import("../packages/contracts/dist/index.js");
const kit = await import("../packages/service-kit/dist/index.js");
const authCrypto = await import("../services/auth/dist/crypto.js");
const gwConfig = await import("../services/gateway/dist/config.js");
const gwAuth = await import("../services/gateway/dist/auth.js");
const gwLimits = await import("../services/gateway/dist/limits.js");
const gwProxy = await import("../services/gateway/dist/proxy.js");
const gwEntitlement = await import("../services/gateway/dist/entitlement.js");
const gwRevocation = await import("../services/gateway/dist/revocation.js");
const execValidate = await import("../services/execution/dist/validate.js");
const execSub = await import("../services/execution/dist/runners/subprocess.js");
const execDocker = await import("../services/execution/dist/runners/docker.js");
const execQueue = await import("../services/execution/dist/queue.js");
const execQuotas = await import("../services/execution/dist/quotas.js");
const execGoDiag = await import("../services/execution/dist/go-diagnostics.js");
const execReceipt = await import("../services/execution/dist/receipt.js");

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
    // Go must be accepted by the wire contract, not merely by the runner.
    assert.ok(
      contracts.executeSchema.safeParse({
        language: "go",
        files: [{ path: "main.go", content: "package main" }],
      }).success
    );
  });
  it("checkout schemas", () => {
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
  it("assertSecret refuses short values and the documented placeholders", () => {
    // A secret that passes validation while being the value published in
    // .env.example is an impersonation primitive, not a weak password: the JWT
    // secret mints a token for any user id, and the mesh key also seeds the
    // run-receipt signing key.
    assert.equal(kit.assertSecret("X", "a".repeat(32)).length, 32);
    assert.throws(() => kit.assertSecret("X", "short"), /32 characters/);
    assert.throws(() => kit.assertSecret("X", ""), /32 characters/);
    assert.throws(
      () => kit.assertSecret("X", "change-me-to-32-plus-random-characters"),
      /placeholder/
    );
    assert.ok(kit.isPlaceholderSecret("change-me-internal-mesh-key"), "the shipped mesh placeholder is not a key");
    assert.ok(kit.isPlaceholderSecret("replace_me_with_a_real_one"), "underscored variant");
    assert.equal(kit.isPlaceholderSecret(SECRET), false, "generated hex is not a placeholder");
  });
  it("clientIp prefers the gateway's header over the caller's own view", () => {
    // A service must key its limiter on what the gateway resolved. req.ip there
    // is derived from X-Forwarded-For, which the gateway strips, so it is the
    // gateway's address for every request — one bucket for the whole internet.
    assert.equal(kit.clientIp({ headers: { "x-client-ip": "203.0.113.9" }, ip: "10.0.0.1" }), "203.0.113.9");
    assert.equal(kit.clientIp({ headers: { "x-client-ip": ["203.0.113.9"] }, ip: "10.0.0.1" }), "203.0.113.9");
    assert.equal(kit.clientIp({ headers: {}, ip: "10.0.0.1" }), "10.0.0.1", "direct access falls back to req.ip");
    assert.equal(kit.clientIp({ headers: { "x-client-ip": "   " }, ip: "10.0.0.1" }), "10.0.0.1", "blank is not an address");
    assert.equal(kit.clientIp({ headers: {} }), "unknown");
  });
  it("Ed25519 receipt signatures verify offline against the published key", async () => {
    // B-24's one property: a stranger with the receipt and the public key
    // re-derives the verdict without the mesh secret — and the secret alone
    // never verifies an Ed25519 signature, so publishing the key teaches
    // nothing that mints.
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pub = kit.receiptEdPublicKey(pem);
    assert.match(pub, /BEGIN PUBLIC KEY/, "the published half is SPKI PEM");
    const sig = kit.signReceiptEd("payload-bytes", pem);
    assert.equal(sig.length, 88, "64 bytes as base64");
    assert.equal(kit.verifyReceiptEd("payload-bytes", sig, pub), true);
    assert.equal(kit.verifyReceiptEd("payload-bytos", sig, pub), false, "one edited byte fails");
    assert.equal(kit.verifyReceiptEd("payload-bytes", "0".repeat(64), pub), false, "the mesh-key shape is not an Ed signature");
    assert.equal(kit.verifyReceiptEd("payload-bytes", "!!!not-base64!!!", pub), false, "malformed fails closed");
    const other = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    assert.equal(kit.verifyReceiptEd("payload-bytes", sig, kit.receiptEdPublicKey(other)), false, "another key fails");
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

/* B-27: the mesh boundary fails closed, and never on NODE_ENV.
 *
 * The rule that used to hold was "production needs a key, everything else runs
 * open", which made an absent or mis-set NODE_ENV the whole of the
 * authentication model on a product whose only claim is that a learner cannot
 * forge a verdict. Three things are asserted here, each one the thing that
 * would have to be true for the old hole to exist: the pure decision refuses a
 * real keyless boot, a service with a key 403s a keyless call with NODE_ENV
 * unset, and a real service process exits rather than serving a keyless mesh. */
describe("the mesh boundary fails closed, not on NODE_ENV (B-27)", () => {
  it("refuses a keyless boot in every environment, and refuses the opt-in in production", () => {
    assert.throws(() => kit.resolveMeshKey({}), /INTERNAL_API_KEY is required/);
    assert.throws(() => kit.resolveMeshKey({ NODE_ENV: "production" }), /INTERNAL_API_KEY/);
    assert.throws(
      () => kit.resolveMeshKey({ INTERNAL_API_KEY: "change-me-internal-mesh-key" }),
      /placeholder/,
      "a key published in the repo is not a key in any environment"
    );
    assert.throws(
      () => kit.resolveMeshKey({ NODE_ENV: "production", ALLOW_INSECURE_MESH: "1" }),
      /refused in production/,
      "the development opt-in must not be able to switch production off"
    );
    assert.throws(
      () => kit.resolveMeshKey({ NODE_ENV: "production", INTERNAL_API_KEY: "change-me-internal-mesh-key" }),
      /placeholder/
    );
    assert.deepEqual(kit.resolveMeshKey({ INTERNAL_API_KEY: MESH }), { key: MESH, insecure: false });
    assert.deepEqual(
      kit.resolveMeshKey({ ALLOW_INSECURE_MESH: "1" }),
      { key: "", insecure: true },
      "a keyless mesh must be asked for, never assumed"
    );
    assert.deepEqual(
      kit.resolveMeshKey({ INTERNAL_API_KEY: MESH, ALLOW_INSECURE_MESH: "1" }),
      { key: MESH, insecure: false },
      "a real key wins over the opt-in"
    );
  });
  it("403s a keyless internal request with NODE_ENV unset, and admits the keyed one", async () => {
    const saved = {
      key: process.env.INTERNAL_API_KEY,
      nodeEnv: process.env.NODE_ENV,
      optIn: process.env.ALLOW_INSECURE_MESH
    };
    try {
      process.env.INTERNAL_API_KEY = MESH;
      delete process.env.NODE_ENV; // the variable that used to decide this
      delete process.env.ALLOW_INSECURE_MESH;
      const app = await kit.createService("test-mesh-on");
      app.get("/internal/thing", async () => ({ ok: true }));
      await app.ready();
      const keyless = await app.inject({
        method: "GET",
        url: "/internal/thing",
        headers: { "x-user-id": "victim" } // no mesh key: identity is not a header you may send
      });
      assert.equal(keyless.statusCode, 403, "a keyless caller must not be served");
      const keyed = await app.inject({
        method: "GET",
        url: "/internal/thing",
        headers: { "x-internal-key": MESH }
      });
      assert.equal(keyed.statusCode, 200, "the holder of the key is still served");
      await app.close();
    } finally {
      if (saved.key === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = saved.key;
      if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved.nodeEnv;
      if (saved.optIn === undefined) delete process.env.ALLOW_INSECURE_MESH;
      else process.env.ALLOW_INSECURE_MESH = saved.optIn;
    }
  });
  it("refuses in a real child process too, and names the opt-in that would allow it", () => {
    const env = { ...process.env, PORT: "18995" };
    delete env.INTERNAL_API_KEY;
    delete env.ALLOW_INSECURE_MESH;
    const r = spawnSync("node", ["services/curriculum/dist/index.js"], {
      cwd: root,
      env,
      timeout: 15000,
      encoding: "utf8"
    });
    assert.notEqual(r.status, 0, "a service with no mesh key must not start serving");
    const out = r.stderr + r.stdout;
    assert.match(out, /INTERNAL_API_KEY/, "the refusal names the variable");
    assert.match(out, /ALLOW_INSECURE_MESH/, "and the explicit development opt-in");
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
  it("refuses to sign with the documented placeholder secret", async () => {
    const saved = process.env.AUTH_JWT_SECRET;
    try {
      process.env.AUTH_JWT_SECRET = "change-me-to-32-plus-random-characters";
      // 38 characters — long enough for the old length-only check, and exactly
      // what the README's `cp .env.example .env` would have produced.
      assert.throws(() => authCrypto.signAccessToken("u"), /placeholder/);
    } finally {
      if (saved === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved;
    }
  });
});

describe("gateway pure units", () => {
  it("loadConfig defaults + validation", () => {
    const c = gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH });
    assert.equal(c.port, 8080);
    assert.ok(c.routes.some((r) => r.prefix === "/api/billing" && r.auth));
    const billing = c.routes.find((r) => r.prefix === "/api/billing");
    assert.deepEqual(billing.publicPaths, ["/api/billing/webhooks/dodo"]);
    const execute = c.routes.find((r) => r.prefix === "/api/execute");
    assert.deepEqual(execute.publicPaths, ["/api/execute/verify", "/api/execute/verify-key"], "the key travels the same public rule as the verdict");
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: "x" }), /32 characters/);
    // The shipped placeholders are long enough to pass a length check, which is
    // precisely why they were dangerous. Both must be refused outright.
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: "change-me-to-32-plus-random-characters", INTERNAL_API_KEY: MESH }),
      /placeholder/
    );
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: "change-me-internal-mesh-key" }),
      /placeholder/
    );
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH, FRONTEND_URL: "notaurl" }), /http/);
    assert.equal(gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH, PORT: "18080" }).port, 18080);
    assert.equal(
      gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH, PORT: "18080", GATEWAY_PORT: "19090" }).port,
      19090
    );
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH, AUTH_MODE: "weird" }), /AUTH_MODE/);
    // B-27: a gateway with no mesh key is refused in EVERY environment, not only
    // production — the flag it used to depend on is nobody's safety net.
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET }), /INTERNAL_API_KEY/);
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, NODE_ENV: "production", ALLOW_INSECURE_MESH: "1" }),
      /refused in production/,
      "the development opt-in is not a production flag"
    );
    // The degradation bound. Default a minute; 0 is a supported value (fail closed
    // on an unreachable check) and a negative one is not a way to ask for more; the
    // ceiling keeps a typo from buying availability past the point where the
    // credentials it covers have expired on their own.
    assert.equal(c.revocationClearTtlMs, 60_000, "a minute of grace by default");
    assert.equal(c.revocationTimeoutMs, 2_000);
    const clearTtl = (v) => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH, REVOCATION_CLEAR_TTL_MS: v }).revocationClearTtlMs;
    assert.equal(clearTtl("0"), 0, "0 means strict: every unanswerable check is a 503");
    assert.equal(clearTtl("-5000"), 0, "a negative bound is not a request to trust anything");
    assert.equal(clearTtl("5000"), 5_000);
    assert.equal(clearTtl("600000"), 300_000, "clamped to the point where the fallback stops covering live credentials");
    assert.throws(() => clearTtl("soon"), /REVOCATION_CLEAR_TTL_MS/);
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH, AUTH_MODE: "clerk" }),
      /CLERK_SECRET_KEY or CLERK_JWT_KEY/
    );
    const clerkCfg = gwConfig.loadConfig({
      AUTH_JWT_SECRET: SECRET,
      INTERNAL_API_KEY: MESH,
      AUTH_MODE: "clerk",
      CLERK_JWT_KEY: "pem",
      CLERK_AUTHORIZED_PARTIES: "https://a.dev, https://b.dev",
    });
    assert.equal(clerkCfg.authMode, "clerk");
    assert.deepEqual(clerkCfg.clerkAuthorizedParties, ["https://a.dev", "https://b.dev"]);
    const clerkDefault = gwConfig.loadConfig({
      AUTH_JWT_SECRET: SECRET,
      INTERNAL_API_KEY: MESH,
      AUTH_MODE: "clerk",
      CLERK_JWT_KEY: "pem",
      FRONTEND_URL: "https://app.example.com",
    });
    assert.deepEqual(clerkDefault.clerkAuthorizedParties, ["https://app.example.com"]);
  });
  it("bearer parsing + local verification, including the id revocation needs", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const local = gwAuth.localVerifier(SECRET);
    const now = Math.floor(Date.now() / 1000);
    const t = jwt.sign({ sub: "u9", jti: "id-9" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const id = await gwAuth.bearerIdentity(`Bearer ${t}`, local);
    assert.equal(id.userId, "u9");
    assert.equal(id.jti, "id-9", "the edge needs the token's own id to ask about it");
    assert.ok(id.expiresAtMs > now * 1000, "and when it stops mattering, to bound the cache");
    assert.equal(await gwAuth.bearerIdentity(undefined, local), null);
    assert.equal(await gwAuth.bearerIdentity("Bearer garbage", local), null);
    assert.equal(await gwAuth.bearerIdentity("Basic abc", local), null);
    // A token minted before ids existed is still verified: it simply cannot be
    // revoked, and nothing may pretend otherwise.
    const older = jwt.sign({ sub: "u10" }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const noId = await gwAuth.bearerIdentity(`Bearer ${older}`, local);
    assert.equal(noId.userId, "u10");
    assert.equal(noId.jti, null);
    // A token that states no lifetime reports none, so nothing in the cache
    // pretends it knows when that id stops mattering.
    const timeless = jwt.sign({ sub: "u11" }, SECRET, { algorithm: "HS256" });
    assert.equal((await gwAuth.bearerIdentity(`Bearer ${timeless}`, local)).expiresAtMs, null);
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
    assert.equal((await v.verify(token)).userId, "user_clerk_1");
    // Clerk owns revocation for its own sessions; the edge must not invent a
    // lookup against an id Clerk does not promise to keep stable.
    assert.equal((await v.verify(token)).jti, null);
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
    // x-entitled is the entitlement gate's verdict: injected only when the gate
    // cleared the request, and never echoed from a client that sends it.
    assert.equal(h["x-entitled"], undefined, "not entitled unless the gate says so");
    const paid = gwProxy.buildForwardHeaders(
      { "x-entitled": "1" },
      { userId: "u1", internalKey: MESH, requestId: "r1", entitled: true }
    );
    assert.equal(paid["x-entitled"], "1", "the gate's verdict is injected downstream");
    const forged = gwProxy.buildForwardHeaders(
      { "x-entitled": "1" },
      { userId: "u1", internalKey: MESH, requestId: "r1" }
    );
    assert.equal(forged["x-entitled"], undefined, "a client-sent x-entitled is stripped, not echoed");
  });

  it("a client cannot choose its own identity, mesh key, trace id or proxy hop", () => {
    // Every one of these is attacker-controlled input. A service reads
    // x-user-id as the authenticated user with no further check, so forwarding
    // a client copy is impersonation the moment any anonymous route asks.
    const spoofed = {
      "x-user-id": "victim",
      "x-entitled": "1",
      "x-internal-key": "guess",
      "x-request-id": "client-chosen",
      "x-client-ip": "9.9.9.9",
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
    assert.equal(anon["x-entitled"], undefined, "no client-chosen entitlement");
    assert.equal(anon["x-internal-key"], undefined, "no client-chosen mesh key");
    assert.equal(anon["x-request-id"], "r1", "the trace id is ours, not theirs");
    for (const h of ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded"]) {
      assert.equal(anon[h], undefined, `${h} must not be forwarded`);
    }
    // A service keys its limiter on x-client-ip, so a client-chosen address
    // would let one caller walk around that throttle by inventing a new one.
    assert.equal(anon["x-client-ip"], undefined, "the address is ours to resolve, not theirs to assert");
    assert.equal(anon["x-custom"], "keep", "unrelated headers still pass through");
    // Authenticated request: identity is the verified one, never the spoof.
    const authed = gwProxy.buildForwardHeaders(spoofed, { userId: "u1", internalKey: MESH, requestId: "r2" });
    assert.equal(authed["x-user-id"], "u1");
    assert.equal(authed["x-entitled"], undefined, "entitlement comes from the gate, never the header");
    assert.equal(authed["x-internal-key"], MESH);
    assert.equal(authed["x-request-id"], "r2");
    assert.equal(authed["x-client-ip"], undefined, "no address unless we resolved one");
    // When we DID resolve one, our value replaces whatever the client sent.
    const withAddr = gwProxy.buildForwardHeaders(spoofed, {
      userId: "u1",
      internalKey: MESH,
      requestId: "r3",
      clientIp: "203.0.113.7",
    });
    assert.equal(withAddr["x-client-ip"], "203.0.113.7", "our resolved address wins over the client's");
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
    assert.equal(gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: MESH }).trustProxy, false);
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

  it("clerk JWKS is fetched over HTTP from a named issuer and rejects mismatches", async () => {
    // The proof the pinned-PEM test cannot give: the LIVE key path. Here the
    // gateway is handed only a secret (sk_test_...) and an issuer address — no
    // public key — so verifyToken must go fetch {apiUrl}/v1/jwks over real HTTP,
    // pick the key by the token's kid, and check the signature with it. A local
    // http server plays the issuer, which is also what makes a self-hosted or
    // sovereign Clerk (and offline/CI verification) a supported shape rather than
    // an untested assumption. No Clerk credentials and no network are required.
    const { generateKeyPairSync, createPublicKey } = await import("node:crypto");
    const http = (await import("node:http")).default;
    const jwt = (await import("jsonwebtoken")).default;

    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Build the JWK for a given kid exactly as Clerk publishes it: n/e base64url.
    const jwkFor = (kid) => {
      const jwk = createPublicKey(publicKey).export({ format: "jwk" });
      return { kid, alg: "RS256", kty: "RSA", use: "sig", n: jwk.n, e: jwk.e };
    };

    const requests = [];
    // One live key set per cache scope. The backend caches a fetched key set per
    // (apiUrl, version, secret) for a few minutes, so to observe a *rotated* key
    // set I address the second phase at its own base path and let it be fetched
    // once; after that it stays pinned, exactly as the real cache would pin it.
    const published = new Map();
    published.set("/v1/jwks", [jwkFor("kid_2025_a")]);
    published.set("/rotated/v1/jwks", [jwkFor("kid_2025_b")]);
    const issuer = http.createServer((req, res) => {
      requests.push({ url: req.url, auth: req.headers.authorization || null });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: published.get(req.url) ?? published.get("/v1/jwks") }));
    });
    await new Promise((r) => issuer.listen(0, "127.0.0.1", r));
    const apiUrl = `http://127.0.0.1:${issuer.address().port}`;
    const secretKey = "sk_test_jwks_proof";

    try {
      const now = Math.floor(Date.now() / 1000);
      const mkToken = (kid) =>
        jwt.sign(
          { iss: apiUrl, sub: "user_jwks_1", sid: "sess_j", iat: now, nbf: now, exp: now + 300 },
          privateKey,
          { algorithm: "RS256", keyid: kid }
        );

      // 1. The named issuer's key set is fetched over HTTP and verifies the token.
      const v = gwAuth.clerkVerifier({ secretKey, apiUrl, authorizedParties: [] });
      const good = await v.verify(mkToken("kid_2025_a"));
      assert.equal(good.userId, "user_jwks_1");
      assert.equal(good.jti, null, "Clerk owns its own revocation; the edge invents no id");
      // The request reached the named issuer, authenticated with the secret — not
      // the hosted default, and not a pinned key.
      assert.ok(
        requests.some((r) => r.url === "/v1/jwks" && r.auth === `Bearer ${secretKey}`),
        "the gateway fetched /v1/jwks from the named issuer with the secret as bearer"
      );

      // 2. A token signed by a key the issuer no longer publishes (kid mismatch)
      //    is refused even though the signature is self-consistent — the JWKS is
      //    the source of trust, not the token's own claim to a key. This phase
      //    gets its own issuer address: the backend caches a key set per
      //    (apiUrl, version, secret) for a few minutes by design, so a second
      //    address is how we observe a *changed* key set rather than re-reading
      //    the first one from cache.
      const apiUrl2 = `${apiUrl}/rotated`;
      const stale = gwAuth.clerkVerifier({ secretKey, apiUrl: apiUrl2, authorizedParties: [] });
      await assert.rejects(() => stale.verify(mkToken("kid_2025_a")), /invalid token/);

      // 3. A tampered payload under a key that IS published is refused — the
      //    signature no longer covers the claim that names the user.
      const token = mkToken("kid_2025_a");
      const forged = token.slice(0, token.lastIndexOf(".")) + ".AAAA";
      const vt = gwAuth.clerkVerifier({ secretKey, apiUrl, authorizedParties: [] });
      await assert.rejects(() => vt.verify(forged), /invalid token/);

      // 4. The pinned-PEM path still works and does not reach for the network.
      const reqsBefore = requests.length;
      const pinned = gwAuth.clerkVerifier({ jwtKey: publicKey, apiUrl, authorizedParties: [] });
      assert.equal((await pinned.verify(mkToken("kid_2025_a"))).userId, "user_jwks_1");
      assert.equal(requests.length, reqsBefore, "a pinned key never fetches JWKS");
    } finally {
      await new Promise((r) => issuer.close(r));
    }
  });
});

describe("gateway entitlement cache", () => {
  it("caches a grant and lets it expire", async () => {
    let calls = 0;
    const cache = new gwEntitlement.EntitlementCache(1000, async () => {
      calls++;
      return true;
    });
    assert.equal(await cache.get("u", 0), "entitled");
    assert.equal(await cache.get("u", 500), "entitled");
    assert.equal(calls, 1, "a fresh grant is served from cache within the TTL");
    assert.equal(await cache.get("u", 1001), "entitled");
    assert.equal(calls, 2, "an expired grant is re-asked: a cached grant must not outlive its TTL");
  });
  it("caches a denial only until the webhook path invalidates it", async () => {
    let answer = false;
    let calls = 0;
    const cache = new gwEntitlement.EntitlementCache(60_000, async () => {
      calls++;
      return answer;
    });
    assert.equal(await cache.get("u", 0), "not_entitled");
    answer = true; // the learner subscribes while the denial is still cached
    assert.equal(await cache.get("u", 10), "not_entitled", "still the cached denial");
    assert.equal(calls, 1);
    cache.invalidate(); // this is what proxying the billing webhook does
    assert.equal(await cache.get("u", 20), "entitled", "a cached denial must not survive a successful checkout");
    assert.equal(calls, 2);
  });
  it("invalidate can drop a single user", async () => {
    const seen = [];
    const cache = new gwEntitlement.EntitlementCache(60_000, async (u) => {
      seen.push(u);
      return true;
    });
    await cache.get("a", 0);
    await cache.get("b", 0);
    cache.invalidate("a");
    await cache.get("a", 1);
    await cache.get("b", 1);
    assert.deepEqual(seen, ["a", "b", "a"], "only the dropped user is re-asked");
  });
  it("a billing outage reads as unknown, never a denial, and is not cached", async () => {
    let calls = 0;
    const cache = new gwEntitlement.EntitlementCache(60_000, async () => {
      calls++;
      throw new Error("billing down");
    });
    assert.equal(await cache.get("u", 0), "unknown");
    assert.equal(await cache.get("u", 1), "unknown");
    assert.equal(calls, 2, "an outage is retried, not remembered as a denial");
  });
  it("billingLookup reads entitled from the subscription view and throws on a non-2xx", async () => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/subscription") {
        const uid = req.headers["x-user-id"];
        if (uid === "down") {
          res.statusCode = 503;
          res.end("{}");
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ subscription: { entitled: uid === "yes" } }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise((r) => srv.listen(18099, "127.0.0.1", r));
    try {
      const lookup = gwEntitlement.billingLookup({ url: "http://127.0.0.1:18099", internalKey: MESH, timeoutMs: 2000 });
      assert.equal(await lookup("yes"), true);
      assert.equal(await lookup("no"), false);
      await assert.rejects(() => lookup("down"), /503/);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });
});

describe("gateway revocation (jti denylist)", () => {
  /* Sign-out has to end the credential in hand, not just the family it renews
     with. The edge verifies a token by signature and then asks the auth service
     whether the id it carries was revoked. Three answers, and only two are
     verdicts — the third is what these tests pin down. */

  /* A check carries the whole subject — the id, the user, and the token's own
     issue time — because an account-wide sign-out is judged on the last two (see
     the auth service's revocation-store.ts). The helper keeps these tests about
     one thing each. */
  const subject = (jti, extra = {}) => ({
    jti,
    userId: null,
    issuedAtMs: null,
    expiresAtMs: Date.now() + 300_000,
    ...extra,
  });
  /* The degradation bound these units are exercised with. The production value
     comes from REVOCATION_CLEAR_TTL_MS (see the config test). */
  const CLEAR_TTL = 30_000;

  it("a revoked id is remembered; a clear answer is re-asked every time", async () => {
    const asked = [];
    const cache = new gwRevocation.RevocationCache(async (s) => {
      asked.push(s.jti);
      return { revoked: s.jti === "revoked-1" };
    }, CLEAR_TTL);
    const exp = Date.now() + 300_000;
    const revoked = { verdict: "revoked", reason: "credential", degraded: false };
    assert.deepEqual(await cache.status(subject("revoked-1", { expiresAtMs: exp })), revoked);
    assert.deepEqual(await cache.status(subject("revoked-1", { expiresAtMs: exp })), revoked);
    assert.deepEqual(asked, ["revoked-1"], "a revoked id is asked about once");
    assert.equal(cache.size, 1, "and only revoked ids are held");
    // The clear answer must not be cached: caching it would give back exactly the
    // window this check exists to close — sign out, and the next request sails
    // through on a verdict from a moment ago.
    const clear = await cache.status(subject("live-1", { expiresAtMs: exp }));
    assert.deepEqual(
      clear,
      { verdict: "clear", reason: null, degraded: false },
      "a live token is answered from the service, not from memory"
    );
    assert.equal((await cache.status(subject("live-1", { expiresAtMs: exp }))).verdict, "clear");
    assert.deepEqual(asked, ["revoked-1", "live-1", "live-1"], "a live token is re-asked every request");
    assert.equal(cache.size, 1);
  });

  it("remembers a revocation only until the token it names would have expired", async () => {
    let calls = 0;
    const cache = new gwRevocation.RevocationCache(async () => {
      calls += 1;
      return { revoked: calls === 1 }; // revoked once, then the service says otherwise
    }, 0);
    const s = subject("j", { expiresAtMs: 1_000 });
    assert.equal((await cache.status(s, 0)).verdict, "revoked");
    assert.equal((await cache.status(s, 0)).verdict, "revoked");
    assert.equal(calls, 1, "still inside the token's life: answered from the cache");
    // Past its expiry the id cannot matter again, so the entry is swept and the
    // same id is asked about rather than answered from a stale verdict.
    assert.equal((await cache.status(s, 2_000)).verdict, "clear");
    assert.equal(calls, 2);
  });

  it("an account cut-off is refused every time, never remembered, and attributed to the account", async () => {
    /* The cut-off is a moving boundary: the learner signs out everywhere and then
       signs in again, and the token from that new sign-in is one they asked for.
       Remembering the refusal against the id would be remembering a fact that is
       only true until the next sign-in — the failure this test exists to prevent. */
    const asked = [];
    const cache = new gwRevocation.RevocationCache(async (s) => {
      asked.push(s.jti);
      return { revoked: true, reason: "account" };
    }, CLEAR_TTL);
    const cut = subject("pre-cutoff", { userId: "u1", issuedAtMs: 1_000 });
    assert.deepEqual(await cache.status(cut), { verdict: "revoked", reason: "account", degraded: false });
    assert.deepEqual(await cache.status(cut), { verdict: "revoked", reason: "account", degraded: false });
    assert.deepEqual(asked, ["pre-cutoff", "pre-cutoff"], "a boundary that can move is asked about every time");
    assert.equal(cache.size, 0, "so nothing about it is held");
    assert.equal(cache.stats().fromCache, 0, "and nothing was answered from memory");
  });

  it("an unreachable check is unknown, never a verdict, and is not cached", async () => {
    let calls = 0;
    const cache = new gwRevocation.RevocationCache(async () => {
      calls += 1;
      throw new Error("auth down");
    }, CLEAR_TTL);
    assert.equal((await cache.status(subject("j"))).verdict, "unknown");
    assert.equal((await cache.status(subject("j"))).verdict, "unknown");
    assert.equal(calls, 2, "an outage is retried, not remembered as a verdict either way");
    assert.equal(cache.size, 0);
    assert.equal(cache.stats().unanswered, 2, "an outage is counted, so it can be seen");
  });

  it("counts refusals, clear answers and outages separately, for the log line", async () => {
    const cache = new gwRevocation.RevocationCache(async (s) => {
      if (s.jti === "down") throw new Error("auth down");
      return { revoked: s.jti === "revoked-1" };
    }, CLEAR_TTL);
    assert.deepEqual(
      cache.stats(),
      { asked: 0, refused: { credential: 0, account: 0 }, unanswered: 0, degraded: 0, fromCache: 0 },
      "quiet until something happens — a line every interval would stop being read"
    );
    const exp = Date.now() + 300_000;
    await cache.status(subject("revoked-1", { expiresAtMs: exp })); // asked, refused
    await cache.status(subject("revoked-1", { expiresAtMs: exp })); // refused from memory
    await cache.status(subject("live-1")); // asked, clear
    assert.deepEqual(await cache.status(subject("down")), {
      verdict: "unknown",
      reason: null,
      degraded: false,
    });
    assert.deepEqual(cache.stats(), {
      // `asked` counts definite answers only; the outage is its own number, so
      // "the service is down" and "everyone is signing out" cannot be confused.
      asked: 2,
      refused: { credential: 2, account: 0 },
      unanswered: 1,
      degraded: 0,
      fromCache: 1,
    });
  });

  /* The degradation mode, which exists because a check in front of every
     authenticated request turns an auth-service blip into a product outage. The
     tests below are as much about what it must NOT do as about what it does. */
  it("a confirmed clear is a fallback, never a shortcut: the service is asked every time", async () => {
    const asked = [];
    const cache = new gwRevocation.RevocationCache(async (s) => {
      asked.push(s.jti);
      return { revoked: false };
    }, CLEAR_TTL);
    assert.deepEqual(await cache.status(subject("live-1")), {
      verdict: "clear",
      reason: null,
      degraded: false,
    });
    assert.equal(cache.clearSize, 1, "the clear answer is recorded…");
    await cache.status(subject("live-1"));
    assert.deepEqual(asked, ["live-1", "live-1"], "…but it never answers for the service");
  });

  it("when the check cannot be answered, a recently confirmed clear carries the request — and says so", async () => {
    let up = true;
    const cache = new gwRevocation.RevocationCache(async () => {
      if (!up) throw new Error("auth down");
      return { revoked: false };
    }, CLEAR_TTL);
    const s = subject("live-1");
    const now = 1_000_000;
    assert.equal((await cache.status(s, now)).degraded, false, "confirmed while the service is up");

    up = false;
    assert.deepEqual(
      await cache.status(s, now + 1_000),
      { verdict: "clear", reason: null, degraded: true },
      "inside the bound the request proceeds — flagged, so the edge logs it"
    );
    assert.equal(cache.stats().degraded, 1, "and every degraded allow is counted");
    assert.equal(cache.stats().unanswered, 0, "it is not also counted as a failure");

    // Past the bound it stops: the entry is a moment, not a policy, so a long
    // outage converges back to 503 on its own.
    assert.deepEqual(await cache.status(s, now + CLEAR_TTL + 1), {
      verdict: "unknown",
      reason: null,
      degraded: false,
    });
    assert.equal(cache.stats().unanswered, 1);
  });

  it("an outage is not a blanket allow: a credential nobody confirmed still fails closed", async () => {
    const cache = new gwRevocation.RevocationCache(async () => {
      throw new Error("auth down");
    }, CLEAR_TTL);
    assert.deepEqual(await cache.status(subject("never-seen")), {
      verdict: "unknown",
      reason: null,
      degraded: false,
    });
    assert.equal(cache.stats().degraded, 0, "nothing was degraded, because nothing had been confirmed");
  });

  it("a refusal always wins over a recorded clear, and 0 disables the fallback", async () => {
    let mode = "clear";
    const cache = new gwRevocation.RevocationCache(async () => {
      if (mode === "down") throw new Error("auth down");
      return mode === "revoked" ? { revoked: true } : { revoked: false };
    }, CLEAR_TTL);
    const s = subject("flip-flop");
    await cache.status(s); // confirmed clear, recorded
    mode = "revoked";
    assert.equal((await cache.status(s)).verdict, "revoked");
    assert.equal(cache.clearSize, 0, "a refusal drops the recorded clear for that credential");
    mode = "down";
    assert.equal(
      (await cache.status(s)).verdict,
      "revoked",
      "so an outage can never serve the answer the service has since contradicted"
    );

    // An operator who wants the strict reading gets it: no bound, no fallback, and
    // an unanswerable check is a 503 even for a credential just confirmed.
    const strict = new gwRevocation.RevocationCache(async () => {
      throw new Error("auth down");
    }, 0);
    assert.equal((await strict.status(subject("anything"))).verdict, "unknown");
    assert.equal(strict.clearSize, 0, "nothing is recorded when the bound is 0");
  });

  it("reports its own state, so a monitor without log access can alert on an outage", async () => {
    let mode = "clear";
    const cache = new gwRevocation.RevocationCache(async () => {
      if (mode === "down") throw new Error("auth down");
      return { revoked: false };
    }, CLEAR_TTL);
    const now = 1_000_000;
    assert.deepEqual(
      cache.health(now),
      {
        authService: "unknown",
        degraded: false,
        outageMs: null,
        clearTtlMs: CLEAR_TTL,
        counters: { asked: 0, refused: { credential: 0, account: 0 }, unanswered: 0, degraded: 0, fromCache: 0 },
        fallbackIds: 0,
        cachedRefusals: 0,
      },
      "a fresh process has asked nothing yet, and that is not a failure to report"
    );
    await cache.status(subject("live-1"), now);
    assert.equal(cache.health(now).authService, "reachable");
    assert.equal(cache.health(now).fallbackIds, 1, "one credential can ride an outage");

    mode = "down";
    await cache.status(subject("live-1"), now + 1_000);
    const during = cache.health(now + 1_000);
    assert.equal(
      during.authService,
      "unreachable",
      "a request served from the fallback is still a failed attempt, and must say so"
    );
    assert.equal(during.degraded, true, "the fallback is still buying availability — that is the alert");
    assert.equal(during.outageMs, 0);
    assert.equal(during.counters.degraded, 1);

    const stale = cache.health(now + CLEAR_TTL + 1_000);
    assert.equal(stale.degraded, false, "past the bound it is failing closed, not degrading");
    assert.equal(stale.authService, "unreachable", "and the outage is still the story the monitor needs");
    assert.equal(stale.outageMs, CLEAR_TTL, "measured from the first failure, not from the last attempt");

    mode = "clear";
    await cache.status(subject("live-1"), now + CLEAR_TTL + 2_000);
    const after = cache.health(now + CLEAR_TTL + 2_000);
    assert.equal(after.authService, "reachable");
    assert.equal(after.outageMs, null, "recovery clears the outage clock…");
    assert.equal(after.counters.degraded, 1, "…but the counters are cumulative since boot, on purpose");
  });

  it("revocationLookup sends the token's own subject over the mesh and refuses a non-answer", async () => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const sent = JSON.parse(body || "{}") || {};
        seen.push({ url: req.url, key: req.headers["x-internal-key"], body: sent });
        if (sent.jti === "down-jti") {
          res.statusCode = 500;
          res.end("{}");
          return;
        }
        res.setHeader("content-type", "application/json");
        // A 200 that does not actually answer: "we could not read it" must not be
        // read as "not revoked".
        if (sent.jti === "mumble-jti") {
          res.end(JSON.stringify({}));
          return;
        }
        if (sent.jti === "account-jti") {
          res.end(JSON.stringify({ revoked: true, reason: "account" }));
          return;
        }
        res.end(JSON.stringify({ revoked: sent.jti === "revoked-jti" }));
      });
    });
    await new Promise((r) => srv.listen(18098, "127.0.0.1", r));
    try {
      const lookup = gwRevocation.revocationLookup({
        url: "http://127.0.0.1:18098",
        internalKey: MESH,
        timeoutMs: 2000,
      });
      const wire = (jti) => subject(jti, { userId: "u1", issuedAtMs: 1_700_000_000_000 });
      assert.deepEqual(await lookup(wire("revoked-jti")), { revoked: true });
      assert.deepEqual(await lookup(wire("live-jti")), { revoked: false });
      assert.deepEqual(
        await lookup(wire("account-jti")),
        { revoked: true, reason: "account" },
        "which half of the denylist decided rides back for the edge's log line"
      );
      assert.equal(seen[0].url, "/internal/revocations/check");
      assert.equal(seen[0].key, MESH, "the mesh key is what makes this an internal call");
      assert.deepEqual(
        seen.map((s) => s.body.jti),
        ["revoked-jti", "live-jti", "account-jti"],
        "the id is what is asked about"
      );
      // Without the subject the service can only see the per-credential half of the
      // denylist, and "sign out everywhere" reads as a no-op. It comes from the
      // token the gateway just verified — never from anything a client sent.
      assert.equal(seen[0].body.userId, "u1");
      assert.equal(seen[0].body.issuedAtMs, 1_700_000_000_000);
      assert.equal(
        seen[0].body.expiresAtMs,
        undefined,
        "the expiry bounds this cache and nothing else, so it is not sent"
      );
      await assert.rejects(() => lookup(wire("down-jti")), /500/);
      await assert.rejects(() => lookup(wire("mumble-jti")), /verdict/);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });
});

describe("gateway live proxy against stubs", () => {
  let gwProc = null;
  let gwLog = "";
  /** The gateway's structured log lines, parsed. A partial line is skipped. */
  const gwLogLines = () =>
    gwLog
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  let stubHits = [];
  let stub;
  const GW_PORT = 18080;
  // Drives the auth service's denylist check, which the gateway asks over the
  // mesh exactly as it asks billing for entitlement.
  let revocationDown = false;
  // Makes the stub fail the per-route `/health/ready` probe, so a mesh member
  // appearing unhealthy can be exercised without stopping anything.
  let healthDown = false;
  // Accepts the connection and never answers, for the command's timeout path.
  let healthHang = false;
  const revokedJtis = new Set();
  let revocationChecks = [];
  // Stands in for billing's /subscription view so the paid-path tests can drive
  // entitled / denied / outage per user id. An unlisted user defaults to denied.
  const subscriptionMode = new Map();
  before(async () => {
    stub = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        stubHits.push({ url: req.url, method: req.method, headers: req.headers, body });
        // The gateway resolves entitlement by calling billing /subscription
        // directly over the mesh (entitlement.ts). For the paid-path tests this
        // stub IS billing: it answers from subscriptionMode, keyed by the
        // x-user-id the gateway injects, so a test can flip a learner between
        // entitled, denied and "billing is down" without a real billing service.
        if (healthHang) return; // never answers: the client's own timeout is the only exit
        if (req.url === "/health/ready" && healthDown) {
          res.statusCode = 503;
          res.end("{}");
          return;
        }
        if (req.url === "/internal/revocations/check") {
          const jti = (JSON.parse(body || "{}") || {}).jti;
          revocationChecks.push(jti);
          if (revocationDown) {
            res.statusCode = 500;
            res.end("{}");
            return;
          }
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ revoked: revokedJtis.has(jti) }));
          return;
        }
        if (req.url === "/subscription") {
          const mode = subscriptionMode.get(req.headers["x-user-id"]) ?? "denied";
          if (mode === "down") {
            res.statusCode = 500;
            res.end("{}");
            return;
          }
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ subscription: { entitled: mode === "entitled" } }));
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ stub: true }));
      });
    });
    await new Promise((r) => stub.listen(18081, "127.0.0.1", r));
    // stdout/stderr are captured rather than ignored: "log loudly" is part of what
    // the degradation mode is for, and a log line nobody can assert on is a log line
    // nobody has read.
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
        EXECUTION_URL: "http://127.0.0.1:18081",
        BILLING_URL: "http://127.0.0.1:18081",
        // Short enough to wait out in a test: the degradation bound is a duration,
        // and a duration that takes a minute to observe is a duration nobody tests.
        REVOCATION_CLEAR_TTL_MS: "300",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    gwProc.stdout.on("data", (c) => (gwLog += c));
    gwProc.stderr.on("data", (c) => (gwLog += c));
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
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/execute/capabilities`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(res.status, 200);
    assert.equal(stubHits.length, 1);
    assert.equal(stubHits[0].url, "/capabilities", "gateway strips the /api/<service> prefix");
    const h = stubHits[0].headers;
    assert.equal(h["x-user-id"], "u1");
    assert.equal(h["x-internal-key"], MESH);
    assert.ok(h["x-request-id"]);
    assert.equal(h["authorization"], undefined);
    assert.equal(res.headers.get("x-request-id"), h["x-request-id"]);
  });
  it("auth routes reject missing/invalid tokens without proxying", async () => {
    stubHits = [];
    const r1 = await fetch(`http://127.0.0.1:${GW_PORT}/api/execute/capabilities`);
    assert.equal(r1.status, 401);
    const r2 = await fetch(`http://127.0.0.1:${GW_PORT}/api/execute/capabilities`, {
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
    const none = await fetch(`http://127.0.0.1:${GW_PORT}/api/curriculum/ide/manifest`);
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
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/api/execute/capabilities`, {
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
      fetch(`http://127.0.0.1:${GW_PORT}/api/execute`, {
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
    assert.equal(stubHits[0].url, "/");
  });
  it("unknown prefix 404s; CORS preflight honored for configured origin", async () => {
    const r404 = await fetch(`http://127.0.0.1:${GW_PORT}/api/nope`);
    assert.equal(r404.status, 404);
    const pre = await fetch(`http://127.0.0.1:${GW_PORT}/api/execute/capabilities`, {
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

  // ---- Sign-out ends the credential, not just the session's ability to renew ----
  // The stub above plays the auth service's denylist: a token that names itself is
  // asked about before the request is trusted, so signing out takes effect on the
  // next request rather than at the end of the token's five minutes.
  const signWithJti = async (sub, jti) => {
    const jwt = (await import("jsonwebtoken")).default;
    return jwt.sign({ sub, jti }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
  };

  it("a signed-out token is refused at the edge and never forwarded", async () => {
    stubHits = [];
    revocationChecks = [];
    revokedJtis.add("revoked-live-1");
    const t = await signWithJti("u-revoked", "revoked-live-1");
    const res = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "token_revoked");
    assert.equal(
      stubHits.find((h) => h.url === "/capabilities"),
      undefined,
      "a revoked token is never forwarded — the whole point"
    );
    assert.deepEqual(revocationChecks, ["revoked-live-1"], "the id is what the service is asked about");
    assert.equal(
      stubHits.find((h) => h.url === "/internal/revocations/check").headers["x-internal-key"],
      MESH,
      "revocation is resolved over the mesh"
    );

    // The same token again: refused from the remembered answer without asking a
    // second time, because a revoked id can never become valid again.
    const again = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(again.status, 401);
    assert.equal(revocationChecks.length, 1, "a revoked id is not re-checked");
  });

  it("a live token is checked on every request and works", async () => {
    stubHits = [];
    revocationChecks = [];
    const t = await signWithJti("u-live-token", "live-live-1");
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
      assert.equal(r.status, 200);
    }
    assert.equal(
      revocationChecks.length,
      2,
      "a clear answer is not cached: that cache would be the window this removes"
    );
  });

  it("an unreachable check is 503, never a silent allow", async () => {
    stubHits = [];
    revocationChecks = [];
    revocationDown = true;
    const t = await signWithJti("u-live-blip", "blip-live-1");
    const res = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, "revocation_unavailable");
    assert.equal(
      stubHits.find((h) => h.url === "/capabilities"),
      undefined,
      "a session we cannot vouch for is not forwarded"
    );
    // The service recovers; nothing about the outage was remembered, so the very
    // next request succeeds instead of waiting out a TTL.
    revocationDown = false;
    const back = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(back.status, 200, "an outage is not sticky");
  });

  it("a confirmed session rides out a short outage, and the bound is what ends the grace period", async () => {
    stubHits = [];
    revocationChecks = [];
    const t = await signWithJti("u-degraded", "degraded-live-1");
    // Confirmed clear while the check is answerable — that confirmation is the only
    // thing the fallback is ever allowed to act on.
    const live = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(live.status, 200);

    revocationDown = true;
    const through = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(through.status, 200, "the auth service is away, but this credential was confirmed moments ago");
    assert.ok(
      stubHits.some((h) => h.url === "/capabilities"),
      "and the request was really forwarded — this is a degraded allow, not a stub"
    );

    // An operator has to be able to see this: the request succeeded, so nothing else
    // in the platform complains, and the only trace of a sign-out that may have gone
    // unseen for a moment is this line.
    let degradedLine = null;
    for (let i = 0; i < 40 && !degradedLine; i++) {
      degradedLine = gwLogLines().find(
        (l) => typeof l.msg === "string" && l.msg.includes("bounded stale answer")
      );
      if (!degradedLine) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(degradedLine, "the degraded allow is logged loudly, not silently served");
    assert.equal(degradedLine.degraded, 1, "and the line says how many requests rode through the window");
    assert.equal(degradedLine.clearTtlMs, 300, "with the bound in force in the same line, so the exposure is readable");

    // The bound (300 ms in this spawn) is what makes it a window and not a policy:
    // past it the same token is refused, so a long outage converges back to failing
    // closed instead of quietly trusting whatever it remembers.
    await new Promise((r) => setTimeout(r, 400));
    const after = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(after.status, 503, "the grace period is over, and the edge says so");
    assert.equal((await after.json()).error.code, "revocation_unavailable");

    // Recovery is immediate: nothing about the outage was remembered, because every
    // request asks the service again the moment it can.
    revocationDown = false;
    const back = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(back.status, 200, "a recovered service is used at once");
  });

  it("a monitor sees the outage and the degradation without reading a log", async () => {
    const t = await signWithJti("u-monitor", "monitor-live-1");
    // Something for the counters to count, and a confirmation for the fallback.
    const live = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(live.status, 200);

    const healthy = await (await fetch(`${GW}/health/deep`)).json();
    assert.equal(healthy.status, "ready", JSON.stringify(healthy));
    assert.equal(healthy.revocations.authService, "reachable");
    assert.equal(healthy.revocations.degraded, false);
    assert.equal(healthy.revocations.outageMs, null);
    assert.equal(healthy.revocations.clearTtlMs, 300, "the bound in force rides with the state it describes");
    assert.ok(healthy.revocations.counters.asked >= 1, "the same counters the report line carries");
    assert.ok(healthy.revocations.fallbackIds >= 1, "and the size of what could ride an outage");

    // Reading the state must not itself ask the auth service: a dashboard polling
    // health should not be part of the traffic it is watching.
    const askedBefore = healthy.revocations.counters.asked;
    await fetch(`${GW}/health/deep`);
    const askedAfter = (await (await fetch(`${GW}/health/deep`)).json()).revocations.counters.asked;
    assert.equal(askedAfter, askedBefore, "health reads do not perform checks");

    revocationDown = true;
    const during = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(during.status, 200, "traffic still flows — which is exactly why this needs a dashboard, not a log");

    const degraded = await (await fetch(`${GW}/health/deep`)).json();
    assert.equal(degraded.status, "degraded", "the edge reports the degradation, not just the mesh");
    assert.equal(degraded.revocations.authService, "unreachable");
    assert.equal(degraded.revocations.degraded, true);
    assert.notEqual(degraded.revocations.outageMs, null, "with how long it has been that way");
    assert.ok(degraded.revocations.counters.unanswered >= 1);
    assert.ok(degraded.revocations.counters.degraded >= 1);
    assert.ok(
      degraded.checks.every((c) => c.ok),
      "the mesh itself is fine: this is the revocation path, and the endpoint says so"
    );

    revocationDown = false;
    const back = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(back.status, 200);
    const recovered = await (await fetch(`${GW}/health/deep`)).json();
    assert.equal(recovered.status, "ready", "and it clears itself once the service answers again");
    assert.equal(recovered.revocations.authService, "reachable");
    assert.equal(recovered.revocations.outageMs, null);
  });

  it("the health-check command fails loudly, and says why", async () => {
    /* The command is the thing an operator actually runs, so it is exercised the way
       they would: spawned as a process, with its exit status and its output read.
       Three states matter — healthy, degraded because the auth service is away, and
       "could not ask at all" — and the last one has its own status on purpose. */
    revocationDown = false;
    healthDown = false;
    // Spawned, not spawnSync: the stub this gateway fans out to lives in *this*
    // process, so a blocking child would starve the very requests the deep check
    // makes — every mesh member would look down, and the test would be measuring
    // its own harness.
    const run = (...args) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(root, "scripts", "healthcheck.mjs"), ...args], { cwd: root });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => (stdout += c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("close", (status) => resolve({ status, stdout, stderr }));
      });

    // A confirmed check, so the revocation state reported below is "reachable".
    const t = await signWithJti("u-health", "health-live-1");
    const live = await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(live.status, 200);

    const healthy = await run(GW);
    assert.equal(healthy.status, 0, `expected healthy, got:\n${healthy.stdout}${healthy.stderr}`);
    assert.match(healthy.stdout, /reports ready/);
    assert.match(healthy.stdout, /revocation check reachable/, "the summary says what it checked");
    assert.equal((await run(GW, "--quiet")).stdout, "", "--quiet exists because cron mails stdout");

    // The auth service stops answering: requests still succeed on the bounded
    // fallback, which is exactly the state a monitor has to be able to see.
    revocationDown = true;
    await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    const degraded = await run(GW, "--json");
    assert.equal(degraded.status, 1, `expected exit 1, got:\n${degraded.stdout}${degraded.stderr}`);
    const parsed = JSON.parse(degraded.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "degraded", "the gateway's own verdict rides along for the monitor");
    assert.equal(parsed.revocations.authService, "unreachable");
    assert.ok(
      parsed.reasons.some((r) => r.includes("auth service is not answering")),
      `the reason names the auth service: ${degraded.stdout}`
    );
    assert.match(JSON.stringify(parsed.reasons), /unanswered/, "and how far the outage has gone");

    const prose = await run(GW);
    assert.equal(prose.status, 1);
    assert.match(prose.stderr, /^FAIL /, "a failure goes to stderr, so cron mails it");
    assert.match(prose.stderr, /auth service is not answering the revocation check/);

    revocationDown = false;
    await fetch(`${GW}/api/execute/capabilities`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal((await run(GW, "--quiet")).status, 0, "and it clears itself once the service answers again");

    // A mesh member's own check failing is reported by name — the `/health/deep`
    // half of the command, which the revocation state is only one part of.
    healthDown = true;
    const mesh = await run(GW);
    assert.equal(mesh.status, 1);
    assert.match(mesh.stderr, /\/api\/auth health check failed/, `expected the failing member named: ${mesh.stderr}`);
    assert.match(mesh.stderr, /gateway status is "degraded"/);
    healthDown = false;

    // Canned replies, for the two shapes the live gateway cannot show. A gateway that
    // has been asked nothing yet is healthy — `unknown` is not a fault, which is the
    // same judgement the endpoint itself makes.
    let cannedBody = null;
    const canned = http.createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(cannedBody));
    });
    await new Promise((r) => canned.listen(18078, "127.0.0.1", r));
    try {
      cannedBody = {
        status: "ready",
        checks: [{ service: "/api/auth", ok: true }],
        revocations: {
          authService: "unknown",
          degraded: false,
          outageMs: null,
          clearTtlMs: 60_000,
          counters: { asked: 0, refused: { credential: 0, account: 0 }, unanswered: 0, degraded: 0, fromCache: 0 },
          fallbackIds: 0,
          cachedRefusals: 0,
        },
      };
      const fresh = await run("http://127.0.0.1:18078");
      assert.equal(fresh.status, 0, `a fresh boot is not degraded: ${fresh.stderr}`);

      // A gateway older than the revocation block must fail loudly rather than pass
      // by omission: "no news" is precisely what this command cannot assess.
      cannedBody = { status: "ready", checks: [] };
      const older = await run("http://127.0.0.1:18078");
      assert.equal(older.status, 2, `expected exit 2, got:\n${older.stdout}${older.stderr}`);
      assert.match(older.stderr, /predates the check/);
    } finally {
      await new Promise((r) => canned.close(r));
    }

    // An endpoint that accepts the connection and then says nothing: the command's
    // own timeout is what stops a crontab entry from piling up, and it has its own
    // reason so the operator knows which failure they are looking at.
    healthHang = true;
    const hung = await run(GW, "--timeout=400");
    assert.equal(hung.status, 2, `expected exit 2, got:\n${hung.stdout}${hung.stderr}`);
    assert.match(hung.stderr, /no reply within 400ms/);
    assert.match(hung.stderr, /exit 2: the check could not do its job/);
    healthHang = false;

    // Nothing listening at all: a different failure from "degraded", and a different
    // status, so a monitor can page the right person rather than the on-call for the
    // platform.
    const gone = await run("http://127.0.0.1:18079", "--timeout=400");
    assert.equal(gone.status, 2, `expected exit 2, got:\n${gone.stdout}${gone.stderr}`);
    assert.match(gone.stderr, /request failed/);
  });

  it("a token that names no id is still verified — there is nothing to revoke", async () => {
    stubHits = [];
    revocationChecks = [];
    const res = await fetch(`${GW}/api/execute/capabilities`, {
      headers: { Authorization: `Bearer ${await sign("u-no-jti")}` },
    });
    assert.equal(res.status, 200);
    assert.equal(revocationChecks.length, 0, "no id, no lookup: an older token is not guessed at");
  });

  // ---- The paid curriculum path, end to end through the real gateway ----
  // Entitlement is resolved once, at the edge: a token goes in, billing is
  // asked, and either the verdict rides downstream (x-entitled) or the request
  // is denied before a single byte of phase content is forwarded. The stub above
  // plays billing; subscriptionMode drives its answer per learner.
  const GW = `http://127.0.0.1:${GW_PORT}`;
  const sign = async (sub) => {
    const jwt = (await import("jsonwebtoken")).default;
    return jwt.sign({ sub }, SECRET, { algorithm: "HS256", expiresIn: "15m" });
  };

  it("a paid phase with no token is 401 at the edge and never forwarded", async () => {
    stubHits = [];
    const res = await fetch(`${GW}/api/curriculum/ide/phases/ui`);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "unauthorized");
    assert.equal(stubHits.length, 0, "denied before billing or the service is asked");
  });

  it("an entitled token reaches the phase with x-entitled injected, bearer stripped", async () => {
    stubHits = [];
    subscriptionMode.set("u-live-entitled", "entitled");
    const res = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${await sign("u-live-entitled")}` },
    });
    assert.equal(res.status, 200);
    const sub = stubHits.find((h) => h.url === "/subscription");
    assert.ok(sub, "the gateway asked billing before forwarding");
    assert.equal(sub.headers["x-user-id"], "u-live-entitled");
    assert.equal(sub.headers["x-internal-key"], MESH, "billing is reached over the mesh");
    const phase = stubHits.find((h) => h.url === "/ide/phases/ui");
    assert.ok(phase, "the phase is forwarded only once billing clears it");
    assert.equal(phase.headers["x-user-id"], "u-live-entitled");
    assert.equal(phase.headers["x-entitled"], "1", "the gate's verdict rides downstream");
    assert.equal(phase.headers["authorization"], undefined, "the bearer never reaches a service");
  });

  it("a non-entitled token is 402 and the phase body is never forwarded", async () => {
    stubHits = [];
    subscriptionMode.set("u-live-broke", "denied");
    const res = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${await sign("u-live-broke")}` },
    });
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error.code, "entitlement_required");
    assert.ok(stubHits.some((h) => h.url === "/subscription"), "billing was asked");
    assert.equal(
      stubHits.find((h) => h.url === "/ide/phases/ui"),
      undefined,
      "a denied learner is never forwarded the phase: 402, not content"
    );
  });

  it("a client-forged x-entitled cannot open the gate", async () => {
    stubHits = [];
    // No token at all, but the client asserts entitlement.
    const anon = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { "x-entitled": "1" },
    });
    assert.equal(anon.status, 401, "entitlement is not a client input");
    // A real token for a non-entitled learner, plus the forged header.
    subscriptionMode.set("u-live-forge", "denied");
    const res = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${await sign("u-live-forge")}`, "x-entitled": "1" },
    });
    assert.equal(res.status, 402, "the forged header does not survive the gate");
    assert.equal(
      stubHits.find((h) => h.url === "/ide/phases/ui"),
      undefined,
      "nothing is forwarded on the strength of a forged header"
    );
  });

  it("a billing outage is 503 (never a denial) and is not cached", async () => {
    stubHits = [];
    subscriptionMode.set("u-live-down", "down");
    const t = await sign("u-live-down");
    const r1 = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(r1.status, 503);
    assert.equal((await r1.json()).error.code, "entitlement_unavailable");
    // Billing recovers. Because "unknown" is never cached, the very next request
    // succeeds with no TTL wait — an outage must not be remembered as a denial.
    subscriptionMode.set("u-live-down", "entitled");
    const r2 = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(r2.status, 200, "a transient outage is not sticky");
  });

  it("a cached denial does not survive a subscription: the webhook drops it", async () => {
    stubHits = [];
    subscriptionMode.set("u-live-flip", "denied");
    const t = await sign("u-live-flip");
    const denied1 = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(denied1.status, 402, "not subscribed yet");
    // The learner subscribes; billing now says entitled, but the denial is
    // cached, so without invalidation this stays 402 until the TTL lapses.
    subscriptionMode.set("u-live-flip", "entitled");
    const denied2 = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(denied2.status, 402, "the denial is still cached — exactly what the webhook fixes");
    // Dodo posts the webhook; the gateway proxies it and drops every verdict.
    const hook = await fetch(`${GW}/api/billing/webhooks/dodo`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ type: "subscription.activated" }),
    });
    assert.equal(hook.status, 200);
    const granted = await fetch(`${GW}/api/curriculum/ide/phases/ui`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    assert.equal(granted.status, 200, "a new subscription bites at once, not after the TTL");
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
    // The attestation contract in miniature: the learner's file lives at a
    // nested path, a suite the platform holds judges it, and an explicit
    // command runs the suite rather than the learner's file.
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


describe("execution saturation (in-process)", () => {
  it("queue refuses work past maxDepth instead of queueing forever", async () => {
    // "Bounded" used to mean only that concurrency was bounded: the waiting set
    // grew without limit, each entry holding a socket and a promise for as long
    // as the runner stayed busy.
    const q = new execQueue.JobQueue(1, 1);
    let release;
    const running = q.run(() => new Promise((r) => { release = r; }));
    const waiting = q.run(async () => "second");
    await assert.rejects(
      () => q.run(async () => "third"),
      (e) => e instanceof execQueue.QueueSaturated
    );
    assert.equal(q.depth, 1, "the refused job was not queued");
    release();
    await running;
    assert.equal(await waiting, "second", "the accepted job still runs FIFO");
    assert.equal(q.maxObserved.n, 1, "concurrency is still respected");
  });
  it("a saturated runner answers 503 with Retry-After and refunds the run", async () => {
    const routes = await import("../services/execution/dist/routes.js");
    const app = await kit.createService("test-execution-saturated");
    const quotas = new execQuotas.Quotas(5, 2);
    // A queue already at capacity: `run` is what stays the same, so stub it.
    const saturatedQueue = {
      concurrency: 1,
      maxDepth: 1,
      get depth() {
        return 1;
      },
      maxObserved: { n: 1 },
      run: async () => {
        throw new execQueue.QueueSaturated(1);
      },
    };
    routes.registerExecutionRoutes(app, { queue: saturatedQueue, quotas, runner: "subprocess" });
    await app.ready();
    try {
      const r = await app.inject({
        method: "POST",
        url: "/execute",
        headers: { "x-user-id": "u-sat", "content-type": "application/json" },
        payload: { language: "node", files: [{ path: "main.js", content: 'console.log(1)' }] },
      });
      assert.equal(r.statusCode, 503, r.body);
      assert.equal(r.json().error.code, "runner_saturated");
      assert.equal(r.headers["retry-after"], "5");
      // Nothing ran, so nothing is charged: the concurrency slot was released
      // by the route's finally and the daily run was refunded.
      assert.equal(quotas.check("u-sat"), null, "no concurrency slot left held");
      assert.equal(quotas.remaining("u-sat"), 5, "the reserved daily run was given back");
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
  it("the classroom endpoints are gone, not unlinked: stages, missions, diagnostic, competencies all 404", async () => {
    // One way to learn — the desktop IDE. The browser-classroom endpoints were
    // deleted with the classroom; a request for one must 404 rather than teach.
    for (const url of [
      "/version",
      "/stages",
      "/missions",
      "/missions?stage=css",
      "/missions/js-counter",
      "/diagnostic/items",
      "/competencies",
    ]) {
      const r = await app.inject({ method: "GET", url });
      assert.equal(r.statusCode, 404, `${url} is gone`);
    }
  });
  it("serves the IDE roadmap publicly: every phase by name and tier, no content", async () => {
    const r = await app.inject({ method: "GET", url: "/ide/manifest" });
    assert.equal(r.statusCode, 200, "the roadmap needs no account");
    const m = r.json().manifest;
    // The phase count grows as the co-author authors content, so pin the
    // INVARIANT, not a magic number: the public roadmap shows every phase in the
    // snapshot (the drift test already pins that snapshot to the IDE source).
    const doc = (await import("../services/curriculum/dist/data/ide-task-manager.js")).IDE_TASK_MANAGER;
    assert.equal(m.phases.length, doc.phases.length, "the whole road is visible, not just the free loop");
    const free = m.phases.filter((p) => p.tier === "free");
    // The free tier is setup + fundamentals (FREE_PHASE_COUNT 2, D-023): a true
    // beginner finishes two complete loops offline before any paywall. Not one.
    assert.equal(free.length, 2, "the free tier is the two leading phases (D-023)");
    assert.deepEqual(
      free.map((p) => p.id),
      ["setup", "fundamentals"],
      "free loop is setup then fundamentals, in order"
    );
    // A roadmap row is a name and a size, never the work itself.
    for (const p of m.phases) {
      assert.deepEqual(
        Object.keys(p).sort(),
        ["activityCount", "authored", "goal", "id", "level", "tier", "title"],
        `manifest row ${p.id} carries only roadmap fields`
      );
    }
    assert.equal(r.headers["x-ide-content-version"]?.length, 12, "the IDE content version rides along");
    assert.match(r.headers["cache-control"], /public/, "the roadmap is cacheable");
  });
  it("reports the IDE content version and shape", async () => {
    const r = await app.inject({ method: "GET", url: "/ide/version" });
    assert.equal(r.statusCode, 200);
    const b = r.json();
    assert.match(b.ideVersion, /^[0-9a-f]{12}$/);
    // Counts move with authored content; assert the endpoint agrees with the
    // snapshot (the drift test pins that snapshot to the IDE source) and that the
    // free tier stays the fixed two-phase D-023 loop.
    const doc = (await import("../services/curriculum/dist/data/ide-task-manager.js")).IDE_TASK_MANAGER;
    assert.equal(b.phases, doc.phases.length, "the version report counts the snapshot the service serves");
    assert.equal(b.freePhases, 2, "the two leading free phases are offline (D-023)");
    assert.ok(b.activities > b.phases, "activities outnumber phases");
  });
  it("refuses a paid phase without a user, then without entitlement, with distinct codes", async () => {
    const noUser = await app.inject({ method: "GET", url: "/ide/phases/ui" });
    assert.equal(noUser.statusCode, 401, "no identity reads as 'sign in'");
    assert.equal(noUser.json().error.code, "unauthorized");
    const noEnt = await app.inject({ method: "GET", url: "/ide/phases/ui", headers: { "x-user-id": "u1" } });
    assert.equal(noEnt.statusCode, 402, "identity but no subscription reads as 'subscribe'");
    assert.equal(noEnt.json().error.code, "entitlement_required");
  });
  it("serves a paid phase to an entitled caller, and never caches it publicly", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/ide/phases/ui",
      headers: { "x-user-id": "u1", "x-entitled": "1" },
    });
    assert.equal(r.statusCode, 200);
    const b = r.json();
    assert.equal(b.phase.id, "ui");
    assert.ok(Array.isArray(b.phase.activities) && b.phase.activities.length > 0);
    assert.equal(
      Object.keys(b.activities).length,
      b.phase.activities.length,
      "only the activities this phase reaches, never the whole document"
    );
    for (const id of b.phase.activities) assert.ok(id in b.activities, `${id} is served with the phase`);
    assert.match(r.headers["cache-control"], /no-store/, "a paid payload never sits in a shared cache");
  });
  it("404s an unknown phase for an entitled caller", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/ide/phases/nope",
      headers: { "x-user-id": "u1", "x-entitled": "1" },
    });
    assert.equal(r.statusCode, 404);
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
        // The atomic claim (M-4): the unique index on event_id is the arbiter,
        // so a duplicate delivery inserts nothing and reports rowCount 0 — the
        // same answer Postgres gives `ON CONFLICT DO NOTHING RETURNING`.
        if (seenEvents.has(params[0])) return { rows: [], rowCount: 0 };
        seenEvents.add(params[0]);
        return { rows: [{ event_id: params[0] }], rowCount: 1 };
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
  it("ignores a correctly-signed event from a foreign business_id (B-31)", async () => {
    // A valid signature proves Dodo sent it, not that it is OUR merchant's.
    // On a reused secret, a foreign subscription.active must touch no state and
    // the event ledger, and still 200 (so the vendor stops retrying).
    process.env.DODO_BUSINESS_ID = "biz_mine";
    seen.length = 0;
    const payload = {
      business_id: "biz_OTHER",
      type: "subscription.active",
      timestamp: new Date().toISOString(),
      data: { id: "sub_foreign", metadata: { user_id: "u-foreign", plan: "pro" } },
    };
    const raw = JSON.stringify(payload);
    const id = "evt_foreign";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signTestVector("whsec-test-1234567890", id, ts, raw);
    const res = await app.inject({
      method: "POST", url: "/webhooks/dodo",
      headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig },
      payload: raw,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, ignored: "business_id" });
    assert.equal(seen.filter((s) => s.sql.includes("billing_subscriptions")).length, 0, "foreign event applied no subscription");
    assert.equal(seen.filter((s) => s.sql.startsWith("INSERT INTO billing_events")).length, 0, "foreign event not recorded");
    delete process.env.DODO_BUSINESS_ID;
  });
  it("ignores a test-mode event in live mode, but honours a live one (B-30)", async () => {
    // The cheapest "free Pro" vector: a sandbox payment must never unlock the
    // live tier. Keyed off DODO_PAYMENTS_BASE (real money), not NODE_ENV.
    process.env.DODO_PAYMENTS_BASE = "https://live.dodopayments.com";
    const ts = String(Math.floor(Date.now() / 1000));
    const post = async (body, id) => {
      const raw = JSON.stringify(body);
      const sig = signTestVector("whsec-test-1234567890", id, ts, raw);
      const res = await app.inject({
        method: "POST", url: "/webhooks/dodo",
        headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig },
        payload: raw,
      });
      return res;
    };
    seen.length = 0;
    const sandbox = await post(
      { business_id: "b1", test_mode: true, type: "subscription.active", timestamp: new Date().toISOString(), data: { id: "sub_sandbox", metadata: { user_id: "u-sandbox", plan: "pro" } } },
      "evt_testmode"
    );
    assert.equal(sandbox.statusCode, 200);
    assert.deepEqual(sandbox.json(), { ok: true, ignored: "test_mode" });
    assert.equal(seen.filter((s) => s.sql.includes("billing_subscriptions")).length, 0, "test-mode event applied no subscription");
    // And a genuine live (non-test) event still applies — we did not break real money.
    seen.length = 0;
    const real = await post(
      { business_id: "b1", test_mode: false, type: "subscription.active", timestamp: new Date().toISOString(), data: { id: "sub_real", metadata: { user_id: "u-real", plan: "pro" } } },
      "evt_live"
    );
    assert.equal(real.statusCode, 200);
    assert.ok(seen.some((s) => s.sql.includes("billing_subscriptions")), "live (non-test) event still applies");
    delete process.env.DODO_PAYMENTS_BASE;
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

describe("auth device flow (in-process, fake pg)", () => {
  // The GitHub-style browser sign-in for the IDE: a device secret the IDE
  // polls with, a short user code the learner approves in the browser, and a
  // token pair issued only after approval. The fake pool stores rows the way
  // the real schema does, so every query the routes issue has an answer.
  let app;
  const devices = new Map();
  const fakePool = {
    query: async (sql, params) => {
      if (sql.startsWith("INSERT INTO device_codes")) {
        const row = {
          id: params[0],
          device_code_hash: params[1],
          user_code: params[2],
          created_at: new Date("2026-01-01T00:00:00Z"),
          expires_at: params[3],
          approved_user_id: null,
          approved_at: null,
          consumed_at: null,
        };
        devices.set(row.id, row);
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT * FROM device_codes WHERE device_code_hash")) {
        const hit = [...devices.values()].find((d) => d.device_code_hash === params[0]);
        return hit ? { rows: [{ ...hit }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT * FROM device_codes WHERE user_code")) {
        const hit = [...devices.values()].find((d) => d.user_code === params[0]);
        return hit ? { rows: [{ ...hit }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("UPDATE device_codes SET approved_user_id")) {
        const row = devices.get(params[1]);
        if (row) {
          row.approved_user_id = params[0];
          row.approved_at = new Date("2026-01-01T00:00:00Z");
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE device_codes SET consumed_at")) {
        const row = devices.get(params[0]);
        // The claim is guarded, and the driver reports the row only when it
        // actually claimed it. The double used to report a row every time,
        // which is how two polls of one code could both mint a session.
        if (row && !row.consumed_at) {
          row.consumed_at = new Date("2026-01-01T00:00:00Z");
          return { rows: [{ id: row.id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT id, email, name, created_at FROM users WHERE id =")) {
        if (params[0] !== "u-device") return { rows: [], rowCount: 0 };
        return {
          rows: [{ id: "u-device", email: "ide@example.com", name: "Ide", created_at: new Date("2026-01-01T00:00:00Z") }],
          rowCount: 1,
        };
      }
      if (sql.startsWith("INSERT INTO refresh_tokens")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  before(async () => {
    process.env.AUTH_JWT_SECRET ??= randomBytes(32).toString("hex");
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/auth/dist/routes.js");
    app = await kit.createService("test-auth-device");
    routes.registerAuthRoutes(app, fakePool);
    await app.ready();
  });
  const start = () =>
    app.inject({ method: "POST", url: "/device/start", headers: { "content-type": "application/json" }, payload: {} });
  it("start issues a secret, a typable code, and a verification URI", async () => {
    const res = await start();
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.match(body.deviceCode, /^[0-9a-f]{64}$/, "the device secret is 32 random bytes, hex");
    assert.match(body.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, "the user code is 8 unambiguous characters");
    assert.ok(!/[01IO]/.test(body.userCode.replace("-", "")), "no character the learner can mistype");
    assert.equal(body.verificationUri, "/auth/ide");
    assert.equal(body.expiresIn, 900);
  });
  it("two codes never collide, and the secret is stored hashed", async () => {
    const a = (await start()).json();
    const b = (await start()).json();
    assert.notEqual(a.deviceCode, b.deviceCode);
    assert.notEqual(a.userCode, b.userCode);
    const stored = [...devices.values()].map((d) => d.device_code_hash);
    assert.ok(!stored.includes(a.deviceCode), "the raw secret is never what is stored");
  });
  it("polling before approval stays pending, and an unknown secret does too", async () => {
    const { deviceCode } = (await start()).json();
    const pending = await app.inject({
      method: "POST", url: "/device/poll",
      headers: { "content-type": "application/json" },
      payload: { deviceCode },
    });
    assert.equal(pending.statusCode, 200);
    assert.equal(pending.json().status, "pending");
    const unknown = await app.inject({
      method: "POST", url: "/device/poll",
      headers: { "content-type": "application/json" },
      payload: { deviceCode: "0".repeat(64) },
    });
    assert.equal(unknown.json().status, "pending", "an unknown secret is pending, never an error to mine");
  });
  it("approve needs a signed-in learner, and a wrong code is a 404", async () => {
    const anon = await app.inject({
      method: "POST", url: "/device/approve",
      headers: { "content-type": "application/json" },
      payload: { userCode: "AAAA-BBBB" },
    });
    assert.equal(anon.statusCode, 401);
    const wrong = await app.inject({
      method: "POST", url: "/device/approve",
      headers: { "content-type": "application/json", "x-user-id": "u-device" },
      payload: { userCode: "ZZZZ-ZZZZ" },
    });
    assert.equal(wrong.statusCode, 404);
  });
  it("approve then poll issues exactly one token pair for the approver", async () => {
    const { deviceCode, userCode } = (await start()).json();
    const approval = await app.inject({
      method: "POST", url: "/device/approve",
      headers: { "content-type": "application/json", "x-user-id": "u-device" },
      payload: { userCode },
    });
    assert.equal(approval.statusCode, 200);
    assert.equal(approval.json().ok, true);
    const poll = await app.inject({
      method: "POST", url: "/device/poll",
      headers: { "content-type": "application/json" },
      payload: { deviceCode },
    });
    assert.equal(poll.statusCode, 200);
    const body = poll.json();
    assert.equal(body.status, "approved");
    assert.equal(body.user.email, "ide@example.com");
    assert.ok(body.tokens.accessToken.length > 0 && body.tokens.refreshToken.length > 0);
    const replay = await app.inject({
      method: "POST", url: "/device/poll",
      headers: { "content-type": "application/json" },
      payload: { deviceCode },
    });
    assert.equal(replay.json().status, "pending", "a consumed code cannot mint a second session");
    const reused = await app.inject({
      method: "POST", url: "/device/approve",
      headers: { "content-type": "application/json", "x-user-id": "u-device" },
      payload: { userCode },
    });
    assert.equal(reused.statusCode, 404, "an approved code cannot be approved again");
  });
  it("two polls of one code mint exactly one session", async () => {
    const { deviceCode, userCode } = (await start()).json();
    await app.inject({
      method: "POST", url: "/device/approve",
      headers: { "content-type": "application/json", "x-user-id": "u-device" },
      payload: { userCode },
    });
    // The race the claim exists for: two polls of one code, both of which can
    // read it as unconsumed before either has claimed it, must not both come
    // away with a session.
    const poll = () => app.inject({
      method: "POST", url: "/device/poll",
      headers: { "content-type": "application/json" },
      payload: { deviceCode },
    });
    const [a, b] = await Promise.all([poll(), poll()]);
    const statuses = [a.json().status, b.json().status].sort();
    assert.deepEqual(statuses, ["approved", "pending"], "exactly one poll may claim the code");
  });
});

describe("auth login throttle (in-process, fake pg)", () => {
  let app;
  const PASSWORD = "correct-horse-battery";
  let passwordHash;
  const fakePool = {
    query: async (sql, params) => {
      if (sql.startsWith("SELECT * FROM users WHERE lower(email)")) {
        return {
          rows: [
            {
              id: "u-throttle",
              email: params[0],
              name: "Throttle",
              created_at: new Date("2026-01-01T00:00:00Z"),
              password_hash: passwordHash,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  before(async () => {
    passwordHash = await authCrypto.hashPassword(PASSWORD);
    const kit = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/auth/dist/routes.js");
    app = await kit.createService("test-auth-throttle");
    routes.registerAuthRoutes(app, fakePool);
    await app.ready();
  });
  // Each attempt comes from its own address, exactly as the gateway would
  // forward them, so the address budget can never be what trips a test.
  const attempt = (password, ip, email = "target@test.dev") =>
    app.inject({
      method: "POST",
      url: "/login",
      headers: { "content-type": "application/json", "x-client-ip": ip },
      payload: { email, password },
    });
  it("counts failures per account across many addresses, and a success clears it", async () => {
    const saved = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = SECRET; // the success path mints a token
    try {
      for (let i = 0; i < 9; i++) {
        const r = await attempt("wrong-password", `198.51.100.${i}`);
        assert.equal(r.statusCode, 401, `failure ${i} from a fresh address is a plain 401`);
      }
      const ok = await attempt(PASSWORD, "198.51.100.200");
      assert.equal(ok.statusCode, 200, "the right password still works below the threshold");
      // Nine more failures: they only reach 9 because the success cleared the
      // count. Without the clear this loop would trip at the first iteration.
      for (let i = 0; i < 9; i++) {
        const r = await attempt("wrong-password", `203.0.113.${i}`);
        assert.equal(r.statusCode, 401, `post-clear failure ${i} is still a plain 401`);
      }
      const tenth = await attempt("wrong-password", "203.0.113.250");
      assert.equal(tenth.statusCode, 401);
      const locked = await attempt("wrong-password", "203.0.113.251");
      assert.equal(locked.statusCode, 429, "the account budget trips independently of the address");
      assert.match(locked.json().error.message, /failed sign-in attempts for this account/);
      // While locked, the CORRECT password is refused too, so the lock cannot be
      // used as an oracle for whether a guess was right.
      const rightWhileLocked = await attempt(PASSWORD, "203.0.113.252");
      assert.equal(rightWhileLocked.statusCode, 429);
    } finally {
      if (saved === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved;
    }
  });
  it("one address exhausting its own budget does not lock out other addresses", async () => {
    // The old limiter keyed on req.ip, which for gateway traffic IS the gateway,
    // so eleven requests a minute denied sign-in to every learner at once.
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const r = await attempt("wrong-password", "192.0.2.77", "addr-a@test.dev");
      statuses.push(r.statusCode);
    }
    assert.equal(statuses[0], 401, "the budget starts out available");
    assert.equal(statuses.at(-1), 429, "one address does run out of its own budget");
    // A different address (and a different account, so the account budget is
    // fresh) is untouched: the budget is per client, not one global bucket.
    const other = await attempt("wrong-password", "192.0.2.78", "addr-b@test.dev");
    assert.equal(other.statusCode, 401, "another client is not collaterally throttled");
  });
});

/* Attestation judging mirrors the IDE's tap.ts: the server re-judges from TAP
   it produced itself, with the same line shape and the same present-AND-passing
   rule. These tests pin the mirror — including the command allowlist that keeps
   the sandbox behind `node --test` — before any route spends it. */
describe("attestation judging mirrors the IDE", async () => {
  const attest = await import("../services/execution/dist/attest.js");

  it("parses TAP the way the extension does", () => {
    const tap = [
      "TAP version 13",
      "ok 1 - a discounted basket totals less than the net",
      "not ok 2 - the threshold decides which total is returned",
      "# fail 1 of 2",
    ].join("\n");
    assert.deepEqual(attest.parseTap(tap), [
      { name: "a discounted basket totals less than the net", passed: true },
      { name: "the threshold decides which total is returned", passed: false },
    ]);
    assert.deepEqual(attest.parseTap("no tap here\njust logs\n"), []);
  });

  it("passes only checks whose every named test ran and passed", () => {
    const results = attest.parseTap("ok 1 - a\nnot ok 2 - b\n");
    const [pass, fail, missing] = attest.judgeAttestChecks(
      [
        { id: "x", tests: ["a"] },
        { id: "y", tests: ["b"] },
        { id: "z", tests: ["never-ran"] },
      ],
      results
    );
    assert.equal(pass.passed, true);
    assert.equal(fail.passed, false);
    assert.equal(missing.passed, false);
    assert.match(missing.reason, /No run on record/);
  });

  it("honors the suite's own not-run the way the extension does", () => {
    // The go-ship container check on a machine with no Docker daemon: TAP's
    // `# SKIP` directive is the only not-run the wire format has, and both
    // tiers must read it as present-but-not-run — never as a missing test,
    // never as a failure the learner owns. This sandbox has no daemon either,
    // so the re-run produces the same directive and the same green-with-
    // reason verdict as the IDE did.
    const wall = [
      "ok 1 - the image is built in stages",
      "ok 2 - the suite passes inside the container # SKIP the Docker daemon is not available on this machine",
    ].join("\n");
    const results = attest.parseTap(wall);
    assert.deepEqual(results[1], {
      name: "the suite passes inside the container",
      passed: true,
      skipped: true,
      skipReason: "the Docker daemon is not available on this machine",
    });
    const [ran, skipped] = attest.judgeAttestChecks(
      [
        { id: "structural", tests: ["the image is built in stages"] },
        { id: "container", tests: ["the suite passes inside the container"] },
      ],
      results
    );
    assert.equal(ran.passed, true);
    assert.equal(skipped.passed, true, "missing infrastructure is never a red verdict on this tier either");
    assert.match(skipped.reason, /Not run here either/);
    assert.match(skipped.reason, /Docker daemon is not available on this machine/);
    // A failure does not get to declare itself not-run after the fact.
    const [failed] = attest.judgeAttestChecks(
      [{ id: "container", tests: ["the suite passes inside the container"] }],
      attest.parseTap("not ok 1 - the suite passes inside the container # SKIP wishful\n")
    );
    assert.equal(failed.passed, false);
  });

  it("allowlists node --test over relative suites, nothing else", () => {
    assert.deepEqual(attest.resolveAttestArgv("node --test --test-reporter=tap test/cart.test.mjs"), [
      "--test",
      "--test-reporter=tap",
      "test/cart.test.mjs",
    ]);
    for (const bad of [
      "npm test",
      "node test/cart.test.mjs",
      "node --test /etc/passwd.test.mjs",
      "node --test ../escape.test.mjs",
      "node --test test/cart.test.mjs; rm -rf /",
      "node --test",
    ]) {
      // ApiError carries the machine code beside the message, so assert on
      // the property rather than the prose.
      try {
        attest.resolveAttestArgv(bad);
        assert.fail(`accepted a command it must refuse: ${bad}`);
      } catch (err) {
        assert.equal(err?.code, "bad_request");
        assert.equal(err?.status, 400);
      }
    }
  });

  it("contracts accept the IDE submission shape and the verdict shape", () => {
    const sub = {
      checkIds: ["covers-discount"],
      checks: [{ id: "covers-discount", tests: ["a discounted basket"] }],
      files: [{ path: "src/cart.js", content: "export const x = 1;\n" }],
      command: "node --test --test-reporter=tap test/cart.test.mjs",
      localTap: "ok 1 - a discounted basket\n",
    };
    assert.ok(contracts.attestSubmissionSchema.safeParse(sub).success);
    assert.ok(!contracts.attestSubmissionSchema.safeParse({ ...sub, checks: [] }).success);
    const verdict = {
      provenance: "attested",
      outcome: "re-judged server-side",
      checks: [{ checkId: "covers-discount", passed: true, reason: "Verified." }],
    };
    assert.ok(contracts.attestVerdictSchema.safeParse(verdict).success);
    assert.ok(!contracts.attestVerdictSchema.safeParse({ ...verdict, provenance: "local" }).success);
  });
});

/* Attestation re-runs what the learner submits against the platform's own copy
   of the suite: a passing verdict means this sandbox ran it, not the learner's
   machine. The registry below stands in for the synced canonical suites; the
   synced-data suite further down proves the real registry judges. In both
   cases the lookup — and every refusal around it — is what is under test, so
   an empty registry must refuse rather than judge. */
describe("attestation re-judges in this sandbox, never on the learner's word", () => {
  let app;
  const KEY = "test-attest-key";
  const saved = process.env.INTERNAL_API_KEY;
  const SUITE = [
    `import test from 'node:test';`,
    `import assert from 'node:assert/strict';`,
    `import { add } from '../src/add.js';`,
    `test('adds two numbers', () => assert.equal(add(2, 3), 5));`,
    "",
  ].join("\n");

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const routes = await import("../services/execution/dist/routes.js");
    app = await kit.createService("test-execution-attest");
    routes.registerExecutionRoutes(app, {
      queue: new execQueue.JobQueue(1),
      quotas: new execQuotas.Quotas(50, 2),
      runner: "subprocess",
      attestFixtures: new Map([["task-manager/test/add.test.mjs", SUITE]]),
    });
    await app.ready();
  });
  after(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = saved;
  });

  const submit = (files, command = "node --test --test-reporter=tap test/add.test.mjs") =>
    app.inject({
      method: "POST",
      url: "/attest",
      headers: { "x-user-id": "u-attest", "x-internal-key": KEY, "content-type": "application/json" },
      payload: {
        checkIds: ["adds"],
        checks: [{ id: "adds", tests: ["adds two numbers"] }],
        files,
        command,
        localTap: "ok 1 - adds two numbers\n",
      },
    });

  it("attests a correct submission after running the canonical suite itself", async () => {
    const r = await submit([{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }]);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    // The verdict shape is exactly what the extension's parseVerdict accepts.
    assert.ok(contracts.attestVerdictSchema.safeParse(body).success);
    assert.equal(body.provenance, "attested");
    assert.deepEqual(body.checks, [
      { checkId: "adds", passed: true, reason: "Verified against your code, re-run on this platform." },
    ]);
  });

  it("the verdict carries the canonical run's receipt — the handoff object", async () => {
    const r = await submit([{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }]);
    assert.equal(r.statusCode, 200, r.body);
    const receipt = r.json().receipt;
    assert.ok(receipt, "an attested verdict hands over proof, not just a claim");
    // The receipt is of THIS run: its files bind the canonical suite the
    // platform ran, and its signature verifies under this deployment's key.
    const payload = contracts.runReceiptPayload(receipt.facts, receipt.issuedAt);
    assert.equal(kit.verifyReceiptSignature(payload, receipt.sig, KEY), true);
    assert.ok(
      receipt.facts.files.some((f) => f.path === "test/add.test.mjs"),
      "the receipt binds the canonical suite, not just the learner's file"
    );
  });

  it("no signing key means an attested verdict with nothing to hand over", async () => {
    const savedKey = process.env.INTERNAL_API_KEY;
    try {
      delete process.env.INTERNAL_API_KEY;
      const r = await submit([{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }]);
      assert.equal(r.statusCode, 200, r.body);
      const body = r.json();
      assert.equal(body.provenance, "attested", "the re-judging is the authority, not the receipt");
      assert.equal("receipt" in body, false, "with no key there is nothing to hand over — and none is faked");
      assert.ok(contracts.attestVerdictSchema.safeParse(body).success);
    } finally {
      if (savedKey === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = savedKey;
    }
  });

  it("fails a broken submission — the learner's own TAP is not evidence", async () => {
    const r = await submit([{ path: "src/add.js", content: "export function add() { return 0; }\n" }]);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    // localTap claimed a pass; the sandbox disagrees, and the sandbox wins.
    assert.equal(body.checks[0].passed, false);
  });

  it("refuses an unregistered suite instead of judging it", async () => {
    const r = await submit(
      [{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }],
      "node --test --test-reporter=tap test/unknown.test.mjs"
    );
    assert.equal(r.statusCode, 503, r.body);
    assert.equal(r.json().error.code, "attestation_unavailable");
  });

  it("rejects a learner file shadowing the canonical suite", async () => {
    const r = await submit([
      { path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" },
      { path: "test/add.test.mjs", content: "import test from 'node:test';\ntest('adds two numbers', () => {});\n" },
    ]);
    assert.equal(r.statusCode, 400, r.body);
  });

  it("refuses a non-test command", async () => {
    const r = await submit(
      [{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }],
      "npm test"
    );
    assert.equal(r.statusCode, 400, r.body);
  });

  it("resolves the suite by project: a bare path is judged under task-manager", async () => {
    // Submissions without a project predate project-qualified keys. The route
    // defaults them to task-manager — the curriculum's own default — so this
    // fixture attests exactly as before, and only there.
    const r = await submit([{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }]);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().checks.filter((c) => !c.passed), []);
  });
});

/* The synced code registry: `npm run sync:fixtures` exports every suite the
   authored curriculum names, keyed project/path, and the execution service
   judges against that copy. Three things are pinned: the committed registry
   equals what the sibling sources emit (drift fails, absence of the sibling
   skips honestly); both owners of a shared relative path are present as
   distinct keys (the merge.test.mjs collision is the reason keys exist); and
   the synced bytes actually judge (a second app wired from the data file, not
   fixtures, attests the setup suite with crafted sources, then fails the
   stub's own broken ones). */
describe("the synced suite registry judges real curriculum suites", () => {
  const dataFile = join(root, "services", "execution", "src", "data", "attest-fixtures.ts");

  it("the committed registry equals what the IDE sources emit", (t) => {
    try {
      execSync("node scripts/sync-fixtures.mjs --check", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      if (/sibling of branchcraft/.test(out)) {
        t.skip("no nexora-ide sibling checkout on this host; the sync cannot be re-derived here");
        return;
      }
      throw new Error(`attestation fixture sync drifted — run npm run sync:fixtures and commit the result:\n${out}`);
    }
  });

  it("every entry is a non-empty suite at a project-qualified key", async () => {
    const mod = await import("../services/execution/dist/data/attest-fixtures.js");
    assert.ok(Array.isArray(mod.SYNCED_ATTEST_FIXTURES) && mod.SYNCED_ATTEST_FIXTURES.length > 0, "the registry is empty");
    const keys = new Set();
    for (const e of mod.SYNCED_ATTEST_FIXTURES) {
      assert.ok(typeof e.key === "string" && e.key.length > 0, "a keyless entry judges nothing");
      assert.ok(e.file.endsWith(".test.mjs"), `${e.key} is not a test suite`);
      assert.ok(typeof e.content === "string" && e.content.trim().length > 0, `${e.key} asserts nothing`);
      assert.ok(!keys.has(e.key), `${e.key} is registered twice`);
      keys.add(e.key);
    }
    // The collision that motivates qualified keys: both merges present, apart.
    assert.ok(keys.has("task-manager/test/merge.test.mjs"), "the task-manager merge suite is registered");
    assert.ok(keys.has("go-ledger/test/merge.test.mjs"), "the go-ledger merge suite is registered apart from it");
    assert.ok(keys.has("task-manager/test/setup.test.mjs"), "the setup suite is registered");
    assert.ok(keys.has("acceptance/takehome.acceptance.test.mjs"), "the take-home suite is registered");
  });

  it("no registry key collides: one key is one suite, byte for byte", async () => {
    const mod = await import("../services/execution/dist/data/attest-fixtures.js");
    const byKey = new Map();
    for (const e of mod.SYNCED_ATTEST_FIXTURES) {
      if (byKey.has(e.key)) {
        assert.equal(e.content, byKey.get(e.key), `${e.key} resolves twice with different bytes`);
      }
      byKey.set(e.key, e.content);
    }
  });

  it("the synced bytes judge: setup attests from the data file, the stub fails it", async () => {
    const KEY = "test-synced-attest-key";
    const saved = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = KEY;
    try {
      const mod = await import("../services/execution/dist/data/attest-fixtures.js");
      const routes = await import("../services/execution/dist/routes.js");
      const synced = new Map(mod.SYNCED_ATTEST_FIXTURES.map((e) => [e.key, e.content]));
      const app = await kit.createService("test-synced-attest-registry");
      routes.registerExecutionRoutes(app, {
        queue: new execQueue.JobQueue(1),
        quotas: new execQuotas.Quotas(50, 2),
        runner: "subprocess",
        attestFixtures: synced,
      });
      await app.ready();
      const submitSetup = (files, project) =>
        app.inject({
          method: "POST",
          url: "/attest",
          headers: { "x-user-id": "u-sync", "x-internal-key": KEY, "content-type": "application/json" },
          payload: {
            checkIds: ["dev-script", "entry-file", "edge-mounts"],
            checks: [
              { id: "dev-script", tests: ["the manifest declares a dev script"] },
              { id: "entry-file", tests: ["the app entry file exists"] },
              { id: "edge-mounts", tests: ["the entry mounts the app into the page's root element"] },
            ],
            files,
            command: "node --test --test-reporter=tap test/setup.test.mjs",
            localTap: "",
            ...(project === undefined ? {} : { project }),
          },
        });
      const good = await submitSetup([
        { path: "package.json", content: JSON.stringify({ name: "app", scripts: { dev: "vite" } }) },
        { path: "src/main.jsx", content: "import { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root'));\n" },
      ]);
      assert.equal(good.statusCode, 200, good.body);
      assert.deepEqual(good.json().checks.filter((c) => !c.passed), [], "a complete starter passes every check");
      const receipt = good.json().receipt;
      assert.ok(receipt, "an attested run hands over proof, not just a claim");
      assert.ok(
        receipt.facts.files.some((f) => f.path === "test/setup.test.mjs"),
        "the receipt binds the canonical suite, not just the learner's files"
      );
      // The stub's own broken package.json (no dev script) fails exactly its check.
      const broken = await submitSetup([
        { path: "package.json", content: JSON.stringify({ name: "task-manager-stub", scripts: { test: "node --test" } }) },
        { path: "src/main.jsx", content: "document.getElementById('root');\n" },
      ]);
      assert.equal(broken.statusCode, 200, broken.body);
      const failed = new Set(broken.json().checks.filter((c) => !c.passed).map((c) => c.checkId));
      assert.deepEqual([...failed].sort(), ["dev-script"], "only the dev-script check fails on the stub");
      // A project that names the wrong merge suite gets its verdict from the
      // right one: go-ledger sources against the go-ledger merge suite.
      const goMerge = synced.get("go-ledger/test/merge.test.mjs");
      assert.ok(goMerge && goMerge.length > 0, "the go-ledger merge harness synced");
      const taskMerge = synced.get("task-manager/test/merge.test.mjs");
      assert.ok(taskMerge && taskMerge.length > 0 && taskMerge !== goMerge, "the two merges are apart");
    } finally {
      if (saved === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = saved;
    }
  });

  it("an unknown project refuses rather than guessing a suite", async () => {
    const saved = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = "test-synced-attest-key";
    try {
      const mod = await import("../services/execution/dist/data/attest-fixtures.js");
      const routes = await import("../services/execution/dist/routes.js");
      const synced = new Map(mod.SYNCED_ATTEST_FIXTURES.map((e) => [e.key, e.content]));
      const app = await kit.createService("test-synced-attest-unknown-project");
      routes.registerExecutionRoutes(app, {
        queue: new execQueue.JobQueue(1),
        quotas: new execQuotas.Quotas(50, 2),
        runner: "subprocess",
        attestFixtures: synced,
      });
      await app.ready();
      const r = await app.inject({
        method: "POST",
        url: "/attest",
        headers: { "x-user-id": "u-sync", "x-internal-key": "test-synced-attest-key", "content-type": "application/json" },
        payload: {
          checkIds: ["dev-script"],
          checks: [{ id: "dev-script", tests: ["the manifest declares a dev script"] }],
          files: [{ path: "package.json", content: "{}" }],
          command: "node --test --test-reporter=tap test/setup.test.mjs",
          localTap: "",
          project: "no-such-project",
        },
      });
      assert.equal(r.statusCode, 503, r.body);
      assert.equal(r.json().error.code, "attestation_unavailable");
    } finally {
      if (saved === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = saved;
    }
  });
});

/* Design attestation is the structural analogue of a code run: the platform
   re-derives only the deterministic checks over the learner's graph — never the
   AI-scored rubric — and signs that outcome. These fixtures are the shared
   yardstick: the url-shortener canonical checks (mirrored from the extension's
   design-challenges), a graph that satisfies every check, and one that fails
   several. Two suites follow — the mirror of the Studio engine, then the route
   around it — the same shape as the tap.ts/attest.ts twin check for code. */
const URL_CHECKS = [
  { id: "has-client", kind: "requires-node", node: "client" },
  { id: "has-entry", kind: "requires-any", nodes: ["cdn", "dns", "load-balancer", "api-gateway"] },
  { id: "has-service", kind: "requires-node", node: "service" },
  { id: "has-store", kind: "requires-any", nodes: ["sql", "nosql"] },
  { id: "read-path-cache", kind: "requires-path", from: "client", to: "cache" },
  { id: "service-reads-cache", kind: "requires-edge", from: "service", to: "cache", edge: "sync" },
  { id: "service-writes-store", kind: "requires-edge", from: "service", to: ["sql", "nosql"] },
  { id: "no-direct-client-sql", kind: "forbids-edge", from: "client", to: "sql" },
  { id: "no-direct-client-nosql", kind: "forbids-edge", from: "client", to: "nosql" },
  { id: "store-replicates", kind: "requires-prop", node: ["sql", "nosql"], prop: "replication" },
  { id: "has-observability", kind: "requires-any", nodes: ["monitoring", "logging"] },
  { id: "no-dangling", kind: "no-dangling" },
];

// A graph that satisfies every structural check above — the machine-decidable
// floor of the challenge. No rubric, no model score: exactly what a design
// receipt is allowed to stand for.
const GOOD_GRAPH = {
  nodes: [
    { id: "client", type: "client", props: {} },
    { id: "cdn", type: "cdn", props: {} },
    { id: "api-gateway", type: "api-gateway", props: {} },
    { id: "service", type: "service", props: {} },
    { id: "cache", type: "cache", props: {} },
    { id: "sql", type: "sql", props: { replication: "primary-replica" } },
    { id: "monitoring", type: "monitoring", props: {} },
  ],
  edges: [
    { from: "client", to: "cdn", kind: "sync" },
    { from: "cdn", to: "api-gateway", kind: "sync" },
    { from: "api-gateway", to: "service", kind: "sync" },
    { from: "service", to: "cache", kind: "sync" },
    { from: "service", to: "sql", kind: "sync" },
    { from: "monitoring", to: "service", kind: "observe" },
  ],
};

// A graph that reaches the store straight from the client, never replicates, and
// strands the cache: several checks must fail closed. Whatever the learner's own
// tool claimed, the platform re-derives from the graph, and disagrees.
const BROKEN_GRAPH = {
  nodes: [
    { id: "client", type: "client", props: {} },
    { id: "service", type: "service", props: {} },
    { id: "sql", type: "sql", props: {} },
    { id: "cache", type: "cache", props: {} },
  ],
  edges: [
    { from: "client", to: "sql", kind: "sync" },
    { from: "service", to: "sql", kind: "sync" },
  ],
};

describe("design judging mirrors the Studio engine, structural checks only", async () => {
  const design = await import("../services/execution/dist/designAttest.js");

  it("passes every structural check a well-formed graph satisfies", () => {
    const results = design.judgeDesignChecks(GOOD_GRAPH, URL_CHECKS);
    assert.equal(results.length, URL_CHECKS.length);
    assert.deepEqual(
      results.filter((r) => !r.passed).map((r) => r.checkId),
      [],
      "the reference graph must satisfy every check"
    );
    assert.match(results[0].reason, /platform/i, "a passing reason names where the judgment came from");
  });

  it("fails the checks a broken graph does not satisfy, and never fabricates a pass", () => {
    const byId = new Map(design.judgeDesignChecks(BROKEN_GRAPH, URL_CHECKS).map((r) => [r.checkId, r.passed]));
    assert.equal(byId.get("has-entry"), false, "no entry tier present");
    assert.equal(byId.get("no-direct-client-sql"), false, "a client wired straight to the store must fail");
    assert.equal(byId.get("store-replicates"), false, "a store with no replication property must fail");
    assert.equal(byId.get("no-dangling"), false, "a stranded cache node must fail");
    assert.equal(byId.get("has-client"), true, "the parts that do hold still hold");
  });

  it("reads nothing but the graph and the canonical checks it is handed", () => {
    // judgeDesignChecks has no client-verdict parameter at all — the only way a
    // submission can attest is to be re-judged here. A broken graph judged
    // against the canonical checks can never come back all-pass.
    const judged = design.judgeDesignChecks(BROKEN_GRAPH, URL_CHECKS);
    assert.ok(judged.some((r) => !r.passed), "a broken graph cannot be all-pass");
  });

  it("hashes the graph canonically: same structure in a different draw order, same hash", () => {
    const shuffled = { nodes: [...GOOD_GRAPH.nodes].reverse(), edges: [...GOOD_GRAPH.edges].reverse() };
    assert.equal(design.canonicalGraphHash(GOOD_GRAPH), design.canonicalGraphHash(shuffled), "draw order is not content");
    assert.notEqual(design.canonicalGraphHash(GOOD_GRAPH), design.canonicalGraphHash(BROKEN_GRAPH), "different structure hashes differently");
  });

  it("the compiled Studio and this platform agree, check for check, on the same graph", async (t) => {
    // The twin of the tap.ts/attest.ts equivalence, done by importing both
    // engines over the same fixtures. Skips honestly if the IDE is not compiled
    // on this host, because the platform side is fully pinned on its own above.
    let ide;
    try {
      ide = await import(pathToFileURL(join(root, "..", "..", "nexora-ide", "extensions", "nexora", "out", "design.js")).href);
    } catch {
      t.skip("no compiled Studio design.js on this host; the platform engine is pinned above");
      return;
    }
    for (const graph of [GOOD_GRAPH, BROKEN_GRAPH]) {
      const plat = design.judgeDesignChecks(graph, URL_CHECKS).map((r) => [r.checkId, r.passed]);
      const ideRes = ide.evaluateStructure(graph, URL_CHECKS).map((r) => [r.id, r.passed]);
      assert.deepEqual(plat.map(([k]) => k), ideRes.map(([k]) => k), "same checks in the same order");
      assert.deepEqual(new Map(plat), new Map(ideRes), "platform and Studio disagreed on a structural check");
    }
  });

  it("contracts accept the design submission and verdict shapes, and reject a local provenance", () => {
    const sub = { challengeId: "url-shortener", graph: GOOD_GRAPH };
    assert.ok(contracts.designAttestSubmissionSchema.safeParse(sub).success);
    assert.ok(contracts.designAttestSubmissionSchema.safeParse({ ...sub, challengeVersion: 1 }).success, "a named revision parses");
    assert.ok(!contracts.designAttestSubmissionSchema.safeParse({ ...sub, challengeVersion: 0 }).success, "revision 0 is not a revision");
    assert.ok(!contracts.designAttestSubmissionSchema.safeParse({ graph: GOOD_GRAPH }).success, "no challenge id");
    assert.ok(
      !contracts.designAttestSubmissionSchema.safeParse({ challengeId: "x", graph: { nodes: [], edges: [] } }).success,
      "an empty graph is not a submission"
    );
    const verdict = {
      provenance: "attested",
      outcome: "re-derived server-side",
      checks: [{ checkId: "has-client", passed: true, reason: "Verified." }],
      challengeVersion: 1,
    };
    assert.ok(contracts.designAttestVerdictSchema.safeParse(verdict).success);
    assert.ok(!contracts.designAttestVerdictSchema.safeParse({ ...verdict, provenance: "local" }).success, "a local design must never parse as an attested verdict");
  });
});

describe("design attestation re-judges against the platform's own checks", () => {
  let app;
  const KEY = "test-design-attest-key";
  const saved = process.env.INTERNAL_API_KEY;

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const routes = await import("../services/execution/dist/routes.js");
    app = await kit.createService("test-design-attestation");
    routes.registerExecutionRoutes(app, {
      queue: new execQueue.JobQueue(1),
      quotas: new execQuotas.Quotas(50, 2),
      runner: "subprocess",
      attestChallenges: new Map([["url-shortener", { version: 1, checks: URL_CHECKS }]]),
    });
    await app.ready();
  });
  after(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = saved;
  });

  const submit = (challengeId, graph, challengeVersion = 1) =>
    app.inject({
      method: "POST",
      url: "/attest/design",
      headers: { "x-user-id": "u-design", "x-internal-key": KEY, "content-type": "application/json" },
      payload: { challengeId, challengeVersion, graph },
    });

  it("attests a graph that satisfies the platform's canonical checks", async () => {
    const r = await submit("url-shortener", GOOD_GRAPH);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.ok(contracts.designAttestVerdictSchema.safeParse(body), r.body);
    assert.equal(body.provenance, "attested");
    assert.equal(body.challengeVersion, 1, "the verdict names the authored revision actually judged");
    assert.deepEqual(body.checks.filter((c) => !c.passed), [], "every structural check held");
  });

  it("the receipt is bound to the requesting learner, and a rebinding fails closed", async () => {
    const bound = await app.inject({
      method: "POST",
      url: "/attest/design",
      headers: { "x-user-id": "u-owner", "x-internal-key": KEY, "content-type": "application/json" },
      payload: { challengeId: "url-shortener", challengeVersion: 1, graph: GOOD_GRAPH },
    });
    assert.equal(bound.statusCode, 200, bound.body);
    const receipt = bound.json().receipt;
    assert.equal(receipt.facts.userId, "u-owner", "the mint names whose verdict this is");
    // Another account holding the bytes cannot re-point them at themselves:
    // the signature covers the bound user, so the edit breaks both halves.
    const stolen = JSON.parse(JSON.stringify(receipt));
    stolen.facts.userId = "u-thief";
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt: stolen },
    });
    assert.equal(v.statusCode, 200, v.body);
    assert.equal(v.json().valid, false, "a re-pointed receipt verifies as nothing");
  });

  it("a receipt minted before the binding still verifies on its original bytes", async () => {
    // No userId anywhere: the pre-binding shape. Recomputation omits the
    // absent key, so the signature made then checks out now.
    const facts = {
      kind: "design",
      challengeId: "url-shortener",
      graphSha256: "b".repeat(64),
      checks: [{ checkId: "has-client", passed: true, reason: "Re-derived." }],
      runner: "platform",
    };
    const issuedAt = new Date().toISOString();
    const receipt = { v: 1, issuedAt, facts, sig: kit.signReceipt(contracts.designReceiptPayload(facts, issuedAt), KEY) };
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt },
    });
    assert.equal(v.statusCode, 200, v.body);
    assert.equal(v.json().valid, true, "the migration must not orphan old receipts");
  });

  it("refuses a revision the registry does not hold instead of misjudging it", async () => {
    // The submission names revision 2's checks; the registry holds revision 1.
    // Judging it anyway could fail work the learner never saw — so the platform
    // refuses with the mismatch stated, and the design keeps counting as
    // practiced on the IDE side.
    const r = await submit("url-shortener", GOOD_GRAPH, 2);
    assert.equal(r.statusCode, 409, r.body);
    assert.equal(r.json().error.code, "version_mismatch");
    assert.match(r.json().error.message, /revision 1/, "the refusal names the revision actually judged");
  });

  it("an IDE too old to name a revision is still judged, not stranded", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/attest/design",
      headers: { "x-user-id": "u-design", "x-internal-key": KEY, "content-type": "application/json" },
      payload: { challengeId: "url-shortener", graph: GOOD_GRAPH },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().challengeVersion, 1, "the verdict still names what was judged");
  });

  it("the verdict carries a design receipt bound to the graph, and /verify re-derives it", async () => {
    const r = await submit("url-shortener", GOOD_GRAPH);
    const receipt = r.json().receipt;
    assert.ok(receipt, "an attested design hands over proof, not just a claim");
    assert.equal(receipt.facts.kind, "design");
    assert.equal(receipt.facts.challengeId, "url-shortener");
    assert.ok(/^[0-9a-f]{64}$/.test(receipt.facts.graphSha256), "the graph is bound by its canonical hash");
    const payload = contracts.designReceiptPayload(receipt.facts, receipt.issuedAt);
    assert.equal(kit.verifyReceiptSignature(payload, receipt.sig, KEY), true);
    // The public surface branches on facts.kind and projects the structural verdict.
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt },
    });
    assert.equal(v.statusCode, 200, v.body);
    const body = v.json();
    assert.equal(body.valid, true);
    assert.equal(body.kind, "design");
    assert.equal(body.offlineVerifiable, false, "HMAC-only without a receipt key");
    assert.ok(Array.isArray(body.checks) && body.checks.length > 0 && body.checks.every((c) => c.passed), "a verified design reports the checks that passed");
  });

  it("a graph the platform judges as failing is reported as failing, even though it is attested", async () => {
    // There is no client verdict to trust here; the platform's canonical checks
    // decide. Provenance is still 'attested' — the re-judging is the authority —
    // but a pass is never fabricated for a graph that does not hold.
    const r = await submit("url-shortener", BROKEN_GRAPH);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.equal(body.provenance, "attested");
    const failed = new Set(body.checks.filter((c) => !c.passed).map((c) => c.checkId));
    assert.ok(failed.has("has-entry"), "the broken graph is not allowed to read as a pass");
    assert.ok(failed.has("no-direct-client-sql"), "a client wired to the store fails the forbidden-edge check");
  });

  it("refuses an unregistered challenge instead of judging it", async () => {
    const r = await submit("not-registered", GOOD_GRAPH);
    assert.equal(r.statusCode, 503, r.body);
    assert.equal(r.json().error.code, "attestation_unavailable");
  });

  it("no signing key means an attested verdict with nothing to hand over", async () => {
    const savedKey = process.env.INTERNAL_API_KEY;
    try {
      delete process.env.INTERNAL_API_KEY;
      const r = await submit("url-shortener", GOOD_GRAPH);
      assert.equal(r.statusCode, 200, r.body);
      const body = r.json();
      assert.equal(body.provenance, "attested", "the re-judging is the authority, not the receipt");
      assert.equal("receipt" in body, false, "with no key there is nothing to hand over — and none is faked");
    } finally {
      if (savedKey === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = savedKey;
    }
  });

  it("mints the offline signature when a receipt key is configured, and /verify names it", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const savedEd = process.env.RECEIPT_ED25519_KEY;
    const savedId = process.env.RECEIPT_KEY_ID;
    try {
      process.env.RECEIPT_ED25519_KEY = pem;
      process.env.RECEIPT_KEY_ID = "ed-test";
      const r = await submit("url-shortener", GOOD_GRAPH);
      assert.equal(r.statusCode, 200, r.body);
      const receipt = r.json().receipt;
      assert.equal(typeof receipt.sigEd, "string", "the offline signature rides along");
      assert.equal(receipt.keyId, "ed-test", "rotation has a name");
      assert.ok(contracts.designReceiptSchema.safeParse(receipt).success, "the dual-signed design receipt matches the contract");
      const v = await app.inject({
        method: "POST",
        url: "/verify",
        headers: { "content-type": "application/json", "x-internal-key": KEY },
        payload: { receipt },
      });
      assert.equal(v.json().verifiedBy, "ed25519", "Ed25519 wins when present");
      assert.equal(v.json().offlineVerifiable, true);
    } finally {
      if (savedEd === undefined) delete process.env.RECEIPT_ED25519_KEY;
      else process.env.RECEIPT_ED25519_KEY = savedEd;
      if (savedId === undefined) delete process.env.RECEIPT_KEY_ID;
      else process.env.RECEIPT_KEY_ID = savedId;
    }
  });
});

/* The design-challenge sync: the platform judges only its own canonical copy
   of each challenge's structural checks, and that copy is generated — from the
   IDE curriculum by `npm run sync:design` — never hand-written. Three things
   are pinned: the committed registry equals what the sibling source emits
   (drift fails, absence of the sibling skips honestly); the registry holds
   only what the platform judges (no rubric, reference, or teachable content);
   and the synced bytes actually judge (a second app wired from the data file,
   not fixtures, attests the reference-shaped graph and refuses a stale
   revision). */
describe("the synced design registry is generated, minimal, and judgable", () => {
  const dataFile = join(root, "services", "execution", "src", "data", "design-challenges.ts");

  it("the committed registry equals what the IDE source emits", (t) => {
    try {
      execSync("node scripts/sync-design.mjs --check", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      if (/sibling of branchcraft/.test(out)) {
        t.skip("no nexora-ide sibling checkout on this host; the sync cannot be re-derived here");
        return;
      }
      throw new Error(`design-challenge sync drifted — run npm run sync:design and commit the result:\n${out}`);
    }
  });

  it("every synced entry is a versioned check set of known kinds", async () => {
    const mod = await import("../services/execution/dist/data/design-challenges.js");
    assert.ok(Array.isArray(mod.SYNCED_DESIGN_CHALLENGES) && mod.SYNCED_DESIGN_CHALLENGES.length > 0, "the registry is empty");
    const known = new Set(["requires-node", "requires-any", "requires-edge", "requires-path", "forbids-edge", "requires-prop", "no-dangling"]);
    for (const e of mod.SYNCED_DESIGN_CHALLENGES) {
      assert.ok(Number.isInteger(e.version) && e.version >= 1, `${e.id} ships no authored revision`);
      assert.ok(Array.isArray(e.checks) && e.checks.length > 0, `${e.id} holds no checks`);
      for (const c of e.checks) {
        assert.ok(known.has(c.kind), `${e.id} check ${c.id} has kind ${c.kind} the engine cannot judge`);
      }
    }
  });

  it("the registry holds only what the platform judges — nothing teachable", () => {
    const text = readFileSync(dataFile, "utf8");
    for (const leak of ["rubric", "reference", "alternatives", "scenarios", "hints", "misconceptions", "rationale", "guidance"]) {
      assert.doesNotMatch(text, new RegExp(`"${leak}"`), `the synced registry carries ${leak} — the platform must not hold what it does not judge`);
    }
  });

  it("the synced bytes judge: url-shortener attests from the data file, stale refuses", async () => {
    const saved = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = "test-sync-key";
    try {
      const mod = await import("../services/execution/dist/data/design-challenges.js");
      const routes = await import("../services/execution/dist/routes.js");
      const synced = new Map(mod.SYNCED_DESIGN_CHALLENGES.map((e) => [e.id, { version: e.version, checks: e.checks }]));
      const entry = synced.get("url-shortener");
      assert.ok(entry, "url-shortener must be in the synced registry");
      const app = await kit.createService("test-synced-design-registry");
      routes.registerExecutionRoutes(app, {
        queue: new execQueue.JobQueue(1),
        quotas: new execQuotas.Quotas(50, 2),
        runner: "subprocess",
        attestChallenges: synced,
      });
      await app.ready();
      const good = await app.inject({
        method: "POST",
        url: "/attest/design",
        headers: { "x-user-id": "u-sync", "x-internal-key": "test-sync-key", "content-type": "application/json" },
        payload: { challengeId: "url-shortener", challengeVersion: entry.version, graph: GOOD_GRAPH },
      });
      assert.equal(good.statusCode, 200, good.body);
      assert.equal(good.json().challengeVersion, entry.version, "the verdict names the synced revision judged");
      assert.deepEqual(good.json().checks.filter((c) => !c.passed), [], "the fixture graph satisfies the synced checks");
      const stale = await app.inject({
        method: "POST",
        url: "/attest/design",
        headers: { "x-user-id": "u-sync", "x-internal-key": "test-sync-key", "content-type": "application/json" },
        payload: { challengeId: "url-shortener", challengeVersion: entry.version + 1, graph: GOOD_GRAPH },
      });
      assert.equal(stale.statusCode, 409, stale.body);
      assert.equal(stale.json().error.code, "version_mismatch");
    } finally {
      if (saved === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = saved;
    }
  });
});

/* Debugging-lab attestation is the third kind of verdict, and the one that
   cannot be done on the learner's machine: a modelled lab is judged by
   comparing the chosen fix with the cause the lab is built around, and that
   cause IS the answer, so the IDE ships the lab without it and this service
   holds the key. The fixtures below are the shared yardstick — one lab's key
   and a set of attempts that each fail exactly one fact — and the two engines
   (the IDE's incident.ts and this one) are pinned against the same attempts,
   so a client and a server cannot disagree about what an attempt decided. */
const RACE_KEY = {
  id: "incident-race-hang",
  version: 1,
  rootCause: "unsynchronized-write",
  candidateFixes: [
    { id: "serialize-counter-write", addresses: "unsynchronized-write" },
    { id: "retry-on-stale", addresses: "transient-failure" },
    { id: "hold-lock-across-await", addresses: "unsynchronized-write", regression: true },
  ],
  requiredEvidence: ["log-interleave-lost-update", "test-two-writers-one-increment"],
};

const LAB_HYPOTHESIS =
  "Both workers read the same counter value before either writes, so the second write clobbers the first — a lost update, not a bad number.";

const attemptWith = (events, cited = RACE_KEY.requiredEvidence) => ({ events, citedEvidence: cited });
const labHypo = (seq) => ({ seq, kind: "hypothesis", text: LAB_HYPOTHESIS });
const labPick = (seq, fixId) => ({ seq, kind: "choose-fix", fixId });

const GOOD_ATTEMPT = attemptWith([labHypo(0), labPick(1, "serialize-counter-write")]);

describe("debugging-lab judging mirrors the IDE engine, and never grades prose", async () => {
  const incident = await import("../services/execution/dist/incidentAttest.js");

  it("credits the fix that resolves the cause, with the evidence and the hypothesis in place", () => {
    const checks = incident.judgeIncident(RACE_KEY, GOOD_ATTEMPT);
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), []);
    assert.deepEqual(
      checks.map((c) => c.checkId),
      ["fix-resolves-root-cause", "no-regression", "evidence-cited", "hypothesis-precedes-fix"]
    );
    assert.ok(checks.every((c) => typeof c.reason === "string" && c.reason.length > 0), "every check says why");
  });

  it("fails the wrong-cause fix on exactly one fact", () => {
    const checks = incident.judgeIncident(RACE_KEY, attemptWith([labHypo(0), labPick(1, "retry-on-stale")]));
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), ["fix-resolves-root-cause"]);
  });

  it("fails the regression fix on exactly one fact", () => {
    const checks = incident.judgeIncident(RACE_KEY, attemptWith([labHypo(0), labPick(1, "hold-lock-across-await")]));
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), ["no-regression"]);
  });

  it("fails partial evidence on exactly one fact", () => {
    const checks = incident.judgeIncident(
      RACE_KEY,
      attemptWith([labHypo(0), labPick(1, "serialize-counter-write")], [RACE_KEY.requiredEvidence[0]])
    );
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), ["evidence-cited"]);
  });

  it("calls a fix chosen before the hypothesis trial and error", () => {
    const checks = incident.judgeIncident(RACE_KEY, attemptWith([labPick(0, "serialize-counter-write"), labHypo(1)]));
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), ["hypothesis-precedes-fix"]);
  });

  it("credits the fix the learner stands behind, not the first one they clicked", () => {
    const checks = incident.judgeIncident(
      RACE_KEY,
      attemptWith([labPick(0, "retry-on-stale"), labHypo(1), labPick(2, "serialize-counter-write")])
    );
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), []);
  });

  it("gives an attempt with no recorded choice nothing to stand on", () => {
    const checks = incident.judgeIncident(RACE_KEY, attemptWith([labHypo(0)]));
    assert.ok(checks.some((c) => !c.passed), "a guess with no recorded fix earns nothing");
  });

  it("a hypothesis shorter than a sentence is not a hypothesis", () => {
    const checks = incident.judgeIncident(
      RACE_KEY,
      attemptWith([{ seq: 0, kind: "hypothesis", text: "idk" }, labPick(1, "serialize-counter-write")])
    );
    assert.deepEqual(checks.filter((c) => !c.passed).map((c) => c.checkId), ["hypothesis-precedes-fix"]);
  });

  it("judges nothing but the attempt and the key", () => {
    // judgeIncident takes no client verdict at all: the only way a submission
    // can be credited is for the platform to re-derive it here.
    const judged = incident.judgeIncident(RACE_KEY, attemptWith([labHypo(0), labPick(1, "retry-on-stale")]));
    assert.ok(judged.some((c) => !c.passed), "a wrong-cause fix cannot come back all-pass");
  });

  it("the compiled IDE engine and this platform agree, check for check, on the same attempt", async (t) => {
    // The twin of the design check: both engines over the same fixtures, so a
    // learner cannot be told one thing by the IDE and another by the platform.
    let ide;
    try {
      ide = await import(pathToFileURL(join(root, "..", "..", "nexora-ide", "extensions", "nexora", "out", "incident.js")).href);
    } catch {
      t.skip("no compiled incident.js on this host; the platform engine is pinned above");
      return;
    }
    const ideLab = {
      id: RACE_KEY.id,
      title: "The counter that lost a writer",
      goal: "Explain the interleaving before you change anything.",
      mode: "modelled",
      symptom: "Every so often a batch finishes one increment short, and the second worker stops logging.",
      log: ["worker-A read counter=41"],
      failingTests: ["two concurrent increments raise the counter by two"],
      evidence: RACE_KEY.requiredEvidence,
      rootCause: RACE_KEY.rootCause,
      candidateFixes: RACE_KEY.candidateFixes,
      requiredEvidence: RACE_KEY.requiredEvidence,
      hints: ["Look at the order the two workers wrote in."],
    };
    const attempts = [
      GOOD_ATTEMPT,
      attemptWith([labHypo(0), labPick(1, "retry-on-stale")]),
      attemptWith([labHypo(0), labPick(1, "hold-lock-across-await")]),
      attemptWith([labHypo(0), labPick(1, "serialize-counter-write")], [RACE_KEY.requiredEvidence[0]]),
      attemptWith([labPick(0, "serialize-counter-write"), labHypo(1)]),
      attemptWith([labPick(0, "retry-on-stale"), labHypo(1), labPick(2, "serialize-counter-write")]),
      attemptWith([labHypo(0)]),
    ];
    for (const attempt of attempts) {
      const plat = incident.judgeIncident(RACE_KEY, attempt).map((r) => [r.checkId, r.passed]);
      const ideRes = ide.evaluateIncident(ideLab, attempt).checks.map((c) => [c.id, c.passed]);
      assert.deepEqual(plat.map(([k]) => k), ideRes.map(([k]) => k), "same checks in the same order");
      assert.deepEqual(new Map(plat), new Map(ideRes), "platform and IDE disagreed about an attempt");
    }
  });

  it("contracts accept the attempt and the verdict, and refuse a local provenance", () => {
    const sub = { incidentId: "incident-race-hang", attempt: GOOD_ATTEMPT };
    assert.ok(contracts.incidentAttestSubmissionSchema.safeParse(sub).success);
    assert.ok(contracts.incidentAttestSubmissionSchema.safeParse({ ...sub, incidentVersion: 1 }).success, "a named revision parses");
    assert.ok(!contracts.incidentAttestSubmissionSchema.safeParse({ ...sub, incidentVersion: 0 }).success, "revision 0 is not a revision");
    assert.ok(!contracts.incidentAttestSubmissionSchema.safeParse({ attempt: GOOD_ATTEMPT }).success, "no lab id");
    assert.ok(
      !contracts.incidentAttestSubmissionSchema.safeParse({ incidentId: "x", attempt: { events: [], citedEvidence: [] } }).success,
      "an empty log is not an attempt"
    );
    const verdict = {
      provenance: "attested",
      outcome: "re-derived server-side",
      checks: [{ checkId: "fix-resolves-root-cause", passed: true, reason: "Verified." }],
    };
    assert.ok(contracts.incidentAttestVerdictSchema.safeParse(verdict).success);
    assert.ok(
      !contracts.incidentAttestVerdictSchema.safeParse({ ...verdict, provenance: "local" }).success,
      "a local investigation must never parse as an attested verdict"
    );
  });
});

describe("debugging-lab attestation re-judges against the platform's own key", () => {
  let app;
  const KEY = "test-incident-attest-key";
  const saved = process.env.INTERNAL_API_KEY;

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const routes = await import("../services/execution/dist/routes.js");
    app = await kit.createService("test-incident-attestation");
    routes.registerExecutionRoutes(app, {
      queue: new execQueue.JobQueue(1),
      quotas: new execQuotas.Quotas(50, 2),
      runner: "subprocess",
      attestIncidents: new Map([[RACE_KEY.id, RACE_KEY]]),
    });
    await app.ready();
  });
  after(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = saved;
  });

  const submit = (incidentId, attempt, incidentVersion = 1) =>
    app.inject({
      method: "POST",
      url: "/attest/incident",
      headers: { "x-user-id": "u-incident", "x-internal-key": KEY, "content-type": "application/json" },
      payload: { incidentId, incidentVersion, attempt },
    });

  it("judges an attempt against the key the platform holds", async () => {
    const r = await submit(RACE_KEY.id, GOOD_ATTEMPT);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    assert.ok(contracts.incidentAttestVerdictSchema.safeParse(body), r.body);
    assert.equal(body.provenance, "attested");
    assert.deepEqual(body.checks.filter((c) => !c.passed), [], "every check held");
  });

  it("refuses a lab it does not hold, and never a pass or a fail", async () => {
    const r = await submit("incident-not-registered", GOOD_ATTEMPT);
    assert.equal(r.statusCode, 503, r.body);
    assert.equal(r.json().error.code, "attestation_unavailable");
  });

  it("refuses a revision it no longer holds, with the mismatch stated", async () => {
    const r = await submit(RACE_KEY.id, GOOD_ATTEMPT, 99);
    assert.equal(r.statusCode, 409, r.body);
    assert.equal(r.json().error.code, "version_mismatch");
    assert.match(r.json().error.message, /revision/);
  });

  it("the receipt is bound to the attempt, and /verify re-derives it", async () => {
    const r = await submit(RACE_KEY.id, GOOD_ATTEMPT);
    const receipt = r.json().receipt;
    assert.ok(receipt, "an attested investigation hands over proof, not just a claim");
    assert.equal(receipt.facts.kind, "incident");
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt },
    });
    assert.equal(v.statusCode, 200, v.body);
    assert.equal(v.json().valid, true, v.body);
    assert.equal(v.json().kind, "incident");
    assert.equal(v.json().incidentId, RACE_KEY.id);
    assert.ok(Array.isArray(v.json().checks) && v.json().checks.length === 4);
    assert.ok(v.json().checks.every((c) => c.passed), "a verified investigation reports the checks that held");
  });

  it("a receipt re-pointed at another attempt verifies as nothing", async () => {
    const r = await submit(RACE_KEY.id, GOOD_ATTEMPT);
    const receipt = r.json().receipt;
    const tampered = JSON.parse(JSON.stringify(receipt));
    tampered.facts.attemptSha256 = "0".repeat(64);
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt: tampered },
    });
    assert.equal(v.statusCode, 200, v.body);
    assert.equal(v.json().valid, false, "a receipt re-pointed at another attempt verifies as nothing");
  });
});

describe("the synced debugging-lab registry is generated, minimal, and judgable", () => {
  it("the sync is fresh: the committed registry equals what the IDE source emits", () => {
    const dataFile = join(root, "services", "execution", "src", "data", "incidents.ts");
    let out;
    try {
      out = execSync("node scripts/sync-incidents.mjs --check", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      throw new Error(`debugging-lab sync drifted — run npm run sync:incidents and commit the result:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
    }
    assert.ok(out.includes("sync clean"), out);
    assert.ok(existsSync(dataFile));
  });

  it("the registry holds the key and nothing a learner could read", async () => {
    const mod = await import("../services/execution/dist/data/incidents.js");
    assert.ok(Array.isArray(mod.SYNCED_INCIDENTS) && mod.SYNCED_INCIDENTS.length > 0, "the registry is empty");
    for (const entry of mod.SYNCED_INCIDENTS) {
      assert.equal(typeof entry.id, "string");
      assert.equal(typeof entry.rootCause, "string");
      assert.ok(entry.rootCause.length > 0);
      assert.ok(entry.candidateFixes.length > 0);
      assert.ok(entry.requiredEvidence.length > 0);
      const text = JSON.stringify(entry);
      assert.ok(!text.includes("symptom"), "the registry must hold no symptom");
      assert.ok(!text.includes("hints"), "the registry must hold no hints");
      assert.ok(!text.includes("action"), "the registry must hold no fix prose");
      // The run-mode lab is judged by the learner's own suite, so it has no key
      // to hold and is not in the registry.
      assert.notEqual(entry.id, "incident-journal-loss");
    }
  });
});

/* Execution proves someone can write and run a program, and IDE runs happen
   on the learner's own device — so a client could claim a pass it never
   earned. These two suites are the other half of that story: the execution
   service signs what it ran, and attestation refuses anything it cannot
   re-derive from that signature. */
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
    // survive, which is the property attestation leans on.
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

  it("verifies its own receipts for a stranger with no credentials (B-24 public surface)", async () => {
    const r = await runNode();
    assert.equal(r.statusCode, 200, r.body);
    const { receipt } = r.json();
    // No x-user-id: the gateway fronts this as public and injects only the
    // mesh key downstream. The service still authenticates the gateway.
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt },
    });
    assert.equal(v.statusCode, 200, v.body);
    const body = v.json();
    assert.equal(body.valid, true);
    assert.equal(body.fresh, true);
    assert.equal(body.language, "node");
  });

  it("refuses a forged receipt without leaking the key", async () => {
    const r = await runNode();
    const { receipt } = r.json();
    const forged = { ...receipt, sig: "0".repeat(64) };
    const v = await app.inject({
      method: "POST",
      url: "/verify",
      headers: { "content-type": "application/json", "x-internal-key": KEY },
      payload: { receipt: forged },
    });
    assert.equal(v.statusCode, 200, v.body);
    assert.equal(v.json().valid, false);
  });

  it("mints the second signature when a receipt key is configured, and omits it otherwise", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const savedEd = process.env.RECEIPT_ED25519_KEY;
    const savedId = process.env.RECEIPT_KEY_ID;
    try {
      process.env.RECEIPT_ED25519_KEY = pem;
      process.env.RECEIPT_KEY_ID = "ed-test";
      const withKey = await runNode();
      assert.equal(withKey.statusCode, 200, withKey.body);
      const ed = withKey.json().receipt;
      assert.equal(typeof ed.sigEd, "string", "the offline signature rides along");
      assert.equal(ed.keyId, "ed-test", "rotation has a name");
      assert.ok(contracts.runReceiptSchema.safeParse(ed).success, "the dual-signed receipt still matches the contract");

      delete process.env.RECEIPT_ED25519_KEY;
      const withoutKey = await runNode();
      assert.equal(withoutKey.statusCode, 200, withoutKey.body);
      const hmacOnly = withoutKey.json().receipt;
      assert.equal("sigEd" in hmacOnly, false, "no key, no second signature — never faked");
      assert.ok(contracts.runReceiptSchema.safeParse(hmacOnly).success, "HMAC-only receipts still match the contract");
    } finally {
      if (savedEd === undefined) delete process.env.RECEIPT_ED25519_KEY;
      else process.env.RECEIPT_ED25519_KEY = savedEd;
      if (savedId === undefined) delete process.env.RECEIPT_KEY_ID;
      else process.env.RECEIPT_KEY_ID = savedId;
    }
  });

  it("reports which signature verified, and publishes the key for offline checks", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const savedEd = process.env.RECEIPT_ED25519_KEY;
    const savedId = process.env.RECEIPT_KEY_ID;
    const post = (url, payload) =>
      app.inject({ method: "POST", url, headers: { "content-type": "application/json", "x-internal-key": KEY }, payload });
    try {
      process.env.RECEIPT_ED25519_KEY = pem;
      process.env.RECEIPT_KEY_ID = "ed-test";
      const minted = (await runNode()).json().receipt;
      // The platform's own answer names the stronger verification.
      const v = await post("/verify", { receipt: minted });
      assert.equal(v.statusCode, 200, v.body);
      assert.equal(v.json().valid, true);
      assert.equal(v.json().verifiedBy, "ed25519", "Ed25519 wins when present");
      assert.equal(v.json().offlineVerifiable, true);
      // The published key re-derives it with no platform secret involved.
      const k = await app.inject({ method: "GET", url: "/verify-key", headers: { "x-internal-key": KEY } });
      assert.equal(k.statusCode, 200, k.body);
      assert.equal(k.json().algorithm, "Ed25519");
      assert.equal(k.json().keyId, "ed-test");
      const payload = contracts.runReceiptPayload(minted.facts, minted.issuedAt);
      assert.equal(kit.verifyReceiptEd(payload, minted.sigEd, k.json().publicKey), true, "the published key verifies the minted receipt");
      // A stranger's forgery fails on both signatures.
      const forged = await post("/verify", {
        receipt: { ...minted, sig: "0".repeat(64), sigEd: Buffer.from("0".repeat(64)).toString("base64") },
      });
      assert.equal(forged.json().valid, false, "a forgery fails on both signatures");
      // A damaged HMAC alongside a genuine Ed25519 still verifies — the valid
      // signature carries the receipt, and the answer names it.
      const damagedHmac = await post("/verify", { receipt: { ...minted, sig: "0".repeat(64) } });
      assert.equal(damagedHmac.json().valid, true);
      assert.equal(damagedHmac.json().verifiedBy, "ed25519");
    } finally {
      if (savedEd === undefined) delete process.env.RECEIPT_ED25519_KEY;
      else process.env.RECEIPT_ED25519_KEY = savedEd;
      if (savedId === undefined) delete process.env.RECEIPT_KEY_ID;
      else process.env.RECEIPT_KEY_ID = savedId;
    }
  });

  it("verify-key 503s without a receipt key, and verify falls back to the HMAC", async () => {
    const savedEd = process.env.RECEIPT_ED25519_KEY;
    try {
      delete process.env.RECEIPT_ED25519_KEY;
      const k = await app.inject({ method: "GET", url: "/verify-key", headers: { "x-internal-key": KEY } });
      assert.equal(k.statusCode, 503, "an unpublished key is a fact, not a verdict");
      const r = await runNode();
      const v = await app.inject({
        method: "POST",
        url: "/verify",
        headers: { "content-type": "application/json", "x-internal-key": KEY },
        payload: { receipt: r.json().receipt },
      });
      assert.equal(v.json().valid, true);
      assert.equal(v.json().verifiedBy, "hmac", "pre-migration receipts still verify");
      assert.equal(v.json().offlineVerifiable, false, "and say so honestly");
    } finally {
      if (savedEd === undefined) delete process.env.RECEIPT_ED25519_KEY;
      else process.env.RECEIPT_ED25519_KEY = savedEd;
    }
  });
});

describe("boot fail-fast + migrations + sync + compose", () => {
  it("execution refuses the non-isolated subprocess runner in production", () => {
    // Learner code in this tier is a child of the service that holds
    // INTERNAL_API_KEY and DATABASE_URL, sharing its filesystem and network, so
    // production must not start it by default. Requests are made to proof the
    // refusal happens at boot and names the variable rather than at first run.
    const r = spawnSync("node", ["services/execution/dist/index.js"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        EXECUTION_RUNNER: "subprocess",
        EXECUTION_ALLOW_SUBPROCESS: "",
        INTERNAL_API_KEY: MESH,
        PORT: "18993",
      },
      timeout: 15000,
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0, "must not boot");
    const out = r.stderr + r.stdout;
    assert.match(out, /EXECUTION_RUNNER=subprocess is refused in production/);
    assert.match(out, /INTERNAL_API_KEY/, "the message says what a learner could reach");
    assert.match(out, /EXECUTION_ALLOW_SUBPROCESS=1/, "and names the explicit override");
  });
  it("auth/billing refuse to boot without DATABASE_URL", () => {
    for (const svc of ["auth", "billing"]) {
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
    // Immediate revocation rides a forward-only migration as well: the denylist is
    // additive, and `expires_at` is what keeps it prunable rather than growing for
    // the life of the deployment.
    const auth003 = readFileSync(join(root, "services", "auth", "migrations", "003_revoked_tokens.sql"), "utf8");
    assert.ok(auth003.includes("CREATE TABLE IF NOT EXISTS revoked_tokens"), "auth 003 records revoked access tokens");
    assert.ok(auth003.includes("jti TEXT PRIMARY KEY"), "auth 003 keys a revocation by the token's own id");
    assert.ok(auth003.includes("expires_at TIMESTAMPTZ NOT NULL"), "auth 003 knows when a revocation stops mattering");
    // Account-wide sign-out rides a forward-only migration of its own: a moment per
    // account rather than a list of credentials, because a stateless access token
    // cannot be enumerated. One row per account is also why sign-outs cannot grow
    // this table, and why it needs no pruning.
    const auth004 = readFileSync(join(root, "services", "auth", "migrations", "004_user_revocations.sql"), "utf8");
    assert.ok(auth004.includes("CREATE TABLE IF NOT EXISTS user_revocations"), "auth 004 records an account-wide cut-off");
    assert.ok(auth004.includes("revoked_before TIMESTAMPTZ NOT NULL"), "auth 004 stores the moment, not a list of ids");
    assert.ok(auth004.includes("user_id TEXT PRIMARY KEY"), "auth 004 keeps one row per account: the cut-off cannot grow with sign-outs");
    // The operational half of revocation cannot be exercised from a request: the
    // prune fires on a fifteen-minute timer and the edge's counters are reported on
    // one too. Both are therefore asserted at the source, with the alternative in
    // mind (a test that waits out an interval is a test nobody runs).
    const authIndexSrc = readFileSync(join(root, "services", "auth", "src", "index.ts"), "utf8");
    assert.ok(
      authIndexSrc.includes("pruneRevokedTokens") && authIndexSrc.includes("setInterval"),
      "the auth service prunes expired denylist rows on a timer rather than on the read path"
    );
    assert.ok(
      authIndexSrc.includes("unref()") && authIndexSrc.includes("void pruneRevocations();"),
      "and it prunes once at boot, on a timer that cannot hold the process open"
    );
    assert.ok(
      authIndexSrc.includes("REVOCATION_PRUNE_INTERVAL_MS"),
      "the interval is configurable, so a deployment can trade table size against housekeeping"
    );
    const gwIndexSrc = readFileSync(join(root, "services", "gateway", "src", "index.ts"), "utf8");
    assert.ok(
      gwIndexSrc.includes("revocation.stats()") && gwIndexSrc.includes("REVOCATION_REPORT_MS"),
      "the edge reports revocation counters on its own timer"
    );
    assert.ok(
      gwIndexSrc.includes("revocationNotice"),
      "and logs the first refusal or unanswered check at once, rather than up to an interval later"
    );
  });
  it("web-classroom sync is retired: the browser sources and the vendor copies are gone", async () => {
    // The browser classroom is deleted — one way to learn, the desktop IDE —
    // so there is no web content to snapshot, and this session removed the
    // services' classroom surface with it. This pins the removal from the
    // platform side: the retired sources must stay absent (re-adding them
    // without restoring the sync is how the old drift returned), and the
    // vendor copies must stay deleted (their services no longer exist to
    // read them).
    const { existsSync: exists, readdirSync: readdir } = await import("node:fs");
    for (const f of [
      "missions.ts",
      "missions-orientation.ts",
      "curriculum.ts",
      "diagnostic.ts",
      "checks.ts",
      "harness.ts",
      "practice-core.ts",
      "recommend.ts",
      "document-rules.ts",
      "run-evidence.ts",
    ]) {
      assert.ok(
        !exists(join(root, "..", "nexora-svelte", "src", "lib", f)),
        `${f} stays deleted from the front door (do not re-add web sources without restoring the sync)`
      );
    }
    for (const dir of ["services/progress", "services/tutor"]) {
      assert.ok(!exists(join(root, dir)), `${dir} stays deleted (no service reads classroom content anymore)`);
    }
    const dataFiles = readdir(join(root, "services", "curriculum", "src", "data"));
    assert.deepEqual(
      [...dataFiles].sort(),
      ["ide-manifest.ts", "ide-task-manager.ts", "ide-version.ts"].sort(),
      "the curriculum data dir holds only the IDE snapshot"
    );
  });
  it("IDE curriculum snapshot matches its source and its own stamp (run sync on drift)", async () => {
    // The paid phases the platform serves are a snapshot of the IDE's authored
    // curriculum, generated by sync-curriculum.mjs. Two drift classes must fail
    // here. (1) A snapshot whose own version stamp no longer matches its content
    // — a hand-edit that forgot to re-sync — checkable from committed bytes
    // alone. (2) A snapshot that no longer matches the sibling repo's source,
    // which needs nexora-ide checked out beside branchcraft.
    const { createHash } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const ideVer = await import("../services/curriculum/dist/data/ide-version.js");
    const ideTm = await import("../services/curriculum/dist/data/ide-task-manager.js");
    const ideMf = await import("../services/curriculum/dist/data/ide-manifest.js");

    // Mirror sync-curriculum.mjs's IDE hash exactly: canonical (compact) JSON,
    // keyed by the forward-slash relative path, in source order.
    const ideHashOf = (pairs) => {
      const h = createHash("sha256");
      for (const [rel, value] of pairs) h.update("ide/" + rel + "\n" + JSON.stringify(value) + "\n");
      return h.digest("hex").slice(0, 12);
    };

    // (1) Self-consistency, always available: the committed content hashes to
    //     the committed stamp, and the snapshot is internally coherent — the
    //     roadmap lines up with the authored document, and the free/paid split
    //     is real (a build with no free loop would ship nothing at all).
    assert.match(ideVer.IDE_CONTENT_VERSION, /^[0-9a-f]{12}$/);
    assert.equal(
      ideHashOf([
        ["task-manager.json", ideTm.IDE_TASK_MANAGER],
        ["shipped/task-manager.manifest.json", ideMf.IDE_MANIFEST],
      ]),
      ideVer.IDE_CONTENT_VERSION,
      "the IDE snapshot hashes to its own version stamp (a hand-edit must re-sync)"
    );
    const doc = ideTm.IDE_TASK_MANAGER;
    const manifest = ideMf.IDE_MANIFEST;
    assert.deepEqual(
      manifest.phases.map((p) => p.id),
      doc.phases.map((p) => p.id),
      "the roadmap and the authored document list the same phases in the same order"
    );
    assert.ok(manifest.phases.some((p) => p.tier === "free"), "at least one phase is free");
    assert.ok(manifest.phases.some((p) => p.tier === "pro"), "at least one phase is paid");

    // (2) Source match, when the sibling repo is present: regenerate the wrapper
    //     bytes from source and compare, and re-hash from source. When it is
    //     absent (a platform-only checkout), say so rather than pass silently.
    const ideSrc = join(root, "..", "..", "nexora-ide", "extensions", "nexora", "curriculum");
    const sources = [
      { rel: "task-manager.json", out: "ide-task-manager.ts", symbol: "IDE_TASK_MANAGER" },
      { rel: join("shipped", "task-manager.manifest.json"), out: "ide-manifest.ts", symbol: "IDE_MANIFEST" },
    ];
    if (!sources.every((s) => existsSync(join(ideSrc, s.rel)))) {
      process.stdout.write(
        "      (IDE source drift not checked: nexora-ide sibling absent; committed snapshot self-consistency verified)\n"
      );
      return;
    }
    const fromSource = [];
    for (const s of sources) {
      const canonicalRel = s.rel.split("\\").join("/");
      const parsed = JSON.parse(await readFile(join(ideSrc, s.rel), "utf8"));
      fromSource.push([canonicalRel, parsed]);
      const expected =
        `// Generated by npm run sync:curriculum — do not edit by hand.\n` +
        `// Source: nexora-ide/extensions/nexora/curriculum/${canonicalRel}\n` +
        `export const ${s.symbol}: unknown = ${JSON.stringify(parsed, null, 2)};\n`;
      const committed = await readFile(
        join(root, "services", "curriculum", "src", "data", s.out),
        "utf8"
      );
      assert.equal(committed, expected, `${s.out} matches the IDE source (run npm run sync:curriculum)`);
    }
    assert.equal(
      ideHashOf(fromSource),
      ideVer.IDE_CONTENT_VERSION,
      "the IDE snapshot matches the sibling repo's source (run npm run sync:curriculum)"
    );
  });
  it("every relative import in curriculum data ends with .js (NodeNext)", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const dir = "services/curriculum/src/data";
    const files = (await readdir(join(root, dir))).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const content = await readFile(join(root, dir, f), "utf8");
      const bad = [...content.matchAll(/from\s+["'](\.[^"']+)["']/g)]
        .map((m) => m[1])
        .filter((p) => !p.endsWith(".js") && !p.endsWith(".json"));
      assert.deepEqual(bad, [], `${dir}/${f} extensionless imports`);
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
    for (const s of ["postgres", "auth", "curriculum", "execution", "billing", "gateway", "frontend"]) {
      assert.ok(names.includes(s), `service ${s} present`);
    }
    assert.equal(cfg.services.postgres.ports, undefined, "postgres not published");
    assert.ok(JSON.stringify(cfg.services.gateway.ports).includes("8080"));
    assert.ok(existsSync(join(root, "Dockerfile")));
  });
});

describe("access-token lifetime and identity (M-1)", () => {
  /** Set ACCESS_TOKEN_TTL_SECONDS for one case and hand back the restore. */
  const withTtl = (value) => {
    const saved = process.env.ACCESS_TOKEN_TTL_SECONDS;
    if (value === undefined) delete process.env.ACCESS_TOKEN_TTL_SECONDS;
    else process.env.ACCESS_TOKEN_TTL_SECONDS = String(value);
    return () => {
      if (saved === undefined) delete process.env.ACCESS_TOKEN_TTL_SECONDS;
      else process.env.ACCESS_TOKEN_TTL_SECONDS = saved;
    };
  };

  it("lives five minutes by default, and the clamp holds at both ends", () => {
    const saved = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = SECRET;
    try {
      // The TTL is the whole revocation story for a stateless token, so both
      // ends are load-bearing: a minute is the floor (below it the client would
      // refresh in a loop and a skewed clock would flap), a quarter-hour is the
      // ceiling (that is the window this finding was about).
      for (const [value, expected] of [
        [undefined, 300],
        ["60", 60],
        ["300", 300],
        ["900", 900],
        ["10", 60],
        ["86400", 900],
        ["not-a-number", 300],
      ]) {
        const restore = withTtl(value);
        try {
          assert.equal(authCrypto.accessTokenTtlSeconds(), expected, `ACCESS_TOKEN_TTL_SECONDS=${value}`);
          assert.equal(authCrypto.signAccessToken("u").expiresIn, expected);
        } finally {
          restore();
        }
      }
    } finally {
      if (saved === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved;
    }
  });

  it("ids every token separately, so one credential can be named", async () => {
    const saved = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = SECRET;
    try {
      const jwt = (await import("jsonwebtoken")).default;
      const a = authCrypto.signAccessToken("user-1");
      const b = authCrypto.signAccessToken("user-1");
      const claims = jwt.decode(a.token);
      assert.equal(claims.sub, "user-1");
      assert.match(claims.jti, /^[0-9a-f]{32}$/);
      assert.match(b.jti, /^[0-9a-f]{32}$/);
      assert.notEqual(a.jti, b.jti, "two tokens for one user are two different credentials");
      assert.equal(jwt.decode(b.token).jti, b.jti, "and the claim is the one that was returned");
    } finally {
      if (saved === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved;
    }
  });
});

/**
 * A pg-shaped pool for the auth service's own SQL, answered from maps.
 *
 * A map-backed pool rather than a database because these tests are about what the
 * routes do with each answer — and the fake answers the real statements verbatim,
 * so a route that starts querying something else gets "no rows" and an assertion
 * fails instead of the schema quietly diverging from the tests.
 *
 * Shared by the lifecycle tests below and the gateway↔auth integration test at the
 * end of this file, so the two cannot drift into different pictures of the schema.
 */
function fakeAuthPool() {
  const users = new Map(); // id -> row
  const tokens = new Map(); // token_hash -> row
  const revoked = new Map(); // jti -> row
  const cutoffs = new Map(); // user_id -> revoked_before (Date)
  /* Added with the rights work (007_rights.sql), and here for the same reason the
     rest of this fake exists: the rights surface is mostly *SQL*, so the only way
     to assert that an erasure really cascades, that a cut-off outlives the
     account, or that the retention sweep leaves open work alone is to answer those
     statements faithfully. A missing handler falls through to "no rows", which
     makes a route that queries something new fail visibly rather than pass. */
  const consents = new Map(); // `${user_id}|${document}` -> row
  const erasures = new Map(); // subject_ref -> receipt row
  const handoffs = new Map(); // id -> processor_deletion row
  const requests = new Map(); // id -> rights_request row
  const proofs = new Map(); // `${user_id}|${competency_id}` -> row
  const deviceCodes = new Map(); // id -> device_code row
  const deletedCutoffs = new Map(); // user_id -> revoked_before (Date)
  return {
    users,
    tokens,
    revoked,
    cutoffs,
    consents,
    erasures,
    handoffs,
    requests,
    proofs,
    deviceCodes,
    deletedCutoffs,
    query: async (sql, params) => {
      // The prune is a real delete here, not a stub: how many rows it removes is
      // the behaviour under test, so the fake has to age rows like Postgres does.
      if (sql.startsWith("DELETE FROM revoked_tokens")) {
        let n = 0;
        for (const [jti, row] of revoked) {
          if (new Date(row.expires_at).getTime() < Date.now()) {
            revoked.delete(jti);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("INSERT INTO revoked_tokens")) {
        revoked.set(params[0], { jti: params[0], user_id: params[1], expires_at: params[2] });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT 1 FROM revoked_tokens")) {
        return { rows: [], rowCount: revoked.has(params[0]) ? 1 : 0 };
      }
      if (sql.startsWith("INSERT INTO user_revocations")) {
        const previous = cutoffs.get(params[0]);
        const at = new Date(params[1]);
        // GREATEST, exactly as the statement does: a cut-off never moves backwards.
        cutoffs.set(params[0], previous && previous > at ? previous : at);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT revoked_before FROM user_revocations")) {
        const at = cutoffs.get(params[0]);
        return at ? { rows: [{ revoked_before: at }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT id FROM users WHERE lower(email)")) {
        const hit = [...users.values()].find((u) => u.email === params[0]);
        return hit ? { rows: [{ id: hit.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO users")) {
        const u = {
          id: params[0],
          email: params[1],
          name: params[2],
          password_hash: params[3],
          created_at: new Date("2026-01-01T00:00:00Z"),
        };
        users.set(u.id, u);
        return { rows: [u], rowCount: 1 };
      }
      if (sql.startsWith("SELECT * FROM users WHERE lower(email)")) {
        const hit = [...users.values()].find((u) => u.email === params[0]);
        return hit ? { rows: [hit], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO refresh_tokens")) {
        const row = {
          id: params[0],
          user_id: params[1],
          token_hash: params[2],
          expires_at: params[3],
          revoked_at: null,
          replaced_by: null,
        };
        tokens.set(row.token_hash, row);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT * FROM refresh_tokens WHERE token_hash")) {
        const row = tokens.get(params[0]);
        return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT id FROM refresh_tokens WHERE token_hash")) {
        const row = tokens.get(params[0]);
        return row ? { rows: [{ id: row.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("UPDATE refresh_tokens SET revoked_at = now(), replaced_by")) {
        // Guard-aware on purpose: rotation claims a row with
        // `... AND revoked_at IS NULL`, and that guard IS the behaviour under test.
        // A fake that ignored it would let two concurrent refreshes both claim the
        // same row and hide the race (B-28).
        const guarded = sql.includes("AND revoked_at IS NULL");
        let n = 0;
        for (const row of tokens.values()) {
          if (row.id === params[1] && (!guarded || !row.revoked_at)) {
            row.revoked_at = new Date();
            row.replaced_by = params[0];
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("UPDATE refresh_tokens SET revoked_at = now() WHERE id")) {
        const row = [...tokens.values()].find((r) => r.id === params[0]);
        if (!row || (sql.includes("AND revoked_at IS NULL") && row.revoked_at)) {
          return { rows: [], rowCount: 0 };
        }
        row.revoked_at = new Date();
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash")) {
        const row = tokens.get(params[0]);
        if (row) row.revoked_at = new Date();
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      if (sql.startsWith("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id")) {
        let n = 0;
        for (const row of tokens.values()) {
          if (row.user_id === params[0] && !row.revoked_at) {
            row.revoked_at = new Date();
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      /* ---- the rights surface (007_rights.sql) ---- */

      // The signup statement, with or without declarations. The CTE shape is
      // answered by inserting the user AND the three consent rows, so a test can
      // assert what was recorded rather than only that a 201 came back.
      if (sql.startsWith("WITH u AS (INSERT INTO users")) {
        const u = {
          id: params[0],
          email: params[1],
          name: params[2],
          password_hash: params[3],
          created_at: new Date("2026-01-01T00:00:00Z"),
        };
        users.set(u.id, u);
        const [docs, versions, purposes, bases] = [params[4], params[5], params[6], params[7]];
        (docs ?? []).forEach((document, i) => {
          consents.set(`${u.id}|${document}`, {
            user_id: u.id,
            document,
            version: versions[i],
            purpose: purposes[i],
            basis: bases[i],
            accepted_at: new Date(),
            withdrawn_at: null,
          });
        });
        return { rows: [u], rowCount: 1 };
      }
      if (sql.startsWith("SELECT document, version, purpose, basis")) {
        const rows = [...consents.values()].filter((c) => c.user_id === params[0]);
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith("UPDATE consents SET withdrawn_at")) {
        const row = consents.get(`${params[0]}|${params[1]}`);
        if (!row || row.withdrawn_at) return { rows: [], rowCount: 0 };
        row.withdrawn_at = new Date();
        return { rows: [{ document: row.document }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id, email, name, created_at, provider FROM users")) {
        const u = users.get(params[0]);
        return u ? { rows: [{ ...u, provider: u.provider ?? "local" }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT id, email, name, created_at FROM users WHERE id")) {
        const u = users.get(params[0]);
        return u ? { rows: [u], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      /* The erasure, as one statement.
       *
       * Answered faithfully rather than stubbed, because the interesting
       * properties ARE the SQL: that the tally is counted before the delete, that
       * an account that does not exist writes no receipt, that the cut-off and the
       * receipt and the handoffs all land with the deletion or not at all, and that
       * the rights ledger keeps its pseudonymous subject when `user_id` goes NULL.
       * A stub that answered 200 would make every one of those assertions vacuous. */
      if (sql.startsWith("WITH counts AS (SELECT")) {
        const uid = params[0];
        const [, at, receiptId, ref, retainedJson, reason, handoffIds, providers, notes] = params;
        const count = (map, pred) => [...map.values()].filter(pred).length;
        const counts = {
          account: users.has(uid) ? 1 : 0,
          email: users.get(uid)?.email ?? null,
          sessions: count(tokens, (r) => r.user_id === uid),
          revokedCredentials: count(revoked, (r) => r.user_id === uid),
          sessionCutoffs: cutoffs.has(uid) ? 1 : 0,
          deviceCodes: count(deviceCodes, (r) => r.approved_user_id === uid),
          verifiedProofs: count(proofs, (r) => r.user_id === uid),
          consentRecords: count(consents, (r) => r.user_id === uid),
        };
        if (counts.account === 0) return { rows: [{ counts, deleted: 0 }], rowCount: 1 };
        deletedCutoffs.set(uid, new Date(at));
        erasures.set(ref, {
          id: receiptId,
          subject_ref: ref,
          requested_at: new Date(at),
          completed_at: new Date(at),
          deleted: { ...counts, email: undefined },
          retained: JSON.parse(retainedJson),
          reason: reason ?? null,
        });
        (providers ?? []).forEach((provider, i) => {
          handoffs.set(handoffIds[i], {
            id: handoffIds[i],
            provider,
            subject_ref: ref,
            user_email: counts.email,
            note: notes[i],
            queued_at: new Date(),
            completed_at: null,
          });
        });
        users.delete(uid);
        for (const [k, r] of tokens) if (r.user_id === uid) tokens.delete(k);
        for (const [k, r] of revoked) if (r.user_id === uid) revoked.delete(k);
        for (const [k, r] of consents) if (r.user_id === uid) consents.delete(k);
        for (const [k, r] of proofs) if (r.user_id === uid) proofs.delete(k);
        for (const [k, r] of deviceCodes) if (r.approved_user_id === uid) deviceCodes.delete(k);
        cutoffs.delete(uid);
        // ON DELETE SET NULL: the request ledger survives, its subject becomes a
        // pseudonym, and the row stops naming a live account.
        for (const row of requests.values()) if (row.user_id === uid) row.user_id = null;
        return { rows: [{ counts, deleted: 1 }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO deleted_subject_revocations")) {
        const previous = deletedCutoffs.get(params[0]);
        const at = new Date(params[1]);
        deletedCutoffs.set(params[0], previous && previous > at ? previous : at);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT revoked_before FROM deleted_subject_revocations")) {
        const at = deletedCutoffs.get(params[0]);
        return at ? { rows: [{ revoked_before: at }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("DELETE FROM deleted_subject_revocations")) {
        let n = 0;
        for (const [uid, at] of deletedCutoffs) {
          if (Date.now() - new Date(at).getTime() > 12 * 3600_000) {
            deletedCutoffs.delete(uid);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("INSERT INTO erasures")) {
        erasures.set(params[1], {
          id: params[0],
          subject_ref: params[1],
          requested_at: params[2],
          completed_at: params[2],
          deleted: JSON.parse(params[3]),
          retained: JSON.parse(params[4]),
          reason: params[5],
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id, completed_at FROM erasures")) {
        const row = erasures.get(params[0]);
        return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("DELETE FROM erasures")) {
        let n = 0;
        for (const [ref, row] of erasures) {
          if (Date.now() - new Date(row.completed_at).getTime() > 24 * 30 * 24 * 3600_000) {
            erasures.delete(ref);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("INSERT INTO processor_deletions")) {
        handoffs.set(params[0], {
          id: params[0],
          provider: params[1],
          subject_ref: params[2],
          user_email: params[3],
          note: params[4],
          queued_at: new Date(),
          completed_at: null,
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE processor_deletions SET completed_at")) {
        let n = 0;
        for (const row of handoffs.values()) {
          if (row.subject_ref === params[0] && row.provider.startsWith("NEXORA") && !row.completed_at) {
            row.completed_at = new Date();
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("DELETE FROM processor_deletions")) {
        let n = 0;
        for (const [id, row] of handoffs) {
          if (row.completed_at && Date.now() - new Date(row.completed_at).getTime() > 24 * 30 * 24 * 3600_000) {
            handoffs.delete(id);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("INSERT INTO rights_requests")) {
        const row = {
          id: params[0],
          user_id: params[1],
          subject_ref: params[2],
          kind: params[3],
          detail: params[4],
          nominee: params[5],
          status: "received",
          created_at: new Date(),
          due_at: new Date(params[6]),
          resolved_at: null,
          resolution: null,
        };
        requests.set(row.id, row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id, kind, status, detail")) {
        const rows = [...requests.values()].filter((r) => r.user_id === params[0]);
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith("UPDATE rights_requests SET subject_ref")) {
        let n = 0;
        for (const row of requests.values()) {
          if (row.user_id === params[0] || row.user_id === params[1]) {
            row.subject_ref = row.subject_ref ?? params[1];
            if (row.user_id === params[0]) row.user_id = null;
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("DELETE FROM rights_requests")) {
        let n = 0;
        for (const [id, row] of requests) {
          if (row.resolved_at && Date.now() - new Date(row.resolved_at).getTime() > 24 * 30 * 24 * 3600_000) {
            requests.delete(id);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("DELETE FROM users WHERE id")) {
        const uid = params[0];
        if (!users.has(uid)) return { rows: [], rowCount: 0 };
        users.delete(uid);
        // The cascades the schema declares, in the fake: a deletion that stopped
        // at the account row would leave sessions and proofs behind, which is the
        // exact failure mode this suite exists to catch.
        for (const [k, r] of tokens) if (r.user_id === uid) tokens.delete(k);
        for (const [k, r] of revoked) if (r.user_id === uid) revoked.delete(k);
        for (const [k, r] of consents) if (r.user_id === uid) consents.delete(k);
        for (const [k, r] of proofs) if (r.user_id === uid) proofs.delete(k);
        for (const [k, r] of deviceCodes) if (r.approved_user_id === uid) deviceCodes.delete(k);
        cutoffs.delete(uid);
        for (const row of requests.values()) if (row.user_id === uid) row.user_id = null;
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("DELETE FROM refresh_tokens WHERE expires_at")) {
        let n = 0;
        for (const [k, r] of tokens) {
          if (new Date(r.expires_at).getTime() < Date.now()) {
            tokens.delete(k);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith("DELETE FROM device_codes WHERE expires_at")) {
        let n = 0;
        for (const [k, r] of deviceCodes) {
          if (new Date(r.expires_at).getTime() < Date.now() - 24 * 3600_000) {
            deviceCodes.delete(k);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe("auth token lifecycle (in-process, fake pg)", () => {
  // A refresh-token table small enough to reason about: the service's own SQL,
  // answered from maps. Rotation and reuse detection are the behaviour under
  // test, so the fake keeps revoked_at/replaced_by exactly as the schema does.
  let app;
  const fakePool = fakeAuthPool();
  const EMAIL = "lifecycle@test.dev";
  const PASSWORD = "0123456789abcdef";
  let calls = 0;
  const post = (url, payload) =>
    app.inject({
      method: "POST",
      url,
      headers: { "content-type": "application/json", "x-client-ip": `198.51.100.${(calls += 1)}` },
      payload,
    });
  before(async () => {
    const saved = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = SECRET;
    try {
      const kitMod = await import("../packages/service-kit/dist/index.js");
      const routes = await import("../services/auth/dist/routes.js");
      app = await kitMod.createService("test-auth-lifecycle");
      routes.registerAuthRoutes(app, fakePool);
      await app.ready();
    } finally {
      if (saved === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved;
    }
  });

  it("a sign-in mints a five-minute, individually identified access token", async () => {
    const saved = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = SECRET;
    try {
      const reg = await post("/register", { email: EMAIL, password: PASSWORD, name: "Ada" });
      assert.equal(reg.statusCode, 201);
      const jwt = (await import("jsonwebtoken")).default;
      const claims = jwt.decode(reg.json().tokens.accessToken);
      assert.equal(claims.sub, reg.json().user.id);
      assert.equal(claims.exp - claims.iat, 300);
      assert.match(claims.jti, /^[0-9a-f]{32}$/);
    } finally {
      if (saved === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved;
    }
  });

  it("refresh rotates both halves; replaying the old one revokes the family", async () => {
    const login = await post("/login", { email: EMAIL, password: PASSWORD });
    assert.equal(login.statusCode, 200);
    const first = login.json().tokens;

    const rotated = await post("/refresh", { refreshToken: first.refreshToken });
    assert.equal(rotated.statusCode, 200);
    const second = rotated.json().tokens;
    // Both halves are new: the access token is a different credential (new jti),
    // and the refresh token has been replaced rather than reused.
    assert.notEqual(second.accessToken, first.accessToken);
    assert.notEqual(second.refreshToken, first.refreshToken);
    const jwt = (await import("jsonwebtoken")).default;
    assert.notEqual(jwt.decode(second.accessToken).jti, jwt.decode(first.accessToken).jti);

    // Presenting the superseded token again is indistinguishable from theft.
    const replay = await post("/refresh", { refreshToken: first.refreshToken });
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.json().error.code, "token_reused");

    // …and the family revocation takes the honest successor with it, which is
    // what makes the theft response worth its false positives.
    const after = await post("/refresh", { refreshToken: second.refreshToken });
    assert.equal(after.statusCode, 401);
    assert.equal(after.json().error.code, "invalid_grant");

    // A fresh sign-in works, and signing out ends both halves: the refresh family
    // (nothing new can be minted) and the access token in hand — its jti goes on
    // the denylist, so the credential the learner was holding stops being accepted
    // at once instead of at the end of its five minutes.
    const again = await post("/login", { email: EMAIL, password: PASSWORD });
    assert.equal(again.statusCode, 200);
    const third = again.json().tokens;
    const thirdJti = jwt.decode(third.accessToken).jti;
    const out = await post("/logout", {
      refreshToken: third.refreshToken,
      accessToken: third.accessToken,
    });
    assert.equal(out.statusCode, 200);
    assert.deepEqual(out.json(), { ok: true });
    const dead = await post("/refresh", { refreshToken: third.refreshToken });
    assert.equal(dead.statusCode, 401);
    assert.equal(dead.json().error.code, "invalid_grant");

    const check = await post("/internal/revocations/check", { jti: thirdJti });
    assert.equal(check.statusCode, 200);
    assert.equal(check.json().revoked, true, "the signed-out token's id is on the denylist");
    // Another session's token is untouched: revoking one credential must not end
    // every session the learner has open.
    const other = await post("/login", { email: EMAIL, password: PASSWORD });
    const otherJti = jwt.decode(other.json().tokens.accessToken).jti;
    const untouched = await post("/internal/revocations/check", { jti: otherJti });
    assert.equal(untouched.json().revoked, false, "revocation is per credential, not per account");
  });

  it("only a token we signed can put an id on the denylist", async () => {
    // The signature is checked before any id is recorded. Otherwise presenting
    // someone else's jti — or a token we never issued — would sign them out.
    const jwt = (await import("jsonwebtoken")).default;
    const forged = jwt.sign({ sub: "u-victim", jti: "forged-jti-1" }, "not-our-secret", {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    const out = await post("/logout", { accessToken: forged });
    assert.equal(out.statusCode, 200, "sign-out stays idempotent and oracle-free");
    const check = await post("/internal/revocations/check", { jti: "forged-jti-1" });
    assert.equal(check.json().revoked, false, "a token we did not sign cannot revoke an id");
    // Nor can a garbage body: the route must not throw on the sign-out path.
    const junk = await post("/logout", { accessToken: "not-a-jwt" });
    assert.equal(junk.statusCode, 200);
    const empty = await post("/logout", {});
    assert.equal(empty.statusCode, 200);
  });

  it("the denylist is pruned by expiry, and says how many rows went", async () => {
    const store = await import("../services/auth/dist/revocation-store.js");
    const pool = fakeAuthPool();
    await store.revokeCredential(pool, { jti: "long-dead", userId: "u1", expiresAtMs: Date.now() - 60_000 });
    await store.revokeCredential(pool, { jti: "still-live", userId: "u1", expiresAtMs: Date.now() + 60_000 });
    assert.equal(await store.pruneRevokedTokens(pool), 1, "only rows whose token would have expired are dropped");
    assert.deepEqual([...pool.revoked.keys()], ["still-live"], "and the row that still matters is kept");
    assert.equal(await store.pruneRevokedTokens(pool), 0, "a second prune has nothing to do, so nothing is logged");
  });

  it("the account cut-off only ever moves forward, and only refuses what came before it", async () => {
    const store = await import("../services/auth/dist/revocation-store.js");
    const pool = fakeAuthPool();
    const cutoff = 1_000_000;
    await store.revokeAccountBefore(pool, "u-cut", new Date(cutoff));
    // A flaky connection retried "sign out everywhere"; the older attempt must not
    // move the boundary backwards and resurrect the session the first one ended.
    await store.revokeAccountBefore(pool, "u-cut", new Date(cutoff - 500_000));
    assert.equal(pool.cutoffs.get("u-cut").getTime(), cutoff, "GREATEST, not a plain overwrite");

    assert.deepEqual(
      await store.credentialStatus(pool, { jti: "x", userId: "u-cut", issuedAtMs: cutoff - 1_000 }),
      { revoked: true, reason: "account" },
      "a token issued before the moment is refused"
    );
    // `iat` has one-second resolution, so the comparison cannot tell "issued just
    // before" from "issued just after". Of the two mistakes available, signing a
    // learner straight back out of the session they just created is the worse one.
    assert.equal(
      (await store.credentialStatus(pool, { jti: "y", userId: "u-cut", issuedAtMs: cutoff })).revoked,
      false,
      "a token minted in the same second as the sign-out survives"
    );
    assert.equal(
      (await store.credentialStatus(pool, { jti: "z", userId: "u-cut", issuedAtMs: cutoff + 1_000 })).revoked,
      false,
      "and signing back in is a session the learner asked for"
    );
    assert.equal(
      (await store.credentialStatus(pool, { jti: "w" })).revoked,
      false,
      "a check with no subject still gets the per-credential answer"
    );
  });
});

/* Verified proof ledger: the IDE syncs attested records for profile display,
 * and this service stores only what its own signatures verify. The fake pg
 * below is an in-memory proofs table — foreign keys are not enforced by the
 * fake, which is fine because the trust under test is signature-first, and
 * user isolation is asserted on the rows, not the constraints. */
describe("proofs ledger stores only what verifies (in-process, fake pg)", () => {
  let app;
  let kit;
  let contracts;
  const KEY = "test-proofs-key";
  const saved = process.env.INTERNAL_API_KEY;
  const rows = [];

  const fakePool = {
    query: async (sql, params) => {
      if (sql.startsWith("SELECT user_id, issued_at FROM proofs WHERE payload_sha256")) {
        const hit = rows.filter((r) => r.payload_sha256 === params[0]);
        return { rows: hit, rowCount: hit.length };
      }
      if (sql.startsWith("SELECT competency_id, level, issued_at FROM proofs WHERE user_id")) {
        const hit = rows.filter((r) => r.user_id === params[0] && r.competency_id === params[1]);
        return { rows: hit, rowCount: hit.length };
      }
      if (sql.startsWith("INSERT INTO proofs")) {
        const [user_id, competency_id, level, receipt, payload_sha256, issued_at] = params;
        const at = new Date(issued_at);
        const ix = rows.findIndex((r) => r.user_id === user_id && r.competency_id === competency_id);
        const row = { user_id, competency_id, level, receipt: JSON.parse(receipt), payload_sha256, issued_at: at };
        if (ix >= 0) rows[ix] = row;
        else rows.push(row);
        return { rows: [{ competency_id, level, issued_at: at }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT competency_id, level, CASE")) {
        return {
          rows: rows
            .filter((r) => r.user_id === params[0])
            .sort((a, b) => b.issued_at.getTime() - a.issued_at.getTime())
            .map((r) => ({
              competency_id: r.competency_id,
              level: r.level,
              kind: r.receipt?.facts?.kind === "design" ? "design" : "run",
              issued_at: r.issued_at,
            })),
          rowCount: rows.filter((r) => r.user_id === params[0]).length,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const runFacts = {
    language: "node",
    command: ["node", "--test"],
    files: [{ path: "src/add.js", sha256: "a".repeat(64) }],
    stdout: "ok 1",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    truncated: false,
    durationMs: 100,
    phase: "run",
    diagnostics: [],
    runner: "platform",
  };
  const mintRun = (issuedAt, mutate) => {
    const facts = mutate ? { ...runFacts, ...mutate } : runFacts;
    const payload = contracts.runReceiptPayload(facts, issuedAt);
    return { v: 1, issuedAt, facts, sig: kit.signReceipt(payload, KEY) };
  };
  const mintDesign = (issuedAt) => {
    const facts = {
      kind: "design",
      challengeId: "url-shortener",
      graphSha256: "b".repeat(64),
      checks: [{ checkId: "has-client", passed: true, reason: "Re-derived." }],
      runner: "platform",
    };
    const payload = contracts.designReceiptPayload(facts, issuedAt);
    return { v: 1, issuedAt, facts, sig: kit.signReceipt(payload, KEY) };
  };

  before(async () => {
    process.env.INTERNAL_API_KEY = KEY;
    kit = await import("../packages/service-kit/dist/index.js");
    contracts = await import("../packages/contracts/dist/index.js");
    const routes = await import("../services/auth/dist/routes.js");
    app = await kit.createService("test-proofs-ledger");
    routes.registerAuthRoutes(app, fakePool);
    await app.ready();
  });
  after(() => {
    if (saved === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = saved;
  });
  beforeEach(() => {
    rows.length = 0;
  });

  const post = (user, body, headers = {}) =>
    app.inject({
      method: "POST",
      url: "/proofs",
      headers: { "x-user-id": user, "x-internal-key": KEY, "content-type": "application/json", ...headers },
      payload: body,
    });
  const get = (user, headers = {}) =>
    app.inject({ method: "GET", url: "/proofs", headers: { "x-user-id": user, "x-internal-key": KEY, ...headers } });

  it("stores a valid run receipt and reads it back as the caller's own row", async () => {
    const issuedAt = new Date().toISOString();
    const r = await post("u-1", {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt: mintRun(issuedAt),
    });
    assert.equal(r.statusCode, 201, r.body);
    const body = r.json();
    assert.equal(body.stored, true);
    assert.ok(contracts.proofRecordSchema.safeParse(body.proof).success, JSON.stringify(body.proof));
    assert.deepEqual(body.proof, { competencyId: "go-functions", level: "demonstrated", kind: "run", issuedAt });
    const g = await get("u-1");
    assert.equal(g.statusCode, 200, g.body);
    assert.deepEqual(g.json().proofs, [body.proof]);
  });

  it("stores a valid design receipt with its kind", async () => {
    const issuedAt = new Date().toISOString();
    const r = await post("u-1", {
      competencyId: "system-design",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt: mintDesign(issuedAt),
    });
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().proof.kind, "design");
  });

  it("a forged signature stores nothing", async () => {
    const issuedAt = new Date().toISOString();
    const receipt = mintRun(issuedAt);
    receipt.sig = "0".repeat(64);
    const r = await post("u-1", {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt,
    });
    assert.equal(r.statusCode, 401, r.body);
    assert.equal(r.json().error.code, "invalid_proof");
    assert.deepEqual((await get("u-1")).json().proofs, []);
  });

  it("tampered facts fail closed even with a well-formed envelope", async () => {
    const issuedAt = new Date().toISOString();
    const receipt = mintRun(issuedAt);
    receipt.facts.stdout = "ok 999 - invented";
    const r = await post("u-1", {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt,
    });
    assert.equal(r.statusCode, 401, r.body);
    assert.deepEqual((await get("u-1")).json().proofs, []);
  });

  it("syncing the same receipt twice is one row, reported not re-stored", async () => {
    const issuedAt = new Date().toISOString();
    const body = {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt: mintRun(issuedAt),
    };
    assert.equal((await post("u-1", body)).statusCode, 201);
    const again = await post("u-1", body);
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().stored, false);
    assert.equal((await get("u-1")).json().proofs.length, 1);
  });

  it("an older re-sync never moves a newer row backwards", async () => {
    const newer = new Date().toISOString();
    await post("u-1", {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: newer,
      lastRetrievedAt: null,
      receipt: mintRun(newer),
    });
    const older = new Date(Date.parse(newer) - 3_600_000).toISOString();
    const r = await post("u-1", {
      competencyId: "go-functions",
      level: "practiced",
      lastDemonstratedAt: older,
      lastRetrievedAt: null,
      receipt: mintRun(older),
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().stored, false);
    assert.equal((await get("u-1")).json().proofs[0].level, "demonstrated");
  });

  it("the same bytes under a different account conflict without naming the owner", async () => {
    const issuedAt = new Date().toISOString();
    const body = {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt: mintRun(issuedAt),
    };
    assert.equal((await post("u-1", body)).statusCode, 201);
    const r = await post("u-2", { ...body, competencyId: "go-functions" });
    assert.equal(r.statusCode, 409, r.body);
    assert.equal(r.json().error.code, "already_synced");
    assert.ok(!JSON.stringify(r.body).includes("u-1"), "the refusal must not name the other account");
  });

  it("rows never cross accounts, and strangers get 401", async () => {
    const issuedAt = new Date().toISOString();
    await post("u-1", {
      competencyId: "go-functions",
      level: "demonstrated",
      lastDemonstratedAt: issuedAt,
      lastRetrievedAt: null,
      receipt: mintRun(issuedAt),
    });
    assert.deepEqual((await get("u-2")).json().proofs, []);
    const noUser = { "x-internal-key": KEY, "content-type": "application/json" };
    const anon = await app.inject({ method: "GET", url: "/proofs", headers: { "x-internal-key": KEY } });
    assert.equal(anon.statusCode, 401, anon.body);
    const anonPost = await app.inject({
      method: "POST",
      url: "/proofs",
      headers: noUser,
      payload: { competencyId: "x", level: "demonstrated", lastDemonstratedAt: null, lastRetrievedAt: null, receipt: mintRun(issuedAt) },
    });
    assert.equal(anonPost.statusCode, 401, anonPost.body);
  });

  it("an Ed25519-signed receipt verifies on the offline path too", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const issuedAt = new Date().toISOString();
    const payload = contracts.runReceiptPayload(runFacts, issuedAt);
    const receipt = { v: 1, issuedAt, facts: runFacts, sig: kit.signReceipt(payload, KEY), sigEd: kit.signReceiptEd(payload, pem), keyId: "ed-test" };
    const savedEd = process.env.RECEIPT_ED25519_KEY;
    try {
      process.env.RECEIPT_ED25519_KEY = pem;
      const r = await post("u-1", {
        competencyId: "go-functions",
        level: "demonstrated",
        lastDemonstratedAt: issuedAt,
        lastRetrievedAt: null,
        receipt,
      });
      assert.equal(r.statusCode, 201, r.body);
      assert.equal(r.json().stored, true);
    } finally {
      if (savedEd === undefined) delete process.env.RECEIPT_ED25519_KEY;
      else process.env.RECEIPT_ED25519_KEY = savedEd;
    }
  });

  it("contracts accept both receipt kinds and refuse a missing one", () => {
    const issuedAt = new Date().toISOString();
    const base = { competencyId: "go-functions", level: "demonstrated", lastDemonstratedAt: issuedAt, lastRetrievedAt: null };
    assert.ok(contracts.proofSubmitSchema.safeParse({ ...base, receipt: mintRun(issuedAt) }).success);
    assert.ok(contracts.proofSubmitSchema.safeParse({ ...base, receipt: mintDesign(issuedAt) }).success);
    assert.ok(!contracts.proofSubmitSchema.safeParse({ ...base }).success, "no receipt is not a submission");
    assert.ok(!contracts.proofSubmitSchema.safeParse({ ...base, receipt: { v: 1 } }).success, "a husk is not a receipt");
  });
});

/* The four findings the session-9 audit left in the auth service (B-28).
 *
 * Re-read in the code first, because the audit was written in session 9 and this
 * service has moved a long way since: one of the four (the unswept login-hit map)
 * had been fixed by the two-budget throttle that replaced it, and that is asserted
 * here so it stays fixed. The other three were still open, and each test fails on
 * the pre-fix behaviour.
 */
describe("auth edge cases the audit named (B-28)", () => {
  let app;
  const fakePool = fakeAuthPool();
  const register = (email, ip, password = "correct-horse-battery") =>
    app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "application/json", "x-client-ip": ip },
      payload: { email, password },
    });
  const login = (email, password, ip = "198.51.100.7") =>
    app.inject({
      method: "POST",
      url: "/login",
      headers: { "content-type": "application/json", "x-client-ip": ip },
      payload: { email, password },
    });
  const timed = async (fn) => {
    const started = Date.now();
    const value = await fn();
    return { ms: Date.now() - started, value };
  };

  let savedSecret;
  before(async () => {
    // Set here rather than inherited from whatever another describe left in place:
    // this suite is run on its own (a --test-name-pattern run is how it is
    // falsified), and a signing secret that happens to be set by an earlier hook is
    // not a dependency worth having — without it the register route 500s on
    // AUTH_JWT_SECRET and the failure looks like the feature.
    savedSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = SECRET;
    const routes = await import("../services/auth/dist/routes.js");
    app = await kit.createService("test-auth-b28");
    routes.registerAuthRoutes(app, fakePool);
    await app.ready();
  });
  after(() => {
    if (savedSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = savedSecret;
  });

  it("spends the same password work on an account that does not exist", async () => {
    // The cost factor is raised for this test alone. The oracle has the same shape
    // at any factor; at the suite's rounds=4 a wrong password is a couple of
    // milliseconds, which is too close to scheduling noise to be a fair test of
    // "the same work happened". At 8, pre-fix the unknown-account answer is a
    // fraction of a percent of the wrong-password answer, and post-fix it is ~100%.
    const saved = process.env.BCRYPT_ROUNDS;
    process.env.BCRYPT_ROUNDS = "8";
    try {
      const created = await register("timing@example.com", "203.0.113.10");
      assert.equal(created.statusCode, 201, created.body);
      // Warm the dummy hash before timing, so this measures the compare rather
      // than the one-off cost of building it.
      await login("warmup@example.com", "not-the-password");
      const wrong = await timed(() => login("timing@example.com", "not-the-password"));
      const unknown = await timed(() => login("nobody@example.com", "not-the-password"));
      assert.equal(wrong.value.statusCode, 401);
      assert.equal(unknown.value.statusCode, 401);
      const wrongErr = wrong.value.json().error;
      const unknownErr = unknown.value.json().error;
      assert.deepEqual(
        { code: wrongErr.code, message: wrongErr.message },
        { code: unknownErr.code, message: unknownErr.message },
        "the two answers must stay indistinguishable apart from the request id"
      );
      assert.ok(
        unknown.ms > wrong.ms * 0.5,
        `an unknown account must not answer faster than a wrong password ` +
          `(unknown ${unknown.ms}ms vs wrong ${wrong.ms}ms)`
      );
    } finally {
      if (saved === undefined) delete process.env.BCRYPT_ROUNDS;
      else process.env.BCRYPT_ROUNDS = saved;
    }
  });

  it("bounds account creation per address, and only for that address", async () => {
    const address = "203.0.113.20";
    for (let i = 0; i < 10; i++) {
      const r = await register(`bulk-${i}@example.com`, address);
      assert.equal(r.statusCode, 201, `registration ${i + 1} should be allowed: ${r.body}`);
    }
    const eleventh = await register("bulk-10@example.com", address);
    assert.equal(eleventh.statusCode, 429, "the eleventh account from one address in an hour is refused");
    assert.equal(eleventh.json().error.code, "rate_limited");
    const elsewhere = await register("bulk-other@example.com", "203.0.113.21");
    assert.equal(elsewhere.statusCode, 201, "one address's budget must not deny another");
    // The budget is spent before the bcrypt hash runs, which is the whole point:
    // no user row may exist for the refused attempt.
    assert.equal(
      [...fakePool.users.values()].some((u) => u.email === "bulk-10@example.com"),
      false,
      "a refused registration must not have created an account"
    );
  });

  it("two concurrent refreshes with one token cannot both mint a session", async () => {
    /* A pool whose first two reads of a token wait for each other.
     *
     * The guard can only be tested by requests that are genuinely simultaneous: two
     * sequential refreshes pass with the guard *removed*, because the second one
     * reads `revoked_at` already set and takes the reuse path on its own. That was
     * this test's first version, and falsification caught it. Holding both reads
     * until both have happened is the smallest thing that reproduces the shape a real
     * race has, without depending on the scheduler. */
    const base = fakeAuthPool();
    let reads = 0;
    let releaseBoth;
    const bothHaveRead = new Promise((resolve) => {
      releaseBoth = resolve;
    });
    const pool = {
      ...base,
      query: async (sql, params) => {
        const gate = sql.startsWith("SELECT * FROM refresh_tokens WHERE token_hash") && reads < 2;
        if (gate) reads += 1;
        const result = await base.query(sql, params);
        if (gate) {
          if (reads === 2) releaseBoth();
          await bothHaveRead;
        }
        return result;
      },
    };
    const routes = await import("../services/auth/dist/routes.js");
    const raceApp = await kit.createService("test-auth-b28-race");
    routes.registerAuthRoutes(raceApp, pool);
    await raceApp.ready();

    const reg = await raceApp.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "application/json", "x-client-ip": "203.0.113.12" },
      payload: { email: "race@example.com", password: "correct-horse-battery" },
    });
    assert.equal(reg.statusCode, 201, reg.body);
    const { refreshToken } = reg.json().tokens;
    const post = () =>
      raceApp.inject({
        method: "POST",
        url: "/refresh",
        headers: { "content-type": "application/json" },
        payload: { refreshToken },
      });
    const [a, b] = await Promise.all([post(), post()]);
    const codes = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    assert.deepEqual(codes, [200, 401], `exactly one refresh may win (got ${codes.join(", ")})`);
    const loser = a.statusCode === 401 ? a : b;
    assert.equal(loser.json().error.code, "token_reused", "the loser gets the reuse verdict, not a silent second session");
    // The family is revoked, and that now provably includes the row the winner
    // minted a moment earlier: the winner mints before it claims, so its row exists
    // before the loser's failed claim — which is what the loser revokes on.
    const rows = [...pool.tokens.values()].filter((r) => r.user_id === reg.json().user.id);
    assert.equal(rows.filter((r) => !r.revoked_at).length, 0, "no live session survives the race");
    await raceApp.close();
  });

  it("the throttle maps are still swept (the audit's fourth finding, closed)", () => {
    // Sweeping is the absence of unbounded growth, which a request-level test
    // cannot observe, so it is asserted at the source — the same treatment the
    // revocation prune gets. The check is that the only way either map grows
    // still sweeps, with the gateway limiter's amortised threshold.
    const src = readFileSync(join(root, "services", "auth", "src", "routes.ts"), "utf8");
    assert.match(src, /function sweep\(/, "the sweep helper still exists");
    assert.match(src, /sweep\(map, now\);/, "and the growth path still calls it");
    assert.match(src, /map\.size < 10_000/, "with the same threshold the gateway limiter uses");
  });
});

describe("immediate revocation, end to end (real gateway → real auth service)", () => {
  /* The seam the two layers above cannot cover by themselves.
   *
   * The live-proxy tests encode what the *gateway* expects of the check endpoint,
   * and the lifecycle tests exercise the *auth service's* own route — but if the
   * two disagreed about the path, the method, the body shape or the mesh header,
   * both would still pass and the denylist would be quietly decorative in
   * production. So here the real auth routes listen on a port, the real gateway is
   * spawned in front of them, and only Postgres is faked. This is also the check
   * the compose e2e performs, runnable without a Docker daemon (that suite skips
   * when the daemon is absent, which is why this exists).
   */
  const AUTH_PORT = 18097;
  const STUB_PORT = 18096;
  const GW_PORT = 18095;
  let gwProc = null;
  let authApp = null;
  let authPool = null;
  let stub = null;
  const GW = `http://127.0.0.1:${GW_PORT}`;

  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${GW}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      /* an empty or non-JSON reply: the status is still the answer */
    }
    return { status: res.status, body: parsed };
  };

  before(async () => {
    const saved = { secret: process.env.AUTH_JWT_SECRET, mesh: process.env.INTERNAL_API_KEY };
    process.env.AUTH_JWT_SECRET = SECRET;
    // The mesh key is ON for both sides: the denylist check is an internal route,
    // and a key the other side does not share must fail loudly (403 → 503), never
    // read as "not revoked".
    process.env.INTERNAL_API_KEY = MESH;
    try {
      const kitMod = await import("../packages/service-kit/dist/index.js");
      const routes = await import("../services/auth/dist/routes.js");
      authPool = fakeAuthPool();
      authApp = await kitMod.createService("test-auth-integration");
      routes.registerAuthRoutes(authApp, authPool);
      await authApp.listen({ port: AUTH_PORT, host: "127.0.0.1" });
    } finally {
      if (saved.secret === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = saved.secret;
      if (saved.mesh === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = saved.mesh;
    }

    // An execution stub: something for an authenticated request to be forwarded to.
    // The gateway strips the /api/<service> prefix, so it answers /capabilities.
    stub = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ stub: true, path: req.url, user: req.headers["x-user-id"] ?? null }));
    });
    await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));

    gwProc = spawn("node", ["services/gateway/dist/index.js"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(GW_PORT),
        FRONTEND_URL: "http://localhost:3000",
        AUTH_JWT_SECRET: SECRET,
        INTERNAL_API_KEY: MESH,
        AUTH_URL: `http://127.0.0.1:${AUTH_PORT}`,
        CURRICULUM_URL: `http://127.0.0.1:${STUB_PORT}`,
        EXECUTION_URL: `http://127.0.0.1:${STUB_PORT}`,
        BILLING_URL: `http://127.0.0.1:${STUB_PORT}`,
      },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`${GW}/health/live`);
        if (r.ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(async () => {
    try {
      gwProc?.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    try {
      await authApp?.close();
    } catch {
      /* already closed */
    }
    try {
      await new Promise((resolve) => stub?.close(() => resolve(undefined)));
    } catch {
      /* already closed */
    }
  });

  it("signing out kills the access token on the very next request", async () => {
    const email = `revoke-${Date.now()}@test.dev`;
    const password = "0123456789abcdef";
    const reg = await call("POST", "/api/auth/register", { body: { email, password } });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const { accessToken, refreshToken } = reg.body.tokens;

    const before = await call("GET", "/api/execute/capabilities", { token: accessToken });
    assert.equal(before.status, 200, "the token works while the session is live");
    assert.equal(before.body.user, reg.body.user.id, "and it resolves to the right learner");

    // Sign out the way the app's broker does: both credentials in one call.
    const out = await call("POST", "/api/auth/logout", { body: { refreshToken, accessToken } });
    assert.equal(out.status, 200);

    const after = await call("GET", "/api/execute/capabilities", { token: accessToken });
    assert.equal(after.status, 401, "the token the learner just signed out with is refused at once");
    assert.equal(after.body.error.code, "token_revoked");

    // The family is dead too, so no replacement can be minted for that session.
    const refreshed = await call("POST", "/api/auth/refresh", { body: { refreshToken } });
    assert.equal(refreshed.status, 401);

    // And the learner's next sign-in is unaffected: revocation names one
    // credential, not the account.
    const login = await call("POST", "/api/auth/login", { body: { email, password } });
    assert.equal(login.status, 200);
    const fresh = await call("GET", "/api/execute/capabilities", {
      token: login.body.tokens.accessToken,
    });
    assert.equal(fresh.status, 200, "a new session is not collaterally revoked");
    assert.equal(authPool.revoked.size, 1, "exactly one credential was recorded as revoked");

    // Signing out twice, with the token it just revoked, is still a 200: the route
    // must stay idempotent and free of an oracle, so the edge exempts it from the
    // revocation gate. (A learner whose sign-out was retried by a flaky connection
    // would otherwise meet a 401 they can do nothing about.)
    const twice = await call("POST", "/api/auth/logout", { body: { refreshToken, accessToken } });
    assert.equal(twice.status, 200, "a repeated sign-out is not an error");
    assert.equal(authPool.revoked.size, 1, "and it does not write a second row");
  });

  it("signing out everywhere ends every device, and the next sign-in is not collateral damage", async () => {
    /* The property a per-credential sign-out cannot have. Device A's token names a
       different `jti` than the one that signed out, so it can only be refused
       through the account cut-off — and the whole point of a cut-off is that the
       learner can sign back in afterwards. */
    const email = `everywhere-${Date.now()}@test.dev`;
    const password = "0123456789abcdef";
    const a = await call("POST", "/api/auth/register", { body: { email, password } });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await call("POST", "/api/auth/login", { body: { email, password } });
    assert.equal(b.status, 200);

    // Two devices, two live sessions — otherwise "everywhere" is being claimed
    // about a session that was already over.
    for (const t of [a.body.tokens.accessToken, b.body.tokens.accessToken]) {
      assert.equal((await call("GET", "/api/execute/capabilities", { token: t })).status, 200);
    }

    // The cut-off is compared against `iat`, which has one-second resolution, so a
    // token minted in the same second as the sign-out is deliberately spared (see
    // revocation-store.ts). Letting that second pass keeps this test about the
    // cut-off rather than about the clock.
    await new Promise((r) => setTimeout(r, 1_100));

    // Device B ends them all. The subject comes from the token in the body, never
    // from anything the caller typed — that is what stops one learner signing
    // another out everywhere.
    const out = await call("POST", "/api/auth/logout-all", {
      body: { accessToken: b.body.tokens.accessToken },
    });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.ok(out.body.sessions >= 1, "the reply says how many sessions were ended");

    // Both devices are refused on their very next request, and the reason is the
    // account rather than the credential for device A — the half that only exists
    // because the check carries the subject.
    for (const t of [a.body.tokens.accessToken, b.body.tokens.accessToken]) {
      const res = await call("GET", "/api/execute/capabilities", { token: t });
      assert.equal(res.status, 401, "every device is out");
      assert.equal(res.body.error.code, "token_revoked");
    }

    // Neither family can mint a replacement: "everywhere" also ends the refresh
    // half, so the sign-out is not just a five-minute deadline.
    for (const rt of [a.body.tokens.refreshToken, b.body.tokens.refreshToken]) {
      assert.equal((await call("POST", "/api/auth/refresh", { body: { refreshToken: rt } })).status, 401);
    }

    // And the learner can come back: a cut-off is a moment, not a ban.
    const back = await call("POST", "/api/auth/login", { body: { email, password } });
    assert.equal(back.status, 200);
    const resumed = await call("GET", "/api/execute/capabilities", { token: back.body.tokens.accessToken });
    assert.equal(resumed.status, 200, "a fresh sign-in is not collateral damage");
  });

  it("the denylist is an internal route: no mesh key, no answer", async () => {
    // The gateway is the only holder of the key, and this is the check that keeps
    // an arbitrary caller from asking which ids are revoked — or from being
    // trusted if it answered.
    const bare = await fetch(`http://127.0.0.1:${AUTH_PORT}/internal/revocations/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jti: "anything" }),
    });
    assert.equal(bare.status, 403);
    const wrong = await fetch(`http://127.0.0.1:${AUTH_PORT}/internal/revocations/check`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": "guessed" },
      body: JSON.stringify({ jti: "anything" }),
    });
    assert.equal(wrong.status, 403);
  });
});

/* ------------------------------------------------------------------ *
 * Lawful basis, erasure and the rights ledger (007_rights.sql)
 *
 * The audit this answers (company/LEGAL-COMPLIANCE-AUDIT.md, F-04, F-05, F-06,
 * F-13) found a product collecting identities, payments and learner code with no
 * way to give any of it back, no record of what was agreed to, and nothing that
 * ever deleted anything. Each assertion below is one of those gaps, and each one
 * is written so it fails if the mechanism is removed rather than merely
 * rearranged. The two that matter most are the ones a screenshot cannot show:
 *
 *   - an account cannot exist without its record of what was shown (the CTE);
 *   - the credential a learner is holding dies when the account does (the
 *     deleted-subject cut-off), because a deleted account whose token still
 *     works is the failure that looks like success.
 * ------------------------------------------------------------------ */
describe("lawful basis, erasure and the rights ledger (in-process, fake pg)", () => {
  let app;
  let fakePool;
  let rights;
  let billing;
  const saved = {};
  const PASSWORD = "0123456789abcdef";
  /** A fresh address per attempt: the fake enforces the unique index, so a shared
   * one would make the second test fail for a reason the test is not about. */
  let seq = 0;

  /** Every call carries the mesh key, as the gateway's forwarded requests do once
   * a key is configured — which this block deliberately does, so the erasure's
   * cross-service hop is proven with the credential production uses. */
  const mesh = (extra = {}) => ({ "x-internal-key": MESH, ...extra });

  const register = (extra = {}) =>
    app.inject({
      method: "POST",
      url: "/register",
      headers: mesh({ "content-type": "application/json", "x-client-ip": "203.0.113.99" }),
      payload: { email: `rights-${(seq += 1)}@test.dev`, password: PASSWORD, ...extra },
    });

  const claimsOf = (token) =>
    JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

  before(async () => {
    for (const k of ["AUTH_JWT_SECRET", "NEXORA_REQUIRE_CONSENT", "BILLING_URL", "INTERNAL_API_KEY"])
      saved[k] = process.env[k];
    process.env.AUTH_JWT_SECRET = SECRET;
    // Production has a mesh key, so this run does too: the cross-service erasure
    // has to be asserted *with* the credential it uses in production, or the test
    // would prove only that an open route happens to work.
    process.env.INTERNAL_API_KEY = MESH;
    delete process.env.NEXORA_REQUIRE_CONSENT;
    // A stand-in for the billing service, so the cross-service half of an erasure
    // is exercised rather than skipped: it records what it was asked and answers
    // the way the real route does.
    billing = { calls: [], server: null };
    billing.server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        billing.calls.push({ url: req.url, key: req.headers["x-internal-key"], body: JSON.parse(body || "{}") });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ anonymised: true, retained: [] }));
      });
    });
    await new Promise((resolve) => billing.server.listen(0, "127.0.0.1", resolve));
    process.env.BILLING_URL = `http://127.0.0.1:${billing.server.address().port}`;

    const kitMod = await import("../packages/service-kit/dist/index.js");
    const routes = await import("../services/auth/dist/routes.js");
    rights = await import("../services/auth/dist/rights.js");
    fakePool = fakeAuthPool();
    app = await kitMod.createService("test-auth-rights");
    routes.registerAuthRoutes(app, fakePool);
    await app.ready();
  });

  after(async () => {
    await billing.server?.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("a production deployment refuses an account with no recorded notice", async () => {
    process.env.NEXORA_REQUIRE_CONSENT = "1";
    try {
      const bare = await register();
      assert.equal(bare.statusCode, 400, bare.body);
      assert.equal(bare.json().error.code, "notice_required");
      assert.equal(fakePool.users.size, 0, "nothing is created when the notice was not given");

      const partial = await register({ acceptTerms: true, acceptPrivacy: true });
      assert.equal(partial.statusCode, 400, "an unaffirmed age is still a refusal");
      assert.match(partial.json().error.message, /age affirmation/);

      const stale = await register({
        acceptTerms: true,
        acceptPrivacy: true,
        ageAffirmed: true,
        documentVersions: { terms: "2020-01-01", privacy: "2020-01-01" },
      });
      assert.equal(stale.statusCode, 409, stale.body);
      assert.equal(stale.json().error.code, "document_version_mismatch");
      assert.equal(fakePool.users.size, 0, "a stale document version creates nothing");

      const ok = await register({
        acceptTerms: true,
        acceptPrivacy: true,
        ageAffirmed: true,
        documentVersions: { ...contracts.CURRENT_DOCUMENT_VERSIONS },
      });
      assert.equal(ok.statusCode, 201, ok.body);
      // The account and its declarations landed together, and the version on each
      // row is the service's own — not the client's word for it.
      const rows = [...fakePool.consents.values()].filter((c) => c.user_id === ok.json().user.id);
      assert.equal(rows.length, 3, "terms, privacy and the age affirmation are each recorded");
      assert.deepEqual(
        rows.map((r) => r.document).sort(),
        ["age-affirmation", "privacy", "terms"],
        "the three declarations are the ones the notice promised"
      );
      for (const r of rows) {
        assert.equal(r.version, contracts.CURRENT_DOCUMENT_VERSIONS.privacy, "the served version, not the claimed one");
        assert.ok(r.purpose.length > 10 && r.basis.length > 3, "each row states its purpose and its basis");
      }
    } finally {
      delete process.env.NEXORA_REQUIRE_CONSENT;
    }
  });

  it("the export is the learner's own record, and names what it does not hold", async () => {
    const reg = await register({ acceptTerms: true, acceptPrivacy: true, ageAffirmed: true });
    assert.equal(reg.statusCode, 201, reg.body);
    const id = reg.json().user.id;

    const res = await app.inject({
      method: "GET",
      url: "/account/export",
      headers: mesh({ "x-user-id": id }),
    });
    assert.equal(res.statusCode, 200, res.body);
    const out = res.json();
    assert.equal(out.format, "nexora-account-export");
    assert.equal(out.service, "auth", "the half is labelled, because billing exports the other one");
    assert.equal(out.subject.email, reg.json().user.email);
    assert.equal(out.consents.length, 3);
    assert.ok(Array.isArray(out.rightsRequests) && Array.isArray(out.proofs));
    // The omission is stated rather than discovered: an export that quietly
    // dropped the payment history would not be the artifact Art. 15 describes.
    assert.ok(
      out.notIncluded.some((n) => /Payment and subscription/.test(n.category)),
      "the export names the records this service does not hold"
    );
    // A credential must never travel in an export file.
    assert.ok(!res.body.includes("token_hash"), "no session credential is in the export");
    assert.deepEqual(Object.keys(out.sessions).sort(), ["active", "deviceCodes", "revoked"]);
  });

  it("a rights request is recorded with its statutory clock, not a promise", async () => {
    const reg = await register({ acceptTerms: true, acceptPrivacy: true, ageAffirmed: true });
    const id = reg.json().user.id;
    const res = await app.inject({
      method: "POST",
      url: "/rights",
      headers: mesh({ "content-type": "application/json", "x-user-id": id }),
      payload: { kind: "rectification", detail: "My display name is misspelled." },
    });
    assert.equal(res.statusCode, 201, res.body);
    const body = res.json();
    assert.equal(body.request.kind, "rectification");
    assert.equal(body.responseDays, contracts.RIGHTS_RESPONSE_DAYS);
    const due = new Date(body.request.dueAt).getTime();
    const created = new Date(body.request.createdAt).getTime();
    const days = Math.round((due - created) / 86400000);
    assert.equal(days, 30, "one month, the strictest of GDPR 30 / CCPA 45 / DPDP 90");
    assert.equal(body.request.status, "received");

    // And the learner can read the clock back on their own request.
    const list = await app.inject({ method: "GET", url: "/rights", headers: mesh({ "x-user-id": id }) });
    assert.equal(list.json().requests.length, 1);

    // An unknown kind is a 400, not a silently-ignored row.
    const bad = await app.inject({
      method: "POST",
      url: "/rights",
      headers: mesh({ "content-type": "application/json", "x-user-id": id }),
      payload: { kind: "free-money", detail: "x" },
    });
    assert.equal(bad.statusCode, 400);
  });

  it("withdrawal is a control, and it says what it changed", async () => {
    const reg = await register({ acceptTerms: true, acceptPrivacy: true, ageAffirmed: true });
    const id = reg.json().user.id;
    const w = await app.inject({
      method: "POST",
      url: "/consents/withdraw",
      headers: mesh({ "content-type": "application/json", "x-user-id": id }),
      payload: { document: "terms" },
    });
    assert.equal(w.statusCode, 200, w.body);
    assert.equal(w.json().withdrawn, true);
    // The honest answer differs by basis: consent stops the processing, a contract
    // basis means the account cannot continue on it and erasure is the alternative.
    assert.match(w.json().effect, /cannot continue on this basis/);
    assert.ok(fakePool.consents.get(`${id}|terms`).withdrawn_at instanceof Date);

    const again = await app.inject({
      method: "POST",
      url: "/consents/withdraw",
      headers: mesh({ "content-type": "application/json", "x-user-id": id }),
      payload: { document: "terms" },
    });
    assert.equal(again.statusCode, 200, "withdrawing twice is not an error");
    assert.equal(again.json().effect, null, "and it does not claim a second change");
  });

  it("erasure deletes the account, cuts off the credential it left behind, and names what it kept", async () => {
    const reg = await register({ acceptTerms: true, acceptPrivacy: true, ageAffirmed: true });
    assert.equal(reg.statusCode, 201, reg.body);
    const user = reg.json().user;
    const token = reg.json().tokens.accessToken;
    const claims = claimsOf(token);
    assert.ok(claims.jti, "the access token names itself, which is what a cut-off is checked against");

    // Before: the credential is live.
    const before = await app.inject({
      method: "POST",
      url: "/internal/revocations/check",
      headers: mesh({ "content-type": "application/json" }),
      payload: { jti: claims.jti, userId: user.id, issuedAtMs: claims.iat * 1000 },
    });
    assert.equal(before.json().revoked, false);

    // A typo must not be able to destroy an account: the confirmation is a word.
    const wrong = await app.inject({
      method: "POST",
      url: "/account/delete",
      headers: mesh({ "content-type": "application/json", "x-user-id": user.id }),
      payload: { confirm: "delete" },
    });
    assert.equal(wrong.statusCode, 400);
    assert.ok(fakePool.users.has(user.id), "the account survives a rejected confirmation");
    const usersBefore = fakePool.users.size;

    const del = await app.inject({
      method: "POST",
      url: "/account/delete",
      headers: mesh({ "content-type": "application/json", "x-user-id": user.id }),
      payload: { confirm: "DELETE" },
    });
    assert.equal(del.statusCode, 200, del.body);
    const out = del.json();
    assert.equal(out.deleted.account, 1);
    assert.equal(out.deleted.consentRecords, 3, "the acceptance record goes with the account");
    assert.equal(out.deleted.sessions, 1, "every refresh family went with it");
    assert.ok(out.receiptId, "an erasure leaves a receipt");
    // The honest half: what could not be deleted, and the basis for keeping it.
    assert.ok(out.retained.length >= 3);
    assert.ok(
      out.retained.some((r) => r.basis === "legal-obligation" && /tax/i.test(r.reason)),
      "the retention exception is stated with its legal basis, not hidden"
    );
    assert.ok(
      out.processorsQueued.some((p) => /Clerk/.test(p)) && out.processorsQueued.some((p) => /Dodo/.test(p)),
      "the processors holding their own copy are named as outstanding work"
    );

    // The account is gone: no rows of its own left anywhere, and no export to be
    // had. Scoped to this learner's rows — the fake holds accounts from the other
    // tests in this block, and an assertion on the whole table would pass or fail
    // for reasons that have nothing to do with the deletion under test.
    assert.equal(fakePool.users.has(user.id), false, "the account row is deleted");
    assert.equal(fakePool.users.size, usersBefore - 1, "and nothing else was deleted with it");
    const mine = (map) => [...map.values()].filter((r) => r.user_id === user.id);
    assert.equal(mine(fakePool.consents).length, 0, "its declarations cascaded");
    assert.equal(mine(fakePool.tokens).length, 0, "and its sessions");
    assert.equal(mine(fakePool.revoked).length, 0, "and its revoked-credential rows");
    const gone = await app.inject({ method: "GET", url: "/account/export", headers: mesh({ "x-user-id": user.id }) });
    assert.equal(gone.statusCode, 404);

    // The credential in the learner's hands stops working. This is the assertion
    // that a deleted account is not a still-usable one.
    const after = await app.inject({
      method: "POST",
      url: "/internal/revocations/check",
      headers: mesh({ "content-type": "application/json" }),
      payload: { jti: claims.jti, userId: user.id, issuedAtMs: claims.iat * 1000 },
    });
    assert.equal(after.json().revoked, true, "a token issued before the erasure is refused after it");
    assert.equal(after.json().reason, "account");

    // The receipt, the ledger and the cut-off all outlived the account — that is
    // what makes them evidence. The request ledger keeps the subject as a
    // pseudonym so a 24-month record of the request survives the deletion.
    assert.equal(fakePool.erasures.size, 1);
    assert.equal(fakePool.deletedCutoffs.size, 1);

    // Billing was asked, over the mesh, with the identity it keys its rows on.
    assert.equal(billing.calls.length, 1, "the erasure reached the billing service");
    assert.equal(billing.calls[0].url, "/internal/erase");
    assert.equal(billing.calls[0].key, MESH, "and it went out with the mesh key, not as an open route");
    assert.deepEqual(billing.calls[0].body, { userId: user.id });
    assert.ok(
      [...fakePool.handoffs.values()].some((h) => h.provider.startsWith("NEXORA") && h.completed_at),
      "the completed handoff is marked done rather than left open"
    );
    assert.ok(
      [...fakePool.handoffs.values()].filter((h) => h.provider.startsWith("Clerk")).every((h) => !h.completed_at),
      "a processor this service cannot reach stays open work"
    );
  });

  it("the retention sweep deletes expired rows and never touches open work", async () => {
    fakePool = fakeAuthPool();
    const settled = new Date(Date.now() - 900 * 24 * 3600_000); // past 24 months
    const recent = new Date(Date.now() - 40 * 24 * 3600_000); // well inside it
    // Expired: a refresh token past its life, a device code with a day of slack
    // used up, and a settled request past 24 months.
    fakePool.tokens.set("hash", { id: "t1", user_id: "u1", token_hash: "hash", expires_at: recent, revoked_at: null });
    fakePool.deviceCodes.set("d1", { id: "d1", approved_user_id: "u1", expires_at: settled });
    fakePool.requests.set("r1", { id: "r1", user_id: "u1", subject_ref: "x", resolved_at: settled, due_at: settled });
    // Open or recent: must survive, because deleting the evidence that work is
    // outstanding is how an obligation disappears instead of being met.
    fakePool.requests.set("r2", { id: "r2", user_id: "u1", subject_ref: "x", resolved_at: null, due_at: new Date() });
    fakePool.handoffs.set("h1", { id: "h1", provider: "Clerk (identity)", subject_ref: "x", completed_at: null });

    const removed = await rights.pruneRetention(fakePool);
    assert.equal(removed.refreshTokens, 1);
    assert.equal(removed.deviceCodes, 1);
    assert.equal(removed.rightsRequests, 1);
    assert.equal(fakePool.requests.has("r2"), true, "an unanswered request is never pruned");
    assert.equal(fakePool.handoffs.has("h1"), true, "an unactioned processor handoff is never pruned");
  });

  it("the production gate is a switch, not a hardcoded refusal", () => {
    // Both directions, because a gate that cannot be turned off is as useless as
    // one that cannot be turned on — and the default has to be the safe one.
    const withFlag = rights.consentRequired({ NEXORA_REQUIRE_CONSENT: "1" });
    assert.equal(withFlag, true);
    assert.equal(rights.consentRequired({ NODE_ENV: "production" }), true, "production requires the notice by default");
    assert.equal(rights.consentRequired({ NODE_ENV: "development" }), false);
    assert.equal(
      rights.consentRequired({ NODE_ENV: "production", NEXORA_REQUIRE_CONSENT: "0" }),
      false,
      "and an operator can turn it off deliberately, in writing"
    );
  });
});

describe("execution compile-time abuse bounds (P0)", () => {
  it("rejects a Go submission whose import graph is a compile workload", () => {
    // A small file count can still hide a deep type-check: `go run` compiles
    // every package in the import graph, so shape - not size - is the cost.
    const imports = Array.from({ length: execValidate.MAX_GO_IMPORTS + 5 }, (_, i) => `\t"lib/pkg${i}"`).join("\n");
    const job = {
      language: "go",
      files: [{ path: "main.go", content: `package main\n\nimport (\n${imports}\n)\n` }],
      command: ["go", "run", "main.go"],
    };
    assert.throws(() => execValidate.validateJob(job), /imports .+ packages; the limit is/);
  });
  it("counts every import form exactly once, and ignores non-Go files", () => {
    const forms = `package main\n\nimport (\n\t_ "os"\n\talias "net/http"\n\t. "strings"\n)\n\nimport "fmt"\n`;
    assert.equal(execValidate.countGoImports([{ path: "main.go", content: forms }]), 4);
    // A commented-out or in-string `import` is not an import, and go.mod is not Go.
    assert.equal(
      execValidate.countGoImports([
        { path: "a.go", content: '// import "fmt"\nvar s = "import \\"fake\\""\n' },
        { path: "go.mod", content: 'module x\nrequire "github.com/google/uuid" v1.0.0\n' },
      ]),
      0
    );
    // A normal learner submission stays well inside the limit.
    assert.equal(
      execValidate.countGoImports([{ path: "m.go", content: 'import (\n\t"fmt"\n\t"sync"\n)\n' }]),
      2
    );
  });
  it("caps a Go job at the compile budget, and leaves other languages alone", () => {
    const goFiles = [{ path: "main.go", content: 'package main\nimport "fmt"\nfunc main() { fmt.Println(1) }\n' }];
    // A Go job asking for more than the compile ceiling gets the ceiling, not
    // a longer build than any learner submission needs.
    const go = execValidate.validateJob({
      language: "go",
      files: goFiles,
      command: ["go", "run", "main.go"],
      limits: { timeoutMs: 999_999 },
    });
    assert.equal(go.timeoutMs, execValidate.MAX_COMPILE_MS);
    assert.ok(go.timeoutMs <= execValidate.MAX_TIMEOUT_MS);
    // A Go job with no explicit request still gets its compile-sized default.
    assert.equal(
      execValidate.validateJob({ language: "go", files: goFiles, command: ["go", "run", "main.go"] }).timeoutMs,
      execValidate.DEFAULT_TIMEOUT_BY_LANGUAGE.go
    );
    // Non-Go jobs are untouched: they face only the generic wall-clock cap.
    const node = execValidate.validateJob({
      language: "node",
      files: [{ path: "m.js", content: "1" }],
      command: ["node", "m.js"],
      limits: { timeoutMs: 999_999 },
    });
    assert.equal(node.timeoutMs, execValidate.MAX_TIMEOUT_MS);
    assert.ok(node.timeoutMs > execValidate.MAX_COMPILE_MS, "node keeps the larger generic ceiling");
  });
});

/* The global breaker is the last line of defence against a flood: a per-IP
   ceiling that sits in front of every route, so a burst that outruns the
   per-route anon caps is still caught. Asserted live, because "the limiter is
   single-instance and keyed on req.ip" is a production posture (D-006) whose
   only proof is that the breaker actually fires. The gateway is spawned on its
   own port with a tiny GATEWAY_GLOBAL_LIMIT so the test trips in a handful of
   requests and never touches the shared 18080 instance the other suites drive.
   The route's own cap (auth: 120/min) is far above the test's global ceiling,
   so a 429 here can only be the global breaker — that differential is the proof. */
describe("gateway global breaker (P0)", () => {
  const GW_PORT = 18090;
  const LIMIT = 5; // the global ceiling for this instance, under the route's 120/min
  let proc = null;
  let stub = null;
  let stubHits = 0;

  before(async () => {
    stub = http.createServer((_req, res) => {
      stubHits++;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise((r) => stub.listen(18082, "127.0.0.1", r));
    // AUTH_URL/CURRICULUM_URL/EXECUTION_URL/BILLING_URL all point at the stub so
    // no real upstream is needed: this test is only about the edge limiter.
    proc = spawn("node", ["services/gateway/dist/index.js"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(GW_PORT),
        FRONTEND_URL: "http://localhost:3000",
        AUTH_JWT_SECRET: SECRET,
        INTERNAL_API_KEY: "mesh-global-breaker-test-key-0123456789abcdef",
        AUTH_URL: "http://127.0.0.1:18082",
        CURRICULUM_URL: "http://127.0.0.1:18082",
        EXECUTION_URL: "http://127.0.0.1:18082",
        BILLING_URL: "http://127.0.0.1:18082",
        // The whole point: a ceiling low enough to trip in a few requests.
        GATEWAY_GLOBAL_LIMIT: String(LIMIT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // wait for readiness on /health/live (never limited).
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${GW_PORT}/health/live`);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(async () => {
    if (proc) proc.kill();
    if (stub) await new Promise((r) => stub.close(r));
  });

  it("the global breaker trips after GATEWAY_GLOBAL_LIMIT and refuses with 429", async () => {
    stubHits = 0;
    // /api/auth/me is an optional-auth route: a bare request needs no token and
    // still proxies (proven above), so the only budget it spends is the global
    // one. With TRUST_PROXY=0 (default) req.ip is the socket address, so every
    // fetch here shares one key — which is exactly what makes the trip
    // deterministic. The route's 120/min cap is far above this test's ceiling,
    // so any 429 below is the global breaker, not the route limiter.
    const statuses = [];
    for (let i = 0; i < LIMIT + 2; i++) {
      const r = await fetch(`http://127.0.0.1:${GW_PORT}/api/auth/me`);
      statuses.push(r.status);
      if (r.status === 429) {
        const body = await r.json();
        assert.equal(body.error.code, "rate_limited");
      }
    }
    // The first LIMIT requests pass; the two past it are refused. This proves the
    // ceiling is exactly GATEWAY_GLOBAL_LIMIT. The route's own cap is 120/min, so
    // a refusal after only LIMIT+2 requests CANNOT be the route limiter — it is
    // the global breaker, which is checked first and sits below the route's ceiling.
    assert.deepEqual(statuses.slice(0, LIMIT), Array(LIMIT).fill(200), "requests under the ceiling are proxied");
    assert.deepEqual(statuses.slice(LIMIT), [429, 429], "requests past the ceiling are refused");
    // The breaker is checked BEFORE the route is forwarded: upstream saw only the
    // allowed requests, so a refused flood never reaches a service.
    assert.equal(stubHits, LIMIT, "only the allowed requests were proxied upstream");
  });
});
