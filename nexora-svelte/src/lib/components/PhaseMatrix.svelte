<script lang="ts">
  import { COURSES } from "$lib/content/site";

  /* The manifest, as a plate of lights.
   *
   * Eighty small squares — one per shipped phase — and a two-position
   * control that decides what your tier opens. It is the whole pricing story
   * in one object, and every square is a real phase drawn from the same
   * content module the course ledger and the drift gate read: add a phase to
   * the manifest and this plate grows a light.
   *
   * The squares are `aria-hidden` decoration, and they are decoration on
   * purpose: making eighty cells into eighty tab stops would put a
   * keyboard user through a grid before they reached anything else, and the
   * panel's own live note says the same thing in words. The name of the phase
   * under the pointer is a pointer-only convenience — the same names are all
   * listed, in full, in the ledger below, which is a list a keyboard can
   * read.
   *
   * `data-readout` and `data-phase-cell` are hooks for the UX sweep, so it can
   * ask what the panel is saying without matching on the copy, which changes
   * whenever the curriculum changes. */

  const TIERS = ["free", "pro"] as const;

  let tier = $state<"free" | "pro">("free");
  let active = $state("");

  const totals = $derived.by(() => {
    const all = COURSES.reduce((n, c) => n + c.phases.length, 0);
    const free = COURSES.reduce(
      (n, c) => n + c.phases.filter(([, , t]) => t === "free").length,
      0
    );
    return { all, free, pro: all - free };
  });

  /** The name of the cell under the pointer, printed in the panel's own line. */
  function read(event: PointerEvent): void {
    const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-title]");
    active = cell?.dataset.title ?? "";
  }
</script>

<div class="border border-rule bg-panel">
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-5 py-4">
    <p class="stamp text-faint">the shipped manifest, by tier</p>
    <div class="flex border border-control" role="group" aria-label="Choose a tier">
      {#each TIERS as option (option)}
        <button
          type="button"
          aria-pressed={tier === option}
          onclick={() => (tier = option)}
          class="min-h-[44px] px-4 text-[12.5px] font-bold uppercase tracking-[0.08em] transition-[color,background-color,border-color] duration-200
            {tier === option ? 'bg-accent text-ground' : 'bg-transparent text-muted hover:text-ink'}"
        >
          {option}
        </button>
      {/each}
    </div>
  </div>

  <!-- The readout line: what is under the pointer, or the count of what is
       open. It is a pointer convenience and a screen-reader summary at once,
       so the panel is never mute. -->
  <p class="num border-b border-rule px-5 py-2.5 text-[11.5px] text-faint" data-readout>
    {active || `${totals.all} phases shipped · ${totals.free} open on free`}
  </p>

  <div
    class="grid gap-5 px-5 py-6"
    role="presentation"
    onpointerover={read}
    onpointerleave={() => (active = "")}
  >
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
              data-phase-cell
              data-title={`${String(course.phases.indexOf(phase) + 1).padStart(2, "0")} · ${phase[1]}`}
              class="block h-[16px] w-[16px] border transition-[color,background-color,border-color] duration-300
                {phase[2] === 'free' ? 'border-added' : 'border-rule-strong'}
                {lit ? (phase[2] === 'free' ? 'bg-added' : 'bg-accent') : 'bg-raised-2'}"
            ></span>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <p class="border-t border-rule px-5 py-4 text-[13.5px] leading-relaxed text-muted" aria-live="polite">
    {#if tier === "pro"}
      All {totals.all} phases open inside the IDE you already have. Nothing to reinstall, and no
      second download.
    {:else}
      {totals.free} phases are open, free forever and with no account: the two that start the app,
      the four that teach Rust's rules, and the three that read an API. The other {totals.pro} open
      with Pro.
    {/if}
  </p>
</div>
