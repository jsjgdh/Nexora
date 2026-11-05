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
  <title>{status}: {title}</title>
</svelte:head>

<div class="container-page section-pad error-page">
  <div class="error-mark">
    <span aria-hidden="true" class="num">{mark}</span>
    <p class="stamp">{headword}</p>
  </div>

  <p class="num error-status">status {status}</p>

  <h1 class="display error-title">{title}</h1>
  <p class="error-body">{body}</p>

  {#if detail}
    <pre class="error-detail num">{detail}</pre>
  {/if}

  <div class="error-actions">
    <ActionLink href="/download" island>The download page</ActionLink>
    <ActionLink href="/" variant="ghost">Back to the front</ActionLink>
  </div>
</div>

<style>
  .error-page {
    background:
      radial-gradient(60% 50% at 12% 0%, color-mix(in srgb, var(--color-fail) 10%, transparent), transparent 65%);
  }

  .error-mark {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    color: var(--color-fail);
  }

  .error-mark .num {
    font-size: 24px;
    line-height: 1;
    font-weight: 700;
  }

  .error-status {
    margin-top: var(--space-3);
    font-size: 12px;
    color: var(--color-faint);
  }

  .error-title {
    margin-top: var(--space-6);
    max-width: 20ch;
    font-size: clamp(2rem, 4.6vw, 3.4rem);
    color: var(--color-ink);
  }

  .error-body {
    margin-top: var(--space-5);
    max-width: 56ch;
    font-size: 15px;
    line-height: 1.65;
    color: var(--color-muted);
  }

  .error-detail {
    margin-top: var(--space-6);
    max-width: 80ch;
    padding: var(--space-4);
    border: 1px solid var(--color-rule);
    border-radius: var(--radius-sm);
    background: var(--color-raised);
    font-size: 12px;
    line-height: 1.6;
    color: var(--color-faint);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .error-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-8);
  }
</style>
