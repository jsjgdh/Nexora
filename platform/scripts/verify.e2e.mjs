#!/usr/bin/env node
/* Platform verification, part 2: full-stack e2e on real containers.
   Run: npm run verify:e2e
   Builds all images, boots compose, runs a complete IDE-shaped journey
   through the gateway (auth, IDE roadmap, paid phases behind entitlement,
   execution, receipts, attestation availability, billing webhooks,
   isolation, throttling), then tears everything down.

   Requires a Docker daemon, and host ports 8080/3000 free — it publishes the
   same two the dev stack does, so stop `docker compose up` locally first.

   It runs under its own compose project (`nexora-e2e`), which is not a
   detail: this suite stages a fresh random POSTGRES_PASSWORD and tears down
   with `down -v`. Under the default project that means reusing the volume a
   developer's own Postgres was initialised in — where the *old* password is
   baked in, so every database-backed service dies with `auth_failed` and the
   boot fails for a reason that has nothing to do with the code under test —
   and then deleting that developer's database on the way out. Its own
   project, and a `down -v` before it starts, keeps the run self-contained:
   the fresh password always matches the volume Postgres initialises. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GW = "http://localhost:8080";

/**
 * This suite's own compose project. Its containers, network and volumes are
 * namespaced, so the run can neither collide with a stack the developer is
 * using nor tear it down (see the header).
 */
const PROJECT = "nexora-e2e";

/** One place that knows how this suite talks to compose. */
function compose(args, timeout = 1_200_000) {
  return execSync(`docker compose -p ${PROJECT} -f docker-compose.yml ${args}`, {
    cwd: root,
    stdio: "pipe",
    timeout,
  });
}
const { signingKey } = await import("../services/billing/dist/dodo.js");
const SECRETS = {
  AUTH_JWT_SECRET: randomBytes(32).toString("hex"),
  INTERNAL_API_KEY: randomBytes(32).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(16).toString("hex"),
  // Vendor-shaped: base64 after the prefix, so the HMAC key is the decoded
  // bytes — the same derivation production webhooks must satisfy.
  DODO_WHSEC: "whsec_" + randomBytes(24).toString("base64"),
};

async function api(path, { method = "GET", token, body } = {}) {
  // Only claim a JSON body when one is actually sent: header and payload must
  // agree, and a request that declares JSON and then sends nothing is a
  // malformed request the edge is right to answer with 400.
  const headers = body === undefined ? {} : { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(GW + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

describe("compose stack", () => {
  let envFile;
  let envBackup = "ABSENT";
  const repoEnv = join(root, ".env");
  before(async () => {
    // Services read container env from the project .env (compose auto-loads
    // it); --env-file values only feed interpolation, NOT containers. Stage
    // a test .env and restore whatever was there afterwards.
    try {
      envBackup = readFileSync(repoEnv, "utf8");
    } catch {
      envBackup = "ABSENT";
    }
    const dir = mkdtempSync(join(tmpdir(), "nexora-e2e-"));
    envFile = join(dir, ".env");
    const example = readFileSync(join(root, ".env.example"), "utf8")
      .replace(/change-me[^"\n]*/g, "test-secret-0123456789abcdef0123456789")
      // The database password lives in TWO places: POSTGRES_PASSWORD (server
      // init) and inside every DATABASE_URL (clients). Both must match.
      .replace("POSTGRES_PASSWORD=nexora", `POSTGRES_PASSWORD=${SECRETS.POSTGRES_PASSWORD}`)
      .replaceAll("://nexora:nexora@", `://nexora:${SECRETS.POSTGRES_PASSWORD}@`);
    writeFileSync(envFile, example);
    writeFileSync(
      repoEnv,
      example +
        `\nDODO_PAYMENTS_WEBHOOK_SECRET=${SECRETS.DODO_WHSEC}\n` +
        `BILLING_PLANS_JSON='{"pro":{"product_id":"pdt_e2e","name":"NEXORA Pro"}}'\n`
    );
    // Any volume left from a previous run of THIS project holds a Postgres
    // superuser password from a previous run's random secret. Postgres bakes
    // that password in at first init and ignores later ones, so a run that
    // reused it would fail to authenticate every database-backed service —
    // the boot error would look like the code's fault. Start from nothing.
    try {
      compose("down -v --remove-orphans", 300_000);
    } catch {
      /* nothing to remove, or a daemon hiccup the boot will report properly */
    }
    process.env.NEXORA_E2E_ENV = envFile;
  });

  it("boots healthy (gateway deep check across the mesh)", async () => {
    compose("up -d --build");
    const deadline = Date.now() + 240000;
    let last = null;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${GW}/health/deep`, { signal: AbortSignal.timeout(5000) });
        last = await r.json();
        if (last.status === "ready") break;
      } catch {}
      await new Promise((r) => setTimeout(r, 5000));
    }
    assert.equal(last?.status, "ready", `mesh not ready: ${JSON.stringify(last)}`);
    for (const c of last.checks) assert.equal(c.ok, true, `${c.service} unhealthy`);
  });

  let A = null;

  it("auth: register, conflict, login, me", async () => {
    const email = `e2e-a-${Date.now()}@test.dev`;
    const reg = await api("/api/auth/register", {
      method: "POST",
      body: { email, password: "0123456789abcdef", name: "E2E Ada" },
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.json.user.id);
    assert.ok(reg.json.tokens.accessToken);
    const dup = await api("/api/auth/register", {
      method: "POST",
      body: { email, password: "0123456789abcdef" },
    });
    assert.equal(dup.status, 409);
    const bad = await api("/api/auth/login", { method: "POST", body: { email, password: "wrongwrongwrong" } });
    assert.equal(bad.status, 401);
    const ok = await api("/api/auth/login", { method: "POST", body: { email, password: "0123456789abcdef" } });
    assert.equal(ok.status, 200);
    A = { ...(A ?? {}), id: reg.json.user.id, email, tokens: ok.json.tokens };
    const me = await api("/api/auth/me", { token: A.tokens.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, email);
  });

  it("IDE curriculum: public roadmap, paid phases behind entitlement", async () => {
    // The roadmap is public: a signed-out learner sees the whole road and
    // what it costs to walk, never a one-item course hiding the rest.
    const manifest = await api("/api/curriculum/ide/manifest");
    assert.equal(manifest.status, 200);
    /* Not a magic number. This line used to read `=== 12`, which was true of the
       curriculum once and then quietly became a claim about a course nobody was
       shipping any more (the IDE has grown past forty phases). So compare against
       the roadmap the IDE actually authors, falling back to the snapshot this image
       was built from when nexora-ide is not checked out beside branchcraft - and
       keep the floor, because a source that reads as a stub would otherwise match
       a stub deployment perfectly. */
    const ideRoadmap = join(
      root, "..", "..", "nexora-ide", "extensions", "nexora", "curriculum", "shipped", "task-manager.manifest.json"
    );
    const source = existsSync(ideRoadmap)
      ? JSON.parse(readFileSync(ideRoadmap, "utf8"))
      : (await import("../services/curriculum/dist/data/ide-manifest.js")).IDE_MANIFEST;
    assert.ok(source.phases.length >= 40, `the roadmap source is a stub (${source.phases.length} phases)`);
    assert.equal(
      manifest.json.manifest.phases.length,
      source.phases.length,
      "the deployed roadmap is not the roadmap the IDE ships (rebuild the image, then re-sync)"
    );
    assert.deepEqual(
      manifest.json.manifest.phases.map((p) => p.id),
      source.phases.map((p) => p.id),
      "the roadmap arrives in the order the course teaches it"
    );
    assert.ok(manifest.json.manifest.phases.some((p) => p.tier === "free"));
    assert.ok(manifest.json.manifest.phases.some((p) => p.tier === "pro"));
    // Paid bodies are gated twice: no identity reads as "sign in" (401),
    // identity without subscription as "subscribe" (402).
    const anon = await api("/api/curriculum/ide/phases/ui");
    assert.equal(anon.status, 401);
    const free = await api("/api/curriculum/ide/phases/ui", { token: A.tokens.accessToken });
    assert.equal(free.status, 402);
    const version = await api("/api/curriculum/ide/version");
    assert.equal(version.status, 200);
    assert.match(version.json.ideVersion, /^[0-9a-f]{12}$/);
  });

  it("execution runs learner code in isolation", async () => {
    const r = await api("/api/execute/execute", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        language: "node",
        files: [{ path: "main.js", content: "const fib=(n)=>n<2?n:fib(n-1)+fib(n-2); console.log(fib(20));" }],
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.stdout.trim(), "6765");
    assert.equal(r.json.timedOut, false);
    const caps = await api("/api/execute/capabilities", { token: A.tokens.accessToken });
    assert.ok(caps.json.languages.includes("node"));
  });

  it("receipts verify without an account; attestation stays authed and honest", async () => {
    const run = await api("/api/execute/execute", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        language: "node",
        files: [{ path: "main.js", content: "console.log('verify me');" }],
      },
    });
    assert.equal(run.status, 200, JSON.stringify(run.json));
    assert.ok(run.json.receipt, "a signed run must come back with its receipt");

    // Public through the gateway: a stranger with the receipt holds no JWT
    // and still gets the platform's own answer.
    const stranger = await api("/api/execute/verify", {
      method: "POST",
      body: { receipt: run.json.receipt },
    });
    assert.equal(stranger.status, 200, JSON.stringify(stranger.json));
    assert.equal(stranger.json.valid, true);
    assert.equal(stranger.json.fresh, true);

    const forged = await api("/api/execute/verify", {
      method: "POST",
      body: { receipt: { ...run.json.receipt, sig: "0".repeat(64) } },
    });
    assert.equal(forged.status, 200, JSON.stringify(forged.json));
    assert.equal(forged.json.valid, false);

    // Attestation spends sandbox time, so it is never public: no token, no run.
    const anon = await api("/api/execute/attest", {
      method: "POST",
      body: {
        checkIds: ["adds"],
        checks: [{ id: "adds", tests: ["adds two numbers"] }],
        files: [{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }],
        command: "node --test --test-reporter=tap test/add.test.mjs",
        localTap: "ok 1 - adds two numbers\n",
      },
    });
    assert.equal(anon.status, 401, JSON.stringify(anon.json));

    // Authed but with no canonical suite registered: the honest 503, never a
    // verdict the platform did not compute.
    const bare = await api("/api/execute/attest", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        checkIds: ["adds"],
        checks: [{ id: "adds", tests: ["adds two numbers"] }],
        files: [{ path: "src/add.js", content: "export function add(a, b) { return a + b; }\n" }],
        command: "node --test --test-reporter=tap test/add.test.mjs",
        localTap: "ok 1 - adds two numbers\n",
      },
    });
    assert.equal(bare.status, 503, JSON.stringify(bare.json));
    assert.equal(bare.json.error.code, "attestation_unavailable");
  });

  it("execution runs real Go: stdout, structured compile errors, and panics", async () => {
    const caps = await api("/api/execute/capabilities", { token: A.tokens.accessToken });
    // The execution image installs the Go toolchain; if it is missing, the
    // language is reported unavailable and the runner says so with the fix.
    assert.ok(
      caps.json.languages.includes("go"),
      `go missing from the runner image: ${JSON.stringify(caps.json)}`
    );

    const ok = await api("/api/execute/execute", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        language: "go",
        files: [
          {
            path: "main.go",
            content:
              'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(6 * 7)\n}\n',
          },
        ],
        limits: { timeoutMs: 30000 },
      },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.exitCode, 0, ok.json.stderr);
    assert.equal(ok.json.stdout.trim(), "42");
    assert.equal(ok.json.phase, "run");

    const broken = await api("/api/execute/execute", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        language: "go",
        files: [{ path: "main.go", content: 'package main\n\nfunc main() {\n\tfmt.Println(1)\n}\n' }],
        limits: { timeoutMs: 30000 },
      },
    });
    assert.equal(broken.status, 200);
    assert.equal(broken.json.phase, "compile");
    assert.ok(broken.json.diagnostics.length >= 1, "a compiler error must be structured");
    assert.equal(broken.json.diagnostics[0].file, "main.go");
    assert.equal(typeof broken.json.diagnostics[0].line, "number");

    const panicked = await api("/api/execute/execute", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        language: "go",
        files: [
          {
            path: "main.go",
            content:
              'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar xs []int\n\tfmt.Println(xs[3])\n}\n',
          },
        ],
        limits: { timeoutMs: 30000 },
      },
    });
    assert.equal(panicked.json.phase, "run");
    assert.equal(panicked.json.diagnostics[0].kind, "runtime");
  });

  it("users cannot touch each other's entitlement", async () => {
    const email = `e2e-b-${Date.now()}@test.dev`;
    const reg = await api("/api/auth/register", {
      method: "POST",
      body: { email, password: "0123456789abcdef" },
    });
    const bt = reg.json.tokens.accessToken;
    // A stranger's account has no subscription: paid phases stay 402, and the
    // roadmap — the public half — still answers.
    const phase = await api("/api/curriculum/ide/phases/ui", { token: bt });
    assert.equal(phase.status, 402);
    const manifest = await api("/api/curriculum/ide/manifest", { token: bt });
    assert.equal(manifest.status, 200);
  });

  it("auth boundaries hold; login throttle trips", async () => {
    const anon = await api("/api/execute/capabilities");
    assert.equal(anon.status, 401);
    const pub = await api("/api/curriculum/ide/manifest");
    assert.equal(pub.status, 200);
    let last = 0;
    for (let i = 0; i < 9; i++) {
      const r = await api("/api/auth/login", {
        method: "POST",
        body: { email: "nobody@test.dev", password: "0123456789abcdef" },
      });
      last = r.status;
    }
    assert.equal(last, 429);

    // Signing out ends the token in hand, not just the session's ability to renew.
    // The refresh family and the access token's jti are both revoked in one call,
    // and the gateway — which verifies tokens by signature alone — asks about that
    // jti from the next request on, so the same bearer is refused at once instead
    // of working for the rest of its five minutes. (Registration is not throttled,
    // so the exhausted address budget above does not affect this.)
    const email = `e2e-revoke-${Date.now()}@test.dev`;
    const reg = await api("/api/auth/register", {
      method: "POST",
      body: { email, password: "0123456789abcdef" },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.json));
    const token = reg.json.tokens.accessToken;
    const before = await api("/api/execute/capabilities", { token });
    assert.equal(before.status, 200, "the token works before sign-out");
    const out = await api("/api/auth/logout", {
      method: "POST",
      body: { refreshToken: reg.json.tokens.refreshToken, accessToken: token },
    });
    assert.equal(out.status, 200);
    const after = await api("/api/execute/capabilities", { token });
    assert.equal(after.status, 401, "the signed-out access token is dead immediately, not in five minutes");
    assert.equal(after.json.error.code, "token_revoked");
    const refreshed = await api("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: reg.json.tokens.refreshToken },
    });
    assert.equal(refreshed.status, 401, "and the family cannot mint a replacement");
  });

  it("billing: plans, unconfigured checkout, signed webhook → entitlement", async () => {
    const plans = await api("/api/billing/plans", { token: A.tokens.accessToken });
    assert.deepEqual(plans.json.plans, [{ slug: "pro", name: "NEXORA Pro" }]);
    const co = await api("/api/billing/checkout", {
      method: "POST",
      token: A.tokens.accessToken,
      body: { plan: "pro", email: A.email },
    });
    assert.equal(co.status, 503);
    assert.equal(co.json.error.code, "billing_not_configured");

    const payload = {
      business_id: "biz_e2e",
      type: "subscription.active",
      timestamp: new Date().toISOString(),
      data: { id: "sub_e2e", metadata: { user_id: A.id, plan: "pro" }, current_period_end: "2027-01-01T00:00:00Z" },
    };
    const raw = JSON.stringify(payload);
    const id = `evt_${Date.now()}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig =
      "v1," +
      createHmac("sha256", signingKey(SECRETS.DODO_WHSEC))
        .update(`${id}.${ts}.${raw}`)
        .digest("base64");
    // Read the secret back from the.stack env (same value file).
    const hook = await fetch(`${GW}/api/billing/webhooks/dodo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": ts,
        "webhook-signature": sig,
      },
      body: raw,
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(hook.status, 200);
    const sub = await api("/api/billing/subscription", { token: A.tokens.accessToken });
    assert.deepEqual(sub.json.subscription, {
      plan: "pro",
      status: "active",
      entitled: true,
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
    });
    // And the subscription opens the course: the phase that read 402 before
    // the webhook now serves its body — names, bodies, and checks included.
    const phase = await api("/api/curriculum/ide/phases/ui", { token: A.tokens.accessToken });
    assert.equal(phase.status, 200, JSON.stringify(phase.json));
    assert.equal(phase.json.phase.id, "ui");
    assert.ok(Array.isArray(phase.json.phase.activities) && phase.json.phase.activities.length > 0);
  });

  it("frontend serves the client behind the gateway", async () => {
    const r = await fetch("http://localhost:3000/", { signal: AbortSignal.timeout(15000) });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /NEXORA/);
  });

  after(async () => {
    const { unlinkSync, writeFileSync: writeSync } = await import("node:fs");
    try {
      // Scoped to this suite's project: the developer's own stack and its
      // data are not this run's to remove.
      compose("down -v --remove-orphans", 300_000);
    } catch (e) {
      console.error("teardown failed:", e.message);
    }
    try {
      if (envBackup === "ABSENT") unlinkSync(repoEnv);
      else writeSync(repoEnv, envBackup);
    } catch (e) {
      console.error("env restore failed:", e.message);
    }
  });
});
