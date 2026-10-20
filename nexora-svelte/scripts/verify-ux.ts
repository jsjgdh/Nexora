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
import { CURRICULUM } from "../src/lib/content/site";

const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/* The reveal is a CSS transition, and a screenshot is taken at an instant. So
 * the settled state is forced before anything is measured: the measurement is
 * about layout and content, not about whether a transition has run. */
const SETTLE =
  ".js .line-mask > span{transform:translateY(0)!important;transition:none!important}" +
  ".js .fade-up{opacity:1!important;transform:none!important;transition:none!important}" +
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
  const read = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const hidden = [...document.querySelectorAll("h1, h2, h3, p")].filter((el) => {
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
 * 4. Keyboard only: the switch, the tier toggle, the ledger, the FAQ, the
 *    device code and the replay must all be drivable.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(800);

  const hiring = page.locator("button", { hasText: "I'M HIRING" }).first();
  await hiring.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const h1After = await page.locator("h1").innerText();
  if (!/Juniors arrive/i.test(h1After)) {
    note("keyboard", `the audience switch did not change the hero (${h1After.slice(0, 40)})`);
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

  // The tier toggle is gone: the front page no longer prices the curriculum
  // line by line, so there is nothing here to press.

  const head = page.locator("button[id^='course-head-']").nth(1);
  await head.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  if ((await head.getAttribute("aria-expanded")) !== "true") {
    note("keyboard", "a course drawer did not open with the keyboard");
  }

  const summary = page.locator("details.nexora-details summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const open = await page
    .locator("details.nexora-details")
    .first()
    .evaluate((d) => (d as HTMLDetailsElement).open);
  if (!open) note("keyboard", "an answer did not open with the keyboard");

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

  const replay = page.locator("button", { hasText: "Run it again" }).first();
  await replay.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  if ((await page.locator("text=Running").count()) === 0) {
    note("keyboard", "the run did not replay with the keyboard");
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
  for (const id of ["why", "measures", "courses", "employers", "limits"]) {
    await page.evaluate((target) => {
      document.documentElement.style.scrollBehavior = "auto";
      document.getElementById(target)?.scrollIntoView();
    }, id);
    await page.waitForTimeout(250);
    const landed = await page.evaluate((target) => {
      const section = document.getElementById(target);
      const folio = document.querySelector(".folio");
      const heading = section?.querySelector("h2");
      return {
        headingTop: heading ? heading.getBoundingClientRect().top : null,
        folioBottom: folio ? folio.getBoundingClientRect().bottom : 0,
      };
    }, id);
    if (landed.headingTop === null) note("anchors", `#${id} has no heading`);
    else if (landed.headingTop < landed.folioBottom) {
      note("anchors", `#${id} lands ${Math.round(landed.folioBottom - landed.headingTop)}px under the folio`);
    }
  }
  await page.close();
}

/* ------------------------------------------------------------------ *
 * 6. Every other route: does it still read after the palette changed?
 * ------------------------------------------------------------------ */
{
  const routes = [
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
 * 6. Rendered contrast. The token suite measures the declarations; this
 *    measures the pixels. It walks every text node, composites the real
 *    background behind it, and computes the ratio that a reader would
 *    actually get. A rule that is only ever checked at the token level can
 *    be true of the palette and false of the page.
 * ------------------------------------------------------------------ */
{
  const routes = [
    "/",
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
 * 9. The interactions, not just the markup. A section that claims to
 *    scrub against the scroll must actually scrub; a readout that claims
 *    to name the cell under the pointer must actually name it; and the
 *    reveal's safety net must rescue a transition that never finishes.
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: SETTLE });
  await page.waitForTimeout(800);

  // The chain scrubs: scrolling past it lights more of it.
  const chainTop = await page.evaluate(() => {
    const chain = document.querySelector(".chain");
    if (!chain) return null;
    return chain.getBoundingClientRect().top + window.scrollY;
  });
  if (chainTop === null) {
    note("chain", "the chain is not on the page");
  } else {
    const litAt = async (y: number): Promise<number> => {
      await page.evaluate((top) => {
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo(0, top);
      }, y);
      await page.waitForTimeout(400);
      return page.locator(".chain-link.on").count();
    };
    const before = await litAt(chainTop - 700);
    const after = await litAt(chainTop + 300);
    if (after <= before) {
      note("chain", `scrolling past the chain lit no more of it (${before} then ${after})`);
    }
  }

  // The manifest names the cell under the pointer.
  const cells = page.locator("[data-phase-cell]");
  if ((await cells.count()) > 3) {
    const readout = page.locator("[data-readout]").first();
    const beforeReadout = await readout.textContent();
    await cells.nth(3).hover();
    await page.waitForTimeout(200);
    const afterReadout = await readout.textContent();
    if (afterReadout === beforeReadout) {
      note("manifest", `hovering a phase did not change the readout ("${beforeReadout}")`);
    }
  } else {
    note("manifest", "the phase plate has no cells to hover");
  }

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
    style.textContent = ".js .line-mask > span{transition-duration:60s!important}";
    (document.head ?? document.documentElement).appendChild(style);
  });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const state = await page.evaluate(() => {
    const inner = document.querySelector("h1 .line-mask > span");
    if (!inner) return null;
    const r = inner.getBoundingClientRect();
    const mask = inner.parentElement?.getBoundingClientRect();
    return {
      transform: getComputedStyle(inner).transform,
      offset: mask ? Math.round(r.top - mask.top) : null,
      height: Math.round(r.height),
    };
  });
  if (!state) note("reveal safety net", "the heading is not on the page");
  else if (state.offset === null || state.offset > 4) {
    note("reveal safety net", `the heading never settled (${state.offset}px below its mask)`);
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
    "Build real software",
    "A course that runs inside your editor",
    "The rung came off the ladder",
    "What you are actually buying",
    "Where the other products stop",
    "What the bench measures",
    "what is true of a finished phase",
    "What NEXORA will not do",
    "You still have to build it",
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

  if (!plain(askedHtml).includes("One window, start to finish.")) {
    note("headline test", "the variant that was asked for did not render");
  }
  if (plain(defaultHtml).includes("One window, start to finish.")) {
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
  const printed = await page.evaluate(() => ({
    // The visual height, not the layout height: a zoomed document reports a
    // taller layout than the sheet it actually prints on.
    height: Math.round(document.body.getBoundingClientRect().height),
    ground: getComputedStyle(document.body).backgroundColor,
  }));
  if (printed.height > 1180) {
    note("employers", `the printed page runs to ${printed.height}px, which is more than one sheet`);
  }
  if (printed.ground === "rgb(11, 14, 18)") {
    note("employers", "the printed page is still the dark sheet");
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
  const printed = await page.evaluate(() => ({
    height: Math.round(document.body.getBoundingClientRect().height),
    ground: getComputedStyle(document.body).backgroundColor,
    text: document.body.innerText,
  }));
  if (printed.height > 1180) {
    note("universities", `the printed page runs to ${printed.height}px, which is more than one sheet`);
  }
  if (printed.ground === "rgb(11, 14, 18)") {
    note("universities", "the printed page is still the dark sheet");
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
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
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
 * 12. The 3D field. Two things have to be true: the renderer is not in
 *     the first payload, and a browser that cannot have it still gets a
 *     complete page.
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
    note("field", "the 3D renderer is in the first payload");
  }

  await page.locator("[data-phase-canvas]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);

  if ((await page.locator("[data-phase-field]").count()) === 0) {
    note("field", "the field is not on the page");
  }
  if ((await page.locator("[data-phase-readout]").count()) === 0) {
    note("field", "the field has no readout");
  }
  if (!bodies.some((body) => body.includes("WebGLRenderer"))) {
    note("field", "the renderer was never fetched when the field came into view");
  }
  await page.close();
}

/* The same page with the renderer refused. The curriculum has to be there
   anyway, because the field was never the content. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/_app/immutable/**", (route) => {
    const url = route.request().url();
    if (url.includes("/chunks/")) {
      void route.continue();
      return;
    }
    void route.abort();
  });
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const body = await page.content();
  // The line is read from the copy module rather than written here, so the
  // check follows the words the page actually prints.
  if (!body.includes(CURRICULUM.title)) {
    note("field", "the field's own line is missing when the renderer cannot be fetched");
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

  const form = page.locator("[data-launch-list]");
  if ((await form.count()) === 0) {
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
