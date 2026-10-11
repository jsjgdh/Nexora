"use client";

import React from "react";

/* Minimal markdown subset for authored lesson content:
   #### headings, **bold**, `code`, fenced code blocks, - / 1. lists. */

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="prose-nexora text-[15px]">
      {blocks.map((b, i) => {
        if (b.type === "h") return <h4 key={i}>{inline(b.text)}</h4>;
        if (b.type === "code")
          return (
            <pre
              key={i}
              className="mb-3 overflow-x-auto rounded-lg border border-line bg-[#0c1218] p-3 font-mono text-[13px] leading-relaxed text-ink nice-scroll"
            >
              <code>{b.text}</code>
            </pre>
          );
        if (b.type === "ul")
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ol>
          );
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "code"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

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

function inline(text: string): React.ReactNode[] {
  // `code` first, then **bold**
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(
        <code key={k++}>{tok.slice(1, -1)}</code>
      );
    } else {
      parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
