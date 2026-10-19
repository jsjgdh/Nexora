<script lang="ts">
  import { AUDIENCES } from "$lib/content/site";

  /* The mode selector.
   *
   * `MARKET.md` §3 splits the market in two — the person learning and the
   * person who hires — and they arrive with different questions, so the hero
   * answers both. The selector is a real control with two real buttons, each
   * carrying `aria-pressed`, and it is the only thing on the page that
   * changes what the reader sees.
   *
   * Both arguments exist as full sections further down the page, so the
   * selector is a convenience and never the only way in: a crawler, a reader
   * with the script switched off, and a screen reader all meet the whole
   * argument without touching it. The switch is labelled in words rather than
   * by an icon, because "I am hiring" and "I am learning" are the two
   * sentences a visitor actually thinks in. */

  type Props = { value?: string };

  let { value = $bindable("learner") }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
  <p class="text-[13px] text-muted" id="audience-label">Who is this for?</p>
  <div class="flex border border-control" role="group" aria-labelledby="audience-label">
    {#each AUDIENCES as audience (audience.id)}
      <button
        type="button"
        aria-pressed={value === audience.id}
        onclick={() => (value = audience.id)}
        class="min-h-[44px] px-4 text-[12.5px] font-bold uppercase tracking-[0.08em] transition-[color,background-color,border-color] duration-200
          {value === audience.id ? 'bg-accent text-ground' : 'bg-transparent text-muted hover:text-ink'}"
      >
        {audience.label}
      </button>
    {/each}
  </div>
</div>
