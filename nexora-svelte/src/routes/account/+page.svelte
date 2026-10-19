<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { authMessage } from "$lib/auth-errors";
  import { ACCOUNT_HOME, FREE_TIER_POINTS } from "$lib/content/site";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import SessionControls from "$lib/components/SessionControls.svelte";
  import { pageTitle } from "$lib/seo";
  import { LEGAL_ENTITY, RIGHTS_RESPONSE_DAYS, RIGHT_KINDS } from "$lib/legal";

  /* The account home: the screen a learner lands on after signing in.
   *
   * It is two things in one page, and the split is deliberate. The top half
   * answers the questions a learner has when they arrive: who am I, what does
   * my plan open, what have I actually proved, and how do I get back to the
   * work. The bottom half is the data-rights surface that used to be the
   * whole page: the export, the erasure, the acceptance record and the
   * request ledger.
   *
   * The split is not a tidiness argument. The rights controls are controls
   * with a deadline on them, and a learner who has just signed in is not
   * thinking about deadlines. The first screen has to answer the question
   * that brought them here, and the controls still have to be on the same
   * page, because a page with a different address is a support request.
   *
   * What this page does NOT do is pretend. Every fact it prints comes from
   * the platform: the plan from the billing service, the evidence from the
   * attested proof ledger, the account itself from the export the service
   * produces. When a service does not answer, the page says that the answer
   * is unknown rather than showing an empty state that reads like a fact. */

  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);

  /** The account as the platform holds it: the export is the one public
      surface that names when the account was made. */
  let subject = $state<{
    id?: string;
    email?: string;
    name?: string | null;
    createdAt?: string;
    provider?: string;
  } | null>(null);
  let subjectError = $state<string | null>(null);

  let consents = $state<
    {
      document: string;
      version: string;
      purpose: string;
      basis: string;
      acceptedAt: string;
      withdrawnAt: string | null;
    }[]
  >([]);
  let requests = $state<
    {
      id: string;
      kind: string;
      status: string;
      detail: string;
      createdAt: string;
      dueAt: string;
      resolvedAt: string | null;
      resolution: string | null;
    }[]
  >([]);

  /** The plan, as the billing service holds it. */
  let subscription = $state<{
    plan: string | null;
    status: string | null;
    entitled: boolean;
    currentPeriodEnd: string | null;
  } | null>(null);
  let planLoading = $state(false);
  let planError = $state<string | null>(null);

  /** What the platform has verified. Rows are never synthesized here. */
  let proofs = $state<{ competencyId: string; level: string; kind: string; issuedAt: string }[]>([]);
  let proofsLoading = $state(false);
  let proofsError = $state<string | null>(null);

  let kind = $state<string>(RIGHT_KINDS[1].id);
  let detail = $state("");
  let nominee = $state("");
  let confirmText = $state("");
  let reason = $state("");
  let eraseArmed = $state(false);
  let deletion = $state<{
    deleted: Record<string, number>;
    retained: { category: string; reason: string; basis: string }[];
    processorsQueued: string[];
    receiptId: string;
  } | null>(null);

  /**
   * The account itself.
   *
   * Read from the export, because that is the one route the service publishes
   * that names when the account was made. A failure here is kept apart from
   * the other answers: the account is still signed in, and the page can say
   * that without the date.
   */
  async function loadSubject() {
    try {
      const exported = await session.exportAuth();
      const s = (exported as { subject?: typeof subject }).subject ?? null;
      subject = s;
      subjectError = null;
    } catch (e) {
      subjectError = authMessage(e);
    }
  }

  async function load() {
    if (!session.loggedIn) return;
    try {
      const [c, r] = await Promise.all([session.myConsents(), session.myRightsRequests()]);
      consents = c.consents;
      requests = r.requests;
    } catch (e) {
      error = authMessage(e);
    }
    void loadSubject();
  }

  /**
   * The plan and the evidence, asked once per identity.
   *
   * Each is latched on its own, because an unreachable billing service must
   * not hide the verified proof, and a failed proof read must not hide the
   * plan the learner already has. The epoch is the identity boundary: a
   * sign-in re-arms both, a token renewal does not.
   */
  let loadedFor = $state(-1);
  $effect(() => {
    const epoch = session.epoch;
    if (!apiConfigured || !session.loggedIn) return;
    if (epoch !== loadedFor) {
      loadedFor = epoch;
      planLoading = true;
      planError = null;
      proofsLoading = true;
      proofsError = null;
      Promise.allSettled([session.subscription(), session.myProofs()])
        .then(([s, v]) => {
          if (s.status === "fulfilled") {
            subscription = s.value.subscription;
          } else {
            planError = authMessage(s.reason);
          }
          if (v.status === "fulfilled") {
            proofs = v.value.proofs;
          } else {
            proofsError = authMessage(v.reason);
          }
        })
        .finally(() => {
          planLoading = false;
          proofsLoading = false;
        });
    }
  });

  $effect(() => {
    if (session.loggedIn) void load();
  });

  /**
   * Download everything the platform holds, as one file.
   *
   * Both services are asked, because the record is split across two databases and
   * an export that returned only half of it would be a worse answer than none —
   * it would look complete. Each half is labelled with the service that produced
   * it, and the file is offered as a download rather than displayed, because it is
   * the artifact a person is entitled to keep.
   */
  async function downloadEverything() {
    busy = "export";
    error = null;
    try {
      const [auth, billing] = await Promise.all([
        session.exportAuth(),
        session.exportBilling().catch(() => null),
      ]);
      const bundle = {
        format: "nexora-account-export-bundle",
        version: 1,
        generatedAt: new Date().toISOString(),
        note:
          "One file, two services. `parts[0]` is the account, consent, proof and request record held by the auth service; `parts[1]` is the subscription record held by the billing service. Each part names what it does not hold and where that lives.",
        parts: billing ? [auth, billing.export] : [auth],
        billingUnavailable: billing
          ? undefined
          : "The billing service could not be reached, so its half is missing from this file. Ask again, or write to the privacy contact and it will be sent to you.",
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexora-account-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      note = "Your file downloaded. It is the same artifact an access request returns.";
    } catch (e) {
      error = authMessage(e);
    } finally {
      busy = null;
    }
  }

  async function withdraw(doc: string) {
    busy = `withdraw:${doc}`;
    error = null;
    note = null;
    try {
      const r = await session.withdrawConsent(doc);
      note = r.effect ?? "That consent was already withdrawn, so nothing changed.";
      await load();
    } catch (e) {
      error = authMessage(e);
    } finally {
      busy = null;
    }
  }

  async function submitRequest(e: SubmitEvent) {
    e.preventDefault();
    busy = "rights";
    error = null;
    note = null;
    try {
      const r = await session.fileRightsRequest(kind, detail.trim(), nominee.trim() || undefined);
      note = r.immediate
        ? `Request recorded. ${r.immediate}`
        : `Request recorded. It will be answered by ${new Date(r.request.dueAt).toLocaleDateString()}, which is ${r.responseDays} days, the strictest of the deadlines that apply.`;
      detail = "";
      nominee = "";
      await load();
    } catch (err) {
      error = authMessage(err);
    } finally {
      busy = null;
    }
  }

  /**
   * Delete the account.
   *
   * Two steps and a typed word, because there is no undo: every session, every
   * proof and every consent goes with it, and the learner has to be able to see
   * what will be kept before they commit rather than after.
   */
  async function eraseNow() {
    busy = "erase";
    error = null;
    note = null;
    try {
      const r = await session.deleteAccount(reason.trim() || undefined);
      deletion = r;
      session.logout();
    } catch (e) {
      error = authMessage(e);
    } finally {
      busy = null;
    }
  }
</script>

<PageHead
  title={pageTitle("Your account")}
  description="Your NEXORA account: your plan, the work the platform has verified, the way into the IDE, and the controls over your own data."
  path="/account"
  noindex
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <Headline as="h1" lines={[ACCOUNT_HOME.title]} class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink" />
  <p class="mt-6 max-w-[62ch] text-[14.5px] leading-relaxed text-muted">
    {ACCOUNT_HOME.lede}
  </p>

  {#if note}
    <p class="mt-8 border border-approved px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="status">
      {note}
    </p>
  {/if}
  {#if error}
    <p class="mt-8 border border-removed px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="alert">
      {error}
    </p>
  {/if}

  {#if !apiConfigured}
    <div class="mt-10">
      <Plate>
        <p class="stamp text-review">cloud accounts not connected</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          This build runs in local mode, so there is no account and no platform record. Everything the
          IDE stores lives on your own machine and you can delete it there. The free phases work
          without an account, offline, and every check is free.
        </p>
        <div class="mt-5">
          <ActionLink href="/download" variant="ghost" size="sm" island>Download the IDE</ActionLink>
        </div>
      </Plate>
    </div>
  {:else if session.restoring}
    <div class="mt-10">
      <Plate>
        <p class="stamp text-muted">checking your session</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          Your session lives in a cookie this page cannot read, so it asks the server before it can
          say anything about your account.
        </p>
      </Plate>
    </div>
  {:else}
    {#if !session.loggedIn}
      <div class="mt-10">
        <Plate crosshair>
          <p class="stamp text-faint">signed out</p>
          <p class="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            Sign in to use these controls, they belong to an account. If you cannot sign in and still
            need a copy of your data or want it deleted, you do not need this page: write to the
            privacy contact in the notice and the same deadlines apply from that moment.
          </p>
          <div class="mt-6">
            <ActionLink href="/auth" island>Sign in</ActionLink>
          </div>
        </Plate>
      </div>
    {:else}
      <!-- 1. Who you are. -->
    <section class="mt-12" aria-label="Who you are">
      <Plate crosshair>
        <p class="stamp text-[11px] text-faint">{ACCOUNT_HOME.identity.label}</p>
        <h2 class="mt-3 text-[19px] text-ink">{ACCOUNT_HOME.identity.title}</h2>
        <dl class="mt-4 border-t border-rule text-[13.5px]">
          <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule py-3">
            <dt class="stamp text-faint">email</dt>
            <dd class="num text-ink">{subject?.email ?? session.user?.email ?? ""}</dd>
          </div>
          {#if subject?.name || session.user?.name}
            <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule py-3">
              <dt class="stamp text-faint">name</dt>
              <dd class="text-ink">{subject?.name ?? session.user?.name}</dd>
            </div>
          {/if}
          <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule py-3">
            <dt class="stamp text-faint">{ACCOUNT_HOME.identity.created}</dt>
            <dd class="text-ink">
              {#if subject?.createdAt}
                {new Date(subject.createdAt).toLocaleDateString()}
              {:else}
                <span class="text-muted">{ACCOUNT_HOME.identity.unknown}</span>
              {/if}
            </dd>
          </div>
        </dl>
        {#if subjectError}
          <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
            The account details could not be read: {subjectError}
          </p>
        {/if}
      </Plate>
    </section>

    <!-- 2. Your plan, and what it opens. -->
    <section class="mt-8" aria-label="Your plan">
      <Plate>
        <p class="stamp text-[11px] text-faint">{ACCOUNT_HOME.plan.label}</p>
        <h2 class="mt-3 text-[19px] text-ink">{ACCOUNT_HOME.plan.title}</h2>

        {#if planLoading}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">Reading your plan.</p>
        {:else if planError}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted" role="alert">
            {ACCOUNT_HOME.plan.unknown}
          </p>
          <p class="mt-2 text-[12.5px] leading-relaxed text-faint">{planError}</p>
        {:else if subscription?.entitled}
          <p class="mt-4 flex flex-wrap items-baseline gap-x-3 text-[14px]">
            <span class="stamp text-approved">pro active</span>
            <span class="text-muted">
              {subscription.plan}
              {#if subscription.currentPeriodEnd}
                · {ACCOUNT_HOME.plan.renews}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              {/if}
            </span>
          </p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">{ACCOUNT_HOME.plan.pro}</p>
          <div class="mt-5 border-t border-rule pt-5">
            <ActionLink href="/profile" variant="ghost" size="sm" island>
              {ACCOUNT_HOME.plan.manage}
            </ActionLink>
          </div>
        {:else}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">{ACCOUNT_HOME.plan.free}</p>
          <ul class="mt-3 space-y-1 text-[13px] leading-relaxed text-muted">
            <li>{FREE_TIER_POINTS[0]}</li>
            <li>{FREE_TIER_POINTS[1]}</li>
          </ul>
          <div class="mt-5 flex flex-wrap gap-3 border-t border-rule pt-5">
            <ActionLink href="/pricing" variant="ghost" size="sm" island>See pricing</ActionLink>
            <ActionLink href="/profile" variant="ghost" size="sm" island>
              {ACCOUNT_HOME.plan.manage}
            </ActionLink>
          </div>
        {/if}
        <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
          No check is ever behind the paywall. A verdict you have to pay for is not one you can
          trust.
        </p>
      </Plate>
    </section>

    <!-- 3. What you have actually proved. -->
    <section class="mt-8" aria-label="Your evidence">
      <Plate>
        <p class="stamp text-[11px] text-faint">{ACCOUNT_HOME.evidence.label}</p>
        <h2 class="mt-3 text-[19px] text-ink">{ACCOUNT_HOME.evidence.title}</h2>

        {#if proofsLoading}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">Reading the verified ledger.</p>
        {:else if proofsError}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted" role="alert">
            {proofsError}
          </p>
        {:else if proofs.length === 0}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">{ACCOUNT_HOME.evidence.empty}</p>
        {:else}
          <ul class="mt-4 border-t border-rule">
            {#each proofs as pr (pr.competencyId + pr.issuedAt)}
              <li class="border-b border-rule py-3 text-[13.5px] text-muted">
                <a href="/verify" class="num text-accent underline underline-offset-4">
                  {pr.competencyId}
                </a>
                <span> · {pr.kind} · {pr.level} · {new Date(pr.issuedAt).toLocaleDateString()}</span>
              </li>
            {/each}
          </ul>
        {/if}
        <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
          {ACCOUNT_HOME.evidence.footnote}
        </p>
      </Plate>
    </section>

    <!-- 4. The way back into the work. -->
    <section class="mt-8" aria-label="The IDE">
      <Plate>
        <p class="stamp text-[11px] text-faint">{ACCOUNT_HOME.ide.label}</p>
        <h2 class="mt-3 text-[19px] text-ink">{ACCOUNT_HOME.ide.title}</h2>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">{ACCOUNT_HOME.ide.body}</p>
        <div class="mt-5 flex flex-wrap gap-3 border-t border-rule pt-5">
          <ActionLink href="/download" variant="ghost" size="sm" island>
            {ACCOUNT_HOME.ide.download}
          </ActionLink>
          <ActionLink href="/auth/ide" variant="ghost" size="sm" island>
            {ACCOUNT_HOME.ide.ideSignIn}
          </ActionLink>
        </div>
      </Plate>
    </section>

    {/if}

    <!-- 5. The session controls that already existed, in one place.
         Mounted outside the signed-in branch on purpose: ending every
         session signs this page out, and the learner still has to read
         what happened. -->
    <div class="mt-8">
      <SessionControls
        label={ACCOUNT_HOME.session.label}
        title={ACCOUNT_HOME.session.title}
        body={ACCOUNT_HOME.session.body}
      />
    </div>

    {#if session.loggedIn}
      <!-- 6. Your data. The rights surface, unchanged in what it does. -->
      <h2 class="mt-16 text-[clamp(1.4rem,2.6vw,1.9rem)] text-ink">Your data, and your controls.</h2>
    <p class="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-muted">
      Two of the rights below work instantly, here, without asking anyone. The rest are recorded
      with the date they must be answered by, which is {RIGHTS_RESPONSE_DAYS} days, the strictest of
      the deadlines that apply to {LEGAL_ENTITY}.
    </p>

    <div class="mt-8 grid gap-8 lg:grid-cols-2">
      <!-- 6a. Access and portability. -->
      <Plate crosshair>
        <p class="stamp text-accent">access and portability</p>
        <h3 class="mt-3 text-[19px] text-ink">Download everything we hold</h3>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          One JSON file: your profile, what you accepted and when, every verified proof, your consent
          records and every request you have filed, plus your subscription record, from the service
          that holds it. Each part states what it does not include, so the file cannot mislead you
          about its own completeness.
        </p>
        <div class="mt-6">
          <Button onclick={downloadEverything} busy={busy === "export"}>
            {busy === "export" ? "Building your file…" : "Download my data"}
          </Button>
        </div>
      </Plate>

      <!-- 6b. Erasure. -->
      <Plate>
        <p class="stamp text-removed">erasure</p>
        <h3 class="mt-3 text-[19px] text-ink">Delete your account</h3>
        {#if deletion}
          <div class="mt-4 border-l border-rule pl-4">
            <p class="text-[13.5px] leading-relaxed text-ink">
              Deleted. Receipt <span class="font-mono text-[12px]">{deletion.receiptId}</span>.
            </p>
            <ul class="mt-3 space-y-1 text-[13px] leading-relaxed text-muted">
              {#each Object.entries(deletion.deleted) as [what, count] (what)}
                {#if count > 0}
                  <li>{count} × {what}</li>
                {/if}
              {/each}
            </ul>
            <p class="mt-4 stamp text-[11px] text-faint">what is kept, and why</p>
            <ul class="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
              {#each deletion.retained as r (r.category)}
                <li>
                  <span class="text-ink">{r.category}</span>
                  <span class="block text-muted">{r.reason}</span>
                  <span class="text-faint">(basis: {r.basis})</span>
                </li>
              {/each}
            </ul>
            {#if deletion.processorsQueued.length > 0}
              <p class="mt-4 text-[13px] leading-relaxed text-muted">
                Sent on to the processors that hold their own copy:
                {deletion.processorsQueued.join(", ")}.
              </p>
            {/if}
          </div>
        {:else}
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            Every session, every verified proof and every consent record goes. What cannot go is the
            transaction record, because accounting law requires it, and that is stated before you
            commit, not after.
          </p>
          <label for="erase-confirm" class="stamp mt-5 block text-faint">
            type DELETE to confirm
          </label>
          <input
            id="erase-confirm"
            bind:value={confirmText}
            autocomplete="off"
            class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            placeholder="DELETE"
          />
          <label for="erase-reason" class="stamp mt-4 block text-faint">why (optional)</label>
          <input
            id="erase-reason"
            bind:value={reason}
            class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            placeholder="no reason needed"
          />
          <div class="mt-5">
            {#if !eraseArmed}
              <Button
                variant="quiet"
                disabled={confirmText !== "DELETE"}
                onclick={() => (eraseArmed = true)}
              >
                Delete my account
              </Button>
            {:else}
              <Button variant="quiet" busy={busy === "erase"} onclick={eraseNow}>
                {busy === "erase" ? "Deleting…" : "Click again: delete permanently"}
              </Button>
            {/if}
          </div>
        {/if}
      </Plate>

      <!-- 6c. The record of what was accepted. -->
      <Plate>
        <p class="stamp text-faint">what you accepted</p>
        <h3 class="mt-3 text-[19px] text-ink">Your acceptance record</h3>
        {#if consents.length === 0}
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            No acceptance is recorded on this account yet.
          </p>
        {:else}
          <ul class="mt-4 space-y-4">
            {#each consents as c (c.document)}
              <li class="border-l border-rule pl-4">
                <p class="text-[13px] text-ink">
                  {c.document} <span class="text-faint">· version {c.version}</span>
                </p>
                <p class="mt-1 text-[12.5px] leading-relaxed text-muted">{c.purpose}</p>
                <p class="mt-1 text-[12px] text-faint">
                  basis: {c.basis} · accepted {new Date(c.acceptedAt).toLocaleDateString()}
                  {#if c.withdrawnAt}
                    · withdrawn {new Date(c.withdrawnAt).toLocaleDateString()}
                  {/if}
                </p>
                {#if !c.withdrawnAt}
                  <button
                    class="mt-2 cursor-pointer bg-transparent text-[12.5px] text-accent underline underline-offset-4"
                    disabled={busy === `withdraw:${c.document}`}
                    onclick={() => withdraw(c.document)}
                  >
                    Withdraw this acceptance
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </Plate>

      <!-- 6d. Everything that needs a person to answer it. -->
      <Plate>
        <p class="stamp text-faint">requests</p>
        <h3 class="mt-3 text-[19px] text-ink">Ask for something else</h3>
        <form onsubmit={submitRequest} class="mt-4">
          <label for="rights-kind" class="stamp block text-faint">what you are asking for</label>
          <select
            id="rights-kind"
            bind:value={kind}
            class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink"
          >
            {#each RIGHT_KINDS as r (r.id)}
              <option value={r.id}>{r.label}</option>
            {/each}
          </select>
          <p class="mt-2 text-[12.5px] leading-relaxed text-faint">
            {RIGHT_KINDS.find((r) => r.id === kind)?.note}
          </p>
          {#if kind === "nomination"}
            <label for="rights-nominee" class="stamp mt-4 block text-faint">who you are naming</label>
            <input
              id="rights-nominee"
              bind:value={nominee}
              class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
              placeholder="name and a way to reach them"
            />
          {/if}
          <label for="rights-detail" class="stamp mt-4 block text-faint">in your own words</label>
          <textarea
            id="rights-detail"
            bind:value={detail}
            required
            rows="4"
            class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            placeholder="What should we look at, correct, stop or hand over?"
          ></textarea>
          <div class="mt-5">
            <Button type="submit" busy={busy === "rights"}>Record this request</Button>
          </div>
        </form>

        {#if requests.length > 0}
          <ul class="mt-6 space-y-3 border-t border-rule pt-5">
            {#each requests as r (r.id)}
              <li class="text-[13px] leading-relaxed text-muted">
                <span class="text-ink">{r.kind}</span> · {r.status} · filed
                {new Date(r.createdAt).toLocaleDateString()} · due
                {new Date(r.dueAt).toLocaleDateString()}
                <span class="block text-faint">{r.detail}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </Plate>
    </div>

    <p class="mt-12 max-w-[70ch] text-[13px] leading-relaxed text-faint">
      These controls are the self-service route, not the only one. A request made by email to the
      privacy contact in the
      <a href="/privacy" class="text-accent underline underline-offset-4">privacy notice</a> runs on the
      same clock from the moment it arrives, including for someone who cannot sign in, or who never
      had an account. California also requires that nobody be made to create an account to ask, which
      is why that route exists as well as this page.
    </p>
    {/if}
  {/if}
</div>
