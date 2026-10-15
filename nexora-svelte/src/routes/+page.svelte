<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import Reveal from "$lib/components/Reveal.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import ProofRun from "$lib/components/ProofRun.svelte";
  import ProofChain from "$lib/components/ProofChain.svelte";
  import ScrollRail from "$lib/components/ScrollRail.svelte";
  import DeviceCode from "$lib/components/DeviceCode.svelte";
  import TierGrid from "$lib/components/TierGrid.svelte";
  import CourseLedger from "$lib/components/CourseLedger.svelte";
  import { inView, inViewStagger } from "$lib/motion";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";
  import { HERO, WEDGE, STEPS, DISCLOSURE, NO_LIST, FAQ } from "$lib/content/site";

  /* The front door, as a press.
   *
   * One argument, told in order, and every section is a different shape on
   * purpose: a masthead, an artefact, an editorial column, a ruled form, a
   * demonstration, a plate of lights, a chain, a ledger, a set of limits, and
   * a poster to close. The previous build said the same words with the same
   * card three times over; this one gives each claim the layout it deserves —
   * cards are the lazy container and there is not one on this page.
   *
   * Every number and every phase comes from `$lib/content/site`, the module
   * the suite reads. Nothing here is invented: no testimonial, no customer
   * logo, no download that does not exist, no price.
   *
   * `downloadHref` is named once and used by every call on the page — the
   * masthead, the handshake, the close, the bar — so a change of destination
   * cannot leave one behind, and the suite can count them. */

  const downloadHref = "/download";
  const pricingHref = "/pricing";
  const verifyHref = "/verify";

  const railSections = [
    { id: "why", label: "Why" },
    { id: "courses", label: "Courses" },
    { id: "limits", label: "Limits" },
  ];

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

<!-- ===================== 1 · The front page =====================
     A newspaper's front page: one poster line, and the lede set in the
     editorial serif. No kicker above the heading — the line is the whole top of
     the page and it can carry itself.

     This section used to open with its own dateline rule ("NEXORA · the proof
     desk" / "one way to learn · free to start"). That row is gone because the
     masthead above now *is* that dateline, and two ruled datelines 100px apart
     do not read as print hierarchy — they read as a mistake. The two strings
     moved into `MASTHEAD` in the content module, so they are printed once.

     The poster line is sized by measurement, not by taste. In the 1216px
     measure this page renders at, "The proof is what's left." sets on one line
     up to 160px and wraps at 166px — and `13vw` of a 1280px window is 166px, so
     every laptop got three lines where the copy asks for two, which pushed the
     download past the fold. The clamp caps under that wrap threshold instead, so
     the line holds two at every width.

     The padding is deliberately heavier at the bottom than the top: a block with
     symmetric air floats above the artefact it belongs to, and this one should
     pull *into* the page below it rather than hover over it. That air is also
     why the artefact band carries no top margin of its own.

     The lede's and the button row's margins are 2rem rather than the 2.25/2.5rem
     they were, and the 12px that saves is spent on the masthead above: the
     nameplate grew to the largest size the fold allows, and at 1280x720 the
     difference is whether the closing note is a readable line or a line sliced
     in half by the fold. A cut line is worse than either end.

     Finally the short sheet. On a 320x568 screen this block cannot hold
     headline, lede, controls and the note above the fold at full size: the
     poster line sets three lines there (one, then two), and at 48px each of
     those lines is 42px of leading, so the note lands 57px under the fold.
     Setting the block smaller on *every* phone to fix that would spend the
     poster on the many for one, so the reduction is scoped to short viewports
     (see the media query in the style block, where the 65px it saves is broken
     down): the press sets its type to fit the sheet it is printing on, not the
     sheet it wishes it had. -->
<section class="relative overflow-x-clip">
  <div class="hero-block mx-auto max-w-[1320px] px-5 pt-6 pb-14 sm:px-8 sm:pt-8 sm:pb-16">
    <Headline
      as="h1"
      lines={[HERO.lineOne, HERO.lineTwo]}
      class="text-[clamp(3rem,11vw,9.5rem)] text-ink"
    />
    <p
      class="hero-lede mt-8 max-w-[62ch] font-serif text-[clamp(1.25rem,2.4vw,1.9rem)] leading-snug text-muted"
    >
      {HERO.lede}
    </p>

    <div class="hero-actions mt-8 flex flex-wrap items-center gap-3">
      <ActionLink href={downloadHref} island>{HERO.primary}</ActionLink>
      <ActionLink href="#courses" variant="ghost">{HERO.secondary}</ActionLink>
    </div>
    <p class="hero-note mt-4 text-[12.5px] text-faint">{HERO.note}</p>
  </div>

  <!-- The artefact: the one thing on the page the press actually produces.
       Everything above is type; this is the object, and it is printed live. -->
  <div id="hero-run" class="halftone border-y border-ink">
    <div class="mx-auto max-w-[1320px] px-5 py-14 sm:px-8 sm:py-20">
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h2 class="display max-w-[18ch] text-[clamp(1.6rem,3.2vw,2.6rem)] text-ink">
          A run leaves the reason, and then a receipt.
        </h2>
        <p class="stamp max-w-[30ch] text-[11px] leading-relaxed text-muted">
          a failure, its reason, the same check passing, and the sheet anyone can re-derive
        </p>
      </div>
      <ProofRun />
    </div>
  </div>
</section>

<!-- ===================== 2 · The argument =====================
     An editorial column: one claim held at the left, three arguments read as
     hanging text at the right. No cards, no borders — the space does the
     dividing. -->
<section id="why" class="border-t border-rule">
  <div class="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <div class="min-w-0">
      <h2 class="display text-[clamp(2rem,4.6vw,3.4rem)] text-ink">
        Tutorials do not fail you. They stop.
      </h2>
      <p class="mt-6 max-w-[42ch] text-[15px] leading-relaxed text-muted">
        Two of the three things an interview asks for — that you can build, and that you can prove
        it — are exactly the two a video never produced.
      </p>
    </div>

    <div class="min-w-0" use:inViewStagger>
      {#each WEDGE as cell (cell.kicker)}
        <article class="fade-up border-t border-ink pt-6 pb-8 last:pb-0" data-stagger-item>
          <h3 class="display max-w-[24ch] text-[clamp(1.25rem,2.3vw,1.75rem)] text-ink">
            {cell.title}
          </h3>
          <p class="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted">{cell.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- ===================== 3 · The door =====================
     A ruled form: three steps on the left rail, their instructions on the
     right, each step a full-width row under a heavy rule. Numbers are real
     here — the order is the point — so they are allowed to be loud. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="Download. Approve a code. Your tier opens the rest."
      caption="Learning happens in the IDE — this site holds the download, the account and the proof. There is no second way to learn here, which is the point."
      wide
    />

    <div class="mt-14 border-t-2 border-ink">
      {#each STEPS as step (step.id)}
        {@const points = "points" in step ? step.points : step.steps}
        <div class="grid gap-6 border-b border-ink py-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div class="flex min-w-0 gap-6">
            <span class="num pt-1 text-[clamp(2rem,4vw,2.8rem)] leading-none font-bold text-accent">
              {step.n}
            </span>
            <h3 class="display max-w-[18ch] text-[clamp(1.4rem,2.6vw,2.1rem)] text-ink">
              {step.title}
            </h3>
          </div>

          <div class="min-w-0">
            <p class="max-w-[58ch] text-[15px] leading-relaxed text-muted">{step.caption}</p>
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

    <p class="mt-8 text-[13px] text-faint">
      Free to download, and the base course is bundled with the installer — so the first judged
      verdict never waits on an account.
    </p>
  </div>
</section>

<!-- ===================== 4 · The handshake =====================
     A demonstration, not a paragraph: the two panes of the device-code
     handshake, side by side, with the approve on this side. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="The IDE never asks for your password."
      caption="It prints a short code and opens this site. You sign in here, approve the code, and the editor signs in by itself — nothing to paste, nowhere to mistype. Try the two halves below."
    />
    <div class="mt-12">
      <DeviceCode />
    </div>
  </div>
</section>

<!-- ===================== 5 · The lights =====================
     A plate of thirty-two squares lit by tier: the pricing story told as one
     object rather than as two cards. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="Your tier opens the courses."
      caption="The base course is free forever and assessment is never gated. A subscription unlocks the rest, and unlocking means the phases appear inside the IDE you already have."
    />
    <div class="mt-12">
      <TierGrid />
    </div>
    <div class="mt-8">
      <ActionLink href={pricingHref} variant="ghost" island>See pricing</ActionLink>
    </div>
  </div>
</section>

<!-- ===================== 6 · The chain =====================
     A full-bleed band, scrubbed against the scroll: the one section whose
     shape is a machine running rather than a column of text. -->
<section class="border-y border-ink bg-panel">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="From your keyboard to someone else's browser."
      caption="Scroll it. Each link only holds while the one before it does — a receipt that cannot be re-derived is a badge, and this site does not issue badges."
    />
    <div class="mt-14">
      <ProofChain />
    </div>
  </div>
</section>

<!-- ===================== 7 · The ledger =====================
     The curriculum as ruled rows that open, not a grid of equal cards. -->
<section id="courses" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="Three courses. Thirty-two phases. One editor."
      caption="Everything below ships inside the IDE and is judged there — this site teaches nothing itself. Open a course to read its real phase list."
      wide
    />
    <div class="mt-12">
      <CourseLedger />
    </div>
    <p class="mt-8 text-[13px] text-faint">
      Phase names are the shipped manifest, not marketing copy — the build fails if this list and the
      IDE disagree.
    </p>
  </div>
</section>

<!-- ===================== 8 · The limits =====================
     The one place the page raises its voice: what the product will not do,
     set on heavy rules, then exactly where its certainty stops. -->
<section id="limits" class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <h2 class="display max-w-[16ch] text-[clamp(2.2rem,5.2vw,3.8rem)] text-ink">
      What NEXORA will not do.
    </h2>

    <ul class="mt-12 grid gap-8 border-t-2 border-ink pt-8 lg:grid-cols-3 lg:gap-12">
      {#each NO_LIST as line, i (`no-${i}`)}
        <li class="text-[15px] leading-relaxed text-muted" use:inView>
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
            <p class="max-w-[52ch] text-[15px] leading-relaxed text-muted">{row.body}</p>
          </div>
        {/each}
      </div>

      <div class="mt-12">
        <ActionLink href={verifyHref} variant="ghost" island>Check a receipt yourself</ActionLink>
      </div>
    </div>
  </div>
</section>

<!-- ===================== 9 · The questions =====================
     A plain ruled list; the answers are the content, so nothing frames them. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead title="The five questions, answered plainly." wide />
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
          <p class="max-w-[68ch] pb-6 pl-[2.6rem] text-[14.5px] leading-relaxed text-muted">
            {item.a}
          </p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- ===================== 10 · The close =====================
     A poster to end on. The one place the outlined ink line is used, because
     this is the single sentence the page wants read twice. -->
<section class="border-t-2 border-ink">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <Headline
      as="p"
      lines={["Nobody is coming", "to check your work."]}
      class="text-[clamp(2.4rem,8vw,6rem)] text-ink"
    />
    <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <p class="max-w-[46ch] text-[15px] leading-relaxed text-muted">
        So the product does it, deterministically, and hands you the artefact. You still have to
        build the thing — that part was never the tutorial's to give.
      </p>
      <div class="flex flex-wrap items-center gap-3 lg:justify-end">
        <ActionLink href={downloadHref} island>{HERO.primary}</ActionLink>
        <ActionLink href={pricingHref} variant="ghost">See pricing</ActionLink>
      </div>
    </div>
    <div id="foot-sentinel" class="h-px" aria-hidden="true"></div>
  </div>
</section>

{#if pastHero && !atFooter}
  <aside class="ctabar" aria-label="Get the IDE">
    <p class="stamp hidden text-[11.5px] text-faint sm:block">
      Free to download · base course included
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
    justify-content: flex-end;
    gap: var(--space-4);
    padding: var(--space-3) clamp(var(--space-5), 4vw, var(--space-8));
    background: var(--color-ink);
    border-top: 2px solid var(--color-ink);
    animation: ctabar-in 260ms var(--ease-out) both;
  }
  /* On the black bar the type has to come from the paper side of the palette,
     not the ink ramp — ink on ink is unreadable and no token pairs them. */
  .ctabar :global(.stamp) {
    color: var(--color-paper-2);
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
  /* The short sheet: a short viewport, whatever its width, because the shortage
     is vertical. This is a print decision — the press sets its type to fit the
     page it is printing on. The 65px it saves at 320x568 is 21px of leading
     (the poster line sets three lines, and 40px lines lead 35px where 48px
     lines lead 42px) plus 44px of air.

     The only type that moves is the poster line's floor (2.5rem instead of
     3rem). Above ~364px wide the clamp's middle term drives the size, so on a
     short laptop window the headline is untouched and only the air tightens;
     on a narrow phone the line itself sets smaller, which is the case that
     needs it. Measured: the closing note moves from 57px below the fold to
     inside it at 320x568, from 31px below to inside at 1024x600, and nothing
     changes at 375x667, 390x844, 768x1024, 1280x720 or 1440x900. */
  @media (max-height: 660px) {
    .hero-block {
      padding-top: var(--space-3);
    }
    .hero-block :global(h1) {
      font-size: clamp(2.5rem, 11vw, 9.5rem);
    }
    .hero-block .hero-lede {
      margin-top: var(--space-5);
    }
    .hero-block .hero-actions {
      margin-top: var(--space-5);
    }
    .hero-block .hero-note {
      margin-top: var(--space-2);
    }
  }

  @media (min-width: 640px) {
    .ctabar {
      justify-content: space-between;
    }
  }
</style>
