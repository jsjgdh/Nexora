<script lang="ts">
  import { EMPLOYER } from "$lib/content/site";
  import { inViewStagger } from "$lib/motion";
  import ActionLink from "./ActionLink.svelte";

  /* The hiring manager's bench.
   *
   * Two columns, and the second one is the point of the first. A hiring
   * manager's question is not "is this a good product" but "what can I
   * actually check, and what am I being sold that does not exist". So the
   * left column lists the five things that are true of a finished phase
   * today, each with the artefact behind it, and the right column says
   * plainly which parts of the usual offer are not built yet.
   *
   * The right column is not a disclaimer. It is the strongest thing on the
   * page for this audience: a vendor who prints their own gaps is a vendor
   * whose remaining claims can be believed. The list is set in the reading
   * face, because it is the one passage on the site that belongs to somebody
   * else rather than to us. */

  let {
    verifyHref = "/verify",
    scope = "all",
  }: { verifyHref?: string; scope?: "all" | "hiring" } = $props();

  /* The gaps, filtered by who they concern.
   *
   * "No employer console" is a hiring manager's gap. A learner reading the
   * front page has no employer console to want, and the line is noise there;
   * the hiring version of this page carries the whole list. The gap that
   * concerns everybody — no placement rate, no customer logo — stays on both,
   * because a learner is entitled to know that the proof on this page is not
   * backed by a cohort either. */
  const gaps = $derived(
    EMPLOYER.notYet.filter((gap) => gap.scope === "all" || gap.scope === scope)
  );
</script>

<div class="grid gap-px border border-rule bg-rule lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
  <!-- What is true today. -->
  <div class="bg-panel p-6 sm:p-8">
    <p class="stamp text-[11px] text-faint">what is true of a finished phase</p>
    <ul class="mt-6" use:inViewStagger>
      {#each EMPLOYER.checks as row (row.claim)}
        <li class="fade-up border-t border-rule py-5 first:border-t-0 first:pt-0" data-stagger-item>
          <p class="text-[15.5px] font-semibold text-ink">{row.claim}</p>
          <p class="reading mt-2 max-w-[58ch] text-[15.5px] leading-relaxed text-muted">{row.evidence}</p>
        </li>
      {/each}
    </ul>
  </div>

  <!-- What is not built yet. -->
  <div class="bg-panel p-6 sm:p-8">
    <p class="stamp text-[11px] text-review">not built yet</p>
    <ul class="mt-6">
      {#each gaps as gap (gap.text)}
        <li class="flex gap-3 border-t border-rule py-4 first:border-t-0 first:pt-0">
          <span class="num pt-0.5 text-[12px] text-removed" aria-hidden="true">✗</span>
          <span class="text-[14px] leading-relaxed text-muted">{gap.text}</span>
        </li>
      {/each}
    </ul>

    {#if scope === "hiring"}
      <div class="mt-8 border-t border-rule pt-6">
        <p class="reading text-[17px] leading-snug text-ink">{EMPLOYER.pilot.title}</p>
        <p class="reading mt-3 text-[15.5px] leading-relaxed text-muted">{EMPLOYER.pilot.body}</p>
        <div class="mt-6">
          <ActionLink href={verifyHref} variant="ghost" size="sm">Check a receipt yourself</ActionLink>
        </div>
      </div>
    {/if}
  </div>
</div>
