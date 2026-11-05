<script lang="ts">
  import { apiConfigured, session } from "$lib/session.svelte";
  import { authMessage } from "$lib/auth-errors";
  import { PASSWORD_RESET, FREE_PHASES_PHRASE } from "$lib/content/site";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";

  /* Asking for a password reset link.
   *
   * The whole point of this page is a sentence it must not vary: if the
   * address has an account, a link is on its way, and if it has not, nothing
   * is sent and no account is made. Both halves are printed together, always,
   * so the page cannot be used to find out which addresses are registered.
   *
   * That promise is kept in three places, because a promise kept in one is a
   * promise one edit away from breaking: the copy module holds one string,
   * the broker answers 202 whatever the platform said (see
   * src/routes/auth/session/password-reset/request/+server.ts), and this page
   * never reads the reply's body. */

  let email = $state("");
  let busy = $state(false);
  let sent = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await session.requestPasswordReset(email.trim());
      // The one answer this page has, and it is the same one either way.
      sent = true;
    } catch (err) {
      // The platform's own code decides the sentence: a rejection, an outage
      // and a build with no platform each get their own.
      error = authMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<PageHead
  title={pageTitle("Set a new password")}
  description="Ask for a link to set a new password on your NEXORA account."
  path="/auth/password-reset"
  noindex
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <div>
      <Headline
        as="h1"
        lines={[PASSWORD_RESET.request.title]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <p class="mt-6 max-w-[44ch] text-[14.5px] leading-relaxed text-muted">
        {PASSWORD_RESET.request.lede}
      </p>

      <div class="mt-10 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">the same answer either way</p>
        <p class="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          This page never says whether an address has an account, because a page that did would be
          a way of finding out who learns here. If the address is unknown, nothing is sent and no
          account is created.
        </p>
      </div>
    </div>

    <div class="min-w-0">
      {#if !apiConfigured}
        <Plate>
          <p class="stamp text-review">cloud accounts not connected</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            This build runs in local mode, so there is no account to reset and no link was sent. The
            {FREE_PHASES_PHRASE} in the IDE work without one, offline, and every check is free.
          </p>
          <div class="mt-5">
            <ActionLink href="/download" variant="ghost" size="sm" island>The download page</ActionLink>
          </div>
        </Plate>
      {:else}
        <Plate crosshair>
          {#if sent}
            <p class="border border-approved px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="status">
              {PASSWORD_RESET.request.sent}
            </p>
          {/if}
          {#if error}
            <div class="border-l border-removed pl-4" role="alert">
              <p class="stamp text-removed">that did not work</p>
              <p class="mt-2 text-[13.5px] leading-relaxed text-muted">{error}</p>
            </div>
          {/if}
          <form onsubmit={submit} class={sent ? "mt-6 border-t border-rule pt-6" : ""}>
            <label for="reset-email" class="stamp block text-faint">
              {PASSWORD_RESET.request.field}
            </label>
            <input
              id="reset-email"
              type="email"
              required
              bind:value={email}
              placeholder="ada@example.com"
              autocomplete="email"
              class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            />
            <div class="mt-6">
              <Button type="submit" busy={busy}>
                {busy
                  ? PASSWORD_RESET.request.sending
                  : sent
                    ? PASSWORD_RESET.request.again
                    : PASSWORD_RESET.request.action}
              </Button>
            </div>
          </form>
          <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
            The link works once. If it expires, ask for another one and the same sentence comes back.
          </p>
        </Plate>
      {/if}
    </div>
  </div>
</div>
