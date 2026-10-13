<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";

  /* The front door, after the pivot: there is one way to learn, and it is the
     desktop IDE. This page sells nothing in the browser — no missions, no
     workspace, no "start in the browser" fallback. What it does, in order:
     the download, the base course it carries, and the three steps that get a
     learner from an installer to judged work (download → browser sign-in →
     tier unlock). Every number it states is a fact about the artefact, not a
     claim about a curriculum that lives elsewhere. */

  const downloadHref = "/download";
  const pricingHref = "/pricing";
  const authHref = "/auth";
  const verifyHref = "/verify";

  /* The sticky bar repeats the one action. It arrives once the hero has been
     seen and leaves when the footer does. Purely positional — no scroll-linked
     animation, and it collapses under reduced motion. */
  let pastFirst = $state(false);
  let atFooter = $state(false);
  const showBar = $derived(pastFirst && !atFooter);

  $effect(() => {
    const start = document.getElementById("tour-start");
    const foot = document.getElementById("foot-sentinel");
    if (!start || !foot || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === start) pastFirst = !entry.isIntersecting;
          if (entry.target === foot) atFooter = entry.isIntersecting;
        }
      },
      { threshold: 0 }
    );
    io.observe(start);
    io.observe(foot);
    return () => io.disconnect();
  });

  /* Scroll reveals: one observer, heavy fade-up, transform and opacity only —
     never layout properties. Driven by component state (not classList) so the
     compiler sees the class it styles; without JavaScript everything renders
     settled, so nothing is hidden by a script that never ran. */
  let revealed = $state(new Set<number>());
  $effect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const i = Number((entry.target as HTMLElement).dataset.reveal);
            revealed = new Set(revealed).add(i);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
</script>

<PageHead title={SITE_TITLE} description={SITE_DESCRIPTION} path="/" />

<div class="shell">
  <!-- The entry's whole navigation: wordmark, a rule, and the one action. -->
  <a class="chip" href={downloadHref}>
    <span class="chip-mark" aria-hidden="true">N</span>
    <span class="chip-name">NEXORA</span>
    <span class="chip-rule" aria-hidden="true"></span>
    <span class="chip-action">Get the IDE</span>
    <span class="chip-action chip-action-short" aria-hidden="true">Get it</span>
  </a>

  <div>
    <div class="tour-head">
      <p class="eyebrow">The IDE that proves what you learned</p>
      <h1 id="hero-title" class="h1">
        <span class="claim-mark"
          >Download the IDE<svg
            class="pen-mark"
            viewBox="0 0 120 62"
            preserveAspectRatio="none"
            aria-hidden="true"
            ><path
              class="pen-circle"
              pathLength="100"
              stroke-dasharray="100"
              vector-effect="non-scaling-stroke"
              fill="none"
              stroke="var(--color-pen)"
              stroke-width="2.5"
              stroke-linecap="round"
              d="M61 4 C 90 2, 117 11, 118 31 C 119 51, 94 60, 61 60 C 28 60, 3 51, 2 31 C 1 11, 32 2, 61 4 Z"
            /></svg
          ></span
        >. Base course included.
      </h1>
      <p class="lede">
        There is one way to learn NEXORA, and it runs on your machine. The
        download carries the base course with it — offline, no account, judged
        from the first run. Sign in when you want more: the IDE opens this site,
        you log in here the way you log in anywhere, and your tier decides which
        courses appear inside the IDE.
      </p>
      <div class="hero-cta">
        <a class="btn btn-sheet" href={downloadHref}>
          <span class="btn-label-full">Download the NEXORA IDE</span>
          <span class="btn-label-short" aria-hidden="true">Download</span>
          <span class="btn-island" aria-hidden="true">↗</span>
        </a>
        <a class="btn btn-ghost" href={pricingHref}>See pricing</a>
      </div>
      <p class="hero-note">Free to download. The base course works with no account.</p>
    </div>

    <div id="tour-start" aria-hidden="true"></div>

    <!-- 01 · Download. -->
    <section class="block block-steps reveal" data-reveal="1" class:revealed={revealed.has(1)} aria-labelledby="step-download">
      <div class="block-head">
        <span class="step num" aria-hidden="true">01</span>
        <h2 id="step-download" class="block-title">Download the IDE.</h2>
        <p class="block-caption">
          A desktop editor with the course inside it — not a tab in someone
          else's product. The base course ships in the installer and runs
          offline, so the first judged verdict is minutes away, not an account
          away.
        </p>
      </div>

      <div class="bezel">
        <div class="bezel-core">
          <p class="bezel-top">inside the download</p>
          <ul class="bezel-list">
            <li><span class="bezel-mark" aria-hidden="true">+</span>Base course, bundled — works offline, no account</li>
            <li><span class="bezel-mark" aria-hidden="true">+</span>Real local workspace, your files, your tests</li>
            <li><span class="bezel-mark" aria-hidden="true">+</span>Deterministic checks — a miss comes back with the reason, never a score</li>
          </ul>
          <a class="pad-link" href={downloadHref}>Get the IDE</a>
        </div>
      </div>
    </section>

    <!-- 02 · Sign in through the browser. -->
    <section class="block block-steps reveal" data-reveal="2" class:revealed={revealed.has(2)} aria-labelledby="step-signin">
      <div class="block-head">
        <span class="step num" aria-hidden="true">02</span>
        <h2 id="step-signin" class="block-title">Sign in, GitHub-style.</h2>
        <p class="block-caption">
          The IDE never asks for your password. It shows a short code and opens
          this site — you log in here, approve the code, and go back. The
          password is typed in exactly one place, and it is this one.
        </p>
      </div>

      <div class="bezel">
        <div class="bezel-core">
          <p class="bezel-top">how it goes</p>
          <ol class="bezel-steps">
            <li><span class="num">1</span>The IDE shows a code like KQ7M-XR42 and opens your browser.</li>
            <li><span class="num">2</span>You sign in on this site and approve that code.</li>
            <li><span class="num">3</span>The IDE signs in by itself. Nothing to paste, nowhere to mistype.</li>
          </ol>
          <a class="pad-link" href={authHref}>Sign in on the web</a>
        </div>
      </div>
    </section>

    <!-- 03 · Your tier decides the courses. -->
    <section class="block block-steps reveal" data-reveal="3" class:revealed={revealed.has(3)} aria-labelledby="step-tier">
      <div class="block-head">
        <span class="step num" aria-hidden="true">03</span>
        <h2 id="step-tier" class="block-title">Your tier opens the courses.</h2>
        <p class="block-caption">
          The base course is free forever. A subscription unlocks the rest —
          and unlocking means the phases appear inside the IDE you already have,
          per your tier. Nothing to reinstall, no second download.
        </p>
      </div>

      <div class="bezel">
        <div class="bezel-core">
          <p class="bezel-top">what each tier sees</p>
          <ul class="bezel-list">
            <li><span class="bezel-mark" aria-hidden="true">+</span>Free — the base course, judged end to end</li>
            <li><span class="bezel-mark" aria-hidden="true">+</span>Pro — every further phase, fetched per entitlement</li>
            <li><span class="bezel-mark" aria-hidden="true">+</span>Assessment stays free — a verdict you have to pay for is not one you can trust</li>
          </ul>
          <a class="pad-link" href={pricingHref}>See pricing</a>
        </div>
      </div>
    </section>

    <!-- Proof, not progress bars. -->
    <section class="block block-limits reveal" data-reveal="4" class:revealed={revealed.has(4)} aria-labelledby="step-proof">
      <div class="block-head">
        <span class="step num" aria-hidden="true">04</span>
        <h2 id="step-proof" class="block-title">Proof, not progress bars.</h2>
        <p class="block-caption">
          Checks run against what you wrote, the way a test suite does. AI can
          explain a failure; it never decides whether you passed. Finished work
          can be re-judged by the platform and verified by a stranger at
          <a class="pad-link" href={verifyHref}>/verify</a>.
        </p>
      </div>

      <div class="notes">
        <div class="note-col">
          <h3 class="note-title">Free while it grows.</h3>
          <p class="note-body">
            The base course, the checks, and the verdicts stay free. Your work
            lives in your workspace until you connect an account.
          </p>
        </div>
        <div class="note-col">
          <h3 class="note-title">One honest constraint.</h3>
          <p class="note-body">
            Learning happens in the IDE — this site teaches nothing itself. It
            is the front door: the download, your account, your tier, and the
            proof.
          </p>
        </div>
      </div>
    </section>
  </div>

  <footer class="foot">
    <div id="foot-sentinel" class="foot-line" aria-hidden="true"></div>
    <div class="foot-line">
      <span class="foot-mark">NEXORA</span>
      <span class="foot-rule" aria-hidden="true"></span>
      <div class="foot-links">
        <a class="footlink" href="/download">Get the IDE</a>
        <a class="footlink" href="/pricing">Pricing</a>
        <a class="footlink" href="/verify">Verify</a>
        <a class="footlink" href="/auth">Account</a>
      </div>
      <span class="foot-rule" aria-hidden="true"></span>
      <span class="num">© {new Date().getFullYear()}</span>
    </div>
  </footer>
</div>

<!-- The repeated call: one reassurance line, one button, no shadow. -->
<aside class="ctabar" data-visible={showBar} aria-hidden={!showBar}>
  <p class="ctabar-note">Free to download. Base course included.</p>
  <a class="btn btn-sheet" href={downloadHref} tabindex={showBar ? 0 : -1}>
    <span class="btn-label-full">Download the NEXORA IDE</span>
    <span class="btn-label-short" aria-hidden="true">Download</span>
    <span class="btn-island" aria-hidden="true">↗</span>
  </a>
</aside>

<style>
  /* Hallmark · genre: atmospheric · macrostructure: Workbench · tone: technical and direct ·
   * anchor hue: brass · theme: locked Night Desk system (DESIGN.md) · nav: N2 floating chip ·
   * footer: Ft2 inline single line · enrichment: none — the page sells the artefact, not a mock
   * contrast: token pairs measured in verify.ts; paper pairs measured by hand
   */

  .shell {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: clamp(var(--space-5), 4vw, var(--space-8));
  }

  /* ---------- Type ---------- */

  .eyebrow {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-accent);
    border: 1px solid var(--color-rule-strong);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    margin-bottom: var(--space-5);
  }
  .h1 {
    font-family: var(--font-display);
    /* The system's display scale at full strength: the claim is the loudest
       thing on the desk, and only the claim gets to be. */
    font-size: clamp(2.5rem, 6.4vw, 4.3rem);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.035em;
    color: var(--color-ink);
    text-wrap: balance;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  /* The examiner's mark: the app's own pen circle, drawn once around the word
     it is making a claim about. */
  .claim-mark {
    position: relative;
    display: inline-block;
  }
  .pen-mark {
    position: absolute;
    left: -0.085em;
    top: -0.14em;
    width: calc(100% + 0.17em);
    height: calc(100% + 0.3em);
    overflow: visible;
    pointer-events: none;
  }
  .pen-circle {
    animation-delay: 420ms;
  }
  .lede {
    margin-top: var(--space-5);
    font-size: 17px;
    line-height: 1.6;
    color: var(--color-muted);
    max-width: 52ch;
  }
  .hero-cta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }
  .hero-note {
    margin-top: var(--space-3);
    font-size: 12.5px;
    color: var(--color-faint);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding-inline: var(--space-4);
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;
    border-radius: 999px;
    transition:
      background-color 700ms cubic-bezier(0.32, 0.72, 0, 1),
      border-color 700ms cubic-bezier(0.32, 0.72, 0, 1),
      color 700ms cubic-bezier(0.32, 0.72, 0, 1),
      transform 700ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .btn-sheet {
    background: var(--color-paper);
    color: var(--color-ground);
  }
  .btn-sheet:hover {
    background: var(--color-paper-2);
  }
  .btn:active {
    transform: scale(0.98);
  }
  .btn-ghost {
    border-color: var(--color-rule-strong);
    color: var(--color-ink);
  }
  .btn-ghost:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  /* The island: the arrow never sits naked beside the label. */
  .btn-island {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-ground) 8%, transparent);
    font-size: 14px;
    line-height: 1;
    transition: transform 700ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .btn:hover .btn-island {
    transform: translate(1px, -1px) scale(1.05);
  }

  /* ---------- N2 · Floating chip ---------- */

  .chip {
    display: none;
    position: fixed;
    top: var(--space-3);
    right: clamp(var(--space-5), 4vw, var(--space-8));
    z-index: 40;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-rule-strong);
    border-radius: 999px;
    white-space: nowrap;
  }
  .chip:active {
    transform: translateY(1px);
  }
  .chip-mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    background: var(--color-accent);
    color: var(--color-ground);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
  }
  .chip-name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }
  .chip-rule {
    width: 1px;
    height: 14px;
    background: var(--color-rule-strong);
  }
  .chip-action {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-accent);
  }
  /* Below ~520px the full label would clip against the viewport edge, so the
     same action keeps a shorter form of its own name. */
  .chip-action-short,
  .btn-label-short {
    display: none;
  }
  @media (max-width: 640px) {
    .chip-name,
    .chip-rule {
      display: none;
    }
  }
  @media (max-width: 520px) {
    .chip-action {
      display: none;
    }
    .chip-action-short {
      display: inline;
      font-size: 13px;
      font-weight: 600;
      color: var(--color-accent);
    }
    .btn-label-full {
      display: none;
    }
    .btn-label-short {
      display: inline;
    }
  }

  /* ---------- Scroll reveals (transform + opacity only) ---------- */

  .reveal {
    opacity: 0;
    transform: translateY(4rem);
    filter: blur(0.35rem);
    transition:
      opacity 800ms cubic-bezier(0.32, 0.72, 0, 1),
      transform 800ms cubic-bezier(0.32, 0.72, 0, 1),
      filter 800ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .reveal.revealed {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }

  /* ---------- The tour ---------- */

  .tour-head {
    /* Compact head, not a hero band: the claim gets room, then the steps
       start. The download button sits in the fold with the claim. */
    padding-block: var(--space-14) var(--space-18);
  }
  @media (max-width: 640px) {
    .tour-head {
      padding-block: var(--space-18) var(--space-24);
    }
  }
  #tour-start {
    height: 1px;
  }
  .block {
    display: grid;
    gap: var(--space-6);
    align-items: start;
    padding-block: var(--space-9);
  }
  @media (min-width: 1000px) {
    .block {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: var(--space-12);
    }
  }
  /* Uneven padding on purpose — the page has a rhythm, not a grid. */
  .block-steps {
    padding-block: var(--space-12);
  }
  .block-steps:nth-of-type(odd) {
    direction: rtl;
  }
  .block-steps:nth-of-type(odd) > * {
    direction: ltr;
  }
  .block-limits {
    padding-block: var(--space-10) var(--space-12);
  }
  .block-head {
    min-width: 0;
  }
  .step {
    display: block;
    font-size: 13px;
    letter-spacing: 0.02em;
    color: var(--color-accent);
  }
  .block-title {
    margin-top: var(--space-1);
    font-family: var(--font-display);
    font-size: clamp(1.35rem, 2.4vw, 1.6rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .block-caption {
    margin-top: var(--space-2);
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
    max-width: 46ch;
  }

  /* ---------- Double-bezel cards: a machined tray, then the core ---------- */

  .bezel {
    min-width: 0;
    background: color-mix(in srgb, var(--color-panel) 60%, transparent);
    border: 1px solid var(--color-rule);
    border-radius: 2rem;
    padding: var(--space-2);
  }
  .bezel-core {
    background: var(--color-panel);
    border: 1px solid var(--color-rule-strong);
    border-radius: calc(2rem - var(--space-2));
    box-shadow: inset 0 1px 1px color-mix(in srgb, var(--color-ink) 12%, transparent);
    padding: var(--space-6) var(--space-6) var(--space-5) var(--space-6);
  }
  .bezel-top {
    font-family: var(--font-mono);
    font-size: 11.5px;
    letter-spacing: 0.01em;
    color: var(--color-faint);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-rule);
    margin-bottom: var(--space-4);
  }
  .bezel-list,
  .bezel-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-3);
  }
  .bezel-list li,
  .bezel-steps li {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-ink);
  }
  .bezel-mark {
    font-size: 13px;
    color: var(--color-added);
  }
  .bezel-steps .num {
    font-size: 12px;
    color: var(--color-accent);
  }
  .pad-link {
    display: inline-block;
    margin-top: var(--space-4);
    font-weight: 600;
    font-size: 13px;
    color: var(--color-accent);
    white-space: nowrap;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .pad-link:hover {
    color: var(--color-ink);
  }

  /* ---------- The limits ---------- */

  .notes {
    display: grid;
    gap: var(--space-7);
  }
  @media (min-width: 760px) {
    .notes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-10);
    }
  }
  .note-col {
    border-top: 1px solid var(--color-rule-strong);
    padding-top: var(--space-4);
  }
  .note-title {
    font-size: 15.5px;
    font-weight: 600;
    color: var(--color-ink);
  }
  .note-body {
    margin-top: var(--space-2);
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
    max-width: 56ch;
  }

  /* ---------- Ft2 · Inline single line ---------- */

  .foot {
    border-top: 1px solid var(--color-rule);
    padding-block: var(--space-6) var(--space-28);
  }
  #foot-sentinel {
    height: 1px;
    margin: 0;
    padding: 0;
  }
  .foot-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-5);
    font-size: 12px;
    color: var(--color-faint);
  }
  .foot-mark {
    font-weight: 600;
    color: var(--color-ink);
    letter-spacing: -0.01em;
  }
  .foot-rule {
    width: 1px;
    height: 12px;
    background: var(--color-rule-strong);
  }
  .foot-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
  }
  .footlink {
    color: var(--color-faint);
    white-space: nowrap;
    transition: color 150ms ease;
  }
  .footlink:hover {
    color: var(--color-accent);
  }

  /* ---------- The repeated call ---------- */

  .ctabar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-6);
    padding: var(--space-3) clamp(var(--space-5), 4vw, var(--space-8));
    background: var(--color-panel);
    border-top: 1px solid var(--color-rule-strong);
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ctabar[data-visible="true"] {
    opacity: 1;
    pointer-events: auto;
  }
  .ctabar-note {
    font-size: 12.5px;
    color: var(--color-faint);
  }
  @media (max-width: 480px) {
    .ctabar {
      justify-content: flex-end;
    }
    .ctabar-note {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal {
      opacity: 1;
      transform: none;
      filter: none;
      transition: none;
    }
  }
</style>
