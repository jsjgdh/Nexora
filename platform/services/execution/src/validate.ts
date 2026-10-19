import { ApiError } from "@nexora/service-kit";
import type { ExecuteRequest } from "@nexora/contracts";

/* Pure validation for execution requests. Untrusted paths, commands, and
   sizes are rejected here — before any runner ever sees them. */

const MAX_FILES = 32;
const MAX_TOTAL_BYTES = 512_000;
const MAX_FILE_BYTES = 256_000;
const MAX_STDIN_BYTES = 64_000;
const MIN_TIMEOUT_MS = 100;

/* Compile-time abuse bounds.
   Submission size alone does not bound what a Go compile can cost: `go run`
   type-checks and compiles every package in the import graph, so a small file
   count with a deep dependency chain still burns CPU and wall clock at build
   time — a phase the single run-time deadline does not describe. These bounds
   are rejected here, before any runner sees the job, and are the pure,
   pre-runner half of the abuse story; the docker tier's cgroup caps are the
   enforced half. */

/** A learner submission imports packages, never writes them. This is the
    practical ceiling on how deep the type-check can go before the job is not a
    learner's submission but a compile workload. */
export const MAX_GO_IMPORTS = 40;

/** Wall-clock ceiling for a single run. The docker tier additionally caps CPU
    at 0.5 and memory per job; this is the pre-runner bound that keeps a
    runaway build inside a predictable window on any tier. */
export const MAX_COMPILE_MS = 20_000;

/** Counts import specs across every `.go` file in a submission — single-line
    `import "x"` and block `import ( ... )` forms alike. Blank (`_`), named, and
    dot imports each count once: the bound is on graph shape, not on how the
    import is written. */
export function countGoImports(files: { path: string; content: string }[]): number {
  let n = 0;
  for (const f of files) {
    if (!f.path.endsWith(".go")) continue;
    // Block form: capture the parens, then count the quoted spec lines.
    const block = f.content.match(/import\s*\(([\s\S]*?)\)/g) ?? [];
    for (const b of block) n += (b.match(/"[^"]+"/g) ?? []).length;
    // Single-line form, after removing block form so it is not double-counted.
    const withoutBlocks = f.content.replace(/import\s*\(([\s\S]*?)\)/g, "");
    n += (withoutBlocks.match(/^import\s+(?:\w+\s+)?"[^"]+"/gm) ?? []).length;
  }
  return n;
}

const ALLOWLIST: Record<string, string[]> = {
  node: ["node"],
  python: ["python3", "python"],
  // Only the `go` driver is allowed. `go` never needs a shell, and one
  // subcommand set (`run`, `build`, `version`) covers everything we do.
  go: ["go"],
};

/** Per-language default wall clock. Compiling Go costs more than running a
    script, and a cold build cache is the common case for a new learner. */
export const DEFAULT_TIMEOUT_BY_LANGUAGE: Record<string, number> = {
  node: 8000,
  python: 8000,
  go: 20_000,
};

/** Wall clock is capped here, belt-and-braces with the runner's own deadline. */
export const MAX_TIMEOUT_MS = 30_000;

export type Language = "node" | "python" | "go";

export interface ValidatedJob {
  language: Language;
  files: { path: string; content: string }[];
  command: string[];
  stdin: string;
  timeoutMs: number;
  memoryMb: number;
  outputKb: number;
}

/** Exported for the attestation route, which validates learner paths the same way. */
export function cleanPath(p: string): string {
  // Reject absolute paths, parent escapes, drive letters, null bytes.
  if (p.includes("\0")) throw new ApiError(400, "bad_request", "Invalid file path.");
  const norm = p.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) {
    throw new ApiError(400, "bad_request", `Absolute paths are not allowed: ${p}`);
  }
  const parts = norm.split("/").filter((s) => s.length > 0);
  if (parts.length === 0 || parts.some((s) => s === "." || s === "..")) {
    throw new ApiError(400, "bad_request", `Invalid file path: ${p}`);
  }
  if (parts.some((s) => s.length > 120)) {
    throw new ApiError(400, "bad_request", `Path segment too long: ${p}`);
  }
  return parts.join("/");
}

export function validateJob(body: ExecuteRequest): ValidatedJob {
  if (body.files.length === 0 || body.files.length > MAX_FILES) {
    throw new ApiError(400, "bad_request", `Between 1 and ${MAX_FILES} files are required.`);
  }
  let total = 0;
  const seen = new Set<string>();
  const files = body.files.map((f) => {
    const path = cleanPath(f.path);
    if (seen.has(path)) throw new ApiError(400, "bad_request", `Duplicate file path: ${path}`);
    seen.add(path);
    const bytes = Buffer.byteLength(f.content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new ApiError(400, "bad_request", `File too large: ${path}`);
    total += bytes;
    return { path, content: f.content };
  });
  if (total > MAX_TOTAL_BYTES) throw new ApiError(400, "bad_request", "Submission too large.");
  const stdin = body.stdin ?? "";
  if (Buffer.byteLength(stdin, "utf8") > MAX_STDIN_BYTES) {
    throw new ApiError(400, "bad_request", "stdin too large.");
  }
  const allowed = ALLOWLIST[body.language];
  const command = body.command ?? defaultCommand(body.language, files.map((f) => f.path));

  /* Compile abuse bounds, before any runner sees the job. A Go submission's
     cost is its import graph, not its file count: `go run` type-checks every
     package in that graph, so a deep chain is a compile workload wearing a
     learner's submission as a disguise. Reject the shape here rather than let
     a runner eat the wall clock discovering it. Total source size is already
     bounded for every language above (MAX_TOTAL_BYTES); what is missing is
     this shape bound. */
  if (body.language === "go") {
    const imports = countGoImports(files);
    if (imports > MAX_GO_IMPORTS) {
      throw new ApiError(
        400,
        "bad_request",
        `Submission imports ${imports} packages; the limit is ${MAX_GO_IMPORTS}.`
      );
    }
  }
  if (command.length === 0 || !allowed.includes(command[0])) {
    throw new ApiError(400, "bad_request", `Command not allowed for ${body.language}.`);
  }
  // No argument may reach outside the submission directory: no absolute paths,
  // no parent traversal, no null bytes. The first argument is already
  // allowlisted; this closes the same door for the rest of the argv, which is
  // exactly where `node ../..` or `go run /etc/passwd` would try to slip in.
  if (
    command.some(
      (a) =>
        a.includes("\0") ||
        a.length > 200 ||
        a.startsWith("/") ||
        a.startsWith("\\") ||
        /^[a-zA-Z]:/.test(a) ||
        a.split(/[/\\]/).includes("..")
    )
  ) {
    throw new ApiError(400, "bad_request", "Invalid command argument.");
  }
  const limits = body.limits ?? {};
  const fallback = DEFAULT_TIMEOUT_BY_LANGUAGE[body.language] ?? 8000;
  // Every language faces the generic wall-clock cap; a Go job faces the tighter
  // compile budget instead, because its deadline covers a compile as well as a
  // run and the generic ceiling would let a learner buy a longer build than any
  // learner submission needs. A `go` request that asks for more than the
  // compile budget is not answered with a longer build.
  const ceiling = body.language === "go" ? MAX_COMPILE_MS : MAX_TIMEOUT_MS;
  const timeoutMs = Math.min(ceiling, Math.max(MIN_TIMEOUT_MS, limits.timeoutMs ?? fallback));
  return {
    language: body.language,
    files,
    command,
    stdin,
    timeoutMs,
    memoryMb: Math.min(1024, Math.max(16, limits.memoryMb ?? 128)),
    outputKb: Math.min(1024, Math.max(1, limits.outputKb ?? 64)),
  };
}

function defaultCommand(language: string, paths: string[]): string[] {
  if (language === "go") {
    if (paths.includes("main.go")) return ["go", "run", "main.go"];
    return ["go", "run", paths.find((p) => p.endsWith(".go")) ?? paths[0]];
  }
  if (language === "node") {
    if (paths.includes("main.js")) return ["node", "main.js"];
    if (paths.includes("index.js")) return ["node", "index.js"];
    const first = paths.find((p) => p.endsWith(".js")) ?? paths[0];
    return ["node", first];
  }
  if (paths.includes("main.py")) return ["python3", "main.py"];
  const first = paths.find((p) => p.endsWith(".py")) ?? paths[0];
  return ["python3", first];
}
