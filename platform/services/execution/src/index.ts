import { cpus } from "node:os";
import { createService, start } from "@nexora/service-kit";
import { registerExecutionRoutes } from "./routes.js";
import { JobQueue } from "./queue.js";
import { Quotas } from "./quotas.js";
import { dockerAvailable } from "./runners/docker.js";
import { SYNCED_DESIGN_CHALLENGES } from "./data/design-challenges.js";
import { SYNCED_INCIDENTS } from "./data/incidents.js";
import { SYNCED_ATTEST_FIXTURES } from "./data/attest-fixtures.js";
import type { StructuralCheck } from "./designAttest.js";
import type { CanonicalIncident } from "./incidentAttest.js";

/* The execution service: learner code, run on the platform's own runner.
 *
 * There is one way a server runs code here — a subprocess on this host
 * (single-tenant, the toolchain lives in this image) or a container per job
 * (multi-tenant), chosen by EXECUTION_RUNNER. The course itself now runs in the
 * learner's own IDE against their own toolchain; the mesh still runs code where
 * grading must not be the learner's to decide, and it runs it itself rather
 * than handing a learner's source to a third-party judge. One runner means one
 * sandbox to keep honest, and one thing that signs what it observed.
 *
 * What has not changed: every run is executed in isolation, the facts are
 * signed (see receipt.ts), and attestation re-judges from that signature
 * rather than from anything the client says. */

const port = Number(process.env.PORT ?? "8104");
const runner = (process.env.EXECUTION_RUNNER ?? "subprocess") as "subprocess" | "docker";
if (runner !== "subprocess" && runner !== "docker") {
  throw new Error(`EXECUTION_RUNNER must be "subprocess" or "docker", got ${runner}`);
}

/* The subprocess tier is not an isolation boundary. It spawns learner code as a
 * child of this very process: same filesystem, same network namespace, same
 * process namespace. The child's own environment is scrubbed, but the service's
 * environment stays readable at /proc/1/environ by a child of the same UID — and
 * that environment holds INTERNAL_API_KEY (which is also the seed for the
 * run-receipt signing key) and DATABASE_URL. So in production the non-isolated
 * tier must be a named decision, not a default: fail closed here rather than
 * serve RCE-on-the-host to anyone who can create an account. */
const isProd = (process.env.NODE_ENV ?? "development") === "production";
if (isProd && runner === "subprocess" && process.env.EXECUTION_ALLOW_SUBPROCESS !== "1") {
  throw new Error(
    "EXECUTION_RUNNER=subprocess is refused in production: it runs learner code on this host with the " +
      "service's own filesystem, network and process namespace, so a submitted program can read " +
      "INTERNAL_API_KEY and DATABASE_URL (e.g. from /proc/1/environ). Set EXECUTION_RUNNER=docker — one " +
      "container per job, no network — or, on a single-tenant host you control, accept the risk " +
      "explicitly with EXECUTION_ALLOW_SUBPROCESS=1."
  );
}

const concurrency = Math.max(1, Number(process.env.EXECUTION_CONCURRENCY ?? "2") || 2);
const dailyQuota = Math.max(1, Number(process.env.EXECUTION_DAILY_QUOTA ?? "200") || 200);

const app = await createService("execution");
const queue = new JobQueue(concurrency);
const quotas = new Quotas(dailyQuota, 2);

if (runner === "docker" && !(await dockerAvailable())) {
  app.log.warn(
    "EXECUTION_RUNNER=docker but no Docker daemon reachable — executions will fail with 503 until it appears"
  );
}

if (runner === "subprocess") {
  // Non-production only: production refused this tier above unless the operator
  // set EXECUTION_ALLOW_SUBPROCESS=1. Either way it is worth saying out loud,
  // because the consequence is that submitted programs share this host.
  app.log.warn(
    { runner },
    "subprocess runner active: learner code runs on this host and can reach the service's own " +
      "filesystem, network and process namespace — use EXECUTION_RUNNER=docker for anything multi-tenant"
  );
}

app.log.info({ runner, concurrency, dailyQuota, cpus: cpus().length }, "execution service ready");

/* The design challenges the platform may attest: the synced structural floor
 * (id, authored revision, checks) from `npm run sync:design`. An entry that
 * fails shape validation is skipped with a warning — never judged — so a bad
 * sync degrades to 503 `attestation_unavailable`, the same answer as no sync.
 * Judging a graph against checks this service cannot vouch for would be worse
 * than refusing; the sync script and the verify suite are the places malformed
 * content is caught, this is only the last backstop. */
const attestChallenges = new Map<string, { version: number; checks: StructuralCheck[] }>();
for (const entry of SYNCED_DESIGN_CHALLENGES) {
  const usable =
    typeof entry?.id === "string" &&
    entry.id.length > 0 &&
    Number.isInteger(entry?.version) &&
    (entry as { version: number }).version >= 1 &&
    Array.isArray(entry?.checks) &&
    entry.checks.length > 0;
  if (!usable) {
    app.log.warn({ entry: (entry as { id?: unknown })?.id ?? null }, "skipping malformed synced design challenge — it will answer 503, never judge");
    continue;
  }
  attestChallenges.set(entry.id, { version: entry.version, checks: entry.checks as StructuralCheck[] });
}
app.log.info(
  { designChallenges: [...attestChallenges].map(([id, c]) => `${id} v${c.version}`) },
  "design attestation registry ready"
);

/* The canonical code suites the platform may attest against: the synced
 * structural floor's executable twin (test path → suite contents) from
 * `npm run sync:fixtures`. Entries that fail shape validation are skipped
 * with a warning — never judged — so a bad sync degrades to 503
 * `attestation_unavailable`, the same answer as no sync. Judging a run
 * against a suite this service cannot vouch for would be worse than
 * refusing; the sync script and the verify suite are the places malformed
 * content is caught, this is only the last backstop. */
const attestFixtures = new Map<string, string>();
for (const entry of SYNCED_ATTEST_FIXTURES) {
  const usable =
    typeof entry?.key === "string" &&
    entry.key.length > 0 &&
    typeof entry?.file === "string" &&
    entry.file.length > 0 &&
    typeof entry?.content === "string" &&
    entry.content.length > 0;
  if (!usable) {
    app.log.warn("skipping malformed synced attest fixture — it will answer 503, never judge");
    continue;
  }
  attestFixtures.set(entry.key, entry.content);
}
app.log.info({ attestFixtures: attestFixtures.size }, "code attestation registry ready");

/* The debugging labs the platform may judge: the synced answer key (the cause
 * each lab is built around, and the cause each candidate fix addresses) from
 * `npm run sync:incidents`. The IDE ships the lab without that key, so this
 * copy is the only one that can say which fix resolves an incident \u2014 which is
 * why the key lives here and not in the artefact. An entry that fails shape
 * validation is skipped with a warning \u2014 never judged \u2014 so a bad sync degrades
 * to 503 `attestation_unavailable`, the same answer as no sync. */
const attestIncidents = new Map<string, CanonicalIncident>();
for (const entry of SYNCED_INCIDENTS) {
  const usable =
    typeof entry?.id === "string" &&
    entry.id.length > 0 &&
    Number.isInteger(entry?.version) &&
    (entry as { version: number }).version >= 1 &&
    typeof entry?.rootCause === "string" &&
    entry.rootCause.trim().length > 0 &&
    Array.isArray(entry?.candidateFixes) &&
    entry.candidateFixes.length > 0 &&
    Array.isArray(entry?.requiredEvidence) &&
    entry.requiredEvidence.length > 0;
  if (!usable) {
    app.log.warn({ entry: (entry as { id?: unknown })?.id ?? null }, "skipping malformed synced debugging lab \u2014 it will answer 503, never judge");
    continue;
  }
  attestIncidents.set(entry.id, {
    id: entry.id,
    version: entry.version,
    rootCause: entry.rootCause,
    candidateFixes: entry.candidateFixes,
    requiredEvidence: entry.requiredEvidence,
  });
}
app.log.info(
  { debuggingLabs: [...attestIncidents].map(([id, i]) => `${id} v${i.version}`) },
  "debugging-lab attestation registry ready"
);

registerExecutionRoutes(app, { queue, quotas, runner, attestChallenges, attestIncidents, attestFixtures });

await start(app, port);
