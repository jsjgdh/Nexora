#!/usr/bin/env node
/* The numbers behind the dashboards of TODO 5.2 — a reporter, not a judge.

   Run:
     npm run metrics                # prose, reading the databases the env names
     npm run metrics -- --json      # the same numbers, machine-shaped
     npm run metrics -- --days=30   # widen the daily series (default 14)

   Why a script and not an endpoint or a page. The four dashboards the TODO
   names (signup→first run, completions, execution failures by language,
   sync errors) are numbers that live in Postgres, and the platform is one
   machine with two databases: auth holds users, refresh tokens and the
   verified proofs ledger; billing holds subscriptions. This reads exactly
   what is there, from the same env the services use (AUTH_DATABASE_URL,
   BILLING_DATABASE_URL), and prints it. No new persistence, no route to
   protect, no schema to migrate, nothing that can be reached from a
   browser: the operator console can render this, a cron can archive it,
   and an operator can run it by hand on the box.

   The gaps are printed too, and they are half the point. Three of the four
   dashboards cannot be built from what the platform records, and saying so
   in the output is more useful than a dashboard that quietly shows zero:

     - signup→first run. The IDE runs code on the learner's machine; the
       platform never sees a local run, so there is no first run to count.
       What it does see is the first *attested* evidence a learner syncs
       into the proofs ledger, which is reported below as the nearest
       honest signal, named for what it is.
     - execution failures by language. The execution service records no
       runs: quotas are in memory, receipts are signed, not stored.
       Failures live in `docker logs` for as long docker keeps them; a
       table to count them against is Phase 5 work.
     - sync errors. The sync:* scripts run in dev and CI; their exits are
       persisted nowhere the platform can read.

   Exit status, and why two values rather than the family's three:
     0  the numbers were read and printed — a gap in them is information,
        not a failure; gaps are printed, never exited on
     2  the report could not be produced: AUTH_DATABASE_URL unset, or the
        auth database did not answer. Billing being unconfigured or
        unreachable does not fail the report: the subscriptions section
        says why it is missing and the rest is printed.
   There is no exit 1, on purpose: this command reports, it does not judge.
   Whether anything in these numbers is wrong is a question for a human
   with a threshold — healthcheck.mjs and alerts.mjs are the commands that
   judge. */
/* `process.*` rather than named imports: every write here is a property
   call and the exit status is an assignment, and an imported binding is
   immutable. */
import pg from "pg";
import { pathToFileURL } from "node:url";

const USAGE = `usage: metrics [--json] [--days=<n>] [--help]

  --days=<n>   days in the daily series (default 14)
  --json       print one machine-readable object instead of prose
  --help, -h   this text

  reads AUTH_DATABASE_URL (required) and BILLING_DATABASE_URL (optional)
  from the environment; both are the platform's own.

  exit: 0 the numbers were printed · 2 the report could not be produced`;

/* Every table this report reads, named in one place so the verification
   suite can hold the whole surface against the migrations: if a query here
   outlives a table there, the gate fails before the report does. */
export const QUERIES = {
  signups: `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last24h,
       count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last7d
  FROM users`,
  signupsSeries: `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
       count(*)::int AS count
  FROM users
  WHERE created_at > now() - make_interval(days => $1)
  GROUP BY 1 ORDER BY 1`,
  liveSessions: `SELECT count(*)::int AS live
  FROM refresh_tokens
  WHERE revoked_at IS NULL AND expires_at > now()`,
  /* The signup→first-attested-evidence funnel: both tables are in the auth
     database, so this is one statement, and the lag arithmetic (share,
     median, buckets) is done below as a pure function — over lags, not
     over SQL, so it can be tested without a database. */
  firstEvidence: `SELECT u.created_at AS signup_at, min(p.created_at) AS first_evidence_at
  FROM users u
  LEFT JOIN proofs p ON p.user_id = u.id
  GROUP BY u.id, u.created_at`,
  completions: `SELECT count(*)::int AS total,
       count(DISTINCT user_id)::int AS users,
       count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last7d
  FROM proofs`,
  completionsSeries: `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
       count(*)::int AS count
  FROM proofs
  WHERE created_at > now() - make_interval(days => $1)
  GROUP BY 1 ORDER BY 1`,
  subscriptions: `SELECT count(*)::int AS active
  FROM billing_subscriptions
  WHERE status = 'active'`,
};

/* The funnel's arithmetic, as a function of rows any test can supply.
 *
 * A lag runs from signup to the ingest of the learner's first synced
 * receipt — measured on ingest (`created_at`), not on the receipt's own
 * issue time: what the dashboard asks is when the platform first saw the
 * work, and a receipt issued last week and synced today is seen today. A
 * user who never synced is a null, and stays a null: the share over all
 * signups is the number, never the share over the ones who happened to
 * appear. A lag that is negative or not finite is dropped from the lag
 * statistics rather than reported — clock skew is not a funnel. */
export function firstEvidenceStats(rows) {
  const lagsHours = rows
    .filter((r) => r.first_evidence_at)
    .map((r) => (new Date(r.first_evidence_at).getTime() - new Date(r.signup_at).getTime()) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const median =
    lagsHours.length === 0
      ? null
      : lagsHours.length % 2
        ? lagsHours[(lagsHours.length - 1) / 2]
        : (lagsHours[lagsHours.length / 2 - 1] + lagsHours[lagsHours.length / 2]) / 2;
  return {
    users: rows.length,
    withEvidence: lagsHours.length,
    sharePercent: rows.length === 0 ? null : Math.round((lagsHours.length / rows.length) * 1000) / 10,
    medianHours: median === null ? null : Math.round(median * 10) / 10,
    within24h: lagsHours.filter((h) => h <= 24).length,
    within7d: lagsHours.filter((h) => h <= 24 * 7).length,
  };
}

/* What the platform does not record, printed as part of the report. */
const GAPS = [
  {
    dashboard: "signup→first run",
    why: "the IDE runs code on the learner's machine; the platform never sees a local run. firstEvidence below is the nearest honest signal — the first attested evidence the learner synced.",
  },
  {
    dashboard: "execution failures by language",
    why: "the execution service records no runs (quotas in memory, receipts signed but not stored); failures live in docker logs only, until a table exists.",
  },
  {
    dashboard: "sync errors",
    why: "the sync:* scripts run in dev and CI; their exits are persisted nowhere the platform can read.",
  },
];

function parseArgs(args) {
  const parsed = { json: false, days: 14, help: false, error: null };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg.startsWith("--days=")) {
      const days = Number(arg.slice("--days=".length));
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        parsed.error = `invalid --days: expected a whole number of days (1..365), got "${arg.slice("--days=".length)}"`;
      } else parsed.days = days;
    } else parsed.error = `unknown argument "${arg}"`;
  }
  return parsed;
}

/** One connection, a callback, and a closed connection — however it ends. */
async function withClient(url, fn) {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 10_000,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/* The reason a database did not answer, with the credentials it was given
   taken back out: connection strings travel into logs and chat windows far
   more often than anyone means them to, and this report is copied. */
/** Where a database is, without anything that was given to reach it: the
 *  name, the host, the port — never the user or the password. Both reporters
 *  name a database with this, so an operator sees one spelling of "where". */
export function dbLabel(url) {
  try {
    const u = new URL(url);
    return `${u.pathname.replace(/^\//, "") || "postgres"}@${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "postgres";
  }
}

export function whyNot(url, err) {
  const message = String(err?.message ?? err);
  let secret = "";
  try {
    secret = new URL(url).password ?? "";
  } catch {
    /* an unparseable URL has no password of its own to leak */
  }
  const safe = secret ? message.replaceAll(secret, "***") : message;
  return `${dbLabel(url)} did not answer: ${safe}`;
}

async function readReport({ authUrl, billingUrl, days }) {
  const report = { generatedAt: new Date().toISOString(), days };

  await withClient(authUrl, async (db) => {
    const [signups, sessions, funnel, completions, signupsSeries, completionsSeries] = await Promise.all([
      db.query(QUERIES.signups),
      db.query(QUERIES.liveSessions),
      db.query(QUERIES.firstEvidence),
      db.query(QUERIES.completions),
      db.query(QUERIES.signupsSeries, [days]),
      db.query(QUERIES.completionsSeries, [days]),
    ]);
    report.signups = signups.rows[0];
    report.sessions = { live: sessions.rows[0].live };
    report.firstEvidence = firstEvidenceStats(funnel.rows);
    report.completions = completions.rows[0];
    report.series = { signups: signupsSeries.rows, completions: completionsSeries.rows };
  });

  /* Billing is the one database whose absence does not void the report:
     a deployment mid-setup, or a box running the free tier without billing
     configured, still has signups and evidence to count. The section says
     why it is missing instead of pretending a zero. */
  if (!billingUrl) {
    report.subscriptions = { unavailable: "BILLING_DATABASE_URL is not set" };
  } else {
    try {
      const active = await withClient(billingUrl, (db) => db.query(QUERIES.subscriptions));
      report.subscriptions = { active: active.rows[0].active };
    } catch (err) {
      report.subscriptions = { unavailable: whyNot(billingUrl, err) };
    }
  }

  report.gaps = GAPS;
  return report;
}

function renderProse(report, { days }) {
  const out = [];
  out.push(
    `signups: ${report.signups.total} total · ${report.signups.last24h} in 24h · ${report.signups.last7d} in 7d`
  );
  out.push(`sessions: ${report.sessions.live} live (refresh tokens neither expired nor revoked)`);
  const f = report.firstEvidence;
  out.push(
    `signup→attested evidence: ${f.withEvidence} of ${f.users} users` +
      (f.sharePercent === null ? "" : ` (${f.sharePercent}%)`) +
      ` · median ${f.medianHours === null ? "—" : `${f.medianHours}h`} to first sync` +
      ` · ${f.within24h} within 24h · ${f.within7d} within 7d`
  );
  out.push(
    `completions (attested competencies in the proofs ledger): ${report.completions.total} total · ${report.completions.users} users · ${report.completions.last7d} in 7d`
  );
  out.push(
    report.subscriptions.unavailable
      ? `subscriptions: unavailable (${report.subscriptions.unavailable})`
      : `subscriptions: ${report.subscriptions.active} active`
  );
  const byDay = new Map();
  for (const row of report.series.signups) byDay.set(row.day, { signups: row.count, completions: 0 });
  for (const row of report.series.completions) {
    const slot = byDay.get(row.day) ?? { signups: 0, completions: 0 };
    slot.completions = row.count;
    byDay.set(row.day, slot);
  }
  if (byDay.size > 0) {
    out.push(`last ${days} days (day · signups · completions):`);
    for (const [day, slot] of [...byDay.entries()].sort()) {
      out.push(`  ${day}  ${slot.signups}  ${slot.completions}`);
    }
  }
  for (const gap of report.gaps) out.push(`gap — ${gap.dashboard}: ${gap.why}`);
  return out.join("\n");
}

/* The script half runs only when this file is the script: the verification
   suite imports QUERIES and the funnel arithmetic from it, and an import
   that reads the environment, prints, and decides an exit code would be a
   library with opinions. */
const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMain) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
    process.exitCode = 2;
  } else if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exitCode = 0;
  } else {
    const authUrl = process.env.AUTH_DATABASE_URL ?? null;
    if (!authUrl) {
      process.stderr.write(
        `FAIL metrics\n  - AUTH_DATABASE_URL is not set — this report reads the platform's own databases\n  (exit 2: the report could not be produced — no numbers to judge)\n`
      );
      process.exitCode = 2;
    } else {
      try {
        const report = await readReport({
          authUrl,
          billingUrl: process.env.BILLING_DATABASE_URL ?? null,
          days: parsed.days,
        });
        if (parsed.json) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${renderProse(report, parsed)}\n`);
        process.exitCode = 0;
      } catch (err) {
        process.stderr.write(
          `FAIL metrics\n  - ${whyNot(authUrl, err)}\n  (exit 2: the report could not be produced — no numbers to judge)\n`
        );
        process.exitCode = 2;
      }
    }
  }
}
