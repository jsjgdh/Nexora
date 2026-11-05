<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { COHORT_ACCOUNT, COHORT_JOIN } from "$lib/content/site";
  import { courseTitle, joinFailure, type Cohort } from "$lib/cohorts";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import type { ReleaseState } from "$lib/release";
  import { pageTitle } from "$lib/seo";

  /* How a student joins a cohort.
   *
   * The code is on a slide and it is typed once, so the page says one thing
   * before the code is entered: what joining gives, and what it does not.
   * That matters most when the licence is still waiting for the studio,
   * because a student who joins a pending cohort gets the free phases
   * and nothing more, and a page that said only "you are in" would have
   * promised the paid course by implication.
   *
   * A code that is unknown, expired or full is refused in a plain sentence,
   * and a platform that does not answer is reported as a platform that did
   * not answer, never as a refusal. The learner is told which of the two
   * happened. */

  let { data }: { data: { code: string; release: ReleaseState } } = $props();

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

<div class="container-page join-page">
  <div class="join-layout">
    <div class="join-copy">
      <h1 class="display join-title">{COHORT_JOIN.title}</h1>
      <p class="join-lede">{COHORT_JOIN.lede}</p>

      <div class="join-gives">
        <p class="stamp">What joining gives you</p>
        <p class="join-point">{COHORT_JOIN.gives}</p>
        <p class="join-point">{COHORT_JOIN.pending}</p>
        <p class="join-fine">{COHORT_JOIN.free}</p>
      </div>
    </div>

    <div class="join-panel">
      {#if !apiConfigured}
        <div class="state-card card">
          <span class="tag">Local mode</span>
          <p class="state-body">{COHORT_JOIN.notConfigured}</p>
          <div class="state-action">
            <ActionLink href="/download" variant="ghost" island>{data.release.label}</ActionLink>
          </div>
        </div>
      {:else if session.restoring}
        <div class="state-card card">
          <span class="tag">Checking your session</span>
          <p class="state-body">
            Your session lives in a cookie this page cannot read, so it asks the server before it can
            join anything.
          </p>
        </div>
      {:else if !session.loggedIn}
        <div class="state-card card">
          <span class="tag">Signed out</span>
          <p class="state-body">{COHORT_JOIN.signedOut}</p>
          <div class="state-action">
            <ActionLink href="/auth" island>Sign in</ActionLink>
          </div>
        </div>
      {:else}
        <div class="join-card card">
          {#if joined}
            <p class="tag tag-pass">{COHORT_JOIN.joined}</p>
            <h2 class="joined-title">
              {alreadyMember ? COHORT_JOIN.joinedAlready : joined.name}
            </h2>
            <dl class="joined-facts">
              <div>
                <dt>{COHORT_JOIN.inCourse}</dt>
                <dd>{courseTitle(joined.courseId)}</dd>
              </div>
              <div>
                <dt>{COHORT_JOIN.atInstitution}</dt>
                <dd>{joined.institution}</dd>
              </div>
              <div>
                <dt>{COHORT_JOIN.theTerm}</dt>
                <dd>{joined.term}</dd>
              </div>
            </dl>
            <p class="state-body">
              {#if joined.status === "active"}
                {COHORT_ACCOUNT.active}
              {:else if joined.status === "ended"}
                {COHORT_ACCOUNT.ended}
              {:else}
                {COHORT_ACCOUNT.pending}
              {/if}
            </p>
            <div class="joined-action">
              <ActionLink href="/account" variant="ghost" size="sm" island>
                Your account
              </ActionLink>
            </div>
          {:else}
            <form onsubmit={join} class="join-form">
              <label for="join-code" class="field-label">{COHORT_JOIN.field}</label>
              <input
                id="join-code"
                bind:value={code}
                required
                maxlength="16"
                autocomplete="off"
                spellcheck={false}
                placeholder={COHORT_JOIN.placeholder}
                class="field-input num join-input"
              />
              {#if error}
                <p class="join-error" role="alert">{error}</p>
              {/if}
              <div class="join-submit">
                <Button type="submit" busy={busy}>
                  {busy ? COHORT_JOIN.working : COHORT_JOIN.action}
                </Button>
              </div>
            </form>
            <p class="join-fine">
              The code is on the slide, and it is typed once. The dash and the case do not matter.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .join-page {
    padding-block: clamp(3rem, 6vw, 5.5rem) clamp(4rem, 8vw, 7rem);
  }

  .join-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
    align-items: start;
  }

  @media (min-width: 960px) {
    .join-layout {
      grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .join-copy,
  .join-panel {
    min-width: 0;
  }

  .join-title {
    max-width: 16ch;
    font-size: var(--text-page);
    color: var(--color-ink);
  }

  .join-lede {
    margin-top: var(--space-5);
    max-width: 48ch;
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .join-gives {
    margin-top: var(--space-8);
    padding-top: var(--space-5);
    border-top: 2px solid var(--color-ink);
  }

  .join-gives .stamp {
    color: var(--color-faint);
  }

  .join-point {
    margin-top: var(--space-3);
    max-width: 46ch;
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .join-fine {
    margin-top: var(--space-4);
    max-width: 48ch;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  .state-card,
  .join-card {
    padding: var(--space-6);
  }

  @media (min-width: 640px) {
    .state-card,
    .join-card {
      padding: var(--space-8);
    }
  }

  .state-body {
    margin-top: var(--space-3);
    max-width: 56ch;
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .state-action {
    margin-top: var(--space-6);
  }

  .join-form {
    display: grid;
    gap: var(--space-2);
  }

  .join-input {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .join-error {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-fail);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-fail) 6%, var(--color-panel));
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--color-ink);
  }

  .join-submit {
    margin-top: var(--space-5);
  }

  .joined-title {
    margin-top: var(--space-4);
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 2.4vw, 1.8rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-ink);
  }

  .joined-facts {
    margin: var(--space-5) 0 0;
    border-top: 1px solid var(--color-rule);
  }

  .joined-facts div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--color-rule);
  }

  .joined-facts dt {
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-faint);
  }

  .joined-facts dd {
    margin: 0;
    text-align: right;
    font-size: 13.5px;
    color: var(--color-ink);
  }

  .joined-action {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
  }
</style>
