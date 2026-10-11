import type { VizFrame } from "./types";

/* Array reads and writes as frame sequences. Pure: the same input always
   yields the same frames, which is what the verifier asserts. */

export type CellState = "idle" | "read" | "write" | "spot";

export interface ArrayCell {
  value: number;
  state: CellState;
}

export interface ArrayFrame extends VizFrame {
  cells: ArrayCell[];
  /** Index the pointer arrow indicates, if any. */
  pointer: number | null;
}

function cellsOf(values: number[], mark: Record<number, CellState> = {}): ArrayCell[] {
  return values.map((value, i) => ({ value, state: mark[i] ?? "idle" }));
}

function checkIndex(values: number[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    throw new RangeError(`index ${index} is outside 0..${values.length - 1}`);
  }
}

export function arrayGet(values: number[], index: number): ArrayFrame[] {
  checkIndex(values, index);
  return [
    {
      cells: cellsOf(values),
      pointer: null,
      caption: `An array holds ${values.length} values side by side. To read one, name its index.`,
    },
    {
      cells: cellsOf(values, { [index]: "read" }),
      pointer: index,
      caption: `Reading index ${index} touches exactly one cell — the others sit still.`,
    },
    {
      cells: cellsOf(values, { [index]: "read" }),
      pointer: index,
      caption: `a[${index}] is ${values[index]}. Indexes count from 0, so the last cell is ${values.length - 1}.`,
    },
  ];
}

export function arraySet(values: number[], index: number, next: number): ArrayFrame[] {
  checkIndex(values, index);
  const after = values.map((v, i) => (i === index ? next : v));
  return [
    {
      cells: cellsOf(values),
      pointer: null,
      caption: `Writing replaces one cell and leaves the rest untouched. Index ${index} currently holds ${values[index]}.`,
    },
    {
      cells: cellsOf(values, { [index]: "read" }),
      pointer: index,
      caption: `First the old value is read: ${values[index]}.`,
    },
    {
      cells: cellsOf(after, { [index]: "write" }),
      pointer: index,
      caption: `Now index ${index} holds ${next}. Same array, same length — one cell changed.`,
    },
  ];
}

export function arrayPush(values: number[], next: number): ArrayFrame[] {
  const after = [...values, next];
  return [
    {
      cells: cellsOf(values),
      pointer: null,
      caption: `Pushing appends exactly one cell at the end. The array has ${values.length} values now.`,
    },
    {
      cells: cellsOf(after, { [values.length]: "spot" }),
      pointer: values.length,
      caption: `A new cell appears at index ${values.length} holding ${next}. Nothing else moved.`,
    },
    {
      cells: cellsOf(after),
      pointer: null,
      caption: `Done: ${after.length} values, indexes 0 to ${after.length - 1}.`,
    },
  ];
}

export function arrayPop(values: number[]): ArrayFrame[] {
  if (values.length === 0) throw new RangeError("cannot pop an empty array");
  const after = values.slice(0, -1);
  const dropped = values[values.length - 1];
  return [
    {
      cells: cellsOf(values),
      pointer: null,
      caption: `Popping removes the last cell and hands its value back: ${dropped}.`,
    },
    {
      cells: cellsOf(values, { [values.length - 1]: "spot" }),
      pointer: values.length - 1,
      caption: `Index ${values.length - 1} leaves the array. The rest keep their indexes.`,
    },
    {
      cells: cellsOf(after),
      pointer: null,
      caption: after.length > 0 ? `Done: ${after.length} values left.` : "Done: the array is empty now.",
    },
  ];
}
