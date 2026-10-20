<script lang="ts">
  import TierStamp from "./TierStamp.svelte";

  /* The atom of the curriculum: a mono position, a name, a tier.
   *
   * Kept as the primary list row because it was the best idea in the previous
   * build: a phase list that reads like a diff is a phase list that reads like
   * the work. The state of a row, when there is one, is carried in the mark
   * gutter and in the border form (`data-state` in app.css) before it is ever
   * carried in a colour, and the tier is always printed as a word. Nothing
   * here depends on hue to be legible.
   *
   * It is a plain `<li>`: the list semantics belong to the list that owns it. */

  type Props = {
    index: number;
    title: string;
    /** The phase's goal, when the row is showing it.
     *
     *  The goal is the shipped manifest's own sentence about what the phase
     *  is for. A list of eighty names tells a reader how much there is; the
     *  goal tells them what they would be doing. */
    goal?: string;
    /** The tier, when the row is showing it. The public ledger does not: the
     *  front page is a syllabus, not a price list, and the tier is the
     *  pricing page's business and the IDE's. */
    tier?: "free" | "pro";
    state?: "completed" | "recommended" | "available" | "locked";
  };

  let { index, title, goal, tier, state = "available" }: Props = $props();

  const position = $derived(String(index + 1).padStart(2, "0"));
  const mark = $derived(state === "completed" ? "✓" : state === "recommended" ? "→" : "·");
</script>

<li class="phase-row" data-state={state}>
  <span class="row-mark" aria-hidden="true">{position} {mark}</span>
  <span class="row-title min-w-0 truncate text-[14.5px] text-ink">{title}</span>
  {#if tier}
    <TierStamp {tier} />
  {/if}
  {#if goal}
    <p class="reading col-span-full mt-1.5 max-w-[62ch] pl-[3.6rem] text-[15px] leading-relaxed text-muted">
      {goal}
    </p>
  {/if}
</li>
