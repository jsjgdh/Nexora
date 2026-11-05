<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import HiringEnquiry from "$lib/components/HiringEnquiry.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";
  import CategoryMap from "$lib/components/CategoryMap.svelte";
  import { pageTitle } from "$lib/seo";
  import { COURSES, EMPLOYER, FACTS, HIRING_CONTACT, HIRING_ENQUIRY, PROPS } from "$lib/content/site";

  /* The employer one-pager.
   *
   * One page, one question, and a printed sheet that keeps its shape. The page
   * says what is not built yet with the same weight as what is, because the
   * fastest way to lose a reader who was willing to believe you is to let them
   * find the gap themselves.
   *
   * The market context is screen-only: a learner does not need it, and the
   * paper version is still the thing the page claims to be. */

  let { data }: PageProps = $props();

  const total = COURSES.reduce((n, course) => n + course.phases.length, 0);
</script>

<PageHead
  title={pageTitle("For hiring")}
  description="What a finished NEXORA phase leaves behind, how a stranger can check it, and what is not built yet. One page, printable."
  path="/employers"
/>

<div class="onepager">
  <section class="employer-hero">
    <div class="container-page employer-grid">
      <div>
        <h1 class="display employer-title">What a hire comes with, and how you check it.</h1>
        <p class="employer-lede">
          Every finished phase leaves a signed receipt: the command, the exit code, the file hash,
          the duration. Anyone can re-derive it at /verify, with no account and no call.
        </p>
        <div class="employer-actions">
          <ActionLink href="/verify" size="lg" island>Verify a receipt</ActionLink>
          <ActionLink href="/#courses" variant="ghost" size="lg">Read the curriculum</ActionLink>
        </div>
      </div>

      <aside class="scope-card card">
        <p class="stamp scope-label">The scope, in one line</p>
        <dl class="scope-list">
          {#each FACTS as fact (fact.label)}
            <div>
              <dt>{fact.label}</dt>
              <dd class="num">{fact.value}</dd>
            </div>
          {/each}
        </dl>
        <p class="scope-note">
          {total} phases, every one of them judged inside the desktop IDE.
          {COURSES.map((course) => course.title).join(", ")}.
        </p>
      </aside>
    </div>
  </section>

  <section class="section-pad props-section" aria-labelledby="employer-props">
    <div class="container-page">
      <h2 id="employer-props" class="display section-title">Three things a hire comes with.</h2>
      <ul class="props">
        {#each PROPS.employer as prop, i (prop.id)}
          <li>
            <span class="num prop-n">{String(i + 1).padStart(2, "0")}</span>
            <h3 class="prop-title">{prop.title}</h3>
            <p class="prop-body">{prop.body}</p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section id="market" class="screen-only market-section" aria-labelledby="employer-market">
    <div class="container-page">
      <h2 id="employer-market" class="display section-title">The market this answer is for.</h2>
      <div class="market-card card">
        <MarketPanel />
      </div>
      <div class="category-card card">
        <CategoryMap />
      </div>
    </div>
  </section>

  <section class="section-pad evidence-section" aria-labelledby="employer-checks">
    <div class="container-page">
      <h2 id="employer-checks" class="display section-title">{EMPLOYER.title}</h2>
      <ul class="evidence">
        {#each EMPLOYER.checks as check (check.claim)}
          <li>
            <p class="evidence-claim">{check.claim}</p>
            <p class="evidence-body">{check.evidence}</p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="limits-section">
    <div class="container-page limits-grid">
      <div>
        <h2 class="display limits-title">What is not built yet.</h2>
        <p class="limits-lede">
          Stated here rather than in a footnote, because the fastest way to lose a reader who was
          willing to believe you is to let them find the gap themselves.
        </p>
      </div>
      <ul class="limits">
        {#each EMPLOYER.notYet as gap (gap.text)}
          <li>
            <span class="num cross" aria-hidden="true">✗</span>
            <span>{gap.text}</span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="section-pad pilot-section" aria-labelledby="employer-pilot">
    <div class="container-page pilot-grid">
      <div>
        <h2 id="employer-pilot" class="display section-title">How a pilot starts.</h2>
        <p class="pilot-body">{EMPLOYER.pilot.body}</p>
      </div>
      <div class="pilot-actions">
        <ActionLink href="/download" variant="ghost">{data.release.label}</ActionLink>
        <ActionLink href="/verify" island>Verify a receipt</ActionLink>
      </div>
    </div>
  </section>

  <section id="contact" class="contact-section" aria-labelledby="employer-contact">
    <div class="container-page contact-grid">
      <div>
        <h2 id="employer-contact" class="display section-title">{HIRING_ENQUIRY.title}</h2>
        <p class="contact-body">{HIRING_ENQUIRY.lead}</p>
        <p class="contact-body">{HIRING_ENQUIRY.next}</p>
        <p class="contact-address">
          Write to
          <a href="mailto:{HIRING_CONTACT}">{HIRING_CONTACT}</a>
          if you would rather not use a form. It is the same mailbox.
        </p>
      </div>
      <div class="contact-form">
        <HiringEnquiry mailConfigured={data.mailConfigured} />
      </div>
    </div>
  </section>

  <section class="employer-close">
    <div class="container-page">
      <h2 class="display close-title">There is no cohort behind this page yet.</h2>
      <p class="close-body">
        No placement rate, no salary figure and no customer logo, because we have not run a cohort
        we could honestly report on. What is here is the mechanism: the work runs, the rule engine
        judges it, the receipt is signed, and anybody can re-derive it. Judge the mechanism first,
        and the rest of the argument can wait until there is something to report.
      </p>
    </div>
  </section>
</div>

<style>
  .employer-hero {
    padding-block: clamp(3.5rem, 7vw, 6rem) clamp(2.5rem, 5vw, 4rem);
    border-bottom: 1px solid var(--color-rule);
    background:
      radial-gradient(60% 80% at 85% 20%, color-mix(in srgb, var(--color-accent) 12%, transparent), transparent 60%);
  }

  .employer-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 1080px) {
    .employer-grid {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: clamp(3rem, 6vw, 5rem);
    }
  }

  .employer-title {
    margin-top: var(--space-5);
    font-size: var(--text-page);
    line-height: 0.95;
    letter-spacing: -0.055em;
    text-wrap: balance;
  }

  .employer-lede {
    margin-top: var(--space-5);
    max-width: 50ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.6;
    color: var(--color-muted);
  }

  .employer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-7);
  }

  .scope-card {
    padding: var(--space-6);
  }

  @media (min-width: 640px) {
    .scope-card {
      padding: var(--space-8);
    }
  }

  .scope-label {
    color: var(--color-faint);
  }

  .scope-list {
    margin: var(--space-5) 0 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .scope-list div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--color-rule);
  }

  .scope-list dt {
    max-width: 26ch;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--color-muted);
  }

  .scope-list dd {
    margin: 0;
    font-size: 1rem;
    color: var(--color-ink);
  }

  .scope-note {
    margin-top: var(--space-4);
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--color-faint);
  }

  .props-section {
    background: var(--color-panel);
  }

  .section-title {
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  }

  .props {
    list-style: none;
    margin: var(--space-8) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
  }

  @media (min-width: 900px) {
    .props {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .props li {
    padding-top: var(--space-4);
    border-top: 2px solid color-mix(in srgb, var(--color-accent) 55%, var(--color-rule));
  }

  .prop-n {
    font-size: 9px;
    color: var(--color-faint);
  }

  .prop-title {
    margin-top: var(--space-2);
    max-width: 18ch;
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .prop-body {
    margin-top: var(--space-2);
    max-width: 38ch;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .market-section {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .market-card,
  .category-card {
    margin-top: var(--space-6);
    padding: var(--space-5);
  }

  .evidence-section {
    background: var(--color-panel);
  }

  .evidence {
    list-style: none;
    margin: var(--space-8) 0 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .evidence li {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-5);
    border-bottom: 1px solid var(--color-rule-strong);
  }

  @media (min-width: 900px) {
    .evidence li {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: var(--space-10);
    }
  }

  .evidence-claim {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .evidence-body {
    max-width: 58ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .limits-section {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .limits-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
  }

  @media (min-width: 980px) {
    .limits-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .limits-title {
    margin-top: var(--space-4);
    max-width: 14ch;
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  }

  .limits-lede {
    margin-top: var(--space-4);
    max-width: 42ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .limits {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .limits li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule-strong);
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-ink);
  }

  .cross {
    color: var(--color-fail);
    font-size: 10px;
  }

  .pilot-section {
    background: var(--color-panel);
  }

  .pilot-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
    align-items: start;
  }

  @media (min-width: 980px) {
    .pilot-grid {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-16);
    }
  }

  .pilot-body {
    margin-top: var(--space-4);
    max-width: 62ch;
    font-size: 14.5px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .pilot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .contact-section {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .contact-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    align-items: start;
  }

  @media (min-width: 980px) {
    .contact-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .contact-body {
    margin-top: var(--space-4);
    max-width: 46ch;
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .contact-address {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .contact-address a {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .contact-form {
    min-width: 0;
  }

  .employer-close {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-screen);
    color: var(--color-screen-ink);
  }

  .close-title {
    max-width: 22ch;
    font-size: clamp(1.9rem, 4vw, 3rem);
    color: var(--color-screen-ink);
  }

  .close-body {
    margin-top: var(--space-4);
    max-width: 66ch;
    font-size: 14px;
    line-height: 1.7;
    color: var(--color-screen-muted);
  }
</style>
