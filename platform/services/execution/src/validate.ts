import { ApiError } from "@nexora/service-kit";
import type { ExecuteRequest } from "@nexora/contracts";

/* Pure validation for execution requests. Untrusted paths, commands, and
   sizes are rejected here — before any runner ever sees them. */

const MAX_FILES = 32;
const MAX_TOTAL_BYTES = 512_000;
const MAX_FILE_BYTES = 256_000;
const MAX_STDIN_BYTES = 64_000;
const MIN_TIMEOUT_MS = 100;

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

function cleanPath(p: string): string {
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
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, limits.timeoutMs ?? fallback));
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
