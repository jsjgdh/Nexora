/* What the browser actually downloads on the first load.
 *
 * The bundle directory says how big the chunks are. It does not say which of
 * them the first paint pulls. This measures the transfer.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

/* The measurement runs in the page, so its shape arrives as data rather than as a
 * type: the page returns plain JSON and the tool asserts on it. */
type Measured = Record<string, any>;

const PORT = 5217;
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

for (const route of ["/", "/courses/task-manager", "/pricing"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const seen = new Map();
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.startsWith(ORIGIN)) return;
    const length = Number(res.headers()["content-length"] ?? 0);
    seen.set(url.replace(ORIGIN, ""), length);
  });

  await page.goto(ORIGIN + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  const biggest = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`\n=== ${route} — first load ===`);
  console.log(`requests: ${seen.size}   transferred: ${(total / 1024).toFixed(1)} kB`);
  for (const [url, bytes] of biggest) {
    console.log(`  ${(bytes / 1024).toFixed(1).padStart(8)} kB  ${url.slice(0, 90)}`);
  }

  // There is no 3D scene on any public page, so nothing may request one.
  const three = [...seen.keys()].filter((u) => /three|webgl/i.test(u));
  console.log(`  a 3D renderer requested on first load: ${three.length > 0 ? "YES" : "no"}`);

  const lcp = (await page.evaluate(`new Promise((resolve) => {
    let value = -1;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) value = entry.startTime;
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* not supported */
    }
    setTimeout(() => resolve(Math.round(value)), 400);
  })`)) as number;
  console.log(`  largest contentful paint: ${lcp < 0 ? "not reported" : lcp + "ms"}`);

  await page.close();
}

await browser.close();
server.kill();
process.exit(0);
