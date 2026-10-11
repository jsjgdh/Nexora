<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ALL_MISSIONS } from "$lib/missions";
  import { COMPETENCIES, STAGES } from "$lib/curriculum";
  import { progress } from "$lib/store.svelte";
  import { cn } from "$lib/format";

  const NAV = [
    { href: "/", label: "Roadmap" },
    { href: "/projects", label: "Projects" },
    { href: "/skills", label: "Skills" },
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

  const pathname = $derived(page.url.pathname);
  const inWorkspace = $derived(pathname.startsWith("/mission/"));

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
        out.push({ kind: "Mission", title: m.title, sub: `Stage · ${m.type}`, href: `/mission/${m.id}` });
      }
    }
    for (const c of COMPETENCIES) {
      if (c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)) {
        out.push({ kind: "Skill", title: c.name, sub: c.domain, href: "/skills" });
      }
    }
    for (const s of STAGES) {
      if (s.title.toLowerCase().includes(q)) {
        out.push({ kind: "Stage", title: `Stage ${s.num} · ${s.title}`, sub: s.goal, href: "/" });
      }
    }
    return out.slice(0, 8);
  });

  function closeResults() {
    open = false;
  }

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
</script>

<svelte:document
  onclick={(e) => {
    if (boxEl && !boxEl.contains(e.target as Node)) open = false;
  }}
/>

<header class="sticky top-0 z-50 border-b border-line bg-graphite/95 backdrop-blur">
  <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
    <a href="/" class="flex items-center gap-2" aria-label="NEXORA home">
      <span
        aria-hidden="true"
        class="flex h-7 w-7 items-center justify-center rounded-md bg-mint font-mono text-sm font-bold text-graphite"
      >
        N
      </span>
      <span class="text-[15px] font-bold tracking-wide">
        NEXORA
        <span class="ml-2 hidden text-xs font-medium text-muted sm:inline">Web Development</span>
      </span>
    </a>

    {#if !inWorkspace}
      <nav aria-label="Primary" class="ml-2 hidden items-center gap-1 md:flex">
        {#each NAV as n}
          <a
            href={n.href}
            aria-current={pathname === n.href ? "page" : undefined}
            class={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-elevated-2 hover:text-ink",
              pathname === n.href && "bg-elevated-2 text-mint"
            )}
          >
            {n.label}
          </a>
        {/each}
      </nav>
    {/if}

    <div class="ml-auto flex items-center gap-2">
      <div bind:this={boxEl} class="relative hidden sm:block">
        <label for="site-search" class="sr-only">Search lessons, concepts, and skills</label>
        <input
          id="site-search"
          bind:value={query}
          oninput={() => {
            open = true;
            highlight = 0;
          }}
          onfocus={() => (open = true)}
          onkeydown={onSearchKey}
          placeholder="Search lessons…"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="search-results"
          aria-activedescendant={hits[highlight] ? `hit-${highlight}` : undefined}
          class="w-44 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm text-ink placeholder:text-muted/70 focus:border-mint focus:outline-none lg:w-56"
        />
        {#if open && hits.length > 0}
          <ul
            id="search-results"
            role="listbox"
            aria-label="Search results"
            class="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-elevated shadow-xl"
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
                  class={cn("block px-3 py-2", i === highlight ? "bg-elevated-2" : "")}
                >
                  <span class="text-[10px] font-bold tracking-wider text-muted uppercase">{h.kind}</span>
                  <span class="block truncate text-sm font-medium text-ink">{h.title}</span>
                  <span class="block truncate text-xs text-muted">{h.sub}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <span
        class="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted lg:inline-flex"
        title="Experience points: earned by completing missions, never a proof of mastery"
      >
        <span aria-hidden="true" class="text-mint">◆</span>
        {progress.state.xp} XP
      </span>
      {#if progress.state.activeDays.length > 0}
        <span
          class="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted lg:inline-flex"
          title="Active learning days. Breaks never cost progress."
        >
          <span aria-hidden="true">◍</span>
          {progress.state.activeDays.length}d active
        </span>
      {/if}
      <a
        href="/profile"
        aria-label="Profile and settings"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elevated-2 text-sm font-bold text-mint hover:border-mint"
      >
        {(progress.state.profile.name || "?").slice(0, 1).toUpperCase()}
      </a>
    </div>
  </div>
  {#if !inWorkspace}
    <nav aria-label="Primary mobile" class="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
      {#each NAV as n}
        <a
          href={n.href}
          aria-current={pathname === n.href ? "page" : undefined}
          class={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted hover:bg-elevated-2 hover:text-ink",
            pathname === n.href && "bg-elevated-2 text-mint"
          )}
        >
          {n.label}
        </a>
      {/each}
    </nav>
  {/if}
</header>
