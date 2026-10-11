<script lang="ts">
  import { goto } from "$app/navigation";
  import { tick } from "svelte";
  import { progress } from "$lib/store.svelte";
  import {
    DIAGNOSTIC_ITEMS,
    placementExplanation,
    placementStartMissionId,
    type DiagnosticProbe,
  } from "$lib/diagnostic";
  import { ALL_MISSIONS, missionById } from "$lib/missions";
  import { competencyById, layerById, stageById } from "$lib/curriculum";
  import type { DiagnosticResult } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import ProgressRule from "$lib/components/ProgressRule.svelte";
  import { cn } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  let index = $state(0);
  let questionHeading = $state<HTMLHeadingElement | null>(null);
  let selected = $state<number | null>(null);
  let results = $state<DiagnosticResult[]>([]);
  let done = $state(progress.state.diagnostic.completedAt !== null);

  const item = $derived(DIAGNOSTIC_ITEMS[index]);
  const revealed = $derived(selected !== null);

  function choose(i: number) {
    selected = i;
  }

  function moveAnswer(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const radios = Array.from(event.currentTarget instanceof HTMLElement
      ? event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
      : []);
    const current = radios.indexOf(event.currentTarget as HTMLElement);
    if (!radios.length || current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? radios.length - 1
      : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + radios.length) % radios.length;
    radios[next].focus();
    choose(next);
  }

  async function next() {
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
    await tick();
    questionHeading?.focus();
  }

  const summary = $derived.by(() => {
    if (!done) return null;
    const finalResults =
      results.length === DIAGNOSTIC_ITEMS.length ? results : progress.state.diagnostic.results;
    const probes: DiagnosticProbe[] = DIAGNOSTIC_ITEMS.map((d) => {
      const r = finalResults.find((x) => x.itemId === d.id);
      return { itemId: d.id, correct: r?.correct ?? false, skipped: !r || r.skipped };
    });
    const startId = placementStartMissionId(probes);
    const startMission = missionById(startId) ?? ALL_MISSIONS[0];
    const startStage = stageById(startMission.stageId);
    const placedLayer = startStage ? layerById(startStage.layerId) : undefined;
    const correct = finalResults.filter((r) => r.correct).length;
    const skipped = finalResults.filter((r) => r.skipped).length;
    return {
      finalResults,
      startMission,
      startStage,
      placedLayer,
      correct,
      skipped,
      explanation: placementExplanation(probes),
    };
  });

  function retake(e: MouseEvent) {
    e.preventDefault();
    done = false;
    index = 0;
    results = [];
    selected = null;
  }

  /** Which layer a question probes, printed on the card so the learner knows why it is asked. */
  function layerTag(id: string): string {
    const i = DIAGNOSTIC_ITEMS.find((d) => d.id === id);
    const layer = layerById(i?.layerId ?? "application");
    return layer?.title ?? "Application";
  }
</script>

<PageHead
  title={pageTitle("Diagnostic")}
  description="A short practical diagnostic — predict what code does. It places you on the path and waives the prerequisites you have already demonstrated."
  path="/diagnostic"
/>

{#if done && summary}
  <div class="mx-auto max-w-3xl px-4 py-10">
    <p class="stamp text-accent">diagnostic complete</p>
    <h1 bind:this={questionHeading} tabindex="-1" class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
      Here is where your path begins
    </h1>

    <div class="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-rule py-3">
      <div>
        <p class="stamp text-faint">answered correctly</p>
        <p class="num mt-0.5 text-[20px] text-added">
          {summary.correct}<span class="text-[13px] text-muted">/{DIAGNOSTIC_ITEMS.length}</span>
        </p>
      </div>
      {#if summary.skipped > 0}
        <div>
          <p class="stamp text-faint">skipped</p>
          <p class="num mt-0.5 text-[20px] text-muted">{summary.skipped}</p>
        </div>
      {/if}
      <div>
        <p class="stamp text-faint">starting layer</p>
        <p class="mt-0.5 text-[15px] text-ink">{summary.placedLayer?.title}</p>
      </div>
      <div>
        <p class="stamp text-faint">starting stage</p>
        <p class="num mt-0.5 text-[15px] text-ink">stage {summary.startStage?.num}</p>
      </div>
    </div>

    <p class="mt-3 text-[12px] text-faint">
      A skip is information, not failure — it routes you to the material that teaches it rather
      than to a guess.
    </p>

    <ul class="mt-6 border-t border-rule">
      {#each summary.finalResults as r (r.itemId)}
        {@const d = DIAGNOSTIC_ITEMS.find((x) => x.id === r.itemId)!}
        {@const comp = competencyById(d.competencyId)}
        <li
          class={cn(
            "border-b border-rule border-l px-3 py-2.5",
            r.correct ? "border-l-added" : r.skipped ? "border-l-rule-strong" : "border-l-review"
          )}
        >
          <p class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              aria-hidden="true"
              class={cn(
                "num text-[12px]",
                r.correct ? "text-added" : r.skipped ? "text-faint" : "text-review"
              )}
            >
              {r.correct ? "+" : r.skipped ? "." : "-"}
            </span>
            <span class="text-[14px] font-medium text-ink">{d.skill}</span>
            <span class="stamp text-faint">{comp?.name}</span>
            <span class="stamp ml-auto text-faint">{layerTag(d.id)}</span>
          </p>
          <p class="mt-1 pl-5 text-[12px] leading-relaxed text-muted">
            {r.skipped ? "Skipped — the foundations stage builds this from zero." : d.explanation}
          </p>
        </li>
      {/each}
    </ul>

    <div class="thread mt-7">
      <p class="stamp text-accent">requested change</p>
      <p class="mt-2 text-[16px] font-semibold text-ink">
        Start at “{summary.startMission.title}”
      </p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{summary.explanation}</p>
      <p class="mt-2 text-[13px] leading-relaxed text-muted">
        Nothing is locked away: every mission before your starting point stays open as optional
        review, and you can retake this at any time.
      </p>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <Button onclick={() => goto("/roadmap")}>Open my roadmap</Button>
      <a
        href="/diagnostic"
        onclick={retake}
        class="inline-flex items-center border border-rule px-4 py-2 text-[13px] font-medium text-ink hover:border-accent hover:text-accent"
      >
        Retake the diagnostic
      </a>
    </div>
  </div>
{:else if item}
  <div class="mx-auto max-w-3xl px-4 py-10">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="stamp text-accent">diagnostic</p>
      <p class="num text-[12px] text-faint">
        question {String(index + 1).padStart(2, "0")} / {String(DIAGNOSTIC_ITEMS.length).padStart(2, "0")}
      </p>
    </div>
    <h1 bind:this={questionHeading} tabindex="-1" class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
      Show what you can already do
    </h1>
    <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
      Practical questions, not self-ratings. Where you are unsure, skip it — that tells us where
      to start, which is the entire point of asking.
    </p>
    <div class="mt-5">
      <ProgressRule
        value={index + 1}
        max={DIAGNOSTIC_ITEMS.length}
        label="diagnostic progress"
      />
    </div>

    <div class="mt-6 border border-rule" aria-live="polite">
      <div class="flex items-baseline justify-between gap-3 border-b border-rule bg-raised px-3 py-1.5">
        <span class="stamp text-faint">{layerTag(item.id)} layer</span>
        <span class="stamp text-faint">{competencyById(item.competencyId)?.name}</span>
      </div>
      <div class="px-3 py-4 sm:px-4">
        <p class="text-[15px] leading-relaxed font-medium text-ink">{item.prompt}</p>
        {#if item.code}
          <pre
            class="nice-scroll mt-3 overflow-x-auto border border-rule bg-raised p-3 font-mono text-[13px] leading-relaxed text-ink"><code
              >{item.code}</code
            ></pre>
        {/if}
        <div class="mt-4 border-t border-rule" role="radiogroup" aria-label="Answer options">
          {#each item.options as opt, i (i)}
            {@const isAnswer = revealed && i === item.answer}
            {@const isWrongPick = revealed && selected === i && i !== item.answer}
            <button
              type="button"
              role="radio"
              aria-checked={selected === i}
              aria-disabled="false"
              tabindex={selected === i || (selected === null && i === 0) ? 0 : -1}
              onkeydown={moveAnswer}
              onclick={() => choose(i)}
              class={cn(
                "flex w-full items-baseline gap-2.5 border-b border-rule px-2 py-2.5 text-left font-mono text-[13px] leading-relaxed",
                !revealed && "cursor-pointer hover:bg-raised",
                isAnswer && "bg-added/[0.08] text-added",
                isWrongPick && "bg-removed/[0.08] text-removed",
                !isAnswer && !isWrongPick && "text-muted"
              )}
            >
              <span aria-hidden="true" class="shrink-0">
                {isAnswer ? "+" : isWrongPick ? "-" : selected === i ? ">" : " "}
              </span>
              <span class="min-w-0">{opt}</span>
            </button>
          {/each}
        </div>

        {#if revealed}
          <div class="thread mt-4">
            <p class="stamp {selected === item.answer ? 'text-added' : 'text-review'}">
              {selected === item.answer ? "correct" : "not quite — useful data either way"}
            </p>
            <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{item.explanation}</p>
          </div>
        {/if}

        <div class="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" onclick={next}>Skip this one</Button>
          <Button onclick={next} disabled={!revealed}>
            {index + 1 >= DIAGNOSTIC_ITEMS.length ? "Finish diagnostic" : "Next question"}
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}
