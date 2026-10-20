import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, createService, migrate, start } from "@nexora/service-kit";
import { registerAuthRoutes } from "./routes.js";
import { registerAdminRoutes } from "./admin.js";
import { registerCohortRoutes } from "./cohorts.js";
import { registerLtiRoutes } from "./lti.js";
import { registerProgressRoutes } from "./progress.js";
import { pruneDeletedSubjectRevocations, pruneRevokedTokens } from "./revocation-store.js";
import { pruneRetention } from "./rights.js";

const port = Number(process.env.PORT ?? "8101");
const pool = createPool();

const app = await createService("auth", {
  readyCheck: async () => {
    await pool.query("SELECT 1");
    return true;
  },
});

const applied = await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"));
if (applied.length > 0) app.log.info({ applied }, "migrations applied");

registerAuthRoutes(app, pool);
/* The operator's console. Registered here, next to the identity routes, so
   the whole public surface of this service is in one place to be read. The
   routes carry the operator check themselves: a signed-in learner without
   the flag gets a 403 from every one of them. */
registerAdminRoutes(app, pool);
/* The institutional surface: cohorts, the join code, the roster, the export,
   and the mesh-only seat check the edge asks.
 *
 * This call was MISSING, and the gap was invisible to the suite, because the
 * suite registers the module itself on its own test app. The service, which
 * is what actually runs, answered 404 for every cohort route, and the
 * edge's seat lookup, which is how the paywall asks whether a learner holds
 * a seat, got a 404 and read it as "we cannot check right now". So every
 * paid phase request by somebody who had not subscribed answered 503
 * "entitlement unavailable" instead of 402 "subscribe", forever, and the
 * front door's teaching pages had nothing to talk to.
 *
 * The wiring is now asserted by the suite that boots the real service (see
 * scripts/verify.mjs, "the auth service's own entry point registers ..."), so
 * a module that exists but is never mounted fails the build. */
registerCohortRoutes(app, pool);

/* LTI 1.3: a course launched from an LMS (LTI.md). Mounted here for the same
   reason as the cohort routes: the launch binds an LMS identity to a platform
   account, takes a seat in a cohort and posts the verified work back to the
   course, and all four of those live in this service's database. A module
   that is written and never mounted is a 404 in production, so the suite
   asserts this call is here. */
await registerLtiRoutes(app, pool);

/* The learner's own work: drafts, attempts, completions, streak and placement.
 *
 * Mounted here, beside the evidence ledger, because it is the same kind of
 * record about the same learner and it lives in the same database with the
 * same cascade: erasing the account takes the work with it. The routes take
 * the identity from the header the edge verified and read nothing else, so
 * one learner never sees another's work. */
registerProgressRoutes(app, pool);

/* Housekeeping for the access-token denylist.
 *
 * Every row there names a credential that has already been signed out, and it
 * stops mattering the moment that token would have expired on its own — so the
 * table is a working set, not a history, and something has to drop the rows that
 * have gone stale. Two things make this the right shape:
 *
 *   - it is a timer, not a trigger on the read path. The check runs on every
 *     authenticated request; making it delete rows would put a write in front of
 *     every request for a table that only grows on sign-out.
 *   - it runs once at boot as well. A deployment that is idle for a week would
 *     otherwise keep rows the interval never got a chance to reach, and a deploy
 *     is exactly when nobody is watching a request path.
 *
 * `unref()` because cleanup must never be the reason the process stays alive:
 * shutdown should not wait for the next tick of a housekeeping timer. Failures are
 * logged and swallowed — a failed prune leaves dead rows behind, which is untidy
 * and not a reason to take the service down.
 */
const PRUNE_INTERVAL_MS = Number(process.env.REVOCATION_PRUNE_INTERVAL_MS ?? 15 * 60_000);

/* Housekeeping, in one pass: the denylist, the deletion cut-offs, and the
 * retention schedule itself.
 *
 * They share a timer because they are one idea — data this service no longer has
 * a reason to hold — and because a second interval would be a second thing to
 * notice when it stops running. The retention half is the one that answers the
 * audit's F-06 ("no retention schedule and no retention or deletion of
 * anything"): before it existed, the honest description of this deployment was
 * that rows were written and never removed, whatever a document promised.
 *
 * A failure is logged and swallowed, exactly as before: an unpruned row is
 * untidier than it should be, and it is never a reason to take the identity
 * service down. */
async function pruneRevocations(): Promise<void> {
  try {
    const removed = await pruneRevokedTokens(pool);
    const cutoffs = await pruneDeletedSubjectRevocations(pool);
    const retention = await pruneRetention(pool);
    const total =
      removed + cutoffs + Object.values(retention).reduce((sum, n) => sum + n, 0);
    // Only when there was something to do: a line every interval saying "0 rows"
    // is how a log stops being read.
    if (total > 0) {
      app.log.info({ removed, cutoffs, retention }, "retention sweep: expired rows removed");
    }
  } catch (err) {
    app.log.warn({ err }, "retention sweep failed; expired rows will be retried next interval");
  }
}

if (Number.isFinite(PRUNE_INTERVAL_MS) && PRUNE_INTERVAL_MS > 0) {
  const timer = setInterval(() => void pruneRevocations(), PRUNE_INTERVAL_MS);
  timer.unref();
  app.log.info({ intervalMs: PRUNE_INTERVAL_MS }, "revocation prune scheduled");
} else {
  app.log.warn(
    { value: process.env.REVOCATION_PRUNE_INTERVAL_MS },
    "REVOCATION_PRUNE_INTERVAL_MS is not positive; the denylist will only be pruned by sign-outs"
  );
}
void pruneRevocations();

process.on("SIGTERM", () => void pool.end());
process.on("SIGINT", () => void pool.end());

await start(app, port);
