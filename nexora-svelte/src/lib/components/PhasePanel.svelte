<script lang="ts">
  import { COURSES } from "$lib/content/site";
  import { PHASE_DETAIL } from "$lib/content/phase-detail.generated";
  import { inView } from "$lib/motion";
  import { cn } from "$lib/format";

  /* A phase, from the shipped course.
   *
   * This is the product, near the top of the page, and it is not a picture of
   * the product. Every word in it is the shipped manifest's own: the course
   * name, the phase title, the sentence the manifest writes about what the
   * phase is for, and the number of activities it says the phase holds. The
   * phase list on the left is the real curriculum, in the real order, and the
   * reader can walk it.
   *
   * A screenshot of an editor that does not exist yet would be theatre. A
   * panel that reads the manifest is the thing itself, and it cannot fall out
   * of step with what the IDE ships: when a phase is renamed, this panel
   * changes on the next sync, and the suite checks the two agree.
   *
   * The four steps are the shape every phase has. The sentence is the
   * manifest's own, and the panel says so rather than inventing a diagram. */

  const COURSE = COURSES[0];
  const detail = $derived(PHASE_DETAIL[COURSE?.slug ?? "task-manager"] ?? {});

  let selected = $state<string>(COURSE?.phases[2]?.[0] ?? COURSE?.phases[0]?.[0] ?? "");

  const phase = $derived.by(() => {
    const row = COURSE?.phases.find(([id]) => id === selected);
    if (!row) return null;
    const info = detail[row[0]];
    return {
      id: row[0],
      title: row[1],
      tier: row[2],
      index: (COURSE?.phases.findIndex(([id]) => id === row[0]) ?? 0) + 1,
      goal: info?.goal ?? "",
      activities: info?.activities ?? 0,
    };
  });

  const SHAPE = [
    { name: "Learn", note: "a read with examples" },
    { name: "Check", note: "a question, answered" },
    { name: "Solve", note: "a task in your files" },
    { name: "Review", note: "a transfer, alone" },
  ];
</script>

<div class="border border-rule bg-panel">
  <!-- The rail: the course, in order, as it ships. -->
  <div class="grid lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)]">
    <div class="border-b border-rule lg:border-r lg:border-b-0">
      <p class="stamp border-b border-rule px-4 py-3 text-[11px] text-faint">
        {COURSE?.title} · {COURSE?.phases.length} phases
      </p>
      <ol class="nice-scroll max-h-[19rem] overflow-y-auto">
        {#each COURSE?.phases ?? [] as [id, title], i (id)}
          <li>
            <button
              type="button"
              data-phase-pick={id}
              aria-pressed={selected === id}
              onclick={() => (selected = id)}
              class={cn(
                "flex min-h-[44px] w-full cursor-pointer items-baseline gap-3 border-b border-rule px-4 py-2.5 text-left transition-[color,background-color] duration-200",
                selected === id ? "bg-raised text-ink" : "text-muted hover:text-ink"
              )}
            >
              <span class="num shrink-0 text-[11px] text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span class="min-w-0 text-[13.5px] leading-snug">{title}</span>
            </button>
          </li>
        {/each}
      </ol>
    </div>

    <!-- The phase itself: what it is, and what it holds. -->
    {#if phase}
      <div class="px-5 py-6 sm:px-8 sm:py-8">
        <p class="num text-[11.5px] text-faint">
          phase {String(phase.index).padStart(2, "0")} of {COURSE?.phases.length}
          <span class="mx-2 text-faint">/</span>
          {phase.activities} activities
          <span class="mx-2 text-faint">/</span>
          {phase.tier === "free" ? "free" : "pro"}
        </p>

        <h2 class="display mt-4 max-w-[20ch] text-[clamp(1.6rem,3.4vw,2.6rem)] text-ink">
          {phase.title}
        </h2>

        {#if phase.goal}
          <p class="reading mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
            {phase.goal}
          </p>
        {/if}

        <ol class="mt-8 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {#each SHAPE as step, i (step.name)}
            <li class="bg-panel px-4 py-4">
              <p class="num text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</p>
              <p class="display mt-2 text-[15px] font-semibold text-ink">{step.name}</p>
              <p class="mt-1 text-[12.5px] leading-snug text-muted">{step.note}</p>
            </li>
          {/each}
        </ol>

        <p class="mt-6 text-[12.5px] leading-relaxed text-faint">
          Every phase is Learn, then Solve, then Review. This panel reads the shipped manifest, so
          what it prints is what the IDE ships.
        </p>
      </div>
    {/if}
  </div>
</div>
