<script lang="ts">
  import type { Snippet } from "svelte";

  /* The house checkbox.
   *
   * A native checkbox is sixteen pixels of target, and a thumb does not care
   * that the text beside it happens to be clickable. So the drawn box stays
   * small, the target around it is the full forty-four, and the real input
   * sits over the drawing and takes the click.
   *
   * The input is transparent rather than absent, so it keeps its place in the
   * tab order, its name in the accessibility tree, and its focus. The ring is
   * drawn on the box instead, because a ring around an invisible input is a
   * ring nobody can see.
   *
   * The tick is drawn in the same one-pixel rule as every other mark in this
   * house: two borders and a rotation, no glyph and no icon library. */
  type Props = {
    checked?: boolean;
    id?: string;
    disabled?: boolean;
    class?: string;
    /** Anything else the input needs, spread onto it. */
    attrs?: Record<string, string>;
    children: Snippet;
  };

  let {
    checked = $bindable(false),
    id,
    disabled = false,
    class: klass = "",
    attrs,
    children,
  }: Props = $props();
</script>

<label class="flex min-h-[44px] items-start gap-3 {klass}" class:opacity-60={disabled}>
  <span class="relative grid h-11 w-11 shrink-0 place-items-center">
    <span class="box" aria-hidden="true"></span>
    <input
      {id}
      type="checkbox"
      bind:checked
      {disabled}
      {...attrs}
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
    />
  </span>
  <span class="pt-3 text-[13.5px] leading-relaxed text-muted">{@render children()}</span>
</label>

<style>
  .box {
    position: relative;
    width: 20px;
    height: 20px;
    border: 1px solid var(--color-control);
    border-radius: var(--radius-sm);
    background: var(--color-panel);
    transition:
      background-color var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out);
  }
  label:has(input:checked) .box {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  label:has(input:checked) .box::after {
    content: "";
    position: absolute;
    left: 6px;
    top: 2px;
    width: 5px;
    height: 10px;
    border: solid var(--color-on-accent);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  label:has(input:focus-visible) .box {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
