import type { VizFrame } from "./types";

/* Bubble sort as frame sequences. Each frame pins one pseudocode line, one
   comparison, and the running counts — the three things a learner must hold
   together to understand why the algorithm terminates sorted. */

export const SORT_LINES = [
  "for each pass over the unsorted part:",
  "  compare each neighbor pair",
  "  if the left is larger, swap them",
  "  the largest value settles at the end",
];

export interface SortFrame extends VizFrame {
  values: number[];
  compare: [number, number] | null;
  swapped: [number, number] | null;
  /** Indexes >= sortedFrom are in their final positions. */
  sortedFrom: number;
  pass: number;
  comparisons: number;
  swaps: number;
  /** Index into SORT_LINES. */
  line: number;
}

const MAX_N = 8;

export function bubbleFrames(input: number[]): SortFrame[] {
  if (!Number.isInteger(input.length) || input.length < 2) {
    throw new RangeError("bubble sort needs at least 2 values to show anything");
  }
  if (input.length > MAX_N) {
    throw new RangeError(`at most ${MAX_N} values stay readable; got ${input.length}`);
  }
  const values = [...input];
  const frames: SortFrame[] = [];
  let comparisons = 0;
  let swaps = 0;
  const n = values.length;

  frames.push({
    values: [...values],
    compare: null,
    swapped: null,
    sortedFrom: n,
    pass: 0,
    comparisons,
    swaps,
    line: 0,
    caption: `Unsorted: ${values.join(", ")}. Bubble sort will walk the list, swapping neighbors that are out of order.`,
  });

  for (let i = 0; i < n - 1; i++) {
    const pass = i + 1;
    const sortedFrom = n - 1 - i;
    for (let j = 0; j < n - 1 - i; j++) {
      comparisons += 1;
      const a = values[j];
      const b = values[j + 1];
      if (a > b) {
        values[j] = b;
        values[j + 1] = a;
        swaps += 1;
        frames.push({
          values: [...values],
          compare: [j, j + 1],
          swapped: [j, j + 1],
          sortedFrom: n,
          pass,
          comparisons,
          swaps,
          line: 2,
          caption: `Compare positions ${j} and ${j + 1}: ${a} > ${b}, so they trade places. Swap ${swaps} of pass ${pass}.`,
        });
      } else {
        frames.push({
          values: [...values],
          compare: [j, j + 1],
          swapped: null,
          sortedFrom: n,
          pass,
          comparisons,
          swaps,
          line: 1,
          caption: `Compare positions ${j} and ${j + 1}: ${a} and ${b} are already ordered, so nothing moves.`,
        });
      }
    }
    frames.push({
      values: [...values],
      compare: null,
      swapped: null,
      sortedFrom,
      pass,
      comparisons,
      swaps,
      line: 3,
      caption: `Pass ${pass} done — the largest unsorted value has bubbled into index ${sortedFrom}. That cell is finished.`,
    });
  }

  frames.push({
    values: [...values],
    compare: null,
    swapped: null,
    sortedFrom: 0,
    pass: n - 1,
    comparisons,
    swaps,
    line: 3,
    caption: `Sorted: ${values.join(", ")} — ${comparisons} comparisons, ${swaps} swaps. Every pass fixed one more cell from the right.`,
  });
  return frames;
}
