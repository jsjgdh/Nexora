import { cpus } from "node:os";
import { createService, start } from "@nexora/service-kit";
import { registerExecutionRoutes } from "./routes.js";
import { JobQueue } from "./queue.js";
import { Quotas } from "./quotas.js";
import { dockerAvailable } from "./runners/docker.js";

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
 * signed (see receipt.ts), and the progress service re-judges the check from
 * that signature rather than from anything the client says. */

const port = Number(process.env.PORT ?? "8104");
const runner = (process.env.EXECUTION_RUNNER ?? "subprocess") as "subprocess" | "docker";
if (runner !== "subprocess" && runner !== "docker") {
  throw new Error(`EXECUTION_RUNNER must be "subprocess" or "docker", got ${runner}`);
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

app.log.info({ runner, concurrency, dailyQuota, cpus: cpus().length }, "execution service ready");

registerExecutionRoutes(app, { queue, quotas, runner });

await start(app, port);
