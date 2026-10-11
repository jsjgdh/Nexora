<script lang="ts">
  import { goto } from "$app/navigation";
  import { progress } from "$lib/store.svelte";
  import { DIAGNOSTIC_ITEMS, htmlStartIndex } from "$lib/diagnostic";
  import { ALL_MISSIONS } from "$lib/missions";
  import { competencyById } from "$lib/curriculum";
  import type { DiagnosticResult } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { cn } from "$lib/format";

  let index = $state(0);
  let selected = $state<number | null>(null);
  let results = $state<DiagnosticResult[]>([]);
  let done = $state(progress.state.diagnostic.completedAt !== null);

  const item = $derived(DIAGNOSTIC_ITEMS[index]);
  const revealed = $derived(selected !== null);

  function choose(i: number) {
    if (revealed) return;
    selected = i;
  }

  function next() {
    if (!item) return;
    const entry: DiagnosticResult = {
      itemId: item.id,
      selected: selected === null ? -1 : selected,
      correct: selected === item.answer,
      skipped: selected === null,
    };
    const nextResults = [...results, entry];
    results = nextResults;
    if (index + 1 >= DIAGNOSTIC_ITEMS.length) {
      progress.saveDiagnostic(nextResults);
      done = true;
    } else {
      index = index + 1;
      selected = null;
    }
  }

  const summary = $derived.by(() => {
    if (!done) return null;
    const finalResults =
      results.length === DIAGNOSTIC_ITEMS.length ? results : progress.state.diagnostic.results;
    const aligned = DIAGNOSTIC_ITEMS.map((d) => {
      const r = finalResults.find((x) => x.itemId === d.id);
      return { correct: r?.correct ?? false, skipped: !r || r.skipped };
    });
    const startIdx = htmlStartIndex(aligned);
    const startMission = ALL_MISSIONS[Math.min(startIdx, ALL_MISSIONS.length - 1)];
    const correct = finalResults.filter((r) => r.correct).length;
    const skipped = finalResults.filter((r) => r.skipped).length;
    return { finalResults, startMission, correct, skipped };
  });

  function retake(e: MouseEvent) {
    e.preventDefault();
    done = false;
    index = 0;
    results = [];
    selected = null;
  }
</script>

{#if done && summary}
  <div class="mx-auto max-w-2xl px-4 py-10">
    <p class="text-xs font-bold tracking-widest text-mint uppercase">Diagnostic complete</p>
    <h1 class="mt-2 text-2xl font-bold sm:text-3xl">Here is your starting point</h1>
    <div class="mt-6 rounded-xl border border-line bg-elevated p-5 sm:p-6">
      <div class="flex items-center gap-4">
        <div
          aria-hidden="true"
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint/15 font-mono text-xl font-bold text-mint"
        >
          {summary.correct}/{DIAGNOSTIC_ITEMS.length}
        </div>
        <div>
          <p class="font-semibold">
            {summary.correct} correct
            {#if summary.skipped > 0}· {summary.skipped} skipped{/if}
          </p>
          <p class="text-sm text-muted">
            Skips are not failures — they route you to the introductory material instead of guessing.
          </p>
        </div>
      </div>

      <ul class="mt-5 space-y-2">
        {#each summary.finalResults as r}
          {@const d = DIAGNOSTIC_ITEMS.find((x) => x.id === r.itemId)!}
          {@const comp = competencyById(d.competencyId)}
          <li class="flex items-start gap-3 rounded-lg border border-line bg-[#0c1218] p-3">
            <span
              aria-hidden="true"
              class={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                r.correct
                  ? "bg-success/15 text-success"
                  : r.skipped
                    ? "bg-elevated-2 text-muted"
                    : "bg-warning/15 text-warning"
              )}
            >
              {r.correct ? "✓" : r.skipped ? "–" : "!"}
            </span>
            <div class="text-sm">
              <span class="font-semibold text-ink">{d.skill}</span>
              <span class="text-muted"> · {comp?.name}</span>
              <p class="mt-0.5 text-[13px] leading-relaxed text-muted">
                {r.skipped ? "Skipped — we'll build this from the foundations." : d.explanation}
              </p>
            </div>
          </li>
        {/each}
      </ul>

      <div class="mt-5 rounded-lg border border-mint/40 bg-mint/5 p-4">
        <p class="text-sm font-semibold text-mint">Recommended starting point</p>
        <p class="mt-1 text-[15px]">
          Begin at <strong>“{summary.startMission.title}”</strong>
          {#if summary.startMission.id !== ALL_MISSIONS[0].id}
            — earlier intros stay open as optional review.
          {:else}
            — the full journey from the foundations.
          {/if}
        </p>
        <p class="mt-1 text-[13px] text-muted">
          You can always adjust: every mission stays unlocked once its prerequisites are met, and
          anything skipped can be revisited.
        </p>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        <Button onclick={() => goto("/")}>Reveal my roadmap →</Button>
        <a
          href="/diagnostic"
          onclick={retake}
          class="inline-flex items-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-mint hover:text-mint"
        >
          Retake diagnostic
        </a>
      </div>
    </div>
  </div>
{:else if item}
  <div class="mx-auto max-w-2xl px-4 py-10">
    <p class="text-xs font-bold tracking-widest text-mint uppercase">
      Diagnostic · Question {index + 1} of {DIAGNOSTIC_ITEMS.length}
    </p>
    <h1 class="mt-2 text-2xl font-bold sm:text-3xl">Show what you can do</h1>
    <p class="mt-1 text-sm text-muted">
      Small practical tasks. Skip anything unfamiliar — a skip is information, not failure.
    </p>
    <div class="mt-4">
      <ProgressBar value={index + 1} max={DIAGNOSTIC_ITEMS.length} label="Diagnostic progress" />
    </div>

    <div class="mt-6 rounded-xl border border-line bg-elevated p-5 sm:p-6" aria-live="polite">
      <p class="text-[15px] font-semibold leading-relaxed">{item.prompt}</p>
      {#if item.code}
        <pre
          class="nice-scroll mt-3 overflow-x-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-[13px] leading-relaxed text-ink"
        ><code>{item.code}</code></pre>
      {/if}
      <div class="mt-4 grid gap-2" role="radiogroup" aria-label="Answer options">
        {#each item.options as opt, i}
          {@const isAnswer = revealed && i === item.answer}
          {@const isWrongPick = revealed && selected === i && i !== item.answer}
          <button
            type="button"
            role="radio"
            aria-checked={selected === i}
            disabled={revealed}
            onclick={() => choose(i)}
            class={cn(
              "rounded-lg border p-3 text-left font-mono text-[13px] transition-colors",
              !revealed && "border-line hover:border-mint",
              !revealed && selected === i && "border-mint",
              isAnswer && "border-success bg-success/10",
              isWrongPick && "border-error bg-error/10"
            )}
          >
            <span aria-hidden="true" class="mr-2 text-muted">{String.fromCharCode(65 + i)}.</span>{opt}
          </button>
        {/each}
      </div>

      {#if revealed}
        <div
          class={cn(
            "mt-4 rounded-lg border p-3 text-sm leading-relaxed",
            selected === item.answer ? "border-success/50 bg-success/5" : "border-warning/50 bg-warning/5"
          )}
        >
          <p class="font-semibold">
            {selected === item.answer ? "Correct." : "Not quite — and that's useful data."}
          </p>
          <p class="mt-1 text-muted">{item.explanation}</p>
        </div>
      {/if}

      <div class="mt-5 flex items-center justify-between border-t border-line pt-4">
        <Button variant="ghost" onclick={next}>Skip →</Button>
        <Button onclick={next} disabled={!revealed}>
          {index + 1 >= DIAGNOSTIC_ITEMS.length ? "Finish diagnostic" : "Next →"}
        </Button>
      </div>
    </div>
  </div>
{/if}
