<script lang="ts">
  import { page } from "$app/state";
  import ActionLink from "$lib/components/ActionLink.svelte";

  /* Errors on the front door: a URL that does not exist (404) and a real
     malfunction (500+) deserve different words. Saying "something went wrong"
     for a typo'd link is the kind of vagueness this product avoids, so it is
     avoided here too. There is one way to learn — the desktop IDE — so the way
     back is the download, never a classroom page. */

  const status = $derived(page.status);
  const isMissing = $derived(status === 404);

  const mark = $derived(isMissing ? "?" : "!");
  const headword = $derived(isMissing ? "no such path" : "could not be applied");
  const title = $derived(
    isMissing ? "This URL is not part of the site" : "Something broke on our side"
  );
  const body = $derived(
    isMissing
      ? "Nothing here was deleted. The address simply does not match a page on this site. The download is the fastest way back to the work."
      : "Reload once; if it happens again, the download still works and the IDE on your machine is unaffected."
  );
  const detail = $derived(
    (page.error as { message?: string } | null)?.message && !isMissing
      ? (page.error as { message?: string }).message
      : null
  );
</script>

<svelte:head>
  <title>{status} — {title}</title>
</svelte:head>

<div class="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-32">
  <div class="flex items-baseline gap-4">
    <span aria-hidden="true" class="num text-[24px] leading-none text-review">{mark}</span>
    <p class="stamp text-review">{headword}</p>
  </div>

  <p class="num mt-3 text-[12px] text-faint">status {status}</p>

  <h1 class="display mt-6 text-[clamp(1.9rem,4.6vw,3.2rem)] text-ink">
    <span class="line-mask" data-shown="true"><span>{title}</span></span>
  </h1>
  <p class="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-muted">{body}</p>

  {#if detail}
    <pre
      class="mt-8 max-w-[80ch] border border-rule bg-panel p-4 font-mono text-[12px] leading-relaxed text-faint [overflow-wrap:anywhere] whitespace-pre-wrap">{detail}</pre>
  {/if}

  <div class="mt-10 flex flex-wrap items-center gap-3">
    <ActionLink href="/download" island>Download the IDE</ActionLink>
    <ActionLink href="/" variant="ghost">Back to the front</ActionLink>
  </div>
</div>
