<script lang="ts">
  import { progress } from "$lib/store.svelte";
  import { practice } from "$lib/practice.svelte";
  import { COMPETENCIES } from "$lib/curriculum";
  import { ALL_MISSIONS } from "$lib/missions";
  import { APPROVED_LEVELS, proficiencyWord } from "$lib/review";
  import { buildEvidence, evidenceJson, evidenceMarkdown } from "$lib/evidence";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { cn } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* The vocabulary itself lives in $lib/review so a proficiency reads the same
     here and on the mission result band. Form and word carry the level; hue
     only reinforces it. */

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
  const approvedCount = $derived(
    Object.values(progress.state.competencies).filter((c) => APPROVED_LEVELS.includes(c.level))
      .length
  );

  /**
   * "Proof of skill" is the positioning claim, and evidence that cannot leave
   * the app proves nothing. The export is generated from the same record the
   * page is showing — no separate summary that could drift from it.
   */
  function exportEvidence(format: "json" | "markdown") {
    const doc = buildEvidence(progress.state, practice.state);
    const body = format === "json" ? evidenceJson(doc) : evidenceMarkdown(doc);
    const name = `nexora-evidence-${doc.exportedAt.slice(0, 10)}.${format === "json" ? "json" : "md"}`;
    const url = URL.createObjectURL(
      new Blob([body], { type: format === "json" ? "application/json" : "text/markdown" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  let passed = $state(false);
  let varied = $state(false);
  const proof = $derived(
    passed && varied
      ? {
          mark: "+",
          word: "approved",
          tone: "text-approved",
          rule: "border-l-approved",
          note: "A new context, no hints. That counts as evidence.",
        }
      : varied
        ? {
            mark: "~",
            word: "under review",
            tone: "text-review",
            rule: "border-l-review",
            note: "Pass the mission checks first — then prove it unaided.",
          }
        : passed
          ? {
              mark: "+",
              word: "added",
              tone: "text-added",
              rule: "border-l-added",
              note: "Done. An unaided variation is scheduled to confirm it.",
            }
          : {
              mark: ".",
              word: "not yet",
              tone: "text-faint",
              rule: "border-l-rule",
              note: "Tick a box to see how the record changes with evidence.",
            }
  );
</script>

<PageHead
  title={pageTitle("Skills & evidence")}
  description="Each competency with the level it has earned, the criterion that level means, and the evidence behind it — exportable as a document you can keep."
  path="/skills"
/>

<div class="mx-auto max-w-4xl px-4 py-6 sm:py-8">
  <p class="stamp text-accent">skills & evidence</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    Competence, not activity
  </h1>
  <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
    Every level below is backed by assessed work — attempts, checks, and unaided variations.
    Opening a lesson or collecting XP never moves a skill on its own.
  </p>

  <dl class="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-rule py-3">
    <div>
      <dt class="stamp text-faint">skills approved</dt>
      <dd class="num mt-0.5 text-[16px] text-approved">{approvedCount}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">skills tracked</dt>
      <dd class="num mt-0.5 text-[16px] text-muted">{COMPETENCIES.length}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">missions added</dt>
      <dd class="num mt-0.5 text-[16px] text-added">
        {ALL_MISSIONS.filter((m) => progress.state.missions[m.id]?.completedAt).length}
      </dd>
    </div>
  </dl>

  <section class="mt-6 border border-rule" aria-label="Export your evidence">
    <div class="border-b border-rule bg-raised px-3 py-1.5">
      <p class="stamp text-faint">take it with you</p>
    </div>
    <div class="flex flex-wrap items-center gap-3 px-3 py-3">
      <p class="mr-auto max-w-xl text-[13px] leading-relaxed text-muted">
        Export what is below as a document you can keep or send: each skill with its level, the
        criterion that level means, and the missions whose requirements you met. It prints what it
        is not — a certificate — and names the checks this build could not decide.
      </p>
      <button
        class="cursor-pointer border border-rule px-3 py-1.5 text-[13px] text-ink hover:border-accent hover:text-accent"
        onclick={() => exportEvidence("markdown")}
      >
        Export as Markdown
      </button>
      <button
        class="cursor-pointer border border-rule px-3 py-1.5 text-[13px] text-muted hover:border-accent hover:text-accent"
        onclick={() => exportEvidence("json")}
      >
        Export as JSON
      </button>
    </div>
  </section>

  <section
    class="mt-6 border border-rule"
    aria-label="Worked example: finished is not the same as proven"
  >
    <div class="border-b border-rule bg-raised px-3 py-1.5">
      <p class="stamp text-faint">worked example — finished is not the same as proven</p>
    </div>
    <div class="px-3 py-3">
      <div class="border-t border-rule">
        <label class="flex cursor-pointer items-baseline gap-3 border-b border-rule px-1 py-2.5">
          <input
            type="checkbox"
            bind:checked={passed}
            class="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
          />
          <span class="text-[13px] text-ink">I passed the checks on this mission</span>
        </label>
        <label class="flex cursor-pointer items-baseline gap-3 border-b border-rule px-1 py-2.5">
          <input
            type="checkbox"
            bind:checked={varied}
            class="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
          />
          <span class="text-[13px] text-ink">I solved a new variation, with no hints</span>
        </label>
      </div>
      <div class={cn("border-l px-3 py-2.5", proof.rule)} aria-live="polite">
        <p class={cn("stamp flex items-baseline gap-2", proof.tone)}>
          <span aria-hidden="true" class="num text-[12px]">{proof.mark}</span>{proof.word}
        </p>
        <p class="mt-1 text-[13px] text-muted">{proof.note}</p>
      </div>
    </div>
  </section>

  {#if !anyEvidence}
    <div class="mt-6">
      <EmptyState
        kicker="no assessed work yet"
        title="Nothing is filed under your skills"
        body="Evidence is earned by finishing missions and the diagnostic. Your roadmap already names the next change to open."
      >
        <a
          href="/roadmap"
          class="inline-flex border border-accent bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent hover:bg-accent/20"
        >
          Open the roadmap
        </a>
      </EmptyState>
    </div>
  {/if}

  <div class="mt-8 space-y-8">
    {#each domains as [domain, comps] (domain)}
      <section aria-label={domain}>
        <h2 class="stamp border-b border-rule pb-1.5 text-faint">{domain}</h2>
        <ul>
          {#each comps as c (c.id)}
            {@const ev = progress.state.competencies[c.id]}
            {@const meta = proficiencyWord(ev?.level)}
            {@const improvers = ALL_MISSIONS.filter(
              (m) => m.competencyIds.includes(c.id) && !progress.state.missions[m.id]?.completedAt
            ).slice(0, 2)}
            <li class={cn("border-b border-rule border-l px-3 py-3", meta.rule)}>
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="text-[15px] font-medium text-ink">{c.name}</p>
                <p class={cn("stamp flex shrink-0 items-baseline gap-2", meta.tone)}>
                  <span aria-hidden="true" class="num text-[12px]">{meta.mark}</span>{meta.word}
                </p>
              </div>
              <p class="mt-1 text-[13px] leading-relaxed text-muted">{c.description}</p>
              <p class="mt-1.5 text-[13px] text-muted">{meta.note}</p>
              <p class="mt-1.5 text-[13px]">
                <span class="stamp text-faint">proficient looks like </span>
                <span class="text-muted">{c.proficientLooksLike}</span>
              </p>
              {#if ev && ev.evidence.length > 0}
                <div class="mt-2 border-t border-rule pt-2">
                  <p class="stamp text-faint">evidence ({ev.evidence.length})</p>
                  <ul class="mt-1 space-y-0.5">
                    {#each ev.evidence.slice(-4) as e (e)}
                      <li class="flex gap-2 text-[12px] leading-relaxed text-muted">
                        <span aria-hidden="true" class="num text-added">+</span>
                        <span>{e}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if improvers.length > 0}
                <p class="mt-2 text-[13px]">
                  <span class="stamp text-faint">improve with </span>
                  {#each improvers as m, i (m.id)}
                    {#if i > 0}<span class="text-faint"> · </span>{/if}<a
                      href={`/mission/${m.id}`}
                      class="text-accent underline underline-offset-4 hover:text-ink">{m.title}</a
                    >
                  {/each}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <div class="thread mt-8">
    <p class="stamp text-faint">how a level is earned</p>
    <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
      Seen → under review → added → approved → approved with strong evidence. Each step has an
      explicit criterion: meeting the checks, passing them with few hints, then repeating the skill
      in a situation the product did not hand you. One lucky attempt never jumps a skill to the
      top.
    </p>
  </div>
</div>
