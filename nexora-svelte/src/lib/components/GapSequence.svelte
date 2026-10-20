<script lang="ts">
  import { GAP } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* The gap, as a sequence.
   *
   * The reader does not arrive with one problem. They arrive with four, in
   * order, and only the fourth is the moment the product is for. So the four
   * lines are a run rather than a set: each one takes the ink as the reader
   * reaches it, and the last one is the line about NEXORA, in the signal
   * colour.
   *
   * The reveal is the house one: the container marks its children in order
   * and the CSS does the rest, so a reduced-motion reader sees the finished
   * state immediately and nobody waits for a timeline.
   */
</script>

<div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
  <div class="min-w-0">
    <h2 class="display max-w-[16ch] text-[clamp(2rem,4.2vw,3.2rem)] text-ink">{GAP.title}</h2>
    <p class="reading mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted">{GAP.lead}</p>
  </div>

  <ol class="lines" use:inViewStagger={{ step: 420 }}>
    {#each GAP.lines as line, i (line)}
      <li class="line" data-stagger-item>
        <span class="num text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
        <span class="text">{line}</span>
      </li>
    {/each}
  </ol>
</div>

<style>
  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
    border-left: 1px solid var(--color-rule);
  }

  .line {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    padding: var(--space-4) 0 var(--space-4) var(--space-6);
    font-size: clamp(1.25rem, 2.1vw, 1.75rem);
    line-height: 1.25;
    letter-spacing: -0.02em;
    color: var(--color-faint);
    transition: color 600ms ease;
  }

  /* The attribute is set by the reveal action at run time, so it has to be
     addressed globally or the compiler cannot see it. */
  .line:global([data-shown="true"]) {
    color: var(--color-ink);
  }

  /* The last line is the one about NEXORA, and it is the one the eye should
     end on. */
  .line:last-child {
    color: var(--color-faint);
  }

  .line:last-child:global([data-shown="true"]) {
    color: var(--color-accent);
    font-weight: 700;
  }
</style>
