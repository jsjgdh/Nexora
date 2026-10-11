<script lang="ts">
  import type { NodeState } from "$lib/types";
  import { cn } from "$lib/format";

  let { state, className = "" }: { state: NodeState; className?: string } = $props();

  const META: Record<NodeState, { label: string; glyph: string; cls: string }> = {
    locked: { label: "Locked", glyph: "◆", cls: "border-line text-muted" },
    available: { label: "Available", glyph: "○", cls: "border-mint/50 text-mint" },
    recommended: { label: "Recommended", glyph: "➤", cls: "border-mint bg-mint/10 text-mint" },
    "in-progress": { label: "In progress", glyph: "◐", cls: "border-warning/60 text-warning" },
    completed: { label: "Completed", glyph: "●", cls: "border-success/50 text-success" },
    mastered: { label: "Mastered", glyph: "★", cls: "border-success bg-success/10 text-success" },
    "needs-practice": {
      label: "Needs practice",
      glyph: "↻",
      cls: "border-warning/60 bg-warning/10 text-warning",
    },
    optional: { label: "Optional", glyph: "◇", cls: "border-line text-muted" },
  };
  const meta = $derived(META[state]);
</script>

<span
  class={cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
    meta.cls,
    className
  )}
>
  <span aria-hidden="true">{meta.glyph}</span>
  {meta.label}
</span>
