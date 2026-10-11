import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecuteResponse } from "@nexora/contracts";
import type { ValidatedJob } from "../validate.js";

/* Docker runner (multi-tenant production tier): each job runs in a fresh
   `node:22-alpine` (or python)   container with cgroup limits, no network, a
   read-only root filesystem, and guaranteed removal.
   - Go jobs need writable + executable /tmp (build cache and the compiled
     binary), so their tmpfs drops `noexec` and grows. The container is still
     networkless, read-only at the root, and capped.
   - Requires a Docker daemon + the runtime image. Without them the service
     reports 503 (see dockerAvailable) instead of silently downgrading.
   - Deliberately shells out to the `docker` CLI (no client dependency):
     fewer moving parts, every flag auditable below.
   - The compose file does NOT mount docker.sock (container escape via the
     socket is a real risk). Run this tier only on hosts you control, or
     move it to dedicated workers. */

/* The Go image is built from this repo (images/go-runner) rather than pulled:
   it carries a prewarmed standard-library build cache, which is the difference
   between a learner waiting ~10s and ~1s for their first program. Build it with
   `docker build -t nexora-go-runner:1 images/go-runner` before enabling
   EXECUTION_RUNNER=docker.

   Two deliberate differences from the interpreter jobs, both about Go:
   - No `--read-only` for Go. Go must write compiled objects to its build cache,
     and a read-only root would discard the prewarm (or fail the build). Writes
     land in the container's own layer, which `--rm` destroys with the job, so
     nothing persists. The isolation that matters is kept — no network, dropped
     capabilities, no privilege escalation, cgroup caps, and a discarded
     filesystem.
   - No GOCACHE override, so the image's prewarmed cache is actually used.
     Pointing EXEC_IMAGES.go at a plain `golang:alpine` still works; it is just
     slower on every job, which the operator chooses knowingly. */
export const EXEC_IMAGES: Record<string, string> = {
  node: "node:22-alpine",
  python: "python:3.12-alpine",
  go: "nexora-go-runner:1",
};

/** Pure arg construction — unit-tested without a daemon. */
export function buildDockerArgs(job: ValidatedJob, workdir: string): string[] {
  const image = EXEC_IMAGES[job.language];
  // Go compiles a binary and runs it, so /tmp must be writable AND executable;
  // interpreters execute from /work and need neither in /tmp.
  const isGo = job.language === "go";
  // Docker's tmpfs defaults include noexec, so `go run` builds a binary it then
  // cannot execute. `exec` must be requested explicitly.
  const tmpfs = isGo ? "/tmp:rw,exec,size=512m" : "/tmp:rw,noexec,size=64m";
  // Go's toolchain forks: `go build` runs one `compile` per package in
  // parallel, and the count follows GOMAXPROCS. Inside a 0.5-CPU container on a
  // many-core host that is dozens of processes, which the interpreter-sized
  // pids limit rejects with a baffling `resource temporarily unavailable`.
  // Found by running it, not by reading it: the limit is raised and the
  // parallelism pinned so both numbers are predictable.
  const pidsLimit = isGo ? "256" : "64";
  const goEnv = isGo ? ["-e", "GOMAXPROCS=2"] : [];
  return [
    "run",
    "--rm",
    "-i",
    "--network",
    "none",
    "--cpus",
    "0.5",
    "--memory",
    `${job.memoryMb}m`,
    "--memory-swap",
    `${job.memoryMb}m`,
    "--pids-limit",
    pidsLimit,
    // No capabilities, no privilege escalation: nothing in learner code needs
    // them, whatever the language.
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    ...(isGo ? [] : ["--read-only"]),
    "--tmpfs",
    tmpfs,
    ...goEnv,
    "-v",
    `${workdir}:/work:rw`,
    "-w",
    "/work",
    image,
    ...job.command,
  ];
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 5000 }, (err) =>
        err ? reject(err) : resolve()
      );
    });
    return true;
  } catch {
    return false;
  }
}

export async function runDocker(job: ValidatedJob): Promise<ExecuteResponse> {
  const started = Date.now();
  if (!(await dockerAvailable())) {
    throw Object.assign(new Error("Docker daemon unavailable for the docker runner."), {
      status: 503,
      code: "runner_unavailable",
    });
  }
  const hostDir = await mkdtemp(join(tmpdir(), "nexora-dock-"));
  const cap = job.outputKb * 1024;
  let stdout = "";
  let stderr = "";
  let truncated = false;
  const push = (which: "out" | "err", chunk: string, len: { n: number }) => {
    let cur = which === "out" ? stdout : stderr;
    if (len.n + chunk.length > cap) {
      truncated = true;
      cur += chunk.slice(0, Math.max(0, cap - len.n));
      len.n = cap;
    } else {
      cur += chunk;
      len.n += chunk.length;
    }
    if (which === "out") stdout = cur;
    else stderr = cur;
  };
  const outLen = { n: 0 };
  const errLen = { n: 0 };

  try {
    for (const f of job.files) {
      const parts = f.path.split("/");
      if (parts.length > 1) await mkdir(join(hostDir, ...parts.slice(0, -1)), { recursive: true });
      await writeFile(join(hostDir, f.path), f.content, "utf8");
    }
    const result = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
      const child = spawn("docker", buildDockerArgs(job, hostDir), {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill("SIGKILL");
          } catch {
            /* gone */
          }
          resolve({ code: null, timedOut: true });
        }
      }, job.timeoutMs + 2000);
      timer.unref?.();
      child.stdout.on("data", (d: Buffer) => push("out", d.toString("utf8"), outLen));
      child.stderr.on("data", (d: Buffer) => push("err", d.toString("utf8"), errLen));
      child.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ code: null, timedOut: false });
        }
      });
      child.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ code, timedOut: false });
        }
      });
      try {
        if (job.stdin) child.stdin.write(job.stdin);
        child.stdin.end();
      } catch {
        /* closed */
      }
    });
    return {
      stdout,
      stderr,
      exitCode: result.code,
      timedOut: result.timedOut,
      truncated,
      durationMs: Date.now() - started,
      runner: "docker",
    };
  } finally {
    await rm(hostDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
