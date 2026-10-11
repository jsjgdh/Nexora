<script lang="ts">
  import { bstLayout, type BstFrame } from "$lib/viz/bst";

  let { frame }: { frame: BstFrame } = $props();

  const pos = $derived(bstLayout(frame));
  const maxX = $derived(Math.max(120, ...[...pos.values()].map((p) => p.x)) + 26);
  const maxY = $derived(Math.max(80, ...[...pos.values()].map((p) => p.y)) + 26);
  const byId = $derived(new Map(frame.nodes.map((n) => [n.id, n])));

  function edgeHot(id: string | null): boolean {
    if (!id) return false;
    const n = byId.get(id);
    return !!n && n.state !== "idle";
  }

  function nodeStroke(state: string): string {
    switch (state) {
      case "at":
        return "var(--color-accent)";
      case "path":
        return "var(--color-accent)";
      case "found":
        return "var(--color-added)";
      case "fresh":
        return "var(--color-mint)";
      case "miss":
        return "var(--color-removed)";
      default:
        return "var(--color-rule)";
    }
  }
  function nodeFill(state: string): string {
    switch (state) {
      case "path":
        return "var(--color-accent)";
      case "found":
        return "var(--color-added)";
      case "fresh":
        return "var(--color-mint)";
      default:
        return "none";
    }
  }
</script>

<div>
  {#if frame.nodes.length === 0}
    <p class="rounded-lg border border-dashed border-rule px-4 py-8 text-center font-mono text-sm text-faint">
      empty tree — nothing to compare yet
    </p>
  {:else}
    <svg viewBox={`0 0 ${maxX} ${maxY}`} class="h-auto w-full" aria-hidden="true">
      {#each frame.nodes as node}
        {@const p = pos.get(node.id)!}
        {#if node.left && pos.get(node.left)}
          {@const c = pos.get(node.left)!}
          {@const hot = node.state !== "idle" || (byId.get(node.left)?.state ?? "idle") !== "idle"}
          <line x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke={hot ? "var(--color-accent)" : "var(--color-rule)"} stroke-width={hot ? 2.5 : 1.5} />
        {/if}
        {#if node.right && pos.get(node.right)}
          {@const c = pos.get(node.right)!}
          {@const hot = node.state !== "idle" || (byId.get(node.right)?.state ?? "idle") !== "idle"}
          <line x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke={hot ? "var(--color-accent)" : "var(--color-rule)"} stroke-width={hot ? 2.5 : 1.5} />
        {/if}
      {/each}
      {#each frame.nodes as node}
        {@const p = pos.get(node.id)!}
        <circle
          cx={p.x}
          cy={p.y}
          r={node.state === "at" || node.state === "found" ? 15 : 13}
          fill={nodeFill(node.state)}
          fill-opacity={node.state === "idle" ? 0 : 0.18}
          stroke={nodeStroke(node.state)}
          stroke-width={node.state === "idle" ? 1.5 : 3}
          stroke-dasharray={node.state === "miss" ? "4 3" : undefined}
          opacity={node.state === "miss" ? 0.75 : 1}
        />
        <text x={p.x} y={p.y + 4.5} text-anchor="middle" font-size="12" font-weight="600" fill="var(--color-ink)" font-family="ui-monospace, monospace">
          {node.value}
        </text>
      {/each}
    </svg>
    <p class="mt-2 font-mono text-xs text-faint">
      in-order: {frame.order.length > 0 ? frame.order.join(" · ") : "—"}
    </p>
  {/if}
</div>
