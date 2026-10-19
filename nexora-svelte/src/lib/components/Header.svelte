<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { apiConfigured, session } from "$lib/session.svelte";
  import { BRAND, MASTHEAD, NAV } from "$lib/content/site";

  /* The instrument face.
   *
   * A bench has a nameplate, a reading, and the controls. This is the same
   * three things: the product's name at the size of the page's own display
   * type, the measured status of the thing next to it, and the two actions
   * that matter. There is no square logo lockup beside the name — a mark next
   * to a wordmark reads as a sticker, and the wordmark is doing the work.
   *
   * Three structural facts, all of them load-bearing:
   *
   *   1. The nameplate is the identity, and the way home is the word itself
   *      rather than a label. It is announced with a hidden word rather than
   *      an `aria-label`, because a label would *replace* the visible word and
   *      a name that does not contain the text on screen is a name a voice
   *      control cannot act on.
   *   2. The folio — the section bar — is a *sibling* of the masthead, not a
   *      child of it. A sticky element can only travel inside its own parent's
   *      box, so a folio nested in the header would unstick the moment the
   *      header ended. As a sibling its containing block is the page, which is
   *      what lets it follow the reader from the top of the document to the
   *      footer.
   *   3. Only the folio is sticky. The nameplate scrolls away with the page it
   *      belongs to, because a 120px nameplate pinned to the top of every
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
     here. */
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
    <!-- The status line: what is actually true of the product right now, on the
         left, and the two actions on the right. It is a reading rather than a
         slogan, so it can be checked — and it changes when the product
         changes. The hairline under it is what makes the line a *label strip*
         rather than a floating row of small print.

         The line is dropped below `sm` so a phone's strip is the download and
         nothing else; the actions keep right-aligned either way. -->
    <div class="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-rule py-3 sm:py-1">
      <p class="stamp hidden text-[11px] text-faint sm:block">
        {MASTHEAD.status}
      </p>
      <div class="ml-auto flex items-center gap-2.5">
        <a
          href="/download"
          aria-current={pathname === "/download" ? "page" : undefined}
          class="inline-flex min-h-[44px] shrink-0 items-center border border-accent bg-accent px-3.5 text-[12.5px] font-bold whitespace-nowrap text-ground transition-[color,background-color,border-color] duration-200 hover:border-accent-bright hover:bg-accent-bright"
        >
          Download the IDE
        </a>

        <!-- The sign-in link waits for `restoring`: the session lives in a
             cookie this page cannot read, so "signed out" is not known yet on
             a fresh load, and offering the link is a claim we cannot make until
             the server has answered. The avatar has no such problem — being
             shown something is only ever wrong once. -->
        {#if session.loggedIn}
          <a
            href="/auth"
            aria-current={pathname === "/auth" || pathname === "/profile" ? "page" : undefined}
            aria-label={session.user ? `Account: ${session.user.email}` : "Account"}
            title={session.user?.email ?? "Account"}
            class="grid h-11 w-11 place-items-center border border-rule-strong font-mono text-[12px] font-bold text-ink transition-[color,background-color,border-color] duration-200 hover:border-accent hover:bg-accent hover:text-ground"
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

    <!-- The nameplate: the product's name at the size of the page's own
         display type, and the desk's description sitting on its baseline like
         the legend under a manufacturer's plate. The row is a hairline above
         the folio, so the two read as one band of instrument.

         The link stays the width of the word rather than the width of the
         band — an invisible 900px home hotspot across the top of the page is a
         trap, not a nameplate. -->
    <div class="nameplate-row">
      <a href="/" class="nameplate">
        <span class="display block text-[clamp(1.9rem,5.2vw,3.2rem)] text-ink">{BRAND}</span>
        <span class="sr-only">Home</span>
      </a>
      <p class="stamp hidden text-[11px] text-faint md:block">{MASTHEAD.descriptor}</p>
    </div>
  </div>
</header>

<!-- The folio: one section bar for every width, which is also why the old
     desktop/mobile nav pair is gone — two copies of the same five links was two
     places for the current marker to be wrong. It bleeds to the screen edges,
     so its negative margin has to match the container's padding at each width
     or it hangs short of the edge above `sm`. -->
<nav aria-label="Site" class="folio sticky top-0 z-50" data-scrolled={scrolled}>
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
  /* The masthead is the room's back wall, and it scrolls away. Nothing here is
     sticky and nothing is blurred: a bench does not frost. */
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

  /* The nameplate row: the name on the left, the legend on the right, and a
     hairline between them and the folio below. */
  .nameplate-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-6);
    padding-bottom: var(--space-3);
  }

  /* The nameplate itself: the page's own display face, set tight. It carries
     the weight a lockup would have carried. `inline-flex` with a 44px floor
     so the brand is a thumb target like every other control: the way home
     should not be the smallest thing in the chrome. */
  .nameplate {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    min-width: 0;
    color: var(--color-ink);
  }
  .nameplate .display {
    letter-spacing: 0.02em;
  }
  .nameplate:hover .display {
    color: var(--color-accent);
  }

  /* The folio: the heavy rule the nameplate sits on, and the bar under it.
     Once it is pinned it has to read as an edge rather than as a band of
     colour, and in this house an edge is a rule and never a shadow: a blur
     of whatever happens to be behind it is exactly the thing the surface
     system refuses to do. So the pinned state strengthens the lower rule
     instead, and the bar separates itself by contrast, not by a halo. */
  .folio {
    background: var(--color-ground);
    border-top: 1px solid var(--color-rule-strong);
    border-bottom: 1px solid var(--color-rule);
    transition: border-color 200ms var(--ease-out);
  }
  .folio[data-scrolled="true"] {
    border-bottom-color: var(--color-rule-strong);
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
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
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
  /* Pressing a section inks the cell and prints its label in the room's own
     dark. */
  .folio-link:active {
    background: var(--color-ink);
    color: var(--color-ground);
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
    background: var(--color-accent);
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
