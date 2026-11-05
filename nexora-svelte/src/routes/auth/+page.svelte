<script lang="ts">
  import type { PageProps } from "./$types";
  import { FREE_PHASES_PHRASE } from "$lib/content/site";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { kindeConfigured } from "$lib/auth-mode";
  import { authFailure, authMessage } from "$lib/auth-errors";
  import Button from "$lib/components/Button.svelte";
  import Check from "$lib/components/Check.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import SessionControls from "$lib/components/SessionControls.svelte";
  import { pageTitle } from "$lib/seo";
  import { EFFECTIVE_DATE } from "$lib/legal";

  /* Two sign-in methods, one boundary. Email/password talks to the
     local-mode auth service; Kinde (when PUBLIC_AUTH_PROVIDER is `kinde`)
     sends the learner to Kinde's own page and brings back a session this
     app's server reads from a cookie. Either way the rest of the app —
     header, billing, subscription reads — only ever reads session.token.

     This page has four states and each of them has to read as a finished
     product, because a learner meets one of them first:

       signed out   the door, and the reason it did not open if the last
                    attempt did not;
       signed in    where the account is, and the two places to go next;
       restoring    the session is a cookie the page cannot read, so it
                    asks the server before it claims anything;
       not connected  this build has no platform behind it, and the honest
                    answer is the IDE, not a form that cannot work.

     The local-mode decision is deliberate: when the platform is not
     connected there is no form on this page at all. A local account stored
     in the browser would be a fiction: no refresh token, no proofs, no plan,
     no rights, and a "signed in" state the platform knows nothing about.
     So the page says the truth and points at the free phases, which
     need no account at all. */

  let mode = $state<"login" | "register">("login");
  /* The provider buttons come from the server's load: a connection appears
     here only when its Kinde id is configured. The ids themselves stay on the
     server; this page only receives the slugs and labels it draws. */
  let { data }: PageProps = $props();
  let email = $state("");
  let password = $state("");
  let name = $state("");
  let error = $state<string | null>(null);
  /** What kind of failure this was, so the page can offer the way out that
      fits it: a rejected password gets the reset route, an outage gets the
      download. */
  let failure = $state<"rejected" | "outage" | "not-configured" | "other" | null>(null);
  let busy = $state(false);

  /* The two affirmations registration carries.

   * Not consent to process — the account rests on the contract, which is why the
   * form does not gate on a checkbox to create one — but the record of the notice
   * having been given, which GDPR Arts. 13–14, California's notice-at-collection
   * and India's DPDP notice rule each require at the point of collection. The
   * platform refuses the account without them in a production deployment, so this
   * is the submission rather than a client-side nicety, and the *version* travels
   * with it so the record says which wording was on screen.
   *
   * The age line is deliberately blunt about the threshold. GDPR Art. 8 makes
   * under-16s a special case, COPPA covers under-13s, and India's DPDP sets the
   * line at 18; the strictest that can be honoured by a self-serve signup, without
   * collecting a child's data to verify it, is to ask and to refuse. */
  let agree = $state(false);
  let age = $state(false);

  /* The handoff route leaves a reason in the query string, and a restore can
     leave one in the store. A query reason is the newer of the two: it describes
     the attempt that just finished. */
  type KindeError = "conflict" | "identity" | "unavailable" | "session" | null;
  const kindeError = $derived.by<KindeError>(() => {
    const query = page.url.searchParams.get("error");
    if (query === "conflict" || query === "identity" || query === "unavailable" || query === "session") {
      return query;
    }
    return session.authError;
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    failure = null;
    if (mode === "register" && (!agree || !age)) {
      error =
        "Both boxes are required to create an account: the terms and privacy notice, and the age statement.";
      busy = false;
      return;
    }
    try {
      if (mode === "login") {
        await session.login(email.trim(), password);
        // The account home, not the profile: a learner who has just signed in
        // wants to see their account, not a subscription panel.
        goto("/account");
      } else {
        await session.register(email.trim(), password, name.trim(), {
          acceptTerms: agree,
          acceptPrivacy: agree,
          ageAffirmed: age,
          documentVersions: { terms: EFFECTIVE_DATE, privacy: EFFECTIVE_DATE },
        });
        // Creating an account is not the end of it: the address has to be
        // confirmed, and the screen that says so is the next one.
        goto("/auth/verify?created=1");
      }
    } catch (err) {
      // The platform's own code decides the sentence, so a rejected password
      // does not read like an outage and an outage does not read like a
      // mistake of the learner's.
      error = authMessage(err);
      failure = authFailure(err);
    } finally {
      busy = false;
    }
  }
</script>

<PageHead
  title={pageTitle("Account")}
  description="Sign in to unlock IDE courses per your tier, or keep the {FREE_PHASES_PHRASE} locally. It works without an account."
  path="/auth"
/>

<div class="container-page auth-page">
  <div class="auth-grid">
    <!-- The argument, on the left. The form is on the right. -->
    <div class="auth-argument">
      <Headline
        as="h1"
        lines={[
          session.loggedIn ? "You are signed in." : session.restoring ? "One moment." : "An account, and nothing more.",
        ]}
        class="auth-title"
      />
      <p class="auth-lede">
        An account opens IDE courses per your tier. The {FREE_PHASES_PHRASE} bundled in the IDE work
        without one, and it stays that way.
      </p>

      <div class="auth-block">
        <p class="stamp auth-block-label">signing in the IDE</p>
        <p class="auth-block-copy">
          In the IDE, choose sign-in: it shows a short code and opens this site.
          <a href="/auth/ide" class="inline-link">Approve a code</a> there and the IDE signs itself
          in.
          {#if kindeConfigured}
            The credential itself is entered on Kinde's page, never in the IDE.
          {:else}
            Your password is typed here and nowhere else.
          {/if}
        </p>
      </div>

      <div class="auth-block">
        <p class="stamp auth-block-label auth-block-label-faint">what we never ask for</p>
        <p class="auth-block-copy">
          Not your GitHub password, not a wallet, not a phone number.
          {#if kindeConfigured}
            An email, and whichever sign-in method you choose.
          {:else}
            An email and a password, and nothing this product cannot justify needing.
          {/if}
        </p>
      </div>
    </div>

    <!-- Every state of the account, in one column. -->
    <div class="auth-column">
      {#if session.restoring}
        <!-- Shown before the sign-in form, never instead of the account: the
             session is a cookie the page cannot read, so the form would be a guess. -->
        <Plate>
          <p class="stamp text-muted">checking your session</p>
          <p class="auth-note">
            Your session lives in a cookie this page cannot read, so it asks the server before it
            can say whether you are signed in. One moment.
          </p>
        </Plate>
      {:else if !apiConfigured}
        <!-- Local mode. There is no form here on purpose: a form that cannot
             work is worse than no form, and the {FREE_PHASES_PHRASE} do not need
             one. -->
        <Plate>
          <p class="stamp auth-state">cloud accounts not connected</p>
          <p class="auth-note">
            This build has no platform behind it. There are no cloud accounts to sign into and no password to
            reset. The free phases in the IDE work without one, offline, and every check is free.
          </p>
          <p class="auth-note">
            When the platform is connected, this page holds the way into an account: Kinde's own
            sign-in in a Kinde deployment, or the email and password forms in a local one.
          </p>
          <div class="auth-note-actions">
            <ActionLink href="/download" variant="ghost" size="sm" island>The download page</ActionLink>
          </div>
        </Plate>
      {:else if session.loggedIn && session.user}
        <Plate crosshair>
          <p class="stamp auth-label-faint">signed in as</p>
          <p class="auth-identity">{session.user.email}</p>
          {#if session.user.name}
            <p class="auth-identity-note">{session.user.name}</p>
          {/if}
          <div class="auth-actions">
            <ActionLink href="/account" island>Your account</ActionLink>
            <ActionLink href="/profile" variant="ghost" size="sm" island>Manage your plan</ActionLink>
          </div>
          <p class="auth-fineprint">
            Your account home holds your plan, the work the platform has verified, the way into the
            IDE, and the controls over your own data.
          </p>
        </Plate>
      {:else if kindeConfigured}
        <Plate crosshair>
          <p class="stamp auth-label-faint">identity by Kinde</p>
          <h2 class="auth-h2">One door, managed by Kinde.</h2>
          <p class="auth-note auth-measure">
            Sign-in and account creation run through Kinde. You come back here with a session
            this site can read; the platform keeps your profile, not your password.
          </p>

          {#if kindeError === "conflict"}
            <div class="auth-alert auth-alert-removed" role="alert">
              <p class="stamp auth-alert-label auth-alert-removed-label">two ways in, one account each</p>
              <p class="auth-alert-copy">
                An account with this email already exists under a different sign-in method. This
                site will not merge two identities. Use the method that account was created with.
              </p>
            </div>
          {:else if kindeError === "identity"}
            <div class="auth-alert auth-alert-review" role="alert">
              <p class="stamp auth-alert-label auth-alert-review-label">the two ends do not agree</p>
              <p class="auth-alert-copy">
                Kinde returned a session this platform could not match. The sign-in settings on the
                two sides may not be the same. Try again, and if it keeps happening, write to us.
              </p>
            </div>
          {:else if kindeError === "unavailable"}
            <div class="auth-alert auth-alert-review" role="alert">
              <p class="stamp auth-alert-label auth-alert-review-label">sign-in is unreachable</p>
              <p class="auth-alert-copy">
                The sign-in service did not answer. Nothing here depends on it. Try again, or keep
                learning in the IDE without an account.
              </p>
            </div>
          {:else if kindeError === "session"}
            <div class="auth-alert auth-alert-review" role="alert">
              <p class="stamp auth-alert-label auth-alert-review-label">the sign-in did not finish</p>
              <p class="auth-alert-copy">
                Kinde sent you back without a session this site could use. Go through the door again;
                the free phases do not need it.
              </p>
            </div>
          {/if}

          <div class="auth-actions auth-actions-wrap">
            <ActionLink href="/api/auth/login" island external>Continue with Kinde</ActionLink>
            <ActionLink href="/api/auth/register" variant="ghost" size="sm" external>
              Create an account
            </ActionLink>
          </div>

          {#if data.socialProviders.length > 0}
            <div class="auth-subrule">
              <p class="stamp auth-label-faint">or come in with an account you already have</p>
              <div class="auth-providers">
                {#each data.socialProviders as provider (provider.slug)}
                  <ActionLink
                    href={`/auth/provider/${provider.slug}`}
                    variant="ghost"
                    size="sm"
                    label={`Continue with ${provider.label}`}
                    class="auth-provider"
                  >
                    {provider.label}
                  </ActionLink>
                {/each}
              </div>
              <p class="auth-fineprint auth-fineprint-tight">
                These sign in through Kinde. The provider confirms who you are, and this site
                never receives that password.
              </p>
            </div>
          {/if}

          <div class="auth-subrule">
            <p class="auth-fineprint auth-fineprint-tight">
              You leave this site for Kinde, or for the provider you choose, then come back.
              Kinde receives your email address and name to sign you in, and is named on the
              <a href="/subprocessors" class="inline-link"
                >subprocessor page</a
              >. Verification and recovery are handled by the identity provider.
            </p>
            <p class="auth-fineprint auth-fineprint-tight auth-fineprint-follow">
              The {FREE_PHASES_PHRASE} still work without an account.
            </p>
          </div>
        </Plate>
      {:else}
        <Plate crosshair>
          <div class="auth-tabs" role="tablist" aria-label="Sign in or create account">
            {#each ["login", "register"] as m (m)}
              <button
                role="tab"
                aria-selected={mode === m}
                onclick={() => {
                  mode = m as "login" | "register";
                  error = null;
                  failure = null;
                }}
                class="auth-tab"
                data-selected={mode === m ? "true" : "false"}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            {/each}
          </div>

          <form onsubmit={submit} class="auth-form">
            {#if mode === "register"}
              <div>
                <label for="auth-name" class="field-label">name</label>
                <input
                  id="auth-name"
                  bind:value={name}
                  placeholder="Ada"
                  autocomplete="nickname"
                  class="field-input auth-field"
                />
              </div>
            {/if}
            <div class="auth-field-block">
              <label for="auth-email" class="field-label">email</label>
              <input
                id="auth-email"
                type="email"
                required
                bind:value={email}
                placeholder="ada@example.com"
                autocomplete="email"
                class="field-input auth-field"
              />
            </div>
            <div class="auth-field-block">
              <label for="auth-password" class="field-label">
                password{mode === "register" ? ": 10 characters or more" : ""}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minlength={mode === "register" ? 10 : 1}
                bind:value={password}
                autocomplete={mode === "login" ? "current-password" : "new-password"}
                class="field-input auth-field"
              />
            </div>
            {#if mode === "register"}
              <div class="auth-consent">
                <Check id="auth-agree" bind:checked={agree}>
                  I have read the <a
                    href="/terms"
                    class="inline-link">terms</a
                  >, and the <a href="/privacy" class="inline-link"
                    >privacy notice</a
                  >, and I accept them. Which version I read is recorded with this account.
                </Check>
                <Check id="auth-age" bind:checked={age}>
                  I am 16 or older, or I have a parent's or guardian's permission to use this.
                </Check>
              </div>
            {/if}
            {#if error}
              <div class="auth-alert auth-alert-removed" role="alert">
                <p class="stamp auth-alert-label auth-alert-removed-label">that did not work</p>
                <p class="auth-alert-copy">{error}</p>
              </div>
              <!-- The way out that fits the failure. A rejected password is
                   fixed by a new password, an outage is not fixed by
                   anything this page can offer. -->
              {#if failure === "rejected"}
                <div class="auth-recovery">
                  <a href="/auth/password-reset" class="auth-recovery-link">
                    Forgot your password?
                  </a>
                </div>
              {:else if failure === "outage"}
                <div class="auth-recovery">
                  <a href="/download" class="auth-recovery-link">
                    The {FREE_PHASES_PHRASE} work without an account
                  </a>
                </div>
              {/if}
            {/if}
            <div class="auth-submit">
              <Button type="submit" busy={busy}>
                {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </div>
          </form>
          <!-- The two things that go with a password. They are here, on the
               form a learner is looking at when the password is the thing
               that is wrong, and not behind a menu. -->
          <div class="auth-recovery auth-recovery-row">
            <a href="/auth/password-reset" class="auth-recovery-link">
              Forgot your password?
            </a>
            <a href="/auth/verify" class="auth-recovery-link">Verify your email</a>
          </div>
          <p class="auth-fineprint auth-fineprint-follow">
            Passwords are bcrypt-hashed. Sessions rotate, and theft revokes the whole family. A new
            account is verified by email, and the next screen says so.
          </p>
        </Plate>
      {/if}

      <!-- The session controls live outside every branch, because ending
           every session signs this page out too and the learner still has
           to read what happened. -->
      <div class="auth-session-controls">
        <SessionControls />
      </div>
    </div>
  </div>
</div>

<style>
  /* The account door, set like the rest of the site: scoped CSS, the shared
     field classes, and the same two-column split the marketing pages use. The
     only thing special about this page is how much of it changes state. */

  .auth-page {
    padding-block: clamp(4rem, 8vw, 7rem);
    background:
      radial-gradient(50% 40% at 85% 10%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 65%);
  }

  .auth-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-12);
  }

  @media (min-width: 1024px) {
    .auth-grid {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: var(--space-20);
    }
  }

  .auth-argument,
  .auth-column {
    min-width: 0;
  }

  /* Both of these are handed to a child component, which renders them on its
     own element: a scoped selector would never match, so they are global by
     name. The names are namespaced to this route for that reason. */
  :global(.auth-title) {
    font-size: var(--text-page);
    color: var(--color-ink);
  }

  :global(.auth-provider) {
    width: 100%;
  }

  .auth-lede {
    margin-top: var(--space-6);
    max-width: 44ch;
    font-size: 15px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .auth-block {
    margin-top: var(--space-8);
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-rule);
  }

  .auth-block:first-of-type {
    margin-top: var(--space-10);
  }

  .auth-block-copy {
    margin-top: var(--space-3);
    max-width: 46ch;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .auth-block-label {
    color: var(--color-accent);
  }

  .auth-block-label-faint,
  .auth-label-faint {
    color: var(--color-faint);
  }

  .auth-state {
    color: var(--color-review);
  }

  .auth-note {
    margin-top: var(--space-3);
    max-width: 52ch;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .auth-measure {
    max-width: 52ch;
  }

  .auth-note-actions {
    margin-top: var(--space-5);
  }

  .auth-h2 {
    margin-top: var(--space-3);
    font-size: clamp(1.3rem, 2.6vw, 1.8rem);
    color: var(--color-ink);
  }

  .auth-identity {
    margin-top: var(--space-3);
    font-size: 16px;
    color: var(--color-ink);
  }

  .auth-identity-note {
    margin-top: var(--space-1);
    font-size: 13px;
    color: var(--color-muted);
  }

  .auth-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-6);
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-rule);
  }

  .auth-actions-wrap {
    margin-top: var(--space-6);
    padding-top: 0;
    border-top: 0;
  }

  .auth-subrule {
    margin-top: var(--space-6);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-rule);
  }

  .auth-providers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .auth-fineprint {
    margin-top: var(--space-5);
    max-width: 52ch;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  .auth-fineprint-tight {
    margin-top: 0;
  }

  .auth-fineprint-follow {
    margin-top: var(--space-3);
  }

  /* A verdict block. The colour is the label and the hairline that closes the
     block on all four sides, never a stripe down one edge; the sentence under
     it stays in the reading ink, because the paragraph is not the thing that
     failed. */
  .auth-alert {
    margin-top: var(--space-5);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-review);
    border-radius: var(--radius-sm);
  }

  .auth-alert-removed {
    border-color: var(--color-removed);
  }

  .auth-alert-review {
    border-color: var(--color-review);
  }

  .auth-alert-copy {
    margin-top: var(--space-2);
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .auth-alert-removed-label {
    color: var(--color-removed);
  }

  .auth-alert-review-label {
    color: var(--color-review);
  }

  /* The tabs are two states of one control, not two links. The underline is
     the selected state and it is painted in the action hue; there is no
     pill, because a pill would read as a button. */
  .auth-tabs {
    display: flex;
    border-bottom: 1px solid var(--color-rule);
  }

  .auth-tab {
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-muted);
    cursor: pointer;
    transition: color var(--dur-1) var(--ease-out);
  }

  .auth-tab:hover {
    color: var(--color-ink);
  }

  .auth-tab[data-selected="true"] {
    border-bottom-color: var(--color-accent);
    color: var(--color-ink);
  }

  .auth-form {
    margin-top: var(--space-6);
  }

  .auth-field-block {
    margin-top: var(--space-5);
  }

  .auth-field {
    margin-top: var(--space-2);
    font-size: 14px;
  }

  .auth-consent {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-6);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-rule);
  }

  .auth-recovery {
    margin-top: var(--space-4);
  }

  .auth-recovery-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
    margin-top: var(--space-6);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-rule);
  }

  .auth-recovery-link {
    font-size: 13px;
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .auth-recovery-link:hover {
    color: var(--color-accent-strong);
  }

  .auth-submit {
    margin-top: var(--space-6);
  }

  .auth-session-controls {
    margin-top: var(--space-6);
  }

  .inline-link {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .inline-link:hover {
    color: var(--color-accent-strong);
  }
</style>
