/* The content security policy, enforced and measured.
   Run with: npx tsx scripts/verify-csp.ts   (needs `npm run build` first)

   The policy used to be report-only: the browser collected violations nobody
   read, and a script injected on any page could reach the learner's bearer
   token and drive the operator's console with it. Promoting it to enforcing
   is a verification pass over every page, not a change to one surface, and
   this is that pass.

   What it proves, over HTTP and in a real browser, for every route the site
   serves:

     1. The reply carries an enforcing policy, and no report-only one.
     2. The policy carries a nonce, and the nonce is different on every
        request (a per-request nonce is the point: a nonce that repeats is a
        nonce anybody can read off one page and reuse).
     3. Every script tag the page renders carries that same nonce, so the
        app's own scripts are allowed and nothing else is.
     4. In a real browser, an inline script WITHOUT the nonce does not run,
        and the browser says why (a securitypolicyviolation event).
     5. In a real browser, an inline script WITH the nonce does run, so the
        pass is not simply reporting that the page is broken.
     6. The policy names the platform's origin in connect-src, because the
        browser reaches the backend directly and the backend is not this
        origin.

   The route list is the one the accessibility sweep walks (scripts/routes.ts),
   so a page that is not scanned for accessibility is not scanned for the
   policy either. */
import assert from "node:assert";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { allRoutes } from "./routes";

let passed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port.");
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

/** The nonce a policy carries, or null. */
function nonceOf(csp: string | null): string | null {
  const m = /'nonce-([^']+)'/.exec(csp ?? "");
  return m?.[1] ?? null;
}

/** Every script tag the page rendered, with its nonce attribute. */
function scriptTags(html: string): { tag: string; nonce: string | null }[] {
  return [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => {
    const attrs = m[1] ?? "";
    const nonce = /nonce="([^"]*)"/i.exec(attrs)?.[1] ?? null;
    return { tag: m[0], nonce };
  });
}

if (!existsSync("build/index.js")) {
  console.error("The production build is missing. Run `npm run build` first: the policy is proved against the built server, not against the dev server.");
  process.exit(1);
}

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
/* The platform's address is set on purpose: the browser reaches the backend
   directly, and the policy has to name it. A policy that forgot to would look
   perfect here and cut the product off from its own backend. */
const platform = "http://127.0.0.1:8080";
const server = spawn(process.execPath, ["build/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    ORIGIN: origin,
    PUBLIC_API_URL: platform,
  },
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
      /* the adapter-node server is still starting */
    }
    await delay(200);
  }
  if (!ready) throw new Error(`Production server did not become ready.\n${serverOutput}`);

  console.log("== the policy is enforced, per request, with a nonce ==");
  const nonces = new Map<string, string>();
  for (const route of allRoutes) {
    const response = await fetch(`${origin}${route}`);
    if (response.status >= 500) {
      failures.push(`${route}: HTTP ${response.status}`);
      continue;
    }
    const csp = response.headers.get("content-security-policy");
    const reportOnly = response.headers.get("content-security-policy-report-only");
    if (!csp) {
      failures.push(`${route}: no content-security-policy header`);
      continue;
    }
    if (reportOnly) {
      failures.push(`${route}: the policy is still report-only`);
      continue;
    }
    const nonce = nonceOf(csp);
    if (!nonce) {
      failures.push(`${route}: the policy carries no nonce`);
      continue;
    }
    if (!/script-src [^;]*'self'/.test(csp)) {
      failures.push(`${route}: script-src is not pinned to this origin`);
      continue;
    }
    if (/script-src [^;]*'unsafe-inline'/.test(csp)) {
      failures.push(`${route}: script-src still allows inline script`);
      continue;
    }
    if (!/connect-src [^;]*127\.0\.0\.1:8080/.test(csp)) {
      failures.push(`${route}: connect-src does not name the platform (${csp})`);
      continue;
    }
    const html = await response.text();
    const scripts = scriptTags(html);
    const withoutNonce = scripts.filter((s) => s.nonce !== nonce);
    if (withoutNonce.length > 0) {
      failures.push(`${route}: ${withoutNonce.length} script tag(s) without the request's nonce: ${withoutNonce.map((s) => s.tag).join(" ")}`);
      continue;
    }
    if (scripts.length === 0) {
      failures.push(`${route}: the page rendered no script at all, so the policy was not exercised`);
      continue;
    }
    nonces.set(route, nonce);
  }
  ok(
    `every route answers with an enforcing policy, a nonce, and no report-only twin (${allRoutes.length} routes)`,
    failures.length === 0,
    failures.join("\n")
  );

  {
    const values = [...nonces.values()];
    ok(
      "the nonce is per request: two pages asked for twice carry two different nonces",
      values.length >= 2 && new Set(values).size === values.length
    );
  }

  console.log("\n== a real browser: an injected script does not run, and the app's own does ==");
  browser = await chromium.launch({ headless: true });
  const browserFailures: string[] = [];
  for (const route of allRoutes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      // The shell's own inline script: it swaps no-js for js before the first
      // paint. If the nonce were wrong, the page would render with the class
      // still set, and every reveal would stay hidden.
      const hydrated = await page.evaluate(() => document.documentElement.classList.contains("js"));
      if (!hydrated) {
        browserFailures.push(`${route}: the page's own script did not run`);
        continue;
      }
      const nonce = await page.evaluate(() => {
        const el = document.querySelector<HTMLScriptElement>("script[nonce]");
        return el?.nonce ?? null;
      });
      if (!nonce) {
        browserFailures.push(`${route}: the page carries no nonce to test against`);
        continue;
      }
      const injected = await page.evaluate(() => {
        const w = window as unknown as { __nxRan?: boolean; __nxViolations?: string[] };
        w.__nxRan = false;
        w.__nxViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          w.__nxViolations?.push(event.violatedDirective);
        });
        const el = document.createElement("script");
        el.textContent = "window.__nxRan = true;";
        document.head.appendChild(el);
        return null;
      });
      /* The violation is dispatched as a task, not synchronously with the
       * append, so the page is given a turn before the report is read. */
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
      const report = await page.evaluate(() => {
        const w = window as unknown as { __nxRan?: boolean; __nxViolations?: string[] };
        return { ran: w.__nxRan === true, violations: w.__nxViolations ?? [] };
      });
      if (report.ran) {
        browserFailures.push(`${route}: a script without the nonce ran`);
        continue;
      }
      if (report.violations.length === 0) {
        browserFailures.push(`${route}: the browser blocked the script without saying why`);
        continue;
      }
      const allowed = await page.evaluate((value) => {
        const w = window as unknown as { __nxAllowed?: boolean };
        w.__nxAllowed = false;
        const el = document.createElement("script");
        el.nonce = value;
        el.textContent = "window.__nxAllowed = true;";
        document.head.appendChild(el);
        // Read it back through a fresh binding: the assignment above narrows
        // the first one to false, and the script may have changed it since.
        const after = window as unknown as { __nxAllowed?: boolean };
        return after.__nxAllowed === true;
      }, nonce);
      if (!allowed) {
        browserFailures.push(`${route}: a script WITH the nonce did not run, so the page is broken rather than protected`);
        continue;
      }
    } catch (error) {
      browserFailures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }
  ok(
    `on every route the app's own script runs, an injected script without the nonce does not, and one with it does (${allRoutes.length} routes)`,
    browserFailures.length === 0,
    browserFailures.join("\n")
  );
} finally {
  await browser?.close();
  server.kill();
}

if (failures.length) {
  console.error(`${failures.length} policy findings:\n${failures.join("\n")}`);
  if (serverOutput.trim()) console.error("\nserver output:\n" + serverOutput.trim().slice(0, 4000));
  process.exitCode = 1;
} else {
  console.log(`\n${passed} CSP ASSERTIONS PASSED`);
}
