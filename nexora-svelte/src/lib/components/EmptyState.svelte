<script lang="ts">
  import type { Snippet } from "svelte";

  /* An empty state is a review comment: a one-pixel spine, a mono kicker, a
     heading, one paragraph of plain explanation, and the action that resolves
     it. No dashed border, no centred card. */

  let {
    title,
    body,
    kicker = "no change yet",
    children,
  }: { title: string; body: string; kicker?: string; children?: Snippet } = $props();
</script>

<div class="thread max-w-2xl">
  <p class="stamp text-faint">{kicker}</p>
  <p class="mt-2 text-[15px] font-semibold text-ink">{title}</p>
  <p class="mt-2 text-sm leading-relaxed text-muted">{body}</p>
  {#if children}
    <div class="mt-4 flex flex-wrap items-center gap-2">{@render children()}</div>
  {/if}
</div>
