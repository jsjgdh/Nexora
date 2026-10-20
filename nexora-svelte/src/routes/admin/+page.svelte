<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import Button from "$lib/components/Button.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";
  import { ADMIN } from "$lib/content/admin";
  import { cn, timeAgo } from "$lib/format";
  import {
    adminApi,
    adminApiConfigured,
    type AdminAccountDetail,
    type AdminAccountRow,
    type AdminAction,
    type AdminOverview,
    type AdminOperator,
    type AdminRights,
  } from "$lib/admin-client";

  /* The operator's console.
   *
   * The boundary is on the platform, not here: every number on this page
   * comes from a route that refuses a caller without the operator flag, so a
   * page that rendered the console for somebody else would still show them
   * nothing. The page decides what to say, and the platform decides what is
   * true.
   *
   * The check is made in the browser rather than on the server, and that is
   * a deliberate consequence of one decision: the refresh token's cookie is
   * scoped to the session endpoints, so it travels nowhere else, and a
   * server-side gate on this route would have to widen that scope to see
   * it. The credential stays narrow, and the page asks the platform who it
   * is with the token it already holds in memory.
   *
   * The console is an instrument, so it reads like one: the numbers first,
   * the ledger second, and the actions last. Every action says what it does
   * before it does it, because the person clicking is holding somebody
   * else's account. */

  /* The name of this state is not "state": a variable called `state` would
     shadow the `$state` rune, and the compiler would read every rune in
     this file as a store subscription. */
  type ConsoleState = "checking" | "operator" | "refused" | "signed-out";
  let view = $state<ConsoleState>("checking");

  type Tab = "overview" | "accounts" | "rights" | "operators" | "activity";
  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: ADMIN.panels.overview },
    { id: "accounts", label: ADMIN.panels.accounts },
    { id: "rights", label: ADMIN.panels.rights },
    { id: "operators", label: ADMIN.panels.operators },
    { id: "activity", label: ADMIN.panels.activity },
  ];

  let tab = $state<Tab>("overview");
  let overview = $state<AdminOverview | null>(null);
  let accounts = $state<AdminAccountRow[] | null>(null);
  let detail = $state<AdminAccountDetail | null>(null);
  let rights = $state<AdminRights | null>(null);
  let operators = $state<AdminOperator[] | null>(null);
  let actions = $state<AdminAction[] | null>(null);
  let query = $state("");
  let grantEmail = $state("");
  let grantDays = $state(90);
  let grantRole = $state<"operator" | "super">("operator");
  let revokeEmail = $state("");
  let busy = $state(false);
  let note = $state<string | null>(null);
  let problem = $state<string | null>(null);

  const day = (value: string | null): string => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /**
   * Who is this? The platform answers, and its answer is the boundary.
   *
   * Three answers, and the page says which one it got, because they are
   * different facts: a signed-in learner without the flag, a visitor with no
   * session, and a platform that could not be reached. A page that called
   * the second and the third the same thing would send a real operator away
   * from the console on a bad afternoon.
   */
  async function identify(): Promise<void> {
    if (!adminApiConfigured) {
      view = "refused";
      problem = ADMIN.errors.notAnswered;
      return;
    }
    try {
      overview = await adminApi.overview();
      view = "operator";
    } catch (err) {
      const failure = err as { code?: string; status?: number };
      if (failure.code === "no_session" || failure.status === 401) {
        view = "signed-out";
        return;
      }
      view = "refused";
      problem =
        failure.code === "not_an_operator" || failure.status === 403
          ? ADMIN.errors.notOperator
          : ADMIN.errors.notAnswered;
    }
  }

  /** One failure, one sentence, and nothing changed. */
  function failed(err: unknown): void {
    const failure = err as { code?: string; status?: number };
    problem =
      failure.code === "no_session" || failure.status === 401
        ? ADMIN.errors.noSession
        : failure.code === "not_an_operator" || failure.status === 403
          ? ADMIN.errors.notOperator
          : (err as Error)?.message || ADMIN.errors.notAnswered;
  }

  async function open(next: Tab): Promise<void> {
    tab = next;
    problem = null;
    note = null;
    try {
      if (next === "overview" && !overview) overview = await adminApi.overview();
      if (next === "accounts" && !accounts) accounts = (await adminApi.accounts(query)).accounts;
      if (next === "rights" && !rights) rights = await adminApi.rights();
      if (next === "operators" && !operators) operators = (await adminApi.operators()).operators;
      if (next === "activity" && !actions) actions = (await adminApi.actions()).actions;
    } catch (err) {
      failed(err);
    }
  }

  async function search(): Promise<void> {
    busy = true;
    problem = null;
    try {
      accounts = (await adminApi.accounts(query)).accounts;
    } catch (err) {
      failed(err);
    } finally {
      busy = false;
    }
  }

  async function openAccount(id: string): Promise<void> {
    busy = true;
    problem = null;
    note = null;
    try {
      detail = await adminApi.account(id);
    } catch (err) {
      failed(err);
    } finally {
      busy = false;
    }
  }

  async function endSessions(): Promise<void> {
    if (!detail) return;
    busy = true;
    problem = null;
    note = null;
    try {
      await adminApi.endSessions(detail.account.id);
      note = ADMIN.accounts.detail.ended;
      detail = await adminApi.account(detail.account.id);
    } catch (err) {
      failed(err);
    } finally {
      busy = false;
    }
  }

  async function grant(): Promise<void> {
    if (!grantEmail.trim()) return;
    const days = Number(grantDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      problem = "Give how many days the flag holds, between 1 and 365.";
      return;
    }
    busy = true;
    problem = null;
    note = null;
    try {
      await adminApi.grant(grantEmail.trim(), grantRole, days);
      note = `${grantEmail.trim()} is an ${grantRole} for ${days} days.`;
      grantEmail = "";
      operators = (await adminApi.operators()).operators;
    } catch (err) {
      failed(err);
    } finally {
      busy = false;
    }
  }

  async function revoke(): Promise<void> {
    if (!revokeEmail.trim()) return;
    busy = true;
    problem = null;
    note = null;
    try {
      await adminApi.revoke(revokeEmail.trim());
      note = `${revokeEmail.trim()} is no longer an operator.`;
      revokeEmail = "";
      operators = (await adminApi.operators()).operators;
    } catch (err) {
      failed(err);
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    if (view === "checking") void identify();
  });
</script>

<PageHead
  title={pageTitle(ADMIN.title)}
  description="The operator's console for the NEXORA platform: accounts, data requests, operators, and the log of what was done."
  path="/admin"
  noindex
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  {#if view === "checking"}
    <div class="mx-auto max-w-[62ch]">
      <Plate>
        <p class="stamp text-muted">{ADMIN.checking.stamp}</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">{ADMIN.checking.body}</p>
      </Plate>
    </div>
  {:else if view === "signed-out"}
    <div class="mx-auto max-w-[62ch]">
      <Headline
        as="h1"
        lines={[ADMIN.signedOut.title]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <Plate>
        <p class="reading text-[15px] leading-relaxed text-muted">{ADMIN.signedOut.body}</p>
        <div class="mt-6">
          <ActionLink href="/auth">{ADMIN.signedOut.action}</ActionLink>
        </div>
      </Plate>
    </div>
  {:else if view === "refused"}
    <div class="mx-auto max-w-[62ch]">
      <Headline
        as="h1"
        lines={[ADMIN.notAnOperator.title]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <Plate>
        <p class="reading text-[15px] leading-relaxed text-muted">{ADMIN.notAnOperator.body}</p>
        {#if problem && problem !== ADMIN.errors.notOperator}
          <p class="mt-4 border-l border-review pl-4 text-[13.5px] leading-relaxed text-muted">
            {problem}
          </p>
        {/if}
        <div class="mt-6">
          <ActionLink href="/account" variant="ghost">{ADMIN.notAnOperator.back}</ActionLink>
        </div>
      </Plate>
    </div>
  {:else}
    <Headline as="h1" lines={[ADMIN.title]} class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink" />
    <p class="reading mt-6 max-w-[62ch] text-[15px] leading-relaxed text-muted">{ADMIN.lede}</p>
    <p class="mt-3 text-[13px] text-faint">
      {overview?.operator.name ?? overview?.operator.email ?? ""}
      {#if overview?.operator.role}
        <span class="ml-2">{overview.operator.role}</span>
      {/if}
      {#if overview?.operator.expiresAt}
        <span class="ml-2">{ADMIN.operators.ends} {day(overview.operator.expiresAt)}</span>
      {/if}
    </p>

    {#if note}
      <p class="mt-8 border border-approved px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="status">
        {note}
      </p>
    {/if}
    {#if problem}
      <p class="mt-8 border border-removed px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="alert">
        {problem}
      </p>
    {/if}

    <!-- The panels. One strip, one panel at a time, the way the rest of the
         site does it, and the strip is the only navigation here: this is an
         instrument, not a site. -->
    <div class="mt-10 flex border-b border-rule" role="tablist" aria-label="Console panels">
      {#each TABS as t (t.id)}
        <button
          role="tab"
          id="admin-tab-{t.id}"
          aria-selected={tab === t.id}
          aria-controls="admin-panel-{t.id}"
          onclick={() => void open(t.id)}
          class={cn(
            "cursor-pointer border-b-2 bg-transparent px-4 py-2.5 text-[13px] font-semibold",
            tab === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
          )}
        >
          {t.label}
        </button>
      {/each}
    </div>

    <!-- ===================== Overview ===================== -->
    {#if tab === "overview"}
      <div id="admin-panel-overview" role="tabpanel" aria-labelledby="admin-tab-overview" class="mt-10">
        {#if overview}
          <dl class="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {#each [
              { label: ADMIN.overview.accounts, value: overview.counts.accounts },
              { label: ADMIN.overview.verifiedAddresses, value: overview.counts.verifiedAddresses },
              { label: ADMIN.overview.activeSessions, value: overview.counts.activeSessions },
              { label: ADMIN.overview.proofs, value: overview.counts.proofs },
              { label: ADMIN.overview.operators, value: overview.counts.operators },
              { label: ADMIN.overview.openRequests, value: overview.counts.openRightsRequests },
              { label: ADMIN.overview.pendingErasures, value: overview.counts.pendingErasures },
              {
                label: ADMIN.overview.pendingProcessorDeletions,
                value: overview.counts.pendingProcessorDeletions,
              },
            ] as row (row.label)}
              <div class="bg-panel px-5 py-6">
                <dt class="text-[12.5px] leading-snug text-muted">{row.label}</dt>
                <dd class="num mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold leading-none text-ink">
                  {row.value}
                </dd>
              </div>
            {/each}
          </dl>

          <div class="mt-10 grid gap-8 lg:grid-cols-2">
            <Plate>
              <p class="stamp text-faint">{ADMIN.overview.configuration}</p>
              <dl class="mt-5 grid gap-4">
                {#each [
                  {
                    label: ADMIN.configuration.authMode,
                    value:
                      overview.configuration.authMode === "clerk"
                        ? ADMIN.configuration.authModeClerk
                        : ADMIN.configuration.authModeLocal,
                  },
                  {
                    label: ADMIN.configuration.mailConfigured,
                    value: overview.configuration.mailConfigured
                      ? ADMIN.configuration.mailOn
                      : ADMIN.configuration.mailOff,
                  },
                  {
                    label: ADMIN.configuration.meshKey,
                    value: overview.configuration.meshKeyPresent
                      ? ADMIN.configuration.meshOn
                      : ADMIN.configuration.meshOff,
                  },
                  {
                    label: ADMIN.configuration.cohortsAvailable,
                    value: overview.configuration.cohortsAvailable
                      ? ADMIN.configuration.cohortsOn
                      : ADMIN.configuration.cohortsOff,
                  },
                  {
                    label: ADMIN.configuration.ledgerAvailable,
                    value: overview.configuration.proofsAvailable
                      ? ADMIN.configuration.ledgerOn
                      : ADMIN.configuration.ledgerOff,
                  },
                ] as row (row.label)}
                  <div class="flex items-baseline gap-4 border-t border-rule pt-3 first:border-t-0 first:pt-0">
                    <dt class="max-w-[26ch] text-[13px] leading-snug text-muted">{row.label}</dt>
                    <dd class="ml-auto max-w-[34ch] text-right text-[13px] leading-snug text-ink">{row.value}</dd>
                  </div>
                {/each}
              </dl>
              <p class="mt-6 border-t border-rule pt-4 text-[12.5px] leading-relaxed text-faint">
                {ADMIN.configuration.note}
              </p>
            </Plate>

            <div>
              <p class="stamp text-faint">{ADMIN.overview.recentActions}</p>
              {#if overview.recentActions.length === 0}
                <p class="mt-4 text-[13.5px] text-muted">{ADMIN.overview.empty}</p>
              {:else}
                <ul class="mt-4 border-t border-rule">
                  {#each overview.recentActions as action (action.id)}
                    <li class="border-b border-rule py-3">
                      <p class="text-[13.5px] text-ink">{action.action}</p>
                      <p class="mt-1 text-[12.5px] text-faint">
                        {action.detail ?? action.target ?? ""}
                        {action.createdAt ? ` · ${timeAgo(action.createdAt)}` : ""}
                      </p>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        {:else}
          <p class="text-[13.5px] text-muted">{ADMIN.errors.notAnswered}</p>
        {/if}
      </div>
    {/if}

    <!-- ===================== Accounts ===================== -->
    {#if tab === "accounts"}
      <div id="admin-panel-accounts" role="tabpanel" aria-labelledby="admin-tab-accounts" class="mt-10">
        <form
          class="flex flex-wrap items-end gap-3"
          onsubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div class="min-w-[16rem] flex-1">
            <label for="admin-search" class="stamp block text-faint">{ADMIN.accounts.search}</label>
            <input
              id="admin-search"
              bind:value={query}
              autocomplete="off"
              class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
            />
          </div>
          <Button type="submit" busy={busy}>{ADMIN.accounts.searchButton}</Button>
        </form>

        {#if accounts}
          {#if accounts.length === 0}
            <p class="mt-8 text-[13.5px] text-muted">{ADMIN.accounts.empty}</p>
          {:else}
            <div class="mt-8 overflow-x-auto">
              <table class="w-full border-collapse text-left">
                <thead>
                  <tr class="border-b border-rule-strong">
                    <th class="stamp py-3 pr-4 text-faint">{ADMIN.accounts.columns.address}</th>
                    <th class="stamp py-3 pr-4 text-faint">{ADMIN.accounts.columns.created}</th>
                    <th class="stamp py-3 pr-4 text-faint">{ADMIN.accounts.columns.sessions}</th>
                    <th class="stamp py-3 pr-4 text-faint">{ADMIN.accounts.columns.proofs}</th>
                    <th class="stamp py-3 pr-4 text-faint">{ADMIN.accounts.columns.requests}</th>
                    <th class="stamp py-3 text-faint"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each accounts as account (account.id)}
                    <tr class="border-b border-rule">
                      <td class="py-3 pr-4 text-[13.5px] text-ink">
                        {account.email}
                        {#if account.name}
                          <span class="block text-[12.5px] text-faint">{account.name}</span>
                        {/if}
                      </td>
                      <td class="num py-3 pr-4 text-[13px] text-muted">{day(account.createdAt)}</td>
                      <td class="num py-3 pr-4 text-[13px] text-muted">{account.sessions}</td>
                      <td class="num py-3 pr-4 text-[13px] text-muted">{account.proofs}</td>
                      <td class="num py-3 pr-4 text-[13px] text-muted">{account.requests}</td>
                      <td class="py-3">
                        <button
                          class="cursor-pointer text-[13px] font-semibold text-accent underline underline-offset-4"
                          onclick={() => void openAccount(account.id)}
                        >
                          {ADMIN.accounts.open}
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}

        {#if detail}
          <div class="mt-12 border-t border-rule pt-10">
            <h2 class="display text-[clamp(1.3rem,2.4vw,1.8rem)] text-ink">
              {ADMIN.accounts.detail.account}
            </h2>
            <dl class="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt class="stamp text-faint">{ADMIN.accounts.columns.address}</dt>
                <dd class="mt-1 text-[14px] text-ink">{detail.account.email}</dd>
              </div>
              <div>
                <dt class="stamp text-faint">{ADMIN.accounts.columns.created}</dt>
                <dd class="num mt-1 text-[14px] text-ink">{day(detail.account.createdAt)}</dd>
              </div>
              <div>
                <dt class="stamp text-faint">{ADMIN.accounts.columns.verified}</dt>
                <dd class="mt-1 text-[14px] text-ink">
                  {detail.account.emailVerified ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt class="stamp text-faint">Id</dt>
                <dd class="num mt-1 break-all text-[12.5px] text-muted">{detail.account.id}</dd>
              </div>
            </dl>

            <div class="mt-10">
              <p class="stamp text-faint">{ADMIN.accounts.detail.sessions}</p>
              {#if detail.sessions.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">{ADMIN.accounts.detail.noSessions}</p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each detail.sessions as s (s.id)}
                    <li class="flex flex-wrap items-baseline gap-3 border-b border-rule py-2.5">
                      <span class="num text-[12.5px] text-faint">{day(s.createdAt)}</span>
                      <span class="text-[13px] text-ink">
                        {s.active ? "Live" : "Ended"}
                      </span>
                      <span class="num text-[12.5px] text-faint">until {day(s.expiresAt)}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="mt-10">
              <p class="stamp text-faint">{ADMIN.accounts.detail.proofs}</p>
              {#if detail.proofs.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">
                  {detail.proofsAvailable ? ADMIN.accounts.detail.noProofs : ADMIN.accounts.detail.noProofsHere}
                </p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each detail.proofs as proof (proof.competencyId + proof.issuedAt)}
                    <li class="flex flex-wrap items-baseline gap-3 border-b border-rule py-2.5">
                      <span class="num text-[12.5px] text-faint">{proof.competencyId}</span>
                      <span class="text-[13px] text-ink">{proof.level}</span>
                      <span class="text-[12.5px] text-faint">{proof.kind}</span>
                      <span class="num text-[12.5px] text-faint">{day(proof.issuedAt)}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="mt-10">
              <p class="stamp text-faint">{ADMIN.accounts.detail.consents}</p>
              {#if detail.consents.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">{ADMIN.accounts.detail.noConsents}</p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each detail.consents as consent (consent.document)}
                    <li class="flex flex-wrap items-baseline gap-3 border-b border-rule py-2.5">
                      <span class="text-[13px] text-ink">{consent.document}</span>
                      <span class="num text-[12.5px] text-faint">{consent.version}</span>
                      <span class="text-[12.5px] text-faint">{consent.purpose}</span>
                      <span class="num text-[12.5px] text-faint">{day(consent.acceptedAt)}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="mt-10">
              <p class="stamp text-faint">{ADMIN.accounts.detail.requests}</p>
              {#if detail.requests.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">{ADMIN.accounts.detail.noRequests}</p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each detail.requests as request (request.id)}
                    <li class="border-b border-rule py-3">
                      <p class="text-[13px] text-ink">{request.kind}</p>
                      <p class="mt-1 text-[12.5px] text-faint">
                        {request.status} · due {day(request.dueAt)}
                      </p>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="mt-10">
              <p class="stamp text-faint">{ADMIN.accounts.detail.cohorts}</p>
              {#if detail.cohorts.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">{ADMIN.accounts.detail.noCohorts}</p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each detail.cohorts as cohort (cohort.id)}
                    <li class="flex flex-wrap items-baseline gap-3 border-b border-rule py-2.5">
                      <span class="text-[13px] text-ink">{cohort.name}</span>
                      <span class="num text-[12.5px] text-faint">{cohort.courseId}</span>
                      <span class="text-[12.5px] text-faint">{cohort.term}</span>
                      <span class="text-[12.5px] text-faint">{cohort.status}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="mt-10 border-t border-rule pt-8">
              <p class="text-[14px] font-semibold text-ink">{ADMIN.accounts.detail.endSessions}</p>
              <p class="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-muted">
                {ADMIN.accounts.detail.endSessionsNote}
              </p>
              <div class="mt-4">
                <Button variant="ghost" busy={busy} onclick={() => void endSessions()}>
                  {ADMIN.accounts.detail.endSessions}
                </Button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- ===================== Data requests ===================== -->
    {#if tab === "rights"}
      <div id="admin-panel-rights" role="tabpanel" aria-labelledby="admin-tab-rights" class="mt-10">
        <p class="reading max-w-[62ch] text-[14px] leading-relaxed text-muted">{ADMIN.rights.note}</p>
        {#if rights}
          <div class="mt-10">
            <p class="stamp text-faint">{ADMIN.rights.requests}</p>
            {#if rights.requests.length === 0}
              <p class="mt-3 text-[13.5px] text-muted">{ADMIN.rights.noRequests}</p>
            {:else}
              <div class="mt-3 overflow-x-auto">
                <table class="w-full border-collapse text-left">
                  <thead>
                    <tr class="border-b border-rule-strong">
                      <th class="stamp py-3 pr-4 text-faint">{ADMIN.rights.columns.kind}</th>
                      <th class="stamp py-3 pr-4 text-faint">{ADMIN.rights.columns.who}</th>
                      <th class="stamp py-3 pr-4 text-faint">{ADMIN.rights.columns.due}</th>
                      <th class="stamp py-3 text-faint">{ADMIN.rights.columns.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each rights.requests as request (request.id)}
                      <tr class="border-b border-rule">
                        <td class="py-3 pr-4 text-[13.5px] text-ink">{request.kind}</td>
                        <td class="py-3 pr-4 text-[13px] text-muted">{request.email ?? ""}</td>
                        <td class="num py-3 pr-4 text-[13px] text-muted">{day(request.dueAt)}</td>
                        <td class="py-3 text-[13px] text-muted">{request.status}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>

          <div class="mt-10 grid gap-8 lg:grid-cols-2">
            <div>
              <p class="stamp text-faint">{ADMIN.rights.erasures}</p>
              {#if rights.erasures.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">{ADMIN.rights.noErasures}</p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each rights.erasures as erasure (erasure.id)}
                    <li class="border-b border-rule py-3">
                      <p class="num text-[12.5px] text-faint">{day(erasure.completedAt)}</p>
                      <p class="mt-1 text-[13px] text-ink">{erasure.reason ?? ""}</p>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            <div>
              <p class="stamp text-faint">{ADMIN.rights.processors}</p>
              {#if rights.processorDeletions.length === 0}
                <p class="mt-3 text-[13.5px] text-muted">{ADMIN.rights.noProcessors}</p>
              {:else}
                <ul class="mt-3 border-t border-rule">
                  {#each rights.processorDeletions as deletion (deletion.id)}
                    <li class="border-b border-rule py-3">
                      <p class="text-[13px] text-ink">{deletion.provider}</p>
                      <p class="mt-1 text-[12.5px] text-faint">
                        {deletion.email ?? ""} · {day(deletion.completedAt)}
                      </p>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>

          <p class="mt-8 max-w-[62ch] text-[13px] leading-relaxed text-faint">{ADMIN.rights.erasureNote}</p>
        {:else}
          <p class="mt-8 text-[13.5px] text-muted">{ADMIN.errors.notAnswered}</p>
        {/if}
      </div>
    {/if}

    <!-- ===================== Operators ===================== -->
    {#if tab === "operators"}
      <div id="admin-panel-operators" role="tabpanel" aria-labelledby="admin-tab-operators" class="mt-10">
        {#if operators}
          <ul class="border-t border-rule">
            {#each operators as operator (operator.id)}
              <li class="flex flex-wrap items-baseline gap-3 border-b border-rule py-3">
                <span class="text-[13.5px] text-ink">{operator.email}</span>
                <span class="num text-[12.5px] text-faint">{operator.role}</span>
                <span class="num text-[12.5px] text-faint">
                  {ADMIN.operators.granted} {day(operator.grantedAt)}
                </span>
                <span class="num text-[12.5px] text-faint">
                  {operator.expiresAt ? `${ADMIN.operators.ends} ${day(operator.expiresAt)}` : ADMIN.operators.noEnd}
                </span>
                {#if !operator.live}
                  <span class="text-[12.5px] text-removed">{ADMIN.operators.ended}</span>
                {/if}
                {#if operator.grantedBy}
                  <span class="text-[12.5px] text-faint">
                    {ADMIN.operators.by} {operator.grantedBy}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-[13.5px] text-muted">{ADMIN.errors.notAnswered}</p>
        {/if}

        <div class="mt-10 grid gap-8 lg:grid-cols-2">
          <Plate>
            <p class="stamp text-faint">{ADMIN.operators.grant}</p>
            <p class="mt-3 max-w-[48ch] text-[13px] leading-relaxed text-muted">{ADMIN.operators.grantNote}</p>
            {#if overview?.operator.role === "super"}
              <form
                class="mt-4"
                onsubmit={(e) => {
                  e.preventDefault();
                  void grant();
                }}
              >
                <label for="admin-grant" class="stamp block text-faint">Email</label>
                <input
                  id="admin-grant"
                  type="email"
                  bind:value={grantEmail}
                  autocomplete="off"
                  class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
                />
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label for="admin-grant-days" class="stamp block text-faint">
                      {ADMIN.operators.days}
                    </label>
                    <input
                      id="admin-grant-days"
                      type="number"
                      min="1"
                      max="365"
                      bind:value={grantDays}
                      class="num mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
                    />
                  </div>
                  <div>
                    <label for="admin-grant-role" class="stamp block text-faint">
                      {ADMIN.operators.role}
                    </label>
                    <select
                      id="admin-grant-role"
                      bind:value={grantRole}
                      class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
                    >
                      <option value="operator">{ADMIN.operators.roleOperator}</option>
                      <option value="super">{ADMIN.operators.roleSuper}</option>
                    </select>
                  </div>
                </div>
                <div class="mt-4">
                  <Button type="submit" busy={busy}>{ADMIN.operators.grantButton}</Button>
                </div>
              </form>
            {:else}
              <p class="mt-4 border-l border-rule pl-4 text-[13px] leading-relaxed text-faint">
                {ADMIN.operators.superOnly}
              </p>
            {/if}
          </Plate>

          <Plate>
            <p class="stamp text-faint">{ADMIN.operators.revoke}</p>
            <p class="mt-3 max-w-[48ch] text-[13px] leading-relaxed text-muted">{ADMIN.operators.selfNote}</p>
            <form
              class="mt-4"
              onsubmit={(e) => {
                e.preventDefault();
                void revoke();
              }}
            >
              <label for="admin-revoke" class="stamp block text-faint">Email</label>
              <input
                id="admin-revoke"
                type="email"
                bind:value={revokeEmail}
                autocomplete="off"
                class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
              />
              <div class="mt-4">
                <Button type="submit" variant="ghost" busy={busy}>{ADMIN.operators.revokeButton}</Button>
              </div>
            </form>
          </Plate>
        </div>
      </div>
    {/if}

    <!-- ===================== Activity ===================== -->
    {#if tab === "activity"}
      <div id="admin-panel-activity" role="tabpanel" aria-labelledby="admin-tab-activity" class="mt-10">
        {#if actions}
          {#if actions.length === 0}
            <p class="text-[13.5px] text-muted">{ADMIN.activity.empty}</p>
          {:else}
            <ul class="border-t border-rule">
              {#each actions as action (action.id)}
                <li class="border-b border-rule py-3">
                  <p class="text-[13.5px] text-ink">{action.action}</p>
                  <p class="mt-1 text-[12.5px] text-faint">
                    {action.detail ?? action.target ?? ""}
                    {action.createdAt ? ` · ${timeAgo(action.createdAt)}` : ""}
                  </p>
                  <!-- The route and the request id are what turn a row into an
                       answer: the route says what was read, the request id ties
                       the row to the request's own log lines. -->
                  <p class="mt-1 font-mono text-[11.5px] text-faint">
                    {action.route ?? ""}{action.target ? ` · ${action.target}` : ""}
                    {action.requestId ? ` · request ${action.requestId}` : ""}
                  </p>
                </li>
              {/each}
            </ul>
            <p class="mt-4 text-[12.5px] leading-relaxed text-faint">{ADMIN.activity.note}</p>
          {/if}
        {:else}
          <p class="text-[13.5px] text-muted">{ADMIN.errors.notAnswered}</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>
