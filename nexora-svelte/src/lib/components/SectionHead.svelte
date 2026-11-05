<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/format";

  /* A section heading is structure.
   *
   * It is always there, at the size the line needs, with no kicker above it
   * and no observer waiting to bring it in. The manual uses the heading and
   * the sentence under it; a label that repeats what the heading says is
   * padding, and an eyebrow above every section is the fastest way to make a
   * document read like a template. */

  type Props = {
    title: string;
    caption?: string;
    wide?: boolean;
    class?: string;
    id?: string;
    children?: Snippet;
  };

  let { title, caption, wide = false, class: klass = "", id, children }: Props = $props();
</script>

<div id={id} class={cn("section-head", wide ? "section-head-wide" : "", klass)}>
  <h2 class="display section-title">{title}</h2>
  {#if caption}
    <p class="reading section-caption">{caption}</p>
  {/if}
  {#if children}
    <div class="section-extra">{@render children()}</div>
  {/if}
</div>

<style>
  .section-head {
    max-width: 40rem;
    min-width: 0;
  }

  .section-head-wide {
    max-width: 54rem;
  }

  .section-title {
    font-size: var(--text-section);
    color: var(--color-ink);
  }

  .section-caption {
    margin-top: var(--space-3);
    max-width: 56ch;
    font-size: 15.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .section-extra {
    margin-top: var(--space-4);
  }
</style>
