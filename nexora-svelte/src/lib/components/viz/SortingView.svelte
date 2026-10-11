<script lang="ts">
  import { SORT_LINES, type SortFrame } from "$lib/viz/sorting";

  let { frame }: { frame: SortFrame } = $props();

  const W = 320;
  const H = 150;
  const n = $derived(frame.values.length);
  const bw = $derived(Math.min(34, (W - (n - 1) * 6) / n));
  const maxV = $derived(Math.max(...frame.values, 1));

  function barRole(idx: number): "sorted" | "compare" | "swapped" | "plain" {
    if (frame.swapped && (idx === frame.swapped[0] || idx === frame.swapped[1])) return "swapped";
    if (frame.compare && (idx === frame.compare[0] || idx === frame.compare[1])) return "compare";
    if (idx >= frame.sortedFrom) return "sorted";
    return "plain";
  }
  function fillOf(role: string): string {
    switch (role) {
      case "sorted":
        return "var(--color-added)";
      case "compare":
        return "var(--color-accent)";
      case "swapped":
        return "var(--color-removed)";
      default:
        return "var(--color-ink)";
    }
  }
</script>

<div>
  <svg viewBox={`0 0 ${W} ${H + 22}`} class="h-auto w-full" aria-hidden="true">
    {#each frame.values as v, idx}
      {@const h = Math.max(6, (v / maxV) * (H - 20))}
      {@const x = idx * (bw + 6)}
      {@const role = barRole(idx)}
      <rect
        x={x}
        y={H - h}
        width={bw}
        height={h}
        rx={3}
        fill={fillOf(role)}
        fill-opacity={role === "plain" ? 0.28 : 0.85}
        stroke={role === "plain" ? "var(--color-rule)" : fillOf(role)}
        stroke-width="1"
      />
      <text x={x + bw / 2} y={H + 15} text-anchor="middle" font-size="10" fill="var(--color-faint)" font-family="ui-monospace, monospace">
        {v}
      </text>
    {/each}
  </svg>
  <ol class="mt-2 rounded-lg border border-rule bg-ground p-3 font-mono text-xs leading-relaxed">
    {#each SORT_LINES as line, li}
      <li
        aria-current={frame.line === li ? "true" : undefined}
        class={frame.line === li
          ? "border-l-2 border-accent pl-2 text-ink"
          : "border-l-2 border-transparent pl-2 text-faint"}
      >
        {line}
      </li>
    {/each}
  </ol>
  <p class="mt-2 font-mono text-xs text-faint">
    pass {frame.pass} · {frame.comparisons} comparisons · {frame.swaps} swaps
  </p>
</div>
