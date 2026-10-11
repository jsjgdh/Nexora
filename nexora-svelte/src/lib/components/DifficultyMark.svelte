<script lang="ts">
  import { cn } from "$lib/format";

  let {
    level,
    showLabel = true,
    className = "",
  }: { level: 1 | 2 | 3 | 4 | 5; showLabel?: boolean; className?: string } = $props();

  const HELP: Record<number, string> = {
    1: "A gentle introduction — reading and recognising.",
    2: "Straightforward once the idea lands.",
    3: "Needs real thought and a few attempts.",
    4: "Substantial: expect to get it wrong before you get it right.",
    5: "A challenge mission — bring everything from the stage.",
  };

  /*
   * Difficulty maps to the NEXORA state channels:
   *   easy (1-2)  → added    Evidence Emerald
   *   med  (3)    → review   Signal Amber
   *   hard (4-5)  → removed  failure rose
   */
  const CONF = $derived.by(() => {
    if (level <= 2) {
      return { label: "Easy", colorVar: "--color-added" };
    }
    if (level === 3) {
      return { label: "Med", colorVar: "--color-review" };
    }
    return { label: "Hard", colorVar: "--color-removed" };
  });
</script>

<span
  class={cn(
    "num inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] font-semibold transition-colors duration-150",
    className
  )}
  style:color="var({CONF.colorVar})"
  style:border-color="var({CONF.colorVar})"
  style:background="var(--color-panel)"
  title={`${CONF.label} (${level}/5): ${HELP[level]}`}
>
  <span
    class="h-1.5 w-1.5 shrink-0"
    style:background="var({CONF.colorVar})"
    aria-hidden="true"
  ></span>
  {#if showLabel}
    <span>{CONF.label}</span>
  {/if}
  <span class="num text-[10px]">{level}/5</span>
</span>
