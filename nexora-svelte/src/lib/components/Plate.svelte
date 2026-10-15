<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/format";

  /* The one container primitive.
   *
   * Every bordered surface on the site is this element, which is why the
   * radius, the hairline and the registration marks are identical everywhere
   * and why there is no second way to draw a panel. Elevation is declared by
   * border or background and never by a shadow: `step` adds the inner plate
   * with the stronger rule, `crosshair` anchors the top-left corner the way a
   * print plate is registered.
   *
   * Deliberately a `div` and not a polymorphic tag. A plate that can also be a
   * `section` or an `a` is a plate whose border can be broken by a caller;
   * structure belongs to the caller's markup, not to the surface. */

  type Props = {
    step?: boolean;
    crosshair?: boolean;
    padded?: boolean;
    /** Names the region for a screen reader. Given a label, the plate also
        takes `role="group"`, because an `aria-label` on a bare `div` names
        nothing — ARIA does not attach labels to elements with no role. */
    label?: string;
    class?: string;
    children: Snippet;
  };

  let {
    step = false,
    crosshair = false,
    padded = true,
    label,
    class: klass = "",
    children,
  }: Props = $props();
</script>

<div
  class={cn("plate", crosshair && "crosshair", klass)}
  role={label ? "group" : undefined}
  aria-label={label}
>
  {#if step}
    <div class="plate-step m-2">
      <div class={cn(padded && "p-5")}>{@render children()}</div>
    </div>
  {:else}
    <div class={cn(padded && "p-5")}>{@render children()}</div>
  {/if}
</div>
