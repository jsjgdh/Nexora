<script lang="ts">
  import { page } from "$app/state";

  /* Errors are part of the review world: a change that could not be applied.
     Two cases deserve different words — a URL that does not exist (404) and a
     real malfunction (500+). Saying "something went wrong" for a typo'd link
     is the kind of vagueness this product avoids in its teaching, so it is
     avoided here too. */

  const status = $derived(page.status);
  const isMissing = $derived(status === 404);

  const mark = $derived(isMissing ? "?" : "!");
  const headword = $derived(isMissing ? "no such path" : "could not be applied");
  const title = $derived(
    isMissing ? "This URL is not part of the change" : "Something broke on our side"
  );
  const body = $derived(
    isMissing
      ? "Nothing here was deleted — the address simply does not match a mission, a stage, or a page. The roadmap is the fastest way back to the work."
      : "Your progress is saved locally and is not affected. Reload once; if it happens again, the roadmap still works and the lesson you were on is intact."
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

<div class="mx-auto max-w-2xl px-4 py-14 sm:py-20">
  <div class="flex items-baseline gap-3">
    <span aria-hidden="true" class="num text-[22px] leading-none text-review">{mark}</span>
    <p class="stamp text-review">{headword}</p>
  </div>

  <p class="num mt-2 text-[12px] text-faint">status {status}</p>

  <h1 class="mt-4 text-2xl font-bold sm:text-3xl">{title}</h1>
  <p class="mt-3 max-w-prose text-[15px] leading-relaxed text-muted">{body}</p>

  {#if detail}
    <pre
      class="nice-scroll mt-5 overflow-x-auto border border-rule bg-panel p-3 font-mono text-[12px] leading-relaxed text-faint">{detail}</pre>
  {/if}

  <div class="mt-7 flex flex-wrap items-center gap-3">
    <a
      href="/roadmap"
      class="inline-flex items-center border border-accent bg-accent/10 px-4 py-2 text-[14px] font-semibold text-accent hover:bg-accent/20"
    >
      Back to the roadmap →
    </a>
    {#if isMissing}
      <a href="/skills" class="text-[14px] font-semibold text-muted underline hover:text-ink">
        See what you have demonstrated
      </a>
    {/if}
  </div>
</div>
