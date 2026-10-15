<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { BRAND, MASTHEAD, NAV } from "$lib/content/site";

  /* The masthead.
   *
   * A newspaper names itself at the top of the page and lists its sections on a
   * bar underneath. That is the whole shape here, and it replaced a small
   * wordmark, five inline links and a button sharing one line — which is the
   * shape every SaaS page has, and it told a visitor nothing about this being a
   * press. The bar was genre-blind; a masthead is the genre.
   *
   * Three structural facts, all of them load-bearing:
   *
   *   1. The nameplate is the identity, at the size of the page's own display
   *      type, with the desk's name sitting at its baseline. There is no square
   *      logo lockup beside it: a mark next to a 112px wordmark reads as a
   *      sticker, and the wordmark is doing the work.
   *   2. The folio — the section bar — is a *sibling* of the masthead, not a
   *      child of it. A sticky element can only travel inside its own parent's
   *      box, so a folio nested in the header would unstick the moment the
   *      header ended. As a sibling its containing block is the page, which is
   *      what lets it follow the reader from the top of the document to the
   *      footer.
   *   3. Only the folio is sticky. The masthead scrolls away with the page it
   *      belongs to, because a 160px nameplate pinned to the top of every
   *      screen is a wall, not navigation.
   *
   * Learning itself happens in the IDE — there is deliberately no classroom
   * link, no site search and no resume CTA here, so the site never reads as a
   * second way to learn.
   *
   * The current item is marked in three ways at once, none of them colour
   * alone: `aria-current`, an ink rule drawn under the item, and ink for the
   * text. On the homepage the in-page links (`/#courses`) can never satisfy
   * `pathname === href`, so the folio tracks which section the reader is
   * actually inside instead — and it reads the section ids out of `NAV`, so a
   * link added there is spied on without a second list to keep in step. */

  const pathname = $derived(page.url.pathname);
  const hash = $derived(page.url.hash);

  const sectionIds = NAV.filter((item) => item.href.startsWith("/#")).map((item) =>
    item.href.slice(2)
  );

  let scrolled = $state(false);
  /* Which anchor the reader is inside, on the page that holds the sections.
     Empty everywhere else. */
  let inSection = $state("");

  /** The nav item for the current location, whether it is a route or an anchor. */
  function isCurrent(href: string): boolean {
    if (href.startsWith("/#")) return pathname === "/" && inSection === href.slice(2);
    return pathname === href;
  }

  function currentKind(href: string): "page" | "location" | undefined {
    if (!isCurrent(href)) return undefined;
    return href.startsWith("/#") ? "location" : "page";
  }

  /* How close to the top of the viewport a section has to come before the folio
     counts the reader as being inside it. This number is coupled to CSS: the
     anchor line is `section[id] { scroll-margin-top: 4.5rem }` in app.css, so a
     section jumped to from this folio lands 72px down, clearing the folio's own
     47px (2px rule, a 44px row, a 1px rule). The spy line must stay at or below
     that landing, or the folio would mark the section *before* the one the
     reader just arrived at — the nav contradicting the click that brought them
     here. It also sits well below the folio itself so the marking does not
     flicker while the reader scrolls through the seam. */
  const SPY_LINE = 140;

  /* One listener for both facts — the scrolled state and the section — and one
     frame at most per scroll. `remeasure` is kept so a client-side navigation
     can re-run the same pass without a second code path. */
  let remeasure: (() => void) | null = null;

  onMount(() => {
    let queued = false;
    const measure = (): void => {
      queued = false;
      /* The shadow belongs to the folio only once it is actually pinned, which
         is the moment the masthead has left the top of the screen. */
      scrolled = window.scrollY > 24;

      if (window.location.pathname !== "/") {
        if (inSection !== "") inSection = "";
        return;
      }

      // The current section is the *deepest* one whose top has passed the spy
      // line, not the last one named in NAV — NAV's order is editorial and the
      // page's order is not, so picking by declaration order marks the wrong
      // section as soon as two are in view.
      let found = "";
      let lowest = -Infinity;
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= SPY_LINE && top > lowest) {
          lowest = top;
          found = id;
        }
      }
      if (found !== inSection) inSection = found;
    };
    const request = (): void => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    remeasure = request;
    measure();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request, { passive: true });
    window.addEventListener("hashchange", request);
    return () => {
      remeasure = null;
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      window.removeEventListener("hashchange", request);
    };
  });

  /* A client-side navigation changes the path without a scroll, so the pass is
     re-run when the location does. */
  $effect(() => {
    pathname;
    hash;
    remeasure?.();
  });

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

<header class="masthead">
  <div class="mx-auto max-w-[1320px] px-5 sm:px-8">
    <!-- The dateline: what the desk is and what it promises on the left, the
         two actions on the right, on a hairline. Utility, not navigation —
         which is why the actions live up here and the sections live in the
         folio below. The line is dropped below `sm` so a phone's dateline is
         the download and nothing else; the actions keep right-aligned either
         way. Both strings used to sit under the wordmark; they moved up here so
         the nameplate row can hold the name and nothing else.

         The hairline under it is what makes the line an *edition line* rather
         than a floating row of small print: the paper states who it is above a
         rule, sets its name under it, and closes the nameplate with the heavy
         rule the folio carries. Three rules, each with a different job, none of
         them decorative. -->
    <div class="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-rule py-1">
      <p class="stamp hidden text-[11px] text-faint sm:block">
        {MASTHEAD.desk} · {MASTHEAD.edition}
      </p>
      <div class="ml-auto flex items-center gap-2.5">
        <a
          href="/download"
          aria-current={pathname === "/download" ? "page" : undefined}
          class="inline-flex min-h-[44px] shrink-0 items-center border border-accent bg-accent px-3.5 text-[12.5px] font-bold whitespace-nowrap text-ground transition-[color,background-color,border-color] duration-200 hover:border-accent-bright hover:bg-accent-bright"
        >
          Get the IDE
        </a>

        <!-- The sign-in link waits for `restoring`: the session lives in a
             cookie this page cannot read, so "signed out" is not known yet on a
             fresh load, and offering the link is a claim we cannot make until
             the server has answered. The avatar has no such problem — being
             shown something is only ever wrong once. -->
        {#if session.loggedIn}
          <a
            href="/auth"
            aria-current={pathname === "/auth" || pathname === "/profile" ? "page" : undefined}
            aria-label={session.user ? `Account: ${session.user.email}` : "Account"}
            title={session.user?.email ?? "Account"}
            class="grid h-11 w-11 place-items-center border border-ink font-mono text-[12px] font-bold text-ink transition-[color,background-color,border-color] duration-200 hover:border-accent hover:bg-accent hover:text-ground"
          >
            {(session.user?.email ?? "?").slice(0, 1).toUpperCase()}
          </a>
        {:else if apiConfigured && !session.restoring}
          <a
            href="/auth"
            aria-current={pathname === "/auth" ? "page" : undefined}
            class="inline-flex min-h-[44px] items-center border border-rule-strong px-3.5 text-[12.5px] font-semibold whitespace-nowrap text-muted transition-[color,background-color,border-color] duration-200 hover:border-ink hover:text-ink"
          >
            Sign in
          </a>
        {/if}
      </div>
    </div>

    <!-- The nameplate: the whole measure, and nothing in it but the name. The
         way home is announced with a hidden word rather than an `aria-label` —
         a label would *replace* the visible word, and a name that does not
         contain the text on screen is a name voice control cannot act on.

         The size is the largest the fold allows, and that ceiling is worth
         stating because it is what stops the name from reaching both edges: at
         this measure "NEXORA" would need a ~400px face to touch the margins, or
         about 1.3em of tracking, and either one pushes the hero's download
         below the fold on a 13" laptop. The band spans the full measure; the
         letters fill 28% of it, which is the most "full width" this page can
         have without spending the fold to get it. The link stays the width of
         the word rather than the width of the band — an invisible 900px home
         hotspot across the top of the page is a trap, not a masthead. -->
    <div class="nameplate-row">
      <a href="/" class="nameplate">
        <span class="display block text-[clamp(2.4rem,9vw,7rem)] text-ink">{BRAND}</span>
        <span class="sr-only">Home</span>
      </a>
    </div>
  </div>
</header>

<!-- The folio: one section bar for every width, which is also why the old
     desktop/mobile nav pair is gone — two copies of the same five links was two
     places for the current marker to be wrong. It bleeds to the screen edges, so
     its negative margin has to match the container's padding at each width or it
     hangs short of the edge above `sm`. -->
<nav aria-label="Sections" class="folio sticky top-0 z-50" data-scrolled={scrolled}>
  <div class="mx-auto max-w-[1320px] px-5 sm:px-8">
    <ul class="nice-scroll -mx-5 flex items-stretch overflow-x-auto px-5 sm:-mx-8 sm:px-8">
      {#each NAV as item (item.href)}
        <li class="flex">
          <a href={item.href} aria-current={currentKind(item.href)} class="folio-link">
            {item.label}
          </a>
        </li>
      {/each}
    </ul>
  </div>
</nav>

<style>
  /* The masthead is newsprint and rule, and it scrolls away. Nothing here is
     sticky and nothing is blurred: paper does not frost. */
  .masthead {
    background: var(--color-ground);
  }

  /* The page you are on is inked, the same gesture the folio makes for the
     section you are inside. The download and the account are not sections of
     the front page, so the folio has nothing to mark on those routes; the
     action that owns the route carries the marker instead, or an interior page
     is a page with no way home marked anywhere in the chrome. */
  .masthead a[aria-current="page"] {
    border-color: var(--color-ink);
    background: var(--color-ink);
    color: var(--color-ground);
  }

  /* The nameplate row: the full measure, holding the name and nothing else, so
     the wordmark has the whole line to itself the way a nameplate does. The
     bottom padding is the air between the letters and the folio's heavy rule. */
  .nameplate-row {
    padding-bottom: var(--space-2);
  }

  /* The nameplate itself: the page's own display face, set tight. It carries
     the weight a lockup would have carried. The tiny positive tracking is there
     to widen the word a little at poster size — display type this large is
     normally kerned tighter than body copy, and a nameplate is the exception. */
  /* `inline-flex` with a 44px floor so the brand is a thumb target like every
     other control: the way home should not be the smallest thing in the
     chrome. On a desktop the letters are 99px tall and this changes nothing;
     on a phone it is the difference between a 34px link and a target. */
  .nameplate {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    min-width: 0;
    color: var(--color-ink);
  }
  .nameplate .display {
    letter-spacing: 0.04em;
  }
  .nameplate:hover .display {
    color: var(--color-accent);
  }

  /* The folio: the heavy rule the nameplate sits on, and the bar under it. It
     becomes ink — and lifts off the page by a real offset shadow — once it is
     pinned, which is structure rather than a halo, and never a blur of whatever
     is behind it. */
  .folio {
    background: var(--color-ground);
    border-top: 2px solid var(--color-ink);
    border-bottom: 1px solid var(--color-rule);
    transition:
      border-color 200ms var(--ease-out),
      box-shadow 200ms var(--ease-out);
  }
  .folio[data-scrolled="true"] {
    border-bottom-color: var(--color-ink);
    box-shadow: 0 12px 26px -24px color-mix(in srgb, var(--color-ink) 85%, transparent);
  }

  /* A section bar cell: printed, one line, and 44px tall at every width so a
     thumb gets the same target a pointer does. The hairlines fall *between*
     cells rather than around them, the way a section bar is ruled. */
  .folio li + li {
    border-left: 1px solid var(--color-rule);
  }
  .folio-link {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 var(--space-4);
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--color-muted);
    transition:
      color 200ms var(--ease-out),
      background-color 200ms var(--ease-out);
  }
  .folio-link:hover {
    color: var(--color-ink);
  }
  /* Pressing a section inks the cell and prints its label in paper. */
  .folio-link:active {
    background: var(--color-ink);
    color: var(--color-paper-2);
  }

  /* The current section is carried by a drawn rule, not by a hue: the underline
     is already there for the section the reader is inside. Hover does *not*
     draw it — one signal per element, so the pointer can only darken the label
     and the rule can only mean "you are here". */
  .folio-link::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: var(--color-ink);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 260ms var(--ease-out);
  }
  .folio-link[aria-current] {
    color: var(--color-ink);
  }
  .folio-link[aria-current]::after {
    transform: scaleX(1);
  }
</style>
