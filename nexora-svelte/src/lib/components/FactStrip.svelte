<script lang="ts">
  import { FACTS } from "$lib/content/site";
  import { ticker } from "$lib/motion";

  /* The readings.
   *
   * Four measured facts, set as an instrument's readout row: a figure in
   * monospace and a label under it. Every figure is a count the suite can
   * check — eighty phases, nine free phases, and no badge of any kind — and
   * the last one is a zero, which is the number the whole product is arguing
   * for.
   *
   * The figure counts up when the row is first seen, and the element's own
   * text is the target, so a crawler and a reduced-motion visitor read the
   * real number rather than a zero. */
</script>

<div class="grid grid-cols-2 border-t border-l border-rule sm:grid-cols-4">
  {#each FACTS as fact (fact.label)}
    <div class="border-r border-b border-rule px-5 py-6 sm:px-6 sm:py-7">
      <p class="num text-[clamp(2rem,4.4vw,3rem)] leading-none font-bold text-ink" use:ticker>
        {fact.value}
      </p>
      <p class="mt-3 max-w-[22ch] text-[12.5px] leading-snug text-muted">{fact.label}</p>
    </div>
  {/each}
</div>
