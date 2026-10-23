#!/usr/bin/env node
/* The synthetic journey check: sign in, fetch a mission, run a program — the
   three moves a learner makes, made by a script, whose *exit status* carries
   the answer.

   Run:
     SYNTHETIC_EMAIL=canary@example.com SYNTHETIC_PASSWORD=... npm run synthetic
     npm run synthetic -- http://gateway:8080
     node scripts/synthetic.mjs --provision      # create the canary account once
     node scripts/synthetic.mjs --json           # for a monitor that parses stdout

   Why this exists. `/health/deep` (healthcheck.mjs) proves the edge and its
   mesh answer; it proves nothing a learner touches. This walks the real
   journey through the real gateway — sign-in, identity, the curriculum
   manifest, one phase body, one executed program — so a deployment that boots
   green but cannot serve a lesson is caught by the same cron that would
   otherwise call it healthy (TODO 5.2).

   Cadence, and why it is on the hour and never on the minute. Every run is
   charged to this account like any learner's: EXECUTION_DAILY_QUOTA defaults
   to 200 executions a day, so hourly (24 runs) leaves the allowance alone,
   while per-minute (1,440) would trip the quota by morning and page for a
   problem the check itself caused. The account needs no subscription: the
   phase step accepts the paywall's own answer (402 entitlement_required) as
   proof that identity, billing and the gate each responded — and a 200, when
   an entitled account is configured, proves the content path end to end.

   Exit status, and why three values rather than "not zero":
     0  the whole journey answered: sign-in issued a token, identity resolved
        under it, the manifest listed phases, a phase body was served or the
        paywall refused it correctly, and a submitted program ran with exit 0
        and the output it was asked for
     1  the platform answered, and its answer is the problem: a refused
        sign-in, a 5xx anywhere, identity rejecting the token sign-in just
        issued, entitlement unconfirmable (503), the quota refusing this
        account, or a run that did not produce its output
     2  this check could not do its job: no reply, a reply that is not the
        protocol this journey speaks (a sign-in with no tokens), or no
        credentials configured — "the platform says no" and "I cannot ask the
        platform" wake different people, and a monitor that cannot tell them
        apart is a monitor that gets muted. */
/* `process.*` rather than named imports from `node:process`: every write here
   is a property call and the exit status is an assignment, and an imported
   binding is immutable, so `import { exitCode }` would throw on the first
   line that sets it. */
const DEFAULT_URL = (process.env.SYNTHETIC_URL ?? `http://127.0.0.1:${process.env.GATEWAY_PORT ?? "8080"}`).replace(
  /\/+$/,
  ""
);

/* The marker a run must print back. A run that exits 0 but prints something
   else is a runner that executed *something* — not proof this submission
   reached the platform, which is the whole point of the step. */
const RUN_MARKER = "nexora-synthetic-ok";
const RUN_SOURCE = `console.log("${RUN_MARKER}");\n`;

const USAGE = `usage: synthetic [url] [--url=<url>] [--email=<addr>] [--password=<pw>]
                  [--phase=<id>] [--provision] [--timeout=<ms>] [--json]
                  [--quiet] [--help]

  url             where to ask (default $SYNTHETIC_URL, then
                  http://127.0.0.1:<GATEWAY_PORT or 8080>)
  --url=<url>     same, as a flag (wins over a positional url)
  --email=<addr>  the canary account (default $SYNTHETIC_EMAIL)
  --password=<pw> its password (default $SYNTHETIC_PASSWORD; prefer the
                  environment — a flag is visible in the process list)
  --phase=<id>    the phase to fetch (default: the first the manifest lists)
  --provision     create the account first if it does not exist yet
                  (201 created, or 409 already there, then the journey runs)
  --timeout=<ms>  how long to wait for each answer (default 15000; raise it
                  once if the runner's image is cold and the first run pulls)
  --json          print a machine-readable summary instead of prose
  --quiet, -q     print nothing when the whole journey passes (for cron)
  --help, -h      this text

  exit: 0 the journey answered · 1 the platform said something is wrong
        · 2 the check could not do its job

  cron, on the hour — never on the minute; see the quota note above:
    0 * * * * SYNTHETIC_EMAIL=canary@example.com SYNTHETIC_PASSWORD=... \\
              /usr/bin/node /srv/nexora/platform/scripts/synthetic.mjs --quiet`;

/**
 * Flags are hand-rolled rather than pulled from a dependency: this runs in a
 * crontab and during a deploy, and the whole surface is seven options.
 */
function parseArgs(args) {
  const parsed = {
    url: null,
    email: null,
    password: null,
    phase: null,
    provision: false,
    timeoutMs: 15_000,
    json: false,
    quiet: false,
    help: false,
    error: null,
  };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--quiet" || arg === "-q") parsed.quiet = true;
    else if (arg === "--provision") parsed.provision = true;
    else if (arg.startsWith("--url=")) parsed.url = arg.slice("--url=".length);
    else if (arg.startsWith("--email=")) parsed.email = arg.slice("--email=".length);
    else if (arg.startsWith("--password=")) parsed.password = arg.slice("--password=".length);
    else if (arg.startsWith("--phase=")) parsed.phase = arg.slice("--phase=".length);
    else if (arg.startsWith("--timeout=")) {
      const ms = Number(arg.slice("--timeout=".length));
      if (!Number.isFinite(ms) || ms <= 0) {
        parsed.error = `invalid --timeout: expected milliseconds, got "${arg.slice("--timeout=".length)}"`;
      } else parsed.timeoutMs = ms;
    } else if (arg.startsWith("-")) parsed.error = `unknown flag "${arg}"`;
    else if (parsed.url === null) parsed.url = arg;
    else parsed.error = `unexpected argument "${arg}"`;
  }
  return parsed;
}

/** One HTTP round trip, with the failure modes the steps reason about
    separated out: a network failure is not an answer, and a reply that is
    not JSON is not a protocol. Ours rather than AbortSignal.timeout, so the
    timer is cleared before we exit — a crontab entry that lingers for its
    whole timeout after a fast answer is a crontab entry that piles up. */
async function ask(url, { method = "GET", token, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* reported by callers as a shape failure, with the status it arrived at */
    }
    return { url, status: res.status, headers: res.headers, text, json };
  } catch (err) {
    return {
      url,
      network: controller.signal.aborted
        ? `no reply within ${timeoutMs}ms (is the gateway up, and is this the right URL? a cold runner image can exceed a short timeout — raise --timeout once)`
        : `request failed: ${err?.message ?? String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The platform's own words for a refusal, envelope first. */
function said(json) {
  if (json && typeof json === "object" && json.error) {
    const e = json.error;
    const code = typeof e.code === "string" ? e.code : "?";
    const message = typeof e.message === "string" ? `: ${e.message}` : "";
    return code + message;
  }
  return "no error envelope";
}

/**
 * Walk the journey, stopping at the first step that fails — every later step
 * depends on what the previous one produced (a token, a phase id), so their
 * silence would be misleading, not neutral.
 *
 * Returns { code, url, steps, reasons } where each accepted step contributes
 * one line to the prose run and one record to the JSON one.
 */
async function journey({ url, email, password, phase, provision, timeoutMs }) {
  const steps = [];
  const fail = (step, code, reason) => ({ code, url, steps, reasons: [reason], failedAt: step });
  const accept = (step, status, detail) => steps.push({ step, ok: true, status, detail });

  if (provision) {
    const r = await ask(`${url}/api/auth/register`, {
      method: "POST",
      timeoutMs,
      body: {
        email,
        password,
        name: "Synthetic canary",
        // Production refuses an account without these three (assertDeclarationsAllowed),
        // and a monitoring account is the operator's own — it may affirm.
        acceptTerms: true,
        acceptPrivacy: true,
        ageAffirmed: true,
      },
    });
    if (r.network) return fail("provision", 2, `register: ${r.network}`);
    if (r.status === 201 || r.status === 409) {
      accept("provision", r.status, r.status === 201 ? "account created" : "account already exists");
    } else if (r.status >= 500) {
      return fail("provision", 1, `register answered HTTP ${r.status} (${said(r.json)})`);
    } else {
      return fail(
        "provision",
        1,
        `register refused (${r.status} ${said(r.json)}) — the account cannot be created from here`
      );
    }
  }

  const login = await ask(`${url}/api/auth/login`, { method: "POST", timeoutMs, body: { email, password } });
  if (login.network) return fail("sign-in", 2, `sign-in: ${login.network}`);
  if (login.status !== 200) {
    if (login.status === 401) {
      return fail(
        "sign-in",
        1,
        `sign-in refused (${said(login.json)}) — no account at this address, or the wrong password; ` +
          `provision the canary once with --provision`
      );
    }
    if (login.status === 429) return fail("sign-in", 1, `sign-in rate limited (${said(login.json)})`);
    return fail("sign-in", 1, `sign-in answered HTTP ${login.status} (${said(login.json)})`);
  }
  const token = login.json?.tokens?.accessToken;
  if (typeof token !== "string" || !login.json?.user) {
    return fail(
      "sign-in",
      2,
      "HTTP 200 is not a sign-in answer (no user / tokens.accessToken) — the reply is not the protocol this journey speaks"
    );
  }
  accept("sign-in", 200, `token issued for ${login.json.user.id ?? "the account"}`);

  const me = await ask(`${url}/api/auth/me`, { token, timeoutMs });
  if (me.network) return fail("identity", 2, `identity: ${me.network}`);
  if (me.status === 200 && me.json?.user) {
    accept("identity", 200, `resolves to ${me.json.user.id ?? "the account"}`);
  } else if (me.status === 200) {
    return fail(
      "identity",
      2,
      "HTTP 200 is not an identity answer (no user) — the reply is not the protocol this journey speaks"
    );
  } else if (me.status === 401) {
    return fail(
      "identity",
      1,
      `the token sign-in just issued was refused (${said(me.json)}) — the edge and the auth service disagree about this session`
    );
  } else if (me.status === 404) {
    return fail("identity", 1, `identity resolved to an account that no longer exists (${said(me.json)})`);
  } else if (me.json === null) {
    return fail("identity", 2, `HTTP ${me.status} but the reply is not JSON — not the protocol this journey speaks`);
  } else {
    return fail("identity", 1, `identity answered HTTP ${me.status} (${said(me.json)})`);
  }

  const manifest = await ask(`${url}/api/curriculum/ide/manifest`, { timeoutMs });
  if (manifest.network) return fail("manifest", 2, `manifest: ${manifest.network}`);
  const phases = manifest.json?.manifest?.phases;
  if (manifest.status !== 200) {
    return fail("manifest", 1, `manifest answered HTTP ${manifest.status} (${said(manifest.json)})`);
  }
  if (!Array.isArray(phases) || phases.length === 0) {
    return fail(
      "manifest",
      2,
      "HTTP 200 but the manifest lists no phases — the reply is not the protocol this journey speaks"
    );
  }
  const chosen = phase ?? phases[0]?.id;
  if (typeof chosen !== "string" || chosen.length === 0) {
    return fail("manifest", 2, "the manifest's first phase carries no id — the reply is missing what the next step needs");
  }
  accept("manifest", 200, `${manifest.json.manifest.id ?? "default course"}: ${phases.length} phases → ${chosen}`);

  const body = await ask(`${url}/api/curriculum/ide/phases/${encodeURIComponent(chosen)}`, { token, timeoutMs });
  if (body.network) return fail("phase", 2, `phase: ${body.network}`);
  if (body.status === 200 && body.json && typeof body.json === "object") {
    accept("phase", 200, "body served");
  } else if (body.status === 402 && body.json?.error?.code === "entitlement_required") {
    // Not a fault: billing answered "not subscribed", which means identity,
    // the gate and billing each responded. An entitled canary gets a 200 and
    // exercises the content path too; either way the status is recorded.
    accept("phase", 402, "paywall refused (402 entitlement_required) — the entitlement layers answered");
  } else if (body.status === 401) {
    return fail("phase", 1, `identity rejected on the paid path (${said(body.json)})`);
  } else if (body.status === 404) {
    return fail(
      "phase",
      1,
      `phase "${chosen}" is listed by the manifest but not served (404) — curriculum and its manifest disagree`
    );
  } else if (body.status === 503) {
    return fail("phase", 1, `entitlement cannot be confirmed (${said(body.json)}) — billing or auth is away`);
  } else if (body.status === 200) {
    return fail("phase", 2, "HTTP 200 but the phase body is not JSON — not the protocol this journey speaks");
  } else {
    return fail("phase", 1, `phase answered HTTP ${body.status} (${said(body.json)})`);
  }

  /* Hosted runs are a posture, not a promise. A deployment that hosts no
     learner code answers 503 to /execute by design (EXECUTION_HOSTED_RUNS),
     and that is the product working, not the product broken — so ask the
     service what it is before submitting anything. A deployment that does
     host runs still gets the whole journey, including the run; a local-only
     one records the skip and its reason, and the steps before it still have
     to pass. Anything else would page an operator for a decision. */
  const caps = await ask(`${url}/api/execute/capabilities`, { token, timeoutMs });
  if (caps.network) return fail("capabilities", 2, `capabilities: ${caps.network}`);
  if (caps.status !== 200) {
    return fail("capabilities", 1, `capabilities answered HTTP ${caps.status} (${said(caps.json)})`);
  }
  if (caps.json?.hostedRuns === false) {
    accept(
      "run",
      200,
      "skipped — this deployment hosts no learner code; the course runs in the IDE, on the learner's machine"
    );
    return { code: 0, url, steps, reasons: [] };
  }

  const run = await ask(`${url}/api/execute/execute`, {
    method: "POST",
    token,
    timeoutMs,
    body: { language: "node", files: [{ path: "main.js", content: RUN_SOURCE }] },
  });
  if (run.network) return fail("run", 2, `run: ${run.network}`);
  const remaining = run.headers?.get?.("x-execution-daily-remaining");
  const quotaNote = remaining !== null && remaining !== undefined && remaining !== "" ? `, ${remaining} runs left today` : "";
  if (run.status === 429) {
    return fail(
      "run",
      1,
      `daily execution quota reached for this account (${said(run.json)}) — the cadence is too high or EXECUTION_DAILY_QUOTA too low`
    );
  }
  if (run.status === 503) return fail("run", 1, `runner unavailable (${said(run.json)})`);
  if (run.status === 401 || run.status === 403) return fail("run", 1, `execute refused the session (${said(run.json)})`);
  if (run.status !== 200) return fail("run", 1, `execute answered HTTP ${run.status} (${said(run.json)})`);
  if (typeof run.json?.stdout !== "string" || !("exitCode" in run.json)) {
    return fail("run", 2, "HTTP 200 is not an execution answer (no stdout / exitCode) — not the protocol this journey speaks");
  }
  if (run.json.exitCode !== 0) {
    const detail = String(run.json.stderr ?? run.json.stdout ?? "").trim().split("\n")[0].slice(0, 120);
    return fail("run", 1, `the program ran and failed: exit ${run.json.exitCode}${detail ? ` — ${detail}` : ""}`);
  }
  if (!run.json.stdout.includes(RUN_MARKER)) {
    return fail(
      "run",
      1,
      `the program exited 0 but stdout did not contain ${RUN_MARKER} — the runner executed something, not this submission`
    );
  }
  accept("run", 200, `exit 0 in ${run.json.durationMs}ms via ${run.json.runner ?? "the runner"}${quotaNote}`);

  return { code: 0, url, steps, reasons: [] };
}

function render(result, { json, quiet }) {
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: result.code === 0, code: result.code, url: result.url, steps: result.steps, reasons: result.reasons })}\n`
    );
    return;
  }
  if (result.code === 0) {
    if (!quiet) {
      const named = result.steps.map((s) => (s.detail ? `${s.step} (${s.detail})` : s.step));
      process.stdout.write(`journey ok: ${named.join(", ")}\n`);
    }
    return;
  }
  process.stderr.write(`FAIL ${result.url}${result.failedAt ? ` at ${result.failedAt}` : ""}\n`);
  for (const reason of result.reasons) process.stderr.write(`  - ${reason}\n`);
  if (result.code === 2) {
    process.stderr.write("  (exit 2: the check could not do its job — no journey answer to judge)\n");
  }
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
  process.exitCode = 2;
} else if (parsed.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exitCode = 0;
} else {
  const email = parsed.email ?? process.env.SYNTHETIC_EMAIL ?? null;
  const password = parsed.password ?? process.env.SYNTHETIC_PASSWORD ?? null;
  const url = (parsed.url ?? DEFAULT_URL).replace(/\/+$/, "");
  if (!email || !password) {
    render(
      {
        code: 2,
        url,
        steps: [],
        reasons: [
          "no credentials: set SYNTHETIC_EMAIL and SYNTHETIC_PASSWORD (or --email/--password), " +
            "and provision the account once with --provision",
        ],
      },
      parsed
    );
    process.exitCode = 2;
  } else {
    const result = await journey({
      url,
      email,
      password,
      phase: parsed.phase ?? process.env.SYNTHETIC_PHASE ?? null,
      provision: parsed.provision,
      timeoutMs: parsed.timeoutMs,
    });
    render(result, parsed);
    // Set, never `process.exit()`: letting the loop drain flushes stdout, which
    // process.exit() is documented to be able to cut short when it is a pipe.
    process.exitCode = result.code;
  }
}
