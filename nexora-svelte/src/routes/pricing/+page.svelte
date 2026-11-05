<script lang="ts">
  import type { PageProps } from "./$types";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { startCheckout } from "$lib/billing";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";
  import {
    BILLING_COMMITMENTS,
    NOT_SOLD,
    PRICING,
    PRICING_PLANS,
    QUOTED_PLANS,
    money,
    FREE_PHASES_PHRASE,
  } from "$lib/content/site";
  import { SUBSCRIPTION_TERMS } from "$lib/legal";

  /* The price, printed. The page holds no amount of its own: it prints the
     copy module, and the suite reads the same export.

     The layout is two listed plans and two quoted ones. Free and Pro are the
     decision; Teams and Campus are a conversation. The Pro card keeps every
     state the service can report, because a checkout that is not configured
     must say so rather than look broken. */

  let { data }: PageProps = $props();

  const price = money(PRICING.monthly);
  const annual = money(PRICING.annual);

  const freePlan = PRICING_PLANS[0];
  const proPlan = PRICING_PLANS[1];

  let plans = $state<{ slug: string; name: string }[]>([]);
  let paymentsConfigured = $state<boolean | null>(null);
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
          paymentsConfigured = p.paymentsConfigured;
        })
        .catch((e) => {
          error = e instanceof Error ? e.message : "Could not load plans.";
        })
        .finally(() => {
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
  description="What is free, what is paid and what is quoted. The price of the free tier, of Pro, and what is not sold at all."
  path="/pricing"
/>

<section class="price-hero">
  <div class="container-page">
    <h1 class="display price-title">Free to learn.<br />Pro to run more.</h1>
    <p class="price-lede">
      Learning happens in the IDE. The {FREE_PHASES_PHRASE} ship inside the download and stay
      free, and assessment is never gated.
    </p>
    <p class="price-note num">No account is needed for the free phases.</p>
  </div>
</section>

<section class="section-pad listed-section">
  <div class="container-page">
    <div class="listed">
      <article class="plan card" data-plan="free">
        <div class="plan-head">
          <div>
            <p class="plan-name">{freePlan.name}</p>
            <p class="num plan-price">{freePlan.price}</p>
            <p class="num plan-note">{freePlan.priceNote}</p>
          </div>
          <span class="tag tag-pass">Forever</span>
        </div>

        <ul class="plan-points">
          {#each freePlan.points as point, i (`free-${i}`)}
            <li>{point}</li>
          {/each}
        </ul>

        <div class="plan-action">
          <ActionLink href="/download" size="md" island>{data.release.label}</ActionLink>
        </div>
      </article>

      <article class="plan card" data-plan="pro">
        <div class="plan-head">
          <div>
            <p class="plan-name">{proPlan.name}</p>
            <p class="num plan-price">{proPlan.price}</p>
            <p class="num plan-note">{proPlan.priceNote}</p>
          </div>
          <span class="tag pro-tag">The full shelf</span>
        </div>

        <ul class="plan-points">
          {#each proPlan.points as point, i (`pro-${i}`)}
            <li>{point}</li>
          {/each}
        </ul>

        <div class="plan-action">
          <p class="pro-state">
            The plan is priced and it is not on sale yet.
          </p>

          {#if !apiConfigured}
            <p class="pro-body">
              This build runs in local mode. Pro plans appear here once a platform is connected.
            </p>
          {:else if session.restoring}
            <p class="pro-body">Checking your session.</p>
          {:else if !session.loggedIn}
            <p class="pro-body">
              <a href="/auth">Sign in</a> to subscribe and manage the plan. Everything you can
              learn stays free either way.
            </p>
          {:else if loading}
            <p class="pro-body">Loading plans.</p>
          {:else if error}
            <p class="pro-body error" role="alert">{error}</p>
          {:else if subscription?.entitled}
            <p class="pro-status">
              <span class="tag tag-pass">Pro active</span>
              <span class="num">
                {subscription.plan}{subscription.currentPeriodEnd
                  ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  : ""}
              </span>
            </p>
            <p class="pro-body">
              Change or cancel it under <a href="/profile">Manage your plan</a>.
            </p>
          {:else if plans.length === 0}
            <p class="pro-body">
              {price} a month, or {annual} a year, opens the other {PRICING.paidPhases} phases
              inside the editor you already have. Until the checkout opens, everything stays free.
            </p>
          {:else if paymentsConfigured === false}
            <p class="pro-body">
              The payment provider is not configured in this deployment, so the checkout is
              closed. Nothing is charged, and nothing is asked for. Everything you can learn
              stays free.
            </p>
          {:else}
            <ul class="checkout-plans">
              {#each plans as pl (pl.slug)}
                <li>
                  <span>{pl.name}</span>
                  <Button size="sm" variant="inverse" onclick={() => upgrade(pl.slug)} disabled={busy !== null}>
                    {busy === pl.slug ? "Redirecting" : `Choose ${pl.name}`}
                  </Button>
                </li>
              {/each}
            </ul>
            <p class="pro-fine">
              Prices are shown on the secure checkout (Dodo Payments) before anything is charged.
              The renewal date is on that page too, before you pay.
            </p>
          {/if}
        </div>
      </article>
    </div>

    <div class="quoted-grid">
      {#each QUOTED_PLANS as plan (plan.id)}
        <article class="quoted card">
          <div class="quoted-head">
            <p class="plan-name">{plan.name}</p>
            <p class="display quoted-price">{plan.price}</p>
            <p class="num plan-note">{plan.priceNote}</p>
          </div>
          <p class="quoted-depends">{plan.dependsOn}</p>
          <ul class="quoted-points">
            {#each plan.points as point, i (`${plan.id}-${i}`)}
              <li>{point}</li>
            {/each}
          </ul>
          <p class="quoted-fine">{plan.cap}</p>
          <p class="quoted-fine">{plan.checkout}</p>
          <div class="quoted-action">
            <ActionLink href={plan.action.href} variant="ghost">{plan.action.label}</ActionLink>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>

<section class="not-sold">
  <div class="container-page not-sold-grid">
    <div>
      <h2 class="display not-sold-title">What is not sold.</h2>
      <p class="not-sold-lede">
        A plain refusal is more useful than a quiet omission. These are the product's shape, not
        features waiting on a roadmap.
      </p>
    </div>
    <ul class="not-sold-list">
      {#each NOT_SOLD as line, i (`not-sold-${i}`)}
        <li>
          <span class="num cross" aria-hidden="true">✗</span>
          <span>{line}</span>
        </li>
      {/each}
    </ul>
  </div>
</section>

<section class="section-pad">
  <div class="container-page">
    <h2 class="display section-title">How billing works here.</h2>
    <div class="commitments">
      {#each BILLING_COMMITMENTS as item, i (`bill-${i}`)}
        <div class="commitment">
          <span class="num commitment-n">{String(i + 1).padStart(2, "0")}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="terms-band">
  <div class="container-page">
    <h2 class="display section-title">Before you pay: the subscription.</h2>
    <p class="terms-lede">
      The price above is the decided price, printed here so that nothing is a surprise. Checkout
      is not on sale yet: the payment provider has to be configured with the same number before it
      is switched on, and until it is, everything stays free.
    </p>
    <dl class="terms">
      <div><dt>It renews until you cancel</dt><dd>{SUBSCRIPTION_TERMS.renewal}</dd></div>
      <div><dt>Cancelling</dt><dd>{SUBSCRIPTION_TERMS.cancellation}</dd></div>
      <div><dt>Refunds</dt><dd>{SUBSCRIPTION_TERMS.refund}</dd></div>
      <div><dt>Your 14-day right of withdrawal</dt><dd>{SUBSCRIPTION_TERMS.withdrawal}</dd></div>
      <div><dt>If a price changes</dt><dd>{SUBSCRIPTION_TERMS.priceChange}</dd></div>
      <div><dt>Free trials</dt><dd>{SUBSCRIPTION_TERMS.trial}</dd></div>
    </dl>
    <p class="terms-fine">
      The same terms are in the <a href="/terms">terms of service</a>, and the subscription is run
      by the payment provider as merchant of record, which is why cancelling happens in its portal
      rather than in a form here.
    </p>
  </div>
</section>

<style>
  .price-hero {
    padding-block: clamp(3.5rem, 7vw, 6.5rem) clamp(2.5rem, 5vw, 4rem);
    border-bottom: 1px solid var(--color-rule);
  }

  .price-title {
    margin-top: var(--space-5);
    font-size: var(--text-page);
    line-height: 0.94;
    letter-spacing: -0.055em;
  }

  .price-lede {
    margin-top: var(--space-5);
    max-width: 52ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.6;
    color: var(--color-muted);
  }

  .price-note {
    margin-top: var(--space-4);
    font-size: 10px;
    color: var(--color-faint);
  }

  .listed-section {
    background: var(--color-panel);
  }

  .listed {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
  }

  @media (min-width: 900px) {
    .listed {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
  }

  @media (min-width: 640px) {
    .plan {
      padding: var(--space-8);
    }
  }

  .plan[data-plan="pro"] {
    background:
      radial-gradient(80% 100% at 100% 0%, color-mix(in srgb, var(--color-screen-glow) 50%, transparent), transparent 60%),
      var(--color-screen);
    border-color: var(--color-screen);
    color: var(--color-screen-ink);
  }

  .plan-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .plan-name {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-muted);
  }

  .plan[data-plan="pro"] .plan-name {
    color: var(--color-screen-muted);
  }

  .plan-price {
    margin-top: var(--space-2);
    font-size: clamp(2.4rem, 4vw, 3.2rem);
    line-height: 1;
    color: var(--color-ink);
  }

  .plan[data-plan="pro"] .plan-price {
    color: var(--color-screen-ink);
  }

  .plan-note {
    margin-top: var(--space-2);
    font-size: 10px;
    color: var(--color-faint);
  }

  .plan[data-plan="pro"] .plan-note {
    color: var(--color-screen-muted);
  }

  .pro-tag {
    border-color: var(--color-screen-rule);
    color: var(--color-screen-muted);
  }

  .plan-points {
    list-style: none;
    margin: 0;
    padding: var(--space-4) 0 0;
    border-top: 1px solid var(--color-rule);
    display: grid;
    gap: var(--space-2);
  }

  .plan[data-plan="pro"] .plan-points {
    border-top-color: var(--color-screen-rule);
  }

  .plan-points li {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    gap: var(--space-2);
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--color-muted);
  }

  .plan-points li::before {
    content: "✓";
    color: var(--color-pass);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .plan[data-plan="pro"] .plan-points li {
    color: var(--color-screen-muted);
  }

  .plan-action {
    display: grid;
    gap: var(--space-3);
    margin-top: auto;
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-rule);
  }

  .plan[data-plan="pro"] .plan-action {
    border-top-color: var(--color-screen-rule);
  }

  .pro-state {
    font-size: 12.5px;
    color: var(--color-screen-muted);
  }

  .pro-body {
    max-width: 48ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-screen-muted);
  }

  .pro-body a {
    color: var(--color-accent-bright);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .pro-body.error {
    color: var(--color-fail-screen);
  }

  .pro-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: 10px;
    color: var(--color-screen-muted);
  }

  .checkout-plans {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  .checkout-plans li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-screen-rule);
    font-size: 13px;
    color: var(--color-screen-ink);
  }

  .checkout-plans li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .pro-fine {
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--color-screen-muted);
  }

  .quoted-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-5);
  }

  @media (min-width: 900px) {
    .quoted-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .quoted {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-6);
  }

  .quoted-head {
    display: grid;
    gap: var(--space-1);
  }

  .quoted-price {
    margin-top: var(--space-2);
    font-size: clamp(1.8rem, 3vw, 2.4rem);
    color: var(--color-ink);
  }

  .quoted-depends {
    max-width: 48ch;
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .quoted-points {
    list-style: none;
    margin: 0;
    padding: var(--space-3) 0 0;
    border-top: 1px solid var(--color-rule);
    display: grid;
    gap: var(--space-2);
  }

  .quoted-points li {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    gap: var(--space-2);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-muted);
  }

  .quoted-points li::before {
    content: "·";
    color: var(--color-accent);
    font-family: var(--font-mono);
  }

  .quoted-fine {
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-faint);
  }

  .quoted-action {
    margin-top: auto;
    padding-top: var(--space-3);
  }

  .not-sold {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background:
      radial-gradient(60% 90% at 0% 100%, color-mix(in srgb, var(--color-fail) 7%, transparent), transparent 60%),
      var(--color-raised);
    border-block: 1px solid var(--color-rule);
  }

  .not-sold-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
  }

  @media (min-width: 980px) {
    .not-sold-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(3rem, 7vw, 6rem);
    }
  }

  .not-sold-title {
    margin-top: var(--space-4);
    max-width: 14ch;
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  }

  .not-sold-lede {
    margin-top: var(--space-4);
    max-width: 44ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .not-sold-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--color-rule-strong);
  }

  .not-sold-list li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: var(--space-3);
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule-strong);
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-ink);
    transition: border-color var(--dur-2) var(--ease-out);
  }

  .not-sold-list li:hover {
    border-bottom-color: color-mix(in srgb, var(--color-fail) 45%, var(--color-rule-strong));
  }

  .cross {
    color: var(--color-fail);
    font-size: 10px;
  }

  .section-title {
    font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  }

  .commitments {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    margin-top: var(--space-8);
  }

  @media (min-width: 720px) {
    .commitments {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1080px) {
    .commitments {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .commitment {
    padding-top: var(--space-4);
    border-top: 2px solid color-mix(in srgb, var(--color-accent) 55%, var(--color-rule));
  }

  .commitment-n {
    font-size: 9px;
    color: var(--color-faint);
  }

  .commitment h3 {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-ink);
  }

  .commitment p {
    margin-top: var(--space-2);
    max-width: 34ch;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .terms-band {
    padding-block: clamp(4rem, 7vw, 6.5rem);
    background: var(--color-panel);
    border-top: 1px solid var(--color-rule);
  }

  .terms-lede {
    margin-top: var(--space-4);
    max-width: 62ch;
    font-size: 13.5px;
    line-height: 1.7;
    color: var(--color-muted);
  }

  .terms {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    margin: var(--space-8) 0 0;
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-rule);
  }

  @media (min-width: 720px) {
    .terms {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .terms dt {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-ink);
  }

  .terms dd {
    margin: var(--space-2) 0 0;
    max-width: 46ch;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .terms-fine {
    margin-top: var(--space-8);
    max-width: 62ch;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  .terms-fine a {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
