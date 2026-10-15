<script lang="ts">
  import { inView, reduced } from "$lib/motion";
  import { RUN_SCRIPT, RECEIPT } from "$lib/content/site";
  import Terminal from "./Terminal.svelte";
  import Receipt from "./Receipt.svelte";
  import Button from "./Button.svelte";

  /* The signature moment: a run, its failure, its reason, and its receipt.
   *
   * The sequence is short on purpose. A check fails, the transcript says why,
   * the same check passes once the cause is fixed, and the receipt stamps. It
   * is the product in seven lines — and it is the honest version of the
   * "interactive hero" every developer landing page has, because it
   * demonstrates the differentiator (a verdict with a reason, attached to a
   * receipt) instead of decorating a claim about it.
   *
   * Accessibility is the reason for the shape of the state below:
   *
   *   - The rendered default is the *finished* state: the whole transcript and
   *     a stamped receipt. If JavaScript never runs, if a crawler reads the
   *     page, or if `prefers-reduced-motion` is set, that is what is served.
   *     The animation only ever subtracts what it is about to add back.
   *   - The replay control is a real button with a real label, so the moment is
   *     reproducible without a hover and without a pointer.
   *   - The transcript is never emptied, only faded: every line stays in the
   *     accessibility tree throughout, and no line is announced as a live
   *     region, so a screen reader is not interrupted seven times by a
   *     decoration. */

  // `RUN_SCRIPT` is a const tuple, so its length is a literal type; the counter
  // is explicitly a number because it also has to hold 0.
  let shown = $state<number>(RUN_SCRIPT.length);
  let passed = $state(true);
  let playing = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function play(step: number): void {
    stop();
    if (step >= RUN_SCRIPT.length) {
      shown = RUN_SCRIPT.length;
      passed = true;
      playing = false;
      return;
    }
    shown = step + 1;
    // The first line lands after a beat; the rest keep a transcript's rhythm.
    timer = setTimeout(() => play(step + 1), step === 0 ? 620 : 330);
  }

  function start(): void {
    passed = false;
    playing = true;
    shown = 0;
    play(0);
  }

  function replay(): void {
    // With reduced motion there is nothing to replay, so the control settles
    // the artifact instead of animating it.
    if (reduced()) {
      stop();
      shown = RUN_SCRIPT.length;
      passed = true;
      playing = false;
      return;
    }
    start();
  }

  function finish(): void {
    stop();
    shown = RUN_SCRIPT.length;
    passed = true;
    playing = false;
  }
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]" use:inView={{ onShown: start }}>
  <div class="min-w-0">
    <Terminal lines={RUN_SCRIPT} visible={shown} />
    <div class="mt-4 flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" busy={playing} onclick={replay}>
        {playing ? "Running…" : "Run it again"}
      </Button>
      <!-- A text-styled control, not a text link: it ends the run, so it gets a
           44px box like every other control. The underline lives on the span
           because text-decoration does not survive a flex container reliably,
           and the box stays transparent so the control still reads as a line of
           small print rather than as a second button. -->
      <button
        type="button"
        class="stamp inline-flex min-h-[44px] cursor-pointer items-center border-0 bg-transparent px-0 text-[11px] text-faint hover:text-ink"
        onclick={finish}
      >
        <span class="underline underline-offset-4">Skip to the verdict</span>
      </button>
    </div>
  </div>

  <div class="min-w-0">
    {#key passed}
      <div class={passed ? "stamp-land" : ""}>
        <Receipt
          label={RECEIPT.label}
          serial={RECEIPT.serial}
          rows={RECEIPT.rows}
          {passed}
        />
      </div>
    {/key}
    <p class="mt-3 text-[12.5px] leading-relaxed text-faint">
      A failing check is the normal case. It comes back with the reason, never a
      score, and the run that passes leaves a receipt anyone can re-derive.
    </p>
  </div>
</div>
