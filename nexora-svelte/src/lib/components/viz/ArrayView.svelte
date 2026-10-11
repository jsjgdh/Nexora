<script lang="ts">
  import type { ArrayFrame, CellState } from "$lib/viz/array";

  let { frame }: { frame: ArrayFrame } = $props();

  const CELL = 40;
  const GAP = 6;
  const X0 = 8;
  const Y = 14;
  const W = $derived(X0 * 2 + frame.cells.length * (CELL + GAP) - GAP);

  function strokeOf(s: CellState): string {
    switch (s) {
      case "read":
        return "var(--color-accent)";
      case "write":
        return "var(--color-added)";
      case "spot":
        return "var(--color-review)";
      default:
        return "var(--color-rule)";
    }
  }
  function fillOf(s: CellState): string {
    switch (s) {
      case "read":
        return "var(--color-accent)";
      case "write":
        return "var(--color-added)";
      case "spot":
        return "var(--color-review)";
      default:
        return "none";
    }
  }
</script>

<svg viewBox={`0 0 ${W} 96`} class="h-auto w-full" aria-hidden="true">
  {#each frame.cells as cell, idx}
    {@const x = X0 + idx * (CELL + GAP)}
    {#if frame.pointer === idx}
      <polygon points={`${x + CELL / 2 - 6},2 ${x + CELL / 2 + 6},2 ${x + CELL / 2},10`} fill="var(--color-accent)" />
    {/if}
    <rect
      x={x}
      y={Y}
      width={CELL}
      height={CELL}
      rx={6}
      fill={fillOf(cell.state)}
      fill-opacity={cell.state === "idle" ? 0 : 0.14}
      stroke={strokeOf(cell.state)}
      stroke-width={cell.state === "idle" ? 1.5 : 2.5}
      stroke-dasharray={cell.state === "spot" ? "4 3" : undefined}
    />
    <text x={x + CELL / 2} y={Y + 26} text-anchor="middle" font-size="15" font-weight="600" fill="var(--color-ink)" font-family="ui-monospace, monospace">
      {cell.value}
    </text>
    <text x={x + CELL / 2} y={Y + CELL + 20} text-anchor="middle" font-size="11" fill={frame.pointer === idx ? "var(--color-accent)" : "var(--color-faint)"} font-family="ui-monospace, monospace">
      {idx}
    </text>
  {/each}
</svg>
