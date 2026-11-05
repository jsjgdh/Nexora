/* A screenshot pass over the rebuilt front door, in both release states.
 *
 * This is not a gate: it is a way of looking at what the build actually
 * serves, at the widths a reader arrives at, so that a change can be seen
 * rather than inferred from the markup.
 *
 *   npm run shoot
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 5211;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = "shots";

/* A real hosted installer, so the second state is exercised rather than
 * assumed. The suite proves the two states differ; this proves the page
 * renders both. */
const BUILDS = [
  { name: "announced", env: {} },
  { name: "published", env: { PUBLIC_IDE_DOWNLOAD_URL: "https://example.invalid/nexora-setup.exe" } },
];

const SETTLE =
  ".js .line-mask > span{transform:translateY(0)!important;transition:none!important}" +
  ".js .fade-up{opacity:1!important;transform:none!important;transition:none!important}" +
  ".js .reveal-item{opacity:1!important;transform:none!important;transition:none!important}" +
  ".js .draw{transform:scaleX(1)!important}";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const build of BUILDS) {
  const server = spawn(process.execPath, ["build/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT), ORIGIN, ...build.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(ORIGIN);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await delay(250);
  }

  const shots: { route: string; width: number; name: string; at?: string }[] = [
    { route: "/", width: 1440, name: "home-top" },
    { route: "/", width: 1440, name: "home-features", at: ".feature-band" },
    { route: "/", width: 1440, name: "home-courses", at: "#courses" },
    { route: "/", width: 1440, name: "home-proof", at: "#proof" },
    { route: "/", width: 1440, name: "home-why", at: "#why" },
    { route: "/", width: 1440, name: "home-hiring", at: "#hiring" },
    { route: "/", width: 1440, name: "home-questions", at: "#questions" },
    { route: "/", width: 390, name: "home-mobile" },
    { route: "/courses", width: 1440, name: "courses" },
    { route: "/courses/task-manager", width: 1440, name: "course-task-manager" },
    { route: "/courses/task-manager", width: 1440, name: "course-phases", at: "#phases" },
    { route: "/courses/go", width: 1440, name: "course-go" },
    { route: "/employers", width: 1440, name: "employers" },
    { route: "/pricing", width: 1440, name: "pricing" },
    { route: "/download", width: 1440, name: "download" },
    { route: "/verify", width: 1440, name: "verify" },
    { route: "/terms", width: 1440, name: "terms" },
  ];

  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: 900 } });
    await page.goto(ORIGIN + shot.route, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: SETTLE });
    await page.waitForTimeout(1200);
    if (shot.at) {
      await page.evaluate((selector) => {
        document.documentElement.style.scrollBehavior = "auto";
        document.querySelector(selector)?.scrollIntoView();
        // Classes carry no scroll margin, so clear the sticky bar by hand.
        if (!selector.startsWith("#")) window.scrollBy(0, -88);
      }, shot.at);
      await page.waitForTimeout(700);
    }
    const name = build.name === "announced" ? shot.name : `${shot.name}-published`;
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.close();
  }

  console.log(`shot ${build.name}: ${shots.length} screens`);
  server.kill();
  await delay(500);
}

await browser.close();
process.exit(0);
