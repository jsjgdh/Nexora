import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { createPool, createService, migrate, start } from "@nexora/service-kit";
import { registerTutorRoutes } from "./routes.js";

const port = Number(process.env.PORT ?? "8105");

// Request logging needs Postgres, but tutoring must survive its absence
// (curriculum fallback is fully stateless). Degrade loudly, not fatally.
let pool: Pool | null = null;
if (process.env.DATABASE_URL) {
  pool = createPool();
  const applied = await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"));
  if (applied.length > 0) console.log("tutor migrations applied:", applied.join(","));
} else {
  console.warn("DATABASE_URL unset — tutor request logging disabled");
}

const app = await createService("tutor", {
  readyCheck: async () => {
    if (!pool) return true;
    await pool.query("SELECT 1");
    return true;
  },
});

registerTutorRoutes(app, pool);

const shutdown = () => {
  if (pool) void pool.end().catch(() => undefined);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await start(app, port);
