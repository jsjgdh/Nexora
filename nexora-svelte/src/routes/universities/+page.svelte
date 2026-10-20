<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import TeachingEnquiry from "$lib/components/TeachingEnquiry.svelte";
  import { pageTitle } from "$lib/seo";
  import {
    ALL_PHASES,
    FACTS,
    TEACHING_CONTACT,
    TEACHING_ENQUIRY,
    UNIVERSITY,
  } from "$lib/content/site";

  /* The teaching one-pager.
   *
   * The hiring page answers one question for one reader. This page answers
   * one question for the other reader in the room: a lecturer, or a department
   * head, who wants to know whether this can be taught before anything is
   * agreed.
   *
   * It is the same document as the hiring one, on purpose. Same wrapper, same
   * print stylesheet, same order: the pitch, the propositions, what can be
   * checked, what is not built yet, how a pilot starts, the contact, and the
   * honest close. A reader who has seen one of them knows how to read the
   * other.
   *
   * Every claim on it names the artefact behind it, and the counts are read
   * out of the copy module rather than typed, so a phase added to the
   * curriculum cannot leave a stale number here.
   *
   * What is not built yet is stated in the same place and with the same
   * weight as what is. A lecturer who finds out in week three that the
   * gradebook export does not exist stops trusting the part that does.
   *
   * It is meant to be printed. The print stylesheet in `app.css` turns this
   * route into a single sheet of paper, and the one thing the printed sheet
   * drops is the form: a field a reader cannot fill in on paper is not worth
   * the space, and the address and the promise stay. */

  let { data }: { data: { mailConfigured: boolean } } = $props();
</script>

<PageHead
  title={pageTitle(UNIVERSITY.title)}
  description="What a lecturer can check about a NEXORA phase, what a campus licence covers, and what is not built yet. One page, printable."
  path="/universities"
/>

<div class="onepager mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <!-- ===================== The pitch ===================== -->
  <div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
    <div>
      <Headline
        as="h1"
        lines={UNIVERSITY.headline}
        class="max-w-[16ch] text-[clamp(2rem,5vw,3.6rem)] text-ink"
      />
      <p class="reading mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted">
        {UNIVERSITY.lede}
      </p>
      <div class="mt-8 flex flex-wrap items-center gap-3">
        <ActionLink href="/verify" island>Check a receipt yourself</ActionLink>
        <ActionLink href="/pricing" variant="ghost">See the pricing</ActionLink>
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
        {ALL_PHASES.length} phases, every one of them judged inside the desktop IDE. {UNIVERSITY.courses}.
      </p>
    </Plate>
  </div>

  <!-- ===================== The three propositions ===================== -->
  <section class="mt-20 border-t border-rule pt-12" aria-labelledby="university-props">
    <h2 id="university-props" class="display max-w-[20ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      Three things a lecturer gets.
    </h2>
    <ul class="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-12">
      {#each UNIVERSITY.propositions as proposition (proposition.id)}
        <li class="border-t border-rule-strong pt-6">
          <h3 class="display max-w-[18ch] text-[clamp(1.15rem,1.9vw,1.5rem)] text-ink">
            {proposition.title}
          </h3>
          <p class="reading mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted">
            {proposition.body}
          </p>
        </li>
      {/each}
    </ul>
  </section>

  <!-- ===================== What can be checked ===================== -->
  <section class="mt-20 border-t border-rule pt-12" aria-labelledby="university-checks">
    <h2 id="university-checks" class="display max-w-[22ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      What a lecturer can check today.
    </h2>
    <ul class="onepager-checks mt-10 border-t border-rule">
      {#each UNIVERSITY.checks as check (check.claim)}
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
        Stated here rather than in a footnote.
      </p>
    </div>
    <ul class="onepager-gaps grid gap-4">
      {#each UNIVERSITY.notYet as gap (gap.text)}
        <li class="grid grid-cols-[auto_1fr] gap-4 border-t border-rule pt-4 text-[15px] leading-relaxed text-muted">
          <span class="num pt-0.5 text-[12px] text-removed" aria-hidden="true">✗</span>
          <span>{gap.text}</span>
        </li>
      {/each}
      <li class="grid grid-cols-[auto_1fr] gap-4 border-t border-rule pt-4 text-[15px] leading-relaxed text-muted">
        <span class="num pt-0.5 text-[12px] text-removed" aria-hidden="true">✗</span>
        <span>
          {UNIVERSITY.accessibility.text}
          <a class="text-accent underline underline-offset-4" href={UNIVERSITY.accessibility.href}>
            {UNIVERSITY.accessibility.label}
          </a>
        </span>
      </li>
    </ul>
  </section>

  <!-- ===================== The pilot ===================== -->
  <section class="mt-20 border-t border-rule pt-12" aria-labelledby="university-pilot">
    <h2 id="university-pilot" class="display max-w-[20ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      {UNIVERSITY.pilot.title}
    </h2>
    <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-16">
      <div class="max-w-[62ch]">
        <p class="reading text-[16px] leading-relaxed text-muted">
          {UNIVERSITY.pilot.body}
        </p>
        <p class="reading mt-4 text-[16px] leading-relaxed text-muted">
          {UNIVERSITY.pilot.licence}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3 lg:justify-end">
        <ActionLink href="/download" variant="ghost">Download the IDE</ActionLink>
        <ActionLink href="/verify" island>Verify a receipt</ActionLink>
      </div>
    </div>
  </section>

  <!-- ===================== The contact ===================== -->
  <section id="contact" class="mt-20 border-t border-rule pt-12" aria-labelledby="university-contact">
    <h2 id="university-contact" class="display max-w-[20ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      {TEACHING_ENQUIRY.title}
    </h2>
    <div class="onepager-contact mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
      <div class="min-w-0">
        <p class="reading max-w-[46ch] text-[15px] leading-relaxed text-muted">
          {TEACHING_ENQUIRY.lead}
        </p>
        <p class="reading mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          {TEACHING_ENQUIRY.next}
        </p>
        <p class="mt-6 border-t border-rule pt-4 text-[13.5px] leading-relaxed text-muted">
          Write to
          <a class="text-accent underline underline-offset-4" href="mailto:{TEACHING_CONTACT}">{TEACHING_CONTACT}</a>
          if you would rather not use a form. It is the same mailbox.
        </p>
      </div>
      <div class="min-w-0" data-teaching-enquiry>
        <TeachingEnquiry mailConfigured={data.mailConfigured} />
      </div>
    </div>
  </section>

  <!-- ===================== The close ===================== -->
  <section class="mt-20 border-t-2 border-rule-strong pt-12" aria-labelledby="university-close">
    <h2 id="university-close" class="display max-w-[24ch] text-[clamp(1.5rem,2.8vw,2.2rem)] text-ink">
      {UNIVERSITY.close.title}
    </h2>
    <p class="reading mt-4 max-w-[64ch] text-[16px] leading-relaxed text-muted">
      {UNIVERSITY.close.body}
    </p>
  </section>
</div>
