<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import CourseWindow from "$lib/components/CourseWindow.svelte";
  import PhaseList from "$lib/components/PhaseList.svelte";
  import RecordStrip from "$lib/components/RecordStrip.svelte";
  import {
    COURSE_PAGES,
    courseActivities,
    courseFreePhases,
    coursePhases,
    trackActivities,
    trackPhases,
    type CoursePage,
  } from "$lib/content/courses";
  import { LOOP_STEPS } from "$lib/content/site";

  /* One course, one page.
   *
   * A language is a volume: the language track and, for Go and Rust, the
   * service track behind it. The hero states the promise and the manifest; the
   * page then explains what the course is, what the reader builds, every phase
   * with its goal and activity count, the shape of a phase, the record, and
   * the next volume. No phase is hidden. */

  let { data }: PageProps = $props();

  const course = $derived(data.course as CoursePage);
  const release = $derived(data.release);

  const phases = $derived(coursePhases(course));
  const activities = $derived(courseActivities(course));
  const free = $derived(courseFreePhases(course));
  const firstPhase = $derived(trackPhases(course.tracks[0])[0]?.[1] ?? "the first phase");

  const index = $derived(COURSE_PAGES.findIndex((item) => item.slug === course.slug));
  const previous = $derived(COURSE_PAGES[(index - 1 + COURSE_PAGES.length) % COURSE_PAGES.length]);
  const next = $derived(COURSE_PAGES[(index + 1) % COURSE_PAGES.length]);

  const shape = $derived(course.slug === "zig" ? "Learn, ask, solve, review" : "Learn, solve, review");
</script>

<PageHead
  title={`${course.title} · NEXORA`}
  description={course.promise}
  path={`/courses/${course.slug}`}
/>

<section class="course-hero" data-course={course.accent}>
  <div class="container-page">
    <nav class="crumbs num" aria-label="Breadcrumb">
      <a href="/courses">All courses</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{course.title}</span>
    </nav>

    <div class="hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">{course.language}</p>
        <h1 class="display hero-title">{course.title}</h1>
        <p class="hero-promise">{course.promise}</p>

        <div class="hero-actions">
          <ActionLink href="/download" size="lg" island>{release.label}</ActionLink>
          <ActionLink href="#phases" variant="ghost" size="lg">Read the phases</ActionLink>
        </div>

        <dl class="hero-stats num">
          <div><dt>Phases</dt><dd>{phases.length}</dd></div>
          <div><dt>Activities</dt><dd>{activities}</dd></div>
          <div><dt>Free</dt><dd>{free}</dd></div>
          <div><dt>Tracks</dt><dd>{course.tracks.length}</dd></div>
        </dl>
      </div>

      <div class="hero-art">
        <CourseWindow {course} />
      </div>
    </div>
  </div>
</section>

<section class="section-pad intro-section">
  <div class="container-page intro-grid">
    <div>
      <SectionHead title="What it is." />
      {#each course.intro as paragraph (paragraph)}
        <p class="intro-body">{paragraph}</p>
      {/each}

      <div class="use-block">
        <p class="stamp use-label">Where it is used</p>
        <ul class="use-list">
          {#each course.use as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="build-card card">
      <p class="stamp build-label">What you build</p>
      <ol class="build-list">
        {#each course.build as item, i (item.title)}
          <li>
            <span class="build-n num">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3 class="build-title">{item.title}</h3>
              <p class="build-body">{item.body}</p>
            </div>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>

<section id="phases" class="section-pad phases-section" data-course={course.accent}>
  <div class="container-page">
    <div class="phases-top">
      <SectionHead
        title="The phases."
        caption="Every phase in the shipped manifest, with its own goal and activity count. The tier is stated in words."
        wide
      />
      {#if course.tracks.length > 1}
        <nav class="track-jump num" aria-label="Tracks">
          {#each course.tracks as track, i (track.slug)}
            <a href={`#track-${track.slug}`}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {track.title}
            </a>
          {/each}
        </nav>
      {/if}
    </div>

    {#each course.tracks as track, i (track.slug)}
      <div id={`track-${track.slug}`} class="track-block">
        <div class="track-head">
          <div>
            <p class="eyebrow">{track.eyebrow}</p>
            <h3 class="display track-title">{track.title}</h3>
            <p class="track-summary">{track.summary}</p>
          </div>
          <p class="num track-meta">
            {trackPhases(track).length} phases · {trackActivities(track)} activities
          </p>
        </div>
        <PhaseList {track} {shape} />
      </div>
    {/each}
  </div>
</section>

<section class="loop-section" data-course={course.accent}>
  <div class="container-page">
    <SectionHead
      title="The shape of a phase."
      caption="Every phase uses the same five moves. The help is explicit about how much of the answer it gives, and it runs out as the course goes on."
      wide
    />
    <ol class="loop">
      {#each LOOP_STEPS as step (step.n)}
        <li>
          <span class="loop-n num">{step.n}</span>
          <h3 class="loop-name">{step.name}</h3>
          <p class="loop-body">{step.body}</p>
        </li>
      {/each}
    </ol>
  </div>
</section>

<RecordStrip />

<section class="section-pad next-section">
  <div class="container-page">
    <div class="next-top">
      <SectionHead title="Where it fits." caption="The shelf is a sequence, not a ranking. Take the next volume when this one is done." wide />
    </div>

    <div class="next-grid">
      <a class="next-card card card-lift" href={`/courses/${previous.slug}`} data-course={previous.accent}>
        <p class="stamp">Previous</p>
        <p class="display next-title">{previous.title}</p>
        <p class="next-promise">{previous.promise}</p>
        <span class="next-arrow" aria-hidden="true">←</span>
      </a>
      <a class="next-card card card-lift" href={`/courses/${next.slug}`} data-course={next.accent}>
        <p class="stamp">Next</p>
        <p class="display next-title">{next.title}</p>
        <p class="next-promise">{next.promise}</p>
        <span class="next-arrow" aria-hidden="true">→</span>
      </a>
    </div>

    <div class="course-close" data-course={course.accent}>
      <div>
        <p class="stamp close-label">The first phase</p>
        <h2 class="display close-title">Start with {firstPhase.toLowerCase()}.</h2>
      </div>
      <div class="close-actions">
        <ActionLink href="/download" size="lg" island>{release.label}</ActionLink>
        <ActionLink href="/pricing" variant="ghost" size="lg">See pricing</ActionLink>
      </div>
    </div>
  </div>
</section>

<style>
  /* ---------- Hero ---------- */

  .course-hero {
    background:
      radial-gradient(70% 90% at 90% 0%, color-mix(in srgb, var(--course, var(--color-accent)) 8%, transparent), transparent 60%),
      var(--color-ground);
    padding-block: var(--space-6) clamp(3rem, 6vw, 5.5rem);
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 9.5px;
    color: var(--color-faint);
  }

  .course-hero .eyebrow {
    color: var(--course, var(--color-accent));
  }

  .crumbs a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--color-muted);
    text-decoration: none;
  }

  .crumbs a:hover {
    color: var(--color-accent);
  }

  .crumbs [aria-current] {
    color: var(--color-ink);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
    margin-top: var(--space-8);
  }

  @media (min-width: 1080px) {
    .hero-grid {
      grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
      gap: clamp(2.5rem, 5vw, 4.5rem);
    }
  }

  .hero-copy {
    min-width: 0;
  }

  .hero-title {
    margin-top: var(--space-4);
    font-size: var(--text-page);
    line-height: 0.96;
    letter-spacing: -0.055em;
    color: var(--color-ink);
  }

  .hero-promise {
    margin-top: var(--space-4);
    max-width: 40ch;
    font-size: clamp(1.05rem, 1.6vw, 1.25rem);
    line-height: 1.55;
    color: var(--color-muted);
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }

  .hero-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
    margin: var(--space-7) 0 0;
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
  }

  .hero-stats dt {
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-faint);
  }

  .hero-stats dd {
    margin: 0.2rem 0 0;
    font-size: 1.05rem;
    color: var(--color-ink);
  }

  .hero-art {
    min-width: 0;
  }

  /* ---------- Intro ---------- */

  .intro-section {
    background: var(--color-panel);
    border-block: 1px solid var(--color-rule);
  }

  .intro-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: start;
  }

  @media (min-width: 980px) {
    .intro-grid {
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .intro-body {
    margin-top: var(--space-4);
    max-width: 56ch;
    font-size: 15px;
    line-height: 1.7;
    color: var(--color-muted);
  }

  .use-block {
    margin-top: var(--space-7);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
  }

  .use-label {
    color: var(--color-faint);
  }

  .use-list {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .use-list li {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding-block: var(--space-2);
    font-size: 13.5px;
    color: var(--color-ink);
  }

  .use-list li::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--course, var(--color-accent));
    flex: none;
  }

  .build-card {
    padding: var(--space-6);
    background:
      radial-gradient(100% 80% at 100% 0%, color-mix(in srgb, var(--course, var(--color-accent)) 8%, transparent), transparent 60%),
      var(--color-panel);
  }

  @media (min-width: 640px) {
    .build-card {
      padding: var(--space-8);
    }
  }

  .build-label {
    color: var(--color-faint);
  }

  .build-list {
    list-style: none;
    margin: var(--space-5) 0 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .build-list li {
    display: grid;
    grid-template-columns: 1.8rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule);
  }

  .build-n {
    padding-top: 0.15rem;
    font-size: 9px;
    color: var(--course, var(--color-accent));
  }

  .build-title {
    font-family: var(--font-display);
    font-size: 1.02rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .build-body {
    margin-top: 0.2rem;
    max-width: 42ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  /* ---------- Phases ---------- */

  .phases-top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-5);
  }

  .track-jump {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .track-jump a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding-inline: 0.8rem;
    border: 1px solid var(--color-rule-strong);
    border-radius: var(--radius-chip);
    color: var(--color-ink);
    font-size: 10.5px;
    text-decoration: none;
    transition:
      border-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }

  .track-jump a:hover {
    border-color: var(--course, var(--color-accent));
    color: var(--course, var(--color-accent));
  }

  .track-block {
    margin-top: var(--space-10);
    scroll-margin-top: 7rem;
  }

  .track-block + .track-block {
    margin-top: clamp(3.5rem, 6vw, 6rem);
    padding-top: clamp(2rem, 4vw, 3rem);
    border-top: 1px solid var(--color-rule-strong);
  }

  .track-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .track-title {
    margin-top: var(--space-2);
    font-size: clamp(1.6rem, 2.8vw, 2.2rem);
    color: var(--color-ink);
  }

  .track-summary {
    margin-top: var(--space-2);
    max-width: 52ch;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .track-meta {
    font-size: 9.5px;
    color: var(--color-faint);
    white-space: nowrap;
  }

  /* ---------- Loop ---------- */

  .loop-section {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .loop {
    list-style: none;
    margin: var(--space-8) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  @media (min-width: 720px) {
    .loop {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1080px) {
    .loop {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: var(--space-5);
    }
  }

  .loop li {
    padding-top: var(--space-4);
    border-top: 2px solid color-mix(in srgb, var(--course, var(--color-accent)) 55%, var(--color-rule));
  }

  .loop-n {
    font-size: 9px;
    color: var(--color-faint);
  }

  .loop-name {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-ink);
  }

  .loop-body {
    margin-top: var(--space-2);
    max-width: 34ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  /* ---------- Next ---------- */

  .next-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-8);
  }

  @media (min-width: 720px) {
    .next-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .next-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-6);
    color: var(--color-ink);
    text-decoration: none;
    position: relative;
  }

  .next-card .stamp {
    color: var(--color-faint);
  }

  .next-title {
    font-size: clamp(1.4rem, 2.4vw, 1.9rem);
  }

  .next-promise {
    max-width: 38ch;
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .next-arrow {
    position: absolute;
    right: var(--space-5);
    bottom: var(--space-5);
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--color-raised);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 13px;
    transition:
      background-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }

  .next-card:hover .next-arrow {
    background: var(--course, var(--color-accent));
    color: var(--color-on-accent);
  }

  .course-close {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    margin-top: var(--space-10);
    padding: clamp(2rem, 4vw, 3rem);
    border-radius: var(--radius);
    background:
      radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, var(--course, var(--color-accent)) 16%, transparent), transparent 60%),
      var(--color-raised);
    border: 1px solid color-mix(in srgb, var(--course, var(--color-accent)) 28%, var(--color-rule));
  }

  .close-label {
    color: var(--color-faint);
  }

  .close-title {
    margin-top: var(--space-2);
    max-width: 16ch;
    font-size: clamp(1.8rem, 3.6vw, 2.8rem);
  }

  .close-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
</style>
