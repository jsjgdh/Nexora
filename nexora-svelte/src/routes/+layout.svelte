<script lang="ts">
  import "../app.css";
  import { afterNavigate } from "$app/navigation";
  import { onMount, type Snippet } from "svelte";
  import Header from "$lib/components/Header.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { session } from "$lib/session.svelte";
  import { SITE_NAME } from "$lib/seo";

  let { children }: { children: Snippet } = $props();

  /* Once per page load, in the browser only: the stored access token may be past
     its (now short) life while the HttpOnly refresh cookie is still good. Without
     this a learner who returns after a few minutes meets a sign-in form for a
     session the server still considers live. It never runs on the server, where
     there is no cookie to spend and nothing to restore. */
  onMount(() => {
    void session.restore();
  });

  afterNavigate(({ from, to }) => {
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
  <meta name="theme-color" content="#efece3" />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:border focus:border-accent focus:bg-panel focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-ink"
>
  Skip to main content
</a>

<Header />

<main id="main" tabindex="-1">
  {@render children()}
</main>

<Footer />
