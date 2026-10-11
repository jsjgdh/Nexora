import type { CheckRule } from "./types";

/* The document-rule interpreter: the part of the check engine that reads a
 * parsed document.
 *
 * It lives apart from the client's DOMParser and harness because the progress
 * service now re-derives these checks too — from the draft it stores, with its
 * own parser. Two callers, one interpreter: a second implementation of "does
 * this document satisfy this rule" would eventually disagree with the first,
 * and the learner would be told two different things about the same file.
 *
 * The DOM surface below is deliberately narrow. A parser only has to provide
 * these few members to be usable here, which is what lets a browser (with the
 * DOM lib) and a service (a smaller parser, no DOM lib) run the same code.
 */

/** The element surface the rules use — nothing more. */
export interface DocElement {
  getAttribute(name: string): string | null;
  readonly textContent: string | null;
  querySelector(selector: string): DocElement | null;
  querySelectorAll(selector: string): ArrayLike<DocElement>;
  closest(selector: string): DocElement | null;
  readonly tagName: string;
}

/** A parsed document: the surface above, plus the rendering view when there is one. */
export interface DocLike {
  querySelector(selector: string): DocElement | null;
  querySelectorAll(selector: string): ArrayLike<DocElement>;
  readonly body: DocElement | null;
  /** Present only where something renders: see `computed-style`. */
  readonly defaultView?: {
    getComputedStyle(el: DocElement): { getPropertyValue(property: string): string };
  } | null;
}

/**
 * Which rule kinds the platform can decide for itself from the stored draft.
 *
 * These read the document's own structure and text, so a parser is enough and
 * both sides reach the same answer. The two kinds absent from this list are
 * absent for a reason, and it is a limitation rather than a preference:
 *
 * - `computed-style` needs a *rendering* engine. The browser answers it from a
 *   real cascade with real default styles; no parser reproduces that
 *   faithfully, and guessing server-side would mean refusing work the learner
 *   can see is correct.
 * - `scripted` needs the page to be driven — clicks, input, reads. That is a
 *   browser-shaped job and it stays where the sandbox is.
 *
 * Both remain the client's own report for now (TODO 2.2).
 */
export const SERVER_DECIDABLE_KINDS = [
  "has-element",
  "missing-element",
  "count-min",
  "count-exact",
  "text-match",
  "doc-text-match",
  "attr-match",
  "nested",
  "labeled-inputs",
  "no-placeholder-links",
  "style-text-match",
] as const;

export function isServerDecidable(rule: CheckRule): boolean {
  return (SERVER_DECIDABLE_KINDS as readonly string[]).includes(rule.kind);
}

/**
 * Verdict for the rule kinds this module owns, or `null` for the two that
 * belong to a caller with different equipment: `scripted` (the sandbox harness)
 * and `runs` (the runner). Returning null rather than guessing keeps the split
 * visible in the type instead of in a comment nobody reads.
 *
 * A rule that cannot be observed fails closed: absent data is never a pass.
 */
export function evalDocumentRule(
  doc: DocLike,
  rule: CheckRule,
  liveDoc: DocLike | null = null
): boolean | null {
  switch (rule.kind) {
    case "has-element":
      return doc.querySelector(rule.selector) !== null;
    case "missing-element":
      return doc.querySelector(rule.selector) === null;
    case "count-min":
      return doc.querySelectorAll(rule.selector).length >= rule.min;
    case "count-exact":
      return doc.querySelectorAll(rule.selector).length === rule.exact;
    case "text-match": {
      const el = doc.querySelector(rule.selector);
      if (!el || !el.textContent) return false;
      return new RegExp(rule.pattern, "i").test(el.textContent);
    }
    case "doc-text-match":
      return new RegExp(rule.pattern, "i").test(doc.body?.textContent ?? "");
    case "attr-match": {
      const el = doc.querySelector(rule.selector);
      if (!el) return false;
      return new RegExp(rule.pattern, "i").test(el.getAttribute(rule.attr) ?? "");
    }
    case "nested": {
      const ancestors = Array.from(doc.querySelectorAll(rule.ancestor));
      return ancestors.some((a) => a.querySelector(rule.child) !== null);
    }
    case "labeled-inputs":
      return allInputsLabeled(doc);
    case "no-placeholder-links": {
      // An anchor without href is still a failed link if a learner presents it
      // as navigation. Query every anchor so omitting the attribute cannot
      // turn a broken destination into an invisible-to-the-check element.
      const links = Array.from(doc.querySelectorAll("a"));
      return links.every((a) => {
        const rawHref = a.getAttribute("href");
        if (rawHref === null) return false;
        const href = rawHref.trim();
        // Browsers ignore ASCII tabs/newlines while parsing URL schemes.
        // Strip controls/whitespace for scheme detection so `java\nscript:`
        // cannot masquerade as an ordinary destination.
        const compactHref = href.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
        if (compactHref === "" || compactHref === "#" || compactHref.startsWith("javascript:")) return false;
        if (/^https?:\/\//i.test(href)) {
          try {
            const target = new URL(href);
            if (!target.hostname) return false;
          } catch {
            return false;
          }
        }
        if (/^mailto:/i.test(href) && !href.slice(href.indexOf(":") + 1).trim()) return false;
        if (/^tel:/i.test(href) && !/\d/.test(href.slice(href.indexOf(":") + 1))) return false;
        return true;
      });
    }
    case "style-text-match": {
      const css = Array.from(doc.querySelectorAll("style"))
        .map((s) => s.textContent ?? "")
        .join("\n");
      return new RegExp(rule.pattern, "is").test(css);
    }
    case "computed-style": {
      // Needs the rendered preview; absent one, the rule cannot be observed.
      if (!liveDoc || !liveDoc.defaultView) return false;
      const el = liveDoc.querySelector(rule.selector);
      if (!el) return false;
      return new RegExp(rule.pattern, "i").test(
        liveDoc.defaultView.getComputedStyle(el).getPropertyValue(rule.property).trim()
      );
    }
    case "scripted":
    case "runs":
      return null;
  }
}

function allInputsLabeled(doc: DocLike): boolean {
  const fields = Array.from(doc.querySelectorAll("input, textarea, select")).filter((el) => {
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      return !["hidden", "submit", "button", "reset", "image"].includes(type);
    }
    return true;
  });
  if (fields.length === 0) return false; // a form mission with no fields is not done
  return fields.every((field) => {
    if ((field.getAttribute("aria-label") ?? "").trim().length > 0) return true;
    const labelledBy = (field.getAttribute("aria-labelledby") ?? "").trim().split(/\s+/).filter(Boolean);
    if (labelledBy.some((id) => {
      const target = Array.from(doc.querySelectorAll("[id]")).find((el) => el.getAttribute("id") === id);
      return (target?.textContent ?? "").trim().length > 0;
    })) return true;
    const wrappingLabel = field.closest("label");
    if ((wrappingLabel?.textContent ?? "").trim().length > 0) return true;
    const id = field.getAttribute("id");
    if (!id) return false;
    // Match <label for> without CSS.escape (unavailable in some DOM
    // implementations and unnecessary here): compare attributes directly.
    const labels = Array.from(doc.querySelectorAll("label[for]"));
    return labels.some(
      (label) => label.getAttribute("for") === id && (label.textContent ?? "").trim().length > 0
    );
  });
}
