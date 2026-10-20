/* A responsive measurement pass.
 *
 * The sweep in `verify-ux.ts` says whether anything overflows. This one says
 * what overflows, where, and by how much, at every width a reader arrives at
 * — and it is careful not to cry wolf:
 *
 *   - a link inside a horizontally scrollable strip is not an overflow; the
 *     strip is meant to scroll. It is reported as "off-screen in a strip",
 *     which is a different finding.
 *   - an inline link inside a sentence is not a touch-target failure; WCAG
 *     exempts it.
 *   - a visually-hidden skip link is not a small target; it is a target that
 *     is the size of its focus ring.
 *   - a link that is 44px tall but has one line of text is one line of text.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

/* The measurement runs in the page, so its shape arrives as data rather than as a
 * type: the page returns plain JSON and the tool asserts on it. */
type Measured = Record<string, any>;

const PORT = 5213;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROUTES = ["/", "/pricing", "/courses", "/employers", "/universities", "/download", "/verify"];
const WIDTHS: number[] = [320, 375, 414, 768, 1024, 1440];

const server = spawn(process.execPath, ["build/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT), ORIGIN },
  stdio: ["ignore", "pipe", "pipe"],
});
process.on("exit", () => server.kill());

for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(ORIGIN)).ok) break;
  } catch {
    /* not up yet */
  }
  await delay(250);
}

const browser = await chromium.launch();
let problems = 0;

/* The measurement runs in the page, so it is written as a string: the
 * TypeScript runner injects a `__name` helper into named functions, and that
 * helper does not exist in the browser. */
function measureScript(width: number) {
  return `(() => {
    const w = ${width};
    const inScroller = (el) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
        node = node.parentElement;
      }
      return false;
    };
    const isHidden = (el) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return true;
      const r = el.getBoundingClientRect();
      return r.width <= 2 && r.height <= 2;
    };
    const lineCount = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 4 && r.height > 4);
      if (rects.length === 0) return 0;
      return new Set(rects.map((r) => Math.round(r.top))).size;
    };
    const overflowing = [];
    const offScreen = [];
    const small = [];
    const wrapped = [];
    for (const el of document.querySelectorAll("body *")) {
      if (isHidden(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = getComputedStyle(el);
      const text = (el.textContent || "").trim().slice(0, 24);
      const cls = typeof el.className === "string" ? el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : "";
      const tag = el.tagName.toLowerCase() + "." + (text || cls);
      if (rect.right > w + 1 || rect.left < -1) {
        if (inScroller(el)) {
          if (!offScreen.some((o) => o.sel === tag)) offScreen.push({ sel: tag, left: Math.round(rect.left), right: Math.round(rect.right) });
        } else if (!overflowing.some((o) => o.sel === tag)) {
          overflowing.push({ sel: tag, left: Math.round(rect.left), right: Math.round(rect.right) });
        }
      }
      const clickable = el.matches("a,button,input,select,textarea,[role=button]");
      if (!clickable) continue;
      const inline = style.display === "inline" || style.display === "inline-block";
      const h = Math.round(rect.height);
      const cw = Math.round(rect.width);
      if (!inline && h > 0 && h < 44 && cw > 0 && !small.some((o) => o.sel === tag)) {
        small.push({ sel: tag, h, w: cw });
      }
      const lines = lineCount(el);
      if (lines > 1 && !wrapped.some((o) => o.sel === tag)) wrapped.push({ sel: tag, lines });
    }
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowing: overflowing,
      offScreen: offScreen,
      small: small,
      wrapped: wrapped,
      h1: document.querySelectorAll("h1").length
    };
  })()`;
}

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(ORIGIN + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const report = (await page.evaluate(measureScript(width))) as Measured;

    const issues = [];
    if (report.scrollWidth > report.clientWidth + 1) {
      issues.push(`the page scrolls sideways by ${report.scrollWidth - report.clientWidth}px`);
    }
    if (report.overflowing.length) issues.push(`${report.overflowing.length} element(s) past the edge`);
    if (report.offScreen.length) issues.push(`${report.offScreen.length} item(s) off-screen in a scroll strip`);
    if (report.small.length) issues.push(`${report.small.length} control(s) under 44px`);
    if (report.wrapped.length) issues.push(`${report.wrapped.length} control(s) with a wrapped label`);
    if (report.h1 !== 1) issues.push(`${report.h1} h1 elements`);

    if (issues.length) {
      problems++;
      console.log(`\n${route} @ ${width}px`);
      for (const i of issues) console.log(`  - ${i}`);
      for (const o of report.overflowing.slice(0, 4)) console.log(`      over:  ${o.sel} (left ${o.left}, right ${o.right})`);
      for (const o of report.offScreen.slice(0, 3)) console.log(`      strip: ${o.sel} (left ${o.left}, right ${o.right})`);
      for (const o of report.small.slice(0, 4)) console.log(`      small: ${o.sel} ${o.w}x${o.h}`);
      for (const o of report.wrapped.slice(0, 4)) console.log(`      wrap:  ${o.sel} (${o.lines} lines)`);
    }
    await page.close();
  }
}

await browser.close();
server.kill();
console.log(problems === 0 ? "\nno responsive problems found" : `\n${problems} route/width combinations with problems`);
process.exit(0);
