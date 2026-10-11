<script lang="ts">
  import {
    PRACTICE_COPY,
    beatenThisWeek,
    openMistakes,
    practiceSet,
    practiceSummary,
    resolvedMistakes,
  } from "$lib/practice-core";
  import { practice } from "$lib/practice.svelte";
  import { missionById } from "$lib/missions";
  import { stageById } from "$lib/curriculum";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { cn, timeAgo } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* The practice log (PRODUCT.md principle #3).
     Framing is a hard constraint, not a style choice: a record here is work, so
     there is no score, no streak, and no word that turns a turned-back check
     into a judgement of the person. The copy lives in practice-core.ts so the
     suite can assert that. */

  const now = new Date();
  const summary = $derived(practiceSummary(practice.state, now));
  const session = $derived(practiceSet(practice.state, 5));
  const open = $derived(openMistakes(practice.state));
  const cleared = $derived(resolvedMistakes(practice.state));
  const week = $derived(beatenThisWeek(practice.state, now));

  function missionTitle(id: string): string {
    return missionById(id)?.title ?? id;
  }

  function stageTitle(id: string): string {
    const m = missionById(id);
    const s = m ? stageById(m.stageId) : undefined;
    return s ? `Stage ${s.num} · ${s.title}` : "";
  }

  /**
   * The drill parameter is the record's own id — `mission::check`, the key the
   * log is written under. Passing only the mission would open the mission and
   * quietly drop the requirement the learner came here to practise.
   */
  function drillHref(m: { id: string; missionId: string }): string {
    return `/mission/${m.missionId}?drill=${encodeURIComponent(m.id)}`;
  }
</script>

<!-- The description is the surface's own words, from the copy the suite guards
     (banned words and all): no second, marketing sentence is invented for a
     search result, and it is short enough to be read whole. -->
<PageHead
  title={pageTitle("Practice log")}
  description={PRACTICE_COPY.metaDescription}
  path="/practice"
/>

<div class="mx-auto max-w-3xl px-4 py-6 sm:py-8">
  <p class="stamp text-accent">{PRACTICE_COPY.kicker}</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    {PRACTICE_COPY.heading}
  </h1>
  <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
    {PRACTICE_COPY.promise}
  </p>

  {#if summary.open + summary.cleared > 0}
    <dl class="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-rule py-3">
      <div>
        <dt class="stamp text-faint">open</dt>
        <dd class="num mt-0.5 text-[16px] text-review">{summary.open}</dd>
      </div>
      <div>
        <dt class="stamp text-faint">cleared</dt>
        <dd class="num mt-0.5 text-[16px] text-added">{summary.cleared}</dd>
      </div>
      <div>
        <dt class="stamp text-faint">this week</dt>
        <dd class="num mt-0.5 text-[16px] text-muted">{summary.thisWeek}</dd>
      </div>
      {#if summary.stages > 1}
        <div>
          <dt class="stamp text-faint">stages</dt>
          <dd class="num mt-0.5 text-[16px] text-muted">{summary.stages}</dd>
        </div>
      {/if}
    </dl>
  {/if}

  {#if open.length === 0 && cleared.length === 0}
    <div class="mt-6">
      <EmptyState
        kicker="nothing filed"
        title={PRACTICE_COPY.emptyTitle}
        body={PRACTICE_COPY.emptyBody}
      >
        <a
          href="/roadmap"
          class="inline-flex border border-accent bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent hover:bg-accent/20"
        >
          Back to the roadmap
        </a>
      </EmptyState>
    </div>
  {:else}
    {#if session.length > 0}
      <section class="mt-6 border border-rule" aria-label="A practice session">
        <div
          class="flex items-baseline justify-between gap-3 border-b border-rule bg-raised px-3 py-1.5"
        >
          <p class="stamp text-faint">a session — {session.length} of your own</p>
          <p class="text-[12px] text-muted">newest first, mixed across stages</p>
        </div>
        <ul>
          {#each session as item (item.id)}
            <li class="border-b border-rule px-3 py-2.5 last:border-b-0">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p class="text-[13px] text-ink">
                  <span class="text-muted">{missionTitle(item.missionId)}</span>
                  <span class="text-faint" aria-hidden="true"> / </span>{item.label}
                </p>
                <a
                  href={drillHref(item)}
                  class="border border-rule px-2.5 py-1 text-[12px] text-accent hover:border-accent"
                >
                  {PRACTICE_COPY.itemVerb}
                </a>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if week.length > 0}
      <p class="mt-4 text-[13px] text-muted">
        <span class="stamp text-faint">this week </span>
        {week.length} requirement{week.length === 1 ? "" : "s"} turned you back. Each one has a
        line below.
      </p>
    {/if}

    <section class="mt-6" aria-label="Open requirements">
      <h2 class="stamp border-b border-rule pb-1.5 text-faint">
        {PRACTICE_COPY.openLabel} — {open.length}
      </h2>
      {#if open.length === 0}
        <p class="mt-2.5 text-[13px] text-muted">
          Everything on the log has been beaten at least once. That is not the same as finished — a
          fresh variation is how a skill becomes approved.
        </p>
      {/if}
      <ul>
        {#each open as item (item.id)}
          <li class="border-b border-rule border-l border-l-review px-3 py-3">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p class="text-[14px] font-medium text-ink">{item.label}</p>
              <p class="stamp text-review">{PRACTICE_COPY.openLabel}</p>
            </div>
            <p class="mt-1 text-[12px] text-faint">
              {missionTitle(item.missionId)} · {stageTitle(item.missionId)}
            </p>
            <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{item.message}</p>
            <p class="mt-1.5 text-[12px] text-faint">
              turned you back {item.failures}× · latest {timeAgo(item.lastFailedAt)}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <a
                href={drillHref(item)}
                class="border border-review/50 px-2.5 py-1 text-[12px] text-review hover:border-review"
              >
                {PRACTICE_COPY.itemVerb}
              </a>
              <a
                href={`/mission/${item.missionId}`}
                class="text-[12px] text-muted underline underline-offset-4 hover:text-ink"
              >
                Open the mission
              </a>
            </div>
            {#if item.code.trim().length > 0}
              <details class="mt-2">
                <summary class="cursor-pointer text-[12px] text-muted hover:text-ink">
                  the code you had at the time
                </summary>
                <pre
                  class="nice-scroll mt-1.5 overflow-x-auto border border-rule bg-raised p-2.5 font-mono text-[11.5px] leading-relaxed text-muted"><code
                    >{item.code}</code
                  ></pre>
              </details>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    {#if cleared.length > 0}
      <section class="mt-6" aria-label="Cleared requirements">
        <h2 class="stamp border-b border-rule pb-1.5 text-faint">
          {PRACTICE_COPY.clearedLabel} — {cleared.length}
        </h2>
        <ul>
          {#each cleared as item (item.id)}
            <li class="border-b border-rule border-l border-l-added px-3 py-2.5">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="text-[13px] text-ink">{item.label}</p>
                <p class="stamp text-added">{timeAgo(item.resolvedAt ?? item.lastFailedAt)}</p>
              </div>
              <p class="mt-1 text-[12px] text-faint">
                {missionTitle(item.missionId)} · turned you back {item.failures}× before it went
                through
              </p>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="thread mt-8">
      <p class="stamp text-faint">retention</p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{PRACTICE_COPY.retention}</p>
      <p class="mt-2 text-[12px] leading-relaxed text-faint">
        This log lives in this browser only. Signing in syncs your missions and skills; the practice
        log follows an account once submission history does.
      </p>
      <button
        class={cn(
          "mt-3 cursor-pointer border px-2.5 py-1 text-[12px]",
          "border-rule text-muted hover:border-removed hover:text-removed"
        )}
        onclick={() => practice.clearAll()}
      >
        Clear this log
      </button>
    </div>
  {/if}
</div>
