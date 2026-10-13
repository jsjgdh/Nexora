<script lang="ts">
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { cn } from "$lib/format";

  /* The front door's whole navigation: the IDE, what it costs, the proof,
     and the account. Learning itself happens in the IDE — there is deliberately
     no classroom link here, so the site never reads as a second way to learn. */
  const NAV = [
    { href: "/download", label: "Get the IDE" },
    { href: "/pricing", label: "Pricing" },
    { href: "/verify", label: "Verify" },
    { href: "/auth", label: "Account" },
  ];

  const pathname = $derived(page.url.pathname);
  const inWorkspace = $derived(pathname.startsWith("/mission/"));

  /* Resolve the account identity once per signed-in identity, so a reload
     shows who is signed in without asking again. Keyed on `session.epoch`
     (the sign-in / sign-out boundary) rather than the token value: a silent
     renewal every few minutes must not look like a new learner. */
  let identityAttemptedFor = $state(-1);
  $effect(() => {
    const epoch = session.epoch;
    if (!session.token) {
      identityAttemptedFor = -1;
      return;
    }
    if (epoch !== identityAttemptedFor && !session.user && !session.loadingUser) {
      identityAttemptedFor = epoch;
      void session.refreshUser();
    }
  });
</script>

<header class="sticky top-0 z-50 border-b border-rule bg-ground">
  <div class="mx-auto max-w-[1440px] px-4 sm:px-6">
    <div class="flex h-16 items-center justify-between gap-4">
      <!-- Brand -->
      <div class="flex items-center gap-6">
        <a href="/" class="flex shrink-0 items-center gap-3">
          <span class="grid h-8 w-8 place-items-center border border-rule bg-panel">
            <span class="font-mono text-[14px] font-bold text-accent">N</span>
          </span>
          <span>
            <span class="block text-[16px] font-bold text-white">NEXORA</span>
            <span class="num -mt-0.5 hidden text-[10px] text-faint lg:block">
              The IDE that proves it
            </span>
          </span>
        </a>

        <!-- Primary Nav -->
        {#if !inWorkspace}
          <nav aria-label="Primary" class="ml-2 hidden items-center gap-1 md:flex">
            {#each NAV as n}
              <a
                href={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                class={cn(
                  "border border-transparent px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                  pathname === n.href
                    ? "border-rule bg-raised text-accent"
                    : "text-muted hover:text-white"
                )}
              >
                {n.label}
              </a>
            {/each}
          </nav>
        {/if}
      </div>

      <!-- Right Action Area: the download first, then the account. No classroom
           chrome here — no search over missions, no streaks, no resume CTA. The
           header is a front door, not a second classroom. -->
      <div class="flex items-center gap-3.5">
        <a
          href="/download"
          class="hidden items-center gap-1.5 bg-accent px-3 py-1.5 text-[12px] font-bold text-ground transition-colors duration-150 hover:bg-accent-bright sm:inline-flex"
        >
          <span>Get the IDE</span>
        </a>

        <!-- Account button. The sign-in link waits for `restoring`: the
             session lives in a cookie this page cannot read, so "signed out" is
             not known yet on a fresh load, and offering the link is a claim we
             cannot make until the server has answered. The account avatar has no
             such problem — being shown something is only ever wrong once. -->
        {#if session.loggedIn}
          <a
            href="/auth"
            aria-label={session.user ? `Account: ${session.user.email}` : "Account"}
            title={session.user?.email ?? "Account"}
            class="grid h-8 w-8 place-items-center border border-approved font-mono text-[12px] font-bold text-approved transition-colors duration-150"
          >
            {(session.user?.email ?? "?").slice(0, 1).toUpperCase()}
          </a>
        {:else if apiConfigured && !session.restoring}
          <a
            href="/auth"
            class="border border-rule bg-raised px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors duration-150 hover:text-white"
          >
            Sign In
          </a>
        {/if}
      </div>
    </div>

    <!-- Mobile Navigation Bar -->
    {#if !inWorkspace}
      <nav
        aria-label="Primary mobile"
        class="nice-scroll -mx-4 flex gap-1 overflow-x-auto border-t border-rule px-4 py-2 md:hidden"
      >
        {#each NAV as n}
          <a
            href={n.href}
            aria-current={pathname === n.href ? "page" : undefined}
            class={cn(
              "border border-transparent px-3 py-1 text-[12px] font-semibold whitespace-nowrap transition-colors duration-150",
              pathname === n.href
                ? "border-rule bg-raised text-accent"
                : "text-muted hover:text-white"
            )}
          >
            {n.label}
          </a>
        {/each}
      </nav>
    {/if}
  </div>
</header>
