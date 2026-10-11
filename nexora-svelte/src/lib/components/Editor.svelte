<script lang="ts" module>
  /* HTML syntax highlighting as an HTML string (trusted output: the
     learner's own code, always escaped first).

     Syntax hues deliberately avoid the state channels: red and green belong to
     the review layer and must never mean "this is a tag". Structure is ink and
     faint, attributes are accent, values are approved, comments are muted. */

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
        out += `<span class="text-approved">${chunk}</span>`;
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
      out += `<span class="text-faint">${bracket}</span>`;
      if (name) out += `<span class="text-ink">${name}</span>`;
      if (rest) {
        const marked = rest.replace(/([a-zA-Z-]+)(=)/g, S0 + "$1" + S1 + "$2");
        const parts = marked.split(new RegExp("(" + S0 + "[a-zA-Z-]+" + S1 + ")", "g"));
        for (const seg of parts) {
          if (seg.charAt(0) === S0) {
            out += `<span class="text-accent">${seg.split(S0).join("").split(S1).join("")}</span>`;
          } else if (seg) {
            out += `<span class="text-ink">${seg}</span>`;
          }
        }
      }
    });
    return out;
  }

  /* ---------- Go and JavaScript ----------
     A real tokenizer, not a chain of regex replacements: chained passes can
     match inside the spans they just built, which is how highlighters corrupt
     their own output. Hue follows the same mapping as the HTML highlighter so
     the editor reads as one surface, whatever the language — which is why one
     tokenizer serves both and the language is data, not a second code path.

     JavaScript is close enough to Go to share it: same comment forms, same three
     quote characters, same identifier and number shapes. What differs is the
     word lists, and those are the arguments. */

  const JS_KEYWORDS = new Set([
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
    "for", "function", "if", "import", "in", "instanceof", "let", "new", "of",
    "return", "static", "super", "switch", "this", "throw", "try", "typeof", "var",
    "void", "while", "with", "yield",
  ]);
  const JS_BUILTINS = new Set([
    "Array", "Boolean", "BigInt", "JSON", "Map", "Math", "Number", "Object",
    "Promise", "Set", "String", "Symbol", "console", "document", "exports",
    "false", "globalThis", "module", "null", "require", "true", "undefined",
    "window",
  ]);

  const GO_KEYWORDS = new Set([
    "break", "case", "chan", "const", "continue", "default", "defer", "else",
    "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
    "map", "nil", "package", "range", "return", "select", "struct", "switch",
    "type", "var",
  ]);
  const GO_BUILTINS = new Set([
    "any", "append", "bool", "byte", "cap", "close", "complex", "copy", "delete",
    "error", "false", "float32", "float64", "int", "int32", "int64", "len", "make",
    "new", "panic", "print", "println", "recover", "rune", "string", "true", "uint",
    "uint64",
  ]);

  function highlightCode(code: string, keywords: Set<string>, builtins: Set<string>): string {
    let out = "";
    let i = 0;
    const n = code.length;
    const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
    const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
    const span = (cls: string, text: string) =>
      cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text);

    while (i < n) {
      const c = code[i]!;
      const two = code.slice(i, i + 2);

      if (two === "//") {
        const j = code.indexOf("\n", i);
        const end = j === -1 ? n : j;
        out += span("text-faint italic", code.slice(i, end));
        i = end;
        continue;
      }
      if (two === "/*") {
        const j = code.indexOf("*/", i + 2);
        const end = j === -1 ? n : j + 2;
        out += span("text-faint italic", code.slice(i, end));
        i = end;
        continue;
      }
      if (c === '"' || c === "`" || c === "'") {
        const quote = c;
        let j = i + 1;
        while (j < n) {
          if (quote !== "`" && code[j] === "\\") j += 2;
          else if (code[j] === quote) {
            j += 1;
            break;
          } else if (quote !== "`" && code[j] === "\n") break;
          else j += 1;
        }
        out += span("text-review", code.slice(i, Math.min(j, n)));
        i = j;
        continue;
      }
      if (/[0-9]/.test(c) && !isId(code[i - 1] ?? " ")) {
        let j = i;
        while (j < n && /[0-9._xXa-fA-F]/.test(code[j]!)) j += 1;
        out += span("text-accent", code.slice(i, j));
        i = j;
        continue;
      }
      if (isIdStart(c)) {
        let j = i;
        while (j < n && isId(code[j]!)) j += 1;
        const word = code.slice(i, j);
        out += span(
          keywords.has(word) ? "text-removed" : builtins.has(word) ? "text-accent" : "",
          word
        );
        i = j;
        continue;
      }
      out += esc(c);
      i += 1;
    }
    return out;
  }

  function highlightGo(code: string): string {
    return highlightCode(code, GO_KEYWORDS, GO_BUILTINS);
  }

  function highlightJs(code: string): string {
    return highlightCode(code, JS_KEYWORDS, JS_BUILTINS);
  }

  function highlightHtml(code: string): string {
    let out = "";
    const parts = esc(code).split(/(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z!][^<>]*>?)/g);
    for (const part of parts) {
      if (part === "") continue;
      if (part.startsWith("<!--")) {
        out += `<span class="text-muted italic">${part}</span>`;
      } else if (/^<!DOCTYPE/i.test(part)) {
        out += `<span class="text-muted">${part}</span>`;
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
    language = "html",
    diagnostics = [],
    readonly = false,
  }: {
    value: string;
    onChange: (v: string) => void;
    fileName: string;
    label: string;
    language?: "html" | "go" | "node";
    diagnostics?: { line: number | null; message: string }[];
    readonly?: boolean;
  } = $props();

  let ta: HTMLTextAreaElement | null = $state(null);
  let pre: HTMLPreElement | null = $state(null);
  let gutter: HTMLDivElement | null = $state(null);

  const lines = $derived(value.split("\n").length);
  const diagnosticsByLine = $derived.by(() => {
    const grouped = new Map<number, string[]>();
    for (const diagnostic of diagnostics) {
      if (diagnostic.line === null || diagnostic.line < 1 || diagnostic.line > lines) continue;
      const messages = grouped.get(diagnostic.line) ?? [];
      messages.push(diagnostic.message);
      grouped.set(diagnostic.line, messages);
    }
    return grouped;
  });
  const highlighted = $derived(
    language === "go" ? highlightGo(value) : language === "node" ? highlightJs(value) : highlightHtml(value)
  );

  function syncScroll() {
    if (!ta) return;
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (gutter) gutter.scrollTop = ta.scrollTop;
  }

  function onKeydown(e: KeyboardEvent) {
    if (readonly) return;
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

<div class="flex min-h-0 flex-1 flex-col overflow-hidden border border-rule bg-panel">
  <div class="flex items-center gap-2 border-b border-rule bg-raised px-2.5 py-1">
    <span class="stamp text-faint">file</span>
    <span class="num text-[12px] text-ink">{fileName}</span>
    <span class="stamp ml-auto text-faint">{language}</span>
    {#if readonly}<span class="stamp text-faint">read-only fixture</span>{/if}
  </div>
  <div class="relative min-h-0 flex-1">
    <label for="mission-code" class="sr-only">{label}</label>
    <div
      bind:this={gutter}
      aria-hidden="true"
      class="nice-scroll num pointer-events-none absolute inset-y-0 left-0 z-10 w-11 overflow-hidden border-r border-rule bg-raised pt-3 text-right text-[11px] leading-[1.7] text-faint select-none"
    >
      {#each Array.from({ length: lines }, (_, i) => i + 1) as n}
        {@const messages = diagnosticsByLine.get(n)}
        <div
          class="relative pr-2"
          class:text-removed={!!messages}
          title={messages?.join("; ")}
        >
          {#if messages}
            <span class="absolute left-1 top-1/2 -translate-y-1/2 text-[10px]" aria-hidden="true">●</span>
          {/if}
          {n}
        </div>
      {/each}
    </div>
    <pre
      bind:this={pre}
      aria-hidden="true"
      class="nice-scroll pointer-events-none absolute inset-0 overflow-hidden pl-[52px] pr-4 pt-3 font-mono text-[13px] leading-[1.7] whitespace-pre"
    ><code>{@html highlighted}</code></pre>
    <textarea
      bind:this={ta}
      readonly={readonly}
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
