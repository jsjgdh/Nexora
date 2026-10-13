<script lang="ts">
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* The browser half of IDE sign-in: the GitHub-style device flow.
   *
   * The IDE shows a short code and opens this page. The learner signs in here
   * (or already is), types the code, and approves — the IDE polls the platform
   * and signs itself in. The browser never sees the device secret and the IDE
   * never sees the password: each side presents only its own credential.
   *
   * After approval this page says what the tier unlocks, from the public IDE
   * manifest — names and tiers only, never lesson bodies. That is the whole of
   * "per your tier you see courses": the IDE shows the same manifest, and paid
   * phases are fetched per entitlement rather than shipped. */

  let code = $state((page.url.searchParams.get("code") ?? "").toUpperCase());
  let busy = $state(false);
  let error = $state<string | null>(null);
  let approved = $state(false);

  let phases = $state<{ id: string; title: string; goal: string; tier: string }[]>([]);
  let manifestNote = $state<string | null>(null);

  $effect(() => {
    if (!apiConfigured) return;
    session.ideManifest()
      .then((m) => {
        phases = m.manifest.phases;
      })
      .catch(() => {
        // The manifest is a nicety here, not the task: approval must work even
        // when the curriculum service is unreachable.
        manifestNote = "The course list could not be loaded right now — approval still works.";
      });
  });

  async function approve(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await session.approveDevice(code.trim());
      approved = true;
    } catch (err) {
      error =
        (err as { status?: number }).status === 404
          ? "That code is not valid. Check the IDE and try again — codes expire after 15 minutes."
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
    } finally {
      busy = false;
    }
  }

  const free = $derived(phases.filter((p) => p.tier === "free"));
  const pro = $derived(phases.filter((p) => p.tier !== "free"));
</script>

<PageHead
  title={pageTitle("Connect your IDE")}
  description="Approve the code your IDE shows to sign it in. Your tier decides which courses appear inside the IDE."
  path="/auth/ide"
/>

<div class="mx-auto max-w-lg px-4 py-10">
  <p class="stamp text-accent">ide sign-in</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    {#if approved}
      IDE connected
    {:else}
      Connect your IDE
    {/if}
  </h1>
  <p class="mt-2 text-[14px] leading-relaxed text-muted">
    Your IDE shows a short code and opened this page. Sign in, approve that
    code, and the IDE signs itself in — no password typed anywhere but here.
  </p>

  {#if !apiConfigured}
    <div class="thread mt-6">
      <p class="stamp text-review">cloud accounts not connected</p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
        This build runs in local mode, so there is no platform for the IDE to
        sign in to. Set
        <code class="num text-ink">PUBLIC_API_URL</code> to enable accounts.
      </p>
    </div>
  {:else if session.restoring}
    <div class="thread mt-6">
      <p class="stamp text-muted">checking your session</p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
        One moment — the page is asking the server who you are before it can
        approve anything.
      </p>
    </div>
  {:else if !session.loggedIn}
    <div class="thread mt-6">
      <p class="stamp text-muted">sign in first</p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
        Approving a code signs your account into the IDE, so the IDE needs to
        know which account is yours.
      </p>
      <a
        href="/auth"
        class="mt-3 inline-flex border border-rule px-3 py-1.5 text-[13px] text-ink hover:border-accent hover:text-accent"
      >
        Sign in, then come back
      </a>
    </div>
  {:else if approved}
    <div class="mt-6 border border-approved/40 bg-approved/5 px-3 py-3" role="status">
      <p class="text-[14px] font-semibold text-ink">Approved — return to your IDE.</p>
      <p class="mt-1 text-[13px] leading-relaxed text-muted">
        It signs in by itself from here. This page has nothing more to do.
      </p>
    </div>
  {:else}
    <form onsubmit={approve} class="mt-6">
      <label for="ide-code" class="stamp block text-faint">code from your IDE</label>
      <input
        id="ide-code"
        bind:value={code}
        placeholder="KQ7M-XR42"
        required
        minlength={4}
        maxlength={16}
        autocomplete="off"
        spellcheck={false}
        class="num mt-1.5 w-full border border-control bg-raised px-3 py-2 text-[18px] tracking-[0.12em] text-ink placeholder:text-faint focus:border-accent-dim"
      />
      {#if error}
        <div class="thread mt-4" role="alert">
          <p class="stamp text-removed">that did not work</p>
          <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{error}</p>
        </div>
      {/if}
      <div class="mt-5">
        <Button type="submit" disabled={busy}>
          {busy ? "Approving…" : "Approve this IDE"}
        </Button>
      </div>
    </form>
    <p class="mt-4 text-[12px] leading-relaxed text-faint">
      Approving signs the IDE in as {session.user?.email ?? "this account"}. Wrong codes are
      refused without saying why — a prober learns nothing from guessing.
    </p>
  {/if}

  {#if phases.length > 0}
    <section class="mt-8 border border-rule" aria-label="What your tier unlocks">
      <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">what your tier unlocks</h2>
      <ul class="divide-y divide-rule px-3 py-1">
        {#each free as p (p.id)}
          <li class="flex items-baseline justify-between gap-3 py-2">
            <span class="text-[13px] text-ink">{p.title}</span>
            <span class="stamp text-approved">free</span>
          </li>
        {/each}
        {#each pro as p (p.id)}
          <li class="flex items-baseline justify-between gap-3 py-2">
            <span class="text-[13px] text-ink">{p.title}</span>
            <span class="stamp text-muted">pro</span>
          </li>
        {/each}
      </ul>
      <p class="border-t border-rule px-3 py-2 text-[12px] leading-relaxed text-faint">
        Free phases ship inside the IDE. Pro phases appear there once your
        subscription is active — fetched per entitlement, never written to disk.
      </p>
    </section>
  {:else if manifestNote}
    <p class="mt-6 text-[12px] leading-relaxed text-faint">{manifestNote}</p>
  {/if}
</div>
