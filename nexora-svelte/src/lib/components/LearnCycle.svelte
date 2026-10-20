<script lang="ts">
  import { LEARN_CYCLE } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";

  /* What a phase is.
   *
   * The title is the shipped manifest's own sentence, so the section opens on
   * the product's description of itself rather than on this site's description
   * of the product. The four steps are that sentence taken apart, and the
   * shape they draw is a run rather than a grid of boxes: a phase is a
   * sequence, and a sequence that reads as four equal cards has lost the one
   * thing that makes it a phase. */

  const steps = LEARN_CYCLE.steps;
</script>

<div>
  <ol class="grid border-t border-rule-strong sm:grid-cols-2 lg:grid-cols-4" use:inViewStagger>
    {#each steps as step, i (step.name)}
      <li
        class="fade-up border-b border-rule-strong py-7 sm:px-6 sm:first:pl-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
        data-stagger-item
      >
        <p class="num text-[11.5px] text-faint">{step.n}</p>
        <h3 class="display mt-3 text-[clamp(1.35rem,2.4vw,1.9rem)] text-ink">{step.name}</h3>
        <p class="reading mt-3 max-w-[34ch] text-[16.5px] leading-relaxed text-muted">
          {step.body}
        </p>
        {#if i < steps.length - 1}
          <span class="num mt-5 block text-[11px] text-faint" aria-hidden="true">
            then
          </span>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="mt-12 border-l-2 border-accent pl-6">
    <h3 class="display max-w-[24ch] text-[clamp(1.25rem,2.2vw,1.7rem)] text-ink">
      {LEARN_CYCLE.guidance.title}
    </h3>
    <p class="reading mt-3 max-w-[62ch] text-[17px] leading-relaxed text-muted">
      {LEARN_CYCLE.guidance.body}
    </p>
  </div>
</div>
