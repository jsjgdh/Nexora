<script lang="ts">
  import { FLEX_DEFAULTS, flexCss, type FlexOpts } from "$lib/viz/flexcss";

  /* Flexbox playground: real controls styling a real flex container, with the
     exact generated CSS beside it. No frames, no player — direct manipulation
     is the lesson here. Native controls keep it keyboard-accessible throughout. */

  let opts = $state<FlexOpts>({ ...FLEX_DEFAULTS });
  const css = $derived(flexCss(opts));
  const items = $derived(Array.from({ length: opts.items }, (_, i) => i + 1));

  const DIRECTIONS = ["row", "row-reverse", "column", "column-reverse"] as const;
  const JUSTIFY = ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"] as const;
  const ALIGN = ["stretch", "flex-start", "flex-end", "center", "baseline"] as const;
  const WRAPS = ["nowrap", "wrap", "wrap-reverse"] as const;

  function select(label: string, value: string, options: readonly string[], onpick: (v: string) => void) {
    return { label, value, options, onpick };
  }
  const selects = $derived([
    select("Direction", opts.direction, DIRECTIONS, (v) => (opts.direction = v as FlexOpts["direction"])),
    select("Justify", opts.justify, JUSTIFY, (v) => (opts.justify = v as FlexOpts["justify"])),
    select("Align items", opts.align, ALIGN, (v) => (opts.align = v as FlexOpts["align"])),
    select("Wrap", opts.wrap, WRAPS, (v) => (opts.wrap = v as FlexOpts["wrap"])),
  ]);
</script>

<div class="overflow-hidden rounded-xl border border-rule bg-panel">
  <div class="grid gap-2 border-b border-rule p-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each selects as s}
      <label class="block text-xs text-faint">
        {s.label}
        <select
          value={s.value}
          onchange={(e) => s.onpick((e.target as HTMLSelectElement).value)}
          class="mt-1 block w-full rounded-md border border-rule bg-ground px-2 py-1.5 font-mono text-[13px] text-ink"
        >
          {#each s.options as o}
            <option value={o}>{o}</option>
          {/each}
        </select>
      </label>
    {/each}
    <label class="block text-xs text-faint">
      Gap: {opts.gap}px
      <input
        type="range"
        min="0"
        max="32"
        step="4"
        bind:value={opts.gap}
        class="mt-2 block w-full accent-accent"
        aria-valuetext={`${opts.gap} pixels`}
      />
    </label>
    <label class="block text-xs text-faint">
      Items: {opts.items}
      <input
        type="range"
        min="2"
        max="6"
        step="1"
        bind:value={opts.items}
        class="mt-2 block w-full accent-accent"
        aria-valuetext={`${opts.items} items`}
      />
    </label>
  </div>
  <div class="p-4">
    <div
      aria-label="Flexbox demo: a container with numbered items, styled by the controls above"
      role="img"
      class="min-h-[160px] rounded-lg border border-accent/40 bg-accent/5 p-3"
      style={`display: flex; flex-direction: ${opts.direction}; justify-content: ${opts.justify}; align-items: ${opts.align}; flex-wrap: ${opts.wrap}; gap: ${opts.gap}px;`}
    >
      {#each items as n}
        <div class="min-w-[64px] rounded-md border border-rule bg-raised px-4 py-3 text-center font-semibold text-ink">
          {n}
        </div>
      {/each}
    </div>
    <pre class="nice-scroll mt-3 overflow-x-auto rounded-lg border border-rule bg-ground p-3 font-mono text-xs leading-relaxed text-ink"><code>{css}</code></pre>
    <p class="mt-2 text-xs text-faint">This exact CSS styles the box above — change a control and watch both move.</p>
  </div>
</div>
