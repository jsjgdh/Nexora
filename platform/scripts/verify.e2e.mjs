#!/usr/bin/env node
/* Platform verification, part 2: full-stack e2e on real containers.
   Run: npm run verify:e2e
   Builds all images, boots compose, runs a complete learner journey through
   the gateway (auth, curriculum, diagnostic, recommendations, progress,
   submission history, completion, summary, tutor, execution, billing
   webhooks, isolation, throttling), then tears everything down.

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
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
/* The diagnostic's authored answer key, read from the very module the progress
   service grades with. The suite therefore drives the real placement rules
   without ever asking the API for an answer, and without a fixture that rots
   the moment an item's answer is edited — the same trusted-source trick as the
   billing webhook signature above, and no relaxation of the rule that the
   wire never carries an answer key. */
const { DIAGNOSTIC_ITEMS: DIAGNOSTIC_KEY } = await import(
  "../services/progress/dist/vendor/diagnostic.js"
);
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

  it("curriculum: versioned catalog, no answer keys over the wire", async () => {
    const v = await api("/api/curriculum/version", { token: A.tokens.accessToken });
    assert.equal(v.json.missions, 46);
    assert.equal(v.json.stages, 15);
    const stages = await api("/api/curriculum/stages");
    assert.equal(stages.json.stages.length, 15);
    // The total above is pinned here and in the host suite, because it is what
    // the learner is shown. This is the half that cannot go stale: the counter
    // must agree with the catalog it summarises, so a mission that ships
    // without being listed by a stage fails right here instead of drifting
    // quietly away from the number in the version response.
    assert.equal(
      stages.json.stages.reduce((n, s) => n + s.missionIds.length, 0),
      v.json.missions
    );
    const css = await api("/api/curriculum/missions?stage=css");
    assert.equal(css.json.missions.length, 8);
    const diag = await api("/api/curriculum/diagnostic/items");
    assert.equal(diag.json.items.length, 9);
    for (const item of diag.json.items) assert.equal("answer" in item, false);
    const one = await api("/api/curriculum/missions/js-counter");
    assert.ok(one.json.mission.checks.length >= 3);
  });

  it("diagnostic recomputes placement server-side; recommendations follow", async () => {
    const items = (await api("/api/curriculum/diagnostic/items")).json.items;
    const answers = new Map(DIAGNOSTIC_KEY.map((d) => [d.id, d.answer]));
    assert.equal(items.length, DIAGNOSTIC_KEY.length);
    for (const item of items) assert.ok(answers.has(item.id), `unkeyed item ${item.id}`);

    // The selections below are the only thing the service trusts: it recomputes
    // correctness itself, so a client claiming `correct: true` proves nothing.
    const submit = (selectedFor) => {
      const results = items.map((d) => {
        const selected = selectedFor(d.id);
        return { itemId: d.id, selected, correct: false, skipped: selected === -1 };
      });
      return api("/api/progress/diagnostic", {
        method: "POST",
        token: A.tokens.accessToken,
        body: { results },
      });
    };

    // Nobody home: every item skipped. Nothing has been demonstrated, so
    // placement lands before syntax rather than inside a track nobody chose.
    const beginner = await submit(() => -1);
    assert.equal(beginner.status, 200);
    assert.equal(beginner.json.startMissionId, "how-programs-run");

    // A roadmap needs a goal: `recommend()` answers "tell us your goal" until
    // the profile is filled in, which is why the assertion below needs it.
    const profile = await api("/api/progress/profile", {
      method: "PUT",
      token: A.tokens.accessToken,
      body: { goal: "build for the web", experience: "some", hoursPerWeek: "5" },
    });
    assert.equal(profile.status, 200);

    // Every item answered as the authored key says. This asserts the placement
    // rule — demonstrated web competence outranks an unfinished language layer
    // — instead of yesterday's option indexes, so an edited answer key cannot
    // leave the suite asserting a placement the curriculum no longer implies.
    const ace = await submit((id) => answers.get(id));
    assert.equal(ace.status, 200);
    assert.equal(ace.json.startMissionId, "links-and-navigation");

    const rec = await api("/api/progress/recommendations", { token: A.tokens.accessToken });
    assert.equal(rec.status, 200);
    assert.equal(rec.json.primaryId, "links-and-navigation");
  });

  it("mission draft round-trips; completion is server-computed and idempotent", async () => {
    // A draft that genuinely satisfies this mission's declarative rules: the
    // completion route re-derives them from exactly this code (a claimed pass
    // list no longer completes a web mission on its own).
    const code = [
      "<nav>",
      '  <a href="index.html">Home</a>',
      '  <a href="projects.html">Projects</a>',
      '  <a href="https://developer.mozilla.org/">MDN reference</a>',
      "</nav>",
      "",
    ].join("\n");
    const draft = {
      code,
      checksPassed: ["nav-links", "relative-link", "absolute-link", "no-placeholders"],
      attempts: 1,
      hintsUsed: 0,
      maxHintLevel: 0,
      questionsAnswered: { l1: 0 },
      questionsCorrect: { l1: true },
    };
    const put = await api("/api/progress/missions/links-and-navigation", {
      method: "PUT",
      token: A.tokens.accessToken,
      body: draft,
    });
    assert.equal(put.status, 200);
    assert.equal(put.json.progress.code, code);
    const get = await api("/api/progress/missions/links-and-navigation", { token: A.tokens.accessToken });
    assert.equal(get.json.progress.attempts, 1);
    const done = await api("/api/progress/missions/links-and-navigation/complete", {
      method: "POST",
      token: A.tokens.accessToken,
    });
    assert.equal(done.status, 200);
    assert.equal(done.json.mastered, true);
    assert.equal(done.json.xpGained, 150);
    const again = await api("/api/progress/missions/links-and-navigation/complete", {
      method: "POST",
      token: A.tokens.accessToken,
    });
    assert.equal(again.status, 409);
    const open = await api("/api/progress/missions/personal-website/complete", {
      method: "POST",
      token: A.tokens.accessToken,
    });
    assert.equal(open.status, 422);
  });

  it("summary reflects server-side evidence", async () => {
    const s = await api("/api/progress/summary", { token: A.tokens.accessToken });
    assert.equal(s.json.xp, 150);
    assert.equal(s.json.completed, 1);
    assert.equal(s.json.mastered, 1);
    const skill = s.json.skills.find((x) => x.id === "html-links-nav");
    assert.equal(skill?.level, "independent");
  });

  it("tutor answers from authored hints when unconfigured", async () => {
    const r = await api("/api/tutor/ask", {
      method: "POST",
      token: A.tokens.accessToken,
      body: { missionId: "first-page", failingChecks: ["missing h1"], hintLevel: 2 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.source, "curriculum");
    assert.match(r.json.text, /Concept/);
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

  it("submission history: the run is on record, and re-offering it changes nothing", async () => {
    // A real Go run through the runner. Its response carries the platform's own
    // signed record of the run, which is what makes a history entry worth
    // keeping — the client forwards it, it cannot author one.
    const run = await api("/api/execute/execute", {
      method: "POST",
      token: A.tokens.accessToken,
      body: {
        language: "go",
        files: [
          {
            path: "main.go",
            content:
              'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("recorded")\n}\n',
          },
        ],
        limits: { timeoutMs: 30000 },
      },
    });
    assert.equal(run.status, 200, JSON.stringify(run.json));
    assert.ok(run.json.receipt, "a signed run must come back with its receipt");

    const body = { runs: [{ checkId: "run-answer", receipt: run.json.receipt }] };
    const first = await api("/api/progress/missions/go-first-program/runs", {
      method: "POST",
      token: A.tokens.accessToken,
      body,
    });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json.stored, 1);
    assert.equal(first.json.duplicates, 0);

    // The same execution offered again is the same record: the unique index on
    // the runner's signature is what makes a retry harmless.
    const again = await api("/api/progress/missions/go-first-program/runs", {
      method: "POST",
      token: A.tokens.accessToken,
      body,
    });
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(again.json.stored, 0);
    assert.equal(again.json.duplicates, 1);
    assert.equal(again.json.total, 1);

    const history = await api("/api/progress/missions/go-first-program/runs", {
      token: A.tokens.accessToken,
    });
    assert.equal(history.status, 200, JSON.stringify(history.json));
    assert.equal(history.json.total, 1);
    const entry = history.json.runs[0];
    assert.equal(entry.stdout.trim(), "recorded");
    assert.equal(entry.exitCode, 0);
    assert.equal(entry.language, "go");
    assert.equal(entry.entryPath, "main.go");
    assert.deepEqual(entry.checkIds, ["run-answer"]);
    assert.ok(entry.issuedAt && entry.recordedAt, "when it ran, and when it was kept");
    // A receipt is a capability: the record describes the run and never hands
    // back something that could be spent elsewhere.
    assert.equal("sig" in entry, false);

    // A record is not a verdict: having the run on file completes nothing.
    const complete = await api("/api/progress/missions/go-first-program/complete", {
      method: "POST",
      token: A.tokens.accessToken,
      body: { runs: [] },
    });
    assert.equal(complete.status, 422, "history is not evidence");
    assert.equal(complete.json.error.code, "run_unverified");
  });

  it("users cannot touch each other's progress", async () => {
    const email = `e2e-b-${Date.now()}@test.dev`;
    const reg = await api("/api/auth/register", {
      method: "POST",
      body: { email, password: "0123456789abcdef" },
    });
    const bt = reg.json.tokens.accessToken;
    const read = await api("/api/progress/missions/links-and-navigation", { token: bt });
    assert.equal(read.status, 404);
    const complete = await api("/api/progress/missions/links-and-navigation/complete", {
      method: "POST",
      token: bt,
    });
    assert.equal(complete.status, 422);
    // Nor another learner's run history: the first account has runs on record
    // for this mission, and none of them belong to this one.
    const runs = await api("/api/progress/missions/go-first-program/runs", { token: bt });
    assert.equal(runs.status, 200);
    assert.equal(runs.json.total, 0);
    assert.equal(runs.json.runs.length, 0);
  });

  it("auth boundaries hold; login throttle trips", async () => {
    const anon = await api("/api/progress/summary");
    assert.equal(anon.status, 401);
    const pub = await api("/api/curriculum/stages");
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
