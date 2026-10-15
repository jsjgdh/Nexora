<script lang="ts">
  import Button from "./Button.svelte";
  import { reduced } from "$lib/motion";

  /* The device-code handshake, shown rather than described.
   *
   * The IDE never asks for a password: it prints a short code and opens this
   * site, the learner signs in here and approves that code, and the IDE signs
   * in by itself. That is the whole of step two and it is hard to believe in
   * prose, so this section performs it — two panes, the code the IDE shows,
   * and one button that approves it on this side. Nothing about the demo is
   * invented: it is the same state machine the real page runs, with a fixed
   * code instead of a minted one.
   *
   * The code is a word, not noise: `KQ7M-WH3` is a real face of the format the
   * IDE prints. `approved` is the only state that changes; the panes swap
   * their contents so a sighted visitor sees the handshake complete, and the
   * status line carries the same news to a screen reader through `aria-live`.
   */

  const CODE = "KQ7M-WH3";

  let approved = $state(false);
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function approve(): void {
    if (busy || approved) return;
    busy = true;
    timer = setTimeout(
      () => {
        approved = true;
        busy = false;
      },
      reduced() ? 0 : 520
    );
  }

  function reset(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    approved = false;
    busy = false;
  }

  $effect(() => () => {
    if (timer !== null) clearTimeout(timer);
  });
</script>

<div class="grid gap-px border border-rule bg-rule sm:grid-cols-2">
  <!-- The IDE's half: what the learner sees in the editor. -->
  <div class="bg-panel p-6 sm:p-8">
    <p class="stamp text-faint">the IDE, on your machine</p>

    <div class="mt-5 bg-ink px-5 py-6 text-center">
      <p class="stamp text-paper-2">sign in with this code</p>
      <p class="num mt-3 text-[clamp(1.6rem,4vw,2.4rem)] leading-none font-bold tracking-[0.14em] text-paper-2">
        {CODE}
      </p>
    </div>

    <div class="mt-5 min-h-[3.5rem]" aria-live="polite">
      {#if approved}
        <p class="flex items-center gap-2.5 text-[15px] font-semibold text-added">
          <span aria-hidden="true">✓</span> Signed in — your tier is loading
        </p>
        <p class="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          The phases your plan opens are appearing in the editor. Nothing was pasted and nothing was
          mistyped.
        </p>
      {:else}
        <p class="flex items-center gap-2.5 text-[14.5px] text-muted">
          <span class="caret num text-accent" aria-hidden="true">▌</span>
          Waiting for approval…
        </p>
      {/if}
    </div>
  </div>

  <!-- The browser's half: what happens on this site. -->
  <div class="bg-panel p-6 sm:p-8">
    <p class="stamp text-faint">this site, in the browser</p>

    <div class="mt-5 min-h-[6.5rem]">
      {#if approved}
        <p class="text-[16px] font-semibold text-ink">Approved.</p>
        <p class="mt-2 max-w-[40ch] text-[13.5px] leading-relaxed text-muted">
          Go back to the IDE — it is already signed in. You can close this tab.
        </p>
      {:else}
        <p class="max-w-[42ch] text-[14.5px] leading-relaxed text-ink">
          An IDE is asking to sign in with code
          <span class="num font-semibold">{CODE}</span>. Is that the code on your screen?
        </p>
      {/if}
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      {#if approved}
        <Button variant="ghost" size="sm" onclick={reset}>Run it again</Button>
      {:else}
        <Button size="sm" busy={busy} onclick={approve}>
          {busy ? "Approving…" : "Approve this code"}
        </Button>
      {/if}
    </div>
  </div>
</div>
