<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import ContactCard from "$lib/components/ContactCard.svelte";
  import { pageTitle } from "$lib/seo";
  import { PRIVACY_CONTACT } from "$lib/legal";

  /* The accessibility statement, stated as a position rather than a badge.
   *
   * Everything claimed here is something the repository can show, and nothing
   * more. The automated pass really does run (axe-core over the production
   * routes, in `scripts/verify-a11y.ts`), so the page names it; but that pass
   * covers a subset of WCAG criteria, so the page says that too instead of
   * implying conformance. There is no commissioned audit and no ACR/VPAT, so
   * the page says there is none rather than leaving the absence to be inferred.
   *
   * Accessibility is a target we test against, not a certificate we hold. */

  const keyboardPoints: { title: string; body: string }[] = [
    {
      title: "Operable by keyboard",
      body: "Every control on the site is reachable and usable with the keyboard alone, and the first focusable element on every page is a skip-to-main-content link.",
    },
    {
      title: "Focus is never hidden",
      body: "No control removes its focus ring. The project's own verification fails if any file in the interface turns a focus outline off, so a visible focus indicator cannot be lost to a redesign.",
    },
    {
      title: "Motion follows your preference",
      body: "Reduced motion is a real branch, not a slower animation: the page settles into its finished state when the operating system asks for less movement, and the run transcript is readable in full without it.",
    },
    {
      title: "Dark by default",
      body: "The dark environment is the default because learners study at night; the interface is designed against it rather than treating it as a toggle.",
    },
  ];
</script>

<PageHead
  title={pageTitle("Accessibility")}
  description="NEXORA's accessibility position: what is tested automatically, what is known to be incomplete, and how to report a barrier."
  path="/accessibility"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["A position,", "not a certificate."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">
    Accessibility work that is described honestly is worth more than a badge, so this page says what
    is tested, by what means, and where the gaps still are.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
    <Plate crosshair>
      <p class="stamp text-[11px] text-faint">accessibility statement</p>
      <DocStatus />

      <div class="mt-6 grid gap-8 text-[13.5px] leading-relaxed text-muted">
        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What we work to</h2>
          <p class="mt-3">
            <span class="text-ink">WCAG 2.1 level AA</span> is the target for this website and for the
            NEXORA IDE. It is the standard we check against and measure ourselves by — not a
            certification we hold, and not a claim that we have met every criterion today. The rest of
            this page is the difference between those two sentences.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            What is tested, and by what means
          </h2>
          <p class="mt-3">
            An automated accessibility pass runs over the site's production pages
            (<span class="text-ink">axe-core</span>, driven by the project's own verification script
            against a real production build, covering WCAG A and AA rule sets and axe's
            best-practice set). The results are part of the suite, so a regression that introduces a
            violation fails the build rather than waiting to be noticed by a learner.
          </p>
          <p class="mt-3">
            <span class="text-ink">Stated plainly:</span> automated testing covers a subset of WCAG
            criteria. It reliably catches missing labels, contrast failures, landmark and heading
            structure, and similar machine-detectable problems. It cannot judge whether an
            interaction makes sense to a screen-reader user, whether the reading order matches the
            visual order in every situation, or whether a control's purpose is clear. A clean
            automated pass is evidence that certain classes of barrier are absent; it is not proof of
            conformance, and this page does not treat it as one.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Keyboard, screen reader, and display
          </h2>
          <ul class="mt-3 grid gap-4">
            {#each keyboardPoints as point (point.title)}
              <li>
                <span class="text-ink">{point.title}.</span>
                {point.body}
              </li>
            {/each}
          </ul>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Known limitations</h2>
          <p class="mt-3">
            This is a young product, and three limits are worth naming rather than leaving for someone
            to discover.
          </p>
          <ul class="mt-3 grid gap-3">
            <li>
              <span class="text-ink">No formal audit has been commissioned.</span>
              The accessibility work to date is the automated pass described above plus manual design
              decisions. No independent audit against WCAG has been carried out.
            </li>
            <li>
              <span class="text-ink">No accessibility conformance report exists yet.</span>
              There is no ACR or VPAT to hand to a procurement or public-sector reviewer. See below
              for how to ask about one.
            </li>
            <li>
              <span class="text-ink">The IDE's interactive lab surfaces have not had the same pass.</span>
              The desktop app is a fork of an editor that carries its own accessibility work, but the
              interactive panels this product adds to it — the design studio and the debugging
              investigation panels — are custom webview surfaces, and they have not yet been put
              through the automated pass the website has.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Reporting a barrier</h2>
          <p class="mt-3">
            Write to <span class="text-ink">{PRIVACY_CONTACT}</span> and describe what you were trying
            to do and what stopped you. A barrier report is treated as a <span class="text-ink">bug
            with a priority</span>, not as a feature request: it is a defect in something we already
            claim to support, and it is triaged as one. If a fix is not possible immediately, we will
            tell you what the obstacle is rather than close the report quietly.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Requesting a conformance report
          </h2>
          <p class="mt-3">
            An accessibility conformance report (ACR, in the VPAT format) is
            <span class="text-ink">not yet available</span> — producing one honestly requires the
            commissioned audit above, and a report written before that would be a claim this page has
            just spent its length refusing to make. If you need one for a review, ask at
            <span class="text-ink">{PRIVACY_CONTACT}</span>; when one exists, this page will say so
            and link it here.
          </p>
        </section>
      </div>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">in one line</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Target:</span> WCAG 2.1 AA, tested against, not certified.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Automated:</span> axe-core over the site's production pages, pinned
            in the suite.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Manual:</span> keyboard operability, visible focus, reduced motion,
            dark-first design.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Missing:</span> an independent audit, an ACR/VPAT, and a pass over
            the IDE's lab panels.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">report a barrier</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          A boundary report is a defect in something we already claim to support, triaged as one. Use
          the form below when you want a response, or open your mailer with the address pre-filled.
        </p>
      </Plate>

      <svelte:component this={ContactCard} />
    </div>
  </div>
</div>
