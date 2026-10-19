<script lang="ts">
  /* A transcript, not app chrome.
   *
   * There is deliberately no window: no title bar, no traffic lights, no
   * rounded frame pretending to be a desktop. Re-drawing a window the visitor
   * is not looking at is the cheapest way to look like every other developer
   * landing page, so this is a printed record instead — a label bar, a rule,
   * and the lines themselves.
   *
   * Every line is in the DOM from the first byte. `visible` moves a line from
   * opacity 0 to opacity 1, which means the transcript a crawler indexes, the
   * transcript a no-JavaScript visitor reads, and the transcript a screen
   * reader finds are all the complete one. The animation is a property of an
   * already-correct document. */

  type Line = { kind: string; text: string };

  let { lines, visible }: { lines: readonly Line[]; visible: number } = $props();

  const marks: Record<string, string> = {
    cmd: "$ ",
    fail: "✗ ",
    ok: "✓ ",
    note: "",
  };
</script>

<div class="plate overflow-hidden">
  <p class="stamp flex items-center gap-2 border-b border-rule bg-raised-2 px-4 py-2 text-faint">
    <span class="lamp text-accent" data-on="true" aria-hidden="true"></span>
    transcript
  </p>
  <!-- The transcript wraps rather than scrolls. A horizontally scrolling
       block is a scrollable region, and a scrollable region a keyboard cannot
       reach is a region a keyboard user cannot read — so the lines are folded
       instead. The leading indentation of a transcript is whitespace, and
       `pre-wrap` keeps it. -->
  <pre
    class="m-0 px-4 py-4 font-mono text-[12.5px] leading-[1.85] [overflow-wrap:anywhere] whitespace-pre-wrap"><code
      >{#each lines as line, i (i)}<span
        class="term-line block"
        data-on={i < visible}
        data-kind={line.kind}
        >{marks[line.kind] ?? ""}{line.text}</span
      >{/each}</code></pre>
</div>

<style>
  .term-line {
    opacity: 0;
    transition: opacity 140ms steps(1, end);
    /* A hanging indent, so a line that wraps on a narrow screen reads as a
       continuation of the line above it rather than as a new one. */
    padding-left: 1.75em;
    text-indent: -1.75em;
  }
  .term-line[data-on="true"] {
    opacity: 1;
  }
  .term-line[data-kind="cmd"] {
    color: var(--color-ink);
  }
  .term-line[data-kind="fail"] {
    color: var(--color-removed);
  }
  .term-line[data-kind="ok"] {
    color: var(--color-added);
  }
  .term-line[data-kind="note"] {
    color: var(--color-faint);
  }
</style>
