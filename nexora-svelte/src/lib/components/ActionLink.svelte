<script lang="ts">
  import type { Snippet } from "svelte";
  import { actionClass, type ActionSize, type ActionVariant } from "$lib/ui";
  import { cn } from "$lib/format";

  /* An anchor that goes somewhere. The label carries the meaning; the arrow is
   * a typographic mark, not a drawn icon, and it is hidden from a screen
   * reader. There is no magnetic pull and no custom hit area: the platform
   * already owns the pointer. */

  type Props = {
    href: string;
    variant?: ActionVariant;
    size?: ActionSize;
    island?: boolean;
    external?: boolean;
    /** An accessible name when the visible label is short. The visible text
        stays in the name, so voice control still matches what is on screen. */
    label?: string;
    class?: string;
    children: Snippet;
  };

  let {
    href,
    variant = "primary",
    size = "md",
    island = false,
    external = false,
    label,
    class: klass = "",
    children,
  }: Props = $props();
</script>

<a
  {href}
  aria-label={label}
  rel={external ? "external noopener" : undefined}
  class={cn(actionClass(variant, size), klass)}
>
  {@render children()}
  {#if island}
    <span class="arrow" aria-hidden="true">→</span>
  {/if}
</a>

<style>
  .arrow {
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1;
    transition: transform var(--dur-1) var(--ease-out);
  }

  a:hover .arrow {
    transform: translateX(2px);
  }
</style>
