/* The operator's console: what has to be true of it.
   Run with: npx tsx scripts/verify-admin.ts

   The console is the one surface on this site that holds other people's
   data, so its assertions are about boundaries rather than about copy:
   what the browser may send, what the platform decides, and what the page
   says when the platform says no. The platform's own suite proves the
   routes; this proves that the front door asks them the right way. */
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sitemapPaths } from "../src/lib/seo";
import { ADMIN } from "../src/lib/content/admin";

let passed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const read = (rel: string): string => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const exists = (rel: string): boolean => existsSync(new URL(`../src/${rel}`, import.meta.url));

const pagePath = "routes/admin/+page.svelte";
const clientPath = "lib/admin-client.ts";
const copyPath = "lib/content/admin.ts";

{
  const page = read(pagePath);
  const client = read(clientPath);
  const copy = read(copyPath);

  ok("the console has a route", exists(pagePath));

  ok(
    "and it is not in the sitemap, because an operator's console is not for a crawler",
    !sitemapPaths().includes("/admin"),
    `the sitemap still lists ${sitemapPaths().filter((p) => p.includes("admin")).join(", ")}`
  );

  ok(
    "and the crawler is told to keep away from it",
    /Disallow:\s*\/admin/i.test(read("lib/seo.ts"))
  );

  ok(
    "the copy for the console lives in its own module, and the public one is not polluted with it",
    copy.includes("export const ADMIN") &&
      !read("lib/content/site.ts").includes("export const ADMIN")
  );

  ok(
    "the copy carries no em-dash and no en-dash",
    !copy.includes("\u2014") && !copy.includes("\u2013")
  );

  ok(
    "the page says all three things it can say: checking, not an operator, and the console",
    page.includes('view === "checking"') &&
      page.includes('view === "refused"') &&
      page.includes('view === "signed-out"')
  );

  ok(
    "the browser never sends who it is: the only credential it sends is the bearer",
    client.includes("headers.authorization") &&
      !client.includes("x-user-id") &&
      // Every body the console sends is an address and nothing else. The
      // operator is the caller, and the platform reads the caller from the
      // token the gateway verified.
      (client.match(/body:\s*\{/g) ?? []).length === 2 &&
      (client.match(/body:\s*\{\s*email\s*\}/g) ?? []).length === 2,
    "the console's client must not be able to name the operator"
  );

  ok(
    "and the console asks the platform's operator routes, which are the boundary",
    client.includes("/api/auth/admin") &&
      page.includes("adminApi.overview()")
  );

  ok(
    "the token stays in memory: the client never writes one down",
    !client.includes("localStorage") && !client.includes("sessionStorage")
  );

  ok(
    "the console shows nothing until the platform has answered",
    page.includes("view === \"checking\"") &&
      page.indexOf("view === \"checking\"") < page.indexOf("overview?.operator"),
    "the console's numbers must not be rendered before the platform has said who the caller is"
  );

  ok(
    "the one destructive action says what it does before it does it",
    ADMIN.accounts.detail.endSessionsNote.includes("sign in again") &&
      ADMIN.accounts.detail.endSessionsNote.includes("untouched")
  );

  ok(
    "the console never promises a response time, because the mailbox is a person",
    !/working days|within \d+ hours/i.test(JSON.stringify(ADMIN))
  );

  ok(
    "and the configuration panel is a set of flags, never a key",
    ADMIN.configuration.note.includes("never shown here") &&
      !JSON.stringify(ADMIN).toLowerCase().includes("api key")
  );
}

console.log(`\nALL ${passed} ADMIN ASSERTIONS PASSED`);
