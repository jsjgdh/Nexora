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
const gwEntitlement = await import("../services/gateway/dist/entitlement.js");
const gwRevocation = await import("../services/gateway/dist/revocation.js");
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
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: "x" }), /32 characters/);
    // The shipped placeholders are long enough to pass a length check, which is
    // precisely why they were dangerous. Both must be refused outright.
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: "change-me-to-32-plus-random-characters" }),
      /placeholder/
    );
    assert.throws(
      () => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, INTERNAL_API_KEY: "change-me-internal-mesh-key" }),
      /placeholder/
    );
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, FRONTEND_URL: "notaurl" }), /http/);
    assert.equal(gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, PORT: "18080" }).port, 18080);
    assert.equal(
      gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, PORT: "18080", GATEWAY_PORT: "19090" }).port,
      19090
    );
    assert.throws(() => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, AUTH_MODE: "weird" }), /AUTH_MODE/);
    // The degradation bound. Default a minute; 0 is a supported value (fail closed
    // on an unreachable check) and a negative one is not a way to ask for more; the
    // ceiling keeps a typo from buying availability past the point where the
    // credentials it covers have expired on their own.
    assert.equal(c.revocationClearTtlMs, 60_000, "a minute of grace by default");
    assert.equal(c.revocationTimeoutMs, 2_000);
    const clearTtl = (v) => gwConfig.loadConfig({ AUTH_JWT_SECRET: SECRET, REVOCATION_CLEAR_TTL_MS: v }).revocationClearTtlMs;
    assert.equal(clearTtl("0"), 0, "0 means strict: every unanswerable check is a 503");
    assert.equal(clearTtl("-5000"), 0, "a negative bound is not a request to trust anything");
    assert.equal(clearTtl("5000"), 5_000);
    assert.equal(clearTtl("600000"), 300_000, "clamped to the point where the fallback stops covering live credentials");
    assert.throws(() => clearTtl("soon"), /REVOCATION_CLEAR_TTL_MS/);
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
        PROGRESS_URL: "http://127.0.0.1:18081",
        EXECUTION_URL: "http://127.0.0.1:18081",
        TUTOR_URL: "http://127.0.0.1:18081",
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
    const res = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "token_revoked");
    assert.equal(
      stubHits.find((h) => h.url === "/summary"),
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
    const again = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(again.status, 401);
    assert.equal(revocationChecks.length, 1, "a revoked id is not re-checked");
  });

  it("a live token is checked on every request and works", async () => {
    stubHits = [];
    revocationChecks = [];
    const t = await signWithJti("u-live-token", "live-live-1");
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
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
    const res = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, "revocation_unavailable");
    assert.equal(
      stubHits.find((h) => h.url === "/summary"),
      undefined,
      "a session we cannot vouch for is not forwarded"
    );
    // The service recovers; nothing about the outage was remembered, so the very
    // next request succeeds instead of waiting out a TTL.
    revocationDown = false;
    const back = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(back.status, 200, "an outage is not sticky");
  });

  it("a confirmed session rides out a short outage, and the bound is what ends the grace period", async () => {
    stubHits = [];
    revocationChecks = [];
    const t = await signWithJti("u-degraded", "degraded-live-1");
    // Confirmed clear while the check is answerable — that confirmation is the only
    // thing the fallback is ever allowed to act on.
    const live = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(live.status, 200);

    revocationDown = true;
    const through = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(through.status, 200, "the auth service is away, but this credential was confirmed moments ago");
    assert.ok(
      stubHits.some((h) => h.url === "/summary"),
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
    const after = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(after.status, 503, "the grace period is over, and the edge says so");
    assert.equal((await after.json()).error.code, "revocation_unavailable");

    // Recovery is immediate: nothing about the outage was remembered, because every
    // request asks the service again the moment it can.
    revocationDown = false;
    const back = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(back.status, 200, "a recovered service is used at once");
  });

  it("a monitor sees the outage and the degradation without reading a log", async () => {
    const t = await signWithJti("u-monitor", "monitor-live-1");
    // Something for the counters to count, and a confirmation for the fallback.
    const live = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
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
    const during = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
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
    const back = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
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
    const live = await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(live.status, 200);

    const healthy = await run(GW);
    assert.equal(healthy.status, 0, `expected healthy, got:\n${healthy.stdout}${healthy.stderr}`);
    assert.match(healthy.stdout, /reports ready/);
    assert.match(healthy.stdout, /revocation check reachable/, "the summary says what it checked");
    assert.equal((await run(GW, "--quiet")).stdout, "", "--quiet exists because cron mails stdout");

    // The auth service stops answering: requests still succeed on the bounded
    // fallback, which is exactly the state a monitor has to be able to see.
    revocationDown = true;
    await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
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
    await fetch(`${GW}/api/progress/summary`, { headers: { Authorization: `Bearer ${t}` } });
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
    const res = await fetch(`${GW}/api/progress/summary`, {
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
  it("serves the IDE roadmap publicly: every phase by name and tier, no content", async () => {
    const r = await app.inject({ method: "GET", url: "/ide/manifest" });
    assert.equal(r.statusCode, 200, "the roadmap needs no account");
    const m = r.json().manifest;
    assert.equal(m.phases.length, 12, "the whole road is visible, not just the free loop");
    const free = m.phases.filter((p) => p.tier === "free");
    assert.equal(free.length, 1, "exactly one free phase");
    assert.equal(free[0].id, "setup", "the free loop is the first phase");
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
    assert.equal(b.phases, 12);
    assert.equal(b.freePhases, 1);
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
        if (row && !row.consumed_at) row.consumed_at = new Date("2026-01-01T00:00:00Z");
        return { rows: [], rowCount: 1 };
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
   machine. Fixtures stand in for the canonical suites the fixture sync has not
   landed yet; the registry lookup — and every refusal around it — is what is
   under test, so an empty registry must refuse rather than judge. */
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
      attestFixtures: new Map([["test/add.test.mjs", SUITE]]),
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
        ["shipped/manifest.json", ideMf.IDE_MANIFEST],
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
      { rel: join("shipped", "manifest.json"), out: "ide-manifest.ts", symbol: "IDE_MANIFEST" },
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
  return {
    users,
    tokens,
    revoked,
    cutoffs,
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
        for (const row of tokens.values()) {
          if (row.id === params[1]) {
            row.revoked_at = new Date();
            row.replaced_by = params[0];
          }
        }
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

    // A progress stub: something for an authenticated request to be forwarded to.
    // The gateway strips the /api/<service> prefix, so it answers /summary.
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
        PROGRESS_URL: `http://127.0.0.1:${STUB_PORT}`,
        EXECUTION_URL: `http://127.0.0.1:${STUB_PORT}`,
        TUTOR_URL: `http://127.0.0.1:${STUB_PORT}`,
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

    const before = await call("GET", "/api/progress/summary", { token: accessToken });
    assert.equal(before.status, 200, "the token works while the session is live");
    assert.equal(before.body.user, reg.body.user.id, "and it resolves to the right learner");

    // Sign out the way the app's broker does: both credentials in one call.
    const out = await call("POST", "/api/auth/logout", { body: { refreshToken, accessToken } });
    assert.equal(out.status, 200);

    const after = await call("GET", "/api/progress/summary", { token: accessToken });
    assert.equal(after.status, 401, "the token the learner just signed out with is refused at once");
    assert.equal(after.body.error.code, "token_revoked");

    // The family is dead too, so no replacement can be minted for that session.
    const refreshed = await call("POST", "/api/auth/refresh", { body: { refreshToken } });
    assert.equal(refreshed.status, 401);

    // And the learner's next sign-in is unaffected: revocation names one
    // credential, not the account.
    const login = await call("POST", "/api/auth/login", { body: { email, password } });
    assert.equal(login.status, 200);
    const fresh = await call("GET", "/api/progress/summary", {
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
      assert.equal((await call("GET", "/api/progress/summary", { token: t })).status, 200);
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
      const res = await call("GET", "/api/progress/summary", { token: t });
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
    const resumed = await call("GET", "/api/progress/summary", { token: back.body.tokens.accessToken });
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
