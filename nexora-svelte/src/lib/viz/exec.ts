import type { VizFrame } from "./types";

/* Program execution as frame sequences: source lines plus a stack snapshot
   per step. Language-agnostic — the same shape carries Go, Rust, or JS —
   because a call stack is a call stack. Authors provide steps; the builder
   validates them (line bounds, non-empty stack) so a broken demo fails in
   tests, not in front of a learner. */

export interface TraceVar {
  name: string;
  value: string;
  /** New or changed this step — rendered emphasized. */
  changed?: boolean;
}

export interface TraceScope {
  fn: string;
  vars: TraceVar[];
  /** The innermost (executing) frame. */
  active?: boolean;
}

export interface ExecStep {
  /** 1-based line number into lines. */
  line: number;
  scopes: TraceScope[];
  returned?: { fn: string; value: string } | null;
  caption: string;
}

export interface ExecFrame extends VizFrame {
  line: number;
  scopes: TraceScope[];
  returned: { fn: string; value: string } | null;
}

export function execTrace(lines: string[], steps: ExecStep[]): ExecFrame[] {
  if (lines.length === 0) throw new RangeError("a trace needs source lines");
  if (steps.length === 0) throw new RangeError("a trace needs at least one step");
  return steps.map((s, i) => {
    if (!Number.isInteger(s.line) || s.line < 1 || s.line > lines.length) {
      throw new RangeError(`step ${i}: line ${s.line} is outside 1..${lines.length}`);
    }
    if (s.scopes.length === 0) throw new RangeError(`step ${i}: a step needs at least one scope`);
    if (!s.caption) throw new RangeError(`step ${i}: a step needs a caption`);
    return {
      line: s.line,
      scopes: s.scopes.map((sc, si) => ({
        fn: sc.fn,
        active: sc.active ?? si === s.scopes.length - 1,
        vars: sc.vars.map((v) => ({ ...v })),
      })),
      returned: s.returned ?? null,
      caption: s.caption,
    };
  });
}

export const GO_ADD_LINES = [
  "func main() {",
  "\tn := 5",
  "\ty := addOne(n)",
  "\tprintln(y)",
  "}",
  "",
  "func addOne(x int) int {",
  "\treturn x + 1",
  "}",
];

/** main calls addOne: arguments copy in, return values come back, frames die. */
export function goAddOneDemo(): { lines: string[]; frames: ExecFrame[] } {
  const lines = GO_ADD_LINES;
  const frames = execTrace(lines, [
    {
      line: 1,
      scopes: [{ fn: "main", vars: [] }],
      caption: "Execution starts at main. The stack gains a frame; nothing lives in it yet.",
    },
    {
      line: 2,
      scopes: [{ fn: "main", vars: [{ name: "n", value: "5", changed: true }] }],
      caption: "n becomes 5 — an integer, owned by main's frame.",
    },
    {
      line: 3,
      scopes: [
        { fn: "main", vars: [{ name: "n", value: "5" }] },
        { fn: "addOne", vars: [{ name: "x", value: "5", changed: true }] },
      ],
      caption: "Calling addOne(n) pushes a frame. x is a copy of n — same value, different variable.",
    },
    {
      line: 8,
      scopes: [
        { fn: "main", vars: [{ name: "n", value: "5" }] },
        { fn: "addOne", vars: [{ name: "x", value: "5" }] },
      ],
      caption: "Inside addOne: x + 1 is 6. main cannot see x, and addOne cannot see n.",
    },
    {
      line: 3,
      scopes: [{ fn: "main", vars: [{ name: "n", value: "5" }] }],
      returned: { fn: "addOne", value: "6" },
      caption: "addOne returns 6 and its frame is gone — x along with it. Return values outlive frames; locals do not.",
    },
    {
      line: 3,
      scopes: [{ fn: "main", vars: [{ name: "n", value: "5" }, { name: "y", value: "6", changed: true }] }],
      caption: "Back in main, y becomes 6.",
    },
    {
      line: 4,
      scopes: [{ fn: "main", vars: [{ name: "n", value: "5" }, { name: "y", value: "6" }] }],
      caption: "println(y) shows 6. Two frames lived and one died to print a single number.",
    },
  ]);
  return { lines, frames };
}
