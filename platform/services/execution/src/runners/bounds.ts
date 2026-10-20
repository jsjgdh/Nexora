import { execFile, spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { platform } from "node:os";

/* Bounds on a run: how long it may take, how much CPU it may burn, and what
   happens when either is exceeded.
   The rule this file exists to keep: a bound that trips must leave nothing
   running. A timer that resolves a promise while the child keeps burning CPU
   is not a bound, it is a comment — the request is answered and the machine
   is still busy. So every trip here kills the whole process tree and waits
   for the kill to land before the answer goes out. */

/** Which bound stopped a run. */
export type RunBound = "wall" | "cpu";

/**
 * The CPU budget, as a multiple of the wall budget.
 *
 * A program that stays inside its wall clock on one core can never exceed
 * this: one core for one wall-second is one CPU-second, and the budget is
 * three times the wall. So a single-threaded learner program is never killed
 * for CPU, and the bound that bites is the one meant to: work that spreads
 * across cores, which is what a runaway build does. Three, not one, so that
 * the two-core build the Go toolchain is pinned to (GOMAXPROCS=2) has room
 * inside the budget instead of racing the wall clock.
 */
export const CPU_BUDGET_MULTIPLIER = 3;

export interface BoundedRun {
  /** The child's exit code, or null when a bound stopped it. */
  code: number | null;
  /** The bound that stopped the run, or null when the program finished. */
  bound: RunBound | null;
}

export interface RunBoundedOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** The wall-clock budget in milliseconds. */
  wallMs: number;
  /** The CPU budget for the whole process tree, in milliseconds of CPU time. */
  cpuMs: number;
  /** Written to the child's stdin, which is then closed. */
  stdin?: string;
  onStdout(chunk: Buffer): void;
  onStderr(chunk: Buffer): void;
}

/** Kill a process and everything it started. */
export async function killTree(pid: number | undefined): Promise<void> {
  if (!pid) return;
  if (platform() === "win32") {
    // taskkill /T walks the tree, /F is the hard stop. Killing only the
    // direct child would leave the grandchildren (a compiler, a helper the
    // learner program started) running with nobody waiting for them.
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
    return;
  }
  // The child was started as its own process group, so the negative pid
  // reaches every process in the tree.
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Run a child under both bounds.
 *
 * The wall clock is ours to enforce. The CPU budget is enforced from the
 * operating system's own counters: on Linux from /proc, on Windows from the
 * process table. Where neither is available the CPU budget cannot be
 * measured, and the run continues under the wall clock alone — the answer
 * says so, rather than pretending a CPU bound was in force.
 */
export async function runBounded(opts: RunBoundedOptions): Promise<BoundedRun> {
  const isWindows = platform() === "win32";
  const child = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    // POSIX only: a new process group, so the tree can be killed as one.
    detached: !isWindows,
  });

  let bound: RunBound | null = null;
  let settled = false;
  let killInFlight: Promise<void> | null = null;

  const trip = (b: RunBound): void => {
    if (settled || bound !== null) return;
    bound = b;
    killInFlight = killTree(child.pid);
  };

  const wallTimer = setTimeout(() => trip("wall"), opts.wallMs);
  wallTimer.unref?.();

  const sampler = startCpuSampler(child.pid, opts.cpuMs, () => trip("cpu"));

  child.stdout.on("data", (d: Buffer) => opts.onStdout(d));
  child.stderr.on("data", (d: Buffer) => opts.onStderr(d));

  const result = await new Promise<BoundedRun>((resolve) => {
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      sampler.stop();
      // The answer waits for the kill to land: a bound that trips while the
      // tree is still running would answer the request and leave the machine
      // busy, which is the thing the bound exists to prevent.
      void (async () => {
        if (killInFlight) await killInFlight;
        resolve({ code: bound ? null : code, bound });
      })();
    };
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));
    try {
      if (opts.stdin) child.stdin.write(opts.stdin);
      child.stdin.end();
    } catch {
      /* stdin already closed */
    }
  });

  return result;
}

/* ---------- CPU accounting ---------- */

interface CpuSampler {
  stop(): void;
}

/** How often the tree's CPU time is read. */
const SAMPLE_INTERVAL_MS = 500;

function startCpuSampler(
  pid: number | undefined,
  budgetMs: number,
  onTrip: () => void
): CpuSampler {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  if (!pid || !Number.isFinite(budgetMs) || budgetMs <= 0) return { stop: () => undefined };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const used = await treeCpuMs(pid);
    if (!stopped && used !== null && used >= budgetMs) {
      onTrip();
      return;
    }
    if (!stopped) timer = setTimeout(() => void tick(), SAMPLE_INTERVAL_MS);
  };
  timer = setTimeout(() => void tick(), SAMPLE_INTERVAL_MS);
  timer.unref?.();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * The CPU time the process tree rooted at `rootPid` has used, in
 * milliseconds, or null when the platform cannot say.
 */
export async function treeCpuMs(rootPid: number): Promise<number | null> {
  try {
    if (platform() === "linux") return await linuxTreeCpuMs(rootPid);
    if (platform() === "win32") return await windowsTreeCpuMs(rootPid);
  } catch {
    /* fall through: an unreadable counter is an unknown counter */
  }
  return null;
}

/* Linux: /proc. The root's own counters plus the counters of the processes
   it started, plus the counters of the children it already reaped (the
   cutime/cstime fields), so a build's short-lived compiler processes are
   counted whether or not they are still alive when the counter is read. */
const USER_HZ = 100;

async function linuxTreeCpuMs(rootPid: number): Promise<number | null> {
  const pids = await linuxDescendants(rootPid);
  let ticks = 0;
  for (const pid of pids) {
    const t = await linuxProcTicks(pid);
    if (t !== null) ticks += t;
  }
  return (ticks * 1000) / USER_HZ;
}

async function linuxProcTicks(pid: number): Promise<number | null> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    // The comm field may contain spaces and parentheses, so the numeric
    // fields start after the last ")".
    const close = stat.lastIndexOf(")");
    if (close < 0) return null;
    const fields = stat.slice(close + 2).split(" ");
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    const cutime = Number(fields[13]);
    const cstime = Number(fields[14]);
    if (![utime, stime, cutime, cstime].every((n) => Number.isFinite(n))) return null;
    return utime + stime + cutime + cstime;
  } catch {
    return null;
  }
}

async function linuxDescendants(rootPid: number): Promise<number[]> {
  const seen = new Set<number>([rootPid]);
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.pop() as number;
    let children = "";
    try {
      for (const tid of await readdir(`/proc/${pid}/task`)) {
        children += ` ${await readFile(`/proc/${pid}/task/${tid}/children`, "utf8")}`;
      }
    } catch {
      continue;
    }
    for (const kid of children.split(/\s+/).filter(Boolean)) {
      const n = Number(kid);
      if (Number.isFinite(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return [...seen];
}

/* Windows: the process table. One query per sample reads every process with
   its parent and its kernel and user time, and the tree is walked from the
   root. The reading is a floor, not a ceiling: a process that exits between
   two samples is not counted, so short-lived helpers are undercounted here.
   The kernel-enforced CPU cap lives in the docker tier (a cgroup), which is
   the tier production runs. */
const WINDOWS_CPU_QUERY =
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,KernelModeTime,UserModeTime | ConvertTo-Json -Compress";

async function windowsTreeCpuMs(rootPid: number): Promise<number | null> {
  const out = await new Promise<string>((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-Command", WINDOWS_CPU_QUERY],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch {
    return null;
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as {
    ProcessId?: number;
    ParentProcessId?: number;
    KernelModeTime?: number;
    UserModeTime?: number;
  }[];
  const children = new Map<number, number[]>();
  const cpuOf = new Map<number, number>();
  for (const r of rows) {
    const pid = Number(r.ProcessId);
    const parent = Number(r.ParentProcessId);
    if (!Number.isFinite(pid) || !Number.isFinite(parent)) continue;
    const list = children.get(parent) ?? [];
    list.push(pid);
    children.set(parent, list);
    // 100-nanosecond units.
    cpuOf.set(pid, (Number(r.KernelModeTime) || 0) + (Number(r.UserModeTime) || 0));
  }
  let total = 0;
  const seen = new Set<number>();
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += cpuOf.get(pid) ?? 0;
    for (const kid of children.get(pid) ?? []) stack.push(kid);
  }
  return total / 10_000;
}
