<script lang="ts">
  import type { Snippet } from "svelte";
  import { magnet } from "$lib/motion";
  import { actionClass, type ActionSize, type ActionVariant } from "$lib/ui";
  import { cn } from "$lib/format";

  /* An anchor that goes somewhere.
   *
   * The island is the one flourish: a small circled arrow that leans toward
   * the pointer. It is `aria-hidden` and the label carries the meaning, so a
   * screen reader hears the destination once rather than twice; the `magnet`
   * action is skipped entirely on touch and under reduced motion, which leaves
   * an ordinary, perfectly good link. */

  type Props = {
    href: string;
    variant?: ActionVariant;
    size?: ActionSize;
    island?: boolean;
    external?: boolean;
    class?: string;
    children: Snippet;
  };

  let {
    href,
    variant = "primary",
    size = "md",
    island = false,
    external = false,
    class: klass = "",
    children,
  }: Props = $props();
</script>

<a
  {href}
  rel={external ? "external noopener" : undefined}
  class={cn(actionClass(variant, size), klass)}
  use:magnet={{ strength: 3 }}
>
  {@render children()}
  {#if island}
    <span class="island" aria-hidden="true">
      <svg width="11" height="11" viewBox="0 0 11 11" focusable="false">
        <path d="M2.5 8.5 8.5 2.5M4 2.5h4.5V7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" />
      </svg>
    </span>
  {/if}
</a>

<style>
  .island {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-ground) 12%, transparent);
    transition: transform 320ms var(--ease-sheet);
  }
  a:hover .island {
    transform: translate(1px, -1px);
  }
</style>
