<script lang="ts">
  /* A transcript, not app chrome.
   *
   * There is deliberately no window: no title bar, no traffic lights, no
   * rounded frame pretending to be a desktop. Re-drawing a window the visitor
   * is not looking at is the cheapest way to look like every other developer
   * landing page, so this is a printed record instead — a label, a rule, and
   * the lines themselves.
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
  <p class="stamp border-b border-rule px-4 py-2 text-faint">transcript</p>
  <pre class="nice-scroll m-0 overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.85]"><code
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
