<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { AUTH_MESSAGES } from "$lib/auth-errors";
  import {
    CAMPUS,
    COHORT_COURSE_OPTIONS,
    COHORT_EXPORT,
    COHORT_STATUS,
    COHORT_TEACH, FREE_PHASES_PHRASE } from "$lib/content/site";
  import { courseTitle, type Cohort, type CohortDetail } from "$lib/cohorts";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import type { ReleaseState } from "$lib/release";
  import { pageTitle } from "$lib/seo";

  let { data }: { data: { release: ReleaseState } } = $props();

  /* The instructor's page.
   *
   * A front door for a lecturer, not a classroom. It holds the cohorts they
   * teach, the code that goes on a slide, the roster with what the platform
   * has verified for each member, the file, and the way to end a licence.
   *
   * The state that matters most is the licence. A cohort that is pending is
   * waiting for the studio to confirm it, and while it waits the students who
   * join get the free phases and nothing more. So the page says that in
   * the status line itself, every time, and it never prints the sentence that
   * belongs to an active licence for a cohort that is not one.
   *
   * Three things the page refuses to do:
   *
   *   - it never claims a cohort exists when the platform did not say so, so a
   *     failure is an empty roster with a reason and not a cohort;
   *   - it never types a number, so the seat count, the member count and the
   *     price come from the platform or from the copy module;
   *   - it never loses the instructor's typing, so a platform that does not
   *     answer leaves the form exactly as it was.
   */

  /** The cohorts the caller teaches, as the platform holds them. */
  let cohorts = $state<Cohort[]>([]);
  let cohortsLoading = $state(false);
  let cohortsError = $state<string | null>(null);

  /** The cohort whose roster is open, and the roster itself. */
  let openId = $state<string | null>(null);
  let detail = $state<CohortDetail | null>(null);
  let detailLoading = $state(false);
  let detailError = $state<string | null>(null);

  /** Which action is running, so no two run at once. */
  let busy = $state<string | null>(null);
  let note = $state<string | null>(null);
  let error = $state<string | null>(null);

  /** The create form. The values live here, and they survive a failure. */
  let name = $state("");
  let institution = $state("");
  let courseId = $state<string>(COHORT_COURSE_OPTIONS[0]?.id ?? "");
  let term = $state("");
  let seats = $state<number>(CAMPUS.defaultSeats);

  /** The cohort whose end is armed, so ending takes two clicks. */
  let endArmed = $state<string | null>(null);

  /** The sentence for a failure, kept apart from the platform's own wording. */
  function failure(fallback: string, err: unknown): string {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return AUTH_MESSAGES.expired;
    return fallback;
  }

  async function loadCohorts() {
    cohortsLoading = true;
    cohortsError = null;
    try {
      cohorts = await session.listCohorts();
    } catch (err) {
      cohorts = [];
      cohortsError = failure(COHORT_TEACH.platformDown, err);
    } finally {
      cohortsLoading = false;
    }
  }

  /* Read once per identity. The epoch is the identity boundary: a sign-in
     re-arms it, a token renewal does not, so a live session does not ask the
     platform for the same list on every tick. */
  let loadedFor = $state(-1);
  $effect(() => {
    const epoch = session.epoch;
    if (!apiConfigured || !session.loggedIn) return;
    if (epoch !== loadedFor) {
      loadedFor = epoch;
      void loadCohorts();
    }
  });

  /** Open the roster of a cohort, or close it again. */
  async function toggleRoster(id: string) {
    note = null;
    error = null;
    if (openId === id) {
      openId = null;
      detail = null;
      detailError = null;
      return;
    }
    openId = id;
    detail = null;
    detailError = null;
    detailLoading = true;
    try {
      detail = await session.cohortDetail(id);
    } catch (err) {
      detail = null;
      detailError = failure(COHORT_TEACH.roster.failed, err);
    } finally {
      detailLoading = false;
    }
  }

  /** Create a cohort. The platform creates it pending, and the page says so. */
  async function createCohort(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = "create";
    error = null;
    note = null;
    try {
      const cohort = await session.createCohort({
        name: name.trim(),
        institution: institution.trim(),
        courseId,
        term: term.trim(),
        seats,
      });
      cohorts = [cohort, ...cohorts];
      name = "";
      institution = "";
      term = "";
      note = COHORT_TEACH.create.created;
    } catch (err) {
      error = failure(COHORT_TEACH.create.failed, err);
    } finally {
      busy = null;
    }
  }

  /** Take the file away. The platform sends the CSV and the browser saves it. */
  async function downloadExport(id: string) {
    if (busy) return;
    busy = `export:${id}`;
    error = null;
    note = null;
    try {
      const text = await session.cohortExport(id);
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexora-cohort-${id}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      note = COHORT_EXPORT.done;
    } catch (err) {
      error = failure(COHORT_EXPORT.failed, err);
    } finally {
      busy = null;
    }
  }

  /** End the licence. It takes two clicks, because it cannot be undone. */
  async function endLicence(id: string) {
    if (endArmed !== id) {
      endArmed = id;
      return;
    }
    if (busy) return;
    busy = `end:${id}`;
    error = null;
    note = null;
    try {
      await session.endCohort(id);
      endArmed = null;
      note = COHORT_TEACH.end.done;
      if (openId === id) {
        openId = null;
        detail = null;
      }
      await loadCohorts();
    } catch (err) {
      error = failure(COHORT_TEACH.end.failed, err);
    } finally {
      busy = null;
    }
  }

  /** A date, as the platform wrote it, in the reader's own calendar. */
  function day(iso: string): string {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString();
  }

  /**
   * The state of a cohort, as the site describes it.
   *
   * A status the site does not have words for is treated as pending, because
   * pending is the state that grants nothing. A fourth state must never be
   * the one that quietly carries a seat.
   */
  function statusOf(status: string) {
    return COHORT_STATUS[status as keyof typeof COHORT_STATUS] ?? COHORT_STATUS.pending;
  }
</script>

<PageHead
  title={pageTitle(COHORT_TEACH.title)}
  description="The instructor's side of a NEXORA cohort: your cohorts, the join code, the roster, the export, and the licence."
  path="/teach"
/>

<div class="container-page teach-page">
  <header class="teach-hero">
    <h1 class="display teach-title">{COHORT_TEACH.title}</h1>
    <p class="teach-lede">{COHORT_TEACH.lede}</p>
  </header>

  {#if !apiConfigured}
    <div class="state-card card">
      <span class="tag">Local mode</span>
      <h2 class="state-title">There is no platform to hold a cohort.</h2>
      <p class="state-body">
        This build runs in local mode, so there is no platform to hold a cohort and nothing can be
        created. The {FREE_PHASES_PHRASE} in the IDE work offline and need no account.
      </p>
      <div class="state-action">
        <ActionLink href="/download" variant="ghost" island>{data.release.label}</ActionLink>
      </div>
    </div>
  {:else if session.restoring}
    <div class="state-card card">
      <span class="tag">Checking your session</span>
      <p class="state-body">
        Your session lives in a cookie this page cannot read, so it asks the server before it can
        say anything about your cohorts.
      </p>
    </div>
  {:else if !session.loggedIn}
    <div class="state-card card">
      <span class="tag">Signed out</span>
      <h2 class="state-title">{COHORT_TEACH.signedOut.title}</h2>
      <p class="state-body">{COHORT_TEACH.signedOut.body}</p>
      <div class="state-action">
        <ActionLink href="/auth" island>Sign in</ActionLink>
      </div>
    </div>
  {:else}
    {#if note}
      <p class="notice" data-tone="pass" role="status">{note}</p>
    {/if}
    {#if error}
      <p class="notice" data-tone="fail" role="alert">{error}</p>
    {/if}

    <div class="teach-layout">
      <div class="teach-main">
        <section aria-label={COHORT_TEACH.cohorts.label}>
          <div class="section-bar">
            <div>
              <p class="stamp section-label">{COHORT_TEACH.cohorts.label}</p>
              <h2 class="section-title">{COHORT_TEACH.cohorts.title}</h2>
            </div>
          </div>

          <!-- The file, said once, because it is the same file for every
               cohort: each one has its own, and the columns and the limits
               are the same. -->
          <div class="export-note card">
            <p class="stamp">{COHORT_EXPORT.label}</p>
            <p class="export-body">{COHORT_EXPORT.description}</p>
            <p class="export-body">{COHORT_EXPORT.whatItIsNot}</p>
            <p class="num export-header">{COHORT_EXPORT.header}</p>
          </div>

          {#if cohortsLoading}
            <p class="state-body muted-block">{COHORT_TEACH.cohorts.loading}</p>
          {:else if cohortsError}
            <p class="state-body muted-block" role="alert">{cohortsError}</p>
          {:else if cohorts.length === 0}
            <p class="state-body muted-block">{COHORT_TEACH.cohorts.empty}</p>
          {:else}
            <ul class="cohort-list">
              {#each cohorts as cohort (cohort.id)}
                <li class="cohort card">
                  <div class="cohort-head">
                    <div>
                      <h3 class="cohort-name">{cohort.name}</h3>
                      <p class="cohort-meta">{cohort.institution} · {courseTitle(cohort.courseId)} · {cohort.term}</p>
                    </div>
                    <span class="tag" class:tag-pass={cohort.status === "active"}>
                      {statusOf(cohort.status).label}
                    </span>
                  </div>

                  <div class="cohort-cols">
                    <div>
                      <dl class="cohort-facts">
                        <div>
                          <dt>{COHORT_TEACH.cohorts.members}</dt>
                          <dd class="num">{cohort.memberCount}</dd>
                        </div>
                        <div>
                          <dt>{COHORT_TEACH.cohorts.seats}</dt>
                          <dd class="num">{cohort.seats}</dd>
                        </div>
                        <div>
                          <dt>{COHORT_TEACH.cohorts.institution}</dt>
                          <dd>{cohort.institution}</dd>
                        </div>
                        <div>
                          <dt>{COHORT_TEACH.cohorts.course}</dt>
                          <dd>{courseTitle(cohort.courseId)}</dd>
                        </div>
                        <div>
                          <dt>{COHORT_TEACH.cohorts.term}</dt>
                          <dd>{cohort.term}</dd>
                        </div>
                      </dl>

                      <p class="status-body">
                        {#if cohort.status === "active"}
                          {COHORT_STATUS.active.body}
                        {:else}
                          {statusOf(cohort.status).body}
                        {/if}
                      </p>
                    </div>

                    <div class="join-side">
                      <p class="stamp">{COHORT_TEACH.cohorts.code}</p>
                      <p class="join-code num">{cohort.joinCode}</p>
                      <p class="join-hint">{COHORT_TEACH.cohorts.codeHint}</p>
                      <p class="join-share">
                        {COHORT_TEACH.cohorts.share}:
                        <a
                          class="num"
                          href={`/teach/join?code=${encodeURIComponent(cohort.joinCode)}`}
                        >
                          /teach/join?code={cohort.joinCode}
                        </a>
                      </p>
                      <div class="cohort-actions">
                        <Button variant="ghost" size="sm" onclick={() => toggleRoster(cohort.id)}>
                          {openId === cohort.id
                            ? COHORT_TEACH.cohorts.close
                            : COHORT_TEACH.cohorts.open}
                        </Button>
                        <Button
                          variant="quiet"
                          size="sm"
                          busy={busy === `export:${cohort.id}`}
                          onclick={() => downloadExport(cohort.id)}
                        >
                          {busy === `export:${cohort.id}`
                            ? COHORT_EXPORT.downloading
                            : COHORT_EXPORT.button}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {#if openId === cohort.id}
                    <div class="cohort-drawer">
                      <p class="stamp">{COHORT_TEACH.roster.label}</p>
                      <h4 class="drawer-title">{COHORT_TEACH.roster.title}</h4>
                      {#if detailLoading}
                        <p class="state-body">{COHORT_TEACH.roster.loading}</p>
                      {:else if detailError}
                        <p class="state-body" role="alert">{detailError}</p>
                      {:else if !detail || detail.members.length === 0}
                        <p class="state-body">{COHORT_TEACH.roster.empty}</p>
                        <p class="state-hint">{COHORT_TEACH.roster.emptyWhy}</p>
                      {:else}
                        <ul class="member-list">
                          {#each detail.members as member (member.userId)}
                            <li>
                              <p class="member-name">
                                {member.name || member.email}
                                <span class="member-email">· {member.email}</span>
                              </p>
                              <p class="member-joined">
                                {COHORT_TEACH.roster.joined} {day(member.joinedAt)}
                              </p>
                              <p class="stamp member-proofs">{COHORT_TEACH.roster.proofs}</p>
                              {#if member.proofs.length === 0}
                                <p class="state-body">{COHORT_TEACH.roster.noProofs}</p>
                              {:else}
                                <ul class="proof-list">
                                  {#each member.proofs as proof (proof.competencyId + proof.issuedAt)}
                                    <li>
                                      <span class="num proof-id">{proof.competencyId}</span>
                                      <span>
                                        · {proof.kind} · {proof.level} · {COHORT_TEACH.roster.proofIssued} {day(
                                          proof.issuedAt,
                                        )}
                                      </span>
                                    </li>
                                  {/each}
                                </ul>
                              {/if}
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                  {/if}

                  <!-- The licence, and what ending it does. -->
                  <div class="cohort-drawer">
                    <p class="stamp">{COHORT_TEACH.end.label}</p>
                    <h4 class="drawer-title">{COHORT_TEACH.end.title}</h4>
                    <p class="state-body">{COHORT_TEACH.end.body}</p>
                    <div class="end-action">
                      {#if endArmed === cohort.id}
                        <Button
                          variant="quiet"
                          busy={busy === `end:${cohort.id}`}
                          onclick={() => endLicence(cohort.id)}
                        >
                          {busy === `end:${cohort.id}`
                            ? COHORT_TEACH.end.working
                            : COHORT_TEACH.end.confirm}
                        </Button>
                      {:else}
                        <Button variant="quiet" onclick={() => (endArmed = cohort.id)}>
                          {COHORT_TEACH.end.button}
                        </Button>
                      {/if}
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>

      <!-- The form that makes a cohort. -->
      <div class="teach-side">
        <div class="create-card card">
          <p class="stamp">{COHORT_TEACH.create.label}</p>
          <h2 class="create-title">{COHORT_TEACH.create.title}</h2>
          <p class="create-lede">{COHORT_TEACH.create.lede}</p>

          <form onsubmit={createCohort} class="create-form">
            <label for="cohort-name" class="field-label">
              {COHORT_TEACH.create.name}
            </label>
            <input
              id="cohort-name"
              bind:value={name}
              required
              maxlength="120"
              autocomplete="off"
              placeholder={COHORT_TEACH.create.namePlaceholder}
              class="field-input"
            />

            <label for="cohort-institution" class="field-label">
              {COHORT_TEACH.create.institution}
            </label>
            <input
              id="cohort-institution"
              bind:value={institution}
              required
              maxlength="120"
              autocomplete="off"
              placeholder={COHORT_TEACH.create.institutionPlaceholder}
              class="field-input"
            />

            <label for="cohort-course" class="field-label">
              {COHORT_TEACH.create.course}
            </label>
            <select id="cohort-course" bind:value={courseId} class="field-select">
              {#each COHORT_COURSE_OPTIONS as course (course.id)}
                <option value={course.id}>{course.title}</option>
              {/each}
            </select>

            <label for="cohort-term" class="field-label">
              {COHORT_TEACH.create.term}
            </label>
            <input
              id="cohort-term"
              bind:value={term}
              required
              maxlength="60"
              autocomplete="off"
              placeholder={COHORT_TEACH.create.termPlaceholder}
              class="field-input"
            />

            <label for="cohort-seats" class="field-label">
              {COHORT_TEACH.create.seats}
            </label>
            <input
              id="cohort-seats"
              type="number"
              bind:value={seats}
              required
              min="1"
              step="1"
              class="field-input num"
            />
            <p class="field-help">{COHORT_TEACH.create.seatsHint}</p>

            <div class="create-submit">
              <Button type="submit" busy={busy === "create"}>
                {busy === "create" ? COHORT_TEACH.create.submitting : COHORT_TEACH.create.submit}
              </Button>
            </div>
          </form>
        </div>

        <div class="join-card card">
          <p class="stamp">A student joins here</p>
          <p class="join-card-body">
            Your students type the join code on
            <a href="/teach/join">/teach/join</a>, and the page there says what joining gives them
            and what it does not.
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .teach-page {
    padding-block: clamp(3rem, 6vw, 5.5rem) clamp(4rem, 8vw, 7rem);
    background:
      radial-gradient(55% 30% at 10% 0%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%);
  }

  .teach-hero {
    max-width: 58rem;
    padding-bottom: clamp(2.5rem, 5vw, 4.5rem);
  }

  .teach-title {
    max-width: 18ch;
    font-size: var(--text-page);
    color: var(--color-ink);
  }

  .teach-lede {
    margin-top: var(--space-5);
    max-width: 62ch;
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .state-card {
    max-width: 46rem;
    padding: var(--space-6);
  }

  @media (min-width: 640px) {
    .state-card {
      padding: var(--space-8);
    }
  }

  .state-title {
    margin-top: var(--space-4);
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-ink);
  }

  .state-body {
    margin-top: var(--space-3);
    max-width: 62ch;
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .state-hint {
    margin-top: var(--space-2);
    max-width: 58ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-faint);
  }

  .state-action {
    margin-top: var(--space-6);
  }

  .notice {
    margin-bottom: var(--space-6);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-pass);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-pass) 7%, var(--color-panel));
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--color-ink);
  }

  .notice[data-tone="fail"] {
    border-color: var(--color-fail);
    background: color-mix(in srgb, var(--color-fail) 6%, var(--color-panel));
  }

  .teach-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-10);
  }

  @media (min-width: 1024px) {
    .teach-layout {
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr);
      gap: clamp(2.5rem, 5vw, 4.5rem);
      align-items: start;
    }
  }

  .teach-main,
  .teach-side {
    min-width: 0;
  }

  .section-bar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 2px solid var(--color-ink);
  }

  .section-label {
    color: var(--color-faint);
  }

  .section-title {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 2.4vw, 1.9rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-ink);
  }

  .export-note {
    margin-top: var(--space-5);
    padding: var(--space-5);
    background: var(--color-raised);
    box-shadow: none;
  }

  .export-body {
    margin-top: var(--space-2);
    max-width: 66ch;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .export-header {
    margin-top: var(--space-3);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--color-faint);
    overflow-wrap: anywhere;
  }

  .muted-block {
    margin-top: var(--space-5);
  }

  .cohort-list {
    list-style: none;
    margin: var(--space-5) 0 0;
    padding: 0;
    display: grid;
    gap: var(--space-5);
  }

  .cohort {
    padding: var(--space-5);
  }

  @media (min-width: 640px) {
    .cohort {
      padding: var(--space-6);
    }
  }

  .cohort-head {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-rule);
  }

  .cohort-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: var(--color-ink);
  }

  .cohort-meta {
    margin-top: var(--space-1);
    font-size: 12.5px;
    color: var(--color-muted);
  }

  .cohort-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
    padding-top: var(--space-4);
  }

  @media (min-width: 760px) {
    .cohort-cols {
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.72fr);
      gap: var(--space-8);
    }
  }

  .cohort-facts {
    margin: 0;
    display: grid;
    gap: 0;
  }

  .cohort-facts div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-2);
    border-bottom: 1px solid var(--color-rule);
  }

  .cohort-facts dt {
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-faint);
  }

  .cohort-facts dd {
    margin: 0;
    text-align: right;
    font-size: 13.5px;
    color: var(--color-ink);
  }

  .status-body {
    margin-top: var(--space-3);
    max-width: 46ch;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .join-side {
    min-width: 0;
  }

  .join-code {
    margin-top: var(--space-2);
    font-size: 1.55rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--color-ink);
  }

  .join-hint {
    margin-top: var(--space-2);
    max-width: 42ch;
    font-size: 12px;
    line-height: 1.55;
    color: var(--color-faint);
  }

  .join-share {
    margin-top: var(--space-3);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }

  .join-share a {
    color: var(--color-accent);
    text-underline-offset: 3px;
  }

  .cohort-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .cohort-drawer {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
  }

  .drawer-title {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--color-ink);
  }

  .member-list,
  .proof-list {
    list-style: none;
    margin: var(--space-4) 0 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .member-list > li {
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule);
  }

  .member-name {
    font-size: 13.5px;
    color: var(--color-ink);
  }

  .member-email {
    color: var(--color-faint);
  }

  .member-joined {
    margin-top: var(--space-1);
    font-size: 12px;
    color: var(--color-muted);
  }

  .member-proofs {
    margin-top: var(--space-3);
    color: var(--color-faint);
  }

  .proof-list {
    margin-top: var(--space-2);
  }

  .proof-list li {
    padding-block: var(--space-2);
    border-bottom: 1px solid var(--color-rule);
    font-size: 12px;
    color: var(--color-muted);
  }

  .proof-id {
    color: var(--color-ink);
  }

  .end-action {
    margin-top: var(--space-4);
  }

  .create-card {
    padding: var(--space-6);
  }

  @media (min-width: 1024px) {
    .create-card {
      position: sticky;
      top: 92px;
    }
  }

  .create-title {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-ink);
  }

  .create-lede {
    margin-top: var(--space-3);
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .create-form {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }

  .create-form .field-label {
    margin-top: var(--space-3);
  }

  .create-submit {
    margin-top: var(--space-5);
  }

  .join-card {
    margin-top: var(--space-4);
    padding: var(--space-5);
    background:
      radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 60%),
      var(--color-raised);
    border-color: color-mix(in srgb, var(--color-accent) 30%, var(--color-rule));
    box-shadow: none;
  }

  .join-card-body {
    margin-top: var(--space-2);
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .join-card-body a {
    color: var(--color-accent);
    text-underline-offset: 3px;
  }
</style>
