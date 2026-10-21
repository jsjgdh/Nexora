<script lang="ts">
  import { FREE_PHASES_PHRASE } from "$lib/content/site";
  import { goto } from "$app/navigation";
  import { apiConfigured, session } from "$lib/session.svelte";
  import {
    clerkConfigured,
    clerkStatus,
    mountClerkAuth,
  } from "$lib/clerk";
  import { authFailure, authMessage } from "$lib/auth-errors";
  import Button from "$lib/components/Button.svelte";
  import Check from "$lib/components/Check.svelte";
  import { cn } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import SessionControls from "$lib/components/SessionControls.svelte";
  import { pageTitle } from "$lib/seo";
  import { EFFECTIVE_DATE } from "$lib/legal";

  /* Two sign-in methods, one boundary. Email/password talks to the
     local-mode auth service; Clerk (when PUBLIC_CLERK_PUBLISHABLE_KEY is
     set) mounts Clerk's own components and stores the Clerk session token.
     Either way the rest of the app — header, billing, subscription reads —
     only ever reads session.token.

     This page has four states and each of them has to read as a finished
     product, because a learner meets one of them first:

       signed out   the form, and the two ways out of it if the password is
                    the thing that is wrong;
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

  let clerkTab = $state<"sign-in" | "sign-up">("sign-in");
  let clerkNode: HTMLDivElement | null = $state(null);
  let clerkNote = $state<"conflict" | "unavailable" | null>(null);

  // Clerk branch: adopt an existing Clerk session (return visits), then
  // render Clerk's own form. A linked session leaves for the account home; a
  // conflict or an unreachable Clerk keeps the learner here with words.
  $effect(() => {
    if (!clerkConfigured || !apiConfigured || session.loggedIn) return;
    const node = clerkNode;
    const kind = clerkTab;
    if (!node) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const status = await clerkStatus();
      if (cancelled) return;
      if (status === "linked") {
        goto("/account");
        return;
      }
      if (status === "conflict") clerkNote = "conflict";
      else if (status === "unavailable" || status === "unconfigured") clerkNote = "unavailable";
      cleanup = await mountClerkAuth(kind, node);
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
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

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <!-- The argument, on the left. The form is on the right. -->
    <div>
      <Headline
        as="h1"
        lines={[
          session.loggedIn ? "You are signed in." : session.restoring ? "One moment." : "An account, and nothing more.",
        ]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <p class="mt-6 max-w-[44ch] text-[14.5px] leading-relaxed text-muted">
        An account unlocks IDE courses per your tier. The {FREE_PHASES_PHRASE} bundled in the IDE work
        without one, and it stays that way.
      </p>

      <div class="mt-10 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-accent">signing in the IDE</p>
        <p class="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          In the IDE, choose sign-in: it shows a short code and opens this site. Approve the code at
          <a href="/auth/ide" class="text-accent underline underline-offset-4">IDE sign-in</a>
          and the IDE signs itself in. Your password is typed here and nowhere else.
        </p>
      </div>

      <div class="mt-8 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">what we never ask for</p>
        <p class="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          Not your GitHub password, not a wallet, not a phone number. An email and a password, or
          the provider's own sign-in, which is nothing this product cannot justify needing.
        </p>
      </div>
    </div>

    <!-- Every state of the account, in one column. -->
    <div class="min-w-0">
      {#if session.restoring}
        <!-- Shown before the sign-in form, never instead of the account: the
             session is a cookie the page cannot read, so the form would be a guess. -->
        <Plate>
          <p class="stamp text-muted">checking your session</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            Your session lives in a cookie this page cannot read, so it asks the server before it
            can say whether you are signed in. One moment.
          </p>
        </Plate>
      {:else if !apiConfigured}
        <!-- Local mode. There is no form here on purpose: a form that cannot
             work is worse than no form, and the {FREE_PHASES_PHRASE} do not need
             one. -->
        <Plate>
          <p class="stamp text-review">cloud accounts not connected</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            This build runs in local mode, so there are no accounts to sign into and no password to
            reset. The free phases in the IDE work without one, offline, and every check is free.
          </p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            When the platform is connected, this page holds the sign-in form, the create-account
            form, and the two things that go with a password: the reset link and the email
            verification.
          </p>
          <div class="mt-5">
            <ActionLink href="/download" variant="ghost" size="sm" island>Download the IDE</ActionLink>
          </div>
        </Plate>
      {:else if session.loggedIn && session.user}
        <Plate crosshair>
          <p class="stamp text-[11px] text-faint">signed in as</p>
          <p class="mt-3 text-[16px] text-ink">{session.user.email}</p>
          {#if session.user.name}
            <p class="mt-1 text-[13px] text-muted">{session.user.name}</p>
          {/if}
          <div class="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
            <ActionLink href="/account" island>Your account</ActionLink>
            <ActionLink href="/profile" variant="ghost" size="sm" island>Manage your plan</ActionLink>
          </div>
          <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
            Your account home holds your plan, the work the platform has verified, the way into the
            IDE, and the controls over your own data.
          </p>
        </Plate>
      {:else if clerkConfigured}
        <Plate>
          <div class="flex border-b border-rule" role="tablist" aria-label="Sign in or create account">
            {#each [["sign-in", "Sign in"], ["sign-up", "Create account"]] as [tab, label] (tab)}
              <button
                role="tab"
                aria-selected={clerkTab === tab}
                onclick={() => {
                  clerkTab = tab as "sign-in" | "sign-up";
                  clerkNote = null;
                }}
                class={cn(
                  "cursor-pointer border-b-2 bg-transparent px-4 py-2 text-[13px] font-semibold",
                  clerkTab === tab ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
                )}
              >
                {label}
              </button>
            {/each}
          </div>
          {#if clerkNote === "conflict"}
            <div class="mt-5 border-l border-removed pl-4" role="alert">
              <p class="stamp text-removed">two ways in, one account each</p>
              <p class="mt-2 text-[13.5px] leading-relaxed text-muted">
                An account with this email already exists under a different sign-in method. Pick one
                and stick with it.
              </p>
            </div>
          {:else if clerkNote === "unavailable"}
            <div class="mt-5 border-l border-review pl-4" role="alert">
              <p class="stamp text-review">sign-in is unreachable</p>
              <p class="mt-2 text-[13.5px] leading-relaxed text-muted">
                The sign-in service did not answer. Nothing here depends on it. Try again, or keep
                learning in the IDE without an account.
              </p>
            </div>
          {/if}
          <div bind:this={clerkNode} class="mt-6 min-h-[200px]"></div>
          <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
            Signing in backs up drafts, attempts and completions, and pulls them onto every device.
            Everything already on this browser moves onto the account, never the other way round.
          </p>
        </Plate>
      {:else}
        <Plate crosshair>
          <div class="flex border-b border-rule" role="tablist" aria-label="Sign in or create account">
            {#each ["login", "register"] as m (m)}
              <button
                role="tab"
                aria-selected={mode === m}
                onclick={() => {
                  mode = m as "login" | "register";
                  error = null;
                  failure = null;
                }}
                class={cn(
                  "cursor-pointer border-b-2 bg-transparent px-4 py-2 text-[13px] font-semibold",
                  mode === m ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            {/each}
          </div>

          <form onsubmit={submit} class="mt-6">
            {#if mode === "register"}
              <div>
                <label for="auth-name" class="stamp block text-faint">name</label>
                <input
                  id="auth-name"
                  bind:value={name}
                  placeholder="Ada"
                  autocomplete="nickname"
                  class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
                />
              </div>
            {/if}
            <div class={cn(mode === "register" && "mt-5")}>
              <label for="auth-email" class="stamp block text-faint">email</label>
              <input
                id="auth-email"
                type="email"
                required
                bind:value={email}
                placeholder="ada@example.com"
                autocomplete="email"
                class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
              />
            </div>
            <div class="mt-5">
              <label for="auth-password" class="stamp block text-faint">
                password{mode === "register" ? ": 10 characters or more" : ""}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minlength={mode === "register" ? 10 : 1}
                bind:value={password}
                autocomplete={mode === "login" ? "current-password" : "new-password"}
                class="mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-faint"
              />
            </div>
            {#if mode === "register"}
              <div class="mt-6 space-y-3 border-t border-rule pt-5">
                <Check id="auth-agree" bind:checked={agree}>
                  I have read the <a
                    href="/terms"
                    class="text-accent underline underline-offset-4">terms</a
                  >, and the <a href="/privacy" class="text-accent underline underline-offset-4"
                    >privacy notice</a
                  >, and I accept them. Which version I read is recorded with this account.
                </Check>
                <Check id="auth-age" bind:checked={age}>
                  I am 16 or older, or I have a parent's or guardian's permission to use this.
                </Check>
              </div>
            {/if}
            {#if error}
              <div class="mt-5 border-l border-removed pl-4" role="alert">
                <p class="stamp text-removed">that did not work</p>
                <p class="mt-2 text-[13.5px] leading-relaxed text-muted">{error}</p>
              </div>
              <!-- The way out that fits the failure. A rejected password is
                   fixed by a new password, an outage is not fixed by
                   anything this page can offer. -->
              {#if failure === "rejected"}
                <div class="mt-4">
                  <a
                    href="/auth/password-reset"
                    class="text-[13px] text-accent underline underline-offset-4"
                  >
                    Forgot your password?
                  </a>
                </div>
              {:else if failure === "outage"}
                <div class="mt-4">
                  <a href="/download" class="text-[13px] text-accent underline underline-offset-4">
                    The {FREE_PHASES_PHRASE} work without an account
                  </a>
                </div>
              {/if}
            {/if}
            <div class="mt-6">
              <Button type="submit" busy={busy}>
                {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </div>
          </form>
          <!-- The two things that go with a password. They are here, on the
               form a learner is looking at when the password is the thing
               that is wrong, and not behind a menu. -->
          <div class="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-5">
            <a
              href="/auth/password-reset"
              class="text-[13px] text-accent underline underline-offset-4"
            >
              Forgot your password?
            </a>
            <a href="/auth/verify" class="text-[13px] text-accent underline underline-offset-4">
              Verify your email
            </a>
          </div>
          <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
            Passwords are bcrypt-hashed. Sessions rotate, and theft revokes the whole family. A new
            account is verified by email, and the next screen says so.
          </p>
        </Plate>
      {/if}

      <!-- The session controls live outside every branch, because ending
           every session signs this page out too and the learner still has
           to read what happened. -->
      <div class="mt-6">
        <SessionControls />
      </div>
    </div>
  </div>
</div>
