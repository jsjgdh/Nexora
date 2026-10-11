<script lang="ts">
  import { browser } from "$app/environment";
  import { ALL_MISSIONS, MISSION_TYPE_LABEL, missionById } from "$lib/missions";
  import { STAGES, competencyById } from "$lib/curriculum";
  import type { Mission, NodeState } from "$lib/types";
  import {
    continueTarget,
    isCompleted,
    missionActionLabel,
    nodeStateFor,
    recommend,
  } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import { STATE_STROKE } from "$lib/map-style";
  import Button from "$lib/components/Button.svelte";
  import StatePill from "$lib/components/StatePill.svelte";
  import DifficultyDots from "$lib/components/DifficultyDots.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import MapCanvas from "$lib/components/MapCanvas.svelte";
  import NodeDetail from "$lib/components/NodeDetail.svelte";
  import { cn, minutesLabel } from "$lib/format";

  function initialStage(): string {
    if (!browser) return "html";
    try {
      const saved = window.localStorage.getItem("nexora-roadmap-stage");
      if (saved && STAGES.some((s) => s.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return "html";
  }

  let stageId = $state(initialStage());
  let view = $state<"map" | "list">("map");
  let selectedId = $state<string | null>(null);

  $effect(() => {
    if (!browser) return;
    try {
      window.localStorage.setItem("nexora-roadmap-stage", stageId);
    } catch {
      /* ignore */
    }
  });

  const rec = $derived(recommend(progress.state));
  const target = $derived(continueTarget(progress.state));
  const stage = $derived(STAGES.find((s) => s.id === stageId) ?? STAGES[0]);
  const missions = $derived(ALL_MISSIONS.filter((m) => m.stageId === stage.id));
  const nodeStates = $derived.by(() => {
    const map: Record<string, NodeState> = {};
    for (const m of missions) map[m.id] = nodeStateFor(m, progress.state, rec.primaryId);
    return map;
  });
  const doneCount = $derived(missions.filter((m) => isCompleted(m.id, progress.state)).length);
  const skillsDemonstrated = $derived(
    Object.values(progress.state.competencies).filter((c) =>
      ["demonstrated", "independent", "strong"].includes(c.level)
    ).length
  );
  const selected = $derived(selectedId ? missionById(selectedId) : undefined);
</script>

<div class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
  {#if !progress.loaded}
    <div class="py-10" aria-busy="true" aria-label="Loading roadmap">
      <div class="h-8 w-64 animate-pulse rounded bg-elevated-2"></div>
      <div class="mt-4 h-96 animate-pulse rounded-xl bg-elevated"></div>
    </div>
  {:else}
    <p class="text-xs font-bold tracking-widest text-mint uppercase">Your learning journey</p>
    <div class="mt-1 flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-2xl font-bold sm:text-[32px] sm:leading-tight">
        From the basics to building for real.
      </h1>
      <p class="text-sm text-muted">Stage {stage.num} of {STAGES.length} · {stage.title}</p>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
      <div class="rounded-xl border border-line bg-elevated p-4">
        <p class="text-xs font-semibold tracking-wider text-muted uppercase">Current stage</p>
        <p class="mt-1 text-lg font-bold leading-snug">{stage.title}</p>
        <p class="text-sm text-muted">{doneCount} of {missions.length} missions</p>
      </div>
      <div class="rounded-xl border border-line bg-elevated p-4">
        <p class="text-xs font-semibold tracking-wider text-muted uppercase">Skill evidence</p>
        <p class="mt-1 text-xl font-bold">{skillsDemonstrated} skills</p>
        <p class="text-sm text-muted">demonstrated</p>
      </div>
      <div class="rounded-xl border border-line bg-elevated p-4">
        <p class="text-xs font-semibold tracking-wider text-muted uppercase">Experience</p>
        <p class="mt-1 text-xl font-bold">{progress.state.xp} XP</p>
        <p class="text-sm text-muted">{progress.state.activeDays.length}d active · breaks are free</p>
      </div>
      <div class="rounded-xl border border-mint/30 bg-mint/[0.04] p-4">
        <p class="text-xs font-semibold tracking-wider text-mint uppercase">
          {rec.primaryId ? "Recommended" : target.label}
        </p>
        <p class="mt-1 truncate text-[15px] font-bold">{target.detail}</p>
        <div class="mt-2">
          <a
            href={target.href}
            class="inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
          >
            {rec.primaryId
              ? `${missionActionLabel(missionById(rec.primaryId)!, progress.state, rec.primaryId)} →`
              : `${target.label} →`}
          </a>
        </div>
      </div>
    </div>

    {#if !progress.state.profile.completedAt}
      <div class="mt-3 rounded-xl border border-warning/50 bg-warning/5 p-4 text-sm">
        <strong>New here?</strong> The map below is the whole Web Development journey.
        <a href="/onboarding" class="font-semibold text-mint underline underline-offset-2">
          Start the 2-minute onboarding
        </a>
        to get a personalized starting point.
      </div>
    {/if}

    <div class="mt-6 flex items-center justify-between gap-2">
      <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Stages</h2>
      <div class="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Map or list view">
        {#each ["map", "list"] as v}
          <button
            role="tab"
            aria-selected={view === v}
            onclick={() => (view = v as "map" | "list")}
            class={cn(
              "rounded-md px-3 py-1 text-[13px] font-semibold capitalize",
              view === v ? "bg-elevated-2 text-mint" : "text-muted hover:text-ink"
            )}
          >
            {v}
          </button>
        {/each}
      </div>
    </div>
    <div class="nice-scroll mt-2 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Curriculum stages">
      {#each STAGES as s}
        {@const sMissions = ALL_MISSIONS.filter((m) => m.stageId === s.id)}
        {@const sDone = sMissions.filter((m) => isCompleted(m.id, progress.state)).length}
        <button
          role="tab"
          aria-selected={stageId === s.id}
          onclick={() => {
            stageId = s.id;
            selectedId = null;
          }}
          class={cn(
            "min-w-[150px] shrink-0 rounded-xl border p-3 text-left transition-colors",
            stageId === s.id ? "border-mint bg-mint/[0.06]" : "border-line bg-elevated hover:border-muted"
          )}
        >
          <span class="text-[11px] font-bold tracking-wider text-muted uppercase">Stage {s.num}</span>
          <span class="block truncate text-sm font-bold">{s.title}</span>
          <span class="mt-1 block text-xs text-muted">
            {sMissions.length > 0 ? `${sDone}/${sMissions.length} done` : "Coming next"}
          </span>
        </button>
      {/each}
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
      <div>
        {#if missions.length === 0}
          <EmptyState
            title={`Stage ${stage.num} · ${stage.title} — in preparation`}
            body={`${stage.description} Complete the earlier stages to unlock the path forward. The full ten-stage journey stays visible so you always know where you're headed.`}
          >
            <Button onclick={() => (stageId = "html")}>Back to Stage 1 →</Button>
          </EmptyState>
        {:else if view === "map"}
          <MapCanvas
            {missions}
            {nodeStates}
            {selectedId}
            recommendedId={rec.primaryId}
            onSelect={(id) => (selectedId = id)}
          />
        {:else}
          <ol class="space-y-2">
            {#each missions as m, i}
              {@const st = nodeStates[m.id]}
              {@const locked = st === "locked"}
              <li>
                <div
                  class={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    locked ? "border-line bg-elevated/60" : "border-line bg-elevated"
                  )}
                >
                  <span
                    aria-hidden="true"
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold"
                    style:border-color={STATE_STROKE[st]}
                    style:color={STATE_STROKE[st]}
                  >
                    {locked ? "◆" : i + 1}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold">{m.title}</p>
                    <p class="truncate text-xs text-muted">
                      {MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)} · {m.tagline}
                    </p>
                  </div>
                  <StatePill state={st} />
                  {#if locked}
                    <Button size="sm" variant="outline" onclick={() => (selectedId = m.id)}>
                      Why locked?
                    </Button>
                  {:else}
                    <a
                      href={`/mission/${m.id}`}
                      class="inline-flex shrink-0 items-center rounded-lg bg-mint px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-graphite hover:bg-[#6ff0cf]"
                    >
                      {missionActionLabel(m, progress.state, rec.primaryId)} →
                    </a>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        {/if}
        {#if view === "map" && missions.length > 0}
          <p class="mt-2 text-xs text-muted">
            List view offers the same nodes, states, and actions in screen-reader order — toggle
            above anytime.
          </p>
        {/if}
      </div>

      <div aria-live="polite">
        {#if selected}
          <NodeDetail
            mission={selected}
            nodeState={nodeStates[selected.id] ?? "locked"}
            recommendedId={rec.primaryId}
            onClose={() => (selectedId = null)}
          />
        {:else}
          <div class="rounded-xl border border-line bg-elevated p-5">
            <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Recommended</h2>
            {#if rec.primaryId}
              {@const next = missionById(rec.primaryId)}
              {#if next}
                <p class="mt-2 text-[15px] font-bold">{next.title}</p>
                <p class="mt-1 text-sm leading-relaxed text-muted">{rec.reason}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/mission/${rec.primaryId}`}
                    class="inline-flex items-center rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
                  >
                    {missionActionLabel(next, progress.state, rec.primaryId)} →
                  </a>
                  <Button variant="outline" size="sm" onclick={() => (selectedId = rec.primaryId)}>
                    Preview
                  </Button>
                </div>
              {/if}
            {:else}
              <p class="mt-2 text-[15px] font-bold">Journey complete</p>
              <p class="mt-1 text-sm leading-relaxed text-muted">{rec.reason}</p>
              <div class="mt-3">
                <a
                  href="/projects"
                  class="inline-flex items-center rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
                >
                  View portfolio →
                </a>
              </div>
            {/if}
            <div class="mt-4 border-t border-line pt-3 text-[13px] text-muted">
              <p class="font-semibold text-ink">How recommendation works</p>
              <p class="mt-1 leading-relaxed">
                Prerequisites first, then your diagnostic starting point, then demonstrated
                performance. Rules are fixed and inspectable — never a black box.
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
