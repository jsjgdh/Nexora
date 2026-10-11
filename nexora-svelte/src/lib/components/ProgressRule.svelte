<script lang="ts">
  import { cn } from "$lib/format";

  /* A measurement, not a trophy: a one-pixel track with the completed portion
     inked, the counts printed in mono beside it. No gradient, no glow, no
     rounded capsule. */

  let {
    value,
    max,
    label,
    tone = "accent",
    className = "",
  }: {
    value: number;
    max: number;
    label: string;
    tone?: "accent" | "added";
    className?: string;
  } = $props();

  const pct = $derived(max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0);
</script>

<div class={cn("w-full", className)}>
  <div class="flex items-baseline justify-between gap-3">
    <span class="stamp text-faint">{label}</span>
    <span class="num text-[12px] text-muted">{value} / {max}</span>
  </div>
  <div
    class="mt-1.5 h-px w-full bg-rule"
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-label={label}
  >
    <div class={cn("h-px", tone === "added" ? "bg-added" : "bg-accent")} style:width="{pct}%"></div>
  </div>
</div>
