<script lang="ts">
  import { ALL_MISSIONS, MISSION_TYPE_LABEL } from "$lib/missions";
  import { competencyById, stageById } from "$lib/curriculum";
  import { isCompleted, isMastered } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import Button from "$lib/components/Button.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ProgressRule from "$lib/components/ProgressRule.svelte";
  import { cn, minutesLabel, timeAgo } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  const projects = ALL_MISSIONS.filter((m) => m.type === "build" || m.type === "project");
  const inProgress = $derived(
    projects.filter(
      (m) => progress.state.missions[m.id]?.startedAt && !isCompleted(m.id, progress.state)
    )
  );
  const completed = $derived(projects.filter((m) => isCompleted(m.id, progress.state)));
  const untouched = $derived(
    projects.filter(
      (m) => !progress.state.missions[m.id]?.startedAt && !isCompleted(m.id, progress.state)
    )
  );

  let shownCode = $state<string | null>(null);
</script>

<PageHead
  title={pageTitle("Projects")}
  description="Larger builds with requirements, attempt history, source, and the skills each one produced — work someone else can actually inspect."
  path="/projects"
/>

<div class="mx-auto max-w-4xl px-4 py-6 sm:py-8">
  <p class="stamp text-accent">build log</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    Work that proves it
  </h1>
  <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
    Larger builds with requirements, attempt history, source, and the skills each one produced.
    This is what someone else can actually inspect — not a list of lessons watched.
  </p>

  <dl class="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-rule py-3">
    <div>
      <dt class="stamp text-faint">added</dt>
      <dd class="num mt-0.5 text-[16px] text-added">{completed.length}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">under review</dt>
      <dd class="num mt-0.5 text-[16px] text-review">{inProgress.length}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">to come</dt>
      <dd class="num mt-0.5 text-[16px] text-muted">{untouched.length}</dd>
    </div>
  </dl>

  {#if projects.every((m) => !progress.state.missions[m.id]?.startedAt)}
    <div class="mt-6">
      <EmptyState
        kicker="nothing in the log yet"
        title="No builds started"
        body="Builds open as you move along the path. The first one is a personal website near the end of the HTML stage — everything before it is the preparation that makes it possible."
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

  {#if inProgress.length > 0}
    <section aria-label="Builds in progress" class="mt-8">
      <h2 class="stamp border-b border-rule pb-1.5 text-faint">under review</h2>
      <ul>
        {#each inProgress as m (m.id)}
          {@const p = progress.state.missions[m.id]}
          {@const passed = p?.checksPassed.length ?? 0}
          <li class="border-b border-rule border-l border-l-review px-3 py-3">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div class="min-w-0">
                <p class="text-[15px] font-medium text-ink">
                  {m.title}
                  <span class="stamp ml-2 text-faint">
                    {m.isBoss ? "capstone" : "guided build"} · stage
                    {stageById(m.stageId)?.num ?? "?"}
                  </span>
                </p>
                <p class="mt-0.5 text-[13px] text-muted">{m.tagline}</p>
              </div>
              <a
                href={`/mission/${m.id}`}
                class="shrink-0 border border-accent bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent/20"
              >
                Resume
              </a>
            </div>
            <div class="mt-3">
              <ProgressRule value={passed} max={m.checks.length} label="requirements met" tone="added" />
            </div>
            <dl class="mt-3 grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
              <div class="flex justify-between border-b border-rule py-1">
                <dt class="text-faint">last worked</dt>
                <dd class="num text-muted">{timeAgo(p?.startedAt ?? null)}</dd>
              </div>
              <div class="flex justify-between border-b border-rule py-1">
                <dt class="text-faint">checks run</dt>
                <dd class="num text-muted">{p?.attempts ?? 0}</dd>
              </div>
              <div class="flex justify-between border-b border-rule py-1 sm:col-span-2">
                <dt class="text-faint">evidence for</dt>
                <dd class="text-right text-muted">
                  {m.competencyIds.map((c) => competencyById(c)?.name).join(" · ")}
                </dd>
              </div>
            </dl>
            {#if p?.code}
              <div class="mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => (shownCode = shownCode === m.id ? null : m.id)}
                  aria-expanded={shownCode === m.id}
                >
                  {shownCode === m.id ? "Hide source" : "View source"}
                </Button>
                {#if shownCode === m.id}
                  <pre
                    class="nice-scroll mt-2 max-h-64 overflow-auto border border-rule bg-raised p-3 font-mono text-[12px] leading-relaxed"><code
                      >{p.code}</code
                    ></pre>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if completed.length > 0}
    <section aria-label="Completed builds" class="mt-8">
      <h2 class="stamp border-b border-rule pb-1.5 text-faint">added — portfolio ready</h2>
      <ul>
        {#each completed as m (m.id)}
          {@const p = progress.state.missions[m.id]}
          {@const mastered = isMastered(m.id, progress.state)}
          {@const passed = p?.checksPassed.length ?? 0}
          <li
            class={cn(
              "border-b border-rule border-l px-3 py-3",
              mastered ? "border-l-approved" : "border-l-added"
            )}
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div class="min-w-0">
                <p class="text-[15px] font-medium text-ink">
                  {m.title}
                  <span class="stamp ml-2 {mastered ? 'text-approved' : 'text-added'}">
                    {mastered ? "approved" : "added"}
                  </span>
                </p>
                <p class="mt-0.5 text-[13px] text-muted">{m.tagline}</p>
              </div>
              <a
                href={`/mission/${m.id}`}
                class="shrink-0 border border-rule px-2.5 py-1 text-[12px] text-ink hover:border-accent hover:text-accent"
              >
                Review
              </a>
            </div>
            <div class="mt-3">
              <ProgressRule value={passed} max={m.checks.length} label="requirements met" tone="added" />
            </div>
            <dl class="mt-3 grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
              <div class="flex justify-between border-b border-rule py-1">
                <dt class="text-faint">submitted</dt>
                <dd class="num text-muted">{timeAgo(p?.completedAt ?? null)}</dd>
              </div>
              <div class="flex justify-between border-b border-rule py-1">
                <dt class="text-faint">attempts · hints</dt>
                <dd class="num text-muted">
                  {p?.attempts ?? 0} · {p?.hintsUsed ?? 0}
                </dd>
              </div>
              <div class="flex justify-between border-b border-rule py-1 sm:col-span-2">
                <dt class="text-faint">evidence for</dt>
                <dd class="text-right text-muted">
                  {m.competencyIds.map((c) => competencyById(c)?.name).join(" · ")}
                </dd>
              </div>
            </dl>
            {#if p?.code}
              <div class="mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => (shownCode = shownCode === m.id ? null : m.id)}
                  aria-expanded={shownCode === m.id}
                >
                  {shownCode === m.id ? "Hide source" : "View source"}
                </Button>
                {#if shownCode === m.id}
                  <pre
                    class="nice-scroll mt-2 max-h-64 overflow-auto border border-rule bg-raised p-3 font-mono text-[12px] leading-relaxed"><code
                      >{p.code}</code
                    ></pre>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if untouched.length > 0}
    <section aria-label="Upcoming builds" class="mt-8">
      <div class="hunk border-x-0">
        <span class="row-mark" aria-hidden="true">@@</span>
        <span>upcoming builds — visible, not yet open</span>
        <span class="stamp justify-self-end text-faint">{untouched.length}</span>
      </div>
      <ul>
        {#each untouched as m (m.id)}
          <li class="row" data-state="optional">
            <span class="row-mark" aria-hidden="true">o</span>
            <span class="min-w-0">
              <span class="row-title block truncate text-[14px] text-ink">{m.title}</span>
              <span class="row-meta mt-0.5 block text-[12px] text-faint">
                {MISSION_TYPE_LABEL[m.type]} · {minutesLabel(m.estMinutes)} · stage
                {stageById(m.stageId)?.num ?? "?"}
              </span>
            </span>
            <a
              href={`/mission/${m.id}`}
              class="stamp justify-self-end text-muted hover:text-accent"
            >
              read
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
