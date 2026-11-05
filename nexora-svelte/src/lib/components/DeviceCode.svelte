<script lang="ts">
  import Button from "./Button.svelte";
  import Check from "./Check.svelte";
  import { reduced } from "$lib/motion";

  /* The device-code handshake, shown rather than described.
   *
   * The IDE never asks for a password: it prints a short code and opens this
   * site, the learner signs in here and approves that code, and the IDE signs
   * in by itself. That is the whole of step two and it is hard to believe in
   * prose, so this section performs it: two panes, the code the IDE shows, and
   * one button that approves it on this side. Nothing about the demo is
   * invented: it is the same state machine the real page runs, with a fixed
   * code instead of a minted one.
   *
   * The browser half asks the question the real page asks: is that the code on
   * your screen? A code that arrives in a query string can be planted by anyone
   * who can get a link in front of a reader, so the reader confirms it against
   * the editor before it is approved. The demo asks it too, because a demo that
   * flatters the product is not a demo. */

  const CODE = "KQ7M-XR42";

  let approved = $state(false);
  let agreed = $state(false);
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function approve(): void {
    if (busy || approved || !agreed) return;
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
    agreed = false;
    busy = false;
  }

  $effect(() => () => {
    if (timer !== null) clearTimeout(timer);
  });
</script>

<div class="device card">
  <div class="pane">
    <p class="stamp pane-label">The IDE, on your machine</p>

    <div class="code-screen">
      <p class="stamp code-label">Sign in with this code</p>
      <p class="code num">{CODE}</p>
    </div>

    <div class="state" aria-live="polite">
      {#if approved}
        <p class="state-title pass">
          <span class="lamp" data-on="true" aria-hidden="true"></span>
          Signed in, your tier is loading
        </p>
        <p class="state-body">
          The phases your plan opens are appearing in the editor. Nothing was pasted and nothing
          was mistyped.
        </p>
      {:else}
        <p class="state-title">
          <span class="caret num" aria-hidden="true">▌</span>
          Waiting for approval
        </p>
      {/if}
    </div>
  </div>

  <div class="pane">
    <p class="stamp pane-label">This site, in the browser</p>

    <div class="question">
      {#if approved}
        <p class="approved-title">Approved.</p>
        <p class="approved-body">
          Go back to the IDE. It is already signed in, and you can close this tab.
        </p>
      {:else}
        <p class="ask">
          An IDE is asking to sign in with code <span class="num code-inline">{CODE}</span>. Is that
          the code on your screen?
        </p>
        <div class="agree">
          <Check
            bind:checked={agreed}
            attrs={{ "data-device-agree": "" }}
          >
            Yes, this is the code on my screen.
          </Check>
        </div>
      {/if}
    </div>

    <div class="device-actions">
      {#if approved}
        <Button variant="ghost" size="sm" onclick={reset}>Run it again</Button>
      {:else}
        <Button size="sm" busy={busy} disabled={!agreed} onclick={approve}>
          {busy ? "Approving" : "Approve this code"}
        </Button>
      {/if}
    </div>
  </div>
</div>

<style>
  .device {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
  }

  @media (min-width: 720px) {
    .device {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    min-width: 0;
  }

  @media (min-width: 640px) {
    .pane {
      padding: var(--space-6);
    }
  }

  .pane + .pane {
    border-top: 1px solid var(--color-rule);
  }

  @media (min-width: 720px) {
    .pane + .pane {
      border-top: 0;
      border-left: 1px solid var(--color-rule);
    }
  }

  .pane-label {
    color: var(--color-faint);
  }

  .code-screen {
    padding: var(--space-5);
    border: 1px solid var(--color-screen-rule);
    border-radius: var(--radius-sm);
    background:
      radial-gradient(80% 100% at 50% 0%, color-mix(in srgb, var(--color-screen-glow) 40%, transparent), transparent 70%),
      var(--color-screen);
    text-align: center;
  }

  .code-label {
    color: var(--color-screen-muted);
  }

  .code {
    margin-top: var(--space-3);
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--color-accent-bright);
  }

  .state {
    min-height: 3.5rem;
  }

  .state-title {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 13px;
    color: var(--color-muted);
  }

  .state-title.pass {
    color: var(--color-pass);
    font-weight: 600;
  }

  .state-body {
    margin-top: var(--space-2);
    font-size: 12px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  .caret {
    color: var(--color-accent);
    animation: caret 1s steps(1, end) infinite;
  }

  @keyframes caret {
    50% {
      opacity: 0;
    }
  }

  .pane + .pane .question {
    min-height: 7rem;
  }

  .ask {
    max-width: 42ch;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--color-ink);
  }

  .code-inline {
    font-weight: 600;
    color: var(--color-ink);
  }

  .agree {
    margin-top: var(--space-4);
    max-width: 42ch;
  }

  .approved-title {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--color-pass);
  }

  .approved-body {
    margin-top: var(--space-2);
    max-width: 40ch;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .device-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: auto;
  }

  .lamp {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1px solid currentColor;
  }

  .lamp[data-on="true"] {
    background: currentColor;
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      animation: none;
      opacity: 1;
    }
  }
</style>
