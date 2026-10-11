export interface DiffRow {
  kind: "context" | "added" | "removed";
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

/** Deterministic line diff. LCS gives compact hunks for normal lesson files;
 * a common-prefix/suffix fallback bounds memory for unusually large drafts. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const rows: DiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  const emitSame = (text: string) => rows.push({ kind: "context", oldLine: oldLine++, newLine: newLine++, text });

  if ((a.length + 1) * (b.length + 1) > 1_000_000) {
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
      emitSame(a[prefix++]);
    }
    let suffix = 0;
    while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    for (let i = prefix; i < a.length - suffix; i++) rows.push({ kind: "removed", oldLine: oldLine++, newLine: null, text: a[i] });
    for (let i = prefix; i < b.length - suffix; i++) rows.push({ kind: "added", oldLine: null, newLine: newLine++, text: b[i] });
    for (let i = a.length - suffix; i < a.length; i++) emitSame(a[i]);
    return rows;
  }

  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      emitSame(a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ kind: "removed", oldLine: oldLine++, newLine: null, text: a[i++] });
    } else {
      rows.push({ kind: "added", oldLine: null, newLine: newLine++, text: b[j++] });
    }
  }
  while (i < a.length) rows.push({ kind: "removed", oldLine: oldLine++, newLine: null, text: a[i++] });
  while (j < b.length) rows.push({ kind: "added", oldLine: null, newLine: newLine++, text: b[j++] });
  return rows;
}
