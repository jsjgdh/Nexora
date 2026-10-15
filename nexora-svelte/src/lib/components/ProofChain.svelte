<script lang="ts">
  import { scrub } from "$lib/motion";

  /* The chain, scrubbed against the scroll.
   *
   * Five links: you build, the IDE runs it, the checks judge it, a receipt is
   * signed, and a stranger re-derives it. The connector fills as the section
   * travels, and each link lights when the fill passes it, so the reader's own
   * scrolling is what moves the argument along — the one place on this page
   * where motion carries meaning rather than decorating it.
   *
   * The meaning does not live in the animation. It lives in the ordered list,
   * which is real content in reading order and is complete with the script
   * switched off; the travelling rule is a decorative overlay on top of it and
   * is `aria-hidden`. Under reduced motion the fill sits still and every link
   * is lit, because the states are facts and only the travel was optional.
   *
   * The fill position is written straight to a custom property — one element's
   * `width`, sixty times a second, with no render — while the lit count is
   * Svelte state that changes at four thresholds in the whole scroll. That
   * split is deliberate: the per-frame work is not allowed to become
   * per-frame rendering. */

  const LINKS = [
    { n: "01", title: "You build it", sub: "in a real editor, with your own files" },
    { n: "02", title: "The IDE runs it", sub: "the command is executed, not imagined" },
    { n: "03", title: "A rule engine judges", sub: "declarative checks, no model in the path" },
    { n: "04", title: "A receipt is signed", sub: "bound to the hash of the file it judged" },
    { n: "05", title: "A stranger re-derives it", sub: "at /verify, with no account" },
  ] as const;

  /** How many links the travelling rule has passed. Explicitly a number:
      `LINKS.length` is a literal type, and this counter also has to hold 1. */
  let reached = $state<number>(LINKS.length);

  let root: HTMLDivElement | null = $state(null);

  function progress(p: number): void {
    if (root) root.style.setProperty("--chain", p.toFixed(3));
    const lit = Math.min(LINKS.length, Math.floor(p * (LINKS.length - 1) + 1e-6) + 1);
    if (lit !== reached) reached = lit;
  }
</script>

<div class="chain" bind:this={root} use:scrub={{ onProgress: progress }}>
  <div class="chain-rule" aria-hidden="true">
    <div class="chain-fill"></div>
  </div>

  <ol class="chain-list">
    {#each LINKS as link, i (link.n)}
      <li class="chain-link" class:on={i < reached}>
        <span class="chain-node num" aria-hidden="true">{link.n}</span>
        <span class="chain-title">{link.title}</span>
        <span class="chain-sub">{link.sub}</span>
      </li>
    {/each}
  </ol>
</div>

<style>
  .chain {
    display: grid;
    gap: var(--space-6);
  }
  .chain-rule {
    position: relative;
    height: 1px;
    background: var(--color-rule);
  }
  .chain-fill {
    height: 1px;
    width: calc(var(--chain, 0) * 100%);
    background: var(--color-accent);
  }
  .chain-list {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @media (max-width: 900px) {
    .chain-list {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-5);
    }
  }
  .chain-link {
    display: grid;
    gap: var(--space-1);
    align-content: start;
    border-top: 1px solid var(--color-rule);
    padding-top: var(--space-3);
  }
  .chain-node {
    font-size: 11px;
    color: var(--color-faint);
    transition: color 300ms var(--ease-out);
  }
  .chain-link.on .chain-node {
    color: var(--color-accent);
  }
  .chain-title {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--color-faint);
    transition: color 300ms var(--ease-out);
  }
  .chain-link.on .chain-title {
    color: var(--color-ink);
  }
  .chain-sub {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-faint);
    max-width: 26ch;
  }
</style>
