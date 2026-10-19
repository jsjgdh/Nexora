<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import AudienceSwitch from "$lib/components/AudienceSwitch.svelte";
  import ProofRun from "$lib/components/ProofRun.svelte";
  import ProofChain from "$lib/components/ProofChain.svelte";
  import ScrollRail from "$lib/components/ScrollRail.svelte";
  import DeviceCode from "$lib/components/DeviceCode.svelte";
  import PhaseMatrix from "$lib/components/PhaseMatrix.svelte";
  import PhaseField from "$lib/components/PhaseField.svelte";
  import CourseLedger from "$lib/components/CourseLedger.svelte";
  import SpecSheet from "$lib/components/SpecSheet.svelte";
  import FactStrip from "$lib/components/FactStrip.svelte";
  import EmployerBoard from "$lib/components/EmployerBoard.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";
  import PropositionStack from "$lib/components/PropositionStack.svelte";
  import CategoryMap from "$lib/components/CategoryMap.svelte";
  import { inView, inViewStagger, reduced } from "$lib/motion";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";
  import {
    HERO,
    HERO_VARIANTS,
    HIRING,
    MARKET,
    LANDSCAPE,
    WEDGE,
    STEPS,
    DISCLOSURE,
    NO_LIST,
    FAQ,
    POSITIONING,
  } from "$lib/content/site";

  /* The front door, as a bench.
   *
   * One argument, told in order, and every section is a different shape on
   * purpose: a poster and a live readout, three arguments read as columns, a
   * datasheet, a ruled form, a demonstration, the manifest as a plate of
   * lights, a chain scrubbed against the scroll, the hiring manager's bench,
   * a set of limits, a plain list of questions, and a poster to close. The
   * previous build said the same words with the same card three times over;
   * this one gives each claim the layout it deserves — cards are the lazy
   * container and there is not one on this page.
   *
   * Every number and every phase comes from `$lib/content/site`, the module
   * the suite reads. Nothing here is invented: no testimonial, no customer
   * logo, no download that does not exist, no price.
   *
   * `downloadHref` is named once and used by every call on the page — the
   * hero, the close, the bar — so a change of destination cannot leave one
   * behind, and the suite can count them. */

  const downloadHref = "/download";
  const pricingHref = "/pricing";
  const verifyHref = "/verify";
  const coursesHref = "/#courses";
  const employersHref = "/#employers";

  const railSections = [
    { id: "why", label: "Why" },
    { id: "market", label: "Market" },
    { id: "buy", label: "Buying" },
    { id: "measures", label: "Measures" },
    { id: "courses", label: "Courses" },
    { id: "employers", label: "Hiring" },
    { id: "limits", label: "Limits" },
  ];

  /* The headline the server assigned.
   *
   * The research's §5 asks for a headline split test, and a test needs the
   * assignment to happen before the first byte, so the server picks one
   * variant and this page renders exactly that one. The other two are not in
   * the document: a page that renders every variant is a menu, and a menu
   * measures nothing. */
  let { data }: { data: { headline: string } } = $props();
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
    lede: variant.lede,
  };
  const active = $derived(audience === "employer" ? HIRING : learnerHero);

  /* The field picks a phase; the ledger shows the course. A click on a point
     opens the drawer it belongs to and brings it into view, so the picture is
     a way into the list rather than a picture of it. */
  let focusedCourse = $state<string | null>(null);

  function openCourse(pick: { courseSlug: string }): void {
    focusedCourse = pick.courseSlug;
    const head = document.getElementById(`course-head-${pick.courseSlug}`);
    head?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
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

<PageHead title={SITE_TITLE} description={SITE_DESCRIPTION} path="/" />

<ScrollRail sections={railSections} />

<!-- = 1 · The front page =====================
     A poster, and the instrument that produced the claim. The reader chooses
     which question they arrived with, mine or my employer's, and the poster
     answers it.

     The hero carries four things and no more: the selector, the poster, the
     lede, and the two actions. The offer line used to sit here as a line of
     small print under the buttons, which is where a reader's eye does not
     go; it lives in the door section instead, next to the step that explains
     it.

     The readout below is not an illustration: it is the product's own output,
     running. It gets the full measure of the page rather than half a column,
     because the receipt is a physical object with a shape, and a shape needs
     room. A receipt squeezed into 250px is a receipt that wraps its own
     labels. -->

<section class="relative overflow-x-clip" data-headline-variant={data.headline}>
  <div class="hero-block mx-auto max-w-[1320px] px-5 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-14">
    <AudienceSwitch bind:value={audience} />

    <Headline
      as="h1"
      lines={[active.lineOne, active.lineTwo]}
      class="mt-8 text-[clamp(2.6rem,6.6vw,5.6rem)] text-ink"
    />

    <div
      class="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16"
    >
      <!-- The lede is prose, so it is set in the reading face. Everything
           that is a label, a reading or a control is not. -->
      <p class="reading max-w-[54ch] text-[clamp(1.2rem,2.1vw,1.55rem)] leading-snug text-ink">
        {active.lede}
      </p>

      <div class="hero-actions flex flex-wrap items-center gap-3 lg:justify-end">
        {#if audience === "learner"}
          <ActionLink href={downloadHref} island>{active.primary}</ActionLink>
          <ActionLink href={coursesHref} variant="ghost">{active.secondary}</ActionLink>
        {:else}
          <ActionLink href={employersHref} island>{active.primary}</ActionLink>
          <ActionLink href={downloadHref} variant="ghost">{HERO.primary}</ActionLink>
        {/if}
      </div>
    </div>
  </div>

  <!-- The artefact band: the one thing on the page the bench actually
       produces. Everything above is type; this is the object, and it is
       printed live. The band is ruled to the millimetre, because that is what
       a bench is: a surface you measure on, not a panel you look at. -->
  <div id="hero-run" class="plot border-y border-rule bg-ground">
    <div class="mx-auto max-w-[1320px] px-5 py-12 sm:px-8 sm:py-16">
      <div class="mb-8 max-w-[62ch]">
        <h2 class="display text-[clamp(1.4rem,2.6vw,2.1rem)] text-ink">
          A failure, its reason, and a receipt.
        </h2>
        <p class="reading mt-3 text-[15.5px] leading-relaxed text-muted">
          The same check passing once the cause is fixed, and the sheet anyone can re-derive.
        </p>
      </div>
      <ProofRun />
    </div>
  </div>

  <!-- The measurements, as a readout row. -->
  <div class="mx-auto max-w-[1320px] px-5 py-14 sm:px-8 sm:py-16">
    <FactStrip />
  </div>
</section>

<!-- = 2 · The argument =====================
     Three arguments, read as columns: a mono position, a claim, and the
     reasoning under it. No cards, no borders around the content — the rules
     do the dividing. -->
<section id="why" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="The two things a video never produced."
      caption="Two of the three things an interview asks for, that you can build and that you can prove it, are exactly the two a video never produced."
      wide
    />

    <div class="mt-14 grid gap-x-12 gap-y-10 lg:grid-cols-3" use:inViewStagger>
      {#each WEDGE as cell (cell.title)}
        <article class="fade-up border-t border-rule-strong pt-6" data-stagger-item>
          <h3 class="display max-w-[20ch] text-[clamp(1.3rem,2.2vw,1.7rem)] text-ink">
            {cell.title}
          </h3>
          <p class="reading mt-3 max-w-[42ch] text-[15.5px] leading-relaxed text-muted">{cell.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- = 3 · The market =====================
     Four readings from the hiring research, each with the study it came from,
     and the turn that connects them to the product. The sources are printed
     because a number with no source is a rumour, and a rumour is what this
     page is arguing against. -->
<section id="market" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead title={MARKET.title} caption={MARKET.caption} wide />
    <div class="mt-14">
      <MarketPanel />
    </div>
  </div>
</section>

<!-- = 4 · The propositions =====================
     What the reader is actually buying, in the voice of the audience they
     chose at the top of the page. The switch in the hero speaks here too, so
     a hiring manager is never handed a learner's promise. -->
<section id="buy" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="What you are actually buying."
      caption="Three propositions, and they change with the audience you chose at the top of the page. The promise underneath is the same either way: the work, in the place you already work, judged by something you can check."
      wide
    />
    <div class="mt-14">
      <PropositionStack {audience} />
    </div>
  </div>
</section>

<!-- = 5 · The datasheet =====================
     The competitor's claim, restated as measurements. Every row is a promise
     the product can keep today, and every one of them can be checked. -->
<section id="measures" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="What the bench measures."
      caption="Eight readings, in three groups, and the value each one actually holds today. None of them is a badge, and none of them needs a sales call to check."
      wide
    />
    <div class="mt-14">
      <SpecSheet />
    </div>
  </div>
</section>

<!-- = 6 · The market's shape =====================
     Five kinds of product the reader could buy instead, and the line each one
     stops at. The names are off: a category is a fair thing to describe, and
     a competitor is not. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead title={LANDSCAPE.title} caption={LANDSCAPE.caption} wide />
    <div class="mt-14">
      <CategoryMap />
    </div>
  </div>
</section>

<!-- = 7 · The door =====================
     A ruled form: three steps on the left, their instructions on the right,
     each step a full-width row under a heavy rule. Numbers are real here —
     the order is the point — so they are allowed to be loud. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="Download. Approve a code. Your tier opens the rest."
      caption="Learning happens in the IDE. This site holds the download, the account and the proof. There is no second way to learn here, which is the point."
      wide
    />

    <div class="mt-14 border-t-2 border-rule-strong">
      {#each STEPS as step (step.id)}
        {@const points = "points" in step ? step.points : step.steps}
        <div class="grid gap-6 border-b border-rule-strong py-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div class="flex min-w-0 gap-6">
            <span class="num pt-1 text-[clamp(1.8rem,3.4vw,2.5rem)] leading-none font-bold text-accent">
              {step.n}
            </span>
            <h3 class="display max-w-[18ch] text-[clamp(1.4rem,2.6vw,2.1rem)] text-ink">
              {step.title}
            </h3>
          </div>

          <div class="min-w-0">
            <p class="reading max-w-[58ch] text-[16px] leading-relaxed text-muted">{step.caption}</p>
            <ul class="mt-6 grid gap-3">
              {#each points as point, i (`${step.id}-${i}`)}
                <li class="grid grid-cols-[auto_1fr] gap-4 text-[14.5px] leading-relaxed text-ink">
                  <span class="num pt-0.5 text-[11px] text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{point}</span>
                </li>
              {/each}
            </ul>
            <div class="mt-6">
              <ActionLink href={step.link.href} variant="quiet" size="sm">
                {step.link.label} →
              </ActionLink>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <p class="reading mt-8 max-w-[68ch] text-[15.5px] leading-relaxed text-muted">
      {HERO.note}
    </p>
  </div>
</section>

<!-- = 8 · The handshake =====================
     A demonstration, not a paragraph: the two panes of the device-code
     handshake, side by side, with the approve on this side. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="The IDE never asks for your password."
      caption="It prints a short code and opens this site. You sign in here, approve the code, and the editor signs in by itself. Nothing to paste, nowhere to mistype. Try the two halves below."
    />
    <div class="mt-12">
      <DeviceCode />
    </div>
  </div>
</section>

<!-- = 9 · The manifest =====================
     The curriculum as a plate of lights and a ledger of phases. Thirty-two
     squares, one per shipped phase, and the real names underneath. -->
<section id="courses" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="Three courses. Eighty phases. One editor."
      caption="Everything below ships inside the IDE and is judged there. This site teaches nothing itself. Open a course to read its real phase list."
      wide
    />

    <div class="mt-14">
      <PhaseField onselect={openCourse} />
    </div>

    <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div class="min-w-0">
        <PhaseMatrix />
        <p class="mt-5 text-[13px] leading-relaxed text-faint">
          Phase names are the shipped manifest, not marketing copy: the build fails if this list and
          the IDE disagree.
        </p>
      </div>
      <div class="min-w-0">
        <CourseLedger focus={focusedCourse} />
      </div>
    </div>
  </div>
</section>

<!-- = 10 · The chain =====================
     A full-bleed band, scrubbed against the scroll: the one section whose
     shape is a machine running rather than a column of text. -->
<section class="border-y border-rule-strong bg-panel">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="From your keyboard to someone else's browser."
      caption="Scroll it. Each link only holds while the one before it does. A receipt that cannot be re-derived is a badge, and this site does not issue badges."
    />
    <div class="mt-14">
      <ProofChain />
    </div>
  </div>
</section>

<!-- = 11 · The hiring manager =====================
     The other half of the market, and the other half of the promise. What is
     true of a finished phase, and what is not built yet. -->
<section id="employers" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead
      title="Juniors arrive with work, not with promises."
      caption="Entry-level hiring has tightened, and the thing that survives it is evidence rather than a claim. Here is exactly what a finished phase leaves behind, and exactly what does not exist yet."
      wide
    />
    <div class="mt-14">
      <EmployerBoard {verifyHref} />
    </div>
  </div>
</section>

<!-- = 12 · The limits =====================
     The one place the page raises its voice: what the product will not do,
     set on heavy rules, then exactly where its certainty stops. -->
<section id="limits" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <h2 class="display max-w-[16ch] text-[clamp(2.2rem,5.2vw,3.8rem)] text-ink">
      What NEXORA will not do.
    </h2>

    <ul class="mt-12 grid gap-8 border-t-2 border-rule-strong pt-8 lg:grid-cols-3 lg:gap-12">
      {#each NO_LIST as line, i (`no-${i}`)}
        <li class="reading text-[16px] leading-relaxed text-muted" use:inView>
          <span class="num mb-3 block text-[12px] text-removed" aria-hidden="true">✗</span>
          {line}
        </li>
      {/each}
    </ul>

    <div class="mt-20">
      <SectionHead
        title={DISCLOSURE.title}
        caption={DISCLOSURE.caption}
        wide
      />
      <div class="mt-10 grid gap-px border border-rule bg-rule lg:grid-cols-2">
        {#each DISCLOSURE.rows as row (row.kind)}
          <div class="bg-panel p-6 sm:p-8">
            <p
              class="stamp mb-4 border-t-2 pt-4 text-[11px] uppercase"
              class:border-added={row.kind === "recomputed"}
              class:border-review={row.kind === "self"}
              class:text-added={row.kind === "recomputed"}
              class:text-review={row.kind === "self"}
            >
              {row.label}
            </p>
            <p class="reading max-w-[52ch] text-[16px] leading-relaxed text-muted">{row.body}</p>
          </div>
        {/each}
      </div>

      <div class="mt-12">
        <ActionLink href={verifyHref} variant="ghost" island>Check a receipt yourself</ActionLink>
      </div>
    </div>
  </div>
</section>

<!-- = 13 · The questions =====================
     A plain ruled list; the answers are the content, so nothing frames them. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <SectionHead title="The questions, answered plainly." wide />
    <div class="mt-12 border-t border-rule">
      {#each FAQ as item, i (`q-${i}`)}
        <details class="nexora-details border-b border-rule">
          <summary
            class="flex cursor-pointer items-baseline gap-5 py-5 text-[15.5px] font-semibold text-ink"
          >
            <span class="num shrink-0 text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
            <span class="flex-1">{item.q}</span>
            <span class="stamp shrink-0 text-[14px] text-accent" aria-hidden="true">+</span>
          </summary>
          <p class="reading max-w-[68ch] pb-6 pl-[2.6rem] text-[16px] leading-relaxed text-muted">
            {item.a}
          </p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- = 14 · The close =====================
     A poster to end on, and the one promise the whole page has been making. -->
<section class="border-t-2 border-rule-strong">
  <div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
    <Headline
      as="p"
      lines={["You still have to build it.", "We just tell you when it works."]}
      class="text-[clamp(2.2rem,6.4vw,5rem)] text-ink"
    />
    <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <p class="reading max-w-[48ch] text-[17px] leading-relaxed text-muted">
        {POSITIONING}
      </p>
      <div class="flex flex-wrap items-center gap-3 lg:justify-end">
        <ActionLink href={downloadHref} island>{HERO.primary}</ActionLink>
        <ActionLink href={pricingHref} variant="ghost">Compare tiers</ActionLink>
      </div>
    </div>
    <div id="foot-sentinel" class="h-px" aria-hidden="true"></div>
  </div>
</section>

{#if pastHero && !atFooter}
  <aside class="ctabar" aria-label="Download the IDE">
    <p class="stamp text-[11.5px] text-faint">
      <span class="sm:hidden">Free</span>
      <span class="hidden sm:inline">Free to download · base course included</span>
    </p>
    <ActionLink href={downloadHref} size="sm" island>{HERO.primaryShort}</ActionLink>
  </aside>
{/if}

<style>
  .ctabar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) clamp(var(--space-5), 4vw, var(--space-8));
    background: var(--color-panel);
    border-top: 1px solid var(--color-rule-strong);
    box-shadow: 0 -18px 34px -30px rgb(0 0 0 / 0.9);
    animation: ctabar-in 260ms var(--ease-out) both;
  }
  /* On the panel the type has to come from the ink ramp — the room's own dark
     is the page's ground, and a label on it would disappear. */
  .ctabar :global(.stamp) {
    color: var(--color-faint);
  }
  @keyframes ctabar-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* The short sheet: a short viewport, whatever its width, because the
     shortage is vertical. The bench sets its type to fit the page it is
     printing on.

     The only type that moves is the poster line's floor (2rem instead of
     2.5rem). Above ~364px wide the clamp's middle term drives the size, so on
     a short laptop window the headline is untouched and only the air
     tightens; on a narrow phone the line itself sets smaller, which is the
     case that needs it. */
  @media (max-height: 660px) {
    .hero-block {
      padding-top: var(--space-3);
    }
    .hero-block :global(h1) {
      font-size: clamp(2rem, 6.6vw, 5.6rem);
    }
    .hero-block .hero-actions {
      margin-top: var(--space-5);
    }
  }
</style>
