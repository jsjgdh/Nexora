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
 * Who decides a rule kind.
 *
 * - `platform` — decided from the draft the platform stores, by the parser
 *   below. These read the document's own structure and text, so a parser is
 *   enough and both sides reach the same answer.
 * - `receipt` — decided from a signed run receipt the execution service issued
 *   (`verify-runs.ts`). The platform re-judges it; the client only forwards it.
 * - `client` — the learner's own browser is the only witness. Both such kinds
 *   are here for a reason, and it is a limitation rather than a preference:
 *   `computed-style` needs a *rendering* engine (a real cascade with real
 *   default styles, which no parser reproduces faithfully), and `scripted`
 *   needs the page to be driven — clicks, input, reads.
 *
 * Anything the client decides is *recorded*, never presented as a platform
 * verdict. `TRUST-MODEL.md` carries the shipped counts and `npm run
 * trust:report` regenerates them; the assertion suite fails if the two
 * disagree.
 */
export type RuleAuthority = "platform" | "receipt" | "client";

/**
 * Every kind in the `CheckRule` union, classified. The `Record<kind, …>` type
 * is the enforcement: add a kind to the union without deciding who owns it and
 * the type gate (`npm run check`) fails, rather than the kind quietly defaulting
 * to nobody's responsibility.
 */
export const KIND_AUTHORITY: Record<CheckRule["kind"], RuleAuthority> = {
  "has-element": "platform",
  "missing-element": "platform",
  "count-min": "platform",
  "count-exact": "platform",
  "text-match": "platform",
  "doc-text-match": "platform",
  "attr-match": "platform",
  "nested": "platform",
  "labeled-inputs": "platform",
  "no-placeholder-links": "platform",
  "style-text-match": "platform",
  "computed-style": "client",
  "scripted": "client",
  runs: "receipt",
};

const kindsWithAuthority = (authority: RuleAuthority): string[] =>
  (Object.keys(KIND_AUTHORITY) as CheckRule["kind"][])
    .filter((kind) => KIND_AUTHORITY[kind] === authority)
    .sort();

/** Which rule kinds the platform can decide for itself from the stored draft. */
export const SERVER_DECIDABLE_KINDS = kindsWithAuthority("platform");

/** Which rule kinds only the learner's own browser can answer. */
export const CLIENT_REPORTED_KINDS = kindsWithAuthority("client");

/** Which rule kinds are decided from a signed run receipt. */
export const RECEIPT_DECIDED_KINDS = kindsWithAuthority("receipt");

/** The authority for a rule, for callers that need to say who decided it. */
export function authorityOf(rule: CheckRule): RuleAuthority {
  return KIND_AUTHORITY[rule.kind];
}

export function isServerDecidable(rule: CheckRule): boolean {
  return KIND_AUTHORITY[rule.kind] === "platform";
}

/**
 * True when the learner's own device is the only witness for this rule. A
 * caller holding evidence that the learner can see should say so; a caller
 * presenting it as the platform's verdict is overclaiming.
 */
export function isClientReported(rule: CheckRule): boolean {
  return KIND_AUTHORITY[rule.kind] === "client";
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
