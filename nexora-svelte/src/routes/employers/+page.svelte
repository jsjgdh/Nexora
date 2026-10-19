<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";
  import { COURSES, EMPLOYER, FACTS, PROPS } from "$lib/content/site";

  /* The employer one-pager.
   *
   * The research's §7 lists the collateral this product should have, and the
   * employer one-pager is the one piece of it a hiring manager would actually
   * read: one page, one question, printed on one sheet.
   *
   * The research's sample employer copy promises three things: hires that
   * arrive with a portfolio, less onboarding overhead, and graduates who are
   * fluent with generated code. Two of those cannot be written, because
   * there is no portfolio to attach and no cohort to have graduated. The
   * third can, and it is the strongest of the three, so the page is built
   * around the same three propositions as the site and around the artefacts
   * that back them.
   *
   * The page says what is not built yet, in the same place and with the same
   * weight as what is. A hiring manager who reads that and walks away was
   * never going to buy, and the ones who read it and stay are the ones worth
   * talking to.
   *
   * It is meant to be printed: the print stylesheet in `app.css` turns this
   * route into a single sheet of paper, because a document that has to be
   * screenshotted is a document that does not get read. */

  const total = COURSES.reduce((n, course) => n + course.phases.length, 0);
</script>

<PageHead
  title={pageTitle("For hiring")}
  description="What a finished NEXORA phase leaves behind, how a stranger can check it, and what is not built yet. One page, printable."
  path="/employers"
/>

<div class="onepager mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <!-- ===================== The pitch ===================== -->
  <div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
    <div>
      <Headline
        as="h1"
        lines={["What a hire comes with,", "and how you check it."]}
        class="max-w-[16ch] text-[clamp(2rem,5vw,3.6rem)] text-ink"
      />
      <p class="reading mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted">
        Every finished phase leaves a signed receipt: the command, the exit code, the file hash, the
        duration. Anyone can re-derive it at /verify, with no account and no call.
      </p>
      <div class="mt-8 flex flex-wrap items-center gap-3">
        <ActionLink href="/verify" island>Check a receipt yourself</ActionLink>
        <ActionLink href="/#courses" variant="ghost">Read the curriculum</ActionLink>
      </div>
    </div>

    <Plate>
      <p class="stamp text-faint">the scope, in one line</p>
      <dl class="mt-5 grid gap-4">
        {#each FACTS as fact (fact.label)}
          <div class="flex items-baseline gap-4 border-t border-rule pt-3 first:border-t-0 first:pt-0">
            <dt class="max-w-[22ch] text-[13px] leading-snug text-muted">{fact.label}</dt>
            <dd class="num ml-auto text-[15px] font-bold text-ink">{fact.value}</dd>
          </div>
        {/each}
      </dl>
      <p class="mt-6 border-t border-rule pt-4 text-[12.5px] leading-relaxed text-faint">
        {total} phases across {COURSES.length} courses, every one of them judged inside the desktop
        IDE. {COURSES.map((course) => course.title).join(", ")}.
      </p>
    </Plate>
  </div>

  <!-- ===================== The three propositions ===================== -->
  <section class="mt-20 border-t border-rule pt-12" aria-labelledby="employer-props">
    <h2 id="employer-props" class="display max-w-[20ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      Three things a hire comes with.
    </h2>
    <ul class="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-12">
      {#each PROPS.employer as prop (prop.id)}
        <li class="border-t border-rule-strong pt-6">
          <h3 class="display max-w-[18ch] text-[clamp(1.15rem,1.9vw,1.5rem)] text-ink">{prop.title}</h3>
          <p class="reading mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted">{prop.body}</p>
        </li>
      {/each}
    </ul>
  </section>

  <!-- ===================== The evidence ===================== -->
  <section class="mt-20 border-t border-rule pt-12" aria-labelledby="employer-checks">
    <h2 id="employer-checks" class="display max-w-[22ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      {EMPLOYER.title}
    </h2>
    <ul class="mt-10 border-t border-rule">
      {#each EMPLOYER.checks as check (check.claim)}
        <li class="grid gap-3 border-b border-rule py-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
          <p class="text-[15.5px] font-semibold text-ink">{check.claim}</p>
          <p class="reading max-w-[60ch] text-[15px] leading-relaxed text-muted">{check.evidence}</p>
        </li>
      {/each}
    </ul>
  </section>

  <!-- ===================== The limits ===================== -->
  <section class="mt-20 grid gap-10 border-t border-rule pt-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
    <div>
      <h2 class="display max-w-[16ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
        What is not built yet.
      </h2>
      <p class="reading mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted">
        Stated here rather than in a footnote, because the fastest way to lose a reader who was
        willing to believe you is to let them find the gap themselves.
      </p>
    </div>
    <ul class="grid gap-4">
      {#each EMPLOYER.notYet as gap (gap.text)}
        <li class="grid grid-cols-[auto_1fr] gap-4 border-t border-rule pt-4 text-[15px] leading-relaxed text-muted">
          <span class="num pt-0.5 text-[12px] text-removed" aria-hidden="true">✗</span>
          <span>{gap.text}</span>
        </li>
      {/each}
    </ul>
  </section>

  <!-- ===================== The pilot ===================== -->
  <section class="mt-20 border-t border-rule pt-12" aria-labelledby="employer-pilot">
    <h2 id="employer-pilot" class="display max-w-[20ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      How a pilot starts.
    </h2>
    <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-16">
      <p class="reading max-w-[62ch] text-[16px] leading-relaxed text-muted">
        {EMPLOYER.pilot.body}
      </p>
      <div class="flex flex-wrap items-center gap-3 lg:justify-end">
        <ActionLink href="/download" variant="ghost">Download the IDE</ActionLink>
        <ActionLink href="/verify" island>Verify a receipt</ActionLink>
      </div>
    </div>
  </section>

  <!-- ===================== The close ===================== -->
  <section class="mt-20 border-t-2 border-rule-strong pt-12" aria-labelledby="employer-close">
    <h2 id="employer-close" class="display max-w-[24ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      There is no cohort behind this page yet.
    </h2>
    <p class="reading mt-4 max-w-[64ch] text-[16px] leading-relaxed text-muted">
      No placement rate, no salary figure and no customer logo, because we have not run a cohort we
      could honestly report on. What is here is the mechanism: the work runs, the rule engine judges
      it, the receipt is signed, and anybody can re-derive it. Judge the mechanism first, and the
      rest of the argument can wait until there is something to report.
    </p>
  </section>
</div>
