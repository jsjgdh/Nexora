<script lang="ts">
  import type { Mission, NodeState } from "$lib/types";
  import { MISSION_TYPE_LABEL } from "$lib/missions";
  import {
    MAP_W,
    STATE_GLYPH,
    STATE_STROKE,
    STEP_Y,
    TOP,
    nodePos,
    smoothPath,
    splitTitle,
  } from "$lib/map-style";
  import { minutesLabel } from "$lib/format";

  let {
    missions,
    nodeStates,
    selectedId,
    recommendedId,
    onSelect,
  }: {
    missions: Mission[];
    nodeStates: Record<string, NodeState>;
    selectedId: string | null;
    recommendedId: string | null;
    onSelect: (id: string | null) => void;
  } = $props();

  let focusedId = $state<string | null>(null);

  const pts = $derived(missions.map((_, i) => nodePos(i)));
  const H = $derived(TOP * 2 + (missions.length - 1) * STEP_Y);
  const completedIdx = $derived(
    missions.reduce(
      (acc, m, i) =>
        nodeStates[m.id] === "completed" || nodeStates[m.id] === "mastered" ? i : acc,
      -1
    )
  );
</script>

<div class="overflow-hidden rounded-xl border border-line bg-elevated">
  <svg
    viewBox={`0 0 ${MAP_W} ${H}`}
    class="block h-auto w-full"
    role="group"
    aria-label="Learning roadmap map. Use list view for a linear alternative."
  >
    <defs>
      <pattern id="atlas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1c2833" stroke-width="1" />
      </pattern>
    </defs>
    <rect x="0" y="0" width={MAP_W} height={H} fill="url(#atlas-grid)" />

    <path d={smoothPath(pts)} fill="none" stroke="#2a3947" stroke-width="3" stroke-linecap="round" />
    {#if completedIdx >= 0}
      <path
        d={smoothPath(pts.slice(0, completedIdx + 1))}
        fill="none"
        stroke="#55e6c1"
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray="240"
        style="animation: draw-route 1.2s ease-out both"
      />
    {/if}

    {#each missions as m, i}
      {@const p = pts[i]}
      {@const st = nodeStates[m.id]}
      {@const stroke = STATE_STROKE[st]}
      {@const isSel = selectedId === m.id}
      {@const isFocus = focusedId === m.id}
      {@const [l1, l2] = splitTitle(m.title)}
      {@const locked = st === "locked"}
      {@const boss = !!m.isBoss}
      {@const r = boss ? 34 : 26}
      {@const label = `Mission ${i + 1}: ${m.title}. State: ${st}. ${
        locked
          ? `Locked. Complete ${m.prereqIds.join(", ")} first.`
          : `${MISSION_TYPE_LABEL[m.type]}, about ${minutesLabel(m.estMinutes)}.`
      }${recommendedId === m.id ? " Recommended next step." : ""}`}
      <g
        role="button"
        tabindex={0}
        aria-label={label}
        aria-disabled={locked}
        class="cursor-pointer animate-node-pop"
        style={`animation-delay: ${Math.min(i * 60, 400)}ms`}
        transform={`translate(${p.x} ${p.y})`}
        onclick={() => onSelect(m.id)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(m.id);
          }
        }}
        onfocus={() => (focusedId = m.id)}
        onblur={() => (focusedId = null)}
        opacity={locked ? 0.65 : 1}
      >
        {#if isSel || isFocus}
          <circle r={r + 9} fill="none" stroke="#55e6c1" stroke-width="2" stroke-dasharray="5 4" />
        {/if}
        {#if recommendedId === m.id}
          <circle r={r + 5} fill="none" stroke="#55e6c1" stroke-width="1.5" opacity="0.55" />
        {/if}
        {#if boss}
          <circle r={r + 4} fill="none" stroke={stroke} stroke-width="1.5" opacity="0.7" />
        {/if}
        {#if m.type === "debugging"}
          <polygon
            points={`0,${-r} ${r},0 0,${r} ${-r},0`}
            fill="#18222b"
            stroke={stroke}
            stroke-width="2.5"
          />
        {:else if m.type === "build" || m.type === "project"}
          <rect
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            rx="10"
            fill="#18222b"
            stroke={stroke}
            stroke-width="2.5"
          />
        {:else}
          <circle r={r} fill="#18222b" stroke={stroke} stroke-width="2.5" />
        {/if}
        <text
          text-anchor="middle"
          dy="0.35em"
          font-size={boss ? 20 : 16}
          font-weight="700"
          fill={locked ? "#5c6f7d" : stroke}
          aria-hidden="true"
        >
          {locked ? "◆" : boss ? "★" : STATE_GLYPH[st] || `${i + 1}`}
        </text>
        {#if !locked && !["completed", "mastered"].includes(st)}
          <text text-anchor="middle" dy="1.9em" font-size="11" font-weight="700" fill="#a5b3bc" aria-hidden="true">
            {i + 1}
          </text>
        {/if}
        <text text-anchor="middle" y={r + 22} font-size="14" font-weight="700" fill="#f1f5f7">
          {l1}
        </text>
        {#if l2}
          <text text-anchor="middle" y={r + 39} font-size="14" font-weight="700" fill="#f1f5f7">
            {l2}
          </text>
        {/if}
        <text text-anchor="middle" y={r + (l2 ? 56 : 39)} font-size="11" fill="#a5b3bc">
          {MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)}{boss ? " · Boss" : ""}
        </text>
      </g>
    {/each}
  </svg>
</div>
