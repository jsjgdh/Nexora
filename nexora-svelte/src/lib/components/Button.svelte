<script lang="ts">
  import type { Snippet } from "svelte";
  import { actionClass, type ActionSize, type ActionVariant } from "$lib/ui";
  import { cn } from "$lib/format";

  /* A control that does something.
   *
   * Same skin as `ActionLink`, different element and different semantics: this
   * one never navigates, so it is a `<button>` and it carries a real `type`.
   * `busy` is exposed as `aria-busy` so a screen reader is told the click was
   * received rather than being left to guess at a changed label. */

  type Props = {
    variant?: ActionVariant;
    size?: ActionSize;
    disabled?: boolean;
    busy?: boolean;
    type?: "button" | "submit" | "reset";
    title?: string;
    onclick?: (event: MouseEvent) => void;
    class?: string;
    children: Snippet;
  };

  let {
    variant = "primary",
    size = "md",
    disabled = false,
    busy = false,
    type = "button",
    title,
    onclick,
    class: klass = "",
    children,
  }: Props = $props();
</script>

<button
  {type}
  {title}
  {onclick}
  disabled={disabled || busy}
  aria-busy={busy ? "true" : undefined}
  class={cn(actionClass(variant, size), klass)}
>
  {@render children()}
</button>
