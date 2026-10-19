<script lang="ts">
  import { SPEC } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* The datasheet.
   *
   * The competitor's marketing says "you will build real things, and you will
   * know what you know". That is unfalsifiable, so it is stated here as a
   * table of readings instead: a parameter, the value it actually holds, and
   * a line that says what the value does not include.
   *
   * The readings are grouped into three clusters, and the grouping is the
   * argument: where it runs, what decides a verdict, what you keep. A table
   * with a hairline under every row says "a list of specifications"; a table
   * with three named groups says "a product, in three sentences". So the rule
   * between clusters is the only rule, and the rows inside a cluster are set
   * apart by space.
   *
   * The cluster rules draw themselves in as the section arrives, which is the
   * one entrance in the build that belongs to the datasheet alone: the bench
   * ruling a line under each group it is about to read. */
</script>

<div class="border-t border-b border-l border-rule" use:inViewStagger>
  {#each SPEC as group, index (group.cluster)}
    {#if index > 0}
      <div class="draw col-span-full h-px w-full bg-rule-strong" aria-hidden="true"></div>
    {/if}
    <div class="border-r px-5 pb-5 pt-7 sm:px-6 sm:pb-6 sm:pt-9">
      <h3 class="display text-[clamp(1.15rem,1.8vw,1.45rem)] text-ink">{group.cluster}</h3>
    </div>
    {#each group.rows as row (row.param)}
      <div
        class="fade-up grid gap-x-8 gap-y-2 border-r px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1.1fr)] lg:items-baseline"
        data-stagger-item
      >
        <p class="text-[13.5px] text-faint">{row.param}</p>
        <p class="text-[15.5px] font-semibold text-ink">{row.value}</p>
        <p class="max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{row.note}</p>
      </div>
    {/each}
  {/each}
</div>
