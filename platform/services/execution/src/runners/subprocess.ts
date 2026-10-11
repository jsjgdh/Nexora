import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecuteResponse } from "@nexora/contracts";
import type { ValidatedJob } from "../validate.js";

/* Subprocess runner: executes validated jobs as a child process with
   - a private temp working directory (always cleaned up, even on crashes),
   - a scrubbed environment (no secrets, no user env leak in),
   - hard wall-clock timeout (SIGKILL, reported as timedOut, not failure),
   - capped output (truncation flagged, never unbounded memory).
   This is the single-tenant/dev runner. Multi-tenant production uses the
   docker runner (runners/docker.ts) with cgroup limits + no network. */

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
    // No toolchain downloads: the network is off anyway, and this turns a
    // would-be hang into an immediate, legible error.
    out.GOTOOLCHAIN = "local";
    out.CGO_ENABLED = "0";
  }
  return out;
}

export async function runSubprocess(job: ValidatedJob): Promise<ExecuteResponse> {
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

    const result = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
        const child = spawn(job.command[0], job.command.slice(1), {
          cwd: workdir,
          env: scrubbedEnv(job, workdir),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        let settled = false;
        // Single hard deadline owned here: spawn's own timeout option is
        // deliberately NOT used so a timeout can never be misreported.
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
          resolve({ code: null, timedOut: true });
        }, job.timeoutMs);
        timer.unref?.();
        child.stdout.on("data", (d: Buffer) => push("out", d.toString("utf8")));
        child.stderr.on("data", (d: Buffer) => push("err", d.toString("utf8")));
        child.on("error", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code: null, timedOut: false });
        });
        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code, timedOut: false });
        });
        try {
          if (job.stdin) child.stdin.write(job.stdin);
          child.stdin.end();
        } catch {
          /* stdin already closed */
        }
      }
    );

    return {
      stdout,
      stderr,
      exitCode: result.code,
      timedOut: result.timedOut,
      truncated,
      durationMs: Date.now() - started,
      runner: "subprocess",
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
