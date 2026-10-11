import type { CheckDef, HarnessObs } from "./types";
import { evaluateAssertions } from "./harness";

export interface CheckOutcome {
  checkId: string;
  label: string;
  passed: boolean;
  /** On failure: the check's actionable feedback. On success: confirmation. */
  message: string;
}

/**
 * Deterministic assessment: parse the learner's HTML with DOMParser and
 * evaluate declarative rules. No LLM, no hidden test code in the client
 * beyond these generic, inspectable rule interpreters.
 *
 * @param liveDoc Optional rendered document (the sandboxed preview) used by
 *   `computed-style` rules. The preview runs with scripts blocked, so reading
 *   computed styles from it is a safe, deterministic observation.
 * @param scriptObs Optional harness observations keyed by check id, used by
 *   `scripted` rules. Absent observations fail closed (press Check to run).
 */
export function runChecks(
  code: string,
  checks: CheckDef[],
  liveDoc: Document | null = null,
  scriptObs: Map<string, HarnessObs[]> | null = null
): CheckOutcome[] {
  const doc = new DOMParser().parseFromString(code, "text/html");
  return checks.map((check) => {
    try {
      const passed = evalRule(doc, check.rule, liveDoc, check.id, scriptObs);
      return {
        checkId: check.id,
        label: check.label,
        passed,
        message: passed ? `${check.label} — passed.` : check.feedback,
      };
    } catch {
      return {
        checkId: check.id,
        label: check.label,
        passed: false,
        message: check.feedback,
      };
    }
  });
}

function first(doc: Document, selector: string): Element | null {
  return doc.querySelector(selector);
}

function evalRule(
  doc: Document,
  rule: CheckDef["rule"],
  liveDoc: Document | null,
  checkId: string,
  scriptObs: Map<string, HarnessObs[]> | null
): boolean {
  switch (rule.kind) {
    case "has-element":
      return first(doc, rule.selector) !== null;
    case "missing-element":
      return first(doc, rule.selector) === null;
    case "count-min":
      return doc.querySelectorAll(rule.selector).length >= rule.min;
    case "count-exact":
      return doc.querySelectorAll(rule.selector).length === rule.exact;
    case "text-match": {
      const el = first(doc, rule.selector);
      if (!el || !el.textContent) return false;
      return new RegExp(rule.pattern, "i").test(el.textContent);
    }
    case "doc-text-match": {
      const text = doc.body?.textContent ?? "";
      return new RegExp(rule.pattern, "i").test(text);
    }
    case "attr-match": {
      const el = first(doc, rule.selector);
      if (!el) return false;
      const value = el.getAttribute(rule.attr) ?? "";
      return new RegExp(rule.pattern, "i").test(value);
    }
    case "nested": {
      const ancestors = Array.from(doc.querySelectorAll(rule.ancestor));
      return ancestors.some((a) => a.querySelector(rule.child) !== null);
    }
    case "labeled-inputs":
      return allInputsLabeled(doc);
    case "no-placeholder-links": {
      const links = Array.from(doc.querySelectorAll("a[href]"));
      return links.every((a) => {
        const href = (a.getAttribute("href") ?? "").trim();
        return href !== "" && href !== "#" && !href.toLowerCase().startsWith("javascript:");
      });
    }
    case "style-text-match": {
      const css = Array.from(doc.querySelectorAll("style"))
        .map((s) => s.textContent ?? "")
        .join("\n");
      return new RegExp(rule.pattern, "is").test(css);
    }
    case "computed-style": {
      // Needs the rendered preview; without it the rule cannot be observed.
      if (!liveDoc || !liveDoc.defaultView) return false;
      const el = liveDoc.querySelector(rule.selector);
      if (!el) return false;
      const value = liveDoc.defaultView
        .getComputedStyle(el)
        .getPropertyValue(rule.property)
        .trim();
      return new RegExp(rule.pattern, "i").test(value);
    }
    case "scripted": {
      // Observations come from the harness round-trip; missing data fails
      // closed so a check can never pass without executing.
      if (!scriptObs) return false;
      const obs = scriptObs.get(checkId);
      if (!obs) return false;
      const byId = new Map(obs.map((o) => [o.id, o]));
      return evaluateAssertions(byId, rule.assertions);
    }
  }
}

function allInputsLabeled(doc: Document): boolean {
  const fields = Array.from(
    doc.querySelectorAll("input, textarea, select")
  ).filter((el) => {
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      return !["hidden", "submit", "button", "reset", "image"].includes(type);
    }
    return true;
  });
  if (fields.length === 0) return false; // a form mission with no fields is not done
  return fields.every((field) => {
    if (field.closest("label")) return true;
    const aria = field.getAttribute("aria-label") ?? field.getAttribute("aria-labelledby") ?? "";
    if (aria.trim().length > 0) return true;
    const id = field.getAttribute("id");
    if (!id) return false;
    // Match <label for> without CSS.escape (unavailable in some DOM
    // implementations and unnecessary here): compare attributes directly.
    const labels = Array.from(doc.querySelectorAll("label[for]"));
    return labels.some(
      (label) =>
        label.getAttribute("for") === id && (label.textContent ?? "").trim().length > 0
    );
  });
}
