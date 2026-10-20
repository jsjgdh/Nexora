import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecuteResponse } from "@nexora/contracts";
import type { ValidatedJob } from "../validate.js";
import { CPU_BUDGET_MULTIPLIER, runBounded, type RunBound } from "./bounds.js";

/* Subprocess runner: executes validated jobs as a child process with
   - a private temp working directory (always cleaned up, even on crashes),
   - a scrubbed environment (no secrets, no user env leak in),
   - a hard wall-clock bound and a CPU budget, both enforced against the
     whole process tree and reported as the bound that stopped the run,
   - capped output (truncation flagged, never unbounded memory).
   This is the single-tenant/dev runner. Multi-tenant production uses the
   docker runner (runners/docker.ts) with cgroup limits + no network. */

/**
 * A run's answer, plus the bound that stopped it.
 *
 * `timedOut` says the wall clock ran out; `bound` says which bound it was,
 * so a caller can tell a hang (wall) from a build that burned the CPU
 * budget (cpu) without reading the wall clock's answer twice.
 */
export interface BoundedExecuteResponse extends ExecuteResponse {
  bound: RunBound | null;
}

/**
 * A minimal environment for learner code, plus hermetic Go settings.
 *
 * Go needs a writable HOME/GOCACHE or it fails in confusing ways, and it must
 * never reach the network to fetch a toolchain (GOTOOLCHAIN=local). Caches go
 * to disk in production: `EXECUTION_GO_CACHE` points at a prewarmed directory so
 * the first compile of the standard library is not paid by every learner.
 * Cross-tenant cache sharing is a deliberate, documented tradeoff — cache keys
 * are content-addressed, so poisoning needs a hash collision. Leaving it unset
 * gives each job a private cache: safer, slower, always correct.
 *
 * GOMAXPROCS is pinned to 2, as in the docker tier. A build that spreads over
 * every core of a many-core host is a build that can burn the whole machine
 * inside one job, and the CPU budget in bounds.ts is only meaningful when
 * the number of cores a build may use is bounded.
 */
function scrubbedEnv(job: ValidatedJob, workdir: string): NodeJS.ProcessEnv {
  const keep = new Set(["PATH", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "HOME", "LANG", "LC_ALL"]);
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (keep.has(k.toUpperCase()) && v !== undefined) out[k] = v;
  }
  out.NODE_ENV = "sandbox";
  if (job.language === "go") {
    out.HOME = workdir;
    out.GOCACHE = process.env.EXECUTION_GO_CACHE || join(workdir, ".gocache");
    out.GOPATH = join(workdir, ".gopath");
    out.GOFLAGS = "-mod=mod";
    out.GOMAXPROCS = "2";
    // No toolchain downloads: the network is off anyway, and this turns a
    // would-be hang into an immediate, legible error.
    out.GOTOOLCHAIN = "local";
    out.CGO_ENABLED = "0";
  }
  return out;
}

export async function runSubprocess(job: ValidatedJob): Promise<BoundedExecuteResponse> {
  const started = Date.now();
  const workdir = await mkdtemp(join(tmpdir(), "nexora-exec-"));
  const cap = job.outputKb * 1024;
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let stdoutLen = 0;
  let stderrLen = 0;
  const push = (which: "out" | "err", chunk: string) => {
    if (which === "out") {
      if (stdoutLen + chunk.length > cap) {
        truncated = true;
        stdout += chunk.slice(0, Math.max(0, cap - stdoutLen));
        stdoutLen = cap;
      } else {
        stdout += chunk;
        stdoutLen += chunk.length;
      }
    } else {
      if (stderrLen + chunk.length > cap) {
        truncated = true;
        stderr += chunk.slice(0, Math.max(0, cap - stderrLen));
        stderrLen = cap;
      } else {
        stderr += chunk;
        stderrLen += chunk.length;
      }
    }
  };

  try {
    for (const f of job.files) {
      const parts = f.path.split("/");
      if (parts.length > 1) await mkdir(join(workdir, ...parts.slice(0, -1)), { recursive: true });
      await writeFile(join(workdir, f.path), f.content, "utf8");
    }

    /* Both bounds are enforced against the child and everything it starts,
       and the answer waits for the kill to land. The wall budget is the
       deadline the validation layer already capped; the CPU budget is a
       multiple of it, so a program that stays on one core is never killed for
       CPU and a build that spreads over the cores is. */
    const result = await runBounded({
      command: job.command[0],
      args: job.command.slice(1),
      cwd: workdir,
      env: scrubbedEnv(job, workdir),
      wallMs: job.timeoutMs,
      cpuMs: job.timeoutMs * CPU_BUDGET_MULTIPLIER,
      stdin: job.stdin,
      onStdout: (d) => push("out", d.toString("utf8")),
      onStderr: (d) => push("err", d.toString("utf8")),
    });

    return {
      stdout,
      stderr,
      exitCode: result.code,
      timedOut: result.bound === "wall",
      bound: result.bound,
      truncated,
      durationMs: Date.now() - started,
      runner: "subprocess",
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
