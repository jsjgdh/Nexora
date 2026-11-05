<script lang="ts">
  // The typefaces first: the faces this site uses are served from this site,
  // so the front door makes no third-party request to render a page.
  import "$lib/fonts.css";
  import "../app.css";
  import { afterNavigate, onNavigate } from "$app/navigation";
  import { onMount, type Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import Header from "$lib/components/Header.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { session } from "$lib/session.svelte";
  import { reduced } from "$lib/motion";
  import { SITE_NAME } from "$lib/seo";

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  /* The cut between two pages.
   *
   * A page change is a change of document, and the browser's own answer to
   * that is a hard swap that reads as a flicker. The View Transitions API
   * gives the swap a frame to happen in, so the two documents cross over
   * instead of blinking.
   *
   * It is a progressive enhancement in the strict sense: where the API does
   * not exist, or where the reader has asked for less motion, the navigation
   * is exactly what it was. The promise is returned to SvelteKit so the
   * navigation waits for the transition rather than racing it, and a
   * transition that cannot start resolves rather than stranding the reader on
   * the page they were leaving. */
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    if (reduced()) return;
    return new Promise<void>((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
      transition.ready.catch(() => {
        // A transition that cannot start is not an error worth stopping for.
        resolve();
      });
    });
  });

  /* Once per page load, in the browser only: the stored access token may be past
     its (now short) life while the HttpOnly refresh cookie is still good. Without
     this a learner who returns after a few minutes meets a sign-in form for a
     session the server still considers live. It never runs on the server, where
     there is no cookie to spend and nothing to restore. */
  onMount(() => {
    void session.restore();
  });

  afterNavigate(({ from, to }) => {
    // The first load is not a navigation: the browser is already at the top of
    // the document, and moving focus to the heading there would put a focus
    // ring on the one line the page cannot afford to have ringed.
    if (!from) return;
    if (to?.url.pathname && from?.url.pathname === to.url.pathname) return;
    const heading = document.querySelector<HTMLElement>("#main h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    } else {
      document.querySelector<HTMLElement>("#main")?.focus();
    }
  });
</script>

<!-- Only the tags that are the same on every page. Everything a page can vary —
     its title, description, canonical URL and the card's own title and
     description — is emitted by <PageHead>, because `svelte:head` merges: a
     default here plus a page override would put two descriptions in the
     document, and the crawler would pick one of them. -->
<svelte:head>
  <!-- The colour of the browser's own chrome, so the address bar belongs to
       the page. It is a literal because a meta tag cannot read a custom
       property, and it is a copy of `--color-ground`: if the ground moves,
       this moves with it. -->
  <meta name="theme-color" content="#0d1014" />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:border focus:border-accent focus:bg-panel focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-ink"
>
  Skip to main content
</a>

<Header release={data.release} />

<main id="main" tabindex="-1">
  {@render children()}
</main>

<Footer release={data.release} />
