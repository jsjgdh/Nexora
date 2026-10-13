<script lang="ts">
  import { env } from "$env/dynamic/public";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* The desktop IDE, honestly.

     The IDE is a real product surface (a VS Code fork), but a downloadable
     build is only advertised when one actually exists. `PUBLIC_IDE_DOWNLOAD_URL`
     is the single switch: set it to a hosted installer and this page links to
     it; leave it unset (the default) and the page says the build is not
     published yet rather than rendering a dead link or a button that goes
     nowhere. This is the same rule the pricing page follows for plans and the
     one D-012 states for the paywall: do not advertise what is not available.

     Read the same defensive way every other public var is read here (see
     $lib/session.svelte.ts, $lib/seo.ts): absent, empty and whitespace-only all
     mean "not configured", and an unset variable must never throw. */
  const downloadUrl = ((env.PUBLIC_IDE_DOWNLOAD_URL as string | undefined) ?? "").trim();
  const available = downloadUrl.length > 0;
</script>

<PageHead
  title={pageTitle("Download")}
  description="Download the NEXORA IDE — the only way to learn. The base course ships inside it and works offline with no account."
  path="/download"
/>

<div class="mx-auto max-w-3xl px-4 py-10">
  <p class="stamp text-accent">download</p>
  <h1 class="mt-2 text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">The NEXORA IDE</h1>
  <p class="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
    The only way to learn NEXORA: a desktop editor with the base course inside
    it. Install it, open it, and the first judged verdict is minutes away — no
    account, no browser tab, no second surface to choose between.
  </p>

  <section class="mt-8 border border-rule" aria-label="How learning starts">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">how it goes</h2>
    <ol class="space-y-2 px-3 py-3 text-[13px] leading-relaxed text-muted">
      <li><span class="num text-ink">1.</span> Download the IDE — the base course ships inside it.</li>
      <li><span class="num text-ink">2.</span> Sign in when you want more: the IDE opens this site, you log in here.</li>
      <li><span class="num text-ink">3.</span> Your tier decides which courses appear inside the IDE.</li>
    </ol>
  </section>

  <section class="mt-8 border border-rule" aria-label="Get the IDE">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">get the app</h2>
    <div class="px-3 py-4">
      {#if available}
        <a
          href={downloadUrl}
          rel="external noopener"
          class="inline-flex border border-rule px-4 py-2 text-[13px] font-medium text-ink hover:border-accent hover:text-accent"
        >
          Download the NEXORA IDE
        </a>
        <p class="mt-3 text-[12px] leading-relaxed text-faint">
          Free to download. Pick the build for your operating system on the download page.
        </p>
      {:else}
        <p class="text-[13px] leading-relaxed text-muted">
          The desktop build is not published yet. The IDE is the only way to
          learn, so there is nothing to start in the browser instead — check
          back for the download rather than a dead link.
        </p>
        <div class="mt-4">
          <a
            href="/pricing"
            class="inline-flex border border-rule px-4 py-2 text-[13px] font-medium text-ink hover:border-accent hover:text-accent"
          >
            See pricing while you wait
          </a>
        </div>
      {/if}
    </div>
  </section>

  <section class="mt-8 border border-rule" aria-label="What is free">
    <h2 class="stamp border-b border-rule bg-raised px-3 py-1.5 text-faint">what is free</h2>
    <ul class="space-y-2 px-3 py-3 text-[13px] leading-relaxed text-muted">
      <li>
        <span class="text-ink">The download is free.</span> No account and no payment to get the
        app.
      </li>
      <li>
        <span class="text-ink">The first loop is bundled.</span> It works offline, with no account,
        straight after install.
      </li>
      <li>
        <span class="text-ink">Later phases are fetched per entitlement.</span> They are loaded for
        the account signed in, and are never written to disk. Assessment itself stays free.
      </li>
    </ul>
  </section>
</div>
