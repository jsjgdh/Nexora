<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import { pageTitle } from "$lib/seo";
  import { PRIVACY_CONTACT } from "$lib/legal";

  /* The cookie notice.
   *
   * One page, one honest inventory. This site sets exactly one cookie of its
   * own — the refresh cookie its server puts on `/auth/session` — and it exists
   * to keep a signed-in learner signed in. Everything else that lands in a
   * browser here is either the learner's own local-first learning data (kept in
   * the page's storage, not sent anywhere) or a third-party sign-in provider the
   * learner opted into.
   *
   * The rule this page is written to is the same one the audit applied to the
   * whole product: do not describe a control you do not have. So there is no
   * consent banner and no preference centre, and the page says why rather than
   * implying one exists: there is currently nothing non-essential to consent to.
   * It also states the forward rule explicitly, so the first analytics script or
   * marketing pixel someone adds cannot arrive quietly — it arrives with a real
   * consent mechanism and an updated notice, or it does not arrive.
   *
   * The cookie's real attributes live in `$lib/server/session-broker.ts`
   * (`REFRESH_COOKIE`, `COOKIE_PATH`, `REFRESH_MAX_AGE_S`, `cookieAttributes`).
   * That module is server-only, so the facts are restated here in prose rather
   * than imported — this page describes the mechanism, it does not re-declare
   * it. If the cookie's name or lifetime ever changes there, this page changes
   * with it. */

  const inventory: { name: string; kind: string; why: string }[] = [
    {
      name: "nexora_refresh",
      kind: "strictly necessary",
      why: "Set by this site's own server after sign-in. It holds the long-lived half of your session so you stay signed in between page loads, and it is scoped to the session endpoints so it travels nowhere else.",
    },
  ];
</script>

<PageHead
  title={pageTitle("Cookie notice")}
  description="What NEXORA stores on your device: one session cookie, third-party sign-in storage, and no tracking of any kind."
  path="/cookies"
/>

<div class="mx-auto max-w-[1100px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["One cookie.", "Nothing watching you."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="document-lede">
    This site sets one cookie of its own, and it is the one that keeps you signed in. There is no
    analytics, no advertising, and no tracking of any kind, so there is nothing here for a banner to
    ask you about.
  </p>
</div>

<div class="mx-auto max-w-[1100px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
    <Plate crosshair>
      <p class="stamp text-[11px] text-faint">cookie notice</p>
      <DocStatus />

      <div class="mt-6 grid gap-8 text-[14.5px] leading-relaxed text-muted">
        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">What is stored</h2>
          <p class="mt-3">
            One cookie, set by this site's own server, and it is strictly necessary to the job you
            asked for: staying signed in.
          </p>
          <ul class="mt-3 grid gap-3">
            {#each inventory as row (row.name)}
              <li>
                <span class="text-ink">{row.name}</span>
                <span class="text-faint"> · {row.kind}</span><br />
                {row.why}
              </li>
            {/each}
          </ul>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Its attributes</h2>
          <ul class="mt-3 grid gap-2">
            <li>
              <span class="text-ink">HttpOnly</span>: no script on the page can read it, so a
              cross-site scripting bug cannot walk off with a thirty-day credential.
            </li>
            <li>
              <span class="text-ink">SameSite=Lax</span>: a cross-site form post cannot reach the
              session endpoints carrying it.
            </li>
            <li>
              <span class="text-ink">Secure over https</span>: it is only marked secure when the site
              is actually served over https, so a plain-http development host is not silently broken.
            </li>
            <li>
              <span class="text-ink">Path scoped to the session endpoints</span>: it is sent to the
              sign-in, refresh and sign-out routes, and to no other page or API call.
            </li>
            <li>
              <span class="text-ink">Thirty days</span>: it matches the lifetime of the refresh
              session it carries, and signing out clears it.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Why there is no consent banner
          </h2>
          <p class="mt-3">
            A consent banner exists to get permission for cookies that are not strictly necessary:
            analytics, advertising, measurement. Strictly necessary cookies are exempt, and this site
            currently sets nothing else. So the honest position is: there is nothing to consent to,
            and a banner asking anyway would be theatre. That is still disclosed here rather than left
            unsaid, because the exemption is from consent, not from telling you.
          </p>
          <p class="mt-3">
            <span class="text-ink">The forward rule, stated so it cannot be forgotten:</span> the
            first non-essential cookie, analytics script, or third-party pixel added to this site must
            arrive with a real consent mechanism and an updated version of this notice: not before
            it, and not after it while it runs unconsented. That is a requirement on whoever adds it,
            and it is written here as one.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Third-party sign-in
          </h2>
          <p class="mt-3">
            If you sign in through a third-party identity provider, that provider sets its own cookies
            and its own browser storage for the sign-in session, under its own policy. It is the
            learner who chooses that route; the password form does not involve it. The provider is
            listed, with what it touches, on the
            <a class="text-accent underline" href="/subprocessors">subprocessor page</a>.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Learning data on your device
          </h2>
          <p class="mt-3">
            Progress, drafts and evidence in the local-first experience are kept in this browser's own
            storage on your machine, not in a cookie and not on our servers. Clearing site data
            removes them along with the session. For what the platform holds server-side once you sign
            in, see the <a class="text-accent underline" href="/privacy">privacy notice</a>.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">
            Removing or blocking it
          </h2>
          <p class="mt-3">
            Your browser can delete or block cookies for this site, and we do not fight that. What
            breaks is only what depends on being signed in: the next page load finds no session and
            asks you to sign in again. Nothing else is affected. The learning app is local-first, so
            with no account and no network it still runs, keeping your work on your own machine.
          </p>
          <p class="mt-3">
            Blocking this specific cookie is not something we can detect, and we do not try to: no
            script here reads it, and no fallback credential is planted anywhere else for it.
          </p>
        </section>

        <section>
          <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Questions</h2>
          <p class="mt-3">
            Write to <span class="text-ink">{PRIVACY_CONTACT}</span>. How the platform protects the
            data it holds is on the <a class="text-accent underline" href="/security">security page</a>,
            and what it collects and why is in the
            <a class="text-accent underline" href="/privacy">privacy notice</a>.
          </p>
        </section>
      </div>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">the inventory</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">one cookie</span><br />
            <span class="num text-[12.5px] text-ink">nexora_refresh</span>: the signed-in session,
            HttpOnly and path-scoped to the session endpoints.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">zero trackers</span><br />
            No analytics, no advertising, no pixels, no profiling, no fingerprinting.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">no consent banner</span><br />
            Because there is nothing non-essential to consent to. The first thing that is gets a
            real mechanism first.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">not used here</p>
        <ul class="mt-4 grid gap-3">
          <li class="text-[14.5px] leading-relaxed text-muted">Analytics or product measurement</li>
          <li class="text-[14.5px] leading-relaxed text-muted">Advertising or retargeting pixels</li>
          <li class="text-[14.5px] leading-relaxed text-muted">Cross-site tracking or profiling</li>
          <li class="text-[14.5px] leading-relaxed text-muted">Fingerprinting or device identifiers</li>
        </ul>
      </Plate>
    </div>
  </div>
</div>
