/* The UX sweep.
 *
 * The other two suites ask whether the site is *correct*: assertions about the
 * product, and axe about accessibility. Neither of them asks whether the site
 * is *usable*, which is a different question and the one a visitor actually
 * asks:
 *
 *   - does it reflow, or does a phone get a page that scrolls sideways?
 *   - does it read with the script switched off?
 *   - does it read with motion switched off?
 *   - can it be driven from the keyboard?
 *   - do the navigation's anchors land where the navigation promised?
 *   - does every other route still read after the palette changed?
 *   - is the argument in the server-rendered document, or only in the hydrated
 *     one?
 *
 * Each of those is a way the redesign could have gone wrong without any
 * existing suite noticing, so each is checked here against the production
 * build, because that is what a visitor is served.
 *
 * Run it with: npm run verify:ux
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { ALL_PHASES, FREE_PHASE_COUNT } from "../src/lib/content/site";
import { releaseState } from "../src/lib/release";

const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/* The reveal is a CSS transition, and a screenshot is taken at an instant. So
 * the settled state is forced before anything is measured: the measurement is
 * about layout and content, not about whether a transition has run. */
const SETTLE =
  ".js .line-mask > span{transform:translateY(0)!important;transition:none!important}" +
  ".js .fade-up{opacity:1!important;transform:none!important;transition:none!important}" +
  ".js .reveal-item{opacity:1!important;transform:none!important;transition:none!important}" +
  ".js .draw{transform:scaleX(1)!important}";


type Rgba = { r: number; g: number; b: number; a: number };

/** A colour as the browser reports it, or null when it is not one. */
function parseColour(value: string): Rgba | null {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1]!.split(",").map((p) => parseFloat(p));
  return {
    r: parts[0] ?? 0,
    g: parts[1] ?? 0,
    b: parts[2] ?? 0,
    a: parts.length > 3 ? (parts[3] ?? 1) : 1,
  };
}

/** One translucent layer over another. */
function composite(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** The relative luminance of a colour, per WCAG. */
function luminance(colour: Rgba): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** The contrast ratio between two colours. */
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const failures: string[] = [];
const note = (area: string, message: string): void => {
  failures.push(`${area}: ${message}`);
};

if (!existsSync("build/index.js")) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const server = spawn(process.execPath, ["build/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT), ORIGIN },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});

for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(ORIGIN);
    if (response.ok) break;
  } catch {
    /* the adapter-node server is not up yet */
  }
  await delay(250);
}

const browser = await chromium.launch();

/* ------------------------------------------------------------------ *
 * 1. The width sweep. 320 is the narrowest phone WCAG asks for, 640 is
 *    1280 at 200% zoom, and the rest are the widths people actually use.
 * ------------------------------------------------------------------ */
for (const width of [320, 375, 414, 640, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(700);

  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    // An element inside a horizontal scroller is meant to extend past the
    // viewport; only elements that overflow the *page* are a defect. The
    // walk is written out rather than factored into a named helper, because a
    // named function does not survive being serialised into the page.
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= doc.clientWidth + 1.5) return false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ov = getComputedStyle(p).overflowX;
          if (ov === "auto" || ov === "scroll" || ov === "hidden") return false;
        }
        return true;
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);
    // Controls smaller than a thumb. The skip link is one pixel until it is
    // focused, and an inline link inside a sentence is not a control, so both
    // are excluded by name rather than by height.
    const small = [...document.querySelectorAll("a, button, summary, input, select")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.className.toString().includes("sr-only")) return false;
        if (el.closest("p, li, dd, td")) return false;
        return r.height < 44;
      })
      .slice(0, 6)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 24)}" ${Math.round(
            el.getBoundingClientRect().height
          )}px`
      );
    const h1 = document.querySelector("h1");
    return {
      overflow,
      wide,
      small,
      h1Height: h1 ? Math.round(h1.getBoundingClientRect().height) : 0,
    };
  });

  if (report.overflow > 1) note(`${width}px`, `horizontal overflow of ${report.overflow}px`);
  if (report.wide.length) note(`${width}px`, `elements past the right edge: ${report.wide.join(", ")}`);
  if (report.small.length) note(`${width}px`, `controls under 44px: ${report.small.join(", ")}`);
  if (report.h1Height < 20) note(`${width}px`, "the h1 is missing or collapsed");

  await page.close();
}

/* ------------------------------------------------------------------ *
 * 2. Without JavaScript the page must still read.
 * ------------------------------------------------------------------ */
{
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "load" });
  // The entrance is a CSS animation; let it finish before judging what is
  // visible. Without script the page is still allowed to arrive.
  await page.waitForTimeout(900);
  const read = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const hidden = [...document.querySelectorAll("h1, h2, h3, p")].filter((el) => {
      // A closed native dialog is not hidden content; it is a sheet that has
      // not been opened.
      if (el.closest("dialog:not([open])")) return false;
      const cs = getComputedStyle(el);
      return cs.opacity === "0" || cs.visibility === "hidden" || el.getBoundingClientRect().height === 0;
    });
    return {
      htmlClass: document.documentElement.className,
      h1Height: h1 ? Math.round(h1.getBoundingClientRect().height) : 0,
      hidden: hidden.length,
      firstHidden: hidden
        .slice(0, 4)
        .map((el) => `${el.tagName}: ${(el.textContent || "").trim().slice(0, 40)}`),
    };
  });
  if (read.htmlClass === "js") note("no script", "the js class is still set with the script off");
  if (read.h1Height < 20) note("no script", `the h1 is not visible (${read.h1Height}px)`);
  if (read.hidden > 0) note("no script", `${read.hidden} text blocks are hidden: ${read.firstHidden.join(" | ")}`);
  await context.close();
}

/* The skip link is one pixel until it is focused, and then it must be a real
 * target a thumb can hit. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  const skip = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { height: Math.round(r.height) };
  });
  if (!skip) note("skip link", "nothing is focused after the first Tab");
  else if (skip.height < 24) note("skip link", `the focused skip link is ${skip.height}px tall`);
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 3. Under reduced motion the page must be fully shown and still.
 * ------------------------------------------------------------------ */
{
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const read = await page.evaluate(() => {
    const hidden = [...document.querySelectorAll("h1, h2, h3, p, li")].filter((el) => {
      if (el.closest("dialog:not([open])")) return false;
      const cs = getComputedStyle(el);
      return cs.opacity === "0" || el.getBoundingClientRect().height === 0;
    });
    return {
      hidden: hidden.length,
      running: document.getAnimations().filter((a) => a.playState === "running").length,
    };
  });
  if (read.hidden > 0) note("reduced motion", `${read.hidden} text blocks are hidden`);
  if (read.running > 0) note("reduced motion", `${read.running} animations are still running`);
  await context.close();
}

/* ------------------------------------------------------------------ *
 * 4. Keyboard only: the Courses menu, the FAQ, the device code and the
 *    mobile sheet must all be drivable.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(800);

  const courses = page.locator("button", { hasText: "Courses" }).first();
  await courses.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  if ((await courses.getAttribute("aria-expanded")) !== "true") {
    note("keyboard", "the Courses menu did not open with the keyboard");
  }
  const menuLinks = page.locator("#courses-panel a");
  if ((await menuLinks.count()) < 7) {
    note("keyboard", `the Courses menu lists ${await menuLinks.count()} links, not the whole shelf`);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if ((await courses.getAttribute("aria-expanded")) !== "false") {
    note("keyboard", "the Courses menu did not close on Escape");
  }

  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return `${cs.outlineStyle} ${cs.outlineWidth}`;
  });
  if (!ring || ring.includes("none") || ring.includes("0px")) {
    note("keyboard", `the focused control has no visible ring (${ring})`);
  }

  const summary = page.locator("details summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const open = await page
    .locator("details")
    .first()
    .evaluate((d) => (d as HTMLDetailsElement).open);
  if (!open) note("keyboard", "an answer did not open with the keyboard");

  await page.close();
}

/* The mobile sheet is the same destinations, in a native dialog. */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.locator(".menu-button").click();
  await page.waitForTimeout(250);
  const dialog = page.locator("dialog#mobile-menu");
  if (!(await dialog.evaluate((d) => (d as HTMLDialogElement).open))) {
    note("mobile sheet", "the menu button did not open the dialog");
  }
  if ((await page.locator(".mobile-courses a").count()) < 7) {
    note("mobile sheet", "the sheet does not list the whole shelf");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  if (await dialog.evaluate((d) => (d as HTMLDialogElement).open)) {
    note("mobile sheet", "Escape did not close the dialog");
  }
  await page.close();
}

/* A course page is a document: every phase is present, not behind a
 * disclosure, and the page is reached from the shelf. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${ORIGIN}/courses/go`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const phases = await page.locator(".phase-list li").count();
  const openPanels = await page.locator("details[open]").count();
  if (phases < 10) note("course page", `only ${phases} phases rendered`);
  if (openPanels > 0) note("course page", "the syllabus is hidden behind a disclosure");
  if ((await page.locator("h1").innerText()).trim().length === 0) {
    note("course page", "the course page has no title");
  }
  await page.close();
}

/* The sign-in code lives with the download, because that is where a reader
 * who has decided to get the app meets it. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${ORIGIN}/download`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // The device code asks the reader to confirm the code against the screen
  // before anything can be approved, so the keyboard has to reach the tick
  // first and the button has to come alive after it.
  const agree = page.locator("[data-device-agree]").first();
  await agree.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  const approve = page.locator("button", { hasText: "Approve this code" }).first();
  if (await approve.isDisabled()) {
    note("keyboard", "the approve button stayed disabled after the code was confirmed");
  }
  await approve.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  if ((await page.locator("text=Signed in").count()) === 0) {
    note("keyboard", "the device code did not approve with the keyboard");
  }

  await page.close();
}

/* ------------------------------------------------------------------ *
 * 5. The anchors must land with their heading clear of the folio.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(800);
  for (const id of ["courses", "proof", "why", "hiring", "questions", "how"]) {
    await page.evaluate((target) => {
      document.documentElement.style.scrollBehavior = "auto";
      document.getElementById(target)?.scrollIntoView();
    }, id);
    await page.waitForTimeout(250);
    const landed = await page.evaluate((target) => {
      const section = document.getElementById(target);
      const bar = document.querySelector(".site-nav");
      const heading = section?.querySelector("h1, h2");
      return {
        headingTop: heading ? heading.getBoundingClientRect().top : null,
        barBottom: bar ? bar.getBoundingClientRect().bottom : 0,
      };
    }, id);
    if (landed.headingTop === null) note("anchors", `#${id} has no heading`);
    else if (landed.headingTop < landed.barBottom) {
      note("anchors", `#${id} lands ${Math.round(landed.barBottom - landed.headingTop)}px under the bar`);
    }
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 6. Every other route: does it still read after the palette changed?
 * ------------------------------------------------------------------ */
{
  const routes = [
    "/courses",
    "/courses/task-manager",
    "/courses/go",
    "/courses/rust",
    "/courses/sql",
    "/courses/zig",
    "/courses/ocaml",
    "/courses/api",
    "/pricing",
    "/universities",
    "/teach",
    "/teach/join",
    "/download",
    "/verify",
    "/auth",
    "/auth/ide",
    "/auth/password-reset",
    "/auth/password-reset/confirm",
    "/auth/password-reset/some-token",
    "/auth/verify",
    "/auth/verify-email/confirm",
    "/profile",
    "/account",
    "/privacy",
    "/privacy-choices",
    "/ai",
    "/terms",
    "/cookies",
    "/subprocessors",
    "/dpa",
    "/security",
    "/accessibility",
  ];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const route of routes) {
    const response = await page.goto(ORIGIN + route, { waitUntil: "networkidle" });
    if (!response || response.status() >= 400) {
      note("routes", `${route} returned ${response ? response.status() : "no response"}`);
      continue;
    }
    await page.addStyleTag({ content: SETTLE });
    await page.waitForTimeout(400);
    const read = await page.evaluate(() => {
      const doc = document.documentElement;
      const hidden = [...document.querySelectorAll("h1, h2, h3, p, li")].filter((el) => {
        if (el.closest("dialog:not([open])")) return false;
        const cs = getComputedStyle(el);
        return cs.opacity === "0" || el.getBoundingClientRect().height === 0;
      });
      const h1 = document.querySelector("h1");
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        hidden: hidden.length,
        h1Height: h1 ? Math.round(h1.getBoundingClientRect().height) : 0,
        title: document.title,
      };
    });
    if (read.overflow > 1) note("routes", `${route} overflows by ${read.overflow}px`);
    if (read.hidden > 0) note("routes", `${route} hides ${read.hidden} text blocks`);
    if (read.h1Height < 20) note("routes", `${route} has no visible h1`);
    if (!read.title) note("routes", `${route} has no document title`);
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 7. The thumb floor, measured on a phone.
 *
 *    The house says every control is at least 44 pixels tall. That is a
 *    claim about the rendered page, so it is checked on the rendered page, at
 *    the width a thumb is actually holding.
 *
 *    Two kinds of control are exempt, and both are exemptions the standard
 *    makes: a link inside a sentence, and a control that is hidden until it
 *    is focused.
 * ------------------------------------------------------------------ */
{
  const routes = [
    "/",
    "/courses",
    "/courses/task-manager",
    "/courses/go",
    "/courses/ocaml",
    "/pricing",
    "/universities",
    "/employers",
    "/download",
    "/teach",
  ];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const route of routes) {
    await page.goto(ORIGIN + route, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: SETTLE });
    await page.waitForTimeout(400);
    const small = await page.evaluate(() => {
      const found: { text: string; w: number; h: number }[] = [];
      for (const el of document.querySelectorAll("a,button,input,select,textarea,[role=button]")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        // A link inside a sentence is exempt: the standard exempts inline
        // targets, because a sentence of text cannot be made taller.
        if (style.display === "inline") continue;
        const rect = el.getBoundingClientRect();
        // A control that is hidden until it is focused is not a small target;
        // it is a target that is the size of its focus ring.
        if (rect.width <= 2 && rect.height <= 2) continue;
        if (rect.height > 0 && rect.height < 44) {
          const text = (el.textContent ?? "").trim().slice(0, 30);
          if (!found.some((f) => f.text === text)) {
            found.push({ text, w: Math.round(rect.width), h: Math.round(rect.height) });
          }
        }
      }
      return found;
    });
    for (const target of small) {
      note("thumb floor", `${route}: "${target.text}" is ${target.w}x${target.h}, under 44px`);
    }
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 6. Rendered contrast. The token suite measures the declarations; this
 *    measures the pixels. It walks every text node, composites the real
 *    background behind it, and computes the ratio that a reader would
 *    actually get. A rule that is only ever checked at the token level can
 *    be true of the palette and false of the page.
 * ------------------------------------------------------------------ */
{
  const routes = [
    "/",
    "/courses",
    "/courses/task-manager",
    "/courses/go",
    "/courses/ocaml",
    "/pricing",
    "/universities",
    "/teach",
    "/teach/join",
    "/download",
    "/verify",
    "/auth",
    "/auth/ide",
    "/auth/password-reset",
    "/auth/password-reset/confirm",
    "/auth/password-reset/some-token",
    "/auth/verify",
    "/auth/verify-email/confirm",
    "/account",
    "/privacy",
    "/privacy-choices",
    "/ai",
    "/terms",
    "/cookies",
    "/subprocessors",
    "/dpa",
    "/security",
    "/accessibility",
  ];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const route of routes) {
    await page.goto(ORIGIN + route, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: SETTLE });
    await page.waitForTimeout(400);
    // The browser collects the facts; the maths happens in this file.
    const samples = await page.evaluate(() => {
      const rows: {
        tag: string;
        cls: string;
        text: string;
        fg: string;
        chain: string[];
        size: number;
        weight: number;
      }[] = [];
      const elements = [...document.querySelectorAll("body *")].filter((el) => {
        const text = (el.textContent ?? "").trim();
        if (!text) return false;
        // Only elements that own their text, not their descendants'.
        const owns = [...el.childNodes].some(
          (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0
        );
        if (!owns) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) {
          return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const el of elements) {
        const cs = getComputedStyle(el);
        // The real background: every ancestor from the root down, stopping at
        // the first opaque one.
        const chain: string[] = [];
        for (let p: HTMLElement | null = el as HTMLElement; p; p = p.parentElement) {
          const bg = getComputedStyle(p).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)") {
            chain.unshift(bg);
            const parts = /rgba\(([^)]+)\)/.exec(bg);
            const alpha =
              parts && parts[1]!.includes(",")
                ? parseFloat(parts[1]!.split(",")[3] ?? "1")
                : 1;
            if (alpha >= 1) break;
          }
        }
        rows.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().split(" ")[0] ?? "",
          text: (el.textContent ?? "").trim().slice(0, 40),
          fg: cs.color,
          chain,
          size: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight) || 400,
        });
      }
      return rows;
    });
    for (const sample of samples) {
      const fg = parseColour(sample.fg);
      if (!fg) continue;
      let bg: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (const layer of sample.chain) {
        const parsed = parseColour(layer);
        if (parsed) bg = composite(parsed, bg);
      }
      const painted = fg.a < 1 ? composite(fg, bg) : fg;
      const large = sample.size >= 24 || (sample.size >= 18.66 && sample.weight >= 700);
      const floor = large ? 3 : 4.5;
      const r = contrast(painted, bg);
      if (r < floor) {
        note(
          "rendered contrast",
          `${route} · ${sample.tag}.${sample.cls} "${sample.text}" ${r.toFixed(2)}:1 (needs ${floor}) fg=${sample.fg} bg=${sample.chain[0] ?? "none"}`
        );
      }
    }
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 7. Forced colours. A system that overrides every colour must still be
 *    able to show the text: the failure mode is a foreground that lands on
 *    the same value as the forced background.
 * ------------------------------------------------------------------ */
{
  const context = await browser.newContext({
    forcedColors: "active",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const bad = await page.evaluate(() => {
    const findings: string[] = [];
    for (const el of document.querySelectorAll("h1, h2, h3, p, li, a, button, span")) {
      const text = (el.textContent ?? "").trim();
      if (!text) continue;
      const owns = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0
      );
      if (!owns) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fg = cs.color;
      const bg = cs.backgroundColor;
      // In forced colours the system replaces both; the failure is a pair that
      // lands on the same value.
      if (fg === bg && bg !== "rgba(0, 0, 0, 0)") {
        findings.push(`${el.tagName.toLowerCase()} "${text.slice(0, 30)}" fg=${fg} bg=${bg}`);
      }
    }
    return findings.slice(0, 6);
  });
  for (const finding of bad) note("forced colours", finding);
  await context.close();
}

/* ------------------------------------------------------------------ *
 * 9. The front door's readings are computed, not typed. The phase total
 *    and the free count have to be the manifest's, and the shelf has to
 *    render every reader-facing course.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(800);

  const facts = await page.locator(".hero-facts li").allInnerTexts();
  if (!facts.some((text) => text.includes(String(ALL_PHASES.length)))) {
    note("readings", `the hero does not state the manifest's ${ALL_PHASES.length} phases`);
  }
  if (!facts.some((text) => text.includes(String(FREE_PHASE_COUNT)))) {
    note("readings", `the hero does not state the ${FREE_PHASE_COUNT} free phases`);
  }
  const cards = await page.locator(".course-card").count();
  if (cards < 7) note("shelf", `the front door renders ${cards} course cards`);

  await page.close();
}

/* The reveal's safety net. A transition that never finishes would leave the
 * heading hidden, so the motion module settles it after the transition's own
 * time. This makes the transition absurdly long and checks the heading is
 * still there a moment later. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = ".js .reveal-item{transition-duration:60s!important}";
    (document.head ?? document.documentElement).appendChild(style);
  });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.locator("#courses").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2200);
  const state = await page.evaluate(() => {
    const card = document.querySelector(".course-card");
    if (!card) return null;
    const cs = getComputedStyle(card.parentElement as Element);
    return { opacity: cs.opacity, transform: cs.transform };
  });
  const settled =
    state?.transform === "none" || state?.transform === "matrix(1, 0, 0, 1, 0, 0)";
  if (!state) note("reveal safety net", "the shelf is not on the page");
  else if (state.opacity !== "1" || !settled) {
    note("reveal safety net", `a card never settled (${state.opacity}, ${state.transform})`);
  }
  await page.close();
}

/* Printing. The legal documents get printed, and a page that prints as a
 * black sheet is a document nobody can read. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN + "/privacy", { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(200);
  const print = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const main = document.querySelector("main p");
    return {
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      textColor: main ? getComputedStyle(main).color : null,
    };
  });
  const luminance = (value: string): number => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1]!.split(",").map((p) => parseFloat(p));
    const channel = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * channel(parts[0] ?? 0) +
      0.7152 * channel(parts[1] ?? 0) +
      0.0722 * channel(parts[2] ?? 0)
    );
  };
  if (luminance(print.bodyBackground) < 0.5) {
    note("print", `the page prints on a dark sheet (${print.bodyBackground})`);
  }
  if (print.textColor && luminance(print.textColor) > 0.5) {
    note("print", `the text prints light on that sheet (${print.textColor})`);
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 8. The server-rendered document must carry the argument, not only the
 *    hydrated one.
 * ------------------------------------------------------------------ */
{
  const html = await (await fetch(ORIGIN)).text();
  for (const phrase of [
    // Headline variants rotate, so the document is checked for the section
    // copy that does not: the shelf, the gap, the mechanism and the price.
    "Choose your path.",
    "Fewer promises. More mechanism.",
    "A hire can arrive with the work.",
    "Free to start. Pro for the rest.",
    "The questions.",
    "More than a course.",
    "Build the judgment. Keep the record.",
  ]) {
    if (!html.includes(phrase)) {
      note("server render", `the document does not contain "${phrase}"`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 9. The headline test. The server picks the variant, so the document
 *    has to carry the one it picked and only that one, and a reader who
 *    asks for another has to get it.
 * ------------------------------------------------------------------ */
{
  const defaultHtml = await (await fetch(ORIGIN)).text();
  const askedHtml = await (await fetch(`${ORIGIN}/?v=b`)).text();

  const headlineOf = (html: string): string => {
    const match = /<h1[\s\S]*?<\/h1>/.exec(html);
    return match ? match[0].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
  };

  const first = headlineOf(defaultHtml);
  const second = headlineOf(askedHtml);
  if (!first) note("headline test", "the document carries no heading to test");
  if (first && first === second) {
    note("headline test", `both variants rendered the same heading ("${first}")`);
  }
  /* The markup is stripped before the phrases are looked for, because the
     poster's marked word is wrapped in an element: the text on the page is
     "One window, start to finish", and the document says so with a tag in
     the middle of it. */
  const plain = (html: string): string =>
    html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

  if (!plain(askedHtml).includes("Earn the verdict.")) {
    note("headline test", "the variant that was asked for did not render");
  }

  if (plain(defaultHtml).includes("Earn the verdict.")) {
    note("headline test", "the default document renders more than one variant");
  }
}

/* ------------------------------------------------------------------ *
 * 10. The employer one-pager. It is a document, so it has to survive a
 *     phone as well as a printer.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(ORIGIN + "/employers", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(600);

  const sideways = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  if (sideways > 1) {
    note("employers", `the page scrolls sideways by ${sideways}px at 360`);
  }
  for (const phrase of [
    "What a hire comes with",
    "Three things a hire comes with",
    "There is no cohort behind this page yet",
  ]) {
    if ((await page.locator(`text=${phrase}`).count()) === 0) {
      note("employers", `the page is missing "${phrase}"`);
    }
  }

  // The printed page. It calls itself a one-pager, so it has to be one: an
  // A4 sheet is about 1120 pixels tall at 96dpi, with the margins taken off.
  // The width is a letter page, not the phone the reflow check just used: a
  // one-pager printed from a phone is a long single column, and that is a
  // different document.
  await page.setViewportSize({ width: 1024, height: 1400 });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(200);
  const printed = (await page.evaluate(`(() => {
    const dark = [...document.querySelectorAll("section")].filter((el) => {
      const value = getComputedStyle(el).backgroundColor;
      if (value === "rgba(0, 0, 0, 0)") return false;
      const parts = value.match(/rgba?\\(([^)]+)\\)/)?.[1].split(",").map((p) => parseFloat(p));
      if (!parts) return false;
      const [r, g, b] = parts.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
    }).map((el) => String(el.className).split(" ")[0]);
    return { height: Math.round(document.body.getBoundingClientRect().height), dark };
  })()`)) as { height: number; dark: string[] };
  if (printed.height > 1180) {
    note("employers", `the printed page runs to ${printed.height}px, which is more than one sheet`);
  }
  if (printed.dark.length) {
    note("employers", `the printed sheet keeps a dark ground: ${printed.dark.join(", ")}`);
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 10b. The teaching one-pager. It is a document as well, so it has to
 *      be one sheet, and it has to survive a phone.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(ORIGIN + "/universities", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(600);

  const sideways = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  if (sideways > 1) {
    note("universities", `the page scrolls sideways by ${sideways}px at 360`);
  }
  for (const phrase of [
    "A course a lecturer can read",
    "What a lecturer can check today",
    "What is not built yet",
    "No cohort has been taught yet",
  ]) {
    if ((await page.locator(`text=${phrase}`).count()) === 0) {
      note("universities", `the page is missing "${phrase}"`);
    }
  }

  // The printed page. It calls itself a one-pager, so it has to be one, and
  // the one thing it drops is the form: a reader holding paper cannot fill
  // one in, so the address has to stay.
  await page.setViewportSize({ width: 1024, height: 1400 });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(200);
  const printed = (await page.evaluate(`(() => {
    const dark = [...document.querySelectorAll("section")].filter((el) => {
      const value = getComputedStyle(el).backgroundColor;
      if (value === "rgba(0, 0, 0, 0)") return false;
      const parts = value.match(/rgba?\\(([^)]+)\\)/)?.[1].split(",").map((p) => parseFloat(p));
      if (!parts) return false;
      const [r, g, b] = parts.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
    }).map((el) => String(el.className).split(" ")[0]);
    return {
      height: Math.round(document.body.getBoundingClientRect().height),
      dark,
      text: document.body.innerText
    };
  })()`)) as { height: number; dark: string[]; text: string };
  if (printed.height > 1180) {
    note("universities", `the printed page runs to ${printed.height}px, which is more than one sheet`);
  }
  if (printed.dark.length) {
    note("universities", `the printed sheet keeps a dark ground: ${printed.dark.join(", ")}`);
  }
  if (!printed.text.includes("teaching@nexora.dev")) {
    note("universities", "the printed sheet dropped the address");
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 11. The market readings. A figure with no study beside it is a rumour,
 *     and the whole section depends on the sources being there.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${ORIGIN}/employers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const readings = await page.locator("#market [data-reading]").count();
  if (readings < 3) note("market", `the market section shows ${readings} readings`);
  const sources = await page.locator("#market [data-source]").count();
  if (sources < readings) {
    note("market", `only ${sources} of ${readings} readings name a study`);
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 12. There is no 3D scene and no second surface. The page is text, a
 *     product window and the ordinary app chunk.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bodies: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/_app/immutable/")) return;
    void response
      .text()
      .then((body) => bodies.push(body))
      .catch(() => {});
  });

  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if (bodies.some((body) => body.includes("WebGLRenderer"))) {
    note("payload", "a 3D renderer is in the first payload");
  }
  if ((await page.locator("[data-phase-canvas], [data-phase-field]").count()) > 0) {
    note("payload", "a 3D field is on the page");
  }
  const documentHtml = await page.content();
  if (!documentHtml.includes("Choose your path.")) {
    note("payload", "the shelf heading is missing from the document");
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 13. The launch list. The one field on the site that collects an
 *     address has to be labelled, reachable and big enough to hit.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(ORIGIN + "/download", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const release = releaseState(process.env.PUBLIC_IDE_DOWNLOAD_URL);
  const form = page.locator("[data-launch-list]");
  if (release.available) {
    // The build is published, so the page offers the download and must not
    // ask for an address it does not need.
    if ((await form.count()) > 0) {
      note("launch list", "a published build still asks for a launch address");
    }
  } else if ((await form.count()) === 0) {
    note("launch list", "the download page has no launch list");
  } else {
    const field = page.locator("[data-launch-list] input");
    const labelled = await field.evaluate((el) => {
      const input = el as HTMLInputElement;
      if (input.getAttribute("aria-label")) return true;
      if (input.id && document.querySelector(`label[for="${input.id}"]`)) return true;
      return !!input.closest("label");
    });
    if (!labelled) note("launch list", "the email field has no label");
    const height = await field.evaluate((el) => el.getBoundingClientRect().height);
    if (height < 44) {
      note("launch list", `the email field is ${Math.round(height)}px tall`);
    }
    const button = page.locator("[data-launch-list] button");
    const buttonHeight = await button.evaluate((el) => el.getBoundingClientRect().height);
    if (buttonHeight < 44) {
      note("launch list", `the submit button is ${Math.round(buttonHeight)}px tall`);
    }
  }
  await page.close();
}

await browser.close();
server.kill();

if (failures.length) {
  console.error(`${failures.length} problems:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("the sweep found nothing.");
