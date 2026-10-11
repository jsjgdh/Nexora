"use client";

import React, { useMemo, useRef } from "react";

/* Lightweight HTML editor: a transparent textarea over a highlighted <pre>.
   Same font metrics keep the layers aligned; scroll positions stay synced. */

export default function Editor({
  value,
  onChange,
  fileName,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  fileName: string;
  label: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split("\n").length, [value]);
  const highlighted = useMemo(() => highlightHtml(value), [value]);

  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + "  " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#0c1218]">
      <div className="flex items-center gap-2 border-b border-line bg-elevated px-3 py-1.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
        </span>
        <span className="font-mono text-xs text-muted">{fileName}</span>
        <span className="ml-auto font-mono text-[11px] text-muted/70">HTML</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <label htmlFor="mission-code" className="sr-only">
          {label}
        </label>
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="nice-scroll pointer-events-none absolute inset-y-0 left-0 z-10 w-11 overflow-hidden border-r border-line bg-[#0c1218] pt-3 text-right font-mono text-xs leading-[1.7] text-muted/60 select-none"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="pr-2">
              {i + 1}
            </div>
          ))}
        </div>
        <pre
          ref={preRef}
          aria-hidden="true"
          className="nice-scroll pointer-events-none absolute inset-0 overflow-hidden pl-[52px] pr-4 pt-3 font-mono text-[13px] leading-[1.7] whitespace-pre"
        >
          <code>{highlighted}</code>
        </pre>
        <textarea
          ref={taRef}
          id="mission-code"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className="code-field nice-scroll absolute inset-0 z-20 resize-none overflow-auto bg-transparent pl-[52px] pr-4 pt-3 font-mono text-[13px] leading-[1.7] whitespace-pre text-transparent"
        />
      </div>
    </div>
  );
}

let keyCounter = 0;
const nextKey = () => `tok-${keyCounter++}`;

function highlightHtml(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = code.split(/(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z!][^<>]*>?)/g);
  for (const part of parts) {
    if (part === "") continue;
    if (part.startsWith("<!--")) {
      out.push(
        <span key={nextKey()} className="text-muted/70 italic">
          {part}
        </span>
      );
    } else if (/^<!DOCTYPE/i.test(part)) {
      out.push(
        <span key={nextKey()} className="text-warning">
          {part}
        </span>
      );
    } else if (part.startsWith("<")) {
      out.push(<span key={nextKey()}>{highlightTag(part)}</span>);
    } else {
      out.push(<span key={nextKey()} className="text-ink">{part}</span>);
    }
  }
  // Ensure trailing newline renders so the layers share height.
  out.push(<span key="trailing-nl"> </span>);
  return out;
}

function highlightTag(tag: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Split string literals out first so attribute highlighting never fires inside them.
  const chunks = tag.split(/("[^"]*"|'[^']*')/g);
  chunks.forEach((chunk, ci) => {
    if (chunk === "") return;
    if (/^["']/.test(chunk)) {
      out.push(
        <span key={`${nextKey()}-s${ci}`} className="text-warning">
          {chunk}
        </span>
      );
      return;
    }
    const m = chunk.match(/^(<\/?)([a-zA-Z][a-zA-Z0-9-]*)?([\s\S]*)$/);
    if (!m) {
      out.push(<span key={`${nextKey()}-t${ci}`}>{chunk}</span>);
      return;
    }
    const [, bracket, name, rest] = m;
    out.push(
      <span key={`${nextKey()}-b${ci}`} className="text-muted">
        {bracket}
      </span>
    );
    if (name) {
      out.push(
        <span key={`${nextKey()}-n${ci}`} className="text-error">
          {name}
        </span>
      );
    }
    if (rest) {
      const withAttrs = rest.replace(
        /([a-zA-Z-]+)(=)/g,
        "\u0000$1\u0001$2"
      );
      withAttrs.split(/([\u0000][a-zA-Z-]+[\u0001])/g).forEach((seg, si) => {
        if (/^\u0000/.test(seg)) {
          out.push(
            <span key={`${nextKey()}-a${ci}-${si}`} className="text-mint">
              {seg.replace(/[\u0000\u0001]/g, "")}
            </span>
          );
        } else if (seg) {
          out.push(
            <span key={`${nextKey()}-r${ci}-${si}`} className="text-muted">
              {seg}
            </span>
          );
        }
      });
    }
  });
  return out;
}
