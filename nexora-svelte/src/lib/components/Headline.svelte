<script lang="ts">
  import type { Snippet } from "svelte";
  import { inView, inViewStagger } from "$lib/motion";
  import { cn } from "$lib/format";

  /* Type arrives the way a verdict does: masked, once, and not again.
   *
   * Two shapes, one behaviour. `Headline` masks each line and lifts it out of
   * its own overflow box, staggered; `Reveal` fades a block up. Both set
   * `data-shown`, both let app.css own the visual work, and both hand the
   * reduced-motion path to the single override at the bottom of that file —
   * which is why the reduced answer here is "show it immediately" rather than
   * "run a faster animation".
   *
   * A block that has already been seen is never re-animated: the observers
   * disconnect on first intersection. */

  type HeadlineProps = {
    lines: readonly string[];
    class?: string;
    as?: "h1" | "h2" | "p";
  };

  let { lines, class: klass = "", as = "h2" }: HeadlineProps = $props();
</script>

<svelte:element this={as} class={cn("display", klass)} use:inViewStagger>
  {#each lines as line, i (i)}
    <span class="line-mask" data-stagger-item>
      <span>{line}</span>
    </span>
  {/each}
</svelte:element>
