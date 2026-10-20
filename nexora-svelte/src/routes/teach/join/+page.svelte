<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { COHORT_ACCOUNT, COHORT_JOIN } from "$lib/content/site";
  import { courseTitle, joinFailure, type Cohort } from "$lib/cohorts";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";

  /* How a student joins a cohort.
   *
   * The code is on a slide and it is typed once, so the page says one thing
   * before the code is entered: what joining gives, and what it does not.
   * That matters most when the licence is still waiting for the studio,
   * because a student who joins a pending cohort gets the nine free phases
   * and nothing more, and a page that said only "you are in" would have
   * promised the paid course by implication.
   *
   * A code that is unknown, expired or full is refused in a plain sentence,
   * and a platform that does not answer is reported as a platform that did
   * not answer, never as a refusal. The learner is told which of the two
   * happened. */

  let { data }: { data: { code: string } } = $props();

  /**
   * The code in the field.
   *
   * It starts as the code the link carried, and it is the learner's to change
   * afterwards. The seed is taken in a pre-effect rather than in the
   * declaration, because a declaration would capture the prop once, and a
   * client-side navigation to another code would not refill the field.
   */
  let code = $state("");
  let seededFor = $state<string | null>(null);
  $effect.pre(() => {
    const from = data.code;
    if (seededFor === from) return;
    code = from.toUpperCase();
    seededFor = from;
  });
  let busy = $state(false);
  let error = $state<string | null>(null);
  let joined = $state<Cohort | null>(null);
  let alreadyMember = $state(false);

  /** The sentence for a refused code, or for a platform that did not answer. */
  function refusal(err: unknown): string {
    const kind = joinFailure(err);
    if (kind === "unknown") return COHORT_JOIN.errors.unknown;
    if (kind === "expired") return COHORT_JOIN.errors.expired;
    if (kind === "ended") return COHORT_JOIN.errors.ended;
    if (kind === "full") return COHORT_JOIN.errors.full;
    if (kind === "platform") return COHORT_JOIN.errors.platform;
    return COHORT_JOIN.errors.refused;
  }

  async function join(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    joined = null;
    try {
      const reply = await session.joinCohort(code.trim().toUpperCase());
      joined = reply.cohort;
      alreadyMember = reply.alreadyMember === true;
    } catch (err) {
      error = refusal(err);
    } finally {
      busy = false;
    }
  }
</script>

<PageHead
  title={pageTitle(COHORT_JOIN.title)}
  description="Join a NEXORA cohort with the code on the slide. The page says what joining gives you and what it does not."
  path="/teach/join"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <div>
      <Headline
        as="h1"
        lines={[COHORT_JOIN.title]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <p class="reading mt-6 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        {COHORT_JOIN.lede}
      </p>

      <div class="mt-10 grid gap-4 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">what joining gives you</p>
        <p class="max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{COHORT_JOIN.gives}</p>
        <p class="max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{COHORT_JOIN.pending}</p>
        <p class="max-w-[46ch] text-[13.5px] leading-relaxed text-faint">{COHORT_JOIN.free}</p>
      </div>
    </div>

    <div class="min-w-0">
      {#if !apiConfigured}
        <Plate>
          <p class="stamp text-review">cloud accounts not connected</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">{COHORT_JOIN.notConfigured}</p>
        </Plate>
      {:else if session.restoring}
        <Plate>
          <p class="stamp text-muted">checking your session</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            Your session lives in a cookie this page cannot read, so it asks the server before it can
            join anything.
          </p>
        </Plate>
      {:else if !session.loggedIn}
        <Plate crosshair>
          <p class="stamp text-faint">signed out</p>
          <p class="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            {COHORT_JOIN.signedOut}
          </p>
          <div class="mt-6">
            <ActionLink href="/auth" island>Sign in</ActionLink>
          </div>
        </Plate>
      {:else}
        <Plate crosshair>
          {#if joined}
            <p class="stamp text-approved">{COHORT_JOIN.joined}</p>
            <h2 class="mt-3 text-[19px] text-ink">
              {alreadyMember ? COHORT_JOIN.joinedAlready : joined.name}
            </h2>
            <dl class="mt-4 border-t border-rule text-[13.5px]">
              <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                <dt class="stamp text-faint">{COHORT_JOIN.inCourse}</dt>
                <dd class="text-ink">{courseTitle(joined.courseId)}</dd>
              </div>
              <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                <dt class="stamp text-faint">{COHORT_JOIN.atInstitution}</dt>
                <dd class="text-ink">{joined.institution}</dd>
              </div>
              <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                <dt class="stamp text-faint">{COHORT_JOIN.theTerm}</dt>
                <dd class="text-ink">{joined.term}</dd>
              </div>
            </dl>
            <p class="mt-4 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              {#if joined.status === "active"}
                {COHORT_ACCOUNT.active}
              {:else if joined.status === "ended"}
                {COHORT_ACCOUNT.ended}
              {:else}
                {COHORT_ACCOUNT.pending}
              {/if}
            </p>
            <div class="mt-6 flex flex-wrap gap-3 border-t border-rule pt-5">
              <ActionLink href="/account" variant="ghost" size="sm" island>
                See your account
              </ActionLink>
            </div>
          {:else}
            <form onsubmit={join}>
              <label for="join-code" class="stamp block text-faint">{COHORT_JOIN.field}</label>
              <input
                id="join-code"
                bind:value={code}
                required
                maxlength="16"
                autocomplete="off"
                spellcheck={false}
                placeholder={COHORT_JOIN.placeholder}
                class="num mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2.5 text-[18px] tracking-[0.12em] text-ink placeholder:text-faint"
              />
              {#if error}
                <div class="mt-5 border-l border-removed pl-4" role="alert">
                  <p class="text-[13.5px] leading-relaxed text-muted">{error}</p>
                </div>
              {/if}
              <div class="mt-6">
                <Button type="submit" busy={busy}>
                  {busy ? COHORT_JOIN.working : COHORT_JOIN.action}
                </Button>
              </div>
            </form>
            <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
              The code is on the slide, and it is typed once. The dash and the case do not matter.
            </p>
          {/if}
        </Plate>
      {/if}
    </div>
  </div>
</div>
