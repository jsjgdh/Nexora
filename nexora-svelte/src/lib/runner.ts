import { env } from "$env/dynamic/public";
import type { RunLanguage, RunOutcome, RunReceipt } from "./types";

/* Running learner code for real.
 *
 * The browser cannot execute Go: there is no in-page toolchain, and shipping
 * one would either lie about the result or hand the learner a fake compiler.
 * So this module talks to the platform's runner service, which does the work in
 * a sandbox and returns the program's own output — stdout, exit code, and the
 * compiler's diagnostics.
 *
 * Two rules shape everything below:
 *   1. Honesty over convenience. Every way this can fail is a distinct,
 *      plainly-worded state — never a silent "check failed", which would blame
 *      the learner for our infrastructure.
 *   2. Learning never depends on a service. When the runner is unreachable the
 *      mission stays readable and answerable; it just cannot claim the learner
 *      has run code they did not run.
 */

const BASE = ((env.PUBLIC_API_URL as string | undefined) ?? "").replace(/\/$/, "");

/** True when a platform is configured at all (local mode is the default). */
export const runnerConfigured = BASE.length > 0;

export interface RunnerCapabilities {
  runner: string;
  languages: string[];
  concurrency: number;
  defaultTimeoutByLanguage?: Record<string, number>;
  queueDepth?: number;
  dailyQuota?: number;
  dailyRemaining?: number;
}

export interface RunRequest {
  language: RunLanguage;
  files: { path: string; content: string }[];
  entry?: string;
  stdin?: string;
  timeoutMs?: number;
  token?: string;
  signal?: AbortSignal;
  /** Explicit argv. Used when the entry is a fixture (a mission's test suite). */
  command?: string[];
}

/** Default wall clock per language, mirrored from the service's own defaults. */
const DEFAULT_TIMEOUT_MS: Record<RunLanguage, number> = { go: 20_000, node: 10_000 };

/**
 * How each language starts a named file. The service has the same defaults for
 * the common cases (go run main.go, node main.js); a scenario names its entry
 * explicitly, because there the entry is the mission's own test suite rather
 * than the learner's file. Mirrored here so the request says what it means.
 */
const RUN_COMMAND: Record<RunLanguage, (entry: string) => string[]> = {
  go: (entry) => ["go", "run", entry],
  node: (entry) => ["node", entry],
};

/** The command for a run, or undefined to let the service choose its default. */
function commandFor(req: RunRequest): string[] | undefined {
  if (req.command) return req.command;
  return req.entry ? RUN_COMMAND[req.language](req.entry) : undefined;
}

function unavailable(message: string): RunOutcome {
  return {
    ran: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    timedOut: false,
    diagnostics: [],
    phase: null,
    durationMs: null,
    error: message,
    unavailable: true,
  };
}

export async function fetchCapabilities(token?: string): Promise<RunnerCapabilities | null> {
  if (!runnerConfigured) return null;
  try {
    const res = await fetch(`${BASE}/api/execute/capabilities`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as RunnerCapabilities;
  } catch {
    return null;
  }
}

/**
 * Run one program. Never throws: every failure is returned as an outcome whose
 * `error` is written for the learner, and whose `unavailable` flag tells the
 * UI whether the *service* or the *code* is at fault.
 */
export async function execute(req: RunRequest): Promise<RunOutcome> {
  if (!runnerConfigured) {
    return unavailable(
      "Running code needs the online runner, and this build is in local mode. " +
        "Your work is saved — set PUBLIC_API_URL to a running platform to execute it."
    );
  }
  if (!req.token) {
    return unavailable(
      "Running code needs the online runner, which needs an account so a single " +
        "session cannot use unbounded compute. Sign in and press Run again — nothing you " +
        "have written is lost."
    );
  }

  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS[req.language];
  // Give the network and the container their own headroom beyond the program's
  // own wall clock; the service enforces the program's limit regardless.
  const clientDeadline = timeoutMs + 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clientDeadline);
  const onOuterAbort = () => controller.abort();
  req.signal?.addEventListener("abort", onOuterAbort);

  try {
    const res = await fetch(`${BASE}/api/execute/execute`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.token}`,
      },
      body: JSON.stringify({
        language: req.language,
        files: req.files,
        command: commandFor(req),
        stdin: req.stdin ?? "",
        limits: { timeoutMs },
      }),
    });

    if (res.status === 401) {
      return unavailable("Your session expired before the program could run. Sign in again — nothing you have written is lost.");
    }
    if (res.status === 429) {
      const detail = await readMessage(res);
      const quotaHeader = res.headers.get("X-Execution-Daily-Remaining");
      const remainingHeader = quotaHeader === null ? Number.NaN : Number(quotaHeader);
      return {
        ...unavailable(detail ?? "The daily run limit for this account is reached. It resets tomorrow."),
        ...(Number.isInteger(remainingHeader) && remainingHeader >= 0
          ? { quotaRemaining: remainingHeader }
          : {}),
      };
    }
    if (res.status === 503) {
      const detail = await readMessage(res);
      return unavailable(detail ?? `The runner cannot execute ${req.language} right now.`);
    }
    if (!res.ok) {
      const detail = await readMessage(res);
      return unavailable(detail ?? `The runner answered ${res.status}. Nothing you wrote was lost — try again.`);
    }

    const body = (await res.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      timedOut: boolean;
      durationMs: number;
      diagnostics?: RunOutcome["diagnostics"];
      phase?: "compile" | "run";
      /** Present when the service holds a signing key; absent in local mode. */
      receipt?: RunReceipt;
    };
    const quotaHeader = res.headers.get("X-Execution-Daily-Remaining");
    const quotaRemaining = quotaHeader === null ? Number.NaN : Number(quotaHeader);
    return {
      ran: true,
      stdout: body.stdout ?? "",
      stderr: body.stderr ?? "",
      exitCode: body.exitCode ?? null,
      timedOut: !!body.timedOut,
      diagnostics: body.diagnostics ?? [],
      phase: body.phase ?? null,
      durationMs: body.durationMs ?? null,
      ...(Number.isInteger(quotaRemaining) && quotaRemaining >= 0 ? { quotaRemaining } : {}),
      // Carried through untouched: this is the platform's own record of the run,
      // and the only thing the server will accept as evidence that it happened.
      receipt: body.receipt ?? null,
    };
  } catch (err) {
    if (controller.signal.aborted && !req.signal?.aborted) {
      return unavailable(
        `The runner did not answer within ${Math.round(clientDeadline / 1000)}s. Your code is saved; try again.`
      );
    }
    if (req.signal?.aborted) {
      return unavailable("Run cancelled.");
    }
    return unavailable(
      "Could not reach the runner. Check your connection — your code is saved and nothing was recorded."
    );
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** Human messages come from the API envelope: { error: { message } }. */
async function readMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message ?? null;
  } catch {
    return null;
  }
}
