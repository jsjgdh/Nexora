<script lang="ts">
  import { scrollProgress } from "$lib/motion";

  /* The bench scale.
   *
   * A one-pixel rail on the right edge with a tick per section, and a marker
   * that reports how far down the document you are. The progress value is
   * written to a CSS custom property by the action rather than into Svelte
   * state, so scrolling never re-renders a component — the browser moves one
   * element's `height`.
   *
   * It is `aria-hidden` and it is not a navigation control: a progress
   * indicator a screen-reader user cannot use is decoration, and the sections
   * it marks are already reachable from the header. Under reduced motion the
   * marker sits at the top and does not travel. */

  type Props = { sections: readonly { id: string; label: string }[] };

  let { sections }: Props = $props();
</script>

<div class="rail" aria-hidden="true" use:scrollProgress>
  <div class="rail-track">
    <div class="rail-fill"></div>
  </div>
  <ul class="rail-ticks">
    {#each sections as section (section.id)}
      <li class="rail-tick">
        <span class="stamp text-faint">{section.label}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .rail {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: var(--z-rail);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-right: var(--space-3);
    pointer-events: none;
  }
  /* The rail is a desktop affordance: on a narrow screen it would sit under
     the thumb, so it is not drawn at all rather than drawn small. */
  @media (max-width: 1100px) {
    .rail {
      display: none;
    }
  }
  .rail-track {
    position: relative;
    width: 1px;
    height: 34vh;
    background: var(--color-rule);
  }
  /* The fill is scaled, not resized: a height transition on an element that
     changes on every scroll frame is a layout pass on every frame, and the
     browser can do this one on the compositor instead. */
  .rail-fill {
    position: absolute;
    inset: 0 0 auto 0;
    height: 100%;
    background: var(--color-accent);
    transform: scaleY(var(--scroll-progress, 0));
    transform-origin: top center;
    transition: transform 80ms var(--ease-out);
  }
  .rail-ticks {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
    text-align: right;
  }
  .rail-tick span {
    writing-mode: vertical-rl;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 10px;
  }
</style>
