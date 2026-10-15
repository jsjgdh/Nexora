<script lang="ts">
  import type { Snippet } from "svelte";
  import { inView } from "$lib/motion";
  import { cn } from "$lib/format";

  /* A block that fades up once, when it is far enough into the viewport.
   * `delay` is for siblings that should not arrive at the same instant. */

  type Props = {
    delay?: number;
    class?: string;
    children: Snippet;
  };

  let { delay = 0, class: klass = "", children }: Props = $props();
</script>

<div
  class={cn("fade-up", klass)}
  style={delay ? `transition-delay: ${delay}ms` : undefined}
  use:inView
>
  {@render children()}
</div>
