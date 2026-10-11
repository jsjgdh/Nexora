<script lang="ts">
  let { value, max, label }: { value: number; max: number; label?: string } = $props();
  const pct = $derived(max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100)));
</script>

<div>
  {#if label}
    <div class="mb-1 flex items-center justify-between text-xs text-muted">
      <span>{label}</span>
      <span aria-hidden="true">{value}/{max}</span>
    </div>
  {/if}
  <div
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-label={label ?? "Progress"}
    class="h-2 overflow-hidden rounded-full bg-[#0c1218]"
  >
    <div
      class="h-full rounded-full bg-gradient-to-r from-mint-dim to-mint transition-all"
      style={`width: ${pct}%`}
    ></div>
  </div>
</div>
