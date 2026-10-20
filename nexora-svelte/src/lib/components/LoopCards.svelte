<script lang="ts">
  import { LOOP_STEPS } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* The loop, as five steps.
   *
   * A phase is a sequence and this section shows it as one: understand, write,
   * run, investigate, verify. Each step carries the panel it would actually
   * show, and the panels are read out of the product's own transcript, so the
   * failure on this page is a failure the platform really produces.
   *
   * The panels are read, not typed, and the suite checks that every line in
   * every panel is a line of that transcript.
   */
</script>

<ol class="loop" use:inViewStagger={{ step: 90 }}>
  {#each LOOP_STEPS as step (step.n)}
    <li class="step" data-stagger-item>
      <p class="num text-[11.5px] text-accent">{step.n}</p>
      <h3 class="display mt-3 text-[clamp(1.15rem,1.8vw,1.45rem)] text-ink">{step.name}</h3>
      <p class="reading mt-2.5 max-w-[34ch] text-[15.5px] leading-relaxed text-muted">
        {step.body}
      </p>

      <div class="panel" data-kind={step.panel.kind}>
        {#each step.panel.lines as line, i (`${step.n}-${i}`)}
          {#if line.text}
            <p class="line" data-tone={line.tone ?? "plain"}>{line.text}</p>
          {/if}
        {/each}
      </div>
    </li>
  {/each}
</ol>

<style>
  .loop {
    display: grid;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--color-rule);
    border: 1px solid var(--color-rule);
  }

  @media (min-width: 720px) {
    .loop {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1120px) {
    .loop {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  .step {
    display: flex;
    flex-direction: column;
    background: var(--color-ground);
    padding: var(--space-6) var(--space-5);
    min-height: 18rem;
  }

  .panel {
    margin-top: auto;
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-rule);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    color: var(--color-faint);
  }

  .panel[data-kind="prose"] {
    color: var(--color-muted);
    font-family: var(--font-serif);
    font-size: 15px;
    line-height: 1.5;
  }

  .line {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* The step that runs the code is the one that fails, and the line that says
     so is the one that is red. It is the only red on the page, and it is
     there because the whole product is about what a failure looks like. */
  .line[data-tone="bad"] {
    color: var(--color-removed);
  }

  /* And the step that fixes it is the one that passes. */
  .line[data-tone="ok"] {
    color: var(--color-added);
  }
</style>
