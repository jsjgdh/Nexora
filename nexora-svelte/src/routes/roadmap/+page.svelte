<script lang="ts">
  import { browser } from "$app/environment";
  import { ALL_MISSIONS, missionById, MISSION_TYPE_LABEL } from "$lib/missions";
  import {
    COMPETENCIES,
    LAYERS,
    STAGES,
    layerById,
    stageById,
    stagesInLayer,
    trackById,
  } from "$lib/curriculum";
  import type { LayerId, Mission, NodeState } from "$lib/types";
  import { continueTarget, isCompleted, isMastered, missionActionLabel, nodeStateFor, prereqsMet, recommend } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import StateWord from "$lib/components/StateWord.svelte";
  import DifficultyMark from "$lib/components/DifficultyMark.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { cn, minutesLabel } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { SITE_DESCRIPTION, SITE_TITLE } from "$lib/seo";

  function initialStage(): string {
    if (!browser) return "html";
    try {
      const saved = window.localStorage.getItem("nexora-roadmap-stage");
      if (saved && STAGES.some((s) => s.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return STAGES.find((s) => ALL_MISSIONS.some((m) => m.stageId === s.id))?.id ?? "html";
  }

  let stageId = $state(initialStage());
  let viewMode = $state<"roadmap" | "problemset">("roadmap");
  let filterDifficulty = $state<number | null>(null);
  let filterQuery = $state("");

  $effect(() => {
    if (!browser) return;
    try {
      window.localStorage.setItem("nexora-roadmap-stage", stageId);
    } catch {
      /* ignore */
    }
  });

  const rec = $derived(recommend(progress.state));
  const stage = $derived(stageById(stageId) ?? STAGES[0]);
  const layer = $derived(layerById(stage.layerId) ?? LAYERS[0]);
  const track = $derived(trackById(stage.trackId));
  const missions = $derived(ALL_MISSIONS.filter((m) => m.stageId === stage.id));

  const nodeStates = $derived.by(() => {
    const map: Record<string, NodeState> = {};
    for (const m of ALL_MISSIONS) map[m.id] = nodeStateFor(m, progress.state, rec.primaryId);
    return map;
  });

  const stageAdded = $derived(missions.filter((m) => isCompleted(m.id, progress.state)).length);
  const stageUnder = $derived(
    missions.filter((m) => {
      const p = progress.state.missions[m.id];
      return p?.startedAt && !p.completedAt;
    }).length
  );
  const toCome = $derived(missions.length - stageAdded);

  const totalCompleted = $derived(
    ALL_MISSIONS.filter((m) => isCompleted(m.id, progress.state)).length
  );
  const masteredCount = $derived(
    ALL_MISSIONS.filter((m) => isMastered(m.id, progress.state)).length
  );
  const checksPassed = $derived(
    Object.values(progress.state.missions).reduce((sum, p) => sum + p.checksPassed.length, 0)
  );
  const independent = $derived(
    Object.values(progress.state.missions).filter((p) => p.completedAt && p.independent).length
  );

  const approvedSkills = $derived(
    COMPETENCIES.filter((c) =>
      ["demonstrated", "independent", "strong"].includes(
        progress.state.competencies[c.id]?.level ?? "unseen"
      )
    )
  );

  function blockerFor(m: Mission): string {
    const shippedUnmet = (id: string) => {
      const target = missionById(id);
      return target !== undefined && !isCompleted(id, progress.state);
    };
    const unmet = m.prereqIds.filter(
      (id) => shippedUnmet(id) && !prereqsMet(missionById(id)!, progress.state)
    );
    const direct = m.prereqIds.filter(shippedUnmet);
    const id = (unmet[0] ?? direct[0]) as string | undefined;
    const title = id ? missionById(id)?.title : undefined;
    return title ? `Prerequisite: "${title}"` : "Waiting on prerequisite missions";
  }

  function jumpToStage(id: string) {
    stageId = id;
    if (browser) {
      const el = document.getElementById("stage-workspace");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }

  function jumpToLayer(id: LayerId) {
    const inLayer = stagesInLayer(id);
    const withMissions = inLayer.find((s) =>
      ALL_MISSIONS.some((m) => m.stageId === s.id)
    );
    jumpToStage((withMissions ?? inLayer[0]).id);
  }

  const restOfPath = $derived(
    LAYERS.map((l) => ({
      layer: l,
      stages: stagesInLayer(l.id).filter((s) => s.id !== stage.id),
    })).filter((entry) => entry.stages.length > 0)
  );

  function stageStats(id: string): { added: number; total: number } {
    const list = ALL_MISSIONS.filter((m) => m.stageId === id);
    return { added: list.filter((m) => isCompleted(m.id, progress.state)).length, total: list.length };
  }

  const allFilteredMissions = $derived.by(() => {
    let list = ALL_MISSIONS;
    if (filterDifficulty) list = list.filter(m => m.difficulty === filterDifficulty);
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim();
      list = list.filter(m => m.title.toLowerCase().includes(q) || m.tagline.toLowerCase().includes(q));
    }
    return list;
  });

  const nextMission = $derived(rec.primaryId ? missionById(rec.primaryId) : undefined);
</script>

<PageHead title={`Roadmap — ${SITE_TITLE}`} description={SITE_DESCRIPTION} path="/roadmap" />

<div class="border-b border-rule bg-ground pb-16">
  <!-- Hero -->
  <section class="mx-auto max-w-[1440px] px-4 pt-12 sm:px-6 lg:pt-16">
    <div class="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <h1 class="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
          Learn the path. Prove each step.
        </h1>

        <p class="mt-5 max-w-[65ch] text-base leading-relaxed text-muted sm:text-lg">
          A practical diagnostic sets your pace. Deterministic checks read the work you submit;
          completion means the stated requirements passed, not that every line is proven correct.
        </p>

        <!-- CTA Action Buttons -->
        <div class="mt-8 flex flex-wrap items-center gap-4">
          {#if !progress.state.profile.completedAt}
            <a
              href="/onboarding"
              class="inline-flex items-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold text-ground transition-colors duration-150 hover:bg-accent-bright"
            >
              <span>Start Diagnostic</span>
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          {:else if nextMission}
            <a
              href={`/mission/${nextMission.id}`}
              class="inline-flex items-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold text-ground transition-colors duration-150 hover:bg-accent-bright"
            >
              <span>Resume: {nextMission.title}</span>
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          {/if}

          <a
            href="#roadmap-section"
            class="inline-flex items-center gap-2 border border-rule bg-raised px-5 py-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:border-accent"
          >
            <span>Explore Roadmap</span>
            <svg class="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </a>
        </div>

        <!-- Orientation metrics -->
        <div class="mt-10 grid grid-cols-2 gap-4 border-t border-rule pt-6 sm:grid-cols-4">
          <div>
            <div class="num text-2xl font-bold text-white">15</div>
            <div class="mt-0.5 text-xs font-medium text-muted">Curated Stages</div>
          </div>
          <div>
            <div class="num text-2xl font-bold text-accent">100%</div>
            <div class="mt-0.5 text-xs font-medium text-muted">Deterministic Checks</div>
          </div>
          <div>
            <div class="num text-2xl font-bold text-added">Go + Web</div>
            <div class="mt-0.5 text-xs font-medium text-muted">Production Stack</div>
          </div>
          <div>
            <div class="num text-2xl font-bold text-approved">Local-First</div>
            <div class="mt-0.5 text-xs font-medium text-muted">Works 100% Offline</div>
          </div>
        </div>
      </div>

        <div class="relative">
          <div class="relative border border-rule bg-panel p-5">
            <div class="flex items-center justify-between border-b border-rule pb-3">
              <span class="num text-xs font-medium text-muted">nexora-harness :: live execution</span>
              <span class="num text-[10px] font-bold text-added">DETERMINISTIC</span>
            </div>

            <!-- Execution -->
            <div class="num mt-4 space-y-1.5 text-xs leading-relaxed">
              <div class="text-muted">&gt; main.go: compilation ok</div>
              <div class="text-muted">&gt; memory layout: optimal (0 leaks)</div>
              <div class="text-added">[3/3 Deterministic Checks Passed]</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- ROADMAP MATRIX -->
  <div class="bg-ground">
    <section id="roadmap-section" class="mx-auto max-w-[1440px] px-4 pt-12 sm:px-6">
    <h2 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">
      Roadmap Matrix
    </h2>

      <!-- View switch -->
      <div class="mt-4 flex items-center gap-3">
        <div class="inline-flex border border-rule bg-raised p-1">
          <button
            onclick={() => (viewMode = "roadmap")}
            aria-pressed={viewMode === "roadmap"}
            class={cn(
              "flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150",
              viewMode === "roadmap"
                ? "bg-accent font-bold text-ground"
                : "text-muted hover:text-white"
            )}
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span>Roadmap</span>
          </button>
          <button
            onclick={() => (viewMode = "problemset")}
            aria-pressed={viewMode === "problemset"}
            class={cn(
              "flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150",
              viewMode === "problemset"
                ? "bg-accent font-bold text-ground"
                : "text-muted hover:text-white"
            )}
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>All Missions ({ALL_MISSIONS.length})</span>
          </button>
        </div>
      </div>

    {#if viewMode === "roadmap"}
      <!-- Layer tabs: 01 Foundations / 02 Go / 03 DSA / 04 Web -->
      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each LAYERS as l, idx}
          {@const lStages = stagesInLayer(l.id)}
          {@const isCurrent = l.id === layer.id}
          {@const lMissions = ALL_MISSIONS.filter(m => lStages.some(s => s.id === m.stageId))}
          {@const lDone = lMissions.filter(m => isCompleted(m.id, progress.state)).length}
          {@const pct = lMissions.length > 0 ? Math.round((lDone / lMissions.length) * 100) : 0}

          <button
            onclick={() => jumpToLayer(l.id)}
            aria-pressed={isCurrent}
            class={cn(
              "flex flex-col border p-4 text-left transition-colors duration-150",
              isCurrent
                ? "border-accent bg-panel"
                : "border-rule bg-raised hover:border-rule-strong"
            )}
          >
            <div class="flex items-center justify-between">
              <span class="num text-xs font-bold text-muted">
                Layer {idx + 1}
              </span>
              {#if lMissions.length > 0}
                <span class="num bg-raised-2 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {lDone}/{lMissions.length}
                </span>
              {:else}
                <span class="num bg-raised px-1.5 py-0.5 text-[10px] text-faint">
                  Preview
                </span>
              {/if}
            </div>

            <span class="mt-2 text-sm font-bold text-white">
              {l.title}
            </span>
            <span class="mt-1 line-clamp-1 text-xs text-muted">
              {l.claim}
            </span>

            <div class="mt-3 h-px w-full overflow-hidden bg-rule">
              <div
                class="h-full bg-accent transition-colors duration-150"
                style={`width: ${pct}%`}
              ></div>
            </div>
          </button>
        {/each}
      </div>

      <!-- Active stage + reviewer gutter -->
      <div id="stage-workspace" class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <!-- Active stage -->
        <div class="min-w-0">
          <!-- Stage header -->
          <div class="border border-rule bg-panel p-6">
            <div class="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
              <div class="flex items-center gap-2.5">
                <span class="num border border-accent px-2 py-0.5 text-[11px] font-bold text-accent">
                  Stage {stage.num}
                </span>
                <span class="text-xs font-semibold text-white">
                  {layer.heading}
                </span>
                {#if track}
                  <span class="bg-raised-2 px-2 py-0.5 text-xs font-medium text-muted">
                    {track.name}
                  </span>
                {/if}
              </div>

              <!-- Stage counts -->
              <div class="flex items-center gap-4 text-xs font-medium">
                <span class="text-added">
                  <strong class="num text-sm">+{stageAdded}</strong> passed
                </span>
                <span class="text-review">
                  <strong class="num text-sm">{stageUnder}</strong> in review
                </span>
                <span class="text-muted">
                  <strong class="num text-sm">{toCome}</strong> remaining
                </span>
              </div>
            </div>

            <div class="mt-4">
              <h3 class="text-2xl font-bold tracking-tight text-white">
                {stage.title}
              </h3>
              <p class="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted">
                {stage.description}
              </p>
            </div>
          </div>

          <!-- Missions -->
          <div class="mt-6 space-y-3">
            {#if missions.length === 0}
              <div class="border border-rule bg-raised p-8 text-center">
                <EmptyState
                  kicker={`Stage ${stage.num} · In Development`}
                  title={`${stage.title} challenges are being authored`}
                  body={`${stage.goal} This stage will open as missions are published.`}
                >
                  <a
                    href="/mission/web-and-browsers"
                    class="mt-4 inline-flex items-center gap-2 bg-accent px-4 py-2 text-xs font-bold text-ground transition-colors duration-150 hover:bg-accent-bright"
                  >
                    Start First Active Mission
                    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </a>
                </EmptyState>
              </div>
            {:else}
              {#each missions as m, i}
                {@const st = nodeStates[m.id]}
                {@const isNext = rec.primaryId === m.id}
                {@const locked = st === "locked"}

                <div
                  class={cn(
                    "flex flex-col justify-between gap-4 border p-4 transition-colors duration-150 sm:flex-row sm:items-center",
                    isNext
                      ? "active-focus-card"
                      : locked
                      ? "border-rule bg-ground"
                        : "border-rule bg-raised hover:border-rule-strong"
                  )}
                >
                  <!-- Mission info -->
                  <div class="flex min-w-0 items-start gap-3.5">
                    <div class="flex shrink-0 flex-col items-center">
                      <span
                        class={cn(
                          "num grid h-7 w-7 place-items-center border text-xs font-bold",
                          isNext ? "border-accent text-accent" : "border-rule bg-raised-2 text-muted"
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        {#if locked}
                          <span class="text-base font-bold text-muted">
                            {m.title}
                          </span>
                        {:else}
                          <a
                            href={`/mission/${m.id}`}
                            class="truncate text-base font-bold text-white transition-colors duration-150 hover:text-accent"
                          >
                            {m.title}
                          </a>
                        {/if}

                        <span class="num bg-raised-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          {MISSION_TYPE_LABEL[m.type] ?? m.type}
                        </span>

                        {#if m.isBoss}
                          <span class="num border border-removed px-1.5 py-0.5 text-[10px] font-bold text-removed">
                            Boss Challenge
                          </span>
                        {/if}
                      </div>

                      <p class="mt-1 line-clamp-1 text-xs text-muted">
                        {locked ? blockerFor(m) : m.tagline}
                      </p>

                      <div class="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                        <DifficultyMark level={m.difficulty} />
                        <span class="text-faint">·</span>
                        <span class="num text-[11px] text-faint">{minutesLabel(m.estMinutes)}</span>
                        {#if m.language}
                          <span class="text-faint">·</span>
                          <span class="num border border-rule px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                            {m.language}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- Mission action -->
                  <div class="flex shrink-0 items-center gap-3 self-end sm:self-center">
                    <StateWord state={st} />

                    {#if isNext}
                      <a
                        href={`/mission/${m.id}`}
                        class="inline-flex items-center gap-1.5 bg-accent px-3.5 py-1.5 text-xs font-bold text-ground transition-colors duration-150 hover:bg-accent-bright"
                      >
                        <span>{missionActionLabel(m, progress.state, rec.primaryId)}</span>
                        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </a>
                    {:else if !locked}
                      <a
                        href={`/mission/${m.id}`}
                        class="border border-rule bg-raised-2 px-3 py-1.5 text-xs font-semibold text-muted transition-colors duration-150 hover:border-accent hover:text-accent"
                      >
                        {isCompleted(m.id, progress.state) ? "Review" : "Launch"}
                      </a>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Other stages -->
          <div class="mt-12">
            <div class="flex items-center justify-between border-b border-rule pb-3">
              <h3 class="text-sm font-bold text-white">
                Other Stages on Your Path
              </h3>
              <span class="text-xs text-faint">Select any stage to inspect curriculum</span>
            </div>

            <div class="mt-4 space-y-4">
              {#each restOfPath as entry (entry.layer.id)}
                <div class="border border-rule bg-raised p-4">
                  <div class="mb-3 flex items-center justify-between border-b border-rule pb-2">
                    <span class="num text-[11px] font-bold text-accent">
                      {entry.layer.title}
                    </span>
                    <span class="num text-xs text-faint">
                      {entry.stages.length} stage{entry.stages.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div class="grid gap-2 sm:grid-cols-2">
                    {#each entry.stages as s (s.id)}
                      {@const stats = stageStats(s.id)}
                      <button
                        onclick={() => jumpToStage(s.id)}
                        aria-pressed={stage.id === s.id}
                        class="flex items-center justify-between gap-3 border border-rule bg-panel p-3 text-left transition-colors duration-150 hover:border-rule-strong"
                      >
                        <div class="min-w-0">
                          <span class="block truncate text-xs font-bold text-white">
                            Stage {s.num} · {s.title}
                          </span>
                          <span class="mt-0.5 block truncate text-[11px] text-muted">
                            {s.goal}
                          </span>
                        </div>
                        <span class="num shrink-0 bg-raised-2 px-1.5 py-0.5 text-[10px] text-muted">
                          {#if stats.total === 0}
                            Preview
                          {:else}
                            {stats.added}/{stats.total}
                          {/if}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Reviewer command gutter -->
        <aside aria-label="Reviewer command gutter" class="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <!-- Next recommended change -->
          <div class="active-focus-card p-5">
            <div class="flex items-center justify-between">
              <span class="num text-[11px] font-bold text-accent">
                Next Recommended Change
              </span>
              <span class="num text-xs text-muted">
                {totalCompleted}/{ALL_MISSIONS.length}
              </span>
            </div>

            {#if nextMission}
              <div class="mt-4">
                <h4 class="text-lg font-bold text-white">
                  {nextMission.title}
                </h4>
                <p class="mt-1.5 max-w-[65ch] text-xs leading-relaxed text-muted">
                  {rec.reason}
                </p>

                <a
                  href={`/mission/${nextMission.id}`}
                  class="mt-4 flex w-full items-center justify-center gap-2 bg-accent py-2.5 text-xs font-bold text-ground transition-colors duration-150 hover:bg-accent-bright"
                >
                  <span>Launch Next Challenge</span>
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              </div>
            {:else}
              {@const target = continueTarget(progress.state)}
              <div class="mt-4">
                <h4 class="text-base font-bold text-white">
                  {target.href === "/projects" ? "All Authored Missions Complete!" : target.detail}
                </h4>
                <p class="mt-1 text-xs text-muted">{rec.reason}</p>
                <a
                  href={target.href}
                  class="mt-4 flex w-full items-center justify-center gap-2 border border-accent py-2.5 text-xs font-bold text-accent transition-colors duration-150"
                >
                  {target.label}
                </a>
              </div>
            {/if}
          </div>

          <!-- Evidence ledger -->
          <div class="border border-rule bg-panel p-5">
            <h4 class="num border-b border-rule pb-2.5 text-[11px] font-bold text-white">
              Verified Evidence Ledger
            </h4>

            <div class="mt-4 space-y-3">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Checks Passed</span>
                <span class="num text-sm font-bold text-added">+{checksPassed}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Independent Runs</span>
                <span class="num text-sm font-bold text-white">{independent}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Mastered</span>
                <span class="num text-sm font-bold text-approved">{masteredCount}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">Active Study Days</span>
                <span class="num text-sm font-bold text-review">{progress.state.activeDays.length || 1}d</span>
              </div>
            </div>
          </div>

          <!-- Verified skills -->
          <div class="border border-rule bg-panel p-5">
            <div class="flex items-center justify-between border-b border-rule pb-2.5">
              <h4 class="num text-[11px] font-bold text-white">
                Skills Verified ({approvedSkills.length})
              </h4>
              <a href="/skills" class="inline-flex items-center gap-1 text-[11px] font-semibold text-accent transition-colors duration-150 hover:text-white">
                <span>View Graph</span>
                <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </div>

            {#if approvedSkills.length > 0}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable region lets keyboard users scroll the verified skills -->
              <div class="nice-scroll mt-3 max-h-56 overflow-y-auto pr-1" role="region" aria-label="Verified skills" tabindex="0">
                <ul class="divide-y divide-rule">
                  {#each approvedSkills as c (c.id)}
                    <li class="flex items-center justify-between py-2 text-xs">
                      <span class="truncate text-white">{c.name}</span>
                      <span class="num border border-approved px-1.5 py-0.5 text-[10px] font-bold text-approved">
                        {progress.state.competencies[c.id]?.level ?? "approved"}
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {:else}
              <p class="mt-3 text-xs leading-relaxed text-muted">
                No verified competencies stamped yet. Pass missions without relying on hints to prove independent engineering skill.
              </p>
            {/if}
          </div>
        </aside>
      </div>
    {:else}
      <!-- Mission directory -->
      <div class="border border-rule bg-panel p-6">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
          <input
            type="text"
            bind:value={filterQuery}
            aria-label="Filter missions"
            placeholder="Filter missions"
            class="h-9 w-64 border border-control bg-raised px-3 text-xs text-white placeholder:text-faint transition-colors duration-150 focus:border-accent"
          />

          <div class="flex items-center gap-2" role="group" aria-label="Filter by difficulty">
            <button
              onclick={() => (filterDifficulty = null)}
              aria-pressed={filterDifficulty === null}
              class={cn(
                "px-2.5 py-1 text-xs font-bold transition-colors duration-150",
                filterDifficulty === null ? "bg-accent text-ground" : "bg-raised-2 text-muted hover:text-white"
              )}
            >
              All
            </button>
            <button
              onclick={() => (filterDifficulty = 1)}
              aria-pressed={filterDifficulty === 1}
              class={cn(
                "px-2.5 py-1 text-xs font-bold transition-colors duration-150",
                filterDifficulty === 1 ? "bg-added text-ground" : "bg-raised-2 text-added"
              )}
            >
              Easy
            </button>
            <button
              onclick={() => (filterDifficulty = 3)}
              aria-pressed={filterDifficulty === 3}
              class={cn(
                "px-2.5 py-1 text-xs font-bold transition-colors duration-150",
                filterDifficulty === 3 ? "bg-review text-ground" : "bg-raised-2 text-review"
              )}
            >
              Medium
            </button>
            <button
              onclick={() => (filterDifficulty = 5)}
              aria-pressed={filterDifficulty === 5}
              class={cn(
                "px-2.5 py-1 text-xs font-bold transition-colors duration-150",
                filterDifficulty === 5 ? "bg-removed text-ground" : "bg-raised-2 text-removed"
              )}
            >
              Hard
            </button>
          </div>
        </div>

        <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable region lets keyboard users scroll the roadmap table -->
        <div class="nice-scroll mt-4 overflow-x-auto" role="region" aria-label="Roadmap overview" tabindex="0">
          <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
            Showing {allFilteredMissions.length}
            {allFilteredMissions.length === 1 ? "mission" : "missions"} of {ALL_MISSIONS.length}.
            {filterDifficulty ? ` Difficulty ${filterDifficulty} selected.` : ""}
            {filterQuery.trim() ? ` Matching ${filterQuery.trim()}.` : ""}
          </p>
          {#if allFilteredMissions.length === 0}
            <div class="p-6 text-center">
              <p class="text-sm font-semibold text-ink">No missions match these filters.</p>
              <p class="mt-1 text-xs text-muted">Try another title or difficulty.</p>
              <button
                class="mt-3 border border-rule px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-ink"
                onclick={() => {
                  filterQuery = "";
                  filterDifficulty = null;
                }}
              >
                Clear filters
              </button>
            </div>
          {:else}
          <table class="w-full text-left text-xs">
            <caption class="sr-only">Mission status, difficulty, stage, estimated time, and actions</caption>
            <thead>
              <tr class="num border-b border-rule text-[11px] text-faint">
                <th class="px-3 py-3">STATUS</th>
                <th class="px-3 py-3">TITLE</th>
                <th class="px-3 py-3">DIFFICULTY</th>
                <th class="px-3 py-3">STAGE</th>
                <th class="px-3 py-3">TIME</th>
                <th class="px-3 py-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-rule">
              {#each allFilteredMissions as m}
                {@const st = nodeStates[m.id]}
                {@const s = stageById(m.stageId)}
                <tr class="transition-colors duration-150 hover:bg-raised">
                  <td class="px-3 py-3">
                    <StateWord state={st} />
                  </td>
                  <td class="px-3 py-3">
                    <a href={`/mission/${m.id}`} class="font-semibold text-white transition-colors duration-150 hover:text-accent">
                      {m.title}
                    </a>
                    <span class="block max-w-md truncate text-[11px] text-muted">{m.tagline}</span>
                  </td>
                  <td class="px-3 py-3">
                    <DifficultyMark level={m.difficulty} />
                  </td>
                  <td class="num px-3 py-3 text-muted">
                    {s ? `Stage ${s.num}: ${s.title}` : m.stageId}
                  </td>
                  <td class="num px-3 py-3 text-muted">
                    {minutesLabel(m.estMinutes)}
                  </td>
                  <td class="px-3 py-3 text-right">
                    <a
                      href={`/mission/${m.id}`}
                      class="inline-flex items-center gap-1 bg-raised-2 px-2.5 py-1 font-semibold text-muted transition-colors duration-150 hover:bg-accent hover:text-ground"
                    >
                      <span>Open</span>
                      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          {/if}
        </div>
      </div>
    {/if}
    </section>
  </div>
