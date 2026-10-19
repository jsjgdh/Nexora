<script lang="ts">
  import { MARKET } from "$lib/content/site";
  import { inView, inViewStagger } from "$lib/motion";

  /* The market the reader is walking into.
   *
   * Four readings, each with the study it came from, and the turn that
   * connects them to the product. The sources are printed because a number
   * with no source is a rumour, and a rumour is exactly what this page is
   * arguing against.
   *
   * The readings are text, not a chart with a slider: the value is the figure
   * and the label says what it is about. A chart would make a market report
   * out of four numbers, and the fourth number is the one that keeps the
   * other three from being despair. */
</script>

<div>
  <div class="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4" use:inViewStagger>
    {#each MARKET.readings as reading (reading.label)}
      <div
        class="fade-up flex flex-col bg-panel px-5 py-7 sm:px-6"
        data-reading
        data-stagger-item
      >
        <dl class="flex flex-col-reverse gap-2">
          <dt class="max-w-[26ch] text-[12.5px] leading-snug text-muted">{reading.label}</dt>
          <dd class="num text-[clamp(1.9rem,4vw,2.8rem)] leading-none font-bold text-ink">
            {reading.value}
          </dd>
        </dl>
        <p
          class="mt-auto border-t border-rule pt-3 text-[11.5px] leading-snug text-faint"
          data-source
        >
          {reading.source}
        </p>
      </div>
    {/each}
  </div>

  <p class="reading fade-up mt-10 max-w-[68ch] text-[16px] leading-relaxed text-muted" use:inView>
    {MARKET.turn}
  </p>
</div>
