/* What the navigation actually shows, at each width.
 *
 * Above 1024px the masthead is two rows: the name and the action on the
 * first, the five destinations beneath the rule. Below it those destinations
 * move into the native dialog, so the number that matters there is whether
 * the dialog trigger is present and nothing is cut off at the edge.
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
let problems = 0;
for (const width of [320, 375, 414, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const read = (await page.evaluate(`(() => {
    const header = document.querySelector("header.site-nav");
    if (!header) return null;
    const inner = header.querySelector(".nav-inner");
    const desk = header.querySelector("nav.desk-nav");
    const links = [...(desk ? desk.querySelectorAll("a.nav-link, button.nav-link") : [])];
    const shown = links.filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(a).display !== "none";
    });
    const cut = shown.filter((a) => {
      const r = a.getBoundingClientRect();
      return r.right > window.innerWidth + 0.5 || r.left < -0.5;
    });
    const trigger = header.querySelector(".menu-button");
    const triggerShown = trigger ? getComputedStyle(trigger).display !== "none" : false;
    const cta = header.querySelector(".nav-cta");
    const ctaRect = cta ? cta.getBoundingClientRect() : null;
    const innerRect = inner ? inner.getBoundingClientRect() : null;
    return {
      height: Math.round(header.getBoundingClientRect().height),
      links: links.length,
      shown: shown.length,
      cut: cut.length,
      trigger: triggerShown,
      ctaWrapped: ctaRect ? ctaRect.height > 52 : false,
      innerOverflow: innerRect ? Math.round(inner.scrollWidth - inner.clientWidth) : 0,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`)) as null | {
    height: number;
    links: number;
    shown: number;
    cut: number;
    trigger: boolean;
    ctaWrapped: boolean;
    innerOverflow: number;
    pageOverflow: number;
  };
  if (!read) {
    console.log(`${String(width).padStart(5)}px  no site nav found`);
    problems += 1;
    await page.close();
    continue;
  }
  const desktop = width >= 1024;
  const wrongMode = desktop ? read.trigger === true || read.shown === 0 : read.trigger !== true || read.shown !== 0;
  if (wrongMode || read.cut! > 0 || read.innerOverflow! > 0 || read.pageOverflow! > 1 || read.ctaWrapped) {
    problems += 1;
  }
  console.log(
    `${String(width).padStart(5)}px  ${String(read.height).padStart(2)}px tall  |  ` +
      `${read.shown}/${read.links} destinations in the bar  |  ` +
      `dialog trigger ${read.trigger ? "shown" : "hidden"}  |  ` +
      `${read.cut} cut, inner overflow ${read.innerOverflow}px, page overflow ${read.pageOverflow}px` +
      (read.ctaWrapped ? ", action wraps" : "")
  );
  await page.close();
}
await browser.close();
server.kill();
if (problems) console.log(`${problems} width(s) need a look.`);
process.exit(0);
