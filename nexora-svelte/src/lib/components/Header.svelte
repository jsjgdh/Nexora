<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { session } from "$lib/session.svelte";
  import { BRAND, NAV } from "$lib/content/site";
  import type { ReleaseState } from "$lib/release";

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

  /* The download action, and what it is called.
   *
   * The label is the release state's, so the header can never offer a build
   * that is not published. One switch decides it, the server decides it, and
   * every surface reads the same answer. */
  let { release }: { release: ReleaseState } = $props();

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
  <div class="bar">
    <!-- The nameplate: the product's word and the mark that goes with it.
         It is a link home, and it says so to a screen reader in words rather
         than with an aria-label, because a label that REPLACES the visible
         word is a name a voice control cannot act on. -->
    <a href="/" class="nameplate">
      <span class="mark" aria-hidden="true"></span>
      <span class="sr-only">Home</span>
      <span class="word display">{BRAND}</span>
    </a>

    <!-- The folio: the sections, from the one list the rest of the site reads.
         It is the only sticky layer, because a nameplate pinned to the top of
         every screen is a wall and not navigation. -->
    <nav class="folio" aria-label="Site">
      <ul class="nice-scroll -mx-4 flex items-stretch overflow-x-auto px-4 sm:-mx-8 sm:px-8">
        {#each NAV as item (item.href)}
          <li class="flex">
            <a href={item.href} aria-current={currentKind(item.href)} class="folio-link">
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <!-- The controls: the one action, and who is signed in. -->
    <div class="actions">
      {#if !session.loggedIn}
        <a
          href="/download"
          aria-current={pathname === "/download" ? "page" : undefined}
          class="inline-flex min-h-[44px] shrink-0 items-center border border-accent bg-accent px-3.5 text-[12.5px] font-bold whitespace-nowrap text-ground transition-[color,background-color,border-color] duration-200 hover:border-accent-bright hover:bg-accent-bright"
        >
          {release.labelShort}
        </a>
      {/if}

      <!-- The sign-in link waits for `restoring`: the session lives in a
           cookie this page cannot read, so "signed out" is not known yet on a
           fresh load, and offering the link is a claim we cannot make until
           the server has answered. The avatar has no such problem — being
           shown something is only ever wrong once. -->
      {#if session.loggedIn}
        <a
          href="/account"
          aria-current={pathname === "/account" || pathname === "/profile" || pathname === "/auth" ? "page" : undefined}
          aria-label={session.user ? `Account: ${session.user.email}` : "Account"}
          title={session.user?.email ?? "Account"}
          class="grid h-11 w-11 place-items-center border border-rule-strong font-mono text-[12px] font-bold text-ink transition-[color,background-color,border-color] duration-200 hover:border-accent hover:bg-accent hover:text-ground"
        >
          {(session.user?.email ?? "?").slice(0, 1).toUpperCase()}
        </a>
      {:else if !session.restoring}
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

  <!-- The edge of the bar. The page dissolves into the chrome instead of
       stopping at a rule, and nothing scrolls under a blur: the house refuses
       a blur of whatever happens to be behind it. -->
  <div class="edge" aria-hidden="true"></div>
</header>

<!-- The folio now lives in the bar above, so there is one row of chrome and
     not two: the nameplate, the sections and the controls, in one line. -->

<style>
  /* The bar. One row: the nameplate, the sections, the controls.
     It is the only sticky layer, and it is the only thing that crosses the
     page, so it has to read as an edge rather than as a band of colour. */
  .masthead {
    position: sticky;
    top: 0;
    z-index: var(--z-nav);
    background: var(--color-ground);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    max-width: 1320px;
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
  }

  @media (min-width: 640px) {
    .bar {
      gap: var(--space-4);
      padding: var(--space-3) var(--space-8);
    }
  }

  /* The edge of the bar. The page dissolves into the chrome instead of
     stopping at a rule. Nothing blurs: the house refuses a blur of whatever
     happens to be behind it, and the page coming up under a fade is the
     same effect without the lie.

     The height is fixed and the DEPTH of the fade changes, because animating
     `height` is animating a layout property, and the bar sits at the top of
     every page. */
  .edge {
    height: 20px;
    background: linear-gradient(var(--color-ground), transparent);
    opacity: 0.55;
    pointer-events: none;
    transition: opacity 240ms var(--ease-out);
  }

  /* The attribute is set by the scroll measure at run time, so it has to be
     addressed globally or the compiler cannot see it. */
  .edge:global([data-scrolled="true"]) {
    opacity: 1;
  }

  /* The attribute is set by the scroll measure at run time, so it has to be
     addressed globally or the compiler cannot see it. */
  .edge:global([data-scrolled="true"]) {
    opacity: 1;
  }

  /* The page you are on is inked, the same gesture the folio makes for the
     section you are inside. The download and the account are not sections of
     the front page, so the folio has nothing to mark on those routes; the
     action that owns the route carries the marker instead, or an interior
     page is a page with no way home marked anywhere in the chrome. */
  .masthead a[aria-current="page"] {
    border-color: var(--color-ink);
    background: var(--color-ink);
    color: var(--color-ground);
  }

  /* The nameplate: the product's word, the mark that goes with it, and
     nothing else. The link is the width of the word and the mark together,
     not the width of the band — an invisible 900px home hotspot across the
     top of the page is a trap, not a nameplate. */
  .nameplate {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    min-width: 0;
    flex: none;
    color: var(--color-ink);
    text-decoration: none;
  }

  .nameplate .word {
    font-size: clamp(1rem, 2.1vw, 1.45rem);
    font-weight: 800;
    letter-spacing: 0.14em;
  }

  .nameplate:hover .word {
    color: var(--color-accent);
  }

  /* The mark: a plate with one corner cut, in the signal colour. It is the
     only piece of ornament in the chrome, and it is the same shape as the
     cut corner the house uses everywhere else. */
  .mark {
    position: relative;
    width: 12px;
    height: 12px;
    flex: none;
    background: var(--color-accent);
    clip-path: polygon(0 0, 100% 0, 100% 72%, 72% 100%, 0 100%);
  }

  /* The folio: the sections, from the one list the rest of the site reads.
     The links are flat and dim, and the current one is underlined, so the bar
     reads as a list of places rather than as a row of buttons.

     Below the wide breakpoint the folio takes a row of its OWN, the full width
     of the page, because a strip of nine links squeezed into the leftover
     space beside a wordmark and two buttons is a forty-pixel slot on a phone,
     and the reader cannot see that there is anything to scroll to. */
  .folio {
    min-width: 0;
    order: 3;
    flex: 1 0 100%;
  }

  @media (min-width: 1280px) {
    .folio {
      order: 0;
      flex: 1 1 auto;
    }
  }

  .folio ul {
    list-style: none;
  }

  .folio-link {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 var(--space-2);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--color-faint);
    transition: color 200ms var(--ease-out);
  }

  .folio-link:hover {
    color: var(--color-ink);
  }

  /* The current section is carried by a drawn rule, not by a hue: the underline
     is already there for the section the reader is inside. Hover does *not*
     draw it — one signal per element, so the pointer can only darken the label
     and the rule can only mean "you are here". */
  .folio-link::after {
    content: "";
    position: absolute;
    left: var(--space-2);
    right: var(--space-2);
    bottom: 6px;
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

  /* The controls sit at the right and never move. */
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
  }
</style>
