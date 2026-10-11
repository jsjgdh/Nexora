import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { ALL_MISSIONS } from "../src/lib/missions";

declare global {
  interface Window {
    axe: {
      run: (
        context: Document,
        options: object
      ) => Promise<{
        violations: {
          id: string;
          impact: string | null;
          help: string;
          nodes: { target: string[]; html: string; failureSummary?: string }[];
        }[];
      }>;
    };
  }
}

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const allRoutes = [
  "/",
  "/roadmap",
  "/onboarding",
  "/diagnostic",
  "/auth",
  "/profile",
  "/projects",
  "/skills",
  "/practice",
  "/pricing",
  "/lab/containers",
  "/visualizations",
  "/route-that-does-not-exist",
  ...ALL_MISSIONS.map((mission) => `/mission/${mission.id}`),
];
const routes = process.env.AXE_ROUTES
  ? process.env.AXE_ROUTES.split(",").map((route) => route.trim()).filter(Boolean)
  : allRoutes;

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["build/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), ORIGIN: origin },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.setEncoding("utf8").on("data", (chunk: string) => (serverOutput += chunk));
server.stderr.setEncoding("utf8").on("data", (chunk: string) => (serverOutput += chunk));

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const failures: string[] = [];

try {
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Production server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(origin);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The adapter-node server is still starting.
    }
    await delay(200);
  }
  if (!ready) throw new Error(`Production server did not become ready.\n${serverOutput}`);

  browser = await chromium.launch({ headless: true });
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle", timeout: 15_000 });
      if (!response || response.status() >= 500) {
        failures.push(`${route}: HTTP ${response?.status() ?? "no response"}`);
        continue;
      }
      await page.addScriptTag({ path: axePath });
      const result = await page.evaluate(async () => {
        return window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
          },
        });
      });
      for (const violation of result.violations) {
        const nodes = violation.nodes
          .map((node: { target: string[]; html: string; failureSummary?: string }) =>
            `    ${node.target.join(", ")}: ${node.html} — ${(node.failureSummary ?? "See axe help").replace(/\s+/g, " ")}`
          )
          .join("\n");
        failures.push(`${route}: ${violation.id} (${violation.impact}) — ${violation.help}\n${nodes}`);
      }
      if (routes.length > 20 && (routes.indexOf(route) + 1) % 10 === 0) {
        console.log(`Checked ${routes.indexOf(route) + 1}/${routes.length} routes…`);
      }
    } catch (error) {
      failures.push(`${route}: scan failed — ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
}

console.log(`axe scanned ${routes.length} production routes.`);
if (failures.length) {
  console.error(`${failures.length} route/rule findings:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("No WCAG A/AA or axe best-practice violations found.");
}
