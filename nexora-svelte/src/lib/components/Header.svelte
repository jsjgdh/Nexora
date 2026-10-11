<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ALL_MISSIONS } from "$lib/missions";
  import { COMPETENCIES, LAYERS, STAGES, layerById, stageById } from "$lib/curriculum";
  import { recommend } from "$lib/recommend";
  import { progress } from "$lib/store.svelte";
  import { practice } from "$lib/practice.svelte";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { sync } from "$lib/sync.svelte";
  import { cn } from "$lib/format";

  const NAV = [
    { href: "/roadmap", label: "Roadmap" },
    { href: "/projects", label: "Projects" },
    { href: "/skills", label: "Skills" },
    { href: "/practice", label: "Practice" },
    { href: "/visualizations", label: "Visualize" },
    { href: "/profile", label: "Profile" },
  ];

  interface SearchHit {
    kind: string;
    title: string;
    sub: string;
    href: string;
  }

  let query = $state("");
  let open = $state(false);
  let highlight = $state(0);
  let boxEl: HTMLDivElement | null = $state(null);

  /**
   * Resolve the account identity once per token.
   *
   * The guard has to be "once per token", not "while we have no user yet":
   * `refreshUser()` sets `loadingUser` false again when it finishes, and a
   * failed resolution leaves `user` null, so an effect keyed on those two would
   * re-fire immediately and again and again. Measured, that loop sent 182,000
   * requests to /api/auth/me and rate-limited the whole session — the browser
   * hammering our own edge because identity could not be fetched.
   *
   * Keyed on the token value instead: a transient failure is retried on the
   * next sign-in (a new token), never in a loop.
   */
  let identityAttemptedFor = $state<string | null>(null);
  $effect(() => {
    const token = session.token;
    if (!token) {
      identityAttemptedFor = null;
      return;
    }
    if (token !== identityAttemptedFor && !session.user && !session.loadingUser) {
      identityAttemptedFor = token;
      void session.refreshUser();
    }
  });

  /**
   * Run the sync engine exactly while a token exists: start (pull → merge →
   * push, so a guest's local work migrates onto the account) on sign-in,
   * stop on sign-out. Keyed on the token value like identity above — the
   * engine is idempotent, but a restart per render would be a full sync
   * per render.
   */
  let syncRunningFor = $state<string | null>(null);
  $effect(() => {
    const token = session.token;
    if (!token) {
      if (syncRunningFor !== null) {
        syncRunningFor = null;
        sync.stop();
      }
      return;
    }
    if (token !== syncRunningFor) {
      syncRunningFor = token;
      // Stop first: the engine holds in-memory run receipts, and those are
      // credentials for one account's runs — they must never survive an
      // account switch. Start then runs the full pull → merge → push, which
      // is also what migrates a guest's local work onto a fresh account.
      sync.stop();
      sync.start();
    }
  });

  const pathname = $derived(page.url.pathname);
  const inWorkspace = $derived(pathname.startsWith("/mission/"));

  /** Approved skills: the number that actually means something. */
  const approved = $derived(
    Object.values(progress.state.competencies).filter((c) =>
      ["demonstrated", "independent", "strong"].includes(c.level)
    ).length
  );
  const underReview = $derived(
    Object.keys(progress.state.missions).filter((id) => {
      const p = progress.state.missions[id];
      return p.startedAt && !p.completedAt;
    }).length
  );
  const added = $derived(
    ALL_MISSIONS.filter((m) => progress.state.missions[m.id]?.completedAt).length
  );

  /** The layer the learner is working inside, read from the same rule the
      roadmap uses: wherever the engine points them next. Deriving it any other
      way lets the header disagree with the page beneath it. */
  const currentLayer = $derived.by(() => {
    const nextId = recommend(progress.state).primaryId;
    const mission = nextId ? ALL_MISSIONS.find((m) => m.id === nextId) : undefined;
    const stage = mission ? stageById(mission.stageId) : undefined;
    return (stage ? layerById(stage.layerId)?.title : undefined) ?? LAYERS[0].title;
  });

  const hits = $derived.by((): SearchHit[] => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchHit[] = [];
    for (const m of ALL_MISSIONS) {
      if (
        m.title.toLowerCase().includes(q) ||
        m.tagline.toLowerCase().includes(q) ||
        m.id.replace(/-/g, " ").includes(q)
      ) {
        const stage = stageById(m.stageId);
        out.push({
          kind: "Mission",
          title: m.title,
          sub: stage ? `Stage ${stage.num} · ${stage.title}` : m.type,
          href: `/mission/${m.id}`,
        });
      }
    }
    for (const c of COMPETENCIES) {
      if (c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)) {
        out.push({ kind: "Skill", title: c.name, sub: c.domain, href: "/skills" });
      }
    }
    for (const s of STAGES) {
      if (s.title.toLowerCase().includes(q)) {
        out.push({
          kind: "Stage",
          title: `Stage ${s.num} · ${s.title}`,
          sub: s.goal,
          href: "/roadmap",
        });
      }
    }
    return out.slice(0, 8);
  });

  function go(href: string) {
    open = false;
    query = "";
    goto(href);
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight = Math.min(highlight + 1, hits.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight = Math.max(highlight - 1, 0);
    } else if (e.key === "Enter" && hits[highlight]) {
      go(hits[highlight].href);
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  const syncStamp = $derived(
    sync.status === "saved"
      ? "SAVED"
      : sync.status === "syncing"
        ? "SAVING"
        : sync.status === "offline"
          ? "LOCAL"
          : sync.status === "error"
            ? "PAUSED"
            : ""
  );
</script>

<svelte:document
  onclick={(e) => {
    if (boxEl && !boxEl.contains(e.target as Node)) open = false;
  }}
/>

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
              {currentLayer}
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
                {#if n.href === "/practice" && practice.open.length > 0}
                  <span class="num ml-1.5 border border-review px-1.5 py-0.5 text-[10px] font-bold text-review">
                    {practice.open.length}
                  </span>
                {/if}
              </a>
            {/each}
          </nav>
        {/if}
      </div>

      <!-- Right Action & Stats Area -->
      <div class="flex items-center gap-3.5">
        <!-- Search Box -->
        <div bind:this={boxEl} class="relative hidden sm:block">
          <label for="site-search" class="sr-only">Search missions, skills, and stages</label>
          <div class="relative flex items-center">
            <svg class="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="site-search"
              bind:value={query}
              oninput={() => {
                open = true;
                highlight = 0;
              }}
              onfocus={() => (open = true)}
              onkeydown={onSearchKey}
              placeholder="Search"
              role="combobox"
              aria-expanded={open && hits.length > 0}
              aria-controls={open && hits.length > 0 ? "search-results" : undefined}
              aria-activedescendant={hits[highlight] ? `hit-${highlight}` : undefined}
              class="h-8 w-44 border border-control bg-panel pr-8 pl-8 text-[12px] text-white placeholder:text-faint transition-colors duration-150 focus:border-accent lg:w-56"
            />
            <span class="num pointer-events-none absolute right-2.5 border border-rule bg-raised px-1 py-0.5 text-[9px] font-semibold text-muted">
              /
            </span>
          </div>

          {#if open && hits.length > 0}
            <ul
              id="search-results"
              role="listbox"
              aria-label="Search results"
              class="absolute top-full right-0 z-50 mt-1.5 w-84 border border-rule bg-panel p-1.5"
            >
              {#each hits as h, i}
                <li id={`hit-${i}`} role="option" aria-selected={i === highlight}>
                  <a
                    href={h.href}
                    onclick={(e) => {
                      e.preventDefault();
                      go(h.href);
                    }}
                    onmouseenter={() => (highlight = i)}
                    class={cn(
                      "block border border-transparent px-3 py-2 text-left transition-colors duration-150",
                      i === highlight ? "border-rule bg-raised" : "hover:bg-raised"
                    )}
                  >
                    <span class="num border border-rule bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      {h.kind}
                    </span>
                    <span class="block truncate text-[13px] font-semibold text-white">{h.title}</span>
                    <span class="block truncate text-[11px] text-muted">{h.sub}</span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <!-- Live Learner Stats Strip (LeetCode / Boot.dev style) -->
        <div class="hidden items-center gap-2 lg:flex">
          <!-- Streak -->
          <div class="flex items-center gap-1.5 border border-rule bg-panel px-2.5 py-1" title="Daily streak">
            <svg class="h-3.5 w-3.5 text-review" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2c1 4-2 5-2 9a4 4 0 008 0c0-1-.5-2-1-2.5C18.5 10 20 12 20 14a8 8 0 11-16 0c0-4 5-6 5-10 1 1 2 2 3 2-.5-1.5 0-3 0-4z" /></svg>
            <span class="num text-[12px] font-bold text-white">{progress.state.activeDays.length || 1}d</span>
          </div>

          <!-- XP -->
          <div class="flex items-center gap-1.5 border border-rule bg-panel px-2.5 py-1" title="Experience">
            <svg class="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" /></svg>
            <span class="num text-[12px] font-bold text-white">{progress.state.xp} XP</span>
          </div>

          <!-- Passed Checks -->
          <div class="flex items-center gap-1.5 border border-rule bg-panel px-2.5 py-1" title="Checks passed">
            <svg class="h-3.5 w-3.5 text-added" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            <span class="num text-[12px] font-bold text-white">+{added}</span>
          </div>
        </div>

        <!-- Continue CTA -->
        {#if recommend(progress.state).primaryId}
          {@const nextMission = ALL_MISSIONS.find(m => m.id === recommend(progress.state).primaryId)}
          {#if nextMission}
            <a
              href={`/mission/${nextMission.id}`}
              class="hidden items-center gap-1.5 bg-accent px-3 py-1.5 text-[12px] font-bold text-ground transition-colors duration-150 hover:bg-accent-bright xl:inline-flex"
            >
              <span>Resume</span>
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          {/if}
        {/if}

        <!-- Profile / Auth Button -->
        {#if session.loggedIn}
          <a
            href="/profile"
            aria-label={session.user ? `Account: ${session.user.email}` : "Account"}
            title={session.user?.email ?? "Account"}
            class="grid h-8 w-8 place-items-center border border-approved font-mono text-[12px] font-bold text-approved transition-colors duration-150"
          >
            {(session.user?.email ?? "?").slice(0, 1).toUpperCase()}
          </a>
        {:else}
          {#if apiConfigured}
            <a
              href="/auth"
              class="border border-rule bg-raised px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors duration-150 hover:text-white"
            >
              Sign In
            </a>
          {/if}
          <a
            href="/profile"
            aria-label="Profile and settings"
            class="grid h-8 w-8 place-items-center border border-rule bg-raised font-mono text-[12px] font-bold text-muted transition-colors duration-150 hover:border-accent hover:text-accent"
          >
            {(progress.state.profile.name || "N").slice(0, 1).toUpperCase()}
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
