import type { VizFrame } from "./types";

/* Stack-and-heap memory as frame sequences. Variables either hold a value
   inline or point at a heap object; `moved` renders a binding that no longer
   owns anything. The two demos below are the two ideas that unlock Go
   memory: append reallocates when capacity runs out, and copying a slice
   copies the header, never the array. */

export interface MemVar {
  name: string;
  /** Inline value (plain data). Mutually exclusive with pointsTo. */
  value?: string;
  /** Heap object id this variable points at. */
  pointsTo?: string | null;
  /** Binding exists but owns nothing anymore (moved / collected). */
  moved?: boolean;
}

export interface MemScope {
  fn: string;
  vars: MemVar[];
}

export interface HeapObj {
  id: string;
  label: string;
  cells: string[];
  /** Left behind: nothing points here anymore. */
  ghost?: boolean;
}

export interface MemFrame extends VizFrame {
  stack: MemScope[];
  heap: HeapObj[];
}

export function validateMemFrame(frame: MemFrame): MemFrame {
  const heapIds = new Set(frame.heap.map((h) => h.id));
  for (const scope of frame.stack) {
    for (const v of scope.vars) {
      if (v.value !== undefined && v.pointsTo !== undefined && v.pointsTo !== null) {
        throw new RangeError(`variable ${v.name} has both a value and a target`);
      }
      if (v.pointsTo && !heapIds.has(v.pointsTo)) {
        throw new RangeError(`variable ${v.name} points at missing heap object ${v.pointsTo}`);
      }
    }
  }
  const live = new Set<string>();
  for (const scope of frame.stack) {
    for (const v of scope.vars) {
      if (v.pointsTo && !v.moved) live.add(v.pointsTo);
    }
  }
  for (const h of frame.heap) {
    if (!h.ghost && !live.has(h.id)) {
      throw new RangeError(`heap object ${h.id} is neither pointed at nor marked ghost`);
    }
  }
  return frame;
}

/** append past capacity: realloc, copy, repoint, collect the old array. */
export function goSliceDemo(): MemFrame[] {
  return [
    validateMemFrame({
      stack: [{ fn: "main", vars: [{ name: "s", pointsTo: "h1" }] }],
      heap: [{ id: "h1", label: "len 3 · cap 3", cells: ["1", "2", "3"] }],
      caption:
        "s := []int{1, 2, 3} — s itself is tiny: a pointer, a length, a capacity. The values live together in one heap array.",
    }),
    validateMemFrame({
      stack: [{ fn: "main", vars: [{ name: "s", pointsTo: "h2" }] }],
      heap: [
        { id: "h1", label: "len 3 · cap 3", cells: ["1", "2", "3"], ghost: true },
        { id: "h2", label: "len 4 · cap 6", cells: ["1", "2", "3", "4"] },
      ],
      caption:
        "append(s, 4) outgrew capacity 3, so Go allocated a bigger array, copied the values, and repointed s. The old array is left behind for the collector.",
    }),
  ];
}

/** Copying a slice copies the header: two variables, one array. */
export function goShareDemo(): MemFrame[] {
  return [
    validateMemFrame({
      stack: [{ fn: "main", vars: [{ name: "s", pointsTo: "h1" }] }],
      heap: [{ id: "h1", label: "len 2 · cap 2", cells: ["1", "2"] }],
      caption: "s holds [1, 2]. One variable, one array — so far, so obvious.",
    }),
    validateMemFrame({
      stack: [{ fn: "main", vars: [{ name: "s", pointsTo: "h1" }, { name: "t", pointsTo: "h1" }] }],
      heap: [{ id: "h1", label: "len 2 · cap 2", cells: ["1", "2"] }],
      caption:
        "t := s copies the header, not the array. Two variables now describe the same values — no copy was made.",
    }),
    validateMemFrame({
      stack: [{ fn: "main", vars: [{ name: "s", pointsTo: "h1" }, { name: "t", pointsTo: "h1" }] }],
      heap: [{ id: "h1", label: "len 2 · cap 2", cells: ["9", "2"] }],
      caption:
        "t[0] = 9 writes through the shared array — so s sees it too. Aliasing is the price of never copying.",
    }),
  ];
}
