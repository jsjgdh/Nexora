<script lang="ts">
  import { ticker } from "$lib/motion";

  /* A number that counts up when it is first seen.
   *
   * The value passed in is the value rendered: the component writes it into
   * the DOM as ordinary text, and the ticker action reads it back as the
   * target. So a crawler, a visitor with JavaScript off, and a reduced-motion
   * visitor all read the real figure, and only a motion visitor sees it
   * animate — the animation is an enhancement to a number that was already
   * correct. */

  let { value, class: klass = "" }: { value: string; class?: string } = $props();
</script>

<span class={klass} use:ticker>{value}</span>
