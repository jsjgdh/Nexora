<script lang="ts">
  import type { Snippet } from "svelte";
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

  /* The heading and its caption are structure, not content.
   *
   * They are always there. A heading that fades in when it reaches the
   * viewport is a heading that is not there for a reader who scrolls fast, and
   * a page where every heading arrives is a page that never settles. What
   * arrives, when it arrives, is the content under the heading, and that is
   * where the motion belongs.
   */
</script>

<div
  class={cn(wide ? "max-w-[54rem]" : "max-w-[40rem]", "min-w-0", klass)}
>
  <h2 class="display text-[clamp(2.1rem,4vw,3.4rem)] text-ink">
    <span class="line-mask"><span>{title}</span></span>
  </h2>
  {#if caption}
    <p class="reading mt-4 max-w-[62ch] text-[18px] leading-relaxed text-muted">
      {caption}
    </p>
  {/if}
  {#if children}
    <div class="mt-5">{@render children()}</div>
  {/if}
</div>
