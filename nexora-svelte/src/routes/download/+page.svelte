<script lang="ts">
  import { env } from "$env/dynamic/public";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import LaunchList from "$lib/components/LaunchList.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { pageTitle } from "$lib/seo";

  /* The desktop IDE, honestly.
   *
   * The IDE is a real product surface (a VS Code fork), but a downloadable
   * build is advertised only when one actually exists. `PUBLIC_IDE_DOWNLOAD_URL`
   * is the single switch: set it to a hosted installer and this page links to
   * it; leave it unset (the default) and the page says the build is not
   * published yet rather than rendering a dead link or a button that goes
   * nowhere. This is the same rule the pricing page follows for plans, and the
   * one D-012 states for the paywall: do not advertise what is not available.
   *
   * Read the same defensive way every other public variable is read here (see
   * `$lib/session.svelte.ts`, `$lib/seo.ts`): absent, empty and whitespace-only
   * all mean "not configured", and an unset variable must never throw. */
  const downloadUrl = ((env.PUBLIC_IDE_DOWNLOAD_URL as string | undefined) ?? "").trim();
  const available = downloadUrl.length > 0;

  const STEPS = [
    { n: "01", text: "Download the IDE. The nine phases ship inside it." },
    { n: "02", text: "Sign in when you want more: the IDE opens this site, you log in here." },
    { n: "03", text: "Your tier decides which courses appear inside the IDE." },
  ];
</script>

<PageHead
  title={pageTitle("Download")}
  description="Download the NEXORA IDE, the only way to learn. The nine free phases ship inside it and work offline with no account."
  path="/download"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["Install the editor.", "The course is already in it."]}
    class="max-w-[18ch] text-[clamp(2.2rem,6.5vw,5rem)] text-ink"
  />
  <p class="mt-7 max-w-[52ch] font-serif text-[clamp(1.05rem,2vw,1.5rem)] leading-snug text-muted">
    A desktop editor with nine phases of the course inside it. Install it, open it, and the first judged
    verdict is minutes away: no account, no browser tab, no second surface to choose between.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
    <Plate crosshair>
      <h2 class="display text-[clamp(1.3rem,2.4vw,1.9rem)] text-ink">Get the app</h2>

      {#if available}
        <p class="mt-4 max-w-[46ch] text-[14.5px] leading-relaxed text-muted">
          One installer, the nine free phases bundled. Pick the build for your operating system on the
          download page. The download is free and needs no account.
        </p>
        <div class="mt-7">
          <ActionLink href={downloadUrl} external island>Download the IDE</ActionLink>
        </div>
      {:else}
        <p class="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
          The desktop build is not published yet. The IDE is the only way to learn, so there is
          nothing to start in the browser instead. Check back for the download rather than a dead
          link.
        </p>
        <div class="mt-7">
          <ActionLink href="/pricing" variant="ghost" island>See pricing while you wait</ActionLink>
        </div>
        <!-- The somewhere to go. The build is not published, so the reader who
             is convinced needs a way to hear when it is. One field, one
             message, and a way out: the launch list. -->
        <div class="mt-8 border-t border-rule pt-6">
          <p class="stamp text-faint">or be told when it ships</p>
          <div class="mt-4">
            <LaunchList />
          </div>
        </div>
        <!-- What a reader can do today, without the build. The curriculum is
             public and complete, and the verifier works on a receipt anybody
             already holds, so neither of them needs the installer. -->
        <div class="mt-8 border-t border-rule pt-6">
          <p class="stamp text-faint">what you can do right now</p>
          <ul class="mt-4 grid gap-3">
            <li class="grid grid-cols-[auto_1fr] gap-4 text-[14px] leading-relaxed text-ink">
              <span class="num pt-0.5 text-[11px] text-accent" aria-hidden="true">01</span>
              <span>
                Read the curriculum. Every shipped phase is listed by name, and the list is the same
                manifest the IDE ships.
              </span>
            </li>
            <li class="grid grid-cols-[auto_1fr] gap-4 text-[14px] leading-relaxed text-ink">
              <span class="num pt-0.5 text-[11px] text-accent" aria-hidden="true">02</span>
              <span>
                Check a receipt. If you have one, you can re-derive it here without an account.
              </span>
            </li>
          </ul>
          <div class="mt-5 flex flex-wrap items-center gap-3">
            <ActionLink href="/#courses" variant="quiet" size="sm">Read the curriculum</ActionLink>
            <ActionLink href="/verify" variant="quiet" size="sm">Open the verifier</ActionLink>
          </div>
        </div>
      {/if}

      <ol class="mt-10 grid gap-3 border-t border-rule pt-6">
        {#each STEPS as step (step.n)}
          <li class="flex gap-4 text-[14px] leading-relaxed text-ink">
            <span class="num shrink-0 text-[11px] text-accent">{step.n}</span>
            <span>{step.text}</span>
          </li>
        {/each}
      </ol>
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">what is free</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">The download is free.</span> No account and no payment to get the
            app.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">The first loop is bundled.</span> It works offline, with no
            account, straight after install.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Later phases are fetched per entitlement.</span> They are loaded
            for the account signed in and are never written to disk. Assessment itself stays free.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">build status</p>
        <p class="num mt-4 text-[13px] text-ink">
          {available ? "hosted · linked" : "not published"}
        </p>
        <p class="mt-2 text-[12.5px] leading-snug text-faint">
          One switch decides this: <code class="num text-ink">PUBLIC_IDE_DOWNLOAD_URL</code>.
        </p>
      </Plate>
    </div>
  </div>

  <div class="mt-16">
    <SectionHead
      title="This page is a stub until an installer exists."
      caption="We set one environment variable when a real build is hosted, and this page turns into a link. Until then it says so, because a download button that goes nowhere costs you more time than it saves."
    />
  </div>
</div>
