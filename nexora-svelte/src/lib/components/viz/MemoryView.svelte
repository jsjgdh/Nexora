<script lang="ts">
  import type { MemFrame } from "$lib/viz/memory";

  let { frame }: { frame: MemFrame } = $props();

  const ROW = 22;
  const HEADER = 26;
  const HEAP_X = 196;
  const HEAP_W = 132;

  interface VarRow {
    scope: string;
    name: string;
    label: string;
    moved: boolean;
    target: string | null;
    y: number;
  }
  interface HeapBox {
    id: string;
    label: string;
    cells: string[];
    ghost: boolean;
    y: number;
    h: number;
  }

  const varRows = $derived.by(() => {
    const rows: VarRow[] = [];
    let y = 8 + HEADER;
    for (const scope of frame.stack) {
      y += 4;
      for (const v of scope.vars) {
        y += ROW;
        rows.push({
          scope: scope.fn,
          name: v.name,
          label: v.value ?? (v.pointsTo ? `→ ${v.pointsTo}` : "—"),
          moved: !!v.moved,
          target: v.pointsTo ?? null,
          y: y - ROW / 2,
        });
      }
    }
    return rows;
  });
  const stackH = $derived.by(() => {
    let y = 8 + HEADER;
    for (const scope of frame.stack) y += 4 + scope.vars.length * ROW;
    return y + 8;
  });
  const heapBoxes = $derived.by(() => {
    const boxes: HeapBox[] = [];
    let y = 8 + HEADER;
    for (const h of frame.heap) {
      const hgt = 20 + h.cells.length * 20 + 6;
      boxes.push({ id: h.id, label: h.label, cells: h.cells, ghost: !!h.ghost, y, h: hgt });
      y += hgt + 10;
    }
    return boxes;
  });
  const heapH = $derived(
    heapBoxes.length > 0 ? heapBoxes[heapBoxes.length - 1].y + heapBoxes[heapBoxes.length - 1].h + 8 : 40
  );
  const H = $derived(Math.max(stackH, heapH, 80));
  const heapById = $derived(new Map(heapBoxes.map((b) => [b.id, b])));
</script>

<svg viewBox={`0 0 340 ${H}`} class="h-auto w-full" aria-hidden="true">
  <defs>
    <marker id="viz-mem-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--color-review)" stroke-width="1.6" />
    </marker>
    <pattern id="viz-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="none" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-faint)" stroke-width="1.4" opacity="0.7" />
    </pattern>
  </defs>

  <text x={8} y={20} font-size="11" font-weight="700" fill="var(--color-faint)" font-family="ui-monospace, monospace">STACK</text>
  {#each frame.stack as scope, si}
    {@const sy = 8 + HEADER + frame.stack.slice(0, si).reduce((a, s) => a + 4 + s.vars.length * ROW, 0)}
    <text x={12} y={sy + 2} font-size="11" font-weight="700" fill="var(--color-muted)" font-family="ui-monospace, monospace">
      {scope.fn}()
    </text>
  {/each}
  {#each varRows as row}
    {#if row.moved}
      <rect x={10} y={row.y - 10} width={168} height={20} rx={5} fill="url(#viz-hatch)" stroke="var(--color-faint)" stroke-width="1" stroke-dasharray="4 3" opacity="0.8" />
    {/if}
    <text x={14} y={row.y + 4} font-size="12" fill={row.moved ? "var(--color-faint)" : "var(--color-muted)"} font-family="ui-monospace, monospace">
      {row.name} =
    </text>
    <text x={96} y={row.y + 4} font-size="12" font-weight="600" fill={row.moved ? "var(--color-faint)" : "var(--color-ink)"} font-family="ui-monospace, monospace">
      {row.label}{row.moved ? " (moved)" : ""}
    </text>
    {#if row.target && !row.moved}
      {@const box = heapById.get(row.target)}
      {#if box}
        <line
          x1={178}
          y1={row.y}
          x2={HEAP_X - 3}
          y2={box.y + 10 + (box.cells.length * 20) / 2}
          stroke="var(--color-review)"
          stroke-width="1.6"
          marker-end="url(#viz-mem-arrow)"
        />
        <circle cx={178} cy={row.y} r={2.6} fill="var(--color-review)" />
      {/if}
    {/if}
  {/each}

  <text x={HEAP_X} y={20} font-size="11" font-weight="700" fill="var(--color-faint)" font-family="ui-monospace, monospace">HEAP</text>
  {#each heapBoxes as box}
    <g opacity={box.ghost ? 0.55 : 1}>
      <text x={HEAP_X} y={box.y + 12} font-size="10" fill="var(--color-faint)" font-family="ui-monospace, monospace">
        {box.id} · {box.label}{box.ghost ? " · unreachable" : ""}
      </text>
      {#each box.cells as cell, ci}
        <rect
          x={HEAP_X}
          y={box.y + 16 + ci * 20}
          width={HEAP_W}
          height={20}
          fill="none"
          stroke="var(--color-rule)"
          stroke-width="1.2"
          stroke-dasharray={box.ghost ? "4 3" : undefined}
        />
        <text x={HEAP_X + HEAP_W / 2} y={box.y + 30 + ci * 20} text-anchor="middle" font-size="12" fill="var(--color-ink)" font-family="ui-monospace, monospace">
          {cell}
        </text>
      {/each}
    </g>
  {/each}
</svg>
