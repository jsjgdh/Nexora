import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, createService, migrate, start } from "@nexora/service-kit";
import { registerBillingRoutes } from "./routes.js";
import { loadPlans } from "./dodo.js";

const port = Number(process.env.PORT ?? "8106");
const pool = createPool();
const plans = loadPlans();

const app = await createService("billing", {
  readyCheck: async () => {
    await pool.query("SELECT 1");
    return true;
  },
});

const applied = await migrate(pool, join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"));
if (applied.length > 0) app.log.info({ applied }, "migrations applied");
app.log.info({ plans: [...plans.keys()] }, "billing plans loaded");

registerBillingRoutes(app, pool, plans);

process.on("SIGTERM", () => void pool.end());
process.on("SIGINT", () => void pool.end());

await start(app, port);
