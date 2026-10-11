<script lang="ts">
  import { cn } from "$lib/format";

  let { level }: { level: number } = $props();
</script>

<span class="inline-flex items-center gap-1" role="img" aria-label={`Difficulty ${level} of 5`}>
  {#each [1, 2, 3, 4, 5] as i}
    <span
      aria-hidden="true"
      class={cn("h-1.5 w-1.5 rounded-full", i <= level ? "bg-warning" : "bg-line")}
    ></span>
  {/each}
</span>
