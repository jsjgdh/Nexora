<script lang="ts">
  import { ALL_MISSIONS } from "$lib/missions";
  import { LAYERS, stagesInLayer } from "$lib/curriculum";
  import PageHead from "$lib/components/PageHead.svelte";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";

  const firstMission = "/mission/how-programs-run";

  /* Every artifact on this page is real product content, not a mock: the first
     mission's own third question with the product's own answer and explanation,
     and a real mission's own checks with its own feedback. If the curriculum
     changes, the tour changes with it. */
  const specMission = ALL_MISSIONS.find((m) => m.id === firstMission.replace("/mission/", ""));
  const specQuestion = specMission?.questions?.find((q) => q.id === "o3");
  const explanationParts = (specQuestion?.explanation ?? "").split("`");

  const checkMission = ALL_MISSIONS.find((m) => m.id === "text-and-structure");
  const checkSpecimen = checkMission?.checks.slice(0, 3) ?? [];

  const tagParts = (label: string): { tag: boolean; text: string }[] =>
    label
      .split(/(<[a-z][^>]*>)/)
      .filter(Boolean)
      .map((text) => ({ tag: text.startsWith("<"), text }));

  let picked = $state<number | null>(null);
  const answered = $derived(picked !== null);
  const right = $derived(picked !== null && picked === specQuestion?.answer);

  /* The sticky bar is the tour's repeated call: it arrives once the first
     artifact has been seen and leaves when the footer does. Purely positional —
     no scroll-linked animation, and it collapses under reduced motion. */
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
</script>

<PageHead title={SITE_TITLE} description={SITE_DESCRIPTION} path="/" />

<div class="shell">
  <!-- The entry's whole navigation: wordmark, a rule, and the one action. -->
  <a class="chip" href={firstMission}>
    <span class="chip-mark" aria-hidden="true">N</span>
    <span class="chip-name">NEXORA</span>
    <span class="chip-rule" aria-hidden="true"></span>
    <span class="chip-action">Start the first mission</span>
    <span class="chip-action chip-action-short" aria-hidden="true">Start</span>
  </a>

  <div>
    <div class="tour-head">
      <h1 id="hero-title" class="h1">
        <span class="claim-mark"
          >Proof<svg
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
        >, not progress bars.
      </h1>
      <p class="lede">
        NEXORA checks your work the way a test suite does: rules run against what you wrote, and a
        miss comes back with the reason instead of a score. Below is the whole product, in the order
        you would use it. {ALL_MISSIONS.length} missions are written today — free, and none of them
        need an account.
      </p>
    </div>

    <div id="tour-start" aria-hidden="true"></div>

    <!-- 01 · Read the brief. -->
    <section class="block block-brief" aria-labelledby="step-brief">
      <div class="block-head">
        <span class="step num" aria-hidden="true">01</span>
        <h2 id="step-brief" class="block-title">Read the brief.</h2>
        <p class="block-caption">
          Every mission opens with a real task and says roughly how long it should take. This is
          question three of the first mission — answer it here, before you sign up for anything.
        </p>
      </div>

      {#if specQuestion}
        <figure class="pad">
          <figcaption class="pad-top">
            <span>Mission 01 · {specMission?.title ?? "How programs run"}</span>
            <span class="pad-top-right">Question 3 of 4</span>
          </figcaption>
          <div class="pad-body">
            <p class="pad-q">{specQuestion.prompt}</p>
            {#if specQuestion.code}
              <pre class="pad-code"><code>{specQuestion.code}</code></pre>
            {/if}
            <div class="pad-opts">
              {#each specQuestion.options as option, index (index)}
                <label
                  class="opt"
                  data-state={index === picked && answered ? (right ? "answer" : "chosen-wrong") : "open"}
                >
                  <input
                    type="radio"
                    name="pad-question"
                    value={index}
                    bind:group={picked}
                    class="sr-only"
                  />
                  <span class="opt-mark" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                  <span class="opt-text">{option}</span>
                </label>
              {/each}
            </div>
            <div class="verdict" aria-live="polite">
              {#if answered}
                {#if right}
                  <p class="v-head v-pass">Correct</p>
                  <p class="v-body">
                    {#each explanationParts as part, i (i)}
                      {#if i % 2 === 1}<code>{part}</code>{:else}{part}{/if}
                    {/each}
                  </p>
                {:else}
                  <p class="v-head v-pen">Not it.</p>
                  <p class="v-body">
                    Read it the way the machine does — one line at a time, and name the value that
                    exists after line two. Pick again.
                  </p>
                {/if}
              {:else}
                <p class="v-idle">Pick an answer. This is the first thing the mission asks.</p>
              {/if}
            </div>
          </div>
          <figcaption class="pad-foot">
            <span>A real question from the first mission — about 15 minutes, no account.</span>
            <a class="pad-link" href={firstMission}>Start the first mission</a>
          </figcaption>
        </figure>
      {/if}
    </section>

    <!-- 02 · Press Check. -->
    <section class="block block-check" aria-labelledby="step-check">
      <div class="block-head">
        <span class="step num" aria-hidden="true">02</span>
        <h2 id="step-check" class="block-title">Press Check.</h2>
        <p class="block-caption">
          Rules read what you wrote — an element, a pattern, an exit code. Every miss comes back
          with the reason, and each one is logged separately so it can wait in your practice log.
          AI can explain a failure; it never decides whether you passed.
        </p>
      </div>

      {#if checkSpecimen.length > 0}
        <div class="checkspec">
          <p class="checkspec-head">
            Checks from a real mission, with one miss shown — this is the reason you get back.
          </p>
          <ul class="checks">
            {#each checkSpecimen as check, i (check.id)}
              <li class="check" data-state={i === 1 ? "failed" : "passed"}>
                <span class="check-mark num" aria-hidden="true">{i === 1 ? "−" : "+"}</span>
                <span class="check-label">
                  {#each tagParts(check.label) as part, j (j)}
                    {#if part.tag}<code>{part.text}</code>{:else}{part.text}{/if}
                  {/each}
                </span>
                <span class="check-word">{i === 1 ? "needs a change" : "passed"}</span>
                {#if i === 1}
                  <span class="check-feedback">{check.feedback}</span>
                {/if}
              </li>
            {/each}
          </ul>
          <p class="note">
            Hints are part of learning, never a penalty. A check that keeps missing is practice, not
            a verdict on you.
          </p>
        </div>
      {/if}
    </section>

    <!-- 03 · Follow the route. -->
    <section class="block block-route" aria-labelledby="step-route">
      <div class="block-head">
        <span class="step num" aria-hidden="true">03</span>
        <h2 id="step-route" class="block-title">Follow the route.</h2>
        <p class="block-caption">
          Four layers, in one order. You never pick a specialisation first: how software works, then
          one language properly, then how to reason about data with it, and only then a track. The
          diagnostic can start you past what you have already shown.
        </p>
      </div>

      <ol class="path">
        {#each LAYERS as layer, i (layer.id)}
          {@const stages = stagesInLayer(layer.id)}
          {@const authored = ALL_MISSIONS.filter((mission) =>
            stages.some((stage) => stage.id === mission.stageId)
          ).length}
          <li class="path-row">
            <span class="path-num num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <div class="path-main">
              <h3 class="path-title">{layer.heading}</h3>
              <p class="path-claim">{layer.claim}</p>
              <p class="path-stages num">{stages.map((stage) => stage.title).join(", ")}</p>
            </div>
            <span class="path-count num">
              {authored} {authored === 1 ? "mission" : "missions"} written
            </span>
          </li>
        {/each}
      </ol>
      <p class="note">
        The route shows what is written today. Later stages stay visible as the curriculum grows —
        nothing is presented as finished before it exists.
      </p>
    </section>

    <!-- 04 · Know the limits. -->
    <section class="block block-limits" aria-labelledby="step-limits">
      <div class="block-head">
        <span class="step num" aria-hidden="true">04</span>
        <h2 id="step-limits" class="block-title">Know the limits.</h2>
        <p class="block-caption">Two things worth knowing before you start.</p>
      </div>

      <div class="notes">
        <div class="note-col">
          <h3 class="note-title">Free while it grows.</h3>
          <p class="note-body">
            The curriculum, the diagnostic, local progress, and the checks stay free. Your drafts
            live in this browser until you connect an account.
          </p>
        </div>
        <div class="note-col">
          <h3 class="note-title">One honest constraint.</h3>
          <p class="note-body">
            Go missions can be finished offline through their questions. Running Go code needs the
            online runner, and the app says so when it is unavailable.
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
        <a class="footlink" href="/roadmap">Roadmap</a>
        <a class="footlink" href={firstMission}>The first mission</a>
        <a class="footlink" href="/pricing">Pricing</a>
        <a class="footlink" href="/auth">Account</a>
      </div>
      <span class="foot-rule" aria-hidden="true"></span>
      <span class="num">© {new Date().getFullYear()}</span>
    </div>
  </footer>
</div>

<!-- The repeated call: one reassurance line, one button, no shadow. -->
<aside class="ctabar" data-visible={showBar} aria-hidden={!showBar}>
  <p class="ctabar-note">Free while it grows. No account needed.</p>
  <a class="btn btn-sheet" href={firstMission} tabindex={showBar ? 0 : -1}>
    <span class="btn-label-full">Start the first mission</span>
    <span class="btn-label-short" aria-hidden="true">Start</span>
  </a>
</aside>

<style>
  /* Hallmark · genre: atmospheric · macrostructure: Workbench · tone: technical and direct ·
   * anchor hue: brass · theme: locked Night Desk system (DESIGN.md) · nav: N2 floating chip ·
   * footer: Ft2 inline single line · enrichment: none — the artifacts are real product surfaces
   * contrast: token pairs measured in verify.ts; paper pairs measured by hand
   */

  .shell {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: clamp(var(--space-5), 4vw, var(--space-8));
  }

  /* ---------- Type ---------- */

  .h1 {
    font-family: var(--font-display);
    /* The system's display scale at full strength: the claim is the loudest
       thing on the desk, and only the claim and the pad get to be. */
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
  .note {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-faint);
    max-width: 70ch;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding-inline: var(--space-4);
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }
  .btn-sheet {
    background: var(--color-paper);
    color: var(--color-ground);
  }
  .btn-sheet:hover {
    background: var(--color-paper-2);
  }
  .btn:active {
    transform: translateY(1px);
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

  /* ---------- The tour ---------- */

  .tour-head {
    /* Compact head, not a hero band: the claim gets room, then the tour
       starts. Deliberately tighter at the bottom than the old 1.3:1 hero
       ratio — the pad must sit high enough in the fold to be seen with the
       claim, and the tour's own padding carries the rhythm from here. */
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
  /* Uneven padding on purpose — the tour has a rhythm, not a grid. */
  .block-brief {
    padding-top: var(--space-6);
  }
  @media (min-width: 1000px) {
    .block-brief {
      /* The pad is the mechanism, so the first block gives it the wider share
         and the step head only what it needs. */
      grid-template-columns: minmax(0, 0.6fr) minmax(0, 1.4fr);
    }
  }
  .block-check {
    padding-block: var(--space-12);
  }
  .block-route {
    padding-block: var(--space-18) var(--space-14);
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

  /* ---------- The answer pad — the one light surface in the product ---------- */

  .pad {
    margin: 0;
    min-width: 0;
    background: var(--color-paper);
    color: var(--color-paper-ink);
    border: 1px solid var(--color-rule);
    box-shadow: 0 34px 70px -36px rgba(0, 0, 0, 0.85);
  }
  .pad-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-6) var(--space-3) var(--space-10);
    background: var(--color-paper-2);
    border-bottom: 1px solid color-mix(in srgb, var(--color-paper-muted) 28%, var(--color-paper));
    font-family: var(--font-mono);
    font-size: 11.5px;
    letter-spacing: 0.01em;
    color: var(--color-paper-muted);
  }
  .pad-top-right {
    white-space: nowrap;
  }
  .pad-body {
    position: relative;
    padding: var(--space-7) var(--space-6) var(--space-6) var(--space-10);
  }
  /* The margin rule: a red pen line down the left edge, as on ruled paper. */
  .pad-body::before {
    content: "";
    position: absolute;
    left: var(--space-6);
    top: var(--space-4);
    bottom: var(--space-4);
    width: 2px;
    background: color-mix(in srgb, var(--color-pen) 72%, var(--color-paper));
  }
  @media (max-width: 520px) {
    .pad-top,
    .pad-body,
    .pad-foot {
      padding-left: var(--space-8);
    }
    .pad-body::before {
      left: var(--space-5);
    }
  }
  .pad-q {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.45;
    color: var(--color-paper-ink);
  }
  .pad-code {
    margin: var(--space-4) 0 var(--space-5);
    padding: var(--space-3) var(--space-4);
    background: var(--color-paper-2);
    border: 1px solid color-mix(in srgb, var(--color-paper-muted) 22%, var(--color-paper));
    font-family: var(--font-mono);
    font-size: 13.5px;
    line-height: 1.8;
    color: var(--color-paper-ink);
    overflow-x: auto;
    white-space: pre;
  }
  .pad-opts {
    display: grid;
    gap: var(--space-2);
  }
  .opt {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 50px;
    padding: var(--space-2) var(--space-4);
    /* The radio is visually hidden, so this outline is the control's own
       boundary: it is held to 3:1 on paper, not to hairline weight. */
    border: 1px solid color-mix(in srgb, var(--color-paper-muted) 80%, var(--color-paper));
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background-color 120ms ease;
  }
  .opt:hover {
    border-color: var(--color-paper-muted);
    background: color-mix(in srgb, var(--color-paper-2) 65%, var(--color-paper));
  }
  .opt-mark {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-pen);
    width: var(--space-3);
    flex: none;
  }
  .opt-text {
    font-size: 15.5px;
    line-height: 1.4;
    color: var(--color-paper-ink);
  }
  /* Answered states: the right answer inked in, the wrong pick marked in pen.
     A miss never reveals the answer — that is the product's own rule. */
  .opt[data-state="answer"] {
    border-color: var(--color-pass);
    background: color-mix(in srgb, var(--color-pass) 9%, var(--color-paper));
  }
  .opt[data-state="chosen-wrong"] {
    border-color: var(--color-pen);
  }
  .opt[data-state="chosen-wrong"] .opt-mark {
    font-weight: 700;
  }
  /* The label carries the ring, and the ring is pen because brass on paper
     measures 1.95:1. */
  .opt:has(input:focus-visible) {
    outline: 1px solid var(--color-pen);
    outline-offset: 2px;
  }

  .verdict {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid color-mix(in srgb, var(--color-paper-muted) 28%, var(--color-paper));
  }
  .verdict > p {
    animation: verdict-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes verdict-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .v-head {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .v-pass {
    color: var(--color-pass);
  }
  .v-pen {
    color: var(--color-pen);
  }
  .v-body {
    margin-top: var(--space-1);
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-paper-muted);
  }
  .v-body code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--color-paper-ink);
  }
  .v-idle {
    font-size: 13px;
    color: var(--color-paper-muted);
  }

  .pad-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2) var(--space-6);
    padding: var(--space-3) var(--space-6) var(--space-4) var(--space-10);
    border-top: 1px solid color-mix(in srgb, var(--color-paper-muted) 28%, var(--color-paper));
    font-size: 12.5px;
    color: var(--color-paper-muted);
  }
  .pad-link {
    font-weight: 600;
    color: var(--color-pen);
    white-space: nowrap;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .pad-link:hover {
    color: var(--color-paper-ink);
  }

  /* ---------- A real check list, one miss shown ---------- */

  .checkspec {
    min-width: 0;
  }
  .checkspec-head {
    font-size: 12.5px;
    color: var(--color-faint);
    margin-bottom: var(--space-4);
  }
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }
  .check {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) auto;
    gap: var(--space-1) var(--space-3);
    align-items: baseline;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-rule);
  }
  .check-mark {
    font-size: 13px;
    line-height: 1.5;
  }
  .check[data-state="passed"] .check-mark {
    color: var(--color-added);
  }
  .check[data-state="failed"] .check-mark {
    color: var(--color-removed);
  }
  .check-label {
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-ink);
  }
  .check-label code {
    font-family: var(--font-mono);
    font-size: 0.88em;
    color: var(--color-accent-bright);
  }
  .check-word {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-faint);
    white-space: nowrap;
  }
  .check[data-state="failed"] .check-word {
    color: var(--color-removed);
  }
  .check-feedback {
    grid-column: 2 / -1;
    margin-top: var(--space-2);
    padding-left: var(--space-3);
    border-left: 1px solid var(--color-removed);
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }
  .checkspec .note,
  .block-route .note {
    margin-top: var(--space-4);
  }

  /* ---------- The route ---------- */

  .path {
    min-width: 0;
    border-top: 1px solid var(--color-rule);
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .path-row {
    display: grid;
    grid-template-columns: 2.4rem minmax(0, 1fr);
    gap: var(--space-1) var(--space-4);
    padding: var(--space-5) 0;
    border-bottom: 1px solid var(--color-rule);
  }
  @media (min-width: 760px) {
    .path-row {
      grid-template-columns: 2.4rem minmax(0, 1fr) auto;
      align-items: start;
      gap: var(--space-4);
    }
  }
  .path-num {
    font-size: 12px;
    color: var(--color-accent);
    padding-top: var(--space-1);
  }
  .path-title {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.012em;
    color: var(--color-ink);
  }
  .path-claim {
    margin-top: var(--space-1);
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
    max-width: 56ch;
  }
  .path-stages {
    margin-top: var(--space-2);
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }
  .path-count {
    font-size: 11.5px;
    color: var(--color-faint);
    white-space: nowrap;
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
</style>
