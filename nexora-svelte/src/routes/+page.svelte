<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import CourseCard from "$lib/components/CourseCard.svelte";
  import WorkspaceHero from "$lib/components/WorkspaceHero.svelte";
  import FeatureRow from "$lib/components/FeatureRow.svelte";
  import VerificationCard from "$lib/components/VerificationCard.svelte";
  import WorkspaceBand from "$lib/components/WorkspaceBand.svelte";
  import LaunchList from "$lib/components/LaunchList.svelte";
  import { COURSE_PAGES } from "$lib/content/courses";
  import {
    ALL_PHASES,
    BUILD_JOURNEY,
    COURSES,
    DIFFERENCES,
    EMPLOYER,
    FAQ,
    FREE_PHASE_COUNT,
    GAP,
    HERO_VARIANTS,
    PRICING_PLANS,
  } from "$lib/content/site";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";
  import { inViewStagger } from "$lib/motion";

  /* The front door.
   *
   * A statement, the product and the shelf. The hero pairs one claim with the
   * workspace it is about; the page then moves through the shelf, the problem,
   * the project, the proof, the mechanism, the hiring reader, the price and
   * the questions. Every count and phase name comes from the shipped manifest.
   * The only invented thing here is copy.
   *
   * The headline is assigned on the server and only the assigned variant is
   * rendered. The other two are not in the document. */

  let { data }: PageProps = $props();

  const variant = $derived(
    HERO_VARIANTS.find((item) => item.id === data.headline) ?? HERO_VARIANTS[0]
  );
  const release = $derived(data.release);

  const taskManager = COURSE_PAGES[0];
  const languageCourses = COURSE_PAGES.slice(1, 6);
  const apiCourse = COURSE_PAGES[6];

  const phaseNames = new Map<string, string>(
    COURSES[0].phases.map(([id, title]) => [id, title])
  );

  const totalPhases = ALL_PHASES.length;
  const freePhases = FREE_PHASE_COUNT;
  const faqs = FAQ.slice(0, 6);
  const checks = EMPLOYER.checks.slice(0, 3);
</script>

<PageHead title={SITE_TITLE} description={SITE_DESCRIPTION} path="/" />

<!-- 1 · The statement -->
<section class="hero" data-headline-variant={data.headline}>
  <div class="container-page hero-grid">
    <div class="hero-copy">
      <h1 class="display hero-title">
        <span>{variant.lineOne}</span>
        <span>{variant.lineTwo}</span>
      </h1>
      <p class="hero-lede">{variant.lede}</p>

      <div class="hero-actions">
        <ActionLink href="/download" size="lg" island>{release.label}</ActionLink>
        <ActionLink href="/courses" variant="ghost" size="lg">All courses</ActionLink>
      </div>

      <ul class="hero-facts num">
        <li>{totalPhases} phases</li>
        <li>{freePhases} free, no account</li>
        <li>Every verdict verifiable</li>
      </ul>
    </div>

    <div class="hero-art">
      <WorkspaceHero />
      <div class="annotation">
        <svg class="annotation-arrow" aria-hidden="true" viewBox="0 0 92 54" fill="none">
          <path d="M4 50c18-1 44-10 59-30 4-6 7-12 8-17M61 6l11-2 1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p>A real run. A real verdict. A receipt.</p>
      </div>
    </div>
  </div>
</section>

<!-- 2 · The capabilities -->
<section class="feature-band" aria-label="What the course does">
  <div class="container-page">
    <FeatureRow />
  </div>
</section>

<!-- 3 · The shelf -->
<section id="courses" class="section-pad">
  <div class="container-page">
    <div class="section-top">
      <SectionHead
        title="Choose your path."
        caption="One page per language. Go and Rust each carry two tracks, the language and the service behind it. Every phase name and count comes from the shipped manifest."
        wide
      />
      <a href="/courses" class="section-link">All courses <span aria-hidden="true">→</span></a>
    </div>

    <div class="course-grid" use:inViewStagger={{ step: 55 }}>
      <div class="cell cell-featured reveal-item" data-stagger-item>
        <CourseCard course={taskManager} featured />
      </div>
      {#each languageCourses as course (course.slug)}
        <div class="cell reveal-item" data-stagger-item>
          <CourseCard {course} />
        </div>
      {/each}
      <div class="cell reveal-item" data-stagger-item>
        <CourseCard course={apiCourse} />
      </div>
      <div class="cell all-courses reveal-item" data-stagger-item>
        <p class="stamp">The shelf</p>
        <p class="display all-title">Every course,<br />one page each.</p>
        <a class="all-link" href="/courses">All courses</a>
      </div>
    </div>
  </div>
</section>

<!-- 4 · The problem -->
<section class="gap-band">
  <div class="container-page gap-grid">
    <div>
      <h2 class="display gap-title">{GAP.title}</h2>
      <p class="gap-lead">{GAP.lead}</p>
    </div>
    <ol class="gap-lines">
      {#each GAP.lines as line, i (line)}
        <li data-turn={i === GAP.lines.length - 1 ? "true" : undefined}>
          <span class="num gap-n">{String(i + 1).padStart(2, "0")}</span>
          <span>{line}</span>
        </li>
      {/each}
    </ol>
  </div>
</section>

<!-- 5 · What you build -->
<section class="section-pad">
  <div class="container-page">
    <SectionHead title={BUILD_JOURNEY.title} caption={BUILD_JOURNEY.caption} wide />

    <ol class="beats">
      {#each BUILD_JOURNEY.beats as beat (beat.n)}
        <li>
          <span class="beat-n num">{beat.n}</span>
          <div>
            <h3 class="beat-title">{beat.title}</h3>
            <p class="beat-body">{beat.body}</p>
            <p class="beat-phases">
              {#each beat.phases as id (id)}
                <span class="phase-chip">{phaseNames.get(id) ?? id}</span>
              {/each}
            </p>
          </div>
        </li>
      {/each}
    </ol>
  </div>
</section>

<!-- 6 · The proof -->
<section id="proof" class="band proof-band">
  <div class="container-page">
    <VerificationCard />
  </div>
</section>

<!-- 7 · The mechanism -->
<section id="why" class="section-pad">
  <div class="container-page">
    <SectionHead
      title="Fewer promises. More mechanism."
      caption="Four properties of the product. Each one is a thing a reader can meet, not an adjective."
      wide
    />

    <div class="difference-grid" use:inViewStagger={{ step: 60 }}>
      {#each DIFFERENCES as item, i (item.property)}
        <article class="difference card" data-stagger-item>
          <span class="difference-n num">{String(i + 1).padStart(2, "0")}</span>
          <h3 class="difference-title">{item.property}</h3>
          <p class="difference-body">{item.meaning}</p>
          <p class="difference-where num">{item.enforced}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- 8 · The dark room -->
<WorkspaceBand />

<!-- 9 · For hiring -->
<section id="hiring" class="section-pad">
  <div class="container-page hiring">
    <div class="hiring-copy">
      <h2 class="display hiring-title">A hire can arrive with the work.</h2>
      <p class="hiring-lede">
        Not a claim about what a graduate might do. Three things a hiring manager can check
        today, each with the artefact behind it.
      </p>
      <ActionLink href="/employers" variant="ghost" island>Read the hiring page</ActionLink>
    </div>

    <ul class="checks">
      {#each checks as check, i (check.claim)}
        <li>
          <span class="check-n num">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3 class="check-claim">{check.claim}</h3>
            <p class="check-body">{check.evidence}</p>
          </div>
        </li>
      {/each}
    </ul>
  </div>
  <div class="container-page">
    <p class="honesty num">{EMPLOYER.notYet[0].text}</p>
  </div>
</section>

<!-- 10 · The price -->
<section class="price-band">
  <div class="container-page">
    <SectionHead
      title="Free to start. Pro for the rest."
      caption="The free phases ship inside the installer. Pro opens the rest of the shelf, and assessment is never gated."
      wide
    />

    <div class="plans">
      {#each PRICING_PLANS as plan (plan.id)}
        <article class="plan card" data-plan={plan.id}>
          <div class="plan-head">
            <p class="plan-name">{plan.name}</p>
            <p class="num plan-price">{plan.price}</p>
            <p class="num plan-note">{plan.priceNote}</p>
          </div>
          <ul class="plan-points">
            {#each plan.points.slice(0, plan.id === "free" ? 3 : 4) as point, i (`${plan.id}-${i}`)}
              <li>{point}</li>
            {/each}
          </ul>
          <a href="/pricing" class="plan-link">
            {plan.id === "free" ? "All courses" : "See pricing"}
            <span aria-hidden="true">→</span>
          </a>
        </article>
      {/each}
    </div>

    <p class="plan-foot">Teams and Campus are quoted for a term, because the size and the courses change the price.</p>
  </div>
</section>

<!-- 11 · The questions -->
<section id="questions" class="section-pad">
  <div class="container-page faq-grid">
    <div>
      <SectionHead title="The questions." caption="The ones asked before a download, answered plainly." />
    </div>
    <div class="faq">
      {#each faqs as item, i (`q-${i}`)}
        <details class="nexora-details faq-item">
          <summary>
            <span class="faq-q">{item.q}</span>
            <span class="faq-plus" aria-hidden="true">+</span>
          </summary>
          <p class="faq-a">{item.a}</p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- 12 · The close -->
<section class="closing">
  <div class="container-page closing-inner">
    <div>
      <h2 class="display closing-title">Start with the work.</h2>
      <p class="closing-lede">
        The first phase runs inside the editor, on your files, with no account. The check at
        the end is the same check every later phase uses.
      </p>
    </div>
    <div class="closing-action">
      <ActionLink href="/download" variant="inverse" size="lg" island>{release.label}</ActionLink>
      <p class="closing-note">{release.note}</p>
      {#if !release.available}
        <div class="closing-list">
          <LaunchList variant={data.headline} tone="inverse" />
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  /* ---------- 1 · Hero ---------- */

  .hero {
    padding-block: clamp(2.5rem, 4vw, 4.25rem) clamp(4rem, 6.5vw, 6rem);
    overflow-x: clip;
    position: relative;
    background:
      radial-gradient(60% 80% at 85% 20%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 60%),
      radial-gradient(40% 60% at 10% 90%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 70%);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 1080px) {
    .hero-grid {
      grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
      gap: clamp(2rem, 4vw, 4rem);
    }
  }

  .hero-copy {
    min-width: 0;
  }

  .hero-title {
    margin-top: var(--space-5);
    font-size: var(--text-hero);
    line-height: 0.96;
    letter-spacing: -0.05em;
    color: var(--color-ink);
  }

  .hero-title span {
    display: block;
  }

  .hero-lede {
    margin-top: var(--space-5);
    max-width: 46ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.55;
    color: var(--color-muted);
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-7);
  }

  .hero-facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    margin-top: var(--space-7);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
    list-style: none;
    font-size: 10.5px;
    color: var(--color-faint);
  }

  .hero-facts li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .hero-facts li::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-accent);
  }

  .hero-art {
    min-width: 0;
    position: relative;
  }

  .annotation {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: var(--space-3);
    padding-left: 0.5rem;
    color: var(--color-faint);
  }

  .annotation-arrow {
    width: 72px;
    height: 42px;
    color: var(--color-accent);
    transform: scaleX(-1);
    opacity: 0.85;
  }

  .annotation p {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.01em;
    color: var(--color-faint);
  }

  @media (prefers-reduced-motion: no-preference) {
    .hero-copy > :global(*) {
      animation: hero-in 620ms var(--ease-out) both;
    }
    .hero-copy > :global(*:nth-child(2)) {
      animation-delay: 70ms;
    }
    .hero-copy > :global(*:nth-child(3)),
    .hero-copy > :global(*:nth-child(4)),
    .hero-copy > :global(*:nth-child(5)) {
      animation-delay: 140ms;
    }
    .hero-art {
      animation: hero-in 760ms var(--ease-out) 120ms both;
    }
  }

  @keyframes hero-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ---------- 2 · Feature row ---------- */

  .feature-band {
    padding-block: var(--space-6);
    border-top: 1px solid var(--color-rule);
    border-bottom: 1px solid var(--color-rule);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 4%, transparent), transparent 60%);
  }

  /* ---------- 3 · Shelf ---------- */

  .section-top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-5);
  }

  .section-link {
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

  .section-link:hover {
    text-decoration: underline;
  }

  .course-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
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

  .cell-featured {
    grid-column: span 1;
  }

  @media (min-width: 720px) {
    .cell-featured {
      grid-column: span 2;
    }
  }

  .cell :global(.card) {
    height: 100%;
  }

  .all-courses {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 220px;
    padding: var(--space-6);
    border-radius: var(--radius);
    background: var(--color-screen);
    color: var(--color-screen-ink);
    text-decoration: none;
    overflow: hidden;
    position: relative;
    transition: transform var(--dur-2) var(--ease-out);
  }

  .all-courses:hover {
    transform: translateY(-3px);
  }

  .all-courses:hover .all-link {
    color: var(--color-accent-bright);
  }

  .all-courses::after {
    content: "";
    position: absolute;
    right: -30px;
    bottom: -50px;
    width: 170px;
    height: 170px;
    border: 1px solid var(--color-screen-rule);
    border-radius: 50%;
  }

  .all-courses .stamp {
    color: var(--color-screen-muted);
  }

  .all-title {
    color: var(--color-screen-ink);
    font-size: clamp(1.4rem, 2vw, 1.8rem);
  }

  .all-link {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--color-accent-bright);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  /* ---------- 4 · Gap ---------- */

  .gap-band {
    background:
      radial-gradient(80% 100% at 0% 0%, color-mix(in srgb, var(--color-accent) 12%, transparent), transparent 60%),
      var(--color-raised);
    border-block: 1px solid var(--color-rule);
    padding-block: clamp(4.5rem, 8vw, 7rem);
  }

  .gap-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: start;
  }

  @media (min-width: 980px) {
    .gap-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
      gap: clamp(3rem, 7vw, 7rem);
    }
  }

  .gap-title {
    margin-top: var(--space-4);
    max-width: 15ch;
    font-size: clamp(2rem, 4.2vw, 3.4rem);
  }

  .gap-lead {
    margin-top: var(--space-4);
    max-width: 48ch;
    font-size: 15px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .gap-lines {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .gap-lines li {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: var(--space-3);
    align-items: baseline;
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule-strong);
    font-size: clamp(1rem, 1.6vw, 1.2rem);
    line-height: 1.45;
    color: var(--color-ink);
  }

  .gap-lines li[data-turn="true"] {
    color: var(--color-accent);
    font-weight: 600;
  }

  .gap-n {
    font-size: 9.5px;
    color: var(--color-faint);
  }

  /* ---------- 5 · Build ---------- */

  .beats {
    list-style: none;
    margin: var(--space-8) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0 var(--space-10);
  }

  @media (min-width: 900px) {
    .beats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .beats li {
    display: grid;
    grid-template-columns: 2.2rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-5);
    border-top: 1px solid var(--color-rule);
    transition: border-color var(--dur-2) var(--ease-out);
  }

  .beats li:hover {
    border-top-color: var(--color-accent);
  }

  .beat-n {
    font-size: 10px;
    color: var(--color-accent);
  }

  .beat-title {
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 1.6vw, 1.3rem);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.25;
    color: var(--color-ink);
  }

  .beat-body {
    margin-top: var(--space-2);
    max-width: 54ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .beat-phases {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: var(--space-3);
  }

  .phase-chip {
    padding: 0.16rem 0.5rem;
    border: 1px solid var(--color-rule);
    border-radius: var(--radius-chip);
    background: var(--color-panel);
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-faint);
    white-space: nowrap;
  }

  /* ---------- 6 · Proof ---------- */

  .proof-band {
    padding-block: clamp(4.5rem, 8vw, 7rem);
    background:
      radial-gradient(70% 100% at 100% 0%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 55%),
      var(--color-panel);
  }

  /* ---------- 7 · Differences ---------- */

  .difference-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-8);
  }

  @media (min-width: 720px) {
    .difference-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .difference {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    transition:
      border-color var(--dur-2) var(--ease-out),
      background-color var(--dur-2) var(--ease-out);
  }

  .difference:hover {
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-rule));
    background: color-mix(in srgb, var(--color-accent) 3%, var(--color-panel));
  }

  .difference-n {
    font-size: 10px;
    color: var(--color-accent);
  }

  .difference-title {
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    color: var(--color-ink);
  }

  .difference-body {
    max-width: 46ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .difference-where {
    margin-top: auto;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-rule);
    font-size: 9.5px;
    color: var(--color-faint);
  }

  /* ---------- 9 · Hiring ---------- */

  .hiring {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: start;
  }

  @media (min-width: 980px) {
    .hiring {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .hiring-title {
    margin-top: var(--space-4);
    max-width: 14ch;
    font-size: clamp(2rem, 4.2vw, 3.4rem);
  }

  .hiring-lede {
    margin-top: var(--space-4);
    max-width: 46ch;
    font-size: 15px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .hiring-copy :global(a) {
    margin-top: var(--space-6);
  }

  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .checks li {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-5);
    border-bottom: 1px solid var(--color-rule-strong);
    transition: border-color var(--dur-2) var(--ease-out);
  }

  .checks li:hover {
    border-bottom-color: var(--color-accent);
  }

  .check-n {
    font-size: 10px;
    color: var(--color-accent);
  }

  .check-claim {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .check-body {
    margin-top: var(--space-1);
    max-width: 58ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .honesty {
    margin-top: var(--space-8);
    max-width: 78ch;
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
    font-size: 10.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  /* ---------- 10 · Pricing ---------- */

  .price-band {
    padding-block: clamp(4.5rem, 8vw, 7rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .plans {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-8);
  }

  @media (min-width: 820px) {
    .plans {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-5);
    }
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
  }

  @media (min-width: 640px) {
    .plan {
      padding: var(--space-8);
    }
  }

  .plan[data-plan="pro"] {
    background: var(--color-screen);
    border-color: var(--color-screen);
    color: var(--color-screen-ink);
  }

  .plan-name {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-muted);
  }

  .plan[data-plan="pro"] .plan-name {
    color: var(--color-screen-muted);
  }

  .plan-price {
    margin-top: var(--space-2);
    font-size: clamp(2.4rem, 4vw, 3.2rem);
    line-height: 1;
    color: var(--color-ink);
  }

  .plan[data-plan="pro"] .plan-price {
    color: var(--color-screen-ink);
  }

  .plan-note {
    margin-top: var(--space-2);
    font-size: 10px;
    color: var(--color-faint);
  }

  .plan[data-plan="pro"] .plan-note {
    color: var(--color-screen-muted);
  }

  .plan-points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
    border-top: 1px solid var(--color-rule);
    padding-top: var(--space-4);
  }

  .plan[data-plan="pro"] .plan-points {
    border-top-color: var(--color-screen-rule);
  }

  .plan-points li {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    gap: var(--space-2);
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--color-muted);
  }

  .plan-points li::before {
    content: "✓";
    color: var(--color-pass);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .plan[data-plan="pro"] .plan-points li {
    color: var(--color-screen-muted);
  }

  .plan-link {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 46px;
    margin-top: auto;
    padding-inline: var(--space-5);
    border: 1px solid var(--color-rule-strong);
    border-radius: var(--radius-chip);
    color: var(--color-ink);
    font-size: 13.5px;
    font-weight: 600;
    text-decoration: none;
    transition:
      background-color var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }

  .plan[data-plan="pro"] .plan-link {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  .plan-link:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .plan[data-plan="pro"] .plan-link:hover {
    background: var(--color-accent-strong);
    border-color: var(--color-accent-strong);
    color: var(--color-on-accent);
  }

  .plan-foot {
    margin-top: var(--space-5);
    max-width: 64ch;
    font-size: 12px;
    line-height: 1.55;
    color: var(--color-faint);
  }

  /* ---------- 11 · FAQ ---------- */

  .faq-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    align-items: start;
  }

  @media (min-width: 980px) {
    .faq-grid {
      grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .faq {
    border-top: 1px solid var(--color-rule-strong);
  }

  .faq-item {
    border-bottom: 1px solid var(--color-rule-strong);
  }

  .faq-item > summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding-block: var(--space-4);
    min-height: 48px;
    cursor: pointer;
    transition: color var(--dur-1) var(--ease-out);
  }

  .faq-item > summary:hover .faq-q {
    color: var(--color-accent);
  }

  .faq-q {
    font-family: var(--font-display);
    font-size: clamp(1rem, 1.5vw, 1.15rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .faq-plus {
    flex: none;
    font-family: var(--font-mono);
    font-size: 16px;
    line-height: 1.3;
    color: var(--color-accent);
    transition: transform var(--dur-2) var(--ease-out);
  }

  .faq-item[open] .faq-plus {
    transform: rotate(45deg);
  }

  .faq-a {
    max-width: 64ch;
    padding-bottom: var(--space-4);
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  /* ---------- 12 · Close ---------- */

  .closing {
    background:
      radial-gradient(90% 120% at 80% 0%, color-mix(in srgb, var(--color-accent-bright) 55%, transparent), transparent 60%),
      linear-gradient(160deg, var(--color-accent-strong), var(--color-accent));
    color: var(--color-on-accent);
  }

  .closing-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    padding-block: clamp(4rem, 7vw, 6.5rem);
    align-items: start;
  }

  @media (min-width: 980px) {
    .closing-inner {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: var(--space-16);
      align-items: center;
    }
  }

  .closing-title {
    margin-top: var(--space-3);
    font-size: var(--text-band);
    color: var(--color-on-accent);
  }

  .closing-lede {
    margin-top: var(--space-4);
    max-width: 46ch;
    font-size: 15px;
    line-height: 1.65;
    color: color-mix(in srgb, var(--color-on-accent) 82%, transparent);
  }

  .closing-action {
    display: grid;
    gap: var(--space-5);
    justify-items: start;
  }

  .closing-note {
    max-width: 38ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-on-accent);
  }

  .closing-list {
    width: 100%;
    padding-top: var(--space-4);
    border-top: 1px solid color-mix(in srgb, var(--color-on-accent) 25%, transparent);
  }
</style>
