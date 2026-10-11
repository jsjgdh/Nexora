<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Snippet } from "svelte";
  import { STEP_MS, type VizFrame, type VizSpeed } from "$lib/viz/types";

  /* Generic step-through player. The frame is rendered by the caller through
     the children snippet; this component owns only stepping, playback, speed,
     and narration. Playback is always user-initiated — nothing autoplays. */

  let {
    frames,
    title,
    children,
  }: {
    frames: VizFrame[];
    title: string;
    children: Snippet<[VizFrame]>;
  } = $props();

  let i = $state(0);
  let playing = $state(false);
  let speed = $state<VizSpeed>(1);
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop() {
    playing = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function advance() {
    if (i >= frames.length - 1) stop();
    else i += 1;
  }

  function play() {
    if (i >= frames.length - 1) i = 0;
    playing = true;
    if (timer) clearInterval(timer);
    timer = setInterval(advance, STEP_MS[speed]);
  }

  function setSpeed(v: VizSpeed) {
    speed = v;
    if (playing) {
      if (timer) clearInterval(timer);
      timer = setInterval(advance, STEP_MS[speed]);
    }
  }

  function go(n: number) {
    i = Math.max(0, Math.min(frames.length - 1, n));
  }

  // A new demo (new frames array) restarts the player from step one.
  $effect(() => {
    void frames;
    i = 0;
    stop();
  });

  onDestroy(stop);
</script>

<figure class="overflow-hidden rounded-xl border border-rule bg-panel" aria-label={title}>
  <div class="flex items-center justify-between border-b border-rule px-4 py-2 font-mono text-xs text-faint">
    <span>{title}</span>
    <span>
      Step {i + 1} of {frames.length}
    </span>
  </div>
  <div class="px-4 py-3">
    {@render children(frames[i])}
  </div>
  <div class="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-2.5">
    <button
      type="button"
      onclick={() => go(0)}
      disabled={i === 0}
      class="rounded-md border border-rule px-3 py-1.5 text-[13px] text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      Restart
    </button>
    <button
      type="button"
      onclick={() => go(i - 1)}
      disabled={i === 0}
      class="rounded-md border border-rule px-3 py-1.5 text-[13px] text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      ← Back
    </button>
    <button
      type="button"
      onclick={() => (playing ? stop() : play())}
      class="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent/20"
    >
      {playing ? "Pause" : "Play"}
    </button>
    <button
      type="button"
      onclick={() => go(i + 1)}
      disabled={i >= frames.length - 1}
      class="rounded-md border border-rule px-3 py-1.5 text-[13px] text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      Next →
    </button>
    <label class="ml-auto flex items-center gap-2 text-xs text-faint">
      Speed
      <select
        value={speed}
        onchange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value) as VizSpeed)}
        class="rounded-md border border-rule bg-panel px-2 py-1.5 text-[13px] text-ink"
      >
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
      </select>
    </label>
  </div>
  <figcaption aria-live="polite" class="border-t border-rule px-4 py-3 text-sm leading-relaxed text-ink">
    {frames[i].caption}
  </figcaption>
</figure>
