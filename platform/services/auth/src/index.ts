import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, createService, migrate, start } from "@nexora/service-kit";
import { registerAuthRoutes } from "./routes.js";
import { pruneRevokedTokens } from "./revocation-store.js";

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

async function pruneRevocations(): Promise<void> {
  try {
    const removed = await pruneRevokedTokens(pool);
    // Only when there was something to do: a line every interval saying "0 rows"
    // is how a log stops being read.
    if (removed > 0) app.log.info({ removed }, "pruned expired revoked-token rows");
  } catch (err) {
    app.log.warn({ err }, "revocation prune failed; expired rows will be retried next interval");
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
