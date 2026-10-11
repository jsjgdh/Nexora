<script lang="ts">
  import type { ListFrame } from "$lib/viz/linkedlist";

  let { frame }: { frame: ListFrame } = $props();

  const VW = 34; // value box
  const NW = 20; // next box
  const NODE_W = VW + NW;
  const GAP = 34;
  const Y = 30;
  const H = 30;

  interface Placed {
    id: string;
    value: number;
    state: string;
    x: number;
    next: string | null;
  }
  const placed = $derived.by(() => {
    const out: Placed[] = [];
    const byId = new Map(frame.nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    let cur = frame.head;
    let x = 8;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const n = byId.get(cur);
      if (!n || n.state === "gone") break;
      out.push({ id: n.id, value: n.value, state: n.state, x, next: n.next });
      x += NODE_W + GAP;
      cur = n.next;
    }
    return out;
  });
  // Ghosts (deleted nodes) render after the live chain, faded.
  const ghosts = $derived(frame.nodes.filter((n) => n.state === "gone"));
  const ghostX = $derived(8 + placed.length * (NODE_W + GAP));
  const W = $derived(Math.max(120, ghostX + ghosts.length * (NODE_W + 12)));

  function strokeOf(state: string): string {
    switch (state) {
      case "fresh":
        return "var(--color-mint)";
      case "touch":
        return "var(--color-accent)";
      case "gone":
        return "var(--color-faint)";
      default:
        return "var(--color-rule)";
    }
  }
</script>

<svg viewBox={`0 0 ${W} 104`} class="h-auto w-full" aria-hidden="true">
  <defs>
    <marker id="viz-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--color-faint)" stroke-width="1.6" />
    </marker>
    <marker id="viz-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--color-accent)" stroke-width="1.8" />
    </marker>
  </defs>

  {#if placed.length > 0}
    <text x={2} y={Y + 12} font-size="11" fill="var(--color-faint)" font-family="ui-monospace, monospace">head</text>
    {@const first = placed[0]}
    <line x1={-2} y1={Y + H / 2} x2={first.x - 3} y2={Y + H / 2} stroke="var(--color-accent)" stroke-width="1.6" marker-end="url(#viz-arrow-hot)" />
  {:else}
    <text x={8} y={Y + 19} font-size="12" fill="var(--color-faint)">empty — head points at nothing</text>
  {/if}

  {#each placed as p}
    <g opacity={p.state === "gone" ? 0.45 : 1}>
      <rect
        x={p.x}
        y={Y}
        width={VW}
        height={H}
        rx={6}
        fill="none"
        stroke={strokeOf(p.state)}
        stroke-width={p.state === "idle" ? 1.5 : 2.5}
      />
      <text x={p.x + VW / 2} y={Y + 20} text-anchor="middle" font-size="13" font-weight="600" fill="var(--color-ink)" font-family="ui-monospace, monospace">
        {p.value}
      </text>
      <rect
        x={p.x + VW}
        y={Y}
        width={NW}
        height={H}
        rx={6}
        fill="none"
        stroke={strokeOf(p.state)}
        stroke-width={p.state === "idle" ? 1.5 : 2.5}
        stroke-dasharray={p.state === "gone" ? "4 3" : undefined}
      />
      {#if p.next}
        {@const target = placed.find((q) => q.id === p.next)}
        {#if target}
          <line
            x1={p.x + NODE_W + 2}
            y1={Y + H / 2}
            x2={target.x - 3}
            y2={Y + H / 2}
            stroke={p.state === "idle" && target.state === "idle" ? "var(--color-faint)" : "var(--color-accent)"}
            stroke-width="1.6"
            marker-end={p.state === "idle" && target.state === "idle" ? "url(#viz-arrow)" : "url(#viz-arrow-hot)"}
          />
        {/if}
      {:else}
        <line x1={p.x + NODE_W + 4} y1={Y + 6} x2={p.x + NODE_W + 4} y2={Y + H - 6} stroke="var(--color-faint)" stroke-width="1.6" />
        <line x1={p.x + NODE_W - 1} y1={Y + H - 6} x2={p.x + NODE_W + 9} y2={Y + H - 6} stroke="var(--color-faint)" stroke-width="1.6" />
      {/if}
    </g>
  {/each}

  {#each ghosts as g, gi}
    {@const gx = ghostX + gi * (NODE_W + 12)}
    <g opacity="0.45">
      <rect x={gx} y={Y} width={NODE_W} height={H} rx={6} fill="none" stroke="var(--color-faint)" stroke-width="1.5" stroke-dasharray="4 3" />
      <text x={gx + NODE_W / 2} y={Y + 20} text-anchor="middle" font-size="13" fill="var(--color-faint)" font-family="ui-monospace, monospace">
        {g.value}
      </text>
      <text x={gx + NODE_W / 2} y={Y + H + 16} text-anchor="middle" font-size="10" fill="var(--color-faint)">dropped</text>
    </g>
  {/each}
</svg>
