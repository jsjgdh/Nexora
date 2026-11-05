<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import LaunchList from "$lib/components/LaunchList.svelte";
  import DeviceCode from "$lib/components/DeviceCode.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { STEPS, FREE_PHASE_COUNT, numberWords } from "$lib/content/site";
  import { pageTitle } from "$lib/seo";

  /* The desktop IDE, honestly.
   *
   * A downloadable build is advertised only when one exists. The server reads
   * PUBLIC_IDE_DOWNLOAD_URL once and this page renders the answer, so the
   * header, the footer and this page cannot disagree about whether a build is
   * published.
   *
   * The right-hand card is the whole decision: the state, the action, and the
   * launch list when there is no action yet. The rest of the page is what
   * happens after install, and what a reader can do today without it. */

  let { data }: PageProps = $props();
  const release = $derived(data.release);
  const available = $derived(release.available);

  const freeWords = numberWords(FREE_PHASE_COUNT) ?? String(FREE_PHASE_COUNT);
  const freeWordsCapital = freeWords.charAt(0).toUpperCase() + freeWords.slice(1);
</script>

<PageHead
  title={pageTitle("Download")}
  description={`Download the NEXORA IDE, the only way to learn. The ${freeWords} free phases ship inside it and work offline with no account.`}
  path="/download"
/>

<section class="download-hero">
  <div class="container-page download-grid">
    <div class="download-copy">
      <h1 class="display download-title">Install the editor.<br />The course is already in it.</h1>
      <p class="download-lede">
        A desktop editor with {freeWords} phases of the course inside it. Install it, open it, and
        the first judged verdict is minutes away: no account, no browser tab, no second surface to
        choose between.
      </p>
      <ul class="download-facts num">
        <li>{freeWordsCapital} phases bundled</li>
        <li>Offline, no account</li>
        <li>Assessment free forever</li>
      </ul>
    </div>

    <aside class="install-card card" aria-labelledby="install-title">
      <div class="install-head">
        <div>
          <p class="stamp install-label">Build status</p>
          <h2 id="install-title" class="install-title">{available ? "Published" : "Not published yet"}</h2>
        </div>
        <span class="tag" class:tag-pass={available}>{available ? "Available" : "Waiting"}</span>
      </div>

      <p class="install-note">{release.note}</p>

      {#if available}
        <div class="install-action">
          <ActionLink href={release.downloadUrl} external size="md" island>{release.label}</ActionLink>
        </div>
        <p class="install-fine">
          The download is free and needs no account. Pick the build for your operating system on
          the download page.
        </p>
      {:else}
        <div class="install-list">
          <p class="stamp install-label">Be told when it ships</p>
          <LaunchList />
        </div>
        <div class="install-links">
          <a href="/courses">All courses <span aria-hidden="true">→</span></a>
          <a href="/verify">Verify a receipt <span aria-hidden="true">→</span></a>
        </div>
      {/if}

      <p class="install-switch num">
        One switch decides this: <span>PUBLIC_IDE_DOWNLOAD_URL</span>.
      </p>
    </aside>
  </div>
</section>

<section class="section-pad steps-section">
  <div class="container-page">
    <SectionHead
      title="Three steps, and the first one is the whole thing."
      caption="The IDE never asks for your password. It shows a short code, opens this site, and signs itself in once you approve the code here."
      wide
    />

    <ol class="steps">
      {#each STEPS as step (step.n)}
        <li>
          <span class="step-n num">{step.n}</span>
          <h3 class="step-title">{step.title}</h3>
          <p class="step-caption">{step.caption}</p>

          {#if "points" in step}
            <ul class="step-points">
              {#each step.points as point (point)}
                <li>{point}</li>
              {/each}
            </ul>
          {:else}
            <ol class="step-points">
              {#each step.steps as line (line)}
                <li>{line}</li>
              {/each}
            </ol>
          {/if}

          {#if step.n === "01"}
            <div class="step-action">
              <ActionLink href="/download" variant="ghost" island>{release.label}</ActionLink>
            </div>
          {:else if "link" in step}
            <div class="step-action">
              <ActionLink href={step.link.href} variant="ghost">{step.link.label}</ActionLink>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
</section>

<section class="free-band">
  <div class="container-page free-grid">
    <div>
      <h2 class="display free-title">The download, the first loop, every check.</h2>
    </div>
    <ul class="free-list">
      <li>
        <span class="num free-n">01</span>
        <div>
          <h3>The download is free</h3>
          <p>No account and no payment to get the app.</p>
        </div>
      </li>
      <li>
        <span class="num free-n">02</span>
        <div>
          <h3>The first loop is bundled</h3>
          <p>It works offline, with no account, straight after install.</p>
        </div>
      </li>
      <li>
        <span class="num free-n">03</span>
        <div>
          <h3>Later phases are fetched</h3>
          <p>They load per entitlement and are not written to disk. Assessment stays free.</p>
        </div>
      </li>
    </ul>
  </div>
</section>

<section class="section-pad signin-section">
  <div class="container-page signin-grid">
    <div>
      <SectionHead
        title="How the sign-in works."
        caption="The editor has no password field, because a password field in a desktop app is a place for a learner to get stuck. It shows a short code, opens this site, and signs itself in once you approve the code here."
      />
      <div class="signin-action">
        <ActionLink href="/auth/ide" variant="ghost" island>Approve a code</ActionLink>
      </div>
    </div>
    <div class="signin-art">
      <DeviceCode />
    </div>
  </div>
</section>

<style>
  .download-hero {
    padding-block: clamp(3rem, 6vw, 5.5rem) clamp(2.5rem, 4vw, 4rem);
    border-bottom: 1px solid var(--color-rule);
    background:
      radial-gradient(50% 70% at 90% 15%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 65%);
  }

  .download-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 1080px) {
    .download-grid {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: clamp(2.5rem, 5vw, 4.5rem);
    }
  }

  .download-title {
    margin-top: var(--space-5);
    font-size: var(--text-page);
    line-height: 0.95;
    letter-spacing: -0.055em;
  }

  .download-lede {
    margin-top: var(--space-5);
    max-width: 50ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.6;
    color: var(--color-muted);
  }

  .download-facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
    list-style: none;
    font-size: 10px;
    color: var(--color-faint);
  }

  .download-facts li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .download-facts li::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-accent);
  }

  .install-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
  }

  @media (min-width: 640px) {
    .install-card {
      padding: var(--space-8);
    }
  }

  .install-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .install-label {
    color: var(--color-faint);
  }

  .install-title {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-ink);
  }

  .install-note {
    max-width: 46ch;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .install-list {
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
  }

  .install-links {
    display: grid;
    gap: var(--space-1);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-rule);
  }

  .install-links a {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    color: var(--color-ink);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
  }

  .install-links a:hover {
    color: var(--color-accent);
  }

  .install-action {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-rule);
  }

  .install-fine {
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--color-faint);
  }

  .install-switch {
    margin-top: auto;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-rule);
    font-size: 9px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  .install-switch span {
    color: var(--color-ink);
  }

  .steps-section {
    background: var(--color-panel);
  }

  .steps {
    list-style: none;
    margin: var(--space-8) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  @media (min-width: 900px) {
    .steps {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .steps li {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--color-rule);
    border-radius: var(--radius);
    background: var(--color-ground);
  }

  .step-n {
    font-size: 10px;
    color: var(--color-accent);
  }

  .step-title {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .step-caption {
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .step-points {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  .step-points li {
    display: grid;
    grid-template-columns: 0.7rem minmax(0, 1fr);
    gap: var(--space-2);
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-muted);
  }

  .step-points li::before {
    content: "·";
    color: var(--color-accent);
    font-family: var(--font-mono);
  }

  .step-action {
    margin-top: auto;
    padding-top: var(--space-3);
  }

  .free-band {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .free-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
  }

  @media (min-width: 980px) {
    .free-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .free-title {
    margin-top: var(--space-4);
    max-width: 15ch;
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  }

  .free-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .free-list li {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule-strong);
  }

  .free-n {
    font-size: 9px;
    color: var(--color-faint);
  }

  .free-list h3 {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-ink);
  }

  .free-list p {
    margin-top: var(--space-1);
    max-width: 52ch;
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .signin-section {
    background: var(--color-panel);
  }

  .signin-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: center;
  }

  @media (min-width: 980px) {
    .signin-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .signin-action {
    margin-top: var(--space-6);
  }

  .signin-art {
    min-width: 0;
  }
</style>
