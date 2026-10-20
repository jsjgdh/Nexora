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
   * ruling a line under each group it is about to read.
   *
   * `clusters` chooses which groups to print, and the page chooses: the one
   * that says where the product runs belongs under the poster, and the two
   * that say what decides a verdict belong with the assessment. One sheet,
   * read in the two places a reader actually wants it. */

  type Props = {
    /** The cluster names to print. All of them when this is left out. */
    clusters?: readonly string[];
    /**
     * The heading level of a cluster name.
     *
     * A cluster name is a heading, and a heading has to sit at the right level
     * in the document or a screen reader is told to jump. Under the poster on
     * the homepage there is no section heading above the sheet, so the cluster
     * is the top-level heading of that strip and says so. Inside a section that
     * has its own heading, the cluster is one step below it.
     */
    headingLevel?: 2 | 3;
  };

  let { clusters, headingLevel = 3 }: Props = $props();

  const groups = $derived(
    clusters ? SPEC.filter((group) => clusters.includes(group.cluster)) : SPEC
  );
</script>

<div class="border-t border-b border-l border-rule" use:inViewStagger>
  {#each groups as group, index (group.cluster)}
    {#if index > 0}
      <div class="draw col-span-full h-px w-full bg-rule-strong" aria-hidden="true"></div>
    {/if}
    <div class="border-r px-5 pb-5 pt-7 sm:px-6 sm:pb-6 sm:pt-9">
      <svelte:element
        this={headingLevel === 2 ? "h2" : "h3"}
        class="display text-[clamp(1.15rem,1.8vw,1.45rem)] text-ink"
      >
        {group.cluster}
      </svelte:element>
    </div>
    {#each group.rows as row (row.param)}
      <div
        class="fade-up grid gap-x-8 gap-y-2 border-r px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1.1fr)] lg:items-baseline"
        data-stagger-item
      >
        <p class="text-[13.5px] text-faint">{row.param}</p>
        <p class="text-[16px] font-semibold text-ink">{row.value}</p>
        <p class="max-w-[46ch] text-[14.5px] leading-relaxed text-muted">{row.note}</p>
      </div>
    {/each}
  {/each}
</div>
