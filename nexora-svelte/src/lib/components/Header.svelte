<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { session } from "$lib/session.svelte";
  import { BRAND, MASTHEAD, NAV } from "$lib/content/site";
  import { COURSE_PAGES, courseActivities, coursePhases } from "$lib/content/courses";
  import CourseMark from "./CourseMark.svelte";
  import type { ReleaseState } from "$lib/release";
  import { actionClass } from "$lib/ui";

  /* The top edge, set as a masthead rather than as a bar.
   *
   * Two rows, the way a sheet sets its title: the name on the first row with
   * the edition lines flanking it, the destinations on the second, and a
   * double rule closing both. The wordmark is centred because a masthead's
   * title is centred, and the left and right cells are the same width so the
   * centre stays the centre however long the edition line runs.
   *
   * The edition lines are `MASTHEAD`: the descriptor and the counts, both
   * computed from the shipped phase list, so the chrome cannot print a number
   * the manifest does not carry. They only appear at 1280px and above, where
   * there is room for them without crowding the name.
   *
   * Courses opens a panel because the shelf is wider than a row; the panel is
   * a real disclosure, closes on Escape or a click outside, and the same list
   * appears in the mobile sheet. Below 1024px the second row is gone and the
   * sheet carries every destination.
   *
   * No reading rail, no scroll spy. */

  let { release }: { release: ReleaseState } = $props();

  const pathname = $derived(page.url.pathname);
  const hash = $derived(page.url.hash);

  let scrolled = $state(false);
  let mobileOpen = $state(false);
  let mobileDialog = $state<HTMLDialogElement | null>(null);
  let menuOpen = $state(false);

  function isCurrent(href: string): boolean {
    if (href.startsWith("/#")) return pathname === "/" && hash === href.slice(1);
    if (href === "/courses") return pathname === "/courses" || pathname.startsWith("/courses/");
    return pathname === href;
  }

  function openMobile(): void {
    mobileOpen = true;
    mobileDialog?.showModal();
  }

  function closeMobile(): void {
    mobileOpen = false;
    mobileDialog?.close();
  }

  onMount(() => {
    const sentinel = document.getElementById("top-sentinel");
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => (scrolled = !entry.isIntersecting), {
      threshold: 0,
    });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  $effect(() => {
    pathname;
    hash;
    mobileOpen = false;
    menuOpen = false;
  });
</script>

<svelte:window
  onclick={(event) => {
    if (!menuOpen) return;
    const target = event.target as Node | null;
    const menu = document.getElementById("courses-menu");
    if (menu && target && !menu.contains(target)) menuOpen = false;
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") menuOpen = false;
  }}
/>

<div id="top-sentinel" class="top-sentinel" aria-hidden="true"></div>

<header class="site-nav" data-scrolled={scrolled ? "true" : "false"}>
  <div class="nav-inner">
    <p class="masthead-note">
      <span class="note-line">{MASTHEAD.descriptor}</span>
      <span class="note-line">{MASTHEAD.status}</span>
    </p>

    <a href="/" class="wordmark" aria-label="NEXORA, home">
      <span class="mark" aria-hidden="true"></span>
      <span class="word">{BRAND}</span>
    </a>

    <nav class="desk-nav" aria-label="Site">
      <div id="courses-menu" class="courses-menu">
        <button
          type="button"
          class="nav-link menu-trigger"
          aria-expanded={menuOpen}
          aria-controls="courses-panel"
          aria-current={pathname === "/courses" || pathname.startsWith("/courses/") ? "page" : undefined}
          onclick={() => (menuOpen = !menuOpen)}
        >
          Courses
          <svg class="chev" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        {#if menuOpen}
          <div id="courses-panel" class="courses-panel">
            <div class="panel-head">
              <p class="stamp">The shelf</p>
              <a href="/courses" class="panel-all" onclick={() => (menuOpen = false)}>
                All courses
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <ul>
              {#each COURSE_PAGES as course (course.slug)}
                <li data-course={course.accent}>
                  <a href={`/courses/${course.slug}`} onclick={() => (menuOpen = false)}>
                    <CourseMark {course} size="2.1rem" />
                    <span class="panel-copy">
                      <span class="course-title">{course.title}</span>
                      <span class="course-meta num">
                        {coursePhases(course).length} phases · {courseActivities(course)} activities
                      </span>
                    </span>
                    <span class="panel-arrow" aria-hidden="true">→</span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      {#each NAV as item (item.href)}
        <a
          href={item.href}
          class="nav-link"
          aria-current={isCurrent(item.href) ? (item.href.startsWith("/#") ? "location" : "page") : undefined}
        >
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="nav-actions">
      {#if session.loggedIn}
        <a
          href="/account"
          class="account"
          aria-label={session.user ? `Account: ${session.user.email}` : "Account"}
          title={session.user?.email ?? "Account"}
        >
          {(session.user?.email ?? "?").slice(0, 1).toUpperCase()}
        </a>
      {:else if !session.restoring}
        <a href="/auth" class="signin" aria-current={pathname === "/auth" ? "page" : undefined}>
          Sign in
        </a>
      {/if}

      <a href="/download" class={actionClass("primary", "sm") + " nav-cta"}>
        {release.labelShort}
        <span class="cta-arrow" aria-hidden="true">→</span>
      </a>

      <button
        type="button"
        class="menu-button"
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        onclick={openMobile}
      >
        <span class="menu-rule" aria-hidden="true"></span>
        <span class="menu-rule" aria-hidden="true"></span>
        <span class="sr-only">Menu</span>
      </button>
    </div>
  </div>
</header>

<dialog
  id="mobile-menu"
  class="mobile-menu"
  bind:this={mobileDialog}
  onclose={() => (mobileOpen = false)}
  aria-label="Site menu"
>
  <div class="mobile-head">
    <span class="wordmark" aria-hidden="true">
      <span class="mark" aria-hidden="true"></span>
      <span class="word">{BRAND}</span>
    </span>
    <button type="button" class="close" onclick={closeMobile}>Close</button>
  </div>

  <nav class="mobile-nav" aria-label="Site">
    {#each NAV as item (item.href)}
      <a href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined} onclick={closeMobile}>
        {item.label}
      </a>
    {/each}
    <a href="/courses" aria-current={pathname === "/courses" ? "page" : undefined} onclick={closeMobile}>
      All courses
    </a>
  </nav>

  <p class="stamp mobile-label">The shelf</p>
  <ul class="mobile-courses">
    {#each COURSE_PAGES as course (course.slug)}
      <li data-course={course.accent}>
        <a href={`/courses/${course.slug}`} onclick={closeMobile}>
          <span class="mobile-course">
            <CourseMark {course} size="2rem" />
            <span>{course.title}</span>
          </span>
          <span class="num">{coursePhases(course).length}</span>
        </a>
      </li>
    {/each}
  </ul>

  <div class="mobile-actions">
    <a href="/download" class={actionClass("primary", "md")} onclick={closeMobile}>
      {release.label}
    </a>
    {#if !session.loggedIn && !session.restoring}
      <a href="/auth" class={actionClass("ghost", "md")} onclick={closeMobile}>Sign in</a>
    {/if}
  </div>
</dialog>

<style>
  .top-sentinel {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  /* The name row's height is a variable because the rule that separates it
     from the destinations is drawn against it. */
  .site-nav {
    --masthead-h: 56px;
    position: sticky;
    top: 0;
    z-index: var(--z-nav);
    background: var(--color-ground);
    border-bottom: 1px solid transparent;
    transition: border-color var(--dur-2) var(--ease-out);
  }

  /* The masthead's own hairline, four pixels clear of the edge. The scroll
     state inks the edge in beneath it, so the pair reads as the double rule
     that closes a title block — and the bar never changes height to get it. */
  .site-nav::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 4px;
    height: 1px;
    background: var(--color-rule);
  }

  /* The full-bleed rule between the name and the destinations. It belongs to
     the desktop row only: below 1024px the destinations live in the sheet. */
  .site-nav::before {
    content: none;
  }

  .site-nav[data-scrolled="true"] {
    border-bottom-color: var(--color-rule);
    background: color-mix(in srgb, var(--color-ground) 82%, transparent);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
  }

  @media (min-width: 1024px) {
    .site-nav {
      --masthead-h: 48px;
    }

    .site-nav::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: var(--masthead-h);
      height: 1px;
      background: var(--color-rule);
    }
  }

  /* Three columns: the edition lines and the action each take a flexible
     side, so the name in the middle is the centre of the row whatever the
     two sides happen to measure. The right column may not fall below its own
     content, which is what keeps the action from reaching into the name on a
     narrow tablet. */
  .nav-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(min-content, 1fr);
    grid-template-rows: var(--masthead-h) auto;
    align-items: center;
    max-width: 1320px;
    margin-inline: auto;
    padding-inline: var(--space-5);
  }

  @media (min-width: 640px) {
    .nav-inner {
      padding-inline: var(--space-8);
    }
  }

  /* The two lines the chrome prints: what the product is, and how much of it
     ships. Both come from `MASTHEAD`, which computes them from the manifest,
     so the header cannot print a count the manifest does not carry. They sit
     in the left cell only where there is room to read them. */
  .masthead-note {
    grid-area: 1 / 1;
    justify-self: start;
    display: none;
    margin: 0;
    min-width: 0;
  }

  @media (min-width: 1280px) {
    .masthead-note {
      display: block;
    }
  }

  .note-line {
    display: block;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.5;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wordmark {
    grid-area: 1 / 2;
    justify-self: center;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    flex: none;
    min-height: 44px;
    color: var(--color-ink);
    text-decoration: none;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    background: var(--color-ink);
    color: var(--color-panel);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .mark::before {
    content: "N";
  }

  .wordmark .word {
    font-family: var(--font-display);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .desk-nav {
    grid-area: 2 / 1 / 2 / 4;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    min-width: 0;
  }

  @media (min-width: 1024px) {
    .desk-nav {
      display: flex;
    }
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 44px;
    padding-inline: 0.7rem;
    color: var(--color-muted);
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    position: relative;
    transition: color var(--dur-1) var(--ease-out);
  }

  .nav-link:hover,
  .nav-link[aria-current] {
    color: var(--color-ink);
  }

  .nav-link[aria-current]::after {
    content: "";
    position: absolute;
    left: 0.7rem;
    right: 0.7rem;
    bottom: 4px;
    height: 1.5px;
    border-radius: 2px;
    background: var(--color-accent);
  }

  .menu-trigger {
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-sans);
  }

  .chev {
    color: var(--color-faint);
    transition: transform var(--dur-2) var(--ease-out);
  }

  .menu-trigger[aria-expanded="true"] .chev {
    transform: rotate(180deg);
    color: var(--color-accent);
  }

  .courses-menu {
    position: relative;
  }

  .courses-panel {
    position: absolute;
    top: calc(100% + 12px);
    left: 50%;
    width: 420px;
    transform: translateX(-50%);
    background: var(--color-panel);
    border: 1px solid var(--color-rule);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
    padding: var(--space-3);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  .panel-head .stamp {
    color: var(--color-faint);
  }

  .panel-all {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-accent);
    text-decoration: none;
    white-space: nowrap;
  }

  .courses-panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  .courses-panel li a {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0.55rem 0.65rem;
    min-height: 54px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--color-ink);
    transition: background-color var(--dur-1) var(--ease-out);
  }

  .courses-panel li a:hover {
    background: var(--color-raised);
  }

  .panel-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .course-title {
    font-size: 14px;
    font-weight: 600;
  }

  .course-meta {
    font-size: 10.5px;
    color: var(--color-faint);
    white-space: nowrap;
  }

  .panel-arrow {
    margin-left: auto;
    color: var(--color-faint);
    font-family: var(--font-mono);
    font-size: 13px;
    transition: transform var(--dur-1) var(--ease-out);
  }

  .courses-panel li a:hover .panel-arrow {
    transform: translateX(3px);
    color: var(--color-accent);
  }

  .nav-actions {
    grid-area: 1 / 3;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
    min-width: 0;
  }

  .signin {
    display: none;
    align-items: center;
    min-height: 44px;
    padding-inline: 0.6rem;
    color: var(--color-muted);
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: none;
  }

  /* The link joins the masthead at 768px rather than 640px: between the two,
     the third column's share is barely wider than the action, and the name
     would end where the link begins. Below this the sheet carries it. */
  @media (min-width: 768px) {
    .signin {
      display: inline-flex;
    }
  }

  .signin:hover {
    color: var(--color-ink);
  }

  .account {
    display: none;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--color-rule-strong);
    border-radius: 50%;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-ink);
    text-decoration: none;
  }

  @media (min-width: 640px) {
    .account {
      display: grid;
    }
  }

  .account:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .nav-cta {
    display: none;
  }

  @media (min-width: 640px) {
    .nav-cta {
      display: inline-flex;
    }
  }

  .cta-arrow {
    font-family: var(--font-mono);
    font-size: 12px;
    transition: transform var(--dur-1) var(--ease-out);
  }

  .nav-cta:hover .cta-arrow {
    transform: translateX(2px);
  }

  .menu-button {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    width: 44px;
    height: 44px;
    padding: 0 10px;
    background: transparent;
    border: 1px solid var(--color-rule-strong);
    border-radius: 50%;
    cursor: pointer;
  }

  @media (min-width: 1024px) {
    .menu-button {
      display: none;
    }
  }

  .menu-rule {
    display: block;
    width: 100%;
    height: 1.5px;
    background: var(--color-ink);
  }

  .mobile-menu {
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: var(--space-5);
    border: 0;
    background: var(--color-ground);
    color: var(--color-ink);
    overflow-y: auto;
  }

  .mobile-menu::backdrop {
    background: color-mix(in srgb, var(--color-ink) 42%, transparent);
  }

  .mobile-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-rule);
  }

  .close {
    min-height: 44px;
    padding-inline: var(--space-3);
    background: transparent;
    border: 1px solid var(--color-rule-strong);
    border-radius: var(--radius-chip);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .mobile-nav {
    display: grid;
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-rule);
  }

  .mobile-nav a {
    display: flex;
    align-items: center;
    min-height: 50px;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: 23px;
    font-weight: 600;
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  .mobile-nav a[aria-current] {
    color: var(--color-accent);
  }

  .mobile-label {
    margin-top: var(--space-5);
    margin-bottom: var(--space-2);
    color: var(--color-faint);
  }

  .mobile-courses {
    list-style: none;
    margin: 0 0 var(--space-5);
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    border-top: 1px solid var(--color-rule);
  }

  .mobile-courses a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: 56px;
    border-bottom: 1px solid var(--color-rule);
    font-size: 14px;
    color: var(--color-ink);
    text-decoration: none;
  }

  .mobile-course {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-weight: 500;
  }

  .mobile-courses .num {
    font-size: 11px;
    color: var(--color-faint);
  }

  .mobile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }
</style>
