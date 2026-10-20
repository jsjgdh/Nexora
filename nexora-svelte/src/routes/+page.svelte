<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import AudienceSwitch from "$lib/components/AudienceSwitch.svelte";
  import ProofRun from "$lib/components/ProofRun.svelte";
  import ProofChain from "$lib/components/ProofChain.svelte";
  import ScrollRail from "$lib/components/ScrollRail.svelte";
  import PhaseMatrix from "$lib/components/PhaseMatrix.svelte";
  import PhaseField from "$lib/components/PhaseField.svelte";
  import SpecSheet from "$lib/components/SpecSheet.svelte";
  import FactStrip from "$lib/components/FactStrip.svelte";
  import EmployerBoard from "$lib/components/EmployerBoard.svelte";
  import LaunchList from "$lib/components/LaunchList.svelte";
  import PropositionStack from "$lib/components/PropositionStack.svelte";
  import PhasePanel from "$lib/components/PhasePanel.svelte";
  import LoopCards from "$lib/components/LoopCards.svelte";
  import GapSequence from "$lib/components/GapSequence.svelte";
  import StageTrack from "$lib/components/StageTrack.svelte";
  import AudienceLine from "$lib/components/AudienceLine.svelte";
  import MicroFacts from "$lib/components/MicroFacts.svelte";
  import CoursePaths from "$lib/components/CoursePaths.svelte";
  import { inView, inViewStagger, reduced } from "$lib/motion";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";
  import {
    HERO,
    HERO_VARIANTS,
    HIRING,
    LANDSCAPE,
    DISCLOSURE,
    NO_LIST,
    FAQ,
    CURRICULUM,
    COURSES,
    LEARN_CYCLE,
    BUILD_JOURNEY,
    CLOSING,
  } from "$lib/content/site";

  /* The front door, told as a story.
   *
   * The earlier build led with the argument: here is the market, here is the
   * datasheet, here is what we refuse to do, and somewhere near the bottom the
   * experience. A reader who had not yet understood the product was asked to
   * agree with its principles before they had seen what it does.
   *
   * This build is ordered the other way round, and the order is the whole
   * change:
   *
   *   1. what it is, and one action that is true today
   *   2. what a phase actually is, shown with the shipped curriculum
   *   3. the situation a learner is in, in their own words
   *   4. what they end up holding
   *   5. what makes the experience different
   *   6. how a verdict earns trust, said once and said plainly
   *   7. the curriculum, and the two other audiences
   *
   * The technical depth is not gone. It has moved down the page, to where a
   * reader who has caught the idea can decide they want it, and the exhaustive
   * phase list has moved to its own page, where the reader who came for the
   * manifest can have all of it without the rest of the site in the way.
   *
   * Every number and every phase comes from `$lib/content/site` or from the
   * shipped manifest, the modules the suite reads. Nothing here is invented:
   * no testimonial, no customer logo, no download that does not exist, no
   * price, and no phase named that the IDE does not ship. */

  const downloadHref = "/download";
  const pricingHref = "/pricing";
  const verifyHref = "/verify";
  const coursesHref = "/courses";
  const employersHref = "/employers";

  const railSections = [
    { id: "loop", label: "How" },
    { id: "gap", label: "Gap" },
    { id: "build", label: "Build" },
    { id: "why", label: "Why" },
    { id: "proof", label: "Proof" },
    { id: "courses", label: "Courses" },
    { id: "employers", label: "Hiring" },
  ];

  /* The headline the server assigned.
   *
   * The research's §5 asks for a headline split test, and a test needs the
   * assignment to happen before the first byte, so the server picks one
   * variant and this page renders exactly that one. The other two are not in
   * the document: a page that renders every variant is a menu, and a menu
   * measures nothing. */
  let { data }: PageProps = $props();
  const variant =
    HERO_VARIANTS.find((v) => v.id === data.headline) ?? HERO_VARIANTS[0];

  /* The two doors. The learner is the default because the download is the
     product's front door; the hiring variant is one click away and has a
     full section of its own further down the page. */
  let audience = $state("learner");
  const learnerHero = {
    ...HERO,
    lineOne: variant.lineOne,
    lineTwo: variant.lineTwo,
    markOne: variant.markOne,
    lede: variant.lede,
  };
  const active = $derived(audience === "employer" ? HIRING : learnerHero);
  const marks = $derived<Record<number, string>>(active.markOne ? { 0: active.markOne } : {});

  /* The release state, decided on the server.
   *
   * It decides the label on the one action that matters, and it decides the
   * sentence under it. A page that says "try it free" over a build that is not
   * published is lying with a button, and the switch that flips it is the
   * same switch the download page reads. */
  const release = $derived(data.release);
  const primaryLabel = $derived(audience === "employer" ? "See the evidence" : release.label);
  const primaryHref = $derived(audience === "employer" ? employersHref : downloadHref);

  /* The field picks a phase. The reader can then open the course it belongs
     to on the courses page, where the whole list is printed. */
  function openCourse(pick: { courseSlug: string }): void {
    window.location.assign(`${coursesHref}#${pick.courseSlug}`);
  }

  /* The bar appears once the masthead is behind you and leaves at the footer.
     It is mounted rather than hidden, so there is never a focusable element
     sitting inside something the eye cannot see. */
  let pastHero = $state(false);
  let atFooter = $state(false);
  $effect(() => {
    const hero = document.getElementById("hero-run");
    const foot = document.getElementById("foot-sentinel");
    if (!hero || !foot || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) pastHero = !entry.isIntersecting;
          if (entry.target === foot) atFooter = entry.isIntersecting;
        }
      },
      { threshold: 0 }
    );
    io.observe(hero);
    io.observe(foot);
    return () => io.disconnect();
  });
</script>

<svelte:head>
  <!-- The one marked word in the poster is set in the italic serif, and it is
       the only place on the site that uses that face. So the page that has
       one preloads it, and a page that does not is not made to pay for it. -->
  <link
    rel="preload"
    href="/fonts/newsreader-italic-0.woff2"
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />
</svelte:head>

<PageHead title={SITE_TITLE} description={SITE_DESCRIPTION} path="/" />

<ScrollRail sections={railSections} />

<!-- = 1 · The hero =====================
     The aspiration, and one action that is true today. The headline, the lede
     and the two actions are the whole poster; the state of the release is in
     the strip below it, where a reader who wants the detail will look. -->
<section class="relative overflow-x-clip" data-headline-variant={data.headline}>
  <div class="hero-block relative z-10 mx-auto max-w-[1320px] px-5 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-14">
    <div class="relative z-10">
      <AudienceLine {audience} />
      <Headline
        as="h1"
        lines={[active.lineOne, active.lineTwo]}
        marks={marks}
        class="mt-6 text-[clamp(2.1rem,4.4vw,3.9rem)] text-ink"
      />
      <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
        <p class="reading max-w-[54ch] text-[clamp(1.15rem,1.9vw,1.45rem)] leading-snug text-ink">
          {active.lede}
        </p>
        <div class="hero-actions flex flex-wrap items-center gap-3 lg:justify-end">
          <ActionLink href={primaryHref} island>{primaryLabel}</ActionLink>
          <ActionLink href="#loop" variant="ghost">See how it works</ActionLink>
        </div>
      </div>
      <MicroFacts {audience} />
    </div>
  </div>

  <!-- The strip under the poster: what state the product is in, and the three
       facts about where it runs. A visitor should not have to read the page to
       learn that the desktop build is not published yet. -->
  <div class="relative z-10 border-t border-rule bg-panel">
    <div class="mx-auto max-w-[1320px] px-5 py-10 sm:px-8 sm:py-12">
      <div class="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div class="min-w-0">
          <h2 class="display max-w-[18ch] text-[clamp(1.4rem,2.6vw,2rem)] text-ink">
            What this is, and where it stands.
          </h2>
          <p class="reading mt-4 max-w-[46ch] text-[17px] leading-relaxed text-muted">
            {release.note}
          </p>
          <div class="mt-7">
            <AudienceSwitch bind:value={audience} />
          </div>
        </div>
        <SpecSheet clusters={["where it runs"]} />
      </div>
    </div>
  </div>

  <!-- The product, near the top: a phase from the shipped course, read from
       the manifest rather than drawn. -->
  <div id="hero-run" class="relative z-10 mx-auto max-w-[1320px] px-5 pt-12 sm:px-8 sm:pt-16">
    <PhasePanel />
  </div>
</section>

<!-- = 2 · What a phase is =====================
     The shipped manifest's own sentence, taken apart into the five steps a
     learner actually takes, and then the product running: a check that fails,
     the reason, the file and the line, and the receipt that follows. -->
<section id="loop" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead title={LEARN_CYCLE.title} caption={LEARN_CYCLE.caption} wide />
    <div class="mt-14">
      <LoopCards />
    </div>

    <div class="mt-16 border-l-2 border-accent pl-6">
      <h3 class="display max-w-[24ch] text-[clamp(1.25rem,2.2vw,1.7rem)] text-ink">
        {LEARN_CYCLE.guidance.title}
      </h3>
      <p class="reading mt-3 max-w-[62ch] text-[17px] leading-relaxed text-muted">
        {LEARN_CYCLE.guidance.body}
      </p>
    </div>
  </div>

  <div class="mx-auto max-w-[1320px] px-5 pb-24 sm:px-8 sm:pb-36">
    <ProofRun />
  </div>
</section>

<!-- = 3 · The gap =====================
     The situation a learner is in, in their own words, in the order it
     happens. -->
<section id="gap" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <GapSequence />
  </div>
</section>

<!-- = 4 · What you build =====================
     One project, as a journey, and the other courses beneath it. -->
<section id="build" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead title={BUILD_JOURNEY.title} caption={BUILD_JOURNEY.caption} wide />
    <div class="mt-14">
      <StageTrack />
    </div>
  </div>

  <div class="border-t border-rule">
    <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
      <SectionHead
        title="The other lines, once the first one is behind you."
        caption="The JavaScript app is the way in. The Go language, the Go service, the Rust ledger and the API course are what an engineer does next, and they are shipped, not planned."
        wide
      />
      <div class="mt-12">
        <CoursePaths />
      </div>
    </div>
  </div>
</section>

<!-- = 5 · Why it is different =====================
     The differentiators, as benefits rather than as a list of features. The
     switch in the hero changes this list too, because a hiring manager being
     read a learner's proposition is being read to. -->
<section id="why" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead
      title="What makes the experience different."
      caption="Four properties of the product that a learner feels in the first ten minutes, and a hiring manager can check in the first five."
      wide
    />
    <div class="mt-14">
      <PropositionStack {audience} />
    </div>
    <div class="mt-16 border-l-2 border-accent pl-6">
      <p class="reading max-w-[58ch] text-[clamp(1.1rem,1.8vw,1.35rem)] leading-relaxed text-ink">
        {LANDSCAPE.ours}
      </p>
    </div>
  </div>
</section>

<!-- = 6 · How a verdict earns trust =====================
     Everything the product refuses to do, said once, here, after the reader
     has seen what it does. The receipt chain, the datasheet, the disclosure
     about what the platform can and cannot re-derive, and the three things
     that are deliberately absent. -->
<section id="proof" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead
      title="How a verdict earns trust."
      caption="A pass is not a feeling and it is not a model's opinion. It is a rule engine deciding against your own files, and it leaves a record anybody can re-derive."
      wide
    />

    <div class="mt-14">
      <ProofChain />
    </div>

    <div class="mt-16">
      <SpecSheet clusters={["what decides a verdict", "what you keep"]} />
    </div>

    <div class="mt-16 grid gap-px border border-rule bg-rule lg:grid-cols-2">
      <div class="bg-panel p-6 sm:p-8">
        <h3 class="display text-[clamp(1.2rem,2vw,1.6rem)] text-ink">{DISCLOSURE.title}</h3>
        <p class="reading mt-3 max-w-[52ch] text-[16.5px] leading-relaxed text-muted">
          {DISCLOSURE.caption}
        </p>
        <ul class="mt-7">
          {#each DISCLOSURE.rows as row (row.kind)}
            <li class="border-t border-rule py-4">
              <p class="num text-[12.5px] text-ink">{row.label}</p>
              <p class="reading mt-1.5 max-w-[52ch] text-[16px] leading-relaxed text-muted">
                {row.body}
              </p>
            </li>
          {/each}
        </ul>
      </div>

      <div class="bg-panel p-6 sm:p-8">
        <h3 class="display text-[clamp(1.2rem,2vw,1.6rem)] text-ink">
          What this will never do.
        </h3>
        <ul class="mt-7 grid gap-6">
          {#each NO_LIST as line, i (`no-${i}`)}
            <li class="reading flex gap-4 text-[16.5px] leading-relaxed text-muted">
              <span class="num shrink-0 text-[12px] text-removed" aria-hidden="true">no</span>
              <span>{line}</span>
            </li>
          {/each}
        </ul>
        <div class="mt-8">
          <ActionLink href={verifyHref} variant="ghost" island>Check a receipt yourself</ActionLink>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- = 7 · The curriculum =====================
     The readings, the field, and the way into the full list. The eighty phase
     names live on their own page, because a reader who wants the manifest
     should not have to read the rest of the site to reach it. -->
<section id="courses" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead title={CURRICULUM.title} caption={CURRICULUM.caption} wide />
    <div class="mt-12">
      <FactStrip />
    </div>
  </div>

  <div class="relative z-10 mx-auto max-w-[1320px] px-5 pb-16 sm:px-8">
    <PhaseField onselect={openCourse} />
  </div>

  <div class="mx-auto max-w-[1320px] px-5 pb-24 sm:px-8 sm:pb-36">
    <div class="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div class="min-w-0">
        <PhaseMatrix />
        <p class="mt-5 text-[13.5px] leading-relaxed text-faint">
          One point per shipped phase. Every point is the same ink, because a public page does not
          put a price on a phase.
        </p>
      </div>
      <div class="min-w-0">
        <ul class="border-t border-rule-strong">
          {#each COURSES as course (course.slug)}
            <li class="border-b border-rule-strong py-6">
              <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 class="display text-[clamp(1.3rem,2.3vw,1.8rem)] text-ink">{course.title}</h3>
                <p class="num text-[13px] text-muted">{course.phases.length} phases</p>
              </div>
              <p class="reading mt-2 max-w-[58ch] text-[16.5px] leading-relaxed text-muted">
                {course.sub}
              </p>
            </li>
          {/each}
        </ul>
        <div class="mt-10 flex flex-wrap items-center gap-3">
          <ActionLink href={coursesHref} island>Open the full curriculum</ActionLink>
          <ActionLink href={downloadHref} variant="ghost">{release.label}</ActionLink>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- = 8 · For hiring =====================
     The other reader, with a section of their own and a page of their own. -->
<section id="employers" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead
      title="For the people who hire."
      caption="A hiring manager arrives with a different question and a different standard of proof. This section answers it in the product's own terms."
      wide
    />
    <div class="mt-14">
      <EmployerBoard {verifyHref} />
    </div>
    <div class="mt-10 flex flex-wrap items-center gap-3">
      <ActionLink href={employersHref} variant="ghost" island>Read the hiring page</ActionLink>
    </div>
  </div>
</section>

<!-- = 9 · The questions ===================== -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <SectionHead title="The questions, answered plainly." wide />
    <div class="mt-12 border-t border-rule">
      {#each FAQ as item, i (`q-${i}`)}
        <details class="nexora-details border-b border-rule">
          <summary
            class="flex cursor-pointer items-start gap-5 py-5 text-left text-[clamp(1.05rem,1.7vw,1.35rem)] font-semibold text-ink"
          >
            <span class="num shrink-0 pt-1 text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
            <span class="flex-1">{item.q}</span>
            <span class="stamp shrink-0 text-[14px] text-accent" aria-hidden="true">+</span>
          </summary>
          <p class="reading max-w-[68ch] pb-6 pl-[2.6rem] text-[17px] leading-relaxed text-muted">
            {item.a}
          </p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- = 10 · The close =====================
     One action again, and the way to be told when it changes. -->
<section class="border-t-2 border-rule-strong">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-36">
    <Headline
      lines={["Learn by building.", "Then keep building."]}
      class="max-w-[18ch] text-[clamp(2.2rem,5.4vw,4rem)] text-ink"
    />
    <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <p class="reading max-w-[48ch] text-[17px] leading-relaxed text-muted">
        {CLOSING}
      </p>
      <div class="flex flex-wrap items-center gap-3 lg:justify-end">
        <ActionLink href={downloadHref} island>{release.label}</ActionLink>
        <ActionLink href={pricingHref} variant="ghost">See pricing</ActionLink>
      </div>
    </div>
    <div class="mt-12 border-t border-rule pt-8">
      <p class="stamp text-faint">
        {release.available
          ? "The desktop build is published. The link above is the real file."
          : "The desktop build is not published yet. Leave your address and we will tell you when it is."}
      </p>
      <div class="mt-4">
        <LaunchList variant={data.headline} />
      </div>
    </div>
    <div id="foot-sentinel" class="h-px" aria-hidden="true"></div>
  </div>
</section>

{#if pastHero && !atFooter}
  <aside class="ctabar" aria-label="Get the IDE">
    <p class="stamp hidden text-[11.5px] text-faint sm:inline">{release.label}</p>
    <ActionLink href={downloadHref} size="sm" island>{release.labelShort}</ActionLink>
  </aside>
{/if}

<style>
  /* The poster sits on a pool of light. The one soft edge on the page, and it
     is under the type rather than around it, so the headline reads as lit
     from below rather than as a panel. */
  .hero-block::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(120% 78% at 12% 0%, color-mix(in srgb, var(--color-accent) 9%, transparent) 0%, transparent 62%),
      radial-gradient(90% 60% at 92% 8%, color-mix(in srgb, var(--color-review) 7%, transparent) 0%, transparent 60%);
  }

  /* The bar that follows the reader down the page. It is mounted rather than
     hidden, so there is never a focusable element inside something the eye
     cannot see. */
  .ctabar {
    position: fixed;
    left: 50%;
    bottom: var(--space-5);
    z-index: var(--z-rail);
    display: flex;
    align-items: center;
    gap: var(--space-4);
    transform: translateX(-50%);
    border: 1px solid var(--color-rule-strong);
    background: var(--color-panel);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  }
  .ctabar :global(.stamp) {
    white-space: nowrap;
  }

  /* On a short window the poster has to give up its air before it gives up
     its type, or the action falls off the bottom of the screen. */
  @media (max-height: 660px) {
    .hero-block {
      padding-top: var(--space-6);
      padding-bottom: var(--space-6);
    }
    .hero-block :global(h1) {
      font-size: clamp(1.9rem, 5vw, 3rem);
    }
    .hero-block .hero-actions {
      margin-top: var(--space-4);
    }
  }
</style>
