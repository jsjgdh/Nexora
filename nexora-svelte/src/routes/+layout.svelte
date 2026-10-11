<script lang="ts">
  import "../app.css";
  import type { Snippet } from "svelte";
  import Header from "$lib/components/Header.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>NEXORA — From the basics to building for real</title>
  <meta
    name="description"
    content="A personalized, gamified programming education platform built around an interactive roadmap."
  />
</svelte:head>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-mint focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-graphite"
>
  Skip to main content
</a>
<Header />
<main id="main">
  {@render children()}
</main>
