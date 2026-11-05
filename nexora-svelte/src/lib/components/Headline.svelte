<script lang="ts">
  import { cn } from "$lib/format";

  /* A display line, or two.
   *
   * The manual sets its headings as structure: they are present, they are not
   * revealed by a scroll observer, and they never carry a marked word in a
   * second face. The entrance belongs to the hero block and is a single CSS
   * move there, so a fast reader never meets a heading that is waiting for its
   * animation.
   *
   * One voice at one weight: there is no serif in this world, and no marked
   * word inside a line, so a heading has nothing to carry but its words. */

  type Props = {
    lines: readonly string[];
    class?: string;
    as?: "h1" | "h2" | "p";
  };

  let { lines, class: klass = "", as = "h2" }: Props = $props();
</script>

<svelte:element this={as} class={cn("display", klass)}>
  {#each lines as line, i (i)}
    <span class="headline-line">{line}</span>
  {/each}
</svelte:element>

<style>
  .headline-line {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
