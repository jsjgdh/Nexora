import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, createService, migrate, start } from "@nexora/service-kit";
import { registerAuthRoutes } from "./routes.js";

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

process.on("SIGTERM", () => void pool.end());
process.on("SIGINT", () => void pool.end());

await start(app, port);
