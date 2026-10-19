<script lang="ts">
  import { COURSES } from "$lib/content/site";
  import PhaseRow from "./PhaseRow.svelte";

  /* The curriculum as a ledger, not a row of cards.
   *
   * Three courses, each a heavy rule and a poster-scale name; open one and the
   * full shipped phase list unfolds underneath with its real tiers. The rows
   * and the names come from `$lib/content/site`, which is the module the suite
   * compares against the IDE manifest — so the count printed here cannot drift
   * away from what the IDE actually ships.
   *
   * One course is open at a time and the first one starts open, so the section
   * is never a wall of closed drawers. The trigger is a real button with
   * `aria-expanded` and `aria-controls`; the closed panel is `inert`, so a
   * keyboard cannot tab into a drawer the eye cannot see.
   *
   * `focus` is how the field above opens a course: it names the course, and
   * the drawer opens. It is the same state the button sets, so there is one
   * truth about which drawer is open. */

  let { focus }: { focus?: string | null } = $props();

  let openSlug = $state<string | null>(COURSES[0]?.slug ?? null);

  /* A course named from outside opens itself. The effect is keyed on the
     name, so the same course named twice does not re-open a drawer the
     reader has since closed. */
  $effect(() => {
    if (focus) openSlug = focus;
  });

  function toggle(slug: string): void {
    openSlug = openSlug === slug ? null : slug;
  }
</script>

<div class="border-t border-rule-strong">
  {#each COURSES as course (course.slug)}
    {@const isOpen = openSlug === course.slug}
    <div class="border-b border-rule-strong">
      <h3 class="m-0">
        <button
          type="button"
          id="course-head-{course.slug}"
          aria-expanded={isOpen}
          aria-controls="course-panel-{course.slug}"
          onclick={() => toggle(course.slug)}
          class="group flex w-full cursor-pointer items-center gap-5 bg-transparent px-0 py-6 text-left sm:py-8"
        >
          <span class="display min-w-0 flex-1 text-[clamp(1.75rem,4.6vw,3.6rem)] text-ink">
            {course.title}
          </span>
          <span class="hidden shrink-0 text-right sm:block">
            <span class="num block text-[15px] font-semibold text-ink">
              {course.phases.length} phases
            </span>
            <span class="mt-0.5 block max-w-[24ch] text-[12.5px] leading-snug text-muted">
              {course.sub}
            </span>
          </span>
          <span class="plus shrink-0" data-open={isOpen} aria-hidden="true"></span>
        </button>
      </h3>

      <div
        class="panel"
        data-open={isOpen}
        id="course-panel-{course.slug}"
        role="region"
        aria-labelledby="course-head-{course.slug}"
        inert={!isOpen}
      >
        <div class="panel-inner">
          <div class="grid gap-6 pb-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-12">
            <div>
              <p class="stamp text-faint">{course.label}</p>
              <p class="mt-3 max-w-[30ch] text-[15px] leading-relaxed text-muted">
                {course.title} ships {course.phases.length} phases inside the IDE, judged there, end
                to end. This page only lists them.
              </p>
            </div>
            <ol class="border border-rule">
              {#each course.phases as [id, title], i (id)}
                <PhaseRow index={i} {title} />
              {/each}
            </ol>
          </div>
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .panel {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 380ms var(--ease-sheet);
  }
  .panel[data-open="true"] {
    grid-template-rows: 1fr;
  }
  .panel-inner {
    overflow: hidden;
  }

  /* A drawn plus/minus, in the same one-pixel rule as every other rule, with
     the lamp amber when the drawer is open. */
  .plus {
    position: relative;
    width: 34px;
    height: 34px;
    border: 1px solid var(--color-rule-strong);
    transition:
      background 200ms var(--ease-out),
      border-color 200ms var(--ease-out);
  }
  .plus::before,
  .plus::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 13px;
    height: 1.5px;
    background: var(--color-ink);
    transform: translate(-50%, -50%);
    transition:
      transform 260ms var(--ease-sheet),
      background 200ms var(--ease-out);
  }
  .plus::after {
    transform: translate(-50%, -50%) rotate(90deg);
  }
  .plus[data-open="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  .plus[data-open="true"]::before,
  .plus[data-open="true"]::after {
    background: var(--color-ground);
  }
  .plus[data-open="true"]::after {
    transform: translate(-50%, -50%) rotate(0deg);
  }
</style>
