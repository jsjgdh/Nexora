<script lang="ts">
  import type { ExecFrame } from "$lib/viz/exec";

  let { lines, frame }: { lines: string[]; frame: ExecFrame } = $props();
</script>

<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  <div class="overflow-hidden rounded-lg border border-rule bg-ground">
    <p class="border-b border-rule px-3 py-1.5 font-mono text-[11px] text-faint">program</p>
    <pre class="nice-scroll overflow-x-auto p-2 font-mono text-[12.5px] leading-[1.75]"><code>{#each lines as text, li}<span
            class={frame.line === li + 1
              ? "block border-l-2 border-accent bg-accent/10 pl-2"
              : "block border-l-2 border-transparent pl-2 text-muted"}><span
              class="mr-2 inline-block w-6 text-right text-faint"
              aria-hidden="true">{li + 1}</span
            >{text === "" ? " " : text}{#if frame.line === li + 1}<span
                class="ml-2 rounded border border-accent px-1 text-[10px] font-bold text-accent"
                aria-hidden="true">L{li + 1}</span
              >{/if}</span
          >{/each}</code></pre>
  </div>
  <div class="rounded-lg border border-rule bg-ground">
    <p class="border-b border-rule px-3 py-1.5 font-mono text-[11px] text-faint">stack</p>
    <div class="space-y-2 p-2">
      {#each frame.scopes as scope}
        <div
          class={scope.active
            ? "rounded-md border border-accent/60 bg-accent/5 px-2.5 py-1.5"
            : "rounded-md border border-rule px-2.5 py-1.5 opacity-75"}
        >
          <p class="font-mono text-xs font-bold {scope.active ? 'text-accent' : 'text-muted'}">
            {scope.fn}()
          </p>
          {#if scope.vars.length === 0}
            <p class="font-mono text-[11px] text-faint">— no variables yet</p>
          {/if}
          {#each scope.vars as v}
            <p class="font-mono text-[12.5px]">
              <span class="text-faint">{v.name} = </span><span class={v.changed ? "font-bold text-mint" : "text-ink"}
                >{v.value}</span
              >{#if v.changed}<span class="ml-1.5 text-[10px] text-mint" aria-hidden="true">● new</span>{/if}
            </p>
          {/each}
        </div>
      {/each}
      {#if frame.returned}
        <p class="rounded-md border border-added/60 bg-added/5 px-2.5 py-1.5 font-mono text-[12.5px] text-added">
          ↩ {frame.returned.fn} → {frame.returned.value}
        </p>
      {/if}
    </div>
  </div>
</div>
