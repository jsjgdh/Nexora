<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import CourseCard from "$lib/components/CourseCard.svelte";
  import CourseMark from "$lib/components/CourseMark.svelte";
  import CourseWindow from "$lib/components/CourseWindow.svelte";
  import { COURSE_PAGES, coursePhases } from "$lib/content/courses";
  import { ALL_PHASES, FREE_PHASE_COUNT, PRICING, money } from "$lib/content/site";
  import { pageTitle } from "$lib/seo";
  import { inViewStagger } from "$lib/motion";

  /* The shelf.
   *
   * A catalogue that is also an argument. The first card is the way in, the
   * language cards are the volumes, and the side course is marked as a side
   * course. Go and Rust each open one page with two tracks, so the reader does
   * not have to choose between a language and its service before they have
   * met either. */

  let { data }: PageProps = $props();

  const taskManager = COURSE_PAGES[0];
  const rest = COURSE_PAGES.slice(1);

  const totalPhases = ALL_PHASES.length;
  const freePhases = FREE_PHASE_COUNT;
</script>

<PageHead
  title={pageTitle("Courses")}
  description="Every shipped phase of the NEXORA curriculum, in one page per language, with the goal and activity count of each phase read from the manifest."
  path="/courses"
/>

<section class="shelf-hero">
  <div class="container-page shelf-hero-inner">
    <div>
      <h1 class="display shelf-title">Every language<br />has a page.</h1>
      <p class="shelf-lede">
        {totalPhases} phases, {freePhases} of them free, every one judged inside the editor. A
        language page carries its whole track list, so Go and Rust each hold the language and the
        service behind it.
      </p>
      <div class="shelf-actions">
        <ActionLink href="/download" size="lg" island>{data.release.label}</ActionLink>
        <ActionLink href="/pricing" variant="ghost" size="lg">See pricing</ActionLink>
      </div>
    </div>

    <nav class="shelf-index card" aria-label="Courses on the shelf">
      <p class="stamp shelf-index-label">On the shelf</p>
      <ul>
        {#each COURSE_PAGES as course (course.slug)}
          <li data-course={course.accent}>
            <a href={`/courses/${course.slug}`}>
              <CourseMark {course} size="1.9rem" />
              <span class="index-title">{course.title}</span>
              <span class="num index-count">{coursePhases(course).length} phases</span>
              <span class="index-arrow" aria-hidden="true">→</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </div>
</section>

<section class="section-pad featured-section">
  <div class="container-page featured">
    <div class="featured-copy">
      <h2 class="display featured-title">One app, from an empty folder to a reviewed pull request.</h2>
      <p class="featured-body">
        The Task Manager course is the way into the shelf. You build one JavaScript application,
        break it on purpose, test it, review it, and finish with a feature of your own.
      </p>
      <ul class="featured-points">
        <li>Your own workspace, not a sandbox reset between lessons.</li>
        <li>A check that names the file and the line when it fails.</li>
        <li>A receipt at the end that anyone can re-derive.</li>
      </ul>
      <ActionLink href={`/courses/${taskManager.slug}`} variant="ghost" island>
        Open Task Manager
      </ActionLink>
    </div>
    <div class="featured-art">
      <CourseWindow course={taskManager} />
    </div>
  </div>
</section>

<section class="section-pad volumes">
  <div class="container-page">
    <div class="volumes-top">
      <SectionHead
        title="The volumes."
        caption="Each page prints every phase from the shipped manifest, with its goal, its tier and its activity count."
        wide
      />
      <a href="/#how" class="volumes-link">How a phase runs <span aria-hidden="true">→</span></a>
    </div>

    <div class="course-grid" use:inViewStagger={{ step: 55 }}>
      {#each rest as course (course.slug)}
        <div class="cell reveal-item" data-course={course.accent} data-stagger-item>
          <CourseCard {course} />
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="arrangement">
  <div class="container-page">
    <div class="arrangement-grid">
      <div>
        <h2 class="display arrangement-title">A language, then the thing it runs.</h2>
      </div>
      <dl class="arrangement-list">
        <div>
          <dt>Language tracks</dt>
          <dd>Values, types, control flow, functions, errors and the standard library, judged by code that will not compile without the idea.</dd>
        </div>
        <div>
          <dt>Service tracks</dt>
          <dd>Go and Rust carry a second track: concurrency, HTTP, storage, tests, operations and a release you can defend.</dd>
        </div>
        <div>
          <dt>The side course</dt>
          <dd>APIs from the outside gates nothing. It can be read before, during or after the main line.</dd>
        </div>
      </dl>
    </div>
  </div>
</section>

<section class="shelf-close">
  <div class="container-page shelf-close-inner">
    <div>
      <h2 class="display close-title">Start with the first check.</h2>
      <p class="close-lede">
        The free phases ship inside the installer and need no account. Assessment is free at every
        tier, including Pro.
      </p>
    </div>
    <div class="close-actions">
      <ActionLink href="/download" variant="inverse" size="lg" island>{data.release.label}</ActionLink>
      <p class="close-price num">
        Pro is {money(PRICING.monthly)} a month, and assessment is never gated.
      </p>
    </div>
  </div>
</section>

<style>
  .shelf-hero {
    padding-block: clamp(3.5rem, 7vw, 6.5rem) clamp(2.5rem, 5vw, 4rem);
    border-bottom: 1px solid var(--color-rule);
    background:
      radial-gradient(55% 70% at 85% 20%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 62%);
  }

  .shelf-hero-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 1080px) {
    .shelf-hero-inner {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: clamp(3rem, 6vw, 5rem);
    }
  }

  .shelf-index {
    padding: var(--space-4);
  }

  .shelf-index-label {
    padding: var(--space-2) var(--space-3) var(--space-3);
    color: var(--color-faint);
  }

  .shelf-index ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .shelf-index li {
    border-bottom: 1px solid var(--color-rule);
  }

  .shelf-index a {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 50px;
    padding-inline: var(--space-2);
    color: var(--color-ink);
    text-decoration: none;
  }

  .shelf-index a:hover {
    background: var(--color-raised);
    border-radius: var(--radius-sm);
  }

  .index-title {
    font-size: 13px;
    font-weight: 600;
  }

  .index-count {
    margin-left: auto;
    font-size: 9px;
    color: var(--color-faint);
  }

  .index-arrow {
    color: var(--color-faint);
    font-family: var(--font-mono);
    font-size: 12px;
    transition: transform var(--dur-1) var(--ease-out);
  }

  .shelf-index a:hover .index-arrow {
    transform: translateX(2px);
    color: var(--course, var(--color-accent));
  }

  .shelf-title {
    margin-top: var(--space-5);
    font-size: var(--text-page);
    line-height: 0.94;
    letter-spacing: -0.055em;
  }

  .shelf-lede {
    margin-top: var(--space-5);
    max-width: 56ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.6;
    color: var(--color-muted);
  }

  .shelf-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-7);
  }

  .featured-section {
    background:
      radial-gradient(60% 90% at 90% 10%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 60%),
      var(--color-panel);
  }

  .featured {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 1080px) {
    .featured {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: clamp(3rem, 6vw, 5rem);
    }
  }

  .featured-title {
    margin-top: var(--space-4);
    max-width: 16ch;
    font-size: clamp(1.9rem, 3.8vw, 3rem);
  }

  .featured-body {
    margin-top: var(--space-4);
    max-width: 50ch;
    font-size: 14.5px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .featured-points {
    list-style: none;
    margin: var(--space-6) 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .featured-points li {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding-block: var(--space-2);
    border-bottom: 1px solid var(--color-rule);
    font-size: 13px;
    color: var(--color-ink);
  }

  .featured-points li::before {
    content: "✓";
    color: var(--color-pass);
    font-family: var(--font-mono);
    font-size: 9px;
  }

  .featured-art {
    min-width: 0;
  }

  .volumes {
    background: var(--color-ground);
  }

  .volumes-top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-5);
  }

  .volumes-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
    color: var(--color-accent);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .volumes-link:hover {
    text-decoration: underline;
  }

  .course-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-8);
  }

  @media (min-width: 720px) {
    .course-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1080px) {
    .course-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-5);
    }
  }

  .cell {
    display: flex;
    min-width: 0;
  }

  .cell > :global(*) {
    width: 100%;
  }

  .cell :global(.card) {
    height: 100%;
  }

  .arrangement {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .arrangement-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
  }

  @media (min-width: 980px) {
    .arrangement-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .arrangement-title {
    margin-top: var(--space-4);
    max-width: 15ch;
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  }

  .arrangement-list {
    margin: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .arrangement-list div {
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule-strong);
  }

  .arrangement-list dt {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .arrangement-list dd {
    margin: var(--space-2) 0 0;
    max-width: 54ch;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .shelf-close {
    background:
      radial-gradient(80% 120% at 80% 0%, color-mix(in srgb, var(--color-accent-bright) 50%, transparent), transparent 60%),
      var(--color-accent);
    color: var(--color-on-accent);
  }

  .shelf-close-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    padding-block: clamp(3.5rem, 6vw, 5.5rem);
  }

  .close-title {
    margin-top: var(--space-3);
    font-size: clamp(2rem, 4vw, 3.2rem);
    color: var(--color-on-accent);
  }

  .close-lede {
    margin-top: var(--space-3);
    max-width: 46ch;
    font-size: 14.5px;
    line-height: 1.6;
    color: color-mix(in srgb, var(--color-on-accent) 80%, transparent);
  }

  .close-actions {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
  }

  .close-price {
    font-size: 10px;
    color: color-mix(in srgb, var(--color-on-accent) 70%, transparent);
  }
</style>
