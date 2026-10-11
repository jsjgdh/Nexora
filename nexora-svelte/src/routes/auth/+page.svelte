<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { clerkConfigured, clerkStatus, mountClerkAuth, signOutEverywhere } from "$lib/clerk";
  import Button from "$lib/components/Button.svelte";
  import { cn } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* Two sign-in methods, one boundary. Email/password talks to the
     local-mode auth service; Clerk (when PUBLIC_CLERK_PUBLISHABLE_KEY is
     set) mounts Clerk's own components and stores the Clerk session token.
     Either way the rest of the app — header, tutor, billing, sync — only
     ever reads session.token. */

  let mode = $state<"login" | "register">("login");
  let email = $state("");
  let password = $state("");
  let name = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  let clerkTab = $state<"sign-in" | "sign-up">("sign-in");
  let clerkNode: HTMLDivElement | null = $state(null);
  let clerkNote = $state<"conflict" | "unavailable" | null>(null);

  // Clerk branch: adopt an existing Clerk session (return visits), then
  // render Clerk's own form. A linked session leaves for the roadmap; a
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
        goto("/roadmap");
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
    try {
      if (mode === "login") await session.login(email.trim(), password);
      else await session.register(email.trim(), password, name.trim());
      goto("/roadmap");
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    if (clerkConfigured) await signOutEverywhere();
    else session.logout();
  }
</script>

<PageHead
  title={pageTitle("Account")}
  description="Sign in to sync your progress across devices, or keep working locally — every mission, check and export works without an account."
  path="/auth"
/>

<div class="mx-auto max-w-lg px-4 py-10">
  <p class="stamp text-accent">account</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    {#if session.loggedIn}
      You are signed in
    {:else if clerkConfigured && apiConfigured}
      Welcome
    {:else if mode === "login"}
      Welcome back
    {:else}
      Create your account
    {/if}
  </h1>
  <p class="mt-2 text-[14px] leading-relaxed text-muted">
    An account backs your progress up and lets you continue on another device. The curriculum is
    fully usable without one.
  </p>

  {#if !apiConfigured}
    <div class="thread mt-6">
      <p class="stamp text-review">cloud accounts not connected</p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
        This build runs in local mode, so progress stays in this browser. Set
        <code class="num text-ink">PUBLIC_API_URL</code> to enable accounts.
      </p>
      <a
        href="/roadmap"
        class="mt-3 inline-flex border border-rule px-3 py-1.5 text-[13px] text-ink hover:border-accent hover:text-accent"
      >
        Back to the roadmap
      </a>
    </div>
  {:else if session.loggedIn && session.user}
    <div class="mt-6 border border-rule">
      <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">signed in as</h2>
      <div class="px-3 py-3">
        <p class="text-[15px] text-ink">{session.user.email}</p>
        {#if session.user.name}
          <p class="mt-0.5 text-[13px] text-muted">{session.user.name}</p>
        {/if}
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <a
            href="/roadmap"
            class="inline-flex border border-accent bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent hover:bg-accent/20"
          >
            Open the roadmap
          </a>
          <Button variant="ghost" onclick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  {:else if clerkConfigured}
    <div
      class="mt-6 flex border-b border-rule"
      role="tablist"
      aria-label="Sign in or create account"
    >
      {#each [["sign-in", "Sign in"], ["sign-up", "Create account"]] as [tab, label] (tab)}
        <button
          role="tab"
          aria-selected={clerkTab === tab}
          onclick={() => {
            clerkTab = tab as "sign-in" | "sign-up";
            clerkNote = null;
          }}
          class={cn(
            "border-b px-3 py-2 text-[13px] font-medium",
            clerkTab === tab ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
          )}
        >
          {label}
        </button>
      {/each}
    </div>
    {#if clerkNote === "conflict"}
      <div class="thread mt-4" role="alert">
        <p class="stamp text-removed">two ways in, one account each</p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
          An account with this email already exists under a different sign-in method. Pick one
          and stick with it — and nothing you did as a guest is lost either way.
        </p>
        <a
          href="/roadmap"
          class="mt-3 inline-flex border border-rule px-3 py-1.5 text-[13px] text-ink hover:border-accent hover:text-accent"
        >
          Continue locally for now
        </a>
      </div>
    {:else if clerkNote === "unavailable"}
      <div class="thread mt-4" role="alert">
        <p class="stamp text-review">sign-in is unreachable</p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
          The sign-in service did not answer. Your work is saved on this device — try again, or
          keep learning without an account.
        </p>
      </div>
    {/if}
    <div bind:this={clerkNode} class="mt-5 min-h-[200px]"></div>
    <p class="mt-4 text-[12px] leading-relaxed text-faint">
      Signing in backs up drafts, attempts and completions, and pulls them onto every device.
      Everything already on this browser moves onto the account, never the other way round.
    </p>
  {:else}
    <div
      class="mt-6 flex border-b border-rule"
      role="tablist"
      aria-label="Sign in or create account"
    >
      {#each ["login", "register"] as m (m)}
        <button
          role="tab"
          aria-selected={mode === m}
          onclick={() => {
            mode = m as "login" | "register";
            error = null;
          }}
          class={cn(
            "border-b px-3 py-2 text-[13px] font-medium",
            mode === m ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
          )}
        >
          {m === "login" ? "Sign in" : "Create account"}
        </button>
      {/each}
    </div>

    <form onsubmit={submit} class="mt-5">
      {#if mode === "register"}
        <div>
          <label for="auth-name" class="stamp block text-faint">name</label>
          <input
            id="auth-name"
            bind:value={name}
            placeholder="Ada"
            autocomplete="nickname"
            class="mt-1.5 w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent-dim"
          />
        </div>
      {/if}
      <div class={cn(mode === "register" && "mt-4")}>
        <label for="auth-email" class="stamp block text-faint">email</label>
        <input
          id="auth-email"
          type="email"
          required
          bind:value={email}
          placeholder="ada@example.com"
          autocomplete="email"
          class="mt-1.5 w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent-dim"
        />
      </div>
      <div class="mt-4">
        <label for="auth-password" class="stamp block text-faint">
          password{mode === "register" ? " — 10 characters or more" : ""}
        </label>
        <input
          id="auth-password"
          type="password"
          required
          minlength={mode === "register" ? 10 : 1}
          bind:value={password}
          autocomplete={mode === "login" ? "current-password" : "new-password"}
          class="mt-1.5 w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent-dim"
        />
      </div>
      {#if error}
        <div class="thread mt-4" role="alert">
          <p class="stamp text-removed">that did not work</p>
          <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{error}</p>
        </div>
      {/if}
      <div class="mt-5">
        <Button type="submit" disabled={busy}>
          {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </div>
    </form>
    <p class="mt-4 text-[12px] leading-relaxed text-faint">
      Passwords are bcrypt-hashed. Sessions rotate, and theft revokes the whole family.
    </p>
  {/if}
</div>
