<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { replaceState } from "$app/navigation";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { authMessage } from "$lib/auth-errors";
  import { PASSWORD_RESET } from "$lib/content/site";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { currentRelease } from "$lib/release-current";
  import { pageTitle } from "$lib/seo";

  /* Setting a new password with the token from the link.
   *
   * One component, two routes, because the platform's link and a link a
   * learner pastes do not have to be the same shape:
   *
   *   /auth/password-reset/confirm?token=...   the platform's default
   *   /auth/password-reset/<token>              the path form, kept working
   *
   * Both read the token the same way and then do the same thing with it.
   *
   * The token is a one-time credential, and a one-time credential in an
   * address bar is a one-time credential that ends up in a server log and in
   * the Referer of anything the page links to. So it is read once, on the
   * client, and then it is taken out of the address bar: the URL is replaced
   * with the same page and no token in it. A reload afterwards lands on a
   * form with an empty token field, which is exactly where a learner who
   * opens the email on another machine already is.
   *
   * The password rule is the sign-up rule, ten characters at least, and it is
   * written the same way here as it is there. Two forms with two rules would
   * be two rules to keep in step.
   *
   * The token is sent to one place and one place only: this app's own
   * endpoint, which forwards it to the platform and never returns it. */

  let { token: initialToken = "" }: { token?: string } = $props();

  /* The download action, labelled by the release state, so this page cannot
     offer a build that is not published. */
  const release = $derived(currentRelease());

  // The token is read once, from the link, and it is not a live value: a
  // second token in the URL is not something the page should react to. The
  // field is editable, so a learner who opened the email on another machine
  // can paste one instead.
  let token = $state(untrack(() => initialToken));
  let password = $state("");
  let busy = $state(false);
  let done = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    // The token has been read; it leaves the address bar.
    //
    // The call is deferred by a tick because the router sets its root up
    // after the first page has mounted, and the shallow-routing call needs
    // that root. If it still cannot be done, the native call does the same
    // thing to the address bar, which is the part that matters: a token in
    // the URL ends up in a server log and in a Referer.
    if (!initialToken) return;
    const timer = setTimeout(() => {
      try {
        replaceState("/auth/password-reset/confirm", {});
      } catch {
        history.replaceState(null, "", "/auth/password-reset/confirm");
      }
    }, 0);
    return () => clearTimeout(timer);
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await session.confirmPasswordReset(token.trim(), password);
      done = true;
      // The password is dropped from the page as soon as it has been set, so
      // it is not sitting in a form in the history of this tab.
      password = "";
    } catch (err) {
      error = authMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<PageHead
  title={pageTitle("Choose a new password")}
  description="Set a new password on your NEXORA account with the link you were sent."
  path="/auth/password-reset"
  noindex
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <div>
      <Headline
        as="h1"
        lines={[PASSWORD_RESET.confirm.title]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <p class="mt-6 max-w-[44ch] text-[14.5px] leading-relaxed text-muted">
        {PASSWORD_RESET.confirm.lede}
      </p>

      <div class="mt-10 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">what this changes</p>
        <p class="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          Only the password on the account the link was sent to. Your phases, your receipts and your
          work in the IDE are not touched, because none of them live in the account.
        </p>
      </div>
    </div>

    <div class="min-w-0">
      {#if !apiConfigured}
        <Plate>
          <p class="stamp text-review">cloud accounts not connected</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            This build runs in local mode, so there is no account and no link was issued. The free
            phases in the IDE work without one, offline, and every check is free.
          </p>
          <div class="mt-5">
            <ActionLink href="/download" variant="ghost" size="sm" island>
              {release.label}
            </ActionLink>
          </div>
        </Plate>
      {:else if done}
        <Plate crosshair>
          <p class="text-[15px] font-semibold text-ink">{PASSWORD_RESET.confirm.done}</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            The link has stopped working. If you need to do this again, ask for another one from the
            sign-in page.
          </p>
          <div class="mt-6">
            <ActionLink href="/auth" island>Sign in</ActionLink>
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
          <form onsubmit={submit}>
            <label for="reset-token" class="stamp block text-faint">
              {PASSWORD_RESET.confirm.tokenField}
            </label>
            <input
              id="reset-token"
              type="text"
              required
              bind:value={token}
              autocomplete="off"
              spellcheck={false}
              class="num mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
              placeholder="the code from the link"
            />
            <label for="reset-password" class="stamp mt-5 block text-faint">
              {PASSWORD_RESET.confirm.field}
            </label>
            <input
              id="reset-password"
              type="password"
              required
              minlength={10}
              bind:value={password}
              autocomplete="new-password"
              class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
            />
            <div class="mt-6">
              <Button type="submit" busy={busy}>
                {busy ? PASSWORD_RESET.confirm.sending : PASSWORD_RESET.confirm.action}
              </Button>
            </div>
          </form>
          <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
            The same rule as when the account was made: ten characters or more.
          </p>
          <div class="mt-4 border-t border-rule pt-5">
            <a href="/auth/password-reset" class="text-[13px] text-accent underline underline-offset-4">
              {PASSWORD_RESET.confirm.newLink}
            </a>
          </div>
        </Plate>
      {/if}
    </div>
  </div>
</div>
