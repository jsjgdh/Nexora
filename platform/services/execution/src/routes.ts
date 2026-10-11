import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { executeSchema, type ExecuteResponse } from "@nexora/contracts";
import { ApiError, parseOr400, requireUserId } from "@nexora/service-kit";
import { validateJob, DEFAULT_TIMEOUT_BY_LANGUAGE } from "./validate.js";
import { runSubprocess } from "./runners/subprocess.js";
import { EXEC_IMAGES, dockerAvailable, runDocker } from "./runners/docker.js";
import { JobQueue } from "./queue.js";
import { Quotas } from "./quotas.js";
import { goPhase, parseGoDiagnostics, trimGoStderr } from "./go-diagnostics.js";
import { mintReceipt, receiptSigningKey } from "./receipt.js";

export interface ExecutionDeps {
  queue: JobQueue;
  quotas: Quotas;
  /**
   * How this deployment isolates a run it is asked to perform: a subprocess on
   * this host (single-tenant, the toolchain is baked into this image) or a
   * container per job (multi-tenant, needs a daemon). It is the only choice
   * left to make — the service always runs the code itself.
   */
  runner: "subprocess" | "docker";
}

/** How to probe each language's availability under the subprocess runner. */
const HOST_PROBES: Record<string, [string, string[]]> = {
  node: ["node", ["--version"]],
  python: ["python3", ["--version"]],
  go: ["go", ["version"]],
};

function hasBinary(bin: string, args: string[] = ["--version"]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 5000 }, (err) => resolve(!err));
  });
}

export function registerExecutionRoutes(app: FastifyInstance, deps: ExecutionDeps) {
  app.get("/capabilities", async (req) => {
    const userId = requireUserId(req);
    const quota = {
      dailyQuota: deps.quotas.dailyQuota,
      dailyRemaining: deps.quotas.remaining(userId),
    };
    // The docker tier's runtimes come from its images, so probing host binaries
    // there would report languages the service can serve as unavailable.
    const languages =
      deps.runner === "docker"
        ? Object.keys(EXEC_IMAGES)
        : (
            await Promise.all(
              Object.entries(HOST_PROBES).map(async ([lang, [bin, args]]) =>
                (await hasBinary(bin, args)) ? lang : null
              )
            )
          ).filter((l): l is string => l !== null);

    return {
      ...quota,
      runner: deps.runner,
      languages,
      concurrency: deps.queue.concurrency,
      defaultTimeoutMs: 8000,
      defaultTimeoutByLanguage: DEFAULT_TIMEOUT_BY_LANGUAGE,
      queueDepth: deps.queue.depth,
      reachable: true,
    };
  });

  app.post("/execute", async (req, reply) => {
    const userId = requireUserId(req);
    const denied = deps.quotas.check(userId);
    reply.header("X-Execution-Daily-Remaining", String(deps.quotas.remaining(userId)));
    if (denied) throw new ApiError(429, "quota_reached", denied);
    const body = parseOr400(executeSchema, req.body);
    const job = validateJob(body);

    // Availability is reported honestly per language, with the fix in the
    // message: a missing toolchain must never look like a learner's mistake.
    // The docker tier's toolchains come from its images, so only the
    // subprocess tier is probed on this host.
    if (deps.runner === "subprocess") {
      const probe = HOST_PROBES[job.language];
      if (probe && !(await hasBinary(probe[0], probe[1]))) {
        const install = job.language === "go" ? "the Go toolchain" : job.language;
        throw new ApiError(
          503,
          "language_unavailable",
          `${job.language} is not installed on this runner (missing ${install}).`
        );
      }
    }

    // Validate/probe above may await, so recheck immediately before reserving
    // a run. Without this second check, concurrent requests can all pass the
    // earlier daily-limit check and collectively overspend the allowance.
    const stillAllowed = deps.quotas.check(userId);
    if (stillAllowed) {
      reply.header("X-Execution-Daily-Remaining", String(deps.quotas.remaining(userId)));
      throw new ApiError(429, "quota_reached", stillAllowed);
    }
    const release = deps.quotas.acquire(userId);
    reply.header("X-Execution-Daily-Remaining", String(deps.quotas.remaining(userId)));
    try {
      const run = (): Promise<ExecuteResponse> =>
        deps.runner === "docker" ? runDocker(job) : runSubprocess(job);
      const result = await deps.queue.run(run);

      // Go: attach the structured reading of stderr before it leaves the
      // service, so every client shows the same file/line and the same phase.
      if (job.language === "go") {
        const diagnostics = parseGoDiagnostics(result.stderr);
        result.diagnostics = diagnostics;
        result.phase = goPhase(diagnostics);
        result.stderr = trimGoStderr(result.stderr, diagnostics);
      }

      // Signed last, over the facts exactly as the client receives them — the
      // trimmed stderr and the structured diagnostics included. A receipt that
      // described something other than the response would be worse than none.
      const signingKey = receiptSigningKey();
      if (signingKey) result.receipt = mintReceipt(job, result, signingKey);

      return reply.code(200).send(result);
    } finally {
      release();
    }
  });
}
