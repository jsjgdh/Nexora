<script lang="ts">
  import { COURSES } from "$lib/content/site";

  /* The curriculum as a plate of lights.
   *
   * Thirty-two small squares — one per shipped phase — and a two-position
   * control that decides what your tier opens. It is the whole pricing story
   * in one object, and every square is a real phase drawn from the same
   * content module the course ledger and the drift gate read: add a phase to
   * the manifest and this plate grows a light.
   *
   * The squares are `aria-hidden` decoration. What a screen reader gets is the
   * live note underneath, which states the same fact in words, and the shape
   * of each square is identical whether it is lit or dark — the state is
   * carried by the control the visitor pressed, not by colour alone. */

  const TIERS = ["free", "pro"] as const;

  let tier = $state<"free" | "pro">("free");

  const totals = $derived.by(() => {
    const all = COURSES.reduce((n, c) => n + c.phases.length, 0);
    const free = COURSES.reduce(
      (n, c) => n + c.phases.filter(([, , t]) => t === "free").length,
      0
    );
    return { all, free, pro: all - free };
  });
</script>

<div class="border border-rule bg-panel">
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-5 py-4">
    <p class="stamp text-faint">which phases are open, by tier</p>
    <div class="flex border border-control" role="group" aria-label="Choose a tier">
      {#each TIERS as option (option)}
        <button
          type="button"
          aria-pressed={tier === option}
          onclick={() => (tier = option)}
          class="min-h-[44px] px-4 text-[12.5px] font-bold uppercase tracking-[0.08em] transition-[color,background-color,border-color] duration-200
            {tier === option ? 'bg-ink text-paper-2' : 'bg-transparent text-muted hover:text-ink'}"
        >
          {option}
        </button>
      {/each}
    </div>
  </div>

  <div class="grid gap-5 px-5 py-6">
    {#each COURSES as course (course.slug)}
      <div class="grid gap-2 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center sm:gap-5">
        <p class="text-[13.5px] font-semibold text-ink">
          {course.title}
          <span class="num ml-2 text-[11.5px] text-faint">{course.phases.length}</span>
        </p>
        <div class="flex flex-wrap gap-[3px]" aria-hidden="true">
          {#each course.phases as phase (phase[0])}
            {@const lit = tier === "pro" || phase[2] === "free"}
            <span
              class="block h-[16px] w-[16px] border transition-[color,background-color,border-color] duration-300
                {phase[2] === 'free' ? 'border-added' : 'border-rule'}
                {lit ? (phase[2] === 'free' ? 'bg-added' : 'bg-accent') : 'bg-raised-2'}"
            ></span>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <p class="border-t border-rule px-5 py-4 text-[13.5px] leading-relaxed text-muted" aria-live="polite">
    {#if tier === "pro"}
      All {totals.all} phases open inside the IDE you already have — nothing to reinstall and no
      second download.
    {:else}
      {totals.free} phases are open: the base course, judged end to end, free forever with no
      account. The other {totals.pro} open with Pro.
    {/if}
  </p>
</div>
