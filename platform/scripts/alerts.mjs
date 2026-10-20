#!/usr/bin/env node
/* Capacity alarms: the machine answering "are you still fit for the next
   user?", once an hour from cron, without a monitoring vendor in the path.

   Run:
     npm run alerts                    # prose verdict on this machine
     npm run alerts -- --json          # the same board, machine-shaped
     npm run alerts -- --disk-warn=95 --queue-warn=10

   What it asks, and of whom:

     disk      the filesystem this script runs on (--path, default /), via
               statfs. The number is what a process can actually fill to
               (bavail, not bfree — blocks reserved for root are not the
               operator's free space).
     postgres  every database the deployment configured (AUTH_DATABASE_URL,
               BILLING_DATABASE_URL): connections in use against
               max_connections, read from pg_stat_activity on each. An
               unset URL is "not configured", and that check is skipped —
               a deployment mid-setup is not a breach. A database that is
               configured but will not answer IS a breach: a cron that
               cannot reach its own data is the platform's most direct
               emergency, and a skip would let a down box pass its own
               alarms.
     queue     the gateway's own view: sign the canary in (SYNTHETIC_URL /
               SYNTHETIC_EMAIL / SYNTHETIC_PASSWORD — the same account the
               synthetic check uses) and read queueDepth from
               /api/execute/capabilities — jobs waiting for a runner slot.
               Waiting means work arrived that cannot start; it is the one
               "the machine is falling behind" number the platform already
               exposes. A gateway that does not answer is recorded and left
               alone: availability is healthcheck.mjs's and synthetic.mjs's
               verdict, and two alarms for one outage help nobody.

   Every check still runs when one has already breached — an operator wants
   the whole board, not the first headline.

   Exit status:
     1  at least one breach
     0  every check that could be asked answered under its threshold (skips
        are printed, never silently dropped)
     2  nothing could be checked at all — the alarm itself is blind, which
        is itself worth a human's morning
   Error-rate alerting is deliberately absent: the platform records no
   request outcomes to count (the metrics report names that gap too), so a
   threshold on errors would be a number invented here rather than read. */
/* `process.*` rather than named imports: the exit status is an assignment. */
import fs from "node:fs";
import pg from "pg";
import { pathToFileURL } from "node:url";
import { whyNot, dbLabel } from "./metrics.mjs";

const USAGE = `usage: alerts [--json] [--disk-warn=<pct>] [--db-warn=<pct>] [--queue-warn=<n>] [--path=<dir>] [--help]

  --disk-warn=<pct>   disk used percent that is a breach (default 90)
  --db-warn=<pct>     connection percent of max_connections (default 90)
  --queue-warn=<n>    waiting execution jobs that are a breach (default 5)
  --path=<dir>        filesystem to measure (default /)
  --json              one machine-readable object instead of prose
  --help, -h          this text

  reads AUTH_DATABASE_URL / BILLING_DATABASE_URL (unset = skipped, not
  breached) and SYNTHETIC_URL / SYNTHETIC_EMAIL / SYNTHETIC_PASSWORD for
  the queue check.

  exit: 1 a breach · 0 every available check passed · 2 nothing could be checked`;

/* What a process can actually fill to. Exported because the formula is the
 * only part of the disk check a test cannot reach by running the script: a
 * canned statfs row pins it (blocks total, bavail what remains), and the
 * integration runs below pin everything else. */
export function pctUsed(stat) {
  const blocks = Number(stat?.blocks);
  if (!Number.isFinite(blocks) || blocks <= 0) return null;
  const bavail = Number(stat?.bavail);
  const available = Number.isFinite(bavail) ? Math.max(0, bavail) : blocks;
  return Math.round((1 - available / blocks) * 1000) / 10;
}

function parseArgs(args) {
  const parsed = {
    json: false,
    help: false,
    diskWarn: 90,
    dbWarn: 90,
    queueWarn: 5,
    path: "/",
    error: null,
  };
  const percent = (arg, key, setter) => {
    const raw = arg.slice(key.length + 1); // skip the "=" after the flag name
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      parsed.error = `invalid ${key}: expected a number of percent (or a count for --queue-warn), got "${raw}"`;
    } else setter(value);
  };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg.startsWith("--disk-warn=")) percent(arg, "--disk-warn", (v) => (parsed.diskWarn = v));
    else if (arg.startsWith("--db-warn=")) percent(arg, "--db-warn", (v) => (parsed.dbWarn = v));
    else if (arg.startsWith("--queue-warn=")) percent(arg, "--queue-warn", (v) => (parsed.queueWarn = v));
    else if (arg.startsWith("--path=")) parsed.path = arg.slice("--path=".length);
    else parsed.error = `unknown argument "${arg}"`;
  }
  return parsed;
}

async function checkDisk({ path, warnAt }) {
  try {
    const stat = await fs.promises.statfs(path);
    const usedPct = pctUsed(stat);
    if (usedPct === null) {
      return { name: "disk", status: "unavailable", where: path, why: "the filesystem reported no usable totals" };
    }
    return {
      name: "disk",
      status: usedPct >= warnAt ? "breach" : "ok",
      where: path,
      usedPct,
      warnAt,
    };
  } catch (err) {
    return {
      name: "disk",
      status: "unavailable",
      where: path,
      why: `not measurable: ${err.code ?? err.message}`,
    };
  }
}

async function checkDatabase(urlName, url, warnAt) {
  const name = `postgres ${urlName}`;
  if (!url) {
    return { name, status: "unavailable", why: "not configured" };
  }
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 10_000,
  });
  try {
    await client.connect();
    const r = await client.query(
      "SELECT (SELECT count(*) FROM pg_stat_activity)::int AS conns, current_setting('max_connections')::int AS max"
    );
    const conns = Number(r.rows[0].conns);
    const max = Number(r.rows[0].max);
    const usedPct = Math.round((conns / max) * 1000) / 10;
    return {
      name,
      status: usedPct >= warnAt ? "breach" : "ok",
      where: dbLabel(url),
      conns,
      max,
      usedPct,
      warnAt,
    };
  } catch (err) {
    return { name, status: "breach", unreachable: whyNot(url, err) };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** POST/GET against the gateway with a bounded wait; `network` means "no answer". */
async function ask(url, { method = "GET", body, token, timeoutMs }) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* a non-JSON answer is still an answer; the caller judges its shape */
    }
    return { status: res.status, json };
  } catch (err) {
    return { network: err?.name === "TimeoutError" ? "timed out" : String(err?.cause?.code ?? err?.message ?? err) };
  }
}

async function checkQueue({ url, email, password, warnAt, timeoutMs }) {
  const skip = (why) => ({ name: "queue", status: "unavailable", why });
  if (!url || !email || !password) {
    return skip("SYNTHETIC_URL / SYNTHETIC_EMAIL / SYNTHETIC_PASSWORD not all set");
  }
  const login = await ask(`${url}/api/auth/login`, {
    method: "POST",
    body: { email, password },
    timeoutMs,
  });
  if (login.network) {
    return skip(`the gateway did not answer (${login.network}) — availability is healthcheck.mjs's verdict`);
  }
  if (login.status === 401) return skip("the canary credentials were refused — synthetic.mjs names this");
  if (login.status !== 200) return skip(`sign-in answered HTTP ${login.status}`);
  const token = login.json?.tokens?.accessToken;
  if (typeof token !== "string") return skip("HTTP 200 was not a sign-in answer (no tokens.accessToken)");
  const caps = await ask(`${url}/api/execute/capabilities`, { token, timeoutMs });
  if (caps.network) return skip(`capabilities did not answer (${caps.network})`);
  if (caps.status !== 200) return skip(`capabilities answered HTTP ${caps.status}`);
  const depth = caps.json?.queueDepth;
  if (!Number.isFinite(depth)) return skip("the capabilities reply carried no queueDepth");
  return {
    name: "queue",
    status: depth >= warnAt ? "breach" : "ok",
    depth,
    warnAt,
    concurrency: Number.isFinite(caps.json?.concurrency) ? caps.json.concurrency : null,
    runner: typeof caps.json?.runner === "string" ? caps.json.runner : null,
  };
}

function renderProse(checks, verdict) {
  const line = (c) => {
    if (c.status === "breach") {
      if (c.name === "disk") return `BREACH - disk: ${c.usedPct}% used at ${c.where} (warn ${c.warnAt}%)`;
      if (c.unreachable) return `BREACH - ${c.name}: ${c.unreachable}`;
      if (c.name === "queue") {
        return `BREACH - queue: ${c.depth} jobs waiting (warn ${c.warnAt})${c.concurrency === null ? "" : ` · concurrency ${c.concurrency}`}${c.runner ? ` · runner ${c.runner}` : ""}`;
      }
      return `BREACH - ${c.name} (${c.where}): ${c.usedPct}% of ${c.max} connections in use (warn ${c.warnAt}%)`;
    }
    if (c.status === "unavailable") return `skip - ${c.name}: ${c.why}`;
    if (c.name === "disk") return `ok - disk: ${c.usedPct}% used at ${c.where} (warn ${c.warnAt}%)`;
    if (c.name === "queue") return `ok - queue: ${c.depth} waiting (warn ${c.warnAt})`;
    return `ok - ${c.name} (${c.where}): ${c.usedPct}% of ${c.max} connections (warn ${c.warnAt}%)`;
  };
  const skipped = checks.filter((c) => c.status === "unavailable").length;
  return [
    ...checks.map(line),
    ...(skipped > 0 ? [`${skipped} of ${checks.length} checks could not be asked`] : []),
    verdict,
  ].join("\n");
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
  process.exitCode = 2;
} else if (parsed.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exitCode = 0;
} else {
  const timeoutMs = 5_000;
  const checks = await Promise.all([
    checkDisk({ path: parsed.path, warnAt: parsed.diskWarn }),
    checkDatabase("AUTH_DATABASE_URL", process.env.AUTH_DATABASE_URL ?? "", parsed.dbWarn),
    checkDatabase("BILLING_DATABASE_URL", process.env.BILLING_DATABASE_URL ?? "", parsed.dbWarn),
    checkQueue({
      url: process.env.SYNTHETIC_URL ?? "",
      email: process.env.SYNTHETIC_EMAIL ?? "",
      password: process.env.SYNTHETIC_PASSWORD ?? "",
      warnAt: parsed.queueWarn,
      timeoutMs,
    }),
  ]);

  const breaches = checks.filter((c) => c.status === "breach");
  const available = checks.filter((c) => c.status !== "unavailable");
  const code = breaches.length > 0 ? 1 : available.length === 0 ? 2 : 0;
  const verdict =
    code === 1
      ? `verdict: BREACH — ${breaches.length} of ${checks.length} checks over threshold (exit 1)`
      : code === 2
        ? "verdict: NOTHING COULD BE CHECKED — the alarm itself is blind (exit 2)"
        : "verdict: every available check under threshold (exit 0)";

  if (parsed.json) {
    process.stdout.write(
      `${JSON.stringify({ generatedAt: new Date().toISOString(), checks, verdict: { code, breaches: breaches.length } })}\n`
    );
  } else {
    process.stdout.write(`${renderProse(checks, verdict)}\n`);
  }
  process.exitCode = code;
}
