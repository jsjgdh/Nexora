/* Visualization frame generators: deterministic sequences, narrated steps.
   Run: npm run verify:viz
   Pure data, no DOM — every assertion reads frames, never pixels. */
import assert from "node:assert/strict";
import {
  arrayGet,
  arrayPop,
  arrayPush,
  arraySet,
} from "../src/lib/viz/array";
import { bubbleFrames } from "../src/lib/viz/sorting";
import {
  listAppend,
  listBuild,
  listDeleteAt,
  listInsertAt,
  listPrepend,
} from "../src/lib/viz/linkedlist";
import { bstInsertAll, bstLayout, bstSearch } from "../src/lib/viz/bst";
import { execTrace, goAddOneDemo } from "../src/lib/viz/exec";
import { goShareDemo, goSliceDemo, validateMemFrame } from "../src/lib/viz/memory";
import { FLEX_DEFAULTS, flexCss } from "../src/lib/viz/flexcss";

let passed = 0;
function ok(name: string, cond: boolean) {
  assert(cond, `FAILED: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

console.log("== array frames ==");
{
  const frames = arrayGet([2, 5, 1, 8], 2);
  ok("get narrates in three steps", frames.length === 3);
  ok("pointer lands on the read cell", frames[1].pointer === 2 && frames[1].cells[2].state === "read");
  ok("untouched cells stay idle", frames[1].cells.every((c, i) => (i === 2 ? true : c.state === "idle")));
  ok("caption carries the value and the last index", frames[2].caption.includes("1") && frames[2].caption.includes("3"));
  const set = arraySet([2, 5, 1, 8], 1, 7);
  ok("set replaces one cell", set[2].cells[1].value === 7 && set[2].cells[1].state === "write");
  ok("set leaves the rest alone", set[2].cells.filter((c, i) => i !== 1).every((c) => c.state === "idle"));
  const pushed = arrayPush([2, 5], 9);
  ok("push grows by one at the end", pushed[2].cells.length === 3 && pushed[2].cells[2].value === 9);
  ok("push marks the newcomer", pushed[1].cells[2].state === "spot");
  const popped = arrayPop([2, 5]);
  ok("pop drops the last value", popped[2].cells.length === 1 && popped[0].caption.includes("5"));
  ok("pop of one leaves none", arrayPop([7])[2].cells.length === 0);
  assert.throws(() => arrayPop([]), RangeError);
  ok("pop of empty throws", true);
  assert.throws(() => arrayGet([1], 5), RangeError);
  assert.throws(() => arrayGet([1], -1), RangeError);
  ok("out-of-bounds reads throw", true);
}

console.log("== sorting frames ==");
{
  const frames = bubbleFrames([3, 1, 4, 2]);
  const last = frames[frames.length - 1];
  ok("bubble ends sorted", JSON.stringify(last.values) === JSON.stringify([1, 2, 3, 4]));
  const sorted = [...[3, 1, 4, 2]].sort((a, b) => a - b).join(",");
  ok(
    "every frame is a permutation (nothing created or lost)",
    frames.every((f) => [...f.values].sort((a, b) => a - b).join(",") === sorted)
  );
  ok(
    "comparisons are always neighbors",
    frames.every((f) => !f.compare || Math.abs(f.compare[0] - f.compare[1]) === 1)
  );
  ok(
    "lines stay inside the pseudocode",
    frames.every((f) => f.line >= 0 && f.line <= 3)
  );
  ok("counts only grow", frames.every((f, i) => i === 0 || (f.comparisons >= frames[i - 1].comparisons && f.swaps >= frames[i - 1].swaps)));
  ok("work actually happened", last.comparisons > 0 && last.swaps > 0);
  const sortedIn = bubbleFrames([1, 2, 3]);
  const sortedLast = sortedIn[sortedIn.length - 1];
  ok("sorted input still terminates sorted with zero swaps", sortedLast.swaps === 0 && JSON.stringify(sortedLast.values) === JSON.stringify([1, 2, 3]));
  ok("reversed ends ordered", JSON.stringify(bubbleFrames([3, 2, 1]).pop()!.values) === JSON.stringify([1, 2, 3]));
  assert.throws(() => bubbleFrames([1]), RangeError);
  assert.throws(() => bubbleFrames([1, 2, 3, 4, 5, 6, 7, 8, 9]), RangeError);
  ok("size bounds throw", true);
}

console.log("== linked list frames ==");
{
  const [base] = listBuild([4, 9]);
  ok("build chains head to tail", base.head === "n0" && base.nodes.length === 2);
  const appended = listAppend(base, 2);
  const fin = appended[appended.length - 1];
  const vals = (ids: string[]) => ids.map((id) => fin.nodes.find((n) => n.id === id)!.value);
  ok("append grows the live chain", JSON.stringify(vals(orderOf(fin))) === JSON.stringify([4, 9, 2]));
  function orderOf(f: { head: string | null; nodes: { id: string; next: string | null }[] }): string[] {
    const byId = new Map(f.nodes.map((n) => [n.id, n]));
    const out: string[] = [];
    let cur = f.head;
    while (cur && byId.has(cur) && !out.includes(cur)) {
      out.push(cur);
      cur = byId.get(cur)!.next;
    }
    return out;
  }
  const prepended = listPrepend(base, 7);
  const pfin = prepended[prepended.length - 1];
  ok("prepend moves the head", pfin.head !== null && pfin.nodes.find((n) => n.id === pfin.head)!.value === 7);
  const inserted = listInsertAt(base, 1, 6);
  const ifin = inserted[inserted.length - 1];
  const ivalues = ((): number[] => {
    const byId = new Map(ifin.nodes.map((n) => [n.id, n]));
    const out: number[] = [];
    let cur: string | null = ifin.head;
    while (cur && byId.has(cur)) {
      out.push(byId.get(cur)!.value);
      cur = byId.get(cur)!.next;
    }
    return out;
  })();
  ok("insert splices the middle", JSON.stringify(ivalues) === JSON.stringify([4, 6, 9]));
  const deleted = listDeleteAt(base, 0);
  const dfin = deleted[deleted.length - 1];
  ok("deleting the head moves head", dfin.head !== null && dfin.nodes.find((n) => n.id === dfin.head)!.value === 9);
  ok("dropped nodes stay drawn as ghosts", dfin.nodes.some((n) => n.state === "gone"));
  const single = listDeleteAt(listBuild([1])[0], 0);
  ok("deleting the only node empties the list", single[single.length - 1].head === null);
  assert.throws(() => listInsertAt(base, 5, 1), RangeError);
  assert.throws(() => listDeleteAt(base, 2), RangeError);
  ok("out-of-range edits throw", true);
  const chained = listAppend(listAppend(base, 2)[1], 3);
  const ids = chained[1].nodes.map((n) => n.id);
  ok("chained appends never reuse ids", new Set(ids).size === ids.length);
}

console.log("== bst frames ==");
{
  const frames = bstInsertAll([5, 3, 7, 2, 4]);
  const last = frames[frames.length - 1];
  ok("in-order ends sorted", JSON.stringify(last.order) === JSON.stringify([2, 3, 4, 5, 7]));
  ok("root holds the first value", last.nodes.find((n) => n.id === last.root)!.value === 5);
  const found = bstSearch(last, 4);
  const hit = found[found.length - 1];
  ok("search lands on the target", hit.nodes.some((n) => n.value === 4 && n.state === "found"));
  ok("search walks (never jumps)", found.length > 1);
  const miss = bstSearch(last, 6);
  const mfin = miss[miss.length - 1];
  ok("a miss says so", mfin.caption.includes("not present") && mfin.nodes.some((n) => n.state === "miss"));
  const layout = bstLayout(last);
  ok("layout covers every node", layout.size === last.nodes.length);
  const xs = last.order.map((v) => layout.get(last.nodes.find((n) => n.value === v)!.id)!.x);
  ok("x follows in-order", xs.every((x, i) => i === 0 || x > xs[i - 1]));
  const depths = new Map(last.nodes.map((n) => [n.id, layout.get(n.id)!.depth]));
  ok("root is depth zero", depths.get(last.root!) === 0);
  const dupes = bstInsertAll([5, 5]);
  const dlast = dupes[dupes.length - 1];
  ok(
    "duplicates go right by policy",
    dlast.nodes.find((n) => n.id === dlast.root)!.right !== null
  );
  ok("empty search is honest", bstSearch({ root: null, nodes: [], order: [], caption: "" }, 1)[0].caption.includes("empty"));
}

console.log("== execution trace frames ==");
{
  const { lines, frames } = goAddOneDemo();
  ok("seven steps, every line in bounds", frames.length === 7 && frames.every((f) => f.line >= 1 && f.line <= lines.length));
  const fin = frames[frames.length - 1];
  ok("y ends at 6", fin.scopes[0].vars.find((v) => v.name === "y")?.value === "6");
  ok("the call frame reports its return", frames[4].returned?.fn === "addOne" && frames[4].returned?.value === "6");
  ok("changed flags mark arrivals", frames[1].scopes[0].vars[0].changed === true);
  assert.throws(() => execTrace([], [{ line: 1, scopes: [{ fn: "m", vars: [] }], caption: "x" }]), RangeError);
  assert.throws(() => execTrace(["a"], [{ line: 2, scopes: [{ fn: "m", vars: [] }], caption: "x" }]), RangeError);
  assert.throws(() => execTrace(["a"], [{ line: 1, scopes: [], caption: "x" }]), RangeError);
  assert.throws(() => execTrace(["a"], [{ line: 1, scopes: [{ fn: "m", vars: [] }], caption: "" }]), RangeError);
  ok("empty lines, bad lines, empty scopes, and silent steps all throw", true);
}

console.log("== memory frames ==");
{
  const [s1, s2] = goSliceDemo();
  ok("append reallocates past capacity", s2.heap.some((h) => h.ghost) && s2.heap.some((h) => !h.ghost && h.cells.length === 4));
  ok("s follows the new array", s2.stack[0].vars[0].pointsTo === "h2");
  const [h1, h2, h3] = goShareDemo();
  void h1;
  ok("copy shares without duplicating", h2.heap.length === 1 && h2.stack[0].vars.length === 2);
  ok("a write through the alias lands", h3.heap[0].cells[0] === "9");
  assert.throws(
    () =>
      validateMemFrame({
        stack: [{ fn: "m", vars: [{ name: "x", pointsTo: "nope" }] }],
        heap: [],
        caption: "dangling",
      }),
    RangeError
  );
  assert.throws(
    () =>
      validateMemFrame({
        stack: [{ fn: "m", vars: [{ name: "x", value: "1", pointsTo: "h" }] }],
        heap: [{ id: "h", label: "l", cells: ["1"] }],
        caption: "both",
      }),
    RangeError
  );
  assert.throws(
    () =>
      validateMemFrame({
        stack: [{ fn: "m", vars: [] }],
        heap: [{ id: "h", label: "l", cells: ["1"] }],
        caption: "unreachable",
      }),
    RangeError
  );
  ok("dangling, double-bound, and unreachable heap all throw", true);
}

console.log("== flexbox css ==");
{
  ok(
    "defaults render the exact snippet",
    flexCss(FLEX_DEFAULTS) ===
      ".container {\n  display: flex;\n  flex-direction: row;\n  justify-content: flex-start;\n  align-items: stretch;\n  flex-wrap: nowrap;\n  gap: 12px;\n}"
  );
  const custom = flexCss({ ...FLEX_DEFAULTS, direction: "column", justify: "center", gap: 0 });
  ok(
    "options flow through",
    custom.includes("flex-direction: column;") && custom.includes("justify-content: center;") && custom.includes("gap: 0px;")
  );
}

console.log(`\nALL ${passed} ASSERTIONS PASSED`);
