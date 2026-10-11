import type { Mission, RunLanguage } from "./types";

/* The execution router.
 *
 * Learner work is executed by one of two runtimes, and the choice is made here
 * rather than by whichever code path a component happens to call:
 *
 *   browser — documents, stylesheets and sandboxed JavaScript. The learner's own
 *             machine does the work, so it costs nothing per attempt, works
 *             offline, and answers instantly. This is the default.
 *
 *   server  — anything needing a real toolchain, OS features, or grading the
 *             client cannot be trusted to decide. A compiled language has no
 *             in-page runtime, so Go routes here. The server side is pluggable
 *             (a local sandbox, or a container per job) — the client never
 *             needs to know which.
 *
 * Why the decision is data, not a pile of `if`s spread through components:
 * the same question — "where does this run, and why?" — is asked by the
 * workspace, the checks panel, and the tests, and a learner deserves the same
 * answer from all three. `chooseRuntime` is pure, so the whole table is
 * verifiable without a browser or a server.
 */

/** The kind of work being executed, in the router's vocabulary. */
export type WorkKind =
  /** A document the browser renders and we inspect: HTML, CSS. */
  | "document"
  /** Sandboxed page behaviour: the harness drives it in an opaque iframe. */
  | "page-script"
  /** A program or a test suite that must execute: needs a real machine. */
  | "executable";

export type Runtime = "browser" | "server";

export interface ExecutionNeed {
  kind: WorkKind;
  /** Which language executes, when this need is executable work. */
  language: RunLanguage;
  /**
   * The verdict must be decided by a machine the learner does not control —
   * hidden tests, timing, or anything a spoofed observation could fake.
   */
  trustedGrading: boolean;
  /** Needs a filesystem, processes, or a network the browser cannot provide. */
  needsOsFeatures: boolean;
}

export interface ExecutionEnvironment {
  /** A platform runner is configured and (we believe) reachable. */
  serverConfigured: boolean;
  /** The sandbox harness can run here (needs iframes + message passing). */
  browserCapable: boolean;
}

export interface RuntimeDecision {
  /** Where this work *should* run. */
  runtime: Runtime;
  /** Whether that runtime can actually take it right now. */
  available: boolean;
  /** One sentence a learner could read, saying where and why. */
  reason: string;
  /** What will run it instead when `available` is false. */
  fallback: Runtime | null;
}

/**
 * Why the browser cannot be the machine for executable work, per language.
 *
 * A Go program needs a compiler. A scenario's test suite could technically run
 * in a tab, but then the *learner's* machine would be grading the learner — the
 * suite has to run somewhere they cannot edit, which is also why the fixture
 * files travel from the mission rather than from their editor.
 */
export const EXECUTION_REASON: Record<RunLanguage, string> = {
  go: "Go is compiled, and a browser tab has no compiler: Go runs on the server runner, in a sandbox",
  node: "the tests have to run where they cannot be edited: they run on the server runner, in a sandbox",
};

/** The name of what the server provides, for sentences about the runner. */
export function toolchainName(language: RunLanguage | null | undefined): string {
  return language === "go" ? "the Go toolchain" : "the machine that runs these tests";
}

/** Why the browser is not the answer for OS-level work — stated once. */
const OS_REASON = "this task needs a real machine — a process, a filesystem, or a socket";

export function chooseRuntime(
  need: ExecutionNeed,
  env: ExecutionEnvironment
): RuntimeDecision {
  const server = env.serverConfigured;
  const browser = env.browserCapable;

  // OS features are the first hard boundary: nothing in a tab can fork a
  // process, read a file, or open a socket the page was not given.
  if (need.needsOsFeatures) {
    return server
      ? {
          runtime: "server",
          available: true,
          reason: OS_REASON,
          fallback: null,
        }
      : {
          runtime: "server",
          available: false,
          reason: "this task needs a real machine, and no server runner is connected",
          fallback: null,
        };
  }

  // A compiled program has no browser runtime. Go compiled to WASM exists, but
  // the toolchains that fit in a tab (TinyGo) implement a *subset* of the
  // language: teaching that as "Go" would teach something that fails on the real
  // toolchain. The honest route is the server, and the mission says so.
  if (need.kind === "executable") {
    const why = EXECUTION_REASON[need.language];
    return server
      ? { runtime: "server", available: true, reason: why, fallback: null }
      : {
          runtime: "server",
          available: false,
          reason: `${toolchainName(need.language)} needs ${
            need.language === "go" ? "a compiler" : "a real machine"
          }, and no server runner is connected here`,
          fallback: null,
        };
  }

  // Trusted grading is the one case where a working browser runtime is not
  // enough: if the verdict must be tamper-resistant, the machine that decides
  // cannot be the learner's.
  if (need.trustedGrading) {
    return server
      ? {
          runtime: "server",
          available: true,
          reason: "this result is graded server-side, so the decision cannot be influenced locally",
          fallback: browser ? "browser" : null,
        }
      : {
          runtime: "browser",
          available: browser,
          reason:
            "no server grading is connected, so this runs in your browser and is recorded as self-assessed",
          fallback: null,
        };
  }

  // Default: the learner's own machine. No per-attempt compute cost, and it
  // keeps working with no network.
  if (!browser) {
    return server
      ? {
          runtime: "server",
          available: true,
          reason: "this browser cannot sandbox the page, so the work is run server-side instead",
          fallback: null,
        }
      : {
          runtime: "browser",
          available: false,
          reason: "this browser cannot sandbox the page, and no server runner is connected",
          fallback: null,
        };
  }

  return {
    runtime: "browser",
    available: true,
    reason: "runs in your browser — no server round trip, and no compute cost per attempt",
    fallback: null,
  };
}

/**
 * Derive the need from a mission, so components never re-decide it.
 * A mission is `compiled-program` when any of its checks executes code; it needs
 * trusted grading when a check reads behaviour a spoofed client could fake (the
 * scripted harness) and the mission is a graded challenge.
 */
export function needForMission(mission: Mission): ExecutionNeed {
  const run = mission.checks.find((c) => c.rule.kind === "runs");
  const scripted = mission.checks.some((c) => c.rule.kind === "scripted");
  return {
    kind: run ? "executable" : scripted ? "page-script" : "document",
    // Every execution check on a mission runs the same submission, so the first
    // one names the language. A mission with no execution check has none.
    language: run && run.rule.kind === "runs" ? run.rule.language : "go",
    trustedGrading: false,
    needsOsFeatures: false,
  };
}

/** How the chosen runtime is named in the interface. */
export const RUNTIME_LABEL: Record<Runtime, string> = {
  browser: "in your browser",
  server: "on the runner",
};

/** Names the concrete server provider when the runner reports one. */
export function providerLabel(runner: string | null | undefined): string | null {
  if (!runner) return null;
  if (runner === "docker") return "sandboxed containers";
  if (runner === "subprocess") return "local sandbox";
  return runner;
}
