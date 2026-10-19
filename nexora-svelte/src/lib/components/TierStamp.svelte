<script lang="ts">
  /* The free/pro stamp.
   *
   * The tier is the one piece of curriculum metadata that changes what a
   * learner can open, so it is printed as a word in mono — never as a colour
   * alone, and never as an icon. `free` carries the lamp that means "open to
   * you now"; everything else is a neutral rule. */

  let { tier }: { tier: "free" | "pro" } = $props();
</script>

<span
  class="stamp inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-[1px] text-[10.5px] uppercase tracking-[0.08em] {tier ===
  'free'
    ? 'border-added text-added'
    : 'border-rule-strong text-faint'}"
>
  {#if tier === "free"}
    <span class="lamp" data-on="true" aria-hidden="true"></span>
  {/if}
  {tier}
</span>
