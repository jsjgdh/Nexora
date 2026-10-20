<script lang="ts">
  import type { Snippet } from "svelte";
  import { inView } from "$lib/motion";
  import { cn } from "$lib/format";

  /* The header of a section: a masked display line, and a caption measured in
   * characters rather than in pixels — a caption wider than ~60 characters
   * stops being read.
   *
   * There is deliberately no kicker or eyebrow above the heading. A label that
   * says "the mechanism" above a heading that already says what the mechanism
   * is does not add information; it only pads the section. The heading carries
   * its own weight, and metal ornaments above it were the first habit this
   * world had to lose. */

  type Props = {
    title: string;
    caption?: string;
    wide?: boolean;
    class?: string;
    children?: Snippet;
  };

  let { title, caption, wide = false, class: klass = "", children }: Props = $props();

  /* The heading gets a wider measure than the caption, and they are two
     different jobs.
   *
   * The caption is prose and is held to a reading measure of about sixty
   * characters. The heading is a poster line, set at four times that size, and
   * a measure computed in characters of the *body* face would break it into
   * four or five lines and turn a sentence into a block. So the container is
   * wide, the caption narrows itself inside it, and the heading is allowed to
   * run to two lines. */
</script>

<div
  class={cn(wide ? "max-w-[54rem]" : "max-w-[40rem]", "min-w-0", klass)}
  use:inView
>
  <h2 class="display fade-up text-[clamp(2.1rem,4vw,3.4rem)] text-ink">
    <span class="line-mask"><span>{title}</span></span>
  </h2>
  {#if caption}
    <p class="reading fade-up mt-4 max-w-[62ch] text-[18px] leading-relaxed text-muted" style="transition-delay: 90ms">
      {caption}
    </p>
  {/if}
  {#if children}
    <div class="fade-up mt-5" style="transition-delay: 150ms">{@render children()}</div>
  {/if}
</div>
