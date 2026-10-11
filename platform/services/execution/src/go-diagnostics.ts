import type { ExecDiagnostic } from "@nexora/contracts";

/* Turns Go's stderr into structured diagnostics.
 *
 * Go's two phases produce two unmistakably different shapes, and the shape is
 * how we tell them apart — no second process, no guessing:
 *
 *   compile failure (the program never ran):
 *     # command-line-arguments
 *     ./main.go:4:2: undefined: fmt
 *
 *   runtime failure (it ran and died):
 *     panic: runtime error: index out of range [5] with length 3
 *
 *     goroutine 1 [running]:
 *     main.main()
 *         /tmp/nexora-exec-abc/main.go:6 +0x25
 *     exit status 2
 *
 * Both carry file/line, which is exactly what the editor needs to point at the
 * mistake. Pure function: no I/O, no clock, no environment — fully unit-tested.
 */

/** `main.go:4:2: message` (with or without `./`, column optional). */
const COMPILE_LINE = /^(?:\.\/)?([^\s:]+\.go):(\d+)(?::(\d+))?:\s+(.+)$/;
/** A stack frame's file reference: `\t/tmp/x/main.go:6 +0x25` */
const FRAME_LINE = /^\s+(\S*?([^/\s:]+\.go)):(\d+)/;
const PANIC_LINE = /^panic:\s*(.+)$/;
/** `# command-line-arguments` — the header Go prints above compile errors. */
const PACKAGE_HEADER = /^#\s+(\S+)/;

const MAX_DIAGNOSTICS = 50;

/** Learner-facing file name: strip any `./` or absolute directory prefix. */
function normalizeFile(raw: string): string {
  const clean = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

export function parseGoDiagnostics(stderr: string): ExecDiagnostic[] {
  const out: ExecDiagnostic[] = [];
  const seen = new Set<string>();
  const push = (d: ExecDiagnostic) => {
    const key = `${d.kind}|${d.file ?? ""}|${d.line ?? ""}|${d.column ?? ""}|${d.message}`;
    if (seen.has(key) || out.length >= MAX_DIAGNOSTICS) return;
    seen.add(key);
    out.push(d);
  };

  const lines = stderr.split(/\r?\n/);

  // Compile diagnostics first: they are unambiguously identifiable.
  for (const line of lines) {
    const m = COMPILE_LINE.exec(line);
    if (!m) continue;
    // `# pkg` and any other header lines are context, not diagnostics.
    if (PACKAGE_HEADER.test(line)) continue;
    push({
      kind: "compile",
      file: normalizeFile(m[1]),
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : null,
      message: m[4].trim(),
    });
  }
  if (out.length > 0) return out;

  // Then runtime: a panic with the first frame that points into learner code.
  const panicIndex = lines.findIndex((l) => PANIC_LINE.test(l));
  if (panicIndex !== -1) {
    const message = PANIC_LINE.exec(lines[panicIndex]!)?.[1]?.trim() ?? "panic";
    let file: string | null = null;
    let line: number | null = null;
    for (let i = panicIndex + 1; i < lines.length; i += 1) {
      const f = FRAME_LINE.exec(lines[i]!);
      if (f) {
        file = normalizeFile(f[2]!);
        line = Number(f[3]);
        break;
      }
    }
    push({ kind: "runtime", file, line, column: null, message });
  }

  return out;
}

/**
 * Which phase the run reached.
 *
 * A compile diagnostic means the program never executed, and the product says
 * so — "the compiler stopped this before it ran" is a different lesson from
 * "it ran and crashed", and conflating them teaches the wrong thing.
 */
export function goPhase(diagnostics: ExecDiagnostic[]): "compile" | "run" {
  return diagnostics.some((d) => d.kind === "compile") ? "compile" : "run";
}

/**
 * The stderr a learner should read.
 *
 * `go run` appends `exit status N` when the *program* exits non-zero, which
 * reads as noise next to a real panic. Structured diagnostics already carry the
 * meaning, so the line is dropped — but only when we found diagnostics to
 * replace it with, never to hide output we could not explain.
 */
export function trimGoStderr(stderr: string, diagnostics: ExecDiagnostic[]): string {
  if (diagnostics.length === 0) return stderr;
  return stderr
    .split(/\r?\n/)
    .filter((l) => !/^exit status \d+$/.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
