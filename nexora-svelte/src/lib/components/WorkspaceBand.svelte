<script lang="ts">
  import ActionLink from "./ActionLink.svelte";
  import { LOOP_STEPS, RUN_SCRIPT } from "$lib/content/site";
  import { PHASE_DETAIL } from "$lib/content/phase-detail.generated";

  /* The dark band is the product's own room, not a second hero. The steps,
     the phase goal and the failure line come from the shipped course; the
     window is labelled as an illustration so nobody mistakes it for a
     screenshot of a build that is not installed yet. */

  const step = LOOP_STEPS[3];
  const failure = RUN_SCRIPT.find((line) => line.kind === "fail")?.text ?? "";
  const note = RUN_SCRIPT.find((line) => line.kind === "note")?.text.trim() ?? "";
  const goal = PHASE_DETAIL["task-manager"]?.debug?.goal ?? "";
</script>

<section id="how" class="dark-band" aria-labelledby="dark-title">
  <div class="container-page dark-grid">
    <div class="dark-copy">
      <h2 id="dark-title" class="display dark-title">More than a course.<br />A way of working.</h2>
      <p class="dark-lede">
        The lesson, the files, the terminal and the check share one window. There is no separate
        sandbox and no context switch between learning and doing.
      </p>
      <ActionLink href="/courses/task-manager" variant="inverse" island>Open Task Manager</ActionLink>
    </div>

    <figure class="loop-figure">
      <div class="loop-window">
        <div class="loop-bar">
          <span class="loop-brand"><span class="loop-mark" aria-hidden="true">N</span> task-manager</span>
          <span class="num loop-label">PHASE 09 · DEBUG</span>
        </div>
        <div class="loop-body">
          <ol class="loop-steps">
            {#each LOOP_STEPS as item, i (item.n)}
              <li data-active={item.n === step.n ? "true" : undefined}>
                <span class="loop-n num">{item.n}</span>
                <span>{item.name}</span>
                {#if i < 3}
                  <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="m2 5.2 2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {/if}
              </li>
            {/each}
          </ol>

          <div class="loop-main">
            <p class="num loop-kicker">INVESTIGATE</p>
            <h3 class="loop-title">Find the cause before the fix.</h3>
            <p class="loop-step-body">{step.body}</p>
            <p class="loop-goal">{goal}</p>

            <div class="loop-failure">
              <span class="failure-mark num" aria-hidden="true">×</span>
              <div>
                <p class="failure-title">{failure}</p>
                <p class="failure-note num">{note}</p>
              </div>
            </div>

            <div class="loop-foot">
              <span class="loop-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i class="on"></i></span>
              <span class="num">5 of 5 steps</span>
              <a href="/courses/task-manager" class="loop-next">Open Task Manager <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </div>
      </div>
      <figcaption>Illustration · the steps and the failure are read from the shipped phase.</figcaption>
    </figure>
  </div>
</section>

<style>
  .dark-band {
    background:
      radial-gradient(80% 120% at 85% 0%, color-mix(in srgb, var(--color-screen-glow) 45%, transparent), transparent 60%),
      var(--color-screen);
    color: var(--color-screen-ink);
    padding-block: clamp(4.5rem, 8vw, 7.5rem);
    overflow: hidden;
  }

  .dark-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(2.5rem, 5vw, 5rem);
    align-items: center;
  }

  @media (min-width: 1024px) {
    .dark-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    }
  }

  .dark-copy {
    min-width: 0;
  }

  .dark-title {
    margin-top: var(--space-4);
    font-size: var(--text-band);
    color: var(--color-screen-ink);
  }

  .dark-lede {
    margin-top: var(--space-4);
    max-width: 42ch;
    font-size: 15px;
    line-height: 1.65;
    color: var(--color-screen-muted);
  }

  .dark-copy :global(a) {
    margin-top: var(--space-7);
  }

  .loop-figure {
    margin: 0;
    min-width: 0;
  }

  .loop-window {
    border: 1px solid var(--color-screen-rule);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--color-screen-2) 70%, var(--color-screen));
    box-shadow: var(--shadow-window);
    overflow: hidden;
  }

  .loop-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--color-screen-rule);
    background: color-mix(in srgb, var(--color-screen) 70%, var(--color-screen-2));
    font-size: 10px;
    color: var(--color-screen-muted);
  }

  .loop-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--color-screen-ink);
  }

  .loop-mark {
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-size: 9px;
    font-weight: 700;
  }

  .loop-label {
    font-size: 8px;
    letter-spacing: 0.08em;
  }

  .loop-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 640px) {
    .loop-body {
      grid-template-columns: 9.5rem minmax(0, 1fr);
    }
  }

  .loop-steps {
    list-style: none;
    margin: 0;
    padding: 0.7rem 0.55rem;
    border-bottom: 1px solid var(--color-screen-rule);
    display: grid;
    gap: 2px;
    align-content: start;
  }

  @media (min-width: 640px) {
    .loop-steps {
      border-bottom: 0;
      border-right: 1px solid var(--color-screen-rule);
    }
  }

  .loop-steps li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 30px;
    padding: 0.2rem 0.45rem;
    border-radius: var(--radius-chip);
    font-size: 9.5px;
    color: var(--color-screen-muted);
  }

  .loop-steps li svg {
    margin-left: auto;
    color: var(--color-pass-screen);
  }

  .loop-steps li[data-active="true"] {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }

  .loop-steps li[data-active="true"] .loop-n {
    color: var(--color-on-accent);
  }

  .loop-n {
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .loop-main {
    padding: 1rem;
    min-width: 0;
  }

  .loop-kicker {
    font-size: 8px;
    letter-spacing: 0.12em;
    color: var(--color-accent-bright);
  }

  .loop-title {
    margin-top: 0.3rem;
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--color-screen-ink);
  }

  .loop-step-body {
    margin-top: 0.45rem;
    font-size: 10.5px;
    line-height: 1.55;
    color: var(--color-screen-muted);
  }

  .loop-goal {
    margin-top: 0.5rem;
    padding-left: 0.55rem;
    border-left: 1px solid var(--color-screen-rule);
    font-size: 9.5px;
    line-height: 1.55;
    color: color-mix(in srgb, var(--color-screen-muted) 80%, transparent);
  }

  .loop-failure {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding: 0.55rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--color-fail) 35%, var(--color-screen-rule));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-fail) 10%, transparent);
  }

  .failure-mark {
    color: var(--color-fail-screen);
  }

  .failure-title {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-fail-screen);
  }

  .failure-note {
    margin-top: 0.15rem;
    font-size: 8.5px;
    color: var(--color-screen-muted);
  }

  .loop-foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.9rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--color-screen-rule);
    font-size: 8px;
    color: var(--color-screen-muted);
  }

  .loop-dots {
    display: inline-flex;
    gap: 3px;
  }

  .loop-dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-screen-rule);
  }

  .loop-dots i.on {
    background: var(--color-accent-bright);
  }

  .loop-next {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin-left: auto;
    color: var(--color-screen-ink);
    font-size: 9px;
    font-weight: 500;
    text-decoration: none;
  }

  .loop-next:hover {
    color: var(--color-accent-bright);
  }

  figcaption {
    margin-top: var(--space-3);
    font-family: var(--font-mono);
    font-size: 8.5px;
    color: var(--color-screen-muted);
  }
</style>
