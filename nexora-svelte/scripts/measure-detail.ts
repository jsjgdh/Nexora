/* One more look, at the three things the sweep found, so the audit names the
 * element and the reason rather than the symptom.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

/* The measurement runs in the page, so its shape arrives as data rather than as a
 * type: the page returns plain JSON and the tool asserts on it. */
type Measured = Record<string, any>;

const PORT = 5215;
const ORIGIN = `http://127.0.0.1:${PORT}`;

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

const MEASURES: [string, number][] = [
  ["/", 320],
  ["/", 1440],
  ["/employers", 390],
];

for (const [route, width] of MEASURES) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(ORIGIN + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const found = (await page.evaluate(`(() => {
    const out = { wrapped: [], small: [], strip: [] };
    for (const el of document.querySelectorAll("a,button")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const s = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((x) => x.width > 4 && x.height > 4);
      const lines = new Set(rects.map((x) => Math.round(x.top))).size;
      if (lines > 1) {
        out.wrapped.push({
          text: (el.textContent || "").trim().slice(0, 34),
          lines,
          whiteSpace: s.whiteSpace,
          display: s.display,
          width: Math.round(r.width),
          height: Math.round(r.height),
          cls: String(el.className).slice(0, 60)
        });
      }
      if (s.display !== "inline" && r.height > 0 && r.height < 44 && r.width > 0) {
        out.small.push({
          text: (el.textContent || "").trim().slice(0, 34),
          h: Math.round(r.height),
          w: Math.round(r.width),
          cls: String(el.className).slice(0, 60)
        });
      }
    }
    // What is inside the horizontal scroller that is off-screen?
    const scrollers = [...document.querySelectorAll("*")].filter((n) => {
      const s = getComputedStyle(n);
      return /(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1 && n.children.length > 3;
    });
    for (const sc of scrollers) {
      out.strip.push({
        cls: String(sc.className).slice(0, 60),
        scrollWidth: sc.scrollWidth,
        clientWidth: sc.clientWidth,
        children: sc.children.length
      });
    }
    return out;
  })()`)) as Measured;

  console.log(`\n=== ${route} @ ${width}px ===`);
  console.log("wrapped labels:", JSON.stringify(found.wrapped.slice(0, 6), null, 1));
  console.log("small controls:", JSON.stringify(found.small.slice(0, 6), null, 1));
  console.log("scrollers:", JSON.stringify(found.strip.slice(0, 4), null, 1));
  await page.close();
}

await browser.close();
server.kill();
process.exit(0);
