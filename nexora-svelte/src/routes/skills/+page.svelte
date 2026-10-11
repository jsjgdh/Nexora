<script lang="ts">
  import { progress } from "$lib/store.svelte";
  import { COMPETENCIES } from "$lib/curriculum";
  import { ALL_MISSIONS } from "$lib/missions";
  import type { Proficiency } from "$lib/types";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { cn } from "$lib/format";

  const LEVEL_META: Record<Proficiency, { label: string; glyph: string; cls: string }> = {
    unseen: { label: "Unseen", glyph: "○", cls: "border-line text-muted" },
    introduced: { label: "Introduced", glyph: "◔", cls: "border-line text-muted" },
    practiced: { label: "Practiced", glyph: "◐", cls: "border-warning/60 text-warning" },
    demonstrated: { label: "Demonstrated", glyph: "●", cls: "border-success/60 text-success" },
    independent: { label: "Independent", glyph: "★", cls: "border-success bg-success/10 text-success" },
    strong: { label: "Strong evidence", glyph: "★★", cls: "border-mint bg-mint/10 text-mint" },
  };

  const domains = (() => {
    const map = new Map<string, typeof COMPETENCIES>();
    for (const c of COMPETENCIES) {
      const list = map.get(c.domain) ?? [];
      list.push(c);
      map.set(c.domain, list);
    }
    return [...map.entries()];
  })();

  const anyEvidence = $derived(
    Object.values(progress.state.competencies).some((c) => c.level !== "unseen")
  );

  let passed = $state(false);
  let varied = $state(false);
  const proof = $derived(
    passed && varied
      ? { glyph: "★", label: "Mastered", cls: "text-mint", note: "A new context, no hints. That counts as evidence." }
      : varied
        ? { glyph: "○", label: "Almost", cls: "text-ink", note: "Pass the mission checks first — then prove it unaided." }
        : passed
          ? { glyph: "✓", label: "Completed", cls: "text-success", note: "Done. A similar unaided challenge is scheduled to confirm it." }
          : { glyph: "○", label: "In progress", cls: "text-muted", note: "Tick a box to see how status changes with evidence." }
  );
</script>

<div class="mx-auto max-w-4xl px-4 py-6 sm:py-8">
  <p class="text-xs font-bold tracking-widest text-mint uppercase">Skills & evidence</p>
  <h1 class="mt-1 text-2xl font-bold sm:text-3xl">Competence, not activity</h1>
  <p class="mt-1 text-sm text-muted">
    Every level is backed by assessed work — attempts, projects, and independent challenges.
    Opening lessons or earning XP never moves these on their own.
  </p>

  <div class="mt-4 rounded-xl border border-line bg-elevated p-4 sm:p-5" aria-label="Demonstration: completed versus mastered">
    <h2 class="text-[15px] font-bold">Finished is not the same as proven.</h2>
    <div class="mt-3 space-y-2">
      <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          bind:checked={passed}
          class="h-5 w-5 shrink-0 cursor-pointer accent-[#55e6c1]"
        />
        I passed the checks on this mission
      </label>
      <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-[#0c1218] px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          bind:checked={varied}
          class="h-5 w-5 shrink-0 cursor-pointer accent-[#55e6c1]"
        />
        I solved a new variation, with no hints
      </label>
    </div>
    <div class="mt-3 rounded-lg border border-line bg-[#0c1218] p-3" aria-live="polite">
      <p class={cn("text-xl font-bold", proof.cls)}>
        <span aria-hidden="true">{proof.glyph} </span>{proof.label}
      </p>
      <p class="mt-0.5 text-[13px] text-muted">{proof.note}</p>
    </div>
  </div>

  {#if !anyEvidence}
    <div class="mt-4">
      <EmptyState
        title="No skill evidence yet"
        body="Evidence is earned by completing missions and the onboarding diagnostic. Start with the recommended mission on your roadmap."
      >
        <a href="/" class="inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-graphite">
          Open the roadmap →
        </a>
      </EmptyState>
    </div>
  {/if}

  <div class="mt-6 space-y-6">
    {#each domains as [domain, comps]}
      <section aria-label={domain}>
        <h2 class="text-sm font-bold tracking-wider text-muted uppercase">{domain}</h2>
        <div class="mt-2 grid gap-3 md:grid-cols-2">
          {#each comps as c}
            {@const ev = progress.state.competencies[c.id]}
            {@const meta = LEVEL_META[ev?.level ?? "unseen"]}
            {@const improvers = ALL_MISSIONS.filter(
              (m) => m.competencyIds.includes(c.id) && !progress.state.missions[m.id]?.completedAt
            ).slice(0, 2)}
            <div class="rounded-xl border border-line bg-elevated p-4">
              <div class="flex items-start justify-between gap-2">
                <p class="text-[15px] font-bold">{c.name}</p>
                <span
                  class={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                    meta.cls
                  )}
                >
                  <span aria-hidden="true">{meta.glyph}</span>{meta.label}
                </span>
              </div>
              <p class="mt-1 text-[13px] leading-relaxed text-muted">{c.description}</p>
              <p class="mt-2 text-[13px]">
                <span class="font-semibold">Proficient looks like: </span>
                <span class="text-muted">{c.proficientLooksLike}</span>
              </p>
              {#if ev && ev.evidence.length > 0}
                <div class="mt-2 border-t border-line pt-2">
                  <p class="text-xs font-semibold text-muted">Evidence ({ev.evidence.length})</p>
                  <ul class="mt-1 space-y-0.5 text-[13px] text-muted">
                    {#each ev.evidence.slice(-4) as e}
                      <li class="flex gap-1.5">
                        <span aria-hidden="true" class="text-success">✓</span>{e}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if improvers.length > 0}
                <p class="mt-2 text-[13px]">
                  <span class="text-muted">Improve with: </span>
                  {#each improvers as m, i}
                    {#if i > 0}<span class="text-muted"> · </span>{/if}<a
                      href={`/mission/${m.id}`}
                      class="font-semibold text-mint underline underline-offset-2"
                      >{m.title}</a
                    >
                  {/each}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <div class="mt-6 rounded-xl border border-line bg-elevated p-4 text-[13px] text-muted">
    <p class="font-semibold text-ink">How levels work</p>
    <p class="mt-1 leading-relaxed">
      Introduced → Practiced → Demonstrated → Independent → Strong evidence. Each step needs
      explicit criteria: guided completion, passing defined checks, succeeding with minimal hints,
      then repeating the skill in new situations. One good attempt never jumps you to the top.
    </p>
  </div>
</div>
