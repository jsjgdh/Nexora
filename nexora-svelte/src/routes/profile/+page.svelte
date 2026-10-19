<script lang="ts">
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { openBillingPortal, startCheckout } from "$lib/billing";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";

  /* The account page, after the pivot: there is one way to learn, and it is
     the desktop IDE. This page holds the account, the plan, the billing
     portal, and verified proof the platform itself attested — never browser
     progress, XP, diagnostics, or a curriculum record. Practice stays in the
     IDE; what this site shows as verified is only what its own signatures
     verify, re-derivable at /verify. */

  // Billing state (cloud only; loaded lazily when signed in).
  // `billingLoaded` means "an attempt has settled for the current account" — it
  // is set in the effect's `finally`, so a FAILED attempt latches too. That is
  // the whole point: an unreachable billing service is asked exactly once, not
  // re-triggered by the very effect that ran it (the old code set `billingLoaded`
  // only on success, so a failure left the guard open and the `finally` flipping
  // `billingLoading` back to false re-ran the effect in a loop).
  // `billingAttemptedEpoch` records the `session.epoch` the latch belongs to, so
  // a sign-in or account switch re-arms exactly one fresh attempt, while a token
  // renewal — which never bumps `epoch` — does not re-hit billing.
  let billingLoaded = $state(false);
  let billingAttemptedEpoch = $state(-1);
  let billingLoading = $state(false);
  let billingError = $state<string | null>(null);
  let plans = $state<{ slug: string; name: string }[]>([]);
  let subscription = $state<{
    plan: string | null;
    status: string | null;
    entitled: boolean;
    currentPeriodEnd: string | null;
  } | null>(null);
  let checkoutBusy = $state<string | null>(null);
  let portalBusy = $state(false);
  // Kept apart from `billingError`: a portal call failing is not the plan
  // failing to load, and it must not hide the plan the learner already has.
  let portalError = $state<string | null>(null);
  // Verified proof, latched by the same one-attempt-per-account rule: rows
  // come only from the attested endpoint, never synthesized locally.
  let proofs = $state<{ competencyId: string; level: string; kind: string; issuedAt: string }[]>([]);
  let proofsError = $state<string | null>(null);

  $effect(() => {
    // Re-arm on an identity change (sign-in / account switch), never on a token
    // renewal — `session.epoch` is exactly that signal (see session.svelte.ts).
    const epoch = session.epoch;
    if (epoch !== billingAttemptedEpoch) {
      billingAttemptedEpoch = epoch;
      billingLoaded = false;
    }
    if (apiConfigured && session.loggedIn && !billingLoaded && !billingLoading) {
      billingLoading = true;
      billingError = null;
      proofsError = null;
      // Settled separately: billing failing must not hide verified proof that
      // loaded, and proofs failing must not hide the plan — same latch, two
      // independent answers.
      Promise.allSettled([session.subscription(), session.plans(), session.myProofs()])
        .then(([s, p, v]) => {
          if (s.status === "fulfilled" && p.status === "fulfilled") {
            subscription = s.value.subscription;
            plans = p.value.plans;
          } else {
            const first = [s, p].find((r) => r.status === "rejected");
            billingError =
              first && first.status === "rejected"
                ? first.reason instanceof Error
                  ? first.reason.message
                  : "Could not load billing."
                : "Could not load billing.";
          }
          if (v.status === "fulfilled") {
            proofs = v.value.proofs;
          } else {
            proofsError =
              v.reason instanceof Error ? v.reason.message : "Could not load verified proof.";
          }
        })
        .finally(() => {
          // Latch whether it worked or not: one attempt per account, even when
          // the service is unreachable. A manual re-check (the checkout-return
          // button) clears `billingLoaded` to try again.
          billingLoaded = true;
          billingLoading = false;
        });
    }
  });

  async function upgrade(slug: string) {
    checkoutBusy = slug;
    billingError = null;
    try {
      window.location.href = await startCheckout(slug);
    } catch (e) {
      billingError = e instanceof Error ? e.message : "Checkout failed.";
      checkoutBusy = null;
    }
  }

  /**
   * Open the provider's customer portal. Cancelling, changing a card and
   * reading invoices happen there, not here — this only mints the link and
   * redirects, so the app never becomes a second source of truth for money.
   */
  async function manage() {
    portalBusy = true;
    portalError = null;
    try {
      window.location.href = await openBillingPortal();
    } catch (e) {
      portalError = e instanceof Error ? e.message : "Could not open the billing portal.";
      portalBusy = false;
    }
  }

  /**
   * Checkout return: Dodo redirects here (?checkout=done) after payment.
   * The redirect proves nothing by itself — the webhook grants access — so
   * a return without entitlement says "pending" and offers a re-check,
   * never "welcome to Pro". `billingReturnUrl` is the single place that
   * builds this URL (see lib/billing.ts).
   */
  const checkoutReturn = $derived(page.url.searchParams.get("checkout") === "done");
</script>

<!-- A signed-in view: it is deliberately absent from the sitemap, and it is
     marked noindex here so the two do not disagree. -->
<PageHead
  title={pageTitle("Profile & settings")}
  description="Your NEXORA account: sign-in state, plan, and subscription management. Learning happens in the desktop IDE."
  path="/profile"
  noindex
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <h1 class="display text-[clamp(1.8rem,4vw,3rem)] text-ink">
    {session.user?.email ? session.user.email : "Your account"}
  </h1>
  <p class="mt-4 text-[14px] text-muted">
    {#if session.loggedIn}
      Signed in as <span class="text-ink">{session.user?.email ?? "…"}</span> ·
      <a href="/account" class="text-accent underline underline-offset-4">your account</a>
    {:else if session.restoring}
      Checking your session…
    {:else}
      <a href="/auth" class="text-accent underline underline-offset-4">Sign in</a> to manage your
      subscription. Learning itself happens in the desktop IDE.
    {/if}
  </p>

  {#if apiConfigured}
    <div class="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Plate crosshair label="Plan">
        <p class="stamp text-[11px] text-faint">plan</p>

        {#if session.restoring}
          <p class="stamp mt-4 text-muted">checking your session…</p>
        {:else if !session.loggedIn}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
            <a href="/auth" class="text-accent underline underline-offset-4">Sign in</a> to manage a
            subscription. The nine free phases in the IDE are free either way.
          </p>
        {:else if billingLoading}
          <p class="stamp mt-4 text-muted">loading plan…</p>
        {:else if billingError}
          <p class="mt-4 text-[13.5px] text-removed" role="alert">{billingError}</p>
        {:else if subscription?.entitled}
          <p class="mt-4 flex flex-wrap items-baseline gap-x-3 text-[14px]">
            <span class="stamp text-approved">pro active</span>
            <span class="text-muted">
              {subscription.plan}{subscription.currentPeriodEnd
                ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </span>
          </p>
          <div class="mt-5 border-t border-rule pt-5">
            <Button size="sm" variant="ghost" onclick={manage} busy={portalBusy}>
              {portalBusy ? "Opening…" : "Manage subscription"}
            </Button>
          </div>
          {#if portalError}
            <p class="mt-3 text-[13px] text-removed" role="alert">{portalError}</p>
          {/if}
          <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
            Cancel, update your card and read invoices in the payment provider's portal: this opens
            it for your account.
          </p>
        {:else if checkoutReturn}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
            <span class="stamp text-review">payment received: confirming</span><br />
            <span class="mt-2 block">
              You are back from checkout. Pro activates when the payment provider confirms, usually
              within a minute. The redirect itself grants nothing.
            </span>
          </p>
          <div class="mt-5 border-t border-rule pt-5">
            <Button size="sm" variant="ghost" onclick={() => (billingLoaded = false)}>
              Check again
            </Button>
          </div>
        {:else}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
            Free plan: the nine free phases in the IDE are free. Pro unlocks the further courses per your
            tier, inside the IDE you already have.
          </p>
          {#if plans.length > 0}
            <div class="mt-5 flex flex-wrap gap-2 border-t border-rule pt-5">
              {#each plans as pl (pl.slug)}
                <Button
                  size="sm"
                  variant="ghost"
                  onclick={() => upgrade(pl.slug)}
                  disabled={checkoutBusy !== null}
                >
                  {checkoutBusy === pl.slug ? "Redirecting…" : `Upgrade: ${pl.name}`}
                </Button>
              {/each}
            </div>
          {:else}
            <p class="mt-4 text-[12.5px] text-faint">No plans published yet.</p>
          {/if}
        {/if}
      </Plate>

      <Plate label="IDE access">
        <p class="stamp text-[11px] text-faint">ide access</p>
        <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
          Your tier decides which courses appear inside the IDE. Approve the IDE's sign-in code at
          <a href="/auth/ide" class="text-accent underline underline-offset-4">/auth/ide</a>
          . The password is typed here, never in the IDE.
        </p>
        <div class="mt-5 border-t border-rule pt-5">
          <ActionLink href="/auth/ide" variant="ghost" size="sm" island>Approve a code</ActionLink>
        </div>
      </Plate>

      <Plate label="Verified">
        <p class="stamp text-[11px] text-faint">verified</p>

        {#if session.restoring}
          <p class="stamp mt-4 text-muted">checking your session…</p>
        {:else if !session.loggedIn}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
            <a href="/auth" class="text-accent underline underline-offset-4">Sign in</a> to see work
            the platform verified. Practice stays in the IDE either way.
          </p>
        {:else if billingLoading}
          <p class="stamp mt-4 text-muted">loading verified work…</p>
        {:else if proofsError}
          <p class="mt-4 text-[13.5px] text-removed" role="alert">{proofsError}</p>
        {:else if proofs.length === 0}
          <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
            No verified runs yet. Attested work appears here after the platform re-judges it.
            Practice stays in the IDE.
          </p>
        {:else}
          <ul class="mt-4 grid gap-1.5">
            {#each proofs as pr (pr.competencyId)}
              <li class="text-[13.5px] text-muted">
                <a href="/verify" class="font-mono text-[12.5px] text-accent underline underline-offset-4">{pr.competencyId}</a>
                <span> · {pr.kind} · {new Date(pr.issuedAt).toLocaleDateString()}</span>
              </li>
            {/each}
          </ul>
          <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
            Verified means the platform signed it. Each row re-derives at
            <a href="/verify" class="text-accent underline underline-offset-4">/verify</a>.
            It says nothing about who wrote it, only that the platform judged it.
          </p>
        {/if}
      </Plate>
    </div>
  {/if}
</div>
