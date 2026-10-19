<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiConfigured, session } from "$lib/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";
  import { LEGAL_ENTITY, RIGHTS_RESPONSE_DAYS, RIGHT_KINDS } from "$lib/legal";

  /* The account page, and the only place in the product where a right is a
     control rather than a paragraph.

     Every one of these buttons exists because a regime names a deadline: GDPR
     Arts. 15-21 (one month), California §1798.105-.115 (45 days), India's DPDP
     Act (erasure, correction, grievance). A right with no mechanism still runs on
     its clock — that is exactly what the CNIL fined an employer 300 000 EUR over
     in 2026, where 166 of 265 people were never told what happened to their
     request. So the page is built so the two rights that can be immediate are
     immediate, and the rest are recorded with the date they must be answered by.

     What it does NOT do is pretend: deleting an account leaves the transaction
     record behind, because accounting law requires it, and the deletion response
     says so in the same breath as it says what was removed. */

  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);

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

  async function load() {
    if (!session.loggedIn) return;
    try {
      const [c, r] = await Promise.all([session.myConsents(), session.myRightsRequests()]);
      consents = c.consents;
      requests = r.requests;
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load your records.";
    }
  }

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
      error = e instanceof Error ? e.message : "Could not build your export.";
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
      note = r.effect ?? "That consent was already withdrawn — nothing changed.";
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not withdraw that consent.";
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
        : `Request recorded. It will be answered by ${new Date(r.request.dueAt).toLocaleDateString()} — ${r.responseDays} days, the strictest of the deadlines that apply.`;
      detail = "";
      nominee = "";
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not record that request.";
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
      error = e instanceof Error ? e.message : "Could not delete the account.";
    } finally {
      busy = null;
    }
  }
</script>

<PageHead
  title={pageTitle("Your account and your data")}
  description="Download everything held about you, delete your account, withdraw a consent, or file a rights request — each with the deadline it runs on."
  path="/account"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <Headline as="h1" lines={["Your data, and your controls."]} class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink" />
  <p class="mt-6 max-w-[62ch] text-[14.5px] leading-relaxed text-muted">
    Two of the rights below work instantly, here, without asking anyone. The rest are recorded with
    the date they must be answered by — {RIGHTS_RESPONSE_DAYS} days, the strictest of the deadlines
    that apply to {LEGAL_ENTITY}.
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
          IDE stores lives on your own machine and you can delete it there.
        </p>
      </Plate>
    </div>
  {:else if session.restoring}
    <div class="mt-10">
      <Plate>
        <p class="stamp text-muted">checking your session</p>
      </Plate>
    </div>
  {:else if !session.loggedIn}
    <div class="mt-10">
      <Plate crosshair>
        <p class="stamp text-faint">signed out</p>
        <p class="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
          Sign in to use these controls — they belong to an account. If you cannot sign in and still
          need a copy of your data or want it deleted, you do not need this page: write to the privacy
          contact in the notice and the same deadlines apply from that moment.
        </p>
        <div class="mt-6">
          <ActionLink href="/auth" island>Sign in</ActionLink>
        </div>
      </Plate>
    </div>
  {:else}
    <div class="mt-12 grid gap-8 lg:grid-cols-2">
      <!-- 1. Access and portability. -->
      <Plate crosshair>
        <p class="stamp text-accent">access and portability</p>
        <h2 class="mt-3 text-[19px] text-ink">Download everything we hold</h2>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          One JSON file: your profile, what you accepted and when, every verified proof, your consent
          records and every request you have filed — plus your subscription record, from the service
          that holds it. Each part states what it does not include, so the file cannot mislead you
          about its own completeness.
        </p>
        <div class="mt-6">
          <Button onclick={downloadEverything} busy={busy === "export"}>
            {busy === "export" ? "Building your file…" : "Download my data"}
          </Button>
        </div>
      </Plate>

      <!-- 2. Erasure. -->
      <Plate>
        <p class="stamp text-removed">erasure</p>
        <h2 class="mt-3 text-[19px] text-ink">Delete your account</h2>
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
                  — {r.reason}
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
            transaction record — accounting law requires it — and that is stated before you commit,
            not after.
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

      <!-- 3. The record of what was accepted. -->
      <Plate>
        <p class="stamp text-faint">what you accepted</p>
        <h2 class="mt-3 text-[19px] text-ink">Your acceptance record</h2>
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

      <!-- 4. Everything that needs a person to answer it. -->
      <Plate>
        <p class="stamp text-faint">requests</p>
        <h2 class="mt-3 text-[19px] text-ink">Ask for something else</h2>
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
      same clock from the moment it arrives — including for someone who cannot sign in, or who never
      had an account. California also requires that nobody be made to create an account to ask, which
      is why that route exists as well as this page.
    </p>
  {/if}
</div>
