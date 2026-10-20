<script lang="ts">
  import type { PageProps } from "./$types";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import LaunchList from "$lib/components/LaunchList.svelte";
  import DeviceCode from "$lib/components/DeviceCode.svelte";
  import ActionLink from "$lib/components/ActionLink.svelte";
  import { STEPS, FREE_PHASE_COUNT, numberWords } from "$lib/content/site";
  import { pageTitle } from "$lib/seo";

  /* The desktop IDE, honestly.
   *
   * The IDE is a real product surface (a VS Code fork), but a downloadable
   * build is advertised only when one actually exists. `PUBLIC_IDE_DOWNLOAD_URL`
   * is the single switch, the server reads it once, and the answer arrives
   * with the page. This page renders that answer rather than reading the
   * environment itself, so the hero, the header, the footer and this page
   * cannot disagree about whether a build exists.
   *
   * Read the same defensive way every other public variable is read here (see
   * `$lib/session.svelte.ts`, `$lib/seo.ts`): absent, empty and whitespace-only
   * all mean "not configured", and an unset variable must never throw. */
  let { data }: PageProps = $props();
  const release = $derived(data.release);
  const available = $derived(release.available);

  /* How many phases ship free, in words, computed from the shipped list.
   *
   * The number is not written down anywhere on this page. It is the one a
   * reader acts on, so it comes from the same place as everything else, and a
   * change to the free tier reaches the sentence by way of the sync. */
  const freeWords = numberWords(FREE_PHASE_COUNT) ?? String(FREE_PHASE_COUNT);
  const freeWordsCapital = freeWords.charAt(0).toUpperCase() + freeWords.slice(1);
</script>

<PageHead
  title={pageTitle("Download")}
  description={`Download the NEXORA IDE, the only way to learn. The ${freeWords} free phases ship inside it and work offline with no account.`}
  path="/download"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["Install the editor.", "The course is already in it."]}
    class="max-w-[30ch] text-[clamp(2.2rem,6.5vw,5rem)] text-ink"
  />
  <p class="reading mt-7 max-w-[52ch] text-[clamp(1.05rem,2vw,1.5rem)] leading-snug text-muted">
    A desktop editor with {freeWords} phases of the course inside it. Install it, open it, and the first judged
    verdict is minutes away: no account, no browser tab, no second surface to choose between.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
    <Plate crosshair>
      <h2 class="display text-[clamp(1.3rem,2.4vw,1.9rem)] text-ink">Get the app</h2>

      {#if available}
        <p class="mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-muted">
          One installer, the {freeWords} free phases bundled. Pick the build for your operating system on the
          download page. The download is free and needs no account.
        </p>
        <div class="mt-7">
          <ActionLink href={release.downloadUrl} external island>{release.label}</ActionLink>
        </div>
      {:else}
        <p class="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-muted">
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
            <li class="grid grid-cols-[auto_1fr] gap-4 text-[15px] leading-relaxed text-ink">
              <span class="num pt-0.5 text-[11px] text-accent" aria-hidden="true">01</span>
              <span>
                Read the curriculum. Every shipped phase is listed by name, and the list is the same
                manifest the IDE ships.
              </span>
            </li>
            <li class="grid grid-cols-[auto_1fr] gap-4 text-[15px] leading-relaxed text-ink">
              <span class="num pt-0.5 text-[11px] text-accent" aria-hidden="true">02</span>
              <span>
                Check a receipt. If you have one, you can re-derive it here without an account.
              </span>
            </li>
          </ul>
          <div class="mt-5 flex flex-wrap items-center gap-3">
            <ActionLink href="/courses" variant="quiet" size="sm">Read the curriculum</ActionLink>
            <ActionLink href="/verify" variant="quiet" size="sm">Open the verifier</ActionLink>
          </div>
        </div>
      {/if}
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">what is free</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">The download is free.</span> No account and no payment to get the
            app.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
            <span class="text-ink">The first loop is bundled.</span> It works offline, with no
            account, straight after install.
          </li>
          <li class="text-[14.5px] leading-relaxed text-muted">
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
        <p class="mt-2 text-[13px] leading-snug text-faint">
          One switch decides this: <code class="num text-ink">PUBLIC_IDE_DOWNLOAD_URL</code>.
        </p>
      </Plate>
    </div>
  </div>
</div>

<!-- = The three steps =====================
     Install, sign in, unlock. The steps live here rather than on the homepage,
     because this is where they are acted on: a reader who has decided to get
     the app wants to know what happens next, and a reader who has not has
     enough to think about already. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <SectionHead
      title="Three steps, and the first one is the whole thing."
      caption="The IDE never asks for your password. It shows a short code, opens this site, and signs itself in once you approve the code here."
      wide
    />

    <ol class="mt-14 border-t-2 border-rule-strong">
      {#each STEPS as step (step.n)}
        <li class="grid gap-5 border-b border-rule-strong py-9 lg:grid-cols-[minmax(0,5rem)_minmax(0,1fr)] lg:gap-10">
          <p class="num pt-1 text-[clamp(1.7rem,3.2vw,2.3rem)] leading-none font-bold text-accent">
            {step.n}
          </p>
          <div class="min-w-0">
            <h3 class="display max-w-[26ch] text-[clamp(1.35rem,2.4vw,1.9rem)] text-ink">
              {step.title}
            </h3>
            <p class="reading mt-3 max-w-[58ch] text-[17px] leading-relaxed text-muted">
              {step.caption}
            </p>

            {#if "points" in step}
              <ul class="mt-6 grid gap-3">
                {#each step.points as point (point)}
                  <li class="grid grid-cols-[auto_1fr] gap-4 text-[16px] leading-relaxed text-ink">
                    <span class="num pt-0.5 text-[11px] text-faint" aria-hidden="true">·</span>
                    <span>{point}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <ol class="mt-6 grid gap-3">
                {#each step.steps as line (line)}
                  <li class="grid grid-cols-[auto_1fr] gap-4 text-[16px] leading-relaxed text-ink">
                    <span class="num pt-0.5 text-[11px] text-faint" aria-hidden="true">·</span>
                    <span>{line}</span>
                  </li>
                {/each}
              </ol>
            {/if}

            {#if step.n === "01"}
              <div class="mt-7">
                <ActionLink href="/download" island>{release.label}</ActionLink>
              </div>
            {:else if "link" in step}
              <div class="mt-7">
                <ActionLink href={step.link.href} variant="ghost">{step.link.label}</ActionLink>
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </div>
</section>

<!-- = The sign-in =====================
     The one piece of chrome a learner has to understand before they can use
     the product, shown rather than described. -->
<section class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-28">
    <div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div class="min-w-0">
        <SectionHead
          title="How the sign-in works."
          caption="The editor has no password field, because a password field in a desktop app is a place for a learner to get stuck. It shows a short code, opens this site, and signs itself in once you approve the code here."
        />
        <div class="mt-8">
          <ActionLink href="/auth/ide" variant="ghost" island>Read the sign-in page</ActionLink>
        </div>
      </div>
      <div class="min-w-0">
        <DeviceCode />
      </div>
    </div>
  </div>
</section>
