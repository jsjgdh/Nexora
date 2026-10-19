<script lang="ts">
  import { COURSES } from "$lib/content/site";

  /* The manifest, as a plate of lights.
   *
   * Eighty small squares, one per shipped phase, in the order the courses
   * ship them. It is the same data the ledger below prints, read a third way,
   * and it is the quickest way to see the size of the thing: courses that are
   * not videos.
   *
   * The plate does not price anything. Every square is the same ink, because
   * a square that was a different colour because of what it costs would label
   * a phase on a public page, and the curriculum is not a catalogue with the
   * prices on it. The free count is stated once, in words, in the panel's own
   * line, which is the pricing page's business and the IDE's.
   *
   * The squares are `aria-hidden` decoration, and they are decoration on
   * purpose: making eighty cells into eighty tab stops would put a keyboard
   * user through a grid before they reached anything else, and the panel's own
   * live note says the same thing in words. The name of the phase under the
   * pointer is a pointer-only convenience, and the same names are all listed,
   * in full, in the ledger below, which is a list a keyboard can read.
   *
   * `data-readout` and `data-phase-cell` are hooks for the UX sweep, so it
   * can ask what the panel is saying without matching on the copy, which
   * changes whenever the curriculum changes. */

  const totals = $derived.by(() => {
    const all = COURSES.reduce((n, course) => n + course.phases.length, 0);
    const free = COURSES.reduce(
      (n, course) => n + course.phases.filter(([, , tier]) => tier === "free").length,
      0
    );
    return { all, free, pro: all - free };
  });

  let active = $state("");

  /** The name of the cell under the pointer, printed in the panel's own line. */
  function read(event: PointerEvent): void {
    const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-title]");
    active = cell?.dataset.title ?? "";
  }
</script>

<div class="border border-rule bg-panel">
  <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule px-5 py-4">
    <p class="stamp text-faint">the shipped manifest</p>
    <p class="num text-[11.5px] text-faint">
      {totals.all} phases · {totals.free} of them ship free
    </p>
  </div>

  <!-- The readout line: what is under the pointer, or the count of what the
       panel holds. It is a pointer convenience and a screen-reader summary at
       once, so the panel is never mute. -->
  <p class="num border-b border-rule px-5 py-2.5 text-[11.5px] text-faint" data-readout>
    {active || `${totals.all} phases on one spine · point at a point to name a phase`}
  </p>

  <div
    class="grid gap-5 px-5 py-6"
    role="presentation"
    onpointerover={read}
    onpointerleave={() => (active = "")}
  >
    {#each COURSES as course (course.slug)}
      <div class="grid gap-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center sm:gap-5">
        <p class="text-[13.5px] font-semibold text-ink">
          {course.title}
          <span class="num ml-2 text-[11.5px] text-faint">{course.phases.length} phases</span>
        </p>
        <div class="flex flex-wrap gap-[3px]" aria-hidden="true">
          {#each course.phases as phase (phase[0])}
            <span
              data-phase-cell
              data-title={`${String(course.phases.indexOf(phase) + 1).padStart(2, "0")} · ${phase[1]}`}
              class="block h-[16px] w-[16px] border border-rule-strong bg-ink/30 transition-[color,background-color,border-color] duration-300"
            ></span>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <p class="border-t border-rule px-5 py-4 text-[13.5px] leading-relaxed text-muted" aria-live="polite">
    {totals.free} phases ship inside the installer, offline and with no account. The other
    {totals.pro} open when the tier does, and the pricing page says what that costs.
  </p>
</div>
