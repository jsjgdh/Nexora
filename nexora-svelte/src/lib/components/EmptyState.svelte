<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    body,
    children,
  }: { title: string; body: string; children?: Snippet } = $props();
</script>

<div class="rounded-xl border border-dashed border-line bg-elevated/50 px-6 py-10 text-center">
  <p class="text-[15px] font-semibold text-ink">{title}</p>
  <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
  {#if children}
    <div class="mt-4 flex justify-center">{@render children()}</div>
  {/if}
</div>
