<script lang="ts">
  import { ALL_MISSIONS, MISSION_TYPE_LABEL } from "$lib/missions";
  import { competencyById } from "$lib/curriculum";
  import { isCompleted, isMastered } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import Button from "$lib/components/Button.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import { minutesLabel, timeAgo } from "$lib/format";

  const projects = ALL_MISSIONS.filter((m) => m.type === "build" || m.type === "project");
  const inProgress = $derived(
    projects.filter((m) => progress.state.missions[m.id]?.startedAt && !isCompleted(m.id, progress.state))
  );
  const completed = $derived(projects.filter((m) => isCompleted(m.id, progress.state)));
  const untouched = $derived(
    projects.filter((m) => !progress.state.missions[m.id]?.startedAt && !isCompleted(m.id, progress.state))
  );

  let shownCode = $state<string | null>(null);
</script>

<div class="mx-auto max-w-4xl px-4 py-6 sm:py-8">
  <p class="text-xs font-bold tracking-widest text-mint uppercase">Projects</p>
  <h1 class="mt-1 text-2xl font-bold sm:text-3xl">Work that proves it</h1>
  <p class="mt-1 text-sm text-muted">
    Larger builds with requirements, test history, source, and skill evidence — the portfolio
    employers can actually inspect.
  </p>

  {#if projects.every((m) => !progress.state.missions[m.id]?.startedAt)}
    <div class="mt-4">
      <EmptyState
        title="No projects yet"
        body="Projects unlock as you move along the roadmap. The first one — site navigation — appears in Stage 1, Mission 4."
      >
        <a
          href="/"
          class="inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite"
        >
          Open the roadmap →
        </a>
      </EmptyState>
    </div>
  {/if}

  {#if inProgress.length > 0}
    <section aria-label="Projects in progress" class="mt-6">
      <h2 class="text-sm font-bold tracking-wider text-muted uppercase">In progress</h2>
      <div class="mt-2 space-y-3">
        {#each inProgress as m (m.id)}
          {@const p = progress.state.missions[m.id]}
          {@const done = isCompleted(m.id, progress.state)}
          {@const mastered = isMastered(m.id, progress.state)}
          {@const passed = p?.checksPassed.length ?? 0}
          <div class="rounded-xl border border-line bg-elevated p-4">
            <div class="flex flex-wrap items-center gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-[15px] font-bold">
                  {m.title}
                  <span class="ml-2 text-xs font-semibold text-muted">
                    {m.isBoss ? "Capstone" : "Guided build"} ·
                    {done ? (mastered ? "mastered" : "completed") : "in progress"}
                  </span>
                </p>
                <p class="truncate text-[13px] text-muted">{m.tagline}</p>
              </div>
              <a
                href={`/mission/${m.id}`}
                class="inline-flex shrink-0 items-center rounded-lg bg-mint px-3 py-1.5 text-[13px] font-semibold text-graphite hover:bg-[#6ff0cf]"
              >
                {done ? "Review →" : "Resume →"}
              </a>
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <ProgressBar value={passed} max={m.checks.length} label={done ? "Requirements met" : "Milestones"} />
                <p class="mt-1 text-xs text-muted">
                  {#if done}
                    Finished {timeAgo(p?.completedAt ?? null)} · {p?.attempts ?? 0} attempt{(p?.attempts ?? 0) === 1 ? "" : "s"} · {p?.hintsUsed ?? 0} hints
                  {:else}
                    Last worked {timeAgo(p?.startedAt ?? null)} · {p?.attempts ?? 0} checks run
                  {/if}
                </p>
              </div>
              <div class="text-xs text-muted">
                <p class="font-semibold text-ink">Evidence for</p>
                <p class="mt-0.5">{m.competencyIds.map((c) => competencyById(c)?.name).join(" · ")}</p>
              </div>
            </div>
            {#if p?.code}
              <div class="mt-3">
                <Button size="sm" variant="ghost" onclick={() => (shownCode = shownCode === m.id ? null : m.id)} aria-expanded={shownCode === m.id}>
                  {shownCode === m.id ? "Hide source snapshot" : "View source snapshot"}
                </Button>
                {#if shownCode === m.id}
                  <pre
                    class="nice-scroll mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-xs leading-relaxed"
                  ><code>{p.code}</code></pre>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if completed.length > 0}
    <section aria-label="Completed projects" class="mt-6">
      <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Completed & portfolio-ready</h2>
      <div class="mt-2 space-y-3">
        {#each completed as m (m.id)}
          {@const p = progress.state.missions[m.id]}
          {@const mastered = isMastered(m.id, progress.state)}
          {@const passed = p?.checksPassed.length ?? 0}
          <div class="rounded-xl border border-line bg-elevated p-4">
            <div class="flex flex-wrap items-center gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-[15px] font-bold">
                  {m.title}
                  <span class="ml-2 text-xs font-semibold text-muted">
                    {m.isBoss ? "Capstone" : "Guided build"} · {mastered ? "mastered" : "completed"}
                  </span>
                </p>
                <p class="truncate text-[13px] text-muted">{m.tagline}</p>
              </div>
              <a
                href={`/mission/${m.id}`}
                class="inline-flex shrink-0 items-center rounded-lg bg-mint px-3 py-1.5 text-[13px] font-semibold text-graphite hover:bg-[#6ff0cf]"
              >
                Review →
              </a>
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <ProgressBar value={passed} max={m.checks.length} label="Requirements met" />
                <p class="mt-1 text-xs text-muted">
                  Finished {timeAgo(p?.completedAt ?? null)} · {p?.attempts ?? 0} attempt{(p?.attempts ?? 0) === 1 ? "" : "s"} · {p?.hintsUsed ?? 0} hints
                </p>
              </div>
              <div class="text-xs text-muted">
                <p class="font-semibold text-ink">Evidence for</p>
                <p class="mt-0.5">{m.competencyIds.map((c) => competencyById(c)?.name).join(" · ")}</p>
              </div>
            </div>
            {#if p?.code}
              <div class="mt-3">
                <Button size="sm" variant="ghost" onclick={() => (shownCode = shownCode === m.id ? null : m.id)} aria-expanded={shownCode === m.id}>
                  {shownCode === m.id ? "Hide source snapshot" : "View source snapshot"}
                </Button>
                {#if shownCode === m.id}
                  <pre
                    class="nice-scroll mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-xs leading-relaxed"
                  ><code>{p.code}</code></pre>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if untouched.length > 0}
    <section aria-label="Upcoming projects" class="mt-6">
      <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Upcoming</h2>
      <div class="mt-2 space-y-3">
        {#each untouched as m (m.id)}
          <div class="flex items-center gap-3 rounded-xl border border-line bg-elevated p-4 opacity-70">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold">{m.title}</p>
              <p class="truncate text-xs text-muted">{MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)}</p>
            </div>
            <a
              href={`/mission/${m.id}`}
              class="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-mint hover:text-mint"
            >
              Open →
            </a>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
