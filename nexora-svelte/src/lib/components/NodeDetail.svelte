<script lang="ts">
  import type { Mission, NodeState } from "$lib/types";
  import { MISSION_TYPE_LABEL, missionById } from "$lib/missions";
  import { competencyById } from "$lib/curriculum";
  import { isCompleted, missionActionLabel } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import StatePill from "$lib/components/StatePill.svelte";
  import DifficultyDots from "$lib/components/DifficultyDots.svelte";
  import { minutesLabel } from "$lib/format";

  let {
    mission,
    nodeState,
    recommendedId,
    onClose,
  }: {
    mission: Mission;
    nodeState: NodeState;
    recommendedId: string | null;
    onClose: () => void;
  } = $props();

  let panel: HTMLDivElement | null = $state(null);

  $effect(() => {
    // Re-focus whenever a different mission is selected.
    void mission.id;
    panel?.focus();
  });

  const locked = $derived(nodeState === "locked");
  const missing = $derived(mission.prereqIds.filter((id) => !isCompleted(id, progress.state)));
</script>

<div class="rounded-xl border border-line bg-elevated p-5" role="dialog" aria-label={`Mission details: ${mission.title}`}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex: programmatic-only focus target (tabindex -1) so keyboard and screen-reader users land on freshly opened mission details -->
  <div bind:this={panel} tabindex={-1} class="outline-none">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-[11px] font-bold tracking-wider text-muted uppercase">
          {MISSION_TYPE_LABEL[mission.type]}{mission.isBoss ? " · Boss challenge" : ""}
        </p>
        <h2 class="mt-0.5 text-lg font-bold leading-snug">{mission.title}</h2>
      </div>
      <button
        onclick={onClose}
        aria-label="Close mission details"
        class="rounded-md px-2 py-1 text-lg text-muted hover:bg-elevated-2 hover:text-ink"
      >
        ×
      </button>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <StatePill state={nodeState} />
      <span class="text-xs text-muted">{minutesLabel(mission.estMinutes)} est.</span>
      <DifficultyDots level={mission.difficulty} />
    </div>

    <p class="mt-3 text-sm leading-relaxed text-muted">{mission.tagline}</p>

    <div class="mt-3 rounded-lg border border-line bg-[#0c1218] p-3 text-[13px] leading-relaxed">
      <p class="font-semibold text-ink">Why it matters</p>
      <p class="mt-0.5 text-muted">{mission.whyItMatters}</p>
    </div>

    <div class="mt-3 text-[13px]">
      <p class="font-semibold">You will be able to</p>
      <ul class="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        {#each mission.objectives as o}
          <li>{o}</li>
        {/each}
      </ul>
    </div>

    <div class="mt-3 text-[13px]">
      <p class="font-semibold">Skills</p>
      <p class="mt-0.5 text-muted">
        {mission.competencyIds.map((c) => competencyById(c)?.name ?? c).join(" · ")}
      </p>
    </div>

    {#if locked}
      <div class="mt-4 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
        <p class="font-semibold text-warning">Locked — prerequisite missing</p>
        <p class="mt-1 text-muted">
          Complete
          {#each missing as id, i}
            {#if i > 0}, {/if}<a
              href={`/mission/${id}`}
              class="font-semibold text-mint underline underline-offset-2"
              >{missionById(id)?.title ?? id}</a
            >
          {/each}
          first. Completed work stays open for review anytime.
        </p>
      </div>
    {:else}
      <div class="mt-4 flex flex-wrap gap-2">
        <a
          href={`/mission/${mission.id}`}
          class="inline-flex flex-1 items-center justify-center rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-graphite hover:bg-[#6ff0cf]"
        >
          {missionActionLabel(mission, progress.state, recommendedId)} →
        </a>
      </div>
    {/if}

    {#if nodeState === "completed" || nodeState === "mastered" || nodeState === "needs-practice"}
      <p class="mt-3 text-[13px] text-muted">
        {nodeState === "mastered"
          ? "Mastered — evidence recorded. Revisit anytime for review."
          : nodeState === "needs-practice"
            ? "Completed, but evidence suggests a refresher would convert this into mastery."
            : "Completed. Revisit to practice again or push toward mastery."}
      </p>
    {/if}
  </div>
</div>
