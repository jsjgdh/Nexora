/**
 * Accessibility instrument — a manual measurement tool, not a test suite member.
 *
 * `scripts/verify.ts` asserts what source and pure functions can prove. It
 * cannot see rendered pixels: whether a token pair actually reads at the size
 * it is used, whether a control rendered without an accessible name, whether a
 * heading level jumped. This file runs inside a live page and reports that.
 *
 * It ships nothing: the build only bundles `src/`, so nothing here reaches a
 * learner. Run it against a dev server — the SvelteKit dev server serves only
 * `/src/**`, so this file cannot be imported from `scripts`; serve the directory
 * on a loopback port and pull it into the page under test:
 *
 *   // terminal: any static server over scripts/, with CORS
 *   const src = await (await fetch("http://127.0.0.1:8124/a11y-probe.js")).text();
 *   const { audit, focusBadge } =
 *     new Function(src.replace(/^export /gm, "") + "\nreturn { audit, focusBadge };")();
 *   audit();             // the route currently loaded
 *   focusBadge();        // what the focused control renders, after a real Tab
 *
 * Reported per route: text contrast against the composited background, controls
 * with no accessible name, duplicate ids, broken aria references, heading order,
 * images without alt text, interactive targets under 24px, the CSSOM's focus
 * rules, and the landmarks in play.
 */

const RADIX = 255;

/** Oklab → sRGB, the space `color-mix()` reports in. */
function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(RADIX, c * RADIX));
  });
}

/**
 * Whatever `getComputedStyle` returned, as 0–255 sRGB with alpha.
 *
 * Tailwind's `/70` opacity syntax compiles to `color-mix()`, which computes to
 * `oklab(...)` in the browser — not `rgb(...)`. A parser that only knew `rgb()`
 * would return null and the caller would skip the element in silence, which is
 * how a measurement tool ends up reporting failures it never looked for.
 *
 * @param {string} css @returns {{r:number,g:number,b:number,a:number}|null}
 */
function parseColor(css) {
  if (!css) return null;
  const s = css.trim();
  const rgb = /^rgba?\(([^)]+)\)$/.exec(s);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a: Number.isNaN(a) ? 1 : a };
  }
  const lab = /^oklab\(([^)]+)\)$/.exec(s);
  const lch = /^oklch\(([^)]+)\)$/.exec(s);
  if (!lab && !lch) return null;
  const parts = (lab ?? lch)[1].split(/[\s,/]+/).filter(Boolean).map((p) =>
    p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p)
  );
  const [L, second, third] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  if ([L, second, third].some((n) => Number.isNaN(n))) return null;
  const okA = lab ? second : second * Math.cos((third * Math.PI) / 180);
  const okB = lab ? third : second * Math.sin((third * Math.PI) / 180);
  const [r, g, b] = oklabToSrgb(L, okA, okB);
  return { r, g, b, a: Number.isNaN(a) ? 1 : a };
}

/** Composite `top` over `bottom` (both opaque result). */
function over(top, bottom) {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(v) {
  const s = v / RADIX;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 2.x contrast ratio, 1–21. */
function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 };

/** The background a reader actually sees behind this element's text. */
function backgroundBehind(el, win) {
  const stack = [];
  let node = el;
  while (node && node.nodeType === 1) {
    const c = parseColor(win.getComputedStyle(node).backgroundColor);
    if (c && c.a > 0) {
      stack.push(c);
      if (c.a >= 1) break;
    }
    node = node.parentElement;
  }
  let base = WHITE;
  const html = el.ownerDocument.documentElement;
  const htmlBg = html ? parseColor(win.getComputedStyle(html).backgroundColor) : null;
  if (htmlBg && htmlBg.a >= 1) base = htmlBg;
  for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
  return base;
}

/** A short, human-recognisable path to an element. */
function label(el) {
  const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const id = el.id ? `#${el.id}` : "";
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
}

function visible(el, win) {
  const s = win.getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

const FOCUSABLE = "a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex='-1'])";

/**
 * The desktop host injects its own overlay into the page under test (a fixed
 * badge at the maximum z-index). That markup is not the app's, so its contrast
 * is not the app's to fix — every check below skips those subtrees.
 */
const HOST_OVERLAY = '[style*="2147483647"]';
function hostOverlay(el) {
  return !!el.closest(HOST_OVERLAY);
}

/** The accessible name a screen reader would announce, or null. */
function accessibleName(el, doc) {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const text = by
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  if (el.id) {
    const forLabel = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel && forLabel.textContent.trim()) return forLabel.textContent.trim();
  }
  const wrapped = el.closest("label");
  if (wrapped && wrapped.textContent.trim()) return wrapped.textContent.trim();
  if (el.tagName === "IMG") {
    const alt = el.getAttribute("alt");
    if (alt && alt.trim()) return alt.trim();
  }
  const inner = el.querySelector("img[alt]");
  if (inner && inner.getAttribute("alt").trim()) return inner.getAttribute("alt").trim();
  const own = (el.textContent ?? "").trim();
  if (own) return own;
  const title = el.getAttribute("title");
  if (title && title.trim()) return title.trim();
  if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes(el.type)) {
    if (el.value && el.value.trim()) return el.value.trim();
  }
  const placeholder = el.getAttribute("placeholder");
  if (placeholder && placeholder.trim()) return placeholder.trim();
  return null;
}

/** Every `:focus`/`:focus-visible` rule the page loaded, and outline killers. */
function focusRules(doc) {
  const rules = [];
  const outlineNone = [];
  const walk = (list) => {
    for (const rule of list) {
      if (rule.cssRules && rule.cssRules.length && !(rule instanceof CSSStyleRule)) {
        walk(rule.cssRules);
        continue;
      }
      const sel = rule.selectorText;
      if (!sel || !/:focus/.test(sel)) continue;
      const css = rule.style ? rule.style.cssText : "";
      const visible = /:focus-visible/.test(sel);
      rules.push(`${sel}${visible ? "" : " [pointer-only]"}`);
      const killsOutline = /outline(-width|-style)?:\s*(none|0)/.test(css);
      if (killsOutline && !/box-shadow/.test(css)) outlineNone.push(sel);
    }
  };
  for (const sheet of doc.styleSheets) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    if (list) walk(list);
  }
  return { rules, outlineNone };
}

/**
 * The focus indicator on whatever is focused *now*.
 *
 * Script-driven `el.focus()` does not match `:focus-visible`, so a sweep that
 * focuses elements in a loop reports every control as unindicated — a lie.
 * The honest measurement is a real key press (the browser panel's Tab), then
 * this: what the focused control renders, and whether the browser agreed it is
 * focus-visible.
 */
export function focusBadge(win = window) {
  const el = win.document.activeElement;
  if (!el || el === win.document.body || !el.tagName) return { el: null, focusVisible: false };
  const s = win.getComputedStyle(el);
  return {
    el: label(el),
    focusVisible: el.matches(":focus-visible"),
    outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
    outlineOffset: s.outlineOffset,
    boxShadow: s.boxShadow,
    borderColor: s.borderColor,
    background: s.backgroundColor,
    color: s.color,
  };
}

/** The whole measurement. Runs against the live document by default. */
export function audit() {
  const doc = document;
  const win = window;
  const out = {
    route: location.pathname,
    width: win.innerWidth,
    theme: doc.documentElement.className,
    contrast: { checked: 0, failures: [], worst: [], transparentText: 0, unparsed: [] },
    unnamed: [],
    duplicateIds: [],
    brokenRefs: [],
    headings: { order: "", skips: [], h1: 0 },
    imagesWithoutAlt: [],
    smallTargets: [],
    focus: focusRules(doc),
    landmarks: {
      lang: doc.documentElement.lang || null,
      main: doc.querySelectorAll("main").length,
      nav: doc.querySelectorAll("nav").length,
      skipLink: !!doc.querySelector('a[href^="#"]'),
    },
  };

  const ratios = [];
  for (const el of doc.querySelectorAll("*")) {
    const tag = el.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "TITLE"].includes(tag)) continue;
    // Own text only: a parent's contrast is its children's business.
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;
    if (hostOverlay(el) || !visible(el, win)) continue;
    const s = win.getComputedStyle(el);
    const fg = parseColor(s.color);
    if (!fg) {
      // Never a silent skip: an unreadable colour is itself a finding.
      out.contrast.unparsed.push({ el: label(el), color: s.color });
      continue;
    }
    // `text-transparent` is how the editor stacks its syntax layer: the
    // textarea paints nothing and a <pre> behind it paints the code.
    if (fg.a === 0) {
      out.contrast.transparentText++;
      continue;
    }
    const bg = backgroundBehind(el, win);
    const color = fg.a >= 1 ? fg : over(fg, bg);
    const ratio = contrastRatio(color, bg);
    const size = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;
    out.contrast.checked++;
    ratios.push({ el: label(el), ratio: Math.round(ratio * 100) / 100, required });
    if (ratio + 0.005 < required) {
      out.contrast.failures.push({
        el: label(el),
        ratio: Math.round(ratio * 100) / 100,
        required,
        size,
        weight,
        fg: s.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  }
  ratios.sort((a, b) => a.ratio - b.ratio);
  out.contrast.worst = ratios.slice(0, 5);
  out.contrast.failures.sort((a, b) => a.ratio - b.ratio);

  for (const el of doc.querySelectorAll(FOCUSABLE)) {
    if (hostOverlay(el) || !visible(el, win)) continue;
    if (!accessibleName(el, doc)) out.unnamed.push(label(el));
  }

  const seen = new Map();
  for (const el of doc.querySelectorAll("[id]")) {
    if (hostOverlay(el)) continue;
    seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) out.duplicateIds.push(`${id} ×${n}`);
  for (const el of doc.querySelectorAll("[aria-labelledby],[aria-describedby],[aria-controls]")) {
    if (hostOverlay(el)) continue;
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const id of v.split(/\s+/)) {
        if (id && !doc.getElementById(id)) out.brokenRefs.push(`${label(el)} ${attr}=${id}`);
      }
    }
  }

  const levels = [];
  for (const h of doc.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (hostOverlay(h) || !visible(h, win)) continue;
    const lvl = Number(h.tagName[1]);
    levels.push(lvl);
    if (lvl === 1) out.headings.h1++;
  }
  out.headings.order = levels.join("");
  let prev = 0;
  for (const lvl of levels) {
    if (prev && lvl > prev + 1) out.headings.skips.push(`h${prev} → h${lvl}`);
    prev = lvl;
  }

  for (const img of doc.querySelectorAll("img")) {
    if (!hostOverlay(img) && !img.hasAttribute("alt")) out.imagesWithoutAlt.push(label(img));
  }

  // WCAG 2.2 target size (2.5.8). A control wrapped in a <label> is clicked
  // through the label, so the label's box is the target. An undersized target
  // still passes on the spacing exception: a 24px circle centred on each target
  // must not meet another target's box or another undersized target's circle.
  const targets = [];
  for (const el of doc.querySelectorAll(FOCUSABLE)) {
    if (hostOverlay(el) || !visible(el, win)) continue;
    const r = (el.closest("label") ?? el).getBoundingClientRect();
    targets.push({
      el,
      box: {
        w: r.width,
        h: r.height,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      },
    });
  }
  const undersized = targets.filter((t) => t.box.w < 24 || t.box.h < 24);
  const circleMeets = (t, rect) => {
    const dx = Math.max(rect.left - t.box.cx, 0, t.box.cx - rect.right);
    const dy = Math.max(rect.top - t.box.cy, 0, t.box.cy - rect.bottom);
    return Math.hypot(dx, dy) < 12;
  };
  for (const t of undersized) {
    const clashes = [];
    for (const o of targets) {
      if (o === t) continue;
      const other = undersized.includes(o)
        ? { left: o.box.cx - 12, top: o.box.cy - 12, right: o.box.cx + 12, bottom: o.box.cy + 12 }
        : o.box;
      if (circleMeets(t, other)) clashes.push(label(o.el));
    }
    out.smallTargets.push({
      el: label(t.el),
      size: `${Math.round(t.box.w)}×${Math.round(t.box.h)}`,
      spacingOk: clashes.length === 0,
      clashes: clashes.slice(0, 3),
    });
  }

  return out;
}
