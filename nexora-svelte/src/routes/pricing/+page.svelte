<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { startCheckout } from "$lib/billing";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* Pricing backed by the real plans feed — never hardcoded copy. The API
     names plans only (no amounts travel through it), so prices live where
     they are charged: Dodo's hosted checkout. With zero published plans the
     page says exactly that instead of inventing a price. */

  let plans = $state<{ slug: string; name: string }[]>([]);
  let subscription = $state<{
    plan: string | null;
    status: string | null;
    entitled: boolean;
    currentPeriodEnd: string | null;
  } | null>(null);
  let loaded = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  $effect(() => {
    if (apiConfigured && session.loggedIn && !loaded && !loading) {
      loading = true;
      error = null;
      Promise.all([session.subscription(), session.plans()])
        .then(([s, p]) => {
          subscription = s.subscription;
          plans = p.plans;
          loaded = true;
        })
        .catch((e) => {
          error = e instanceof Error ? e.message : "Could not load plans.";
        })
        .finally(() => {
          loading = false;
        });
    }
  });

  async function upgrade(slug: string) {
    busy = slug;
    error = null;
    try {
      window.location.href = await startCheckout(slug);
    } catch (e) {
      error = e instanceof Error ? e.message : "Checkout failed.";
      busy = null;
    }
  }
</script>

<PageHead
  title={pageTitle("Pricing")}
  description="NEXORA's curriculum, diagnostic and checks are free. Pro adds a larger metered allowance for hosted execution and tutoring when plans are published."
  path="/pricing"
/>

<div class="mx-auto max-w-3xl px-4 py-10">
  <p class="stamp text-accent">pricing</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">Free to learn. Pro to run more.</h1>
  <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
    The curriculum, the diagnostic, local learning, assessment, accounts and sync stay free.
    Pro only ever adds a larger metered allowance for hosted services — never gates, certificates
    or outcomes.
  </p>

  <div class="mt-8 grid gap-4 sm:grid-cols-2">
    <section class="border border-rule" aria-label="Free plan">
      <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">free — forever</h2>
      <div class="px-3 py-3">
        <p class="num text-[22px] text-ink">$0</p>
        <ul class="mt-3 space-y-1.5 text-[13px] leading-relaxed text-muted">
          <li>All 46 missions, questions and deterministic checks</li>
          <li>Diagnostic placement and the practice log</li>
          <li>Evidence export of everything you prove</li>
          <li>Account with cross-device sync</li>
        </ul>
        <div class="mt-4">
          <a
            href="/roadmap"
            class="inline-flex border border-rule px-4 py-2 text-[13px] font-medium text-ink hover:border-accent hover:text-accent"
          >
            Start learning
          </a>
        </div>
      </div>
    </section>

    <section class="border border-rule" aria-label="Pro plan">
      <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">pro — metered</h2>
      <div class="px-3 py-3">
        {#if !apiConfigured}
          <p class="text-[13px] leading-relaxed text-muted">
            This build runs in local mode. Pro plans appear here once a platform is connected.
          </p>
        {:else if !session.loggedIn}
          <p class="text-[13px] leading-relaxed text-muted">
            <a href="/auth" class="text-accent underline underline-offset-4">Sign in</a> to see Pro
            plans. Everything you can learn stays free either way.
          </p>
        {:else if loading}
          <p class="stamp text-muted">loading plans…</p>
        {:else if error}
          <p role="alert" class="text-[13px] text-removed">{error}</p>
        {:else if subscription?.entitled}
          <p class="flex flex-wrap items-baseline gap-x-3 text-[14px]">
            <span class="stamp text-approved">pro active</span>
            <span class="text-muted">
              {subscription.plan}{subscription.currentPeriodEnd
                ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </span>
          </p>
          <p class="mt-2 text-[12px] leading-relaxed text-faint">
            Manage or cancel from your <a href="/profile" class="text-accent underline underline-offset-4">profile</a>.
          </p>
        {:else if plans.length === 0}
          <p class="text-[13px] leading-relaxed text-muted">
            No paid plans published yet — everything stays free until they are.
          </p>
        {:else}
          <ul class="space-y-2">
            {#each plans as pl (pl.slug)}
              <li class="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2 first:border-t-0 first:pt-0">
                <span class="text-[14px] text-ink">{pl.name}</span>
                <Button size="sm" variant="outline" onclick={() => upgrade(pl.slug)} disabled={busy !== null}>
                  {busy === pl.slug ? "Redirecting…" : `Choose ${pl.name}`}
                </Button>
              </li>
            {/each}
          </ul>
          <p class="mt-3 text-[12px] leading-relaxed text-faint">
            Prices are shown on the secure checkout (Dodo Payments) before anything is charged.
            The renewal date is on that page too, before you pay — not only at the point of
            cancelling.
          </p>
        {/if}
      </div>
    </section>
  </div>

  <!-- The billing promises. Written before there is a price to sell, on purpose:
       the loudest thing anyone says about a competitor in this category is that
       they felt cheated on money rather than that the teaching was bad. These
       are commitments the product has to keep, so the suite asserts them here
       where they are stated. Refund window marked for legal review. -->
  <section class="mt-8 border border-rule" aria-label="Billing commitments">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">
      how billing works here
    </h2>
    <ul class="space-y-2 px-3 py-3 text-[13px] leading-relaxed text-muted">
      <li>
        <span class="text-ink">No surprise renewals.</span> The renewal date is shown before
        you pay and in your profile, every time — never only at the point of cancelling.
      </li>
      <li>
        <span class="text-ink">Cancel in two clicks.</span> Self-serve, in this product. No
        email, no retention maze, no "are you sure?" loop.
      </li>
      <li>
        <span class="text-ink">One visible price.</span> Purchasing-power discounts are applied
        as a discount you can see, never as a higher local price.
      </li>
      <li>
        <span class="text-ink">No check is ever behind the paywall.</span> Assessment stays
        free — a verdict you have to pay for is not a verdict you can trust.
      </li>
    </ul>
  </section>
</div>
