<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { AUTH_MESSAGES } from "$lib/auth-errors";
  import {
    CAMPUS,
    COHORT_COURSE_OPTIONS,
    COHORT_EXPORT,
    COHORT_STATUS,
    COHORT_TEACH,
  } from "$lib/content/site";
  import { courseTitle, type Cohort, type CohortDetail } from "$lib/cohorts";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";

  /* The instructor's page.
   *
   * A front door for a lecturer, not a classroom. It holds the cohorts they
   * teach, the code that goes on a slide, the roster with what the platform
   * has verified for each member, the file, and the way to end a licence.
   *
   * The state that matters most is the licence. A cohort that is pending is
   * waiting for the studio to confirm it, and while it waits the students who
   * join get the nine free phases and nothing more. So the page says that in
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
  let seats = $state<number>(CAMPUS.minStudents);

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

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <Headline
    as="h1"
    lines={[COHORT_TEACH.title]}
    class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
  />
  <p class="reading mt-6 max-w-[62ch] text-[15px] leading-relaxed text-muted">
    {COHORT_TEACH.lede}
  </p>

  {#if !apiConfigured}
    <div class="mt-10">
      <Plate>
        <p class="stamp text-review">cloud accounts not connected</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          This build runs in local mode, so there is no platform to hold a cohort and nothing can be
          created. The nine free phases in the IDE work offline and need no account.
        </p>
      </Plate>
    </div>
  {:else if session.restoring}
    <div class="mt-10">
      <Plate>
        <p class="stamp text-muted">checking your session</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          Your session lives in a cookie this page cannot read, so it asks the server before it can
          say anything about your cohorts.
        </p>
      </Plate>
    </div>
  {:else if !session.loggedIn}
    <div class="mt-10">
      <Plate crosshair>
        <p class="stamp text-faint">signed out</p>
        <h2 class="mt-3 text-[19px] text-ink">{COHORT_TEACH.signedOut.title}</h2>
        <p class="mt-3 max-w-[56ch] text-[13.5px] leading-relaxed text-muted">
          {COHORT_TEACH.signedOut.body}
        </p>
        <div class="mt-6">
          <ActionLink href="/auth" island>Sign in</ActionLink>
        </div>
      </Plate>
    </div>
  {:else}
    <div class="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-16">
      <!-- The cohorts, the roster, the file, the licence. -->
      <div class="min-w-0">
        {#if note}
          <p class="mb-8 border-l border-approved pl-4 text-[13.5px] leading-relaxed text-ink" role="status">
            {note}
          </p>
        {/if}
        {#if error}
          <p class="mb-8 border-l border-removed pl-4 text-[13.5px] leading-relaxed text-ink" role="alert">
            {error}
          </p>
        {/if}

        <section aria-label={COHORT_TEACH.cohorts.label}>
          <p class="stamp text-[11px] text-faint">{COHORT_TEACH.cohorts.label}</p>
          <h2 class="mt-3 text-[19px] text-ink">{COHORT_TEACH.cohorts.title}</h2>

          <!-- The file, said once, because it is the same file for every
               cohort: each one has its own, and the columns and the limits
               are the same. -->
          <div class="mt-6 border-t border-rule pt-5">
            <p class="stamp text-[11px] text-faint">{COHORT_EXPORT.label}</p>
            <p class="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-muted">
              {COHORT_EXPORT.description}
            </p>
            <p class="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-muted">
              {COHORT_EXPORT.whatItIsNot}
            </p>
            <p class="num mt-2 text-[12px] leading-relaxed text-faint break-all">
              {COHORT_EXPORT.header}
            </p>
          </div>

          {#if cohortsLoading}
            <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
              {COHORT_TEACH.cohorts.loading}
            </p>
          {:else if cohortsError}
            <p class="mt-4 text-[13.5px] leading-relaxed text-muted" role="alert">
              {cohortsError}
            </p>
          {:else if cohorts.length === 0}
            <p class="mt-4 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              {COHORT_TEACH.cohorts.empty}
            </p>
          {:else}
            <ul class="mt-6 border-t border-rule">
              {#each cohorts as cohort (cohort.id)}
                <li class="border-b border-rule py-6">
                  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-10">
                    <div class="min-w-0">
                      <h3 class="text-[17px] leading-snug text-ink">{cohort.name}</h3>
                      <dl class="mt-3 border-t border-rule text-[13px]">
                        <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                          <dt class="stamp text-faint">{COHORT_TEACH.cohorts.institution}</dt>
                          <dd class="text-ink">{cohort.institution}</dd>
                        </div>
                        <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                          <dt class="stamp text-faint">{COHORT_TEACH.cohorts.course}</dt>
                          <dd class="text-ink">{courseTitle(cohort.courseId)}</dd>
                        </div>
                        <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                          <dt class="stamp text-faint">{COHORT_TEACH.cohorts.term}</dt>
                          <dd class="text-ink">{cohort.term}</dd>
                        </div>
                        <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                          <dt class="stamp text-faint">{COHORT_TEACH.cohorts.members}</dt>
                          <dd class="num text-ink">{cohort.memberCount}</dd>
                        </div>
                        <div class="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-2">
                          <dt class="stamp text-faint">{COHORT_TEACH.cohorts.seats}</dt>
                          <dd class="num text-ink">{cohort.seats}</dd>
                        </div>
                      </dl>
                    </div>

                    <div class="min-w-0">
                      <p class="stamp text-[11px] text-faint">{COHORT_TEACH.cohorts.status}</p>
                      <p
                        class="mt-2 stamp {cohort.status === 'active'
                          ? 'text-approved'
                          : cohort.status === 'ended'
                            ? 'text-faint'
                            : 'text-review'}"
                      >
                        {statusOf(cohort.status).label}
                      </p>
                      <p class="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
                        {#if cohort.status === "active"}
                          {COHORT_STATUS.active.body}
                        {:else}
                          {statusOf(cohort.status).body}
                        {/if}
                      </p>

                      <p class="mt-5 stamp text-[11px] text-faint">{COHORT_TEACH.cohorts.code}</p>
                      <p class="num mt-2 text-[22px] tracking-[0.12em] text-ink">{cohort.joinCode}</p>
                      <p class="mt-2 max-w-[46ch] text-[12.5px] leading-relaxed text-faint">
                        {COHORT_TEACH.cohorts.codeHint}
                      </p>
                      <p class="mt-3 text-[12.5px] leading-relaxed text-muted">
                        {COHORT_TEACH.cohorts.share}:
                        <a
                          class="num text-accent underline underline-offset-4"
                          href={`/teach/join?code=${encodeURIComponent(cohort.joinCode)}`}
                        >
                          /teach/join?code={cohort.joinCode}
                        </a>
                      </p>

                      <div class="mt-5 flex flex-wrap gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => toggleRoster(cohort.id)}
                        >
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
                    <div class="mt-6 border-t border-rule pt-5">
                      <p class="stamp text-[11px] text-faint">{COHORT_TEACH.roster.label}</p>
                      <h4 class="mt-2 text-[16px] text-ink">{COHORT_TEACH.roster.title}</h4>
                      {#if detailLoading}
                        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
                          {COHORT_TEACH.roster.loading}
                        </p>
                      {:else if detailError}
                        <p class="mt-3 text-[13.5px] leading-relaxed text-muted" role="alert">
                          {detailError}
                        </p>
                      {:else if !detail || detail.members.length === 0}
                        <p class="mt-3 max-w-[56ch] text-[13.5px] leading-relaxed text-muted">
                          {COHORT_TEACH.roster.empty}
                        </p>
                        <p class="mt-2 max-w-[56ch] text-[12.5px] leading-relaxed text-faint">
                          {COHORT_TEACH.roster.emptyWhy}
                        </p>
                      {:else}
                        <ul class="mt-4 border-t border-rule">
                          {#each detail.members as member (member.userId)}
                            <li class="border-b border-rule py-4">
                              <p class="text-[14px] text-ink">
                                {member.name || member.email}
                                <span class="text-faint">· {member.email}</span>
                              </p>
                              <p class="mt-1 text-[12.5px] text-muted">
                                {COHORT_TEACH.roster.joined} {day(member.joinedAt)}
                              </p>
                              <p class="mt-2 stamp text-[11px] text-faint">
                                {COHORT_TEACH.roster.proofs}
                              </p>
                              {#if member.proofs.length === 0}
                                <p class="mt-1 max-w-[56ch] text-[13px] leading-relaxed text-muted">
                                  {COHORT_TEACH.roster.noProofs}
                                </p>
                              {:else}
                                <ul class="mt-2 border-t border-rule">
                                  {#each member.proofs as proof (proof.competencyId + proof.issuedAt)}
                                    <li class="border-b border-rule py-2 text-[12.5px] text-muted">
                                      <span class="num text-ink">{proof.competencyId}</span>
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
                  <div class="mt-5 border-t border-rule pt-5">
                    <p class="stamp text-[11px] text-faint">{COHORT_TEACH.end.label}</p>
                    <h4 class="mt-2 text-[16px] text-ink">{COHORT_TEACH.end.title}</h4>
                    <p class="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-muted">
                      {COHORT_TEACH.end.body}
                    </p>
                    <div class="mt-4">
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
                        <Button
                          variant="quiet"
                          onclick={() => (endArmed = cohort.id)}
                        >
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
      <div class="min-w-0">
        <Plate crosshair>
          <p class="stamp text-[11px] text-faint">{COHORT_TEACH.create.label}</p>
          <h2 class="mt-3 text-[19px] text-ink">{COHORT_TEACH.create.title}</h2>
          <p class="mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-muted">
            {COHORT_TEACH.create.lede}
          </p>

          <form onsubmit={createCohort} class="mt-6">
            <label for="cohort-name" class="stamp block text-faint">
              {COHORT_TEACH.create.name}
            </label>
            <input
              id="cohort-name"
              bind:value={name}
              required
              maxlength="120"
              autocomplete="off"
              placeholder={COHORT_TEACH.create.namePlaceholder}
              class="mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            />

            <label for="cohort-institution" class="stamp mt-5 block text-faint">
              {COHORT_TEACH.create.institution}
            </label>
            <input
              id="cohort-institution"
              bind:value={institution}
              required
              maxlength="120"
              autocomplete="off"
              placeholder={COHORT_TEACH.create.institutionPlaceholder}
              class="mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            />

            <label for="cohort-course" class="stamp mt-5 block text-faint">
              {COHORT_TEACH.create.course}
            </label>
            <select
              id="cohort-course"
              bind:value={courseId}
              class="mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
            >
              {#each COHORT_COURSE_OPTIONS as course (course.id)}
                <option value={course.id}>{course.title}</option>
              {/each}
            </select>

            <label for="cohort-term" class="stamp mt-5 block text-faint">
              {COHORT_TEACH.create.term}
            </label>
            <input
              id="cohort-term"
              bind:value={term}
              required
              maxlength="60"
              autocomplete="off"
              placeholder={COHORT_TEACH.create.termPlaceholder}
              class="mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            />

            <label for="cohort-seats" class="stamp mt-5 block text-faint">
              {COHORT_TEACH.create.seats}
            </label>
            <input
              id="cohort-seats"
              type="number"
              bind:value={seats}
              required
              min="1"
              step="1"
              class="num mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
            />
            <p class="mt-2 max-w-[48ch] text-[12.5px] leading-relaxed text-faint">
              {COHORT_TEACH.create.seatsHint}
            </p>

            <div class="mt-6">
              <Button type="submit" busy={busy === "create"}>
                {busy === "create" ? COHORT_TEACH.create.submitting : COHORT_TEACH.create.submit}
              </Button>
            </div>
          </form>
        </Plate>

        <div class="mt-6">
          <Plate>
            <p class="stamp text-[11px] text-faint">a student joins here</p>
            <p class="mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-muted">
              Your students type the join code on
              <a class="text-accent underline underline-offset-4" href="/teach/join">/teach/join</a>,
              and the page there says what joining gives them and what it does not.
            </p>
          </Plate>
        </div>
      </div>
    </div>
  {/if}
</div>
