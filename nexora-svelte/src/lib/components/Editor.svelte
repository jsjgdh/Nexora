<script lang="ts" module>
  /* HTML syntax highlighting as an HTML string (trusted output: the
     learner's own code, always escaped first). */

  function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlightTag(tag: string): string {
    // Sentinel chars built at runtime (never typed literally): they mark
    // attribute names so highlighting never fires inside string literals
    // or ordinary whitespace.
    const S0 = String.fromCharCode(0);
    const S1 = String.fromCharCode(1);
    let out = "";
    const chunks = tag.split(/("[^"]*"|'[^']*')/g);
    chunks.forEach((chunk) => {
      if (chunk === "") return;
      if (/^["']/.test(chunk)) {
        out += `<span class="text-warning">${chunk}</span>`;
        return;
      }
      const m = chunk.match(/^(<\/?)([a-zA-Z][a-zA-Z0-9-]*)?([\s\S]*)$/);
      if (!m) {
        out += `<span>${chunk}</span>`;
        return;
      }
      const bracket = m[1];
      const name = m[2];
      const rest = m[3];
      out += `<span class="text-muted">${bracket}</span>`;
      if (name) out += `<span class="text-error">${name}</span>`;
      if (rest) {
        const marked = rest.replace(/([a-zA-Z-]+)(=)/g, S0 + "$1" + S1 + "$2");
        const parts = marked.split(new RegExp("(" + S0 + "[a-zA-Z-]+" + S1 + ")", "g"));
        for (const seg of parts) {
          if (seg.charAt(0) === S0) {
            out += `<span class="text-mint">${seg.split(S0).join("").split(S1).join("")}</span>`;
          } else if (seg) {
            out += `<span class="text-muted">${seg}</span>`;
          }
        }
      }
    });
    return out;
  }

  function highlightHtml(code: string): string {
    let out = "";
    const parts = esc(code).split(/(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z!][^<>]*>?)/g);
    for (const part of parts) {
      if (part === "") continue;
      if (part.startsWith("<!--")) {
        out += `<span class="text-muted/70 italic">${part}</span>`;
      } else if (/^<!DOCTYPE/i.test(part)) {
        out += `<span class="text-warning">${part}</span>`;
      } else if (part.startsWith("<")) {
        out += `<span>${highlightTag(part)}</span>`;
      } else {
        out += `<span class="text-ink">${part}</span>`;
      }
    }
    out += "<span> </span>";
    return out;
  }
</script>

<script lang="ts">
  let {
    value,
    onChange,
    fileName,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    fileName: string;
    label: string;
  } = $props();

  let ta: HTMLTextAreaElement | null = $state(null);
  let pre: HTMLPreElement | null = $state(null);
  let gutter: HTMLDivElement | null = $state(null);

  const lines = $derived(value.split("\n").length);
  const highlighted = $derived(highlightHtml(value));

  function syncScroll() {
    if (!ta) return;
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (gutter) gutter.scrollTop = ta.scrollTop;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Tab" && ta) {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      onChange(value.slice(0, start) + "  " + value.slice(end));
      requestAnimationFrame(() => {
        if (ta) ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#0c1218]">
  <div class="flex items-center gap-2 border-b border-line bg-elevated px-3 py-1.5">
    <span aria-hidden="true" class="flex gap-1.5">
      <span class="h-2.5 w-2.5 rounded-full bg-line"></span>
      <span class="h-2.5 w-2.5 rounded-full bg-line"></span>
      <span class="h-2.5 w-2.5 rounded-full bg-line"></span>
    </span>
    <span class="font-mono text-xs text-muted">{fileName}</span>
    <span class="ml-auto font-mono text-[11px] text-muted/70">HTML</span>
  </div>
  <div class="relative min-h-0 flex-1">
    <label for="mission-code" class="sr-only">{label}</label>
    <div
      bind:this={gutter}
      aria-hidden="true"
      class="nice-scroll pointer-events-none absolute inset-y-0 left-0 z-10 w-11 overflow-hidden border-r border-line bg-[#0c1218] pt-3 text-right font-mono text-xs leading-[1.7] text-muted/60 select-none"
    >
      {#each Array.from({ length: lines }, (_, i) => i + 1) as n}
        <div class="pr-2">{n}</div>
      {/each}
    </div>
    <pre
      bind:this={pre}
      aria-hidden="true"
      class="nice-scroll pointer-events-none absolute inset-0 overflow-hidden pl-[52px] pr-4 pt-3 font-mono text-[13px] leading-[1.7] whitespace-pre"
    ><code>{@html highlighted}</code></pre>
    <textarea
      bind:this={ta}
      id="mission-code"
      value={value}
      oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      onscroll={syncScroll}
      onkeydown={onKeydown}
      spellcheck={false}
      autocapitalize="off"
      autocomplete="off"
      wrap="off"
      class="code-field nice-scroll absolute inset-0 z-20 resize-none overflow-auto bg-transparent pl-[52px] pr-4 pt-3 font-mono text-[13px] leading-[1.7] whitespace-pre text-transparent"
    ></textarea>
  </div>
</div>
