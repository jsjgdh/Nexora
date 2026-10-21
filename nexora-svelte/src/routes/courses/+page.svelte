<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import PhaseField from "$lib/components/PhaseField.svelte";
  import PhaseMatrix from "$lib/components/PhaseMatrix.svelte";
  import CourseLedger from "$lib/components/CourseLedger.svelte";
  import FactStrip from "$lib/components/FactStrip.svelte";
  import { COURSES, ALL_PHASES, FREE_PHASE_COUNT_WORD_CAPITAL } from "$lib/content/site";
  import {
    COURSE_ACTIVITY_COUNTS,
    COURSE_DESCRIPTIONS,
  } from "$lib/content/phase-detail.generated";
  import { pageTitle } from "$lib/seo";

  /* The curriculum, on its own page.
   *
   * The homepage carries a compact view of this, because a homepage that
   * prints eighty phase names before it has said what the product does is a
   * catalogue. This page is the catalogue, for the reader who came for it:
   * every course, every phase, and the manifest's own sentence about what
   * each phase is for.
   *
   * Every number here is read from the shipped manifests rather than written
   * down here. The phase list, the goals, the activity counts and the
   * descriptions all come from the same files the IDE ships, so a phase
   * renamed in the IDE reaches this page on the next sync, and the suite
   * fails if the two ever disagree. */

  let { data }: PageProps = $props();

  const totalActivities = Object.values(COURSE_ACTIVITY_COUNTS).reduce((n, c) => n + c, 0);
  const totalPhases = ALL_PHASES.length;

  function openCourse(pick: { courseSlug: string }): void {
    const trigger = document.querySelector<HTMLButtonElement>(
      `[aria-controls="course-panel-${pick.courseSlug}"]`
    );
    trigger?.click();
    const head = document.getElementById(`course-head-${pick.courseSlug}`);
    head?.scrollIntoView({ behavior: "auto", block: "center" });
  }
</script>

<PageHead
  title={pageTitle("Courses")}
  description="Every shipped phase of the NEXORA curriculum, and the goal of each one, read from the manifests the IDE ships."
  path="/courses"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["The whole curriculum,", "phase by phase."]}
    class="max-w-[26ch] text-[clamp(2.2rem,6.2vw,4.6rem)] text-ink"
  />
  <p class="reading mt-7 max-w-[56ch] text-[clamp(1.05rem,1.8vw,1.35rem)] leading-snug text-muted">
    {totalPhases} phases and {totalActivities} activities, across the courses below. Every phase
    carries the goal the shipped manifest writes for it, so this page says what each one is for
    rather than only naming it.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-16 sm:px-8">
  <FactStrip />
</div>

<!-- The field: the same manifest, read as one point per phase. -->
<section class="border-t border-rule">
  <div class="relative z-10 mx-auto max-w-[1320px] px-5 py-16 sm:px-8 sm:py-20">
    <PhaseField onselect={openCourse} />
  </div>
</section>

<!-- The courses, with the manifest's own description of each. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="Every course, in the order they are meant to be taken."
      caption="The first is the way in. The two Go courses sit behind it, the Rust ledger is a second main line, and the API course gates nothing at all."
      wide
    />

    <ul class="mt-14 border-t border-rule-strong">
      {#each COURSES as course (course.slug)}
        <li class="grid gap-4 border-b border-rule-strong py-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,10rem)] lg:gap-10">
          <div class="min-w-0">
            <h2 class="display text-[clamp(1.4rem,2.6vw,2rem)] text-ink">{course.title}</h2>
            <p class="stamp mt-2 text-[11px] text-faint">{course.label}</p>
          </div>
          <div class="min-w-0">
            <p class="reading max-w-[62ch] text-[16.5px] leading-relaxed text-muted">
              {COURSE_DESCRIPTIONS[course.slug] ?? course.sub}
            </p>
          </div>
          <div class="min-w-0 lg:text-right">
            <p class="num text-[15px] font-semibold text-ink">{course.phases.length} phases</p>
            <p class="num mt-1 text-[13px] text-muted">
              {COURSE_ACTIVITY_COUNTS[course.slug] ?? 0} activities
            </p>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</section>

<!-- The plate of lights and the ledger: the manifest itself. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <div class="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
      <div class="min-w-0">
        <PhaseMatrix />
        <p class="mt-5 text-[13.5px] leading-relaxed text-faint">
          One point per shipped phase, and every point is the same ink, because a public page does
          not put a price on a phase.
        </p>
      </div>
      <div class="min-w-0">
        <h2 class="display max-w-[20ch] text-[clamp(1.6rem,3vw,2.4rem)] text-ink">
          Every phase, and what it is for.
        </h2>
        <p class="reading mt-4 max-w-[58ch] text-[16.5px] leading-relaxed text-muted">
          Open a course to read its list. The sentence under each phase is the one the shipped
          manifest writes about it.
        </p>
        <div class="mt-10">
          <CourseLedger />
        </div>
      </div>
    </div>
  </div>
</section>

<!-- The door. -->
<section class="border-t-2 border-rule-strong">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <Headline
      lines={[`${FREE_PHASE_COUNT_WORD_CAPITAL} of these ship`, "inside the installer."]}
      class="max-w-[18ch] text-[clamp(1.9rem,4.6vw,3.4rem)] text-ink"
    />
    <p class="reading mt-7 max-w-[52ch] text-[17px] leading-relaxed text-muted">
      They run offline, they need no account, and every check you will ever run is free.
    </p>
    <div class="mt-9 flex flex-wrap items-center gap-3">
      <ActionLink href="/download" island>{data.release.label}</ActionLink>
      <ActionLink href="/pricing" variant="ghost">See pricing</ActionLink>
    </div>
  </div>
</section>
