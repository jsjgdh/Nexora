<script lang="ts">
  import { page } from "$app/state";
  import { progress } from "$lib/store.svelte";
  import { COMPETENCIES, layerById, stageById } from "$lib/curriculum";
  import { ALL_MISSIONS } from "$lib/missions";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { openBillingPortal, startCheckout } from "$lib/billing";
  import { sync } from "$lib/sync.svelte";
  import Button from "$lib/components/Button.svelte";
  import { isCompleted } from "$lib/recommend";
  import { cn, timeAgo } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  let confirmReset = $state(false);
  let exported = $state(false);

  // Billing state (cloud only; loaded lazily when signed in).
  let billingLoaded = $state(false);
  let billingLoading = $state(false);
  let billingError = $state<string | null>(null);
  let plans = $state<{ slug: string; name: string }[]>([]);
  let subscription = $state<{
    plan: string | null;
    status: string | null;
    entitled: boolean;
    currentPeriodEnd: string | null;
  } | null>(null);
  let checkoutBusy = $state<string | null>(null);
  let portalBusy = $state(false);
  // Kept apart from `billingError`: a portal call failing is not the plan
  // failing to load, and it must not hide the plan the learner already has.
  let portalError = $state<string | null>(null);

  $effect(() => {
    if (apiConfigured && session.loggedIn && !billingLoaded && !billingLoading) {
      billingLoading = true;
      billingError = null;
      Promise.all([session.subscription(), session.plans()])
        .then(([s, p]) => {
          subscription = s.subscription;
          plans = p.plans;
          billingLoaded = true;
        })
        .catch((e) => {
          billingError = e instanceof Error ? e.message : "Could not load billing.";
        })
        .finally(() => {
          billingLoading = false;
        });
    }
  });

  async function upgrade(slug: string) {
    checkoutBusy = slug;
    billingError = null;
    try {
      window.location.href = await startCheckout(slug);
    } catch (e) {
      billingError = e instanceof Error ? e.message : "Checkout failed.";
      checkoutBusy = null;
    }
  }

  /**
   * Open the provider's customer portal. Cancelling, changing a card and
   * reading invoices happen there, not here — this only mints the link and
   * redirects, so the app never becomes a second source of truth for money.
   */
  async function manage() {
    portalBusy = true;
    portalError = null;
    try {
      window.location.href = await openBillingPortal();
    } catch (e) {
      portalError = e instanceof Error ? e.message : "Could not open the billing portal.";
      portalBusy = false;
    }
  }

  /**
   * Checkout return: Dodo redirects here (?checkout=done) after payment.
   * The redirect proves nothing by itself — the webhook grants access — so
   * a return without entitlement says "pending" and offers a re-check,
   * never "welcome to Pro". `billingReturnUrl` is the single place that
   * builds this URL (see lib/billing.ts).
   */
  const checkoutReturn = $derived(page.url.searchParams.get("checkout") === "done");

  const missions = $derived(Object.values(progress.state.missions));
  const added = $derived(missions.filter((m) => m.completedAt).length);
  const approved = $derived(missions.filter((m) => m.masteredAt).length);
  const approvedSkills = $derived(
    COMPETENCIES.filter((c) =>
      ["demonstrated", "independent", "strong"].includes(
        progress.state.competencies[c.id]?.level ?? "unseen"
      )
    ).length
  );

  /** Where along the four layers this learner currently sits. */
  const currentLayer = $derived.by(() => {
    const inProgress = Object.keys(progress.state.missions).find((id) => {
      const p = progress.state.missions[id];
      return p.startedAt && !p.completedAt;
    });
    const missionId = inProgress ?? ALL_MISSIONS.find((m) => isCompleted(m.id, progress.state))?.id;
    const mission = missionId ? ALL_MISSIONS.find((m) => m.id === missionId) : undefined;
    const stage = mission ? stageById(mission.stageId) : undefined;
    return stage ? layerById(stage.layerId) : undefined;
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(progress.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexora-progress.json";
    a.click();
    URL.revokeObjectURL(url);
    exported = true;
    setTimeout(() => (exported = false), 3000);
  }

  const syncStamp: Record<string, string> = {
    local: "on this device",
    syncing: "saving",
    saved: "saved",
    offline: "offline — will retry",
    error: "sync paused",
  };

  async function reset() {
    if (confirmReset) {
      // Signed-in resets also wipe the cloud copy, so the account does not
      // resurrect this progress at the next sign-in.
      if (session.loggedIn) await sync.resetAccount();
      progress.resetAll();
      confirmReset = false;
    } else {
      confirmReset = true;
      setTimeout(() => (confirmReset = false), 6000);
    }
  }

  function label(id: string): string {
    const map: Record<string, string> = {
      "first-job": "Get my first developer job",
      "own-projects": "Build my own projects",
      deepen: "Understand code properly",
      "work-with-dev": "Work better with developers",
      zero: "Total beginner",
      basics: "Knows the basics",
      built: "Has built things",
      dev: "Already codes",
    };
    return map[id] ?? id;
  }
</script>

<!-- A signed-in view: it is deliberately absent from the sitemap, and it is
     marked noindex here so the two do not disagree. -->
<PageHead
  title={pageTitle("Profile & settings")}
  description="Your learner record: goal, pace, account state, what syncs — and the controls for what lives in this browser only."
  path="/profile"
  noindex
/>

<div class="mx-auto max-w-3xl px-4 py-6 sm:py-8">
  <p class="stamp text-accent">learner record</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
    {progress.state.profile.name ? progress.state.profile.name : "Your record"}
  </h1>
  <p class="mt-2 text-[14px] text-muted">
    {#if session.loggedIn}
      Signed in as <span class="text-ink">{session.user?.email ?? "…"}</span> ·
      <a href="/auth" class="text-accent underline underline-offset-4">account</a>
    {:else}
      Everything here lives in this browser until you create an account.
    {/if}
  </p>

  <dl class="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-rule py-3">
    <div>
      <dt class="stamp text-faint">added</dt>
      <dd class="num mt-0.5 text-[16px] text-added">{added}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">approved</dt>
      <dd class="num mt-0.5 text-[16px] text-approved">{approved}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">skills with evidence</dt>
      <dd class="num mt-0.5 text-[16px] text-muted">{approvedSkills}</dd>
    </div>
    <div>
      <dt class="stamp text-faint">active days</dt>
      <dd class="num mt-0.5 text-[16px] text-muted">{progress.state.activeDays.length}</dd>
    </div>
    {#if currentLayer}
      <div>
        <dt class="stamp text-faint">current layer</dt>
        <dd class="mt-0.5 text-[14px] text-ink">{currentLayer.title}</dd>
      </div>
    {/if}
  </dl>

  {#if apiConfigured}
    <section class="mt-6 border border-rule" aria-label="Plan">
      <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">plan</h2>
      <div class="px-3 py-3">
        {#if !session.loggedIn}
          <p class="text-[13px] leading-relaxed text-muted">
            <a href="/auth" class="text-accent underline underline-offset-4">Sign in</a> to manage a
            subscription. The curriculum itself is free either way.
          </p>
        {:else if billingLoading}
          <p class="stamp text-muted">loading plan…</p>
        {:else if billingError}
          <p role="alert" class="text-[13px] text-removed">{billingError}</p>
        {:else if subscription?.entitled}
          <p class="flex flex-wrap items-baseline gap-x-3 text-[14px]">
            <span class="stamp text-approved">pro active</span>
            <span class="text-muted">
              {subscription.plan}{subscription.currentPeriodEnd
                ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ""}
            </span>
          </p>
          <div class="mt-3">
            <Button size="sm" variant="outline" onclick={manage} disabled={portalBusy}>
              {portalBusy ? "Opening…" : "Manage subscription"}
            </Button>
          </div>
          {#if portalError}
            <p role="alert" class="mt-2 text-[13px] text-removed">{portalError}</p>
          {/if}
          <p class="mt-2 text-[12px] leading-relaxed text-faint">
            Cancel, update your card and read invoices in the payment provider's portal — this
            opens it for your account.
          </p>
        {:else if checkoutReturn}
          <p class="text-[13px] leading-relaxed text-muted">
            <span class="stamp text-review">payment received — confirming</span><br />
            <span class="mt-1 block">
              You are back from checkout. Pro activates when the payment provider confirms, usually
              within a minute — the redirect itself grants nothing.
            </span>
          </p>
          <div class="mt-3">
            <Button size="sm" variant="outline" onclick={() => (billingLoaded = false)}>
              Check again
            </Button>
          </div>
        {:else}
          <p class="text-[13px] leading-relaxed text-muted">
            Free plan — the whole curriculum is free. Pro supports the platform and unlocks extras
            as they ship.
          </p>
          {#if plans.length > 0}
            <div class="mt-3 flex flex-wrap gap-2">
              {#each plans as pl (pl.slug)}
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => upgrade(pl.slug)}
                  disabled={checkoutBusy !== null}
                >
                  {checkoutBusy === pl.slug ? "Redirecting…" : `Upgrade: ${pl.name}`}
                </Button>
              {/each}
            </div>
          {:else}
            <p class="mt-2 text-[12px] text-faint">No plans published yet.</p>
          {/if}
        {/if}
      </div>
    </section>

    <section class="mt-4 border border-rule" aria-label="Cloud sync">
      <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">cloud sync</h2>
      <div class="px-3 py-3">
        {#if !session.loggedIn}
          <p class="text-[13px] leading-relaxed text-muted">
            Your progress lives in this browser.
            <a href="/auth" class="text-accent underline underline-offset-4">Create a free account</a>
            to back it up and pick it up on any device.
          </p>
        {:else}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              class={cn(
                "stamp border px-1.5 py-0.5",
                sync.status === "saved" && "border-added/40 text-added",
                sync.status === "syncing" && "border-rule text-muted",
                sync.status === "offline" && "border-review/50 text-review",
                sync.status === "error" && "border-removed/50 text-removed"
              )}
              role="status"
            >
              {syncStamp[sync.status] ?? sync.status}
            </span>
            {#if sync.lastSyncAt}
              <span class="num text-[12px] text-faint">last synced {timeAgo(sync.lastSyncAt)}</span>
            {/if}
            <Button size="sm" variant="outline" onclick={() => sync.syncNow()}>Sync now</Button>
          </div>
          {#if sync.detail}
            <p role="alert" class="mt-2 text-[13px] text-removed">{sync.detail}</p>
          {/if}
          <p class="mt-2 text-[12px] leading-relaxed text-faint">
            Drafts, completions, and evidence are stored on your account — a completion is
            verified server-side before it counts.
          </p>
        {/if}
      </div>
    </section>
  {/if}

  <section class="mt-4 border border-rule" aria-label="Learning goal">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">goal & preferences</h2>
    <div class="px-3 py-3">
      {#if progress.state.profile.completedAt}
        {@const p = progress.state.profile}
        <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div class="flex justify-between border-b border-rule py-1">
            <dt class="text-[13px] text-faint">goal</dt>
            <dd class="text-[13px] text-ink">{label(p.goal) || "—"}</dd>
          </div>
          <div class="flex justify-between border-b border-rule py-1">
            <dt class="text-[13px] text-faint">experience</dt>
            <dd class="text-[13px] text-ink">{label(p.experience) || "—"}</dd>
          </div>
          <div class="flex justify-between border-b border-rule py-1">
            <dt class="text-[13px] text-faint">languages touched</dt>
            <dd class="text-[13px] text-ink">{p.languages.join(", ") || "—"}</dd>
          </div>
          <div class="flex justify-between border-b border-rule py-1">
            <dt class="text-[13px] text-faint">tools touched</dt>
            <dd class="text-[13px] text-ink">{p.tools.join(", ") || "—"}</dd>
          </div>
          <div class="flex justify-between border-b border-rule py-1">
            <dt class="text-[13px] text-faint">pace</dt>
            <dd class="num text-[13px] text-ink">{p.hoursPerWeek || "—"} / week</dd>
          </div>
          <div class="flex justify-between border-b border-rule py-1">
            <dt class="text-[13px] text-faint">interests</dt>
            <dd class="text-[13px] text-ink">{p.interests.join(", ") || "—"}</dd>
          </div>
        </dl>
        <a
          href="/onboarding"
          class="mt-3 inline-flex border border-rule px-3 py-1.5 text-[12px] text-ink hover:border-accent hover:text-accent"
        >
          Edit preferences
        </a>
      {:else}
        <p class="text-[13px] leading-relaxed text-muted">
          No goal recorded yet.
          <a href="/onboarding" class="text-accent underline underline-offset-4">
            Complete onboarding
          </a>
          so your roadmap can start from the right place.
        </p>
      {/if}
    </div>
  </section>

  <section class="mt-4 border border-rule" aria-label="History">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">history</h2>
    <div class="px-3 py-3">
      <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div class="flex justify-between border-b border-rule py-1">
          <dt class="text-[13px] text-faint">xp — activity only, never proof</dt>
          <dd class="num text-[13px] text-muted">{progress.state.xp}</dd>
        </div>
        <div class="flex justify-between border-b border-rule py-1">
          <dt class="text-[13px] text-faint">diagnostic</dt>
          <dd class="num text-[13px] text-muted">
            {progress.state.diagnostic.completedAt
              ? timeAgo(progress.state.diagnostic.completedAt)
              : "not taken"}
          </dd>
        </div>
        <div class="flex justify-between border-b border-rule py-1 sm:col-span-2">
          <dt class="text-[13px] text-faint">last active</dt>
          <dd class="num text-[13px] text-muted">{progress.state.lastActiveDate ?? "—"}</dd>
        </div>
      </dl>
      <p class="mt-2 text-[12px] text-faint">
        Streaks are not tracked as a measure of worth. Coming back after a break is normal here.
      </p>
    </div>
  </section>

  <section class="mt-4 border border-rule" aria-label="Your data">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">your data</h2>
    <div class="px-3 py-3">
      <p class="text-[13px] leading-relaxed text-muted">
        {session.loggedIn
          ? "Progress is saved on this device and on your account. Nothing is shared with anyone else."
          : "Progress lives in this browser only — no tracking, and nothing leaves your machine except optional AI tutor requests, which are labelled when they happen."}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onclick={exportData}>
          {exported ? "Exported" : "Export progress (JSON)"}
        </Button>
        <Button size="sm" variant="danger" onclick={reset}>
          {confirmReset
            ? session.loggedIn
              ? "Click again to erase this device AND your account"
              : "Click again to erase everything"
            : "Reset all progress"}
        </Button>
      </div>
    </div>
  </section>
</div>
