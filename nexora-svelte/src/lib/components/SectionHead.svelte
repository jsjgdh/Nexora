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
</script>

<div
  class={cn(wide ? "max-w-[64ch]" : "max-w-[46ch]", "min-w-0", klass)}
  use:inView
>
  <h2 class="display fade-up text-[clamp(2rem,3.8vw,3.15rem)] text-ink">
    <span class="line-mask"><span>{title}</span></span>
  </h2>
  {#if caption}
    <p class="reading fade-up mt-4 max-w-[62ch] text-[16px] leading-relaxed text-muted" style="transition-delay: 90ms">
      {caption}
    </p>
  {/if}
  {#if children}
    <div class="fade-up mt-5" style="transition-delay: 150ms">{@render children()}</div>
  {/if}
</div>
