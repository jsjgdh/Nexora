/* Finding the strings a reader sees on the site.
 *
 * The walk has one job: decide which strings in the front door reach a
 * screen, and say where each one sits. Everything else is left alone, because
 * a checker that reads a log line or a class name is a checker nobody trusts.
 *
 * The rules the walk follows:
 *
 *   - A string in a comment is not a string. The TypeScript parser drops
 *     comments for us, and the markup reader drops the HTML comments.
 *   - A string in a type position is not a string a reader sees.
 *   - A string under a code key is not copy. Keys such as "id", "href", "url"
 *     or "slug" hold identifiers and paths.
 *   - The text of a page is copy, and so are the attributes that name a
 *     control.
 *   - A string that reads like prose and is not any of the above is copy.
 *
 * The pages are also put into surfaces. A surface is one route and everything
 * it renders: the page, the components it imports, the layout and the copy
 * module it reads. The rules that count things, such as one call to action
 * per surface, are decided over those sets. */

import ts from "typescript";
import { existsSync } from "node:fs";

/** The attributes of a tag that a reader sees. */
export const USER_ATTRIBUTES = new Set([
  "title",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "placeholder",
  "alt",
  "label",
  "value",
  "content",
]);

/**
 * The keys whose value is copy.
 *
 * These are the names a reader sees next to: the label of a control, the text
 * of a line, the wording of a question.
 */
export const COPY_KEYS = new Set([
  "answer",
  "blurb",
  "body",
  "caption",
  "copy",
  "cta",
  "description",
  "detail",
  "details",
  "explanation",
  "feedback",
  "goal",
  "heading",
  "hint",
  "hints",
  "item",
  "label",
  "lead",
  "lineOne",
  "lineTwo",
  "markOne",
  "message",
  "name",
  "note",
  "notes",
  "objective",
  "objectives",
  "option",
  "options",
  "phrase",
  "point",
  "points",
  "prompt",
  "question",
  "questions",
  "reason",
  "sentence",
  "statement",
  "stem",
  "subtitle",
  "summary",
  "text",
  "tip",
  "title",
  "tooltip",
  "warning",
]);

/**
 * The keys whose value is code.
 *
 * A value under one of these is an identifier, a path, a class name or a
 * number, and a reader never sees it.
 */
export const CODE_KEYS = new Set([
  "accept",
  "action",
  "arg",
  "args",
  "attr",
  "attribute",
  "charset",
  "class",
  "className",
  "cls",
  "code",
  "color",
  "colors",
  "colour",
  "colours",
  "command",
  "count",
  "css",
  "currency",
  "date",
  "dir",
  "domain",
  "duration",
  "email",
  "encoding",
  "event",
  "family",
  "field",
  "file",
  "files",
  "flag",
  "font",
  "format",
  "href",
  "host",
  "icon",
  "id",
  "ids",
  "kind",
  "lang",
  "left",
  "level",
  "limit",
  "link",
  "locale",
  "method",
  "mime",
  "mode",
  "module",
  "name",
  "nonce",
  "number",
  "option",
  "package",
  "page",
  "path",
  "paths",
  "pattern",
  "port",
  "property",
  "prop",
  "region",
  "regex",
  "route",
  "routes",
  "scheme",
  "scope",
  "secret",
  "selector",
  "shape",
  "size",
  "slug",
  "slugs",
  "source",
  "state",
  "status",
  "style",
  "tag",
  "target",
  "test",
  "tests",
  "tier",
  "timeoutMs",
  "timestamp",
  "token",
  "tone",
  "tool",
  "type",
  "url",
  "urls",
  "value",
  "variant",
  "version",
  "weight",
]);

/** The calls that write to a log. */
export const LOG_SINKS = new Set([
  "console.debug",
  "console.error",
  "console.info",
  "console.log",
  "console.warn",
]);

/**
 * The modules that hold nothing but copy.
 *
 * Every string in one of these is copy unless it is an identifier or a path,
 * because these modules exist to hold the words the site speaks.
 */
export const COPY_MODULES = new Set([
  "src/lib/content/site.ts",
  "src/lib/content/admin.ts",
  "src/lib/content/phase-detail.generated.ts",
  "src/lib/legal.ts",
  "src/lib/mail.ts",
  "src/lib/seo.ts",
  "src/lib/release.ts",
  "src/lib/auth-errors.ts",
  "src/lib/format.ts",
]);

/** A user-visible string, with the place it sits. */
export type StringEntry = {
  text: string;
  offset: number;
  kind: string;
  /** The pieces of a template literal, so a finding can name the line. */
  segments?: { text: string; offset: number; start: number }[] | null;
};

/** A control a reader can act on. */
export type Action = {
  label: string;
  target: string | null;
  offset: number;
  /** An inline link inside a sentence is prose, not a control label: it may
      name a document in the reader's grammar ("the privacy notice") without
      becoming a second label for the same destination. */
  prose?: boolean;
};

/* ------------------------------------------------------------------ helpers */

/** A URL, an email address, a path or a glob: never copy. */
export function looksLikeCode(value: string): boolean {
  const text = value.trim();
  if (text.length === 0) return true;
  if (/^(?:https?|mailto|data|file):/i.test(text)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true;
  if (/^(?:\.{0,2}\/|\/|\\\\)/.test(text) && !/\s/.test(text)) return true;
  if (/\*\*|\*\.[a-z0-9]+$/.test(text)) return true;
  if (/^[.#]?[a-z][a-z0-9-]*$/.test(text) && text.includes(".")) return true;
  return false;
}

/** A sentence a person reads, rather than a token a machine reads. */
export function readsLikeProse(value: string): boolean {
  const text = value.trim();
  if (text.length === 0) return false;
  if (!/\s/.test(text)) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^[\w.\-/]+$/.test(text)) return false;
  if (looksLikeCode(text)) return false;
  return true;
}

/** True when the literal sits in a type position rather than in code. */
function isTypeLevel(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current && current.parent) {
    const parent: ts.Node = current.parent;
    if (
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isLiteralTypeNode(parent) ||
      ts.isUnionTypeNode(parent)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
}

/** The name of the property a literal is the value of, if it is one. */
function propertyKey(node: ts.Node): string | null {
  const parent = node.parent;
  if (parent && ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = parent.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  }
  return null;
}

/** The name of the call a literal is an argument of, if it is one. */
function calleeName(node: ts.Node): { full: string; last: string } | null {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return null;
  const expression = parent.expression;
  if (ts.isIdentifier(expression)) return { full: expression.text, last: expression.text };
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      full: `${expression.expression.getText()}.${expression.name.text}`,
      last: expression.name.text,
    };
  }
  return null;
}

/**
 * True when a literal sits in a list of words rather than in copy.
 *
 * The copy module holds the words the product refuses and the words the
 * audience uses. Those are lists, not sentences, and a reader never sees
 * them.
 */
export function isWordList(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current && current.parent) {
    const parent: ts.Node = current.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return /^(?:FORBIDDEN|BANNED|REFUSED|CLAIMED)\w*$/.test(parent.name.text);
    }
    current = parent;
  }
  return false;
}

/**
 * The pieces of a template literal, with the place each one sits.
 *
 * A template with an expression in it is one string to a reader, so it is
 * checked as one string.
 */
export function templateSegments(
  node: ts.TemplateExpression,
  source: ts.SourceFile,
): { text: string; offset: number; start: number }[] {
  const segments: { text: string; offset: number; start: number }[] = [];
  let index = 0;
  const push = (text: string, offset: number): void => {
    segments.push({ text, offset, start: index });
    index += text.length;
  };
  push(node.head.text, node.head.getStart(source) + 1);
  for (const span of node.templateSpans) {
    push(" ... ", span.literal.getStart(source));
    push(span.literal.text, span.literal.getStart(source) + 1);
  }
  return segments;
}

/* --------------------------------------------------------------- typescript */

/**
 * Every user-visible string in a TypeScript module.
 *
 * The result is a list of entries: `{ text, offset, kind }` for the strings
 * that are copy, and nothing for the strings that are not.
 */
export function extractModule(
  fileName: string,
  text: string,
  options: { copyModule?: boolean; offset?: number } = {},
): StringEntry[] {
  const copyModule = options.copyModule ?? false;
  const base = options.offset ?? 0;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: StringEntry[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node)) {
      const entry = classify(node.text, node, null);
      if (entry) out.push(entry);
      return;
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      const entry = classify(node.text, node, null);
      if (entry) out.push(entry);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const segments = templateSegments(node, source);
      const joined = segments.map((segment) => segment.text).join("");
      const entry = classify(joined, node, segments);
      if (entry) out.push(entry);
      return;
    }
    node.forEachChild(visit);
  };
  visit(source);

  function classify(
    value: string,
    node: ts.Node,
    segments: { text: string; offset: number; start: number }[] | null,
  ): StringEntry | null {
    if (isTypeLevel(node)) return null;
    const parent = node.parent;

    if (
      parent &&
      (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
      parent.moduleSpecifier === node
    ) {
      return null;
    }
    if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return null;
    if (value.trim().length === 0) return null;
    if (isWordList(node)) return null;

    const key = propertyKey(node);
    if (key !== null && CODE_KEYS.has(key)) return null;

    const sink = calleeName(node);
    if (sink !== null && LOG_SINKS.has(sink.full)) return null;

    if (copyModule) {
      if (looksLikeCode(value)) return null;
      return { text: value, offset: base + node.getStart(source), kind: "copy-module", segments };
    }

    if (key !== null && COPY_KEYS.has(key)) {
      return { text: value, offset: base + node.getStart(source), kind: "copy-key", segments };
    }

    if (looksLikeCode(value)) return null;
    if (readsLikeProse(value)) {
      return { text: value, offset: base + node.getStart(source), kind: "prose", segments };
    }
    return null;
  }

  return out;
}

/* ------------------------------------------------------------------ markup */

/**
 * The text of a page, and the controls on it.
 *
 * The markup of a Svelte file is read directly: the text between the tags is
 * what a reader reads, and the attributes that name a control are read with
 * it. The script and style blocks are left to the module reader, and the
 * comments are left to nobody.
 */
/**
 * The index of the `>` that closes an opening tag.
 *
 * A Svelte event handler can carry an arrow function (`() => ...`) and a
 * quoted attribute can carry a `>`; both sit inside a tag and neither ends
 * it. The scanner tracks braces and quotes so the tag's own closing bracket
 * is the one found.
 */
function tagEnd(source: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open + 1; i < source.length; i++) {
    const ch = source[i]!;
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      if (depth > 0) depth--;
      continue;
    }
    if (ch === ">" && depth === 0) return i;
  }
  return -1;
}

export function extractMarkup(fileName: string, text: string): { strings: StringEntry[]; actions: Action[] } {
  const strings: StringEntry[] = [];
  const actions: Action[] = [];

  // The blocks that hold no copy, blanked out so that every position stays
  // the position in the file.
  const blank = (source: string): string => source.replace(/[^\n]/g, " ");
  let work = text;
  work = work.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (match) => blank(match));
  work = work.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (match) => blank(match));
  work = work.replace(/<!--[\s\S]*?-->/g, (match) => blank(match));

  let index = 0;
  while (index < work.length) {
    const open = work.indexOf("<", index);
    if (open === -1) {
      pushText(work.slice(index), index);
      break;
    }
    if (open > index) pushText(work.slice(index, open), index);
    const close = tagEnd(work, open);
    if (close === -1) break;
    const tag = work.slice(open, close + 1);
    const attributes = attributesOf(tag);
    const name = /^<\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)?.[1] ?? "";
    const href = attributes.href ?? null;
    const id = attributes.id ?? null;
    // Only a control carries a label: a link, a button, or a component that
    // stands for one. A section with an id is not a control, and its words
    // are a sentence rather than a label.
    if (isControl(name, attributes) && (href !== null || id !== null || name === "button" || name === "a")) {
      const inner = innerMarkup(work, close + 1, name);
      const label = inner === null ? null : plainText(inner);
      if (label !== null && label.length > 0) {
        actions.push({
          label,
          target: href ?? (id === null ? null : `id:${id}`),
          offset: open,
          prose:
            name === "a" &&
            /(?:^|\s)underline(?:\s|$)/.test(attributes.class ?? ""),
        });
      }
    }
    // The attributes that name a control are read by whoever cannot see the
    // control, and by the reader who hovers over it.
    for (const [attribute, value] of Object.entries(attributes)) {
      if (!USER_ATTRIBUTES.has(attribute)) continue;
      if (value.length === 0) continue;
      if (value.includes("{")) continue;
      strings.push({
        text: value,
        offset: open,
        kind: `markup-attr:${attribute}`,
      });
    }
    index = close + 1;
  }

  return { strings, actions };

  function pushText(chunk: string, at: number): void {
    for (const piece of literalPieces(chunk)) {
      const trimmed = piece.text.trim();
      if (trimmed.length === 0) continue;
      strings.push({ text: trimmed, offset: at + piece.index, kind: "markup-text" });
    }
  }
}

/**
 * Every user-visible string in a Svelte file.
 *
 * The markup is read for its text and its attributes, and the script block is
 * read with the module reader, so a string that lives in the script and ends
 * up on the page is found as well.
 */
export function extractSvelte(
  fileName: string,
  text: string,
): { strings: StringEntry[]; actions: Action[] } {
  const markup = extractMarkup(fileName, text);
  const strings = [...markup.strings];
  const actions = [...markup.actions];

  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const body = match[1] ?? "";
    const start = match.index + match[0].indexOf(body);
    for (const entry of extractModule(fileName, body, { offset: start })) {
      strings.push(entry);
    }
  }

  return { strings, actions };
}

/**
 * The literal parts of a run of markup text.
 *
 * A Svelte expression is code, so the text around it is kept and the
 * expression itself is dropped.
 */
export function literalPieces(chunk: string): { text: string; index: number }[] {
  const pieces: { text: string; index: number }[] = [];
  let index = 0;
  let start = 0;
  while (index < chunk.length) {
    const brace = chunk.indexOf("{", index);
    if (brace === -1) break;
    const end = matchBrace(chunk, brace);
    if (end === -1) break;
    if (brace > start) pieces.push({ text: chunk.slice(start, brace), index: start });
    index = end + 1;
    start = index;
  }
  if (start < chunk.length) pieces.push({ text: chunk.slice(start), index: start });
  return pieces;
}

/** The index of the brace that closes the one at the start. */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let index = start; index < text.length; index++) {
    const character = text[index]!;
    if (quote !== "") {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth++;
    if (character === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** The attributes of a tag, with their values. */
export function attributesOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = tag.slice(1, -1);
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const name = (match[1] ?? "").toLowerCase();
    if (name.length === 0) continue;
    const value = match[3] ?? match[4] ?? "";
    out[name] = value.trim();
  }
  return out;
}

/** True when a tag is a control a reader can act on. */
export function isControl(name: string, attributes: Record<string, string>): boolean {
  if (name === "a" || name === "button") return true;
  // Anything that carries a link is a control the reader can follow.
  if (attributes.href !== undefined) return true;
  // The components that stand for a button or a link.
  return /^(?:Button|ActionLink|Link)$/.test(name);
}

/** The markup inside an element, up to its closing tag. */
function innerMarkup(work: string, from: number, name: string): string | null {
  if (name.length === 0) return null;
  const close = work.toLowerCase().indexOf(`</${name.toLowerCase()}>`, from);
  if (close === -1) return null;
  return work.slice(from, close);
}

/**
 * The words of an element, with the tags and the expressions removed.
 *
 * An element whose words come from an expression has no fixed label, so it
 * gives nothing to compare and is left out.
 */
export function plainText(markup: string): string | null {
  const withoutTags = markup.replace(/<[^>]*>/g, " ");
  if (withoutTags.includes("{")) return null;
  // An arrow is a mark, not a word: "All courses →" and "All courses" are one
  // label, and a rule about wording should not read the arrow as wording.
  return withoutTags.replace(/[→↗←]/g, " ").replace(/\s+/g, " ").trim();
}

/* ----------------------------------------------------------------- imports */

/**
 * The files a module imports that belong to the site.
 *
 * The import graph is what turns a page into a surface: the page plus the
 * components it renders plus the copy module it reads.
 */
export function localImports(fileName: string, text: string, siteRoot: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|\n)\s*import\s+(?:[^'"]*from\s*)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const specifier = match[1] ?? "";
    const resolved = resolveImport(fileName, specifier, siteRoot);
    if (resolved !== null) found.push(resolved);
  }
  return found;
}

/** The site file an import points at, if it points at one. */
export function resolveImport(
  fileName: string,
  specifier: string,
  siteRoot: string,
): string | null {
  let base: string | null = null;
  if (specifier.startsWith("$lib/")) {
    base = `${siteRoot}/src/lib/${specifier.slice("$lib/".length)}`;
  } else if (specifier.startsWith(".")) {
    const directory = fileName.slice(0, fileName.lastIndexOf("/"));
    base = `${directory}/${specifier}`;
  } else {
    return null;
  }
  const candidates = [base, `${base}.ts`, `${base}.svelte`, `${base}/index.ts`];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate.replace(/\\/g, "/");
  }
  return null;
}
