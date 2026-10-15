#!/usr/bin/env node
/* Health check for the public edge: the command a cron job, an uptime monitor or a
   deploy step runs, whose *exit status* carries the answer.

   Run:
     npm run healthcheck                          # http://127.0.0.1:8080
     npm run healthcheck -- http://gateway:8080
     node scripts/healthcheck.mjs --quiet         # for cron: silent when healthy
     node scripts/healthcheck.mjs --json          # for a monitor that parses stdout

   Why this exists. `/health/deep` is the only place the platform says whether it is
   well, and it carries the part of health that is invisible from the outside: when
   the auth service stops answering the per-request revocation check, authenticated
   requests keep *succeeding* on a bounded stale answer, so nothing a learner sees
   looks broken while a signed-out credential may still be accepted for a moment.
   Reading the endpoint by hand is not monitoring; this is the smallest thing that
   can be put in a crontab or handed to an uptime service (see TODO 5.2 — there is
   still no metrics system, so a poller like this is what there is).

   Exit status, and why three values rather than "not zero":
     0  healthy — the gateway answered and reports nothing wrong
     1  the edge answered and said something is wrong: its own `status` is not
        "ready", a mesh member's health check failed, or the auth service is not
        answering the revocation check
     2  this check could not do its job: no reply, a reply that is not a health
        report, or a report missing the revocation block (a gateway older than the
        check this command exists for). Separate from 1 on purpose — "the platform
        says it is degraded" and "I cannot ask the platform" wake different people,
        and a monitor that cannot tell them apart is a monitor that gets muted. */
/* `process.*` rather than named imports from `node:process`: every write here is a
   property call and the exit status is an assignment, and an imported binding is
   immutable, so `import { exitCode }` would throw on the first line that sets it. */
const DEFAULT_URL = (process.env.HEALTHCHECK_URL ?? `http://127.0.0.1:${process.env.GATEWAY_PORT ?? "8080"}`).replace(
  /\/+$/,
  ""
);

const USAGE = `usage: healthcheck [url] [--url=<url>] [--timeout=<ms>] [--json] [--quiet] [--help]

  url             where to ask (default $HEALTHCHECK_URL, then
                  http://127.0.0.1:<GATEWAY_PORT or 8080>)
  --url=<url>     same, as a flag (wins over a positional url)
  --timeout=<ms>  how long to wait for an answer before giving up (default 5000)
  --json          print a machine-readable summary instead of prose
  --quiet, -q     print nothing when everything is healthy (for cron)
  --help, -h      this text

  exit: 0 healthy · 1 the edge reports a problem · 2 the check could not do its job

  cron, once a minute, mailing only when something is wrong:
    * * * * * /usr/bin/node /srv/nexora/platform/scripts/healthcheck.mjs --quiet`;

/**
 * Flags are hand-rolled rather than pulled from a dependency: this runs in a
 * crontab and during a deploy, and the whole surface is four options.
 */
function parseArgs(args) {
  const parsed = { url: null, timeoutMs: 5_000, json: false, quiet: false, help: false, error: null };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--quiet" || arg === "-q") parsed.quiet = true;
    else if (arg.startsWith("--url=")) parsed.url = arg.slice("--url=".length);
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

/** The one line of context that makes a cron mail worth reading. */
function summaryOf(body) {
  if (!body) return "";
  const mesh = Array.isArray(body.checks) ? `${body.checks.filter((c) => c?.ok).length}/${body.checks.length} mesh checks ok` : "";
  const revocation = body.revocations ? `revocation check ${body.revocations.authService}` : "";
  const parts = [mesh, revocation].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** What the revocation half is actually doing, in the words of its own fields. */
function describeOutage(rev) {
  const parts = [];
  if (typeof rev.outageMs === "number") parts.push(`unreachable for ${Math.round(rev.outageMs / 1000)}s`);
  if (typeof rev.counters?.unanswered === "number") parts.push(`${rev.counters.unanswered} unanswered since start`);
  if (typeof rev.clearTtlMs === "number") parts.push(`bound ${rev.clearTtlMs}ms`);
  if (rev.degraded === true) parts.push("requests are still being allowed on a bounded stale answer");
  return parts.join(", ");
}

/**
 * Ask the gateway, and decide only from what it said.
 *
 * The body has to be a health report *with* the revocation block, because a missing
 * block is not "no news": it is exactly the state this command cannot assess, and it
 * would otherwise pass silently against a gateway that predates the check.
 */
async function check({ url, timeoutMs }) {
  const endpoint = `${url}/health/deep`;
  const controller = new AbortController();
  // Ours rather than AbortSignal.timeout, so the timer is cleared before we exit:
  // a crontab entry that lingers for its whole timeout after a fast answer is a
  // crontab entry that piles up.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(endpoint, { signal: controller.signal });
  } catch (err) {
    return {
      endpoint,
      code: 2,
      reasons: [
        controller.signal.aborted
          ? `no reply within ${timeoutMs}ms (is the gateway up, and is this the right URL?)`
          : `request failed: ${err?.message ?? String(err)}`,
      ],
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return { endpoint, code: 2, reasons: [`answered HTTP ${res.status} instead of a health report`] };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* handled below, as "not a health report" */
  }
  if (!body || typeof body !== "object" || typeof body.status !== "string" || !Array.isArray(body.checks)) {
    return { endpoint, code: 2, reasons: ["the reply is not a /health/deep report (no status/checks)"] };
  }
  if (!body.revocations || typeof body.revocations !== "object") {
    return {
      endpoint,
      code: 2,
      reasons: ["the gateway reports no revocation state — it predates the check this command exists for"],
    };
  }

  // From here the gateway has told us what it thinks, and that is the verdict:
  // what follows is the reason, in the order a human would ask for it.
  const reasons = [];
  if (body.status !== "ready") reasons.push(`gateway status is "${body.status}"`);
  for (const member of body.checks) {
    if (!member?.ok) reasons.push(`${member?.service ?? "an upstream service"} health check failed`);
  }
  if (body.revocations.authService === "unreachable") {
    reasons.push(`the auth service is not answering the revocation check (${describeOutage(body.revocations)})`);
  }
  // `authService: "unknown"` is not a fault — it means no token has been presented
  // since boot, so nothing has been asked. Same judgement the endpoint makes.
  return { endpoint, code: reasons.length === 0 ? 0 : 1, reasons, body };
}

function render(result, { json, quiet }) {
  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: result.code === 0,
        endpoint: result.endpoint,
        code: result.code,
        status: result.body?.status ?? null,
        reasons: result.reasons,
        revocations: result.body?.revocations ?? null,
        checks: result.body?.checks ?? null,
      })}\n`
    );
    return;
  }
  if (result.code === 0) {
    if (!quiet) process.stdout.write(`${result.endpoint} reports ready${summaryOf(result.body)}\n`);
    return;
  }
  process.stderr.write(`FAIL ${result.endpoint}\n`);
  for (const reason of result.reasons) process.stderr.write(`  - ${reason}\n`);
  if (result.code === 2) {
    process.stderr.write("  (exit 2: the check could not do its job — no health report to judge)\n");
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
  const result = await check({ url: (parsed.url ?? DEFAULT_URL).replace(/\/+$/, ""), timeoutMs: parsed.timeoutMs });
  render(result, parsed);
  // Set, never `process.exit()`: letting the loop drain flushes stdout, which
  // process.exit() is documented to be able to cut short when it is a pipe.
  process.exitCode = result.code;
}
