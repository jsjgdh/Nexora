<script lang="ts">
  /* The receipt: the product's own output, printed.
   *
   * This is the only object in the build allowed to use the paper surface at
   * full strength. Everything else is the dark room and a hairline, so the eye
   * has exactly one place to land — which is the whole argument of the design:
   * the thing worth looking at is the thing that proves the work.
   *
   * Two details are load-bearing rather than decorative. The label says this is
   * an example and not a credential, because a real-looking receipt a visitor
   * could mistake for their own would be a claim no build currently backs. And
   * the verdict is written as a word — `OK` / `NOT OK` — before it is written
   * as an ink, so the mark never depends on the colour to be read. */

  type Row = { key: string; value: string };

  let {
    label,
    serial,
    rows,
    passed,
  }: {
    label: string;
    serial: string;
    rows: readonly Row[];
    passed: boolean;
  } = $props();
</script>

<div class="receipt relative px-5 pt-5 pb-4">
  <div class="flex items-baseline justify-between gap-3">
    <p class="stamp text-[10.5px] tracking-[0.16em] uppercase paper-faint">run receipt</p>
    <p class="stamp text-[10.5px] paper-faint">{serial}</p>
  </div>

  <div class="paper-rule my-3 border-t border-dashed"></div>

  <dl class="m-0 grid gap-[3px]">
    {#each rows as row (row.key)}
      <div class="flex items-baseline justify-between gap-4">
        <dt class="stamp text-[11px] paper-faint">{row.key}</dt>
        <dd class="m-0 font-mono text-[11.5px] paper-ink">{row.value}</dd>
      </div>
    {/each}
  </dl>

  <div class="paper-rule my-3 border-t border-dashed"></div>

  <div class="flex items-center justify-between gap-3">
    <p class="stamp text-[10.5px] paper-faint">
      {passed ? "signed · ed25519 · re-derivable at /verify" : "no verdict yet, the check has not run"}
    </p>
    <span class="verdict" data-passed={passed}>
      {passed ? "OK" : "NOT OK"}
    </span>
  </div>

  <p class="stamp mt-3 text-[10px] paper-faint">{label}</p>
</div>

<style>
  /* The paper's own inks. The amber lamp is unreadable on a light surface, so
     the verdict uses the two inks that belong to paper: the green that passes
     it and the red pen that marks it. */
  .paper-ink {
    color: var(--color-paper-ink);
  }
  .paper-faint {
    color: var(--color-paper-muted);
  }
  .paper-rule {
    border-color: color-mix(in srgb, var(--color-paper-ink) 22%, transparent);
  }
  .verdict {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    padding: 2px 8px;
    border: 1.5px solid currentColor;
    transform: rotate(-2.5deg);
  }
  .verdict[data-passed="true"] {
    color: var(--color-pass);
  }
  .verdict[data-passed="false"] {
    color: var(--color-pen);
  }
</style>
