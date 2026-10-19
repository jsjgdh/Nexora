<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { startCheckout } from "$lib/billing";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";
  import { BILLING_COMMITMENTS, NOT_SOLD, PRICING, PRICING_PLANS, money } from "$lib/content/site";
  import { SUBSCRIPTION_TERMS } from "$lib/legal";

  /* The price, printed. One number in one place, and the same number in the
     payment provider's dashboard. The page holds no amount of its own: it
     prints the copy module, and the suite reads the same export. */
  const price = money(PRICING.monthly);
  const annual = money(PRICING.annual);

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
  let attemptedEpoch = $state(-1);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  $effect(() => {
    // Re-arm on an identity change (sign-in / account switch), never on a token
    // renewal — `session.epoch` is exactly that signal (see session.svelte.ts).
    const epoch = session.epoch;
    if (epoch !== attemptedEpoch) {
      attemptedEpoch = epoch;
      loaded = false;
    }
    if (apiConfigured && session.loggedIn && !loaded && !loading) {
      loading = true;
      error = null;
      Promise.all([session.subscription(), session.plans()])
        .then(([s, p]) => {
          subscription = s.subscription;
          plans = p.plans;
        })
        .catch((e) => {
          error = e instanceof Error ? e.message : "Could not load plans.";
        })
        .finally(() => {
          // Latch whether it worked or not: one attempt per account, even when
          // the service is unreachable, so a failure cannot re-trigger this
          // effect in a loop (the old code latched `loaded` only on success).
          loaded = true;
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
  description="What is free, what is paid and what extra. The decided price of the free tier, of Pro and of a team plan, and what is not sold at all."
  path="/pricing"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["Free to learn.", "Pro to run more."]}
    class="text-[clamp(2.2rem,6.5vw,5rem)] text-ink"
  />
  <p class="mt-7 max-w-[54ch] font-serif text-[clamp(1.05rem,2vw,1.5rem)] leading-snug text-muted">
    Learning happens in the IDE. The nine free phases ship inside the download and stay free, and
    assessment is never gated.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <!-- The three plans. Every line of them is printed from the copy module, so
       the page cannot describe one offer three ways, and the number the
       provider is configured with is the number a reader sees here. -->
  <div class="grid gap-6 lg:grid-cols-3">
    {#each PRICING_PLANS as plan (plan.id)}
      <Plate crosshair label="{plan.name} plan">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="display text-[clamp(1.3rem,2.4vw,1.9rem)] text-ink">{plan.name}</h2>
          {#if plan.id === "free"}
            <span class="stamp text-[11px] text-added">forever</span>
          {/if}
        </div>

        <p class="num mt-5 text-[clamp(2rem,4vw,2.75rem)] leading-none text-ink">{plan.price}</p>
        <p class="stamp mt-2 text-[11px] text-faint">{plan.priceNote}</p>

        <ul class="mt-6 grid gap-3 border-t border-rule pt-6">
          {#each plan.points as point, i (`${plan.id}-${i}`)}
            <li class="text-[13.5px] leading-relaxed text-muted">{point}</li>
          {/each}
        </ul>

        {#if plan.id === "free"}
          <div class="mt-7">
            <ActionLink href="/download" island>Try it free</ActionLink>
          </div>
        {:else if plan.id === "pro"}
          <div class="mt-7">
            <p class="text-[12.5px] leading-relaxed text-faint">
              The plan is priced and it is not on sale yet.
            </p>
            {#if !apiConfigured}
              <p class="text-[14px] leading-relaxed text-muted">
                This build runs in local mode. Pro plans appear here once a platform is connected.
              </p>
            {:else if session.restoring}
              <!-- Not "sign in to see plans": on a fresh load we do not yet know
                   whether this learner is signed in — the cookie is unreadable here. -->
              <p class="stamp text-muted">checking your session…</p>
            {:else if !session.loggedIn}
              <p class="text-[14px] leading-relaxed text-muted">
                <a href="/auth" class="text-accent underline underline-offset-4">Sign in</a> to subscribe
                and manage the plan. Everything you can learn stays free either way.
              </p>
            {:else if loading}
              <p class="stamp text-muted">loading plans…</p>
            {:else if error}
              <p role="alert" class="text-[14px] text-removed">{error}</p>
            {:else if subscription?.entitled}
              <p class="flex flex-wrap items-baseline gap-x-3 text-[14px]">
                <span class="stamp text-approved">pro active</span>
                <span class="text-muted">
                  {subscription.plan}{subscription.currentPeriodEnd
                    ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                    : ""}
                </span>
              </p>
              <p class="mt-3 text-[12.5px] leading-relaxed text-faint">
                Manage or cancel from your
                <a href="/profile" class="text-accent underline underline-offset-4">profile</a>.
              </p>
            {:else if plans.length === 0}
              <p class="text-[14px] leading-relaxed text-muted">
                The plan is priced and it is not on sale yet. {price} a month, or {annual} a year,
                opens the other {PRICING.paidPhases} phases inside the editor you already have.
                Until the checkout opens, everything stays free.
              </p>
            {:else}
              <ul class="grid gap-3">
                {#each plans as pl (pl.slug)}
                  <li class="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3 first:border-t-0 first:pt-0">
                    <span class="text-[14px] text-ink">{pl.name}</span>
                    <Button size="sm" variant="ghost" onclick={() => upgrade(pl.slug)} disabled={busy !== null}>
                      {busy === pl.slug ? "Redirecting…" : `Choose ${pl.name}`}
                    </Button>
                  </li>
                {/each}
              </ul>
              <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
                Prices are shown on the secure checkout (Dodo Payments) before anything is charged.
                The renewal date is on that page too, before you pay, and not only at the point of
                cancelling.
              </p>
            {/if}
          </div>
        {:else}
          <div class="mt-7">
            <ActionLink href="/employers#contact" variant="ghost">Ask about a team plan</ActionLink>
          </div>
        {/if}
      </Plate>
    {/each}
  </div>

  <!-- What is not sold, stated plainly. A buyer is better served by a refusal
       they can read than by a promise that is quietly left out. -->
  <section class="mt-16" aria-labelledby="not-sold">
    <h2 id="not-sold" class="display text-[clamp(1.5rem,2.8vw,2.1rem)] text-ink">
      What is not sold.
    </h2>
    <ul class="mt-8 grid gap-4 border-t border-rule pt-8 sm:grid-cols-2">
      {#each NOT_SOLD as line, i (`not-sold-${i}`)}
        <li class="grid grid-cols-[auto_1fr] gap-4 text-[13.5px] leading-relaxed text-muted">
          <span class="num pt-0.5 text-[12px] text-removed" aria-hidden="true">✗</span>
          <span>{line}</span>
        </li>
      {/each}
    </ul>
  </section>

  <!-- The billing promises. Written before there is a price to sell, on purpose:
       the loudest thing anyone says about a competitor in this category is that
       they felt cheated on money rather than that the teaching was bad. These
       are commitments the product has to keep, so the suite asserts them where
       they are stated. -->
  <section class="mt-16" aria-label="Billing commitments">
    <h2 class="display text-[clamp(1.5rem,2.8vw,2.1rem)] text-ink">How billing works here.</h2>
    <div class="grid gap-8 border-t border-rule pt-8 sm:grid-cols-2">
      {#each BILLING_COMMITMENTS as item, i (`bill-${i}`)}
        <div class="max-w-[46ch]">
          <h3 class="text-[15px] font-semibold text-ink">{item.title}</h3>
          <p class="mt-2 text-[13.5px] leading-relaxed text-muted">{item.body}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- Before the price, not after it.
       California's Automatic Renewal Law (as amended by AB 2863) requires the
       renewal terms to be clear and conspicuous, in visual proximity to the
       consent, *before* checkout completes — and the same facts are what the EU
       Consumer Rights Directive calls pre-contract information. Both point at the
       same place: someone deciding whether to pay should be able to read the
       renewal, the cancellation route, the refund position and the withdrawal
       right here, without opening another document or reaching a checkout page.
       The five sentences live in $lib/legal so the terms, this page and the
       checkout cannot describe one subscription three ways. -->
  <section class="mt-16" aria-labelledby="paid-terms">
    <h2 id="paid-terms" class="display text-[clamp(1.5rem,2.8vw,2.1rem)] text-ink">
      Before you pay: the terms of the subscription.
    </h2>
    <p class="mt-4 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
      The price above is the decided price, and it is printed here so that nothing is a surprise.
      Checkout is not on sale yet: the payment provider has to be configured with the same number
      before it is switched on, and until it is, everything stays free. These are the terms that go
      with the subscription, in the same place as the decision rather than in a document behind a
      link.
    </p>
    <dl class="mt-8 grid gap-6 border-t border-rule pt-8 sm:grid-cols-2">
      <div class="max-w-[46ch]">
        <dt class="text-[15px] font-semibold text-ink">It renews until you cancel</dt>
        <dd class="mt-2 text-[13.5px] leading-relaxed text-muted">{SUBSCRIPTION_TERMS.renewal}</dd>
      </div>
      <div class="max-w-[46ch]">
        <dt class="text-[15px] font-semibold text-ink">Cancelling</dt>
        <dd class="mt-2 text-[13.5px] leading-relaxed text-muted">{SUBSCRIPTION_TERMS.cancellation}</dd>
      </div>
      <div class="max-w-[46ch]">
        <dt class="text-[15px] font-semibold text-ink">Refunds</dt>
        <dd class="mt-2 text-[13.5px] leading-relaxed text-muted">{SUBSCRIPTION_TERMS.refund}</dd>
      </div>
      <div class="max-w-[46ch]">
        <dt class="text-[15px] font-semibold text-ink">Your 14-day right of withdrawal</dt>
        <dd class="mt-2 text-[13.5px] leading-relaxed text-muted">{SUBSCRIPTION_TERMS.withdrawal}</dd>
      </div>
      <div class="max-w-[46ch]">
        <dt class="text-[15px] font-semibold text-ink">If a price changes</dt>
        <dd class="mt-2 text-[13.5px] leading-relaxed text-muted">{SUBSCRIPTION_TERMS.priceChange}</dd>
      </div>
      <div class="max-w-[46ch]">
        <dt class="text-[15px] font-semibold text-ink">Free trials</dt>
        <dd class="mt-2 text-[13.5px] leading-relaxed text-muted">{SUBSCRIPTION_TERMS.trial}</dd>
      </div>
    </dl>
    <p class="mt-8 max-w-[62ch] text-[12.5px] leading-relaxed text-faint">
      The same terms are in the
      <a href="/terms" class="text-accent underline underline-offset-4">terms of service</a>, and the
      subscription itself is run by the payment provider as merchant of record, which is why
      cancelling happens in its portal rather than in a form here.
    </p>
  </section>
</div>
