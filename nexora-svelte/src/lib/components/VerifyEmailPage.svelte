<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { replaceState } from "$app/navigation";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { authMessage } from "$lib/auth-errors";
  import { VERIFY_EMAIL } from "$lib/content/site";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { currentRelease } from "$lib/release-current";
  import { pageTitle } from "$lib/seo";

  /* The email verification screen.
   *
   * One component, two routes, because the platform's link and a link a
   * learner pastes do not have to be the same shape:
   *
   *   /auth/verify-email/confirm?token=...   the platform's default
   *   /auth/verify?token=...                 the friendly page, and the one
   *                                           the sign-up flow points at
   *
   * Both read the code the same way and then do the same thing with it.
   *
   * After a sign-up it says the plain thing: the account is created, and a
   * link is on its way. It does not say "check your inbox" and then leave the
   * learner guessing, and it does not claim the account is unusable until
   * the address is verified, because that is not a rule this product
   * enforces.
   *
   * The code is accepted from the address bar or pasted in, because a learner
   * who opened the email on another machine has the code and not the link.
   *
   * A code in an address bar is a code that ends up in a server log and in
   * the Referer of anything the page links to, so it is read once and then
   * taken out of the address bar.
   *
   * And when this build has no platform behind it, the page says so. It does
   * not pretend a message was sent, because none was. */

  let {
    token: initialToken = "",
    created = false,
    canonical = "/auth/verify",
  }: { token?: string; created?: boolean; canonical?: string } = $props();

  /* The download action, labelled by the release state, so this page cannot
     offer a build that is not published. */
  const release = $derived(currentRelease());

  // The code is read once, from the link, and it is not a live value: a
  // second code in the URL is not something the page should react to. The
  // field is editable, so a learner who opened the email on another machine
  // can paste one instead.
  let code = $state(untrack(() => initialToken));
  let address = $state("");
  let busy = $state(false);
  let sending = $state(false);
  let verified = $state(false);
  let error = $state<string | null>(null);
  let sent = $state<string | null>(null);

  onMount(() => {
    // The code has been read; it leaves the address bar.
    //
    // The call is deferred by a tick because the router sets its root up
    // after the first page has mounted, and the shallow-routing call needs
    // that root. If it still cannot be done, the native call does the same
    // thing to the address bar, which is the part that matters: a code in
    // the URL ends up in a server log and in a Referer.
    if (!initialToken) return;
    const timer = setTimeout(() => {
      try {
        replaceState(canonical, {});
      } catch {
        history.replaceState(null, "", canonical);
      }
    }, 0);
    return () => clearTimeout(timer);
  });

  async function confirm(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await session.confirmEmailVerification(code.trim());
      verified = true;
      code = "";
    } catch (err) {
      error = authMessage(err);
    } finally {
      busy = false;
    }
  }

  /**
   * Ask for another code.
   *
   * The answer is the same sentence whether or not the address has an
   * account, so this page cannot be used to find out who learns here.
   */
  async function resend(e: SubmitEvent) {
    e.preventDefault();
    if (sending) return;
    sending = true;
    error = null;
    sent = null;
    const target = address.trim() || session.user?.email || "";
    if (target.length === 0) {
      error = "Give the email address on the account.";
      sending = false;
      return;
    }
    try {
      await session.requestEmailVerification(target);
      sent = VERIFY_EMAIL.resent;
    } catch (err) {
      error = authMessage(err);
    } finally {
      sending = false;
    }
  }
</script>

<PageHead
  title={pageTitle("Verify your email")}
  description="Confirm the email address on your NEXORA account with the code you were sent."
  path="/auth/verify"
  noindex
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <div>
      <Headline
        as="h1"
        lines={[VERIFY_EMAIL.title]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <p class="mt-6 max-w-[44ch] text-[14.5px] leading-relaxed text-muted">
        {created ? VERIFY_EMAIL.created : VERIFY_EMAIL.idle}
      </p>

      <div class="mt-10 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">what this changes</p>
        <p class="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          It confirms one address on the account. It does not change your plan, it does not move your
          work, and it does not send anything else.
        </p>
      </div>
    </div>

    <div class="min-w-0">
      {#if !apiConfigured}
        <Plate>
          <p class="stamp text-review">cloud accounts not connected</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            {VERIFY_EMAIL.notConnected}
          </p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            The free phases in the IDE work without an account, offline, and every check is
            free.
          </p>
          <div class="mt-5">
            <ActionLink href="/download" variant="ghost" size="sm" island>
              {release.label}
            </ActionLink>
          </div>
        </Plate>
      {:else if verified}
        <Plate crosshair>
          <p class="text-[15px] font-semibold text-ink">{VERIFY_EMAIL.done}</p>
          <div class="mt-6">
            <ActionLink href="/account" island>{VERIFY_EMAIL.back}</ActionLink>
          </div>
        </Plate>
      {:else}
        <Plate crosshair>
          {#if error}
            <div class="border-l border-removed pl-4" role="alert">
              <p class="stamp text-removed">that did not work</p>
              <p class="mt-2 text-[13.5px] leading-relaxed text-muted">{error}</p>
            </div>
          {/if}
          {#if sent}
            <p class="border border-approved px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="status">
              {sent}
            </p>
          {/if}
          <form onsubmit={confirm} class={sent || error ? "mt-6" : ""}>
            <label for="verify-code" class="stamp block text-faint">
              {VERIFY_EMAIL.field}
            </label>
            <input
              id="verify-code"
              type="text"
              required
              bind:value={code}
              autocomplete="one-time-code"
              spellcheck={false}
              class="num mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
              placeholder="the code from the email"
            />
            <div class="mt-6">
              <Button type="submit" busy={busy}>
                {busy ? VERIFY_EMAIL.sending : VERIFY_EMAIL.action}
              </Button>
            </div>
          </form>

          <div class="mt-8 border-t border-rule pt-6">
            <p class="stamp text-[11px] text-faint">no code arrived</p>
            <form onsubmit={resend} class="mt-4">
              {#if !session.user?.email}
                <label for="verify-address" class="stamp block text-faint">
                  {VERIFY_EMAIL.addressField}
                </label>
                <input
                  id="verify-address"
                  type="email"
                  bind:value={address}
                  autocomplete="email"
                  class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
                  placeholder="ada@example.com"
                />
              {/if}
              <div class="mt-4">
                <Button type="submit" variant="ghost" busy={sending}>
                  {sending ? VERIFY_EMAIL.resending : VERIFY_EMAIL.resend}
                </Button>
              </div>
            </form>
            <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
              The answer is the same either way, so this page cannot tell you whether an address has
              an account.
            </p>
          </div>
        </Plate>
      {/if}
    </div>
  </div>
</div>
