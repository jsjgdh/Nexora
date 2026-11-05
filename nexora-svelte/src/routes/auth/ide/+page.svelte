<script lang="ts">
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import Check from "$lib/components/Check.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
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

  /* The reader has to confirm that the code here is the code on their screen.
   *
   * The IDE opens this page with the code in the query string, and a code in
   * a query string is a code anybody can put in a link. RFC 8628 §3.2 asks the
   * client to show the user the code and have them confirm it, precisely
   * because a link can be planted. Approving a code that belongs to somebody
   * else signs their editor into this account, so the confirmation is not
   * decoration: the approve button stays disabled until the reader has ticked
   * the box, and changing the code clears the tick. */
  let confirmed = $state(false);
  $effect(() => {
    code.trim();
    confirmed = false;
  });

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
        manifestNote = "The course list could not be loaded right now. Approval still works.";
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
          ? "That code is not valid. Check the IDE and try again. Codes expire after 15 minutes."
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

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
    <div>
      <Headline
        as="h1"
        lines={[approved ? "IDE connected." : "Approve the code.", "Then close this tab."]}
        class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink"
      />
      <p class="mt-6 max-w-[46ch] text-[14.5px] leading-relaxed text-muted">
        Your IDE shows a short code and opened this page. Sign in, approve that code, and the IDE
        signs itself in. No password is typed anywhere but here.
      </p>

      <div class="mt-10 grid gap-4 border-t border-rule pt-6">
        <p class="stamp text-[11px] text-faint">why a code and not a password</p>
        <p class="max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
          A password typed into an editor is phishable, loggable, and mistypable in exactly the
          place with the least context for getting it right. GitHub solved this for editors a decade
          ago; the shape is borrowed, not invented.
        </p>
      </div>
    </div>

    <div class="min-w-0">
      {#if !apiConfigured}
        <Plate>
          <p class="stamp text-review">cloud accounts not connected</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            This build runs in local mode, so there is no platform for the IDE to sign in to. Set
            <code class="num text-ink">PUBLIC_API_URL</code> to enable accounts.
          </p>
        </Plate>
      {:else if session.restoring}
        <Plate>
          <p class="stamp text-muted">checking your session</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            One moment. The page is asking the server who you are before it can approve anything.
          </p>
        </Plate>
      {:else if !session.loggedIn}
        <Plate>
          <p class="stamp text-muted">sign in first</p>
          <p class="mt-3 text-[13.5px] leading-relaxed text-muted">
            Approving a code signs your account into the IDE, so the IDE needs to know which account
            is yours.
          </p>
          <div class="mt-5">
            <ActionLink href="/auth" variant="ghost" size="sm" island>Sign in</ActionLink>
          </div>
        </Plate>
      {:else if approved}
        <Plate crosshair>
          <p class="text-[15px] font-semibold text-ink">Approved. Return to your IDE.</p>
          <p class="mt-2 text-[13.5px] leading-relaxed text-muted">
            It signs in by itself from here. This page has nothing more to do.
          </p>
        </Plate>
      {:else}
        <Plate crosshair>
          <form onsubmit={approve}>
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
              class="num mt-2 w-full border border-control bg-raised px-3 py-2.5 text-[18px] tracking-[0.12em] text-ink placeholder:text-faint"
            />
            {#if error}
              <div class="mt-5 border-l border-removed pl-4" role="alert">
                <p class="stamp text-removed">that did not work</p>
                <p class="mt-2 text-[13.5px] leading-relaxed text-muted">{error}</p>
              </div>
            {/if}
            {#if code.trim().length > 0}
              <div class="mt-6 border-t border-rule pt-5">
                <p class="max-w-[46ch] text-[14.5px] leading-relaxed text-ink">
                  An IDE is asking to sign in with code
                  <span class="num font-semibold">{code.trim()}</span>. Is that the code on your screen?
                </p>
                <Check
                  bind:checked={confirmed}
                  attrs={{ "data-device-agree": "" }}
                  class="mt-3 max-w-[46ch]"
                >
                  Yes, this is the code on my screen.
                </Check>
              </div>
            {/if}
            <div class="mt-6">
              <Button
                type="submit"
                busy={busy}
                disabled={!confirmed || code.trim().length === 0}
              >
                {busy ? "Approving…" : "Approve this IDE"}
              </Button>
            </div>
          </form>
          <p class="mt-5 text-[12.5px] leading-relaxed text-faint">
            Approving signs the IDE in as {session.user?.email ?? "this account"}. Wrong codes are
            refused without saying why, because a prober learns nothing from guessing.
          </p>
        </Plate>
      {/if}

      {#if phases.length > 0}
        <section class="mt-6" aria-label="What your tier opens">
          <Plate>
            <p class="stamp text-[11px] text-faint">what your tier opens</p>
            <ul class="mt-4 border-t border-rule">
              {#each free as p (p.id)}
                <li class="flex items-baseline justify-between gap-4 border-b border-rule py-3">
                  <span class="text-[13.5px] text-ink">{p.title}</span>
                  <span class="stamp text-added">free</span>
                </li>
              {/each}
              {#each pro as p (p.id)}
                <li class="flex items-baseline justify-between gap-4 border-b border-rule py-3">
                  <span class="text-[13.5px] text-ink">{p.title}</span>
                  <span class="stamp text-faint">pro</span>
                </li>
              {/each}
            </ul>
            <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
              Free phases ship inside the IDE. Pro phases appear there once your subscription is
              active, fetched per entitlement, never written to disk.
            </p>
          </Plate>
        </section>
      {:else if manifestNote}
        <p class="mt-6 text-[12.5px] leading-relaxed text-faint">{manifestNote}</p>
      {/if}
    </div>
  </div>
</div>
