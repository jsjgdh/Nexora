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
    /**
     * A word to set in the reading face, by line index.
     *
     * The poster's second voice. One word in the serif, in italic, inside a
     * line of grotesque: the same sentence, said by a different instrument.
     * It is the one place the house allows the serif into a display line, and
     * it earns that by being one word rather than a paragraph.
     */
    marks?: Record<number, string>;
    class?: string;
    as?: "h1" | "h2" | "p";
  };

  let { lines, marks, class: klass = "", as = "h2" }: HeadlineProps = $props();

  /** A line split around the word the poster wants in the other voice. */
  const segments = (line: string, mark?: string): { text: string; marked: boolean }[] => {
    if (!mark) return [{ text: line, marked: false }];
    const at = line.indexOf(mark);
    if (at === -1) return [{ text: line, marked: false }];
    return [
      { text: line.slice(0, at), marked: false },
      { text: mark, marked: true },
      { text: line.slice(at + mark.length), marked: false },
    ].filter((part) => part.text.length > 0);
  };
</script>

<svelte:element this={as} class={cn("display", klass)} use:inViewStagger>
  {#each lines as line, i (i)}
    <span class="line-mask" data-stagger-item>
      <span>
        {#each segments(line, marks?.[i]) as part, j (j)}
          {#if part.marked}<em class="serif-mark">{part.text}</em>{:else}{part.text}{/if}
        {/each}
      </span>
    </span>
  {/each}
</svelte:element>

<style>
  /* The mark: the reading face, in italic, at the weight the serif was
     designed for. It is not bold and it is not coloured: the difference is
     the voice, not the emphasis. */
  .serif-mark {
    font-family: var(--font-serif);
    font-style: italic;
    font-weight: 350;
    font-variation-settings: "opsz" 96;
    letter-spacing: -0.012em;
    /* The italic's side bearings are narrower than the grotesque's, so the
       word sits closer to its neighbours than it should. A little air on
       each side puts it back where the eye expects it. */
    margin-inline: 0.04em;
  }
</style>
