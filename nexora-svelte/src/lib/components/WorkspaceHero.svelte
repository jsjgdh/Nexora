<script lang="ts">
  import { COURSES, RUN_SCRIPT, TASK_MANAGER } from "$lib/content/site";
  import { PHASE_DETAIL } from "$lib/content/phase-detail.generated";

  /* The product, in one frame.
   *
   * This is an illustration, not a screenshot: the phase list, the phase goal
   * and the terminal lines are read from the shipped manifest, and the frame
   * is labelled as an example. It shows the one thing the course actually
   * does, a phase opened, a failure named, and the same check passing. */

  const course = COURSES[0];
  const phases = TASK_MANAGER.slice(0, 9);
  const active = "debug";
  const detail = PHASE_DETAIL[course.slug]?.[active];
  const goal = detail?.goal ?? "Investigate broken features using logs, breakpoints, and tests.";
  const activities = detail?.activities ?? 4;

  function stateFor(index: number): "done" | "active" | "next" {
    const phase = phases[index][0];
    if (phase === active) return "active";
    return index < phases.findIndex(([id]) => id === active) ? "done" : "next";
  }
</script>

<figure class="workspace" aria-label="Illustration of a NEXORA phase: a failed check, its reason, and the same check passing">
  <div class="window-bar">
    <span class="win-brand">
      <span class="mark" aria-hidden="true">N</span>
      <span class="win-name">NEXORA</span>
      <span class="win-file num">task-manager</span>
    </span>
    <span class="phase-pill">
      <span class="dot" aria-hidden="true"></span>
      <span class="num">PHASE 09 / 18</span>
      <strong>PASSED</strong>
    </span>
  </div>

  <div class="window-body">
    <aside class="rail" aria-label="Phases in this course">
      <p class="rail-head">TASK MANAGER</p>
      <ol>
        {#each phases as [id, title], i (id)}
          {@const state = stateFor(i)}
          <li data-state={state}>
            <span class="rail-n num">{String(i + 1).padStart(2, "0")}</span>
            <span class="rail-title">{title}</span>
            {#if state === "done"}
              <svg class="rail-mark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="m2 5.2 2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {:else if state === "active"}
              <span class="rail-live" aria-hidden="true"></span>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="rail-more num">+ 9 more</p>
    </aside>

    <div class="main">
      <div class="lesson">
        <div class="lesson-head">
          <div>
            <p class="stamp lesson-kicker">Phase 09 · Debug</p>
            <h2 class="lesson-title">Debug failures</h2>
          </div>
          <span class="tag tag-pass">Passed</span>
        </div>
        <p class="lesson-goal">{goal}</p>
        <div class="lesson-meta num">
          <span>{activities} activities</span>
          <span class="meta-dot" aria-hidden="true">·</span>
          <span>judged in the editor</span>
        </div>

        <div class="verdict">
          <span class="verdict-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16">
              <path d="m3 8.4 3.1 3.1L13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div>
            <p class="verdict-title">1 check passed</p>
            <p class="verdict-body">The failing test passes once the filter runs after the delete resolves.</p>
          </div>
          <span class="verdict-link num">receipt →</span>
        </div>
      </div>

      <div class="terminal">
        <div class="term-head">
          <span class="num">terminal</span>
        </div>
        <div class="term-body">
          {#each RUN_SCRIPT as line, i (i)}
            <p class="term-line" data-kind={line.kind} style={`--line:${i}`}>
              <span class="term-sigil" aria-hidden="true">{line.kind === "cmd" ? "$" : line.kind === "fail" ? "×" : line.kind === "ok" ? "✓" : "·"}</span>
              <span>{line.text}</span>
            </p>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <figcaption class="figure-label">
    Example run · the phase list, goal and output are read from the shipped manifest.
  </figcaption>
</figure>

<style>
  .workspace {
    margin: 0;
    min-width: 0;
    background: var(--color-screen);
    border: 1px solid color-mix(in srgb, var(--color-screen-rule) 80%, transparent);
    border-radius: var(--radius);
    box-shadow: var(--shadow-window);
    overflow: hidden;
    color: var(--color-screen-ink);
  }

  .window-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--color-screen-rule);
    background: color-mix(in srgb, var(--color-screen-2) 80%, var(--color-screen));
  }

  .win-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 21px;
    height: 21px;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .win-name {
    font-family: var(--font-display);
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .win-file {
    padding-left: 0.55rem;
    border-left: 1px solid var(--color-screen-rule);
    font-size: 10px;
    color: var(--color-screen-muted);
  }

  .phase-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--color-screen-rule);
    border-radius: var(--radius-chip);
    font-size: 9.5px;
    color: var(--color-screen-muted);
    white-space: nowrap;
  }

  @media (max-width: 440px) {
    .win-file {
      display: none;
    }
    .phase-pill {
      font-size: 8.5px;
      gap: 0.35rem;
      padding-inline: 0.45rem;
    }
  }

  .phase-pill strong {
    color: var(--color-pass-screen);
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-pass);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-pass) 20%, transparent);
  }

  .window-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 720px) {
    .window-body {
      grid-template-columns: 11rem minmax(0, 1fr);
    }
  }

  .rail {
    display: none;
    padding: 0.85rem 0.7rem;
    border-right: 1px solid var(--color-screen-rule);
    background: color-mix(in srgb, var(--color-screen) 82%, var(--color-screen-2));
  }

  @media (min-width: 720px) {
    .rail {
      display: block;
    }
  }

  .rail-head {
    padding-inline: 0.5rem;
    font-family: var(--font-mono);
    font-size: 8.5px;
    letter-spacing: 0.12em;
    color: var(--color-screen-muted);
  }

  .rail ol {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }

  .rail li {
    display: grid;
    grid-template-columns: 1.1rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    min-height: 26px;
    padding: 0.2rem 0.45rem;
    border-radius: var(--radius-sm);
    font-size: 10px;
    color: var(--color-screen-muted);
  }

  .rail li[data-state="done"] {
    color: color-mix(in srgb, var(--color-screen-ink) 70%, transparent);
  }

  .rail li[data-state="active"] {
    background: color-mix(in srgb, var(--color-accent) 28%, transparent);
    color: var(--color-screen-ink);
  }

  .rail-n {
    font-size: 8.5px;
    color: var(--color-screen-muted);
  }

  .rail-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail-mark {
    color: var(--color-pass);
  }

  .rail-live {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-accent-bright);
  }

  .rail-more {
    padding: 0.45rem 0.45rem 0;
    font-size: 8.5px;
    color: var(--color-screen-muted);
  }

  .main {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
  }

  .lesson {
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--color-screen-rule);
  }

  .lesson-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .lesson-kicker {
    font-size: 8.5px;
    color: var(--color-screen-muted);
  }

  .lesson-title {
    margin-top: 0.2rem;
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: var(--color-screen-ink);
  }

  /* On the dark plate the paper verdict inks fall below 4.5:1, so the two
     state meanings use their screen steps. */
  .workspace .tag-pass {
    border-color: color-mix(in srgb, var(--color-pass-screen) 40%, var(--color-screen-rule));
    color: var(--color-pass-screen);
  }

  .lesson-goal {
    margin-top: 0.5rem;
    max-width: 46ch;
    font-family: var(--font-sans);
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--color-screen-muted);
  }

  .lesson-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.55rem;
    font-size: 9px;
    color: var(--color-screen-muted);
  }

  .meta-dot {
    color: var(--color-screen-rule);
  }

  .verdict {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    margin-top: 0.8rem;
    padding: 0.6rem 0.65rem;
    border: 1px solid color-mix(in srgb, var(--color-pass) 35%, var(--color-screen-rule));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-pass) 10%, transparent);
  }

  .verdict-icon {
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    flex: none;
    border-radius: 50%;
    background: var(--color-pass);
    color: var(--color-on-accent);
  }

  .verdict-title {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--color-screen-ink);
  }

  .verdict-body {
    margin-top: 0.1rem;
    font-family: var(--font-sans);
    font-size: 9.5px;
    line-height: 1.45;
    color: var(--color-screen-muted);
  }

  .verdict-link {
    margin-left: auto;
    align-self: center;
    font-size: 8.5px;
    color: var(--color-pass-screen);
    white-space: nowrap;
  }

  .terminal {
    min-width: 0;
    background: color-mix(in srgb, var(--color-screen) 70%, var(--color-screen-2));
  }

  /* A typographic rule, not window chrome: the terminal names itself and the
     run transcript begins under the line. No traffic-light dots, no invented
     working directory. */
  .term-head {
    padding: 0.55rem 1rem;
    border-bottom: 1px solid var(--color-screen-rule);
    font-size: 8.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-screen-muted);
  }

  .term-body {
    padding: 0.65rem 1rem 0.9rem;
    font-size: 9.5px;
    line-height: 1.7;
  }

  .term-line {
    display: grid;
    grid-template-columns: 0.9rem minmax(0, 1fr);
    gap: 0.35rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .term-line[data-kind="fail"] {
    color: var(--color-fail-screen);
  }

  .term-line[data-kind="ok"] {
    color: var(--color-pass-screen);
  }

  .term-line[data-kind="note"] {
    color: var(--color-screen-muted);
  }

  .term-line[data-kind="cmd"] {
    color: var(--color-screen-ink);
  }

  .term-sigil {
    color: inherit;
    opacity: 0.75;
  }

  .figure-label {
    padding: 0.55rem 1rem 0.65rem;
    border-top: 1px solid var(--color-screen-rule);
    background: var(--color-screen);
    font-family: var(--font-mono);
    font-size: 8.5px;
    letter-spacing: 0.02em;
    color: var(--color-screen-muted);
  }

  @media (prefers-reduced-motion: no-preference) {
    .term-line {
      animation: line-in 240ms var(--ease-out) both;
      animation-delay: calc(160ms + var(--line) * 55ms);
    }
    @keyframes line-in {
      from {
        opacity: 0;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  }
</style>
