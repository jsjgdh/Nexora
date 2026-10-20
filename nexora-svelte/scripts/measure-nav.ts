/* What the navigation actually shows, at each width.
 *
 * The strip is meant to scroll, so the number that matters is not how many
 * links are off-screen. It is how many are visible, and whether the edge
 * shows that there is more.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 5221;
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
for (const width of [320, 390, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const read = (await page.evaluate(`(() => {
    const nav = document.querySelector("nav.folio");
    const ul = nav ? nav.querySelector("ul") : null;
    const links = [...(nav ? nav.querySelectorAll("a.folio-link") : [])];
    const visible = links.filter((a) => {
      const r = a.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth;
    });
    const cut = links.filter((a) => a.getBoundingClientRect().right > window.innerWidth);
    return {
      strip: ul ? Math.round(ul.getBoundingClientRect().width) : 0,
      links: links.length,
      visible: visible.length,
      cut: cut.length
    };
  })()`)) as Record<string, number>;
  console.log(
    `${String(width).padStart(5)}px  the folio strip is ${String(read.strip).padStart(4)}px wide  |  ` +
      `${read.visible} of ${read.links} links fully visible, ${read.cut} cut by the edge`
  );
  await page.close();
}
await browser.close();
server.kill();
process.exit(0);
