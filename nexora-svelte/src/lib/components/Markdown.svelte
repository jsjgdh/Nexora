<script lang="ts" module>
  /* Minimal markdown subset for authored lesson content:
     #### headings, **bold**, `code`, fenced code blocks, - / 1. lists. */

  type Block =
    | { type: "p"; text: string }
    | { type: "h"; text: string }
    | { type: "code"; text: string }
    | { type: "ul"; items: string[] }
    | { type: "ol"; items: string[] };

  function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inlineHtml(text: string): string {
    return esc(text).replace(/(`[^`]+`|\*\*[^*]+\*\*)/g, (tok) => {
      if (tok.startsWith("`")) return `<code>${tok.slice(1, -1)}</code>`;
      return `<strong>${tok.slice(2, -2)}</strong>`;
    });
  }

  function parseBlocks(text: string): Block[] {
    const lines = text.split("\n");
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().startsWith("```")) {
        const buf: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        blocks.push({ type: "code", text: buf.join("\n") });
        continue;
      }
      if (/^#{1,4}\s/.test(line.trim())) {
        blocks.push({ type: "h", text: line.trim().replace(/^#{1,4}\s+/, "") });
        i++;
        continue;
      }
      if (/^\s*-\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*-\s+/, ""));
          i++;
        }
        blocks.push({ type: "ul", items });
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          i++;
        }
        blocks.push({ type: "ol", items });
        continue;
      }
      if (line.trim() === "") {
        i++;
        continue;
      }
      const buf: string[] = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].trim().startsWith("```") &&
        !/^#{1,4}\s/.test(lines[i].trim()) &&
        !/^\s*-\s+/.test(lines[i]) &&
        !/^\s*\d+[.)]\s+/.test(lines[i])
      ) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ type: "p", text: buf.join("\n") });
    }
    return blocks;
  }
</script>

<script lang="ts">
  let { text }: { text: string } = $props();
  const blocks = $derived(parseBlocks(text));
</script>

<div class="prose-nexora text-[15px]">
  {#each blocks as b}
    {#if b.type === "h"}
      <h4>{@html inlineHtml(b.text)}</h4>
    {:else if b.type === "code"}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable code lets keyboard users scroll horizontally -->
      <pre
        class="nice-scroll mb-3 overflow-x-auto border border-rule bg-raised p-3 font-mono text-[13px] leading-relaxed text-ink"
        tabindex="0"
      ><code>{b.text}</code></pre>
    {:else if b.type === "ul"}
      <ul>
        {#each b.items as it}
          <li>{@html inlineHtml(it)}</li>
        {/each}
      </ul>
    {:else if b.type === "ol"}
      <ol>
        {#each b.items as it}
          <li>{@html inlineHtml(it)}</li>
        {/each}
      </ol>
    {:else}
      <p>{@html inlineHtml(b.text)}</p>
    {/if}
  {/each}
</div>
