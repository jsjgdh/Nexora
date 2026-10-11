<script lang="ts">
  import { page } from "$app/state";
  import { pageMeta } from "$lib/seo";

  /* One page's metadata, in one place.

     Every route renders this instead of writing tags by hand. Two reasons, both
     learned by looking at the rendered output rather than at the source:
     `<svelte:head>` MERGES across components, so a layout default plus a page
     override produces two `<meta name="description">` elements and two
     `og:title` cards; and a title, a canonical URL and a card that are written
     separately drift apart. The builders behind this are pure and asserted in
     `scripts/verify.ts`.

     The origin comes from the root layout's load, so the canonical URL and the
     sitemap are generated from the same value. A prerendered route bakes the
     build's origin (that is what .env.example tells a deployer). */

  let {
    title,
    description,
    path,
    type = "website",
    noindex = false,
  }: {
    title: string;
    description: string;
    path: string;
    type?: "website" | "article";
    noindex?: boolean;
  } = $props();

  const origin = $derived(
    (page.data as { origin?: string } | null | undefined)?.origin ?? null
  );

  /** Derived, so a client-side navigation to another path re-renders the head. */
  const meta = $derived(pageMeta({ title, description, path, origin, type }));
</script>

<svelte:head>
  <title>{meta.title}</title>
  <meta name="description" content={meta.description} />
  <link rel="canonical" href={meta.canonical} />
  {#if noindex}
    <meta name="robots" content="noindex" />
  {/if}
  <meta property="og:title" content={meta.og.title} />
  <meta property="og:description" content={meta.og.description} />
  <meta property="og:url" content={meta.og.url} />
  <meta property="og:type" content={meta.og.type} />
</svelte:head>
