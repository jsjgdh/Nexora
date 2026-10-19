<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import ContactCard from "$lib/components/ContactCard.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";
  import {
    LEGAL_ENTITY,
    PRIVACY_CONTACT,
    REGIME_DATES,
    RIGHTS_RESPONSE_DAYS,
    RIGHT_KINDS,
  } from "$lib/legal";

  /* "Your privacy choices" — the California-shaped notice, said honestly.
   *
   * §1798.135 requires a business that sells or shares personal information to
   * offer an opt-out link. This one does not sell and does not share, so the
   * statute's own alternative applies: say so in the notice, keep the right
   * available anyway, and let a person exercise it. That is what this page is —
   * and it is deliberately a page rather than a switch, because a switch for a
   * thing that never happens would be theatre.
   *
   * The operator is also below CCPA's revenue threshold (a 2024-adjusted
   * $26,625,000 for 2025), which is stated rather than hidden: readers deserve to
   * know which of these duties bind and which are being honoured anyway, and a
   * company that claims compliance it is not yet subject to is not more
   * trustworthy, only less clear. What *does* bind whatever the size is
   * California's Automatic Renewal Law, and the commercial terms are on /pricing
   * and in the terms of service.
   *
   * The signature/opt-out preference signal position is stated too: because
   * nothing is sold or shared, there is nothing for a Global Privacy Control
   * signal to switch off — and that is a fact about the product, not an excuse for
   * ignoring the signal. */
</script>

<PageHead
  title={pageTitle("Your privacy choices")}
  description="What NEXORA does not do with your data, the rights you can exercise, and how to exercise each one."
  path="/privacy-choices"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <Headline as="h1" lines={["Your privacy choices."]} class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink" />

  <div class="mt-8 max-w-[72ch]">
    <DocStatus />
  </div>

  <!-- The single most important statement on this page, and the one a switch
       would obscure: there is nothing to opt out of. -->
  <div class="mt-10 border border-rule p-6">
    <p class="stamp text-[11px] text-accent">do not sell or share my personal information</p>
    <p class="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink">
      Nothing you give this platform is sold, rented, or shared for advertising — not to data brokers,
      not to advertisers, not to an analytics provider, because there is no analytics provider. There
      is no cross-context behavioural advertising, and no profile of you is built for one.
    </p>
    <p class="mt-4 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
      So there is no "opt out of sale" switch to offer you, and a switch for a thing that never happens
      would be decoration. What stays true is the right itself: if you ask {LEGAL_ENTITY} to stop
      selling or sharing your personal information, the answer is a record of the request and a
      confirmation that it was never happening. A Global Privacy Control signal in your browser is
      honoured on the same basis — there is nothing for it to switch off, and nothing on this site
      sets a cookie that would need one.
    </p>
  </div>

  <div class="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
    <div>
      <p class="stamp text-[11px] text-accent">what you can ask for</p>
      <ul class="mt-6 space-y-4">
        {#each RIGHT_KINDS as r (r.id)}
          <li class="border-l border-rule pl-4">
            <p class="text-[14.5px] text-ink">{r.label}</p>
            <p class="mt-1 text-[13px] leading-relaxed text-faint">{r.note}</p>
          </li>
        {/each}
      </ul>

      <div class="mt-10 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">how to exercise them</p>
        <p class="mt-4 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
          Two routes, and neither requires the other. Signed in, the account page holds every control —
          including a download of your whole record and self-service deletion. Signed out, or if you
          never had an account, write to <span class="text-ink">{PRIVACY_CONTACT}</span> and the same
          clock runs from the moment it arrives: {RIGHTS_RESPONSE_DAYS} days, with no account required
          to ask, and no charge for asking twice in a year.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <ActionLink href="/account" island>Open your account data</ActionLink>
          <ActionLink href="/privacy" variant="ghost" island>Read the privacy notice</ActionLink>
        </div>
      </div>

      <div class="mt-10 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">no discrimination, and no incentive games</p>
        <p class="mt-4 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
          Exercising any right here changes nothing about your access, your price or your tier. There
          is no financial incentive offered for personal information, so there is no incentive scheme
          to disclose. Assessment — which is the thing a learner might expect a "right" to touch — is
          free at every tier and stays free; no check is ever behind the paywall.
        </p>
      </div>

      <div class="mt-8 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">write to the operator</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          When you cannot sign in — or never had an account — the same address handles privacy
          requests and security reports. Use the form below when you want a reply from us, or open
          your mailer with the address pre-filled when you prefer.
        </p>
      </div>

      <svelte:component this={ContactCard} />
    </div>

    <div>
      <Plate crosshair>
        <p class="stamp text-[11px] text-faint">what binds us, and from when</p>
        <ul class="mt-4 space-y-3">
          {#each REGIME_DATES as row (row.regime)}
            <li class="text-[13px] leading-relaxed text-muted">
              <span class="text-ink">{row.regime}</span>
              <span class="block text-faint">{row.duty} — {row.date}</span>
            </li>
          {/each}
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">retention, in one line</p>
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
          Your account and its records are held while the account exists, and an erasure request
          removes them — with the transaction record kept because accounting law requires it, stated
          before you commit rather than after.
        </p>
        <p class="mt-3 text-[12.5px] leading-relaxed text-faint">
          Per-category periods are in the privacy notice and in the retention schedule that the
          platform enforces on a timer.
        </p>
      </Plate>
    </div>
  </div>
</div>
