<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import TeachingEnquiry from "$lib/components/TeachingEnquiry.svelte";
  import { pageTitle } from "$lib/seo";
  import {
    ALL_PHASES,
    COHORT_SURFACE,
    FACTS,
    TEACHING_CONTACT,
    TEACHING_ENQUIRY,
    UNIVERSITY,
  } from "$lib/content/site";

  /* The teaching one-pager.
   *
   * The same document as the hiring page for the other reader in the room: a
   * lecturer or a department head deciding whether this can be taught. The
   * order is the same, the print sheet is the same, and the limits get the
   * same weight as the claims. Every count is read from the manifest. */

  let { data }: PageProps = $props();
</script>

<PageHead
  title={pageTitle(UNIVERSITY.title)}
  description="What a lecturer can check about a NEXORA phase, what a campus licence covers, and what is not built yet. One page, printable."
  path="/universities"
/>

<div class="onepager onepager-teaching">
  <section class="teaching-hero">
    <div class="container-page teaching-grid">
      <div>
        <h1 class="display teaching-title">{UNIVERSITY.headline[0]}<br />{UNIVERSITY.headline[1]}</h1>
        <p class="teaching-lede">{UNIVERSITY.lede}</p>
        <div class="teaching-actions">
          <ActionLink href="/verify" size="lg" island>Verify a receipt</ActionLink>
          <ActionLink href="/pricing" variant="ghost" size="lg">See pricing</ActionLink>
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
          {ALL_PHASES.length} phases, every one of them judged inside the desktop IDE.
          {UNIVERSITY.courses}.
        </p>
      </aside>
    </div>
  </section>

  <section class="section-pad props-section" aria-labelledby="university-props">
    <div class="container-page">
      <h2 id="university-props" class="display section-title">Three things a lecturer gets.</h2>
      <ul class="props">
        {#each UNIVERSITY.propositions as proposition, i (proposition.id)}
          <li>
            <span class="num prop-n">{String(i + 1).padStart(2, "0")}</span>
            <h3 class="prop-title">{proposition.title}</h3>
            <p class="prop-body">{proposition.body}</p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="checks-section" aria-labelledby="university-checks">
    <div class="container-page">
      <h2 id="university-checks" class="display section-title">What a lecturer can check today.</h2>
      <ul class="checks onepager-checks">
        {#each UNIVERSITY.checks as check (check.claim)}
          <li>
            <p class="check-claim">{check.claim}</p>
            <p class="check-body">{check.evidence}</p>
          </li>
        {/each}
        <li class="cohort-lede">
          <p class="stamp">{COHORT_SURFACE.label}</p>
          <p class="cohort-body">{COHORT_SURFACE.lede}</p>
        </li>
        {#each COHORT_SURFACE.built as thing (thing.id)}
          <li>
            <p class="check-claim">{thing.claim}</p>
            <p class="check-body">{thing.evidence}</p>
          </li>
        {/each}
      </ul>
      <div class="checks-action">
        <ActionLink href={COHORT_SURFACE.link.href} variant="ghost" island>
          {COHORT_SURFACE.link.label}
        </ActionLink>
      </div>
    </div>
  </section>

  <section class="limits-section">
    <div class="container-page limits-grid">
      <div>
        <h2 class="display limits-title">What is not built yet.</h2>
        <p class="limits-lede">Stated here rather than in a footnote.</p>
      </div>
      <ul class="limits onepager-gaps">
        {#each UNIVERSITY.notYet as gap (gap.text)}
          <li>
            <span class="num cross" aria-hidden="true">✗</span>
            <span>{gap.text}</span>
          </li>
        {/each}
        <li>
          <span class="num cross" aria-hidden="true">✗</span>
          <span>
            {UNIVERSITY.accessibility.text}
            <a href={UNIVERSITY.accessibility.href}>{UNIVERSITY.accessibility.label}</a>
          </span>
        </li>
      </ul>
    </div>
  </section>

  <section class="section-pad pilot-section" aria-labelledby="university-pilot">
    <div class="container-page pilot-grid">
      <div>
        <h2 id="university-pilot" class="display section-title">{UNIVERSITY.pilot.title}</h2>
        <p class="pilot-body">{UNIVERSITY.pilot.body}</p>
        <p class="pilot-body">{UNIVERSITY.pilot.licence}</p>
      </div>
      <div class="pilot-actions">
        <ActionLink href="/download" variant="ghost">{data.release.label}</ActionLink>
        <ActionLink href="/verify" island>Verify a receipt</ActionLink>
      </div>
    </div>
  </section>

  <section id="contact" class="contact-section" aria-labelledby="university-contact">
    <div class="container-page contact-grid">
      <div>
        <h2 id="university-contact" class="display section-title">{TEACHING_ENQUIRY.title}</h2>
        <p class="contact-body">{TEACHING_ENQUIRY.lead}</p>
        <p class="contact-body">{TEACHING_ENQUIRY.next}</p>
        <p class="contact-address">
          Write to
          <a href="mailto:{TEACHING_CONTACT}">{TEACHING_CONTACT}</a>
          if you would rather not use a form. It is the same mailbox.
        </p>
      </div>
      <div class="contact-form" data-teaching-enquiry>
        <TeachingEnquiry mailConfigured={data.mailConfigured} />
      </div>
    </div>
  </section>

  <section class="teaching-close">
    <div class="container-page">
      <h2 class="display close-title">{UNIVERSITY.close.title}</h2>
      <p class="close-body">{UNIVERSITY.close.body}</p>
    </div>
  </section>
</div>

<style>
  .teaching-hero {
    padding-block: clamp(3.5rem, 7vw, 6rem) clamp(2.5rem, 5vw, 4rem);
    border-bottom: 1px solid var(--color-rule);
    background:
      radial-gradient(55% 70% at 88% 18%, color-mix(in srgb, var(--color-accent) 11%, transparent), transparent 62%);
  }

  .teaching-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 1080px) {
    .teaching-grid {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: clamp(3rem, 6vw, 5rem);
    }
  }

  .teaching-title {
    margin-top: var(--space-5);
    font-size: var(--text-page);
    line-height: 0.95;
    letter-spacing: -0.055em;
  }

  .teaching-lede {
    margin-top: var(--space-5);
    max-width: 50ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.6;
    color: var(--color-muted);
  }

  .teaching-actions {
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

  .props-section,
  .checks-section,
  .pilot-section {
    background: var(--color-panel);
  }

  .checks-section {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    border-top: 1px solid var(--color-rule);
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

  .checks {
    list-style: none;
    margin: var(--space-8) 0 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .checks li {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-5);
    border-bottom: 1px solid var(--color-rule-strong);
  }

  @media (min-width: 900px) {
    .checks li {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: var(--space-10);
    }
  }

  .check-claim {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .check-body {
    max-width: 58ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .cohort-lede {
    background: var(--color-raised);
  }

  .cohort-lede .stamp {
    color: var(--color-faint);
  }

  .cohort-body {
    max-width: 62ch;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .checks-action {
    margin-top: var(--space-6);
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

  .limits a {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .cross {
    color: var(--color-fail);
    font-size: 10px;
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

  .teaching-close {
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
