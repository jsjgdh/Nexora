/* Acceptance verification: the front door describes the real product.
   Run with: npx tsx scripts/verify.ts

   There is one way to learn — the desktop IDE. This site is the front door
   (the download, the account, the tier) plus the proof machinery (the
   stranger-facing verify surface and the session/billing boundary behind it).
   It teaches nothing in the browser: no missions, no classroom routes, no
   check engine, no visualizations. Every assertion below pins that shape, so
   a copy edit or a re-added import cannot quietly reintroduce the second way
   to learn. */
import assert from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { sitemapPaths } from "../src/lib/seo";
import * as COPY from "../src/lib/content/site";
import * as LEGAL from "../src/lib/legal";
import { isExpiring, parseSessionStart, refreshDelayMs, tokenExpiryMs } from "../src/lib/session-core";

let passed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  // `detail` is for the cases whose evidence is captured output: printing it
  // only on failure keeps the passing log readable and the failing one
  // diagnosable.
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const srcUrl = (rel: string): URL => new URL(`../src/${rel}`, import.meta.url);

/**
 * A count in English, for a headline that has to say it in words.
 *
 * The gate used to carry a table of the counts it had ever seen, which meant
 * it only knew how to check the curriculum sizes that had already happened.
 * A course line landed and the table had no entry for it, so the headline
 * check went quiet at exactly the moment it was needed. This derives the word
 * instead, so any count can be checked.
 */
function numberWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  const ones = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return ones[n]!;
  if (n < 100) {
    const rest = n % 10;
    return rest === 0 ? tens[Math.floor(n / 10)]! : `${tens[Math.floor(n / 10)]}-${ones[rest]}`;
  }
  const hundreds = ["one hundred", "two hundred", "three hundred", "four hundred", "five hundred",
    "six hundred", "seven hundred", "eight hundred", "nine hundred"];
  if (n < 1000) {
    const rest = n % 100;
    return rest === 0
      ? hundreds[Math.floor(n / 100)]!
      : `${hundreds[Math.floor(n / 100)]}, ${numberWords(rest)}`;
  }
  return null;
}
const srcFiles: string[] = [];
{
  const walkSrc = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) walkSrc(p);
      else if (p.endsWith(".svelte") || p.endsWith(".ts")) srcFiles.push(p);
    }
  };
  walkSrc(fileURLToPath(new URL("../src", import.meta.url)));
}
const routesDir = fileURLToPath(new URL("../src/routes", import.meta.url));

console.log("== the front door describes the real product ==");
{
  // The pivot: there is one way to learn, and it is the desktop IDE. The root
  // sells the download (with the base course inside it), the browser sign-in,
  // and the tier unlock — never a browser mission. These pin that shape so a
  // copy edit cannot quietly reintroduce the second way to learn.
  const landing = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  // The copy lives in one module and the suite reads it there. Asserting the
  // sentences on the template would couple a product-honesty test to a class
  // name: a redesign could fail it, and a dishonest claim could hide behind a
  // renamed element. The claim is what is under test, so the claim is what is
  // read.
  const copy = readFileSync(new URL("../src/lib/content/site.ts", import.meta.url), "utf8");
  ok(
    "the page names no browser mission as a way to learn",
    !landing.includes("/mission/") && !landing.includes("firstMission")
  );
  ok(
    "every call on the page opens the download",
    landing.includes('const downloadHref = "/download"') &&
      landing.split("href={downloadHref}").length - 1 >= 3
  );
  ok(
    "the page states that the free phases ship inside the download",
    copy.includes("Nine phases ship inside the installer") && copy.includes("bundled")
  );
  ok(
    "the page explains the browser sign-in: the IDE opens this site",
    copy.includes("opens this site") && copy.includes("approve")
  );
  ok(
    "the page states the tier decides which courses appear in the IDE",
    copy.includes("tier") && copy.includes("appear inside the IDE")
  );

  // The classroom routes are gone, not unlinked: a deep link to a deleted
  // classroom must 404 rather than teach. Asserted on the directory entries
  // themselves so a re-added route fails here before it can be linked.
  for (const gone of [
    "mission",
    "practice",
    "diagnostic",
    "onboarding",
    "skills",
    "visualizations",
    "projects",
    "roadmap",
    "lab",
  ]) {
    ok(`no classroom route remains at /${gone}`, !existsSync(join(routesDir, gone)));
  }

  // `/api` is the one entry on that list that may exist, because it holds a
  // server endpoint rather than a way to learn: the mail handler behind the
  // rights requests. What the ban is actually about is a page a visitor could
  // be taught in, so it is asserted on the page files under the directory —
//  a server route teaches nobody, and a page added beneath it would fail here
  // before it could be linked.
  {
    const apiDir = join(routesDir, "api");
    const apiPages = existsSync(apiDir)
      ? readdirSync(apiDir, { recursive: true, withFileTypes: true }).filter(
          (e) => e.isFile() && e.name === "+page.svelte"
        )
      : [];
    ok(
      "the API route serves no page, so it is not a second way to learn",
      apiPages.length === 0
    );
  }

  // The content lib is gone with them: no route may import the mission model,
  // the curriculum taxonomy, or the browser progress/sync stores — the four
  // imports through which the second way to learn would return.
  const routeFiles = srcFiles.filter((f) => f.includes("/routes/"));
  for (const banned of [
    "$lib/missions",
    "$lib/curriculum",
    "store.svelte",
    "sync.svelte",
    "/mission/",
    "/roadmap",
    "/skills",
    "/practice",
    "/visualizations",
    "/diagnostic",
    "/onboarding",
  ]) {
    const offenders = routeFiles.filter((f) => readFileSync(f, "utf8").includes(banned));
    ok(`no route references ${banned}`, offenders.length === 0);
  }

  // The crawler contract matches the emitted surface exactly: the front door
  // plus the legal documents, no mission URLs, no classroom entries.
  const paths = sitemapPaths();
  ok(
    "the sitemap is exactly the public pages and the legal documents",
    JSON.stringify([...paths].sort()) ===
      JSON.stringify(
        [
          "/",
          "/ai",
          "/auth",
          "/auth/ide",
          "/accessibility",
          "/cookies",
          "/download",
          "/employers",
          "/universities",
          "/pricing",
          "/privacy",
          "/privacy-choices",
          "/security",
          "/dpa",
          "/subprocessors",
          "/terms",
          "/verify",
        ].sort()
      )
  );
  ok(
    "no sitemap entry names a mission or a classroom page",
    paths.every((p) => !p.startsWith("/mission/"))
  );

  // The legal surface. The audit this answers found that the product collected
  // identities, payments and learner code while every one of these documents was
  // missing. Each is now a real route on disk — asserted, not assumed, because a
  // footer link with no page behind it is worse than no link — reachable from
  // the footer, advertised to crawlers, and driven from one list so the three
  // cannot drift apart.
  for (const link of LEGAL.LEGAL_LINKS) {
    const docPath = link.href.slice(1);
    ok(`the legal document at ${link.href} exists`, existsSync(join(routesDir, docPath, "+page.svelte")));
    ok(`${link.href} is in the sitemap`, paths.includes(link.href));
  }
  {
    const footerSrc = readFileSync(
      new URL("../src/lib/components/Footer.svelte", import.meta.url),
      "utf8"
    );
    ok(
      "every legal document is linked from the footer, from the one list",
      footerSrc.includes("LEGAL_LINKS") && footerSrc.includes("{link.href}")
    );
  }
  {
    // The operator-placeholder gate, asserted in both directions. A document
    // must not print an in-force date while the party responsible for it is
    // still unnamed, and it must not sit labelled a draft after the details are
    // real. So the switch cannot be flipped without the facts, and the facts
    // cannot be set without the switch. <DocStatus> is the one component that
    // reads it, which is what keeps the six pages consistent.
    const statusSrc = readFileSync(
      new URL("../src/lib/components/DocStatus.svelte", import.meta.url),
      "utf8"
    );
    const unnamed = [LEGAL.LEGAL_ENTITY, LEGAL.GOVERNING_LAW].some((v) =>
      v.includes("[[")
    );
    ok("the legal status line is driven by the operator switch", statusSrc.includes("OPERATOR_READY"));
    ok(
      LEGAL.OPERATOR_READY
        ? "the operator is named, so the documents may state their effective date"
        : "no legal document claims to be in force while the operator is unnamed",
      LEGAL.OPERATOR_READY ? !unnamed : unnamed
    );
  }

  /* ------------------------------------------------------------------------
   * The rights surface: the difference between publishing rights and having
   * them. The audit's findings F-01/F-04/F-05/F-13 were "no notice at the point
   * of collection", "no deletion and no export", "no lawful-basis architecture"
   * and "no age gate" — every one of which is a mechanism rather than a
   * sentence. Each assertion below pins a mechanism to the place a user meets
   * it, so a future redesign cannot keep the paragraph and drop the control.
   * ---------------------------------------------------------------------- */

  {
    // 1. The notice travels with the registration, and the age affirmation is
    //    part of it. Sent from the page that creates accounts, because the duty
    //    is at the point of collection — a notice three clicks away is not one.
    const authPage = readFileSync(new URL("../src/routes/auth/+page.svelte", import.meta.url), "utf8");
    ok(
      "sign-up carries the notice: acceptance, age affirmation and the document versions",
      authPage.includes("acceptTerms") &&
        authPage.includes("acceptPrivacy") &&
        authPage.includes("ageAffirmed") &&
        authPage.includes("documentVersions") &&
        authPage.includes("EFFECTIVE_DATE")
    );
    ok(
      "both affirmations are required before the account request is sent",
      authPage.includes("if (mode === \"register\" && (!agree || !age))") &&
        authPage.includes("Both boxes are required")
    );
    ok(
      "the age statement is stated in words, not implied by a checkbox label",
      authPage.includes("16 or older") && authPage.includes("guardian")
    );

    // 2. The version the page sends must be the version the platform serves.
    //    These are two files in two trees that cannot import each other, and a
    //    drift between them makes every registration fail with a 409 — so the
    //    failure has to land here, in a suite, rather than on a sign-up form.
    const contractsPath = new URL("../../platform/packages/contracts/src/index.ts", import.meta.url);
    if (existsSync(contractsPath)) {
      const contractsSrc = readFileSync(contractsPath, "utf8");
      ok(
        "the front door and the platform agree on the document version they serve",
        contractsSrc.includes(`terms: "${LEGAL.EFFECTIVE_DATE}"`) &&
          contractsSrc.includes(`privacy: "${LEGAL.EFFECTIVE_DATE}"`),
        `front door sends ${LEGAL.EFFECTIVE_DATE}; contracts must list the same terms/privacy version`
      );
      // 3. The retention the notice prints has a code counterpart, and the
      //    answered-request record keeps what California asks it to keep.
      const rightsPath = new URL("../../platform/services/auth/src/rights.ts", import.meta.url);
      const rightsSrc = existsSync(rightsPath) ? readFileSync(rightsPath, "utf8") : "";
      ok(
        "the retention schedule the notice prints is enforced by a sweep in code",
        rightsSrc.includes("export async function pruneRetention") &&
          rightsSrc.includes("24 months") &&
          rightsSrc.includes("DELETE FROM refresh_tokens WHERE expires_at < now()")
      );
      ok(
        "an erasure cuts off the credential before deleting the account, in one statement",
        rightsSrc.includes("deleted_subject_revocations") &&
          rightsSrc.includes("WITH counts AS (") &&
          rightsSrc.includes("DELETE FROM users WHERE id = $1")
      );
      ok(
        "the deletion response names what it keeps and the basis for keeping it",
        rightsSrc.includes("ERASURE_RETENTIONS") && rightsSrc.includes("legal-obligation")
      );
    } else {
      console.log("  ~ skipped the platform/contracts assertions (no platform tree in this checkout)");
    }

    // 4. The page where the rights actually work, and the two that must be
    //    immediate rather than promised.
    const accountPagePath = new URL("../src/routes/account/+page.svelte", import.meta.url);
    ok("the data-rights hub exists at /account", existsSync(fileURLToPath(accountPagePath)));
    const accountPage = existsSync(accountPagePath) ? readFileSync(accountPagePath, "utf8") : "";
    ok(
      "/account offers the export, the erasure and the request ledger",
      accountPage.includes("session.exportAuth()") &&
        accountPage.includes("session.deleteAccount(") &&
        accountPage.includes("session.fileRightsRequest(") &&
        accountPage.includes("session.withdrawConsent(")
    );
    ok(
      "/account states that the self-service route is not the only route",
      accountPage.includes("not the only one") && accountPage.includes("cannot sign in")
    );
    {
      // The typed word is enforced in two places, and both are asserted: the page
      // will not arm the button until the learner has typed it, and the client
      // sends it as a literal the platform's schema also demands — so a re-built
      // form cannot quietly turn an irreversible action back into one click.
      const sessionSrc = readFileSync(new URL("../src/lib/session.svelte.ts", import.meta.url), "utf8");
      ok(
        "erasure is confirmed by a typed word, not a checkbox",
        accountPage.includes('confirmText !== "DELETE"') &&
          accountPage.includes("eraseArmed") &&
          sessionSrc.includes('confirm: "DELETE"')
      );
    }
    ok(
      "/account shows what is retained after a deletion, with the basis",
      accountPage.includes("deletion.retained") && accountPage.includes("basis")
    );

    // 5. Consumer pre-contract terms, before the price and in the same place as
    //    the decision (California's ARL as amended by AB 2863; EU/UK distance
    //    selling). The five facts live in $lib/legal so the page, the terms and
    //    the checkout cannot describe one subscription three ways.
    const pricingPage = readFileSync(new URL("../src/routes/pricing/+page.svelte", import.meta.url), "utf8");
    ok(
      "the pricing page prints the renewal, cancellation, refund and withdrawal terms",
      pricingPage.includes("SUBSCRIPTION_TERMS") &&
        ["renewal", "cancellation", "refund", "withdrawal", "priceChange"].every((k) =>
          Object.prototype.hasOwnProperty.call(LEGAL.SUBSCRIPTION_TERMS, k)
        )
    );
    ok(
      "the consumer terms are before the money, not only on the terms page",
      pricingPage.indexOf("SUBSCRIPTION_TERMS") > 0 && pricingPage.includes("Before you pay")
    );

    // 6. The California-shaped choices page: the no-sale statement, the
    //    no-account-needed rule, and no switch for a thing that never happens.
    const choicesPage = readFileSync(
      new URL("../src/routes/privacy-choices/+page.svelte", import.meta.url),
      "utf8"
    );
    ok(
      "the choices page states that nothing is sold or shared, and keeps the right",
      choicesPage.includes("is sold, rented, or shared") &&
        choicesPage.includes("Global Privacy Control") &&
        choicesPage.includes("RIGHT_KINDS")
    );
    ok(
      "the choices page advertises a route that needs no account and no fee",
      choicesPage.includes("PRIVACY_CONTACT") &&
        choicesPage.includes("no account required") &&
        choicesPage.includes("no charge")
    );

    // 7. The AI Act's Article 50 disclosure, in the product, in words a person
    //    reads before they use an assistant — plus the statement this product can
    //    actually prove: no model decides an assessment.
    const aiPage = readFileSync(new URL("../src/routes/ai/+page.svelte", import.meta.url), "utf8");
    ok(
      "the AI page carries the interaction disclosure and the no-AI-decides statement",
      aiPage.includes("AI_DISCLOSURE.interaction") &&
        aiPage.includes("AI_DISCLOSURE.decides") &&
        aiPage.includes("AI_DISCLOSURE.transfer")
    );
    ok(
      "the AI page names every system it bundles, with its provider",
      aiPage.includes("AI_SYSTEMS") && LEGAL.AI_SYSTEMS.length >= 3 &&
        LEGAL.AI_SYSTEMS.every((s) => s.provider.length > 2 && s.sends.length > 10)
    );
    ok(
      "the AI disclosure says no AI grades work, in the product's own words",
      /no AI grades your work/i.test(LEGAL.AI_DISCLOSURE.decides) &&
        /deterministic rule engine/i.test(LEGAL.AI_DISCLOSURE.decides)
    );

    // 8. The notice points at the mechanisms instead of describing a product
    //    that no longer matches — the direction this assertion fails in matters.
    const privacySrc = readFileSync(new URL("../src/routes/privacy/+page.svelte", import.meta.url), "utf8");
    ok(
      "the privacy notice links the account controls, the choices page and the AI page",
      privacySrc.includes('href="/account"') &&
        privacySrc.includes('href="/privacy-choices"') &&
        privacySrc.includes('href="/ai"')
    );
    ok(
      "the privacy notice no longer claims the deletion control is unbuilt",
      !/self-serve delete button does not exist/i.test(privacySrc)
    );

    // 9. The regime dates are stated, because a claim about a duty is only
    //    checkable with the date beside it: India's DPDP duties are not in force
    //    until May 2027, the AI Act's transparency duty has been in force since
    //    August 2026, and saying so is more honest than claiming both.
    ok(
      "each regime's status is published with its date",
      LEGAL.REGIME_DATES.length >= 6 &&
        LEGAL.REGIME_DATES.some((r) => /DPDP/.test(r.regime) && /2027/.test(r.date)) &&
        LEGAL.REGIME_DATES.some((r) => /AI Act/.test(r.regime) && /2026/.test(r.date))
    );
  }
}

console.log("\n== identity and billing: one token boundary, one checkout path ==");
{
  // Phase 3 + 6.2. Clerk and Dodo join through narrow, named doors: the only
  // module that imports clerk-js is lib/clerk.ts, the only page that mounts
  // it is /auth, everything else reads session.token, every checkout starts
  // in lib/billing.ts.
  const withClerkJs = srcFiles.filter((f) => readFileSync(f, "utf8").includes("@clerk/clerk-js"));
  ok(
    "clerk-js is imported in exactly one module",
    withClerkJs.length === 1 && withClerkJs[0].endsWith("lib/clerk.ts")
  );
  const mountingClerk = srcFiles.filter(
    (f) => f.endsWith(".svelte") && readFileSync(f, "utf8").includes("$lib/clerk")
  );
  ok(
    "and mounted by exactly one page",
    mountingClerk.length === 1 && mountingClerk[0].endsWith("routes/auth/+page.svelte")
  );
  const checkoutCallers = srcFiles.filter((f) => readFileSync(f, "utf8").includes("session.checkout("));
  ok(
    "every checkout starts in the one billing helper",
    checkoutCallers.length === 1 && checkoutCallers[0].endsWith("lib/billing.ts")
  );

  const sessionSrc = readFileSync(new URL("../src/lib/session.svelte.ts", import.meta.url), "utf8");
  ok(
    "the session accepts an external token, provisions the profile row, and refreshes through a provider",
    sessionSrc.includes("useExternalToken") &&
      sessionSrc.includes("linkClerkProfile") &&
      sessionSrc.includes("setTokenProvider") &&
      sessionSrc.includes("resolveToken") &&
      sessionSrc.includes("/api/auth/link")
  );

  // L-3 + M-1. A session is two credentials with two homes: a minutes-long
  // access token the page holds, and a thirty-day refresh token in an HttpOnly
  // cookie the page cannot read. Either half alone is the failure those findings
  // described — a cookie nothing spends, or a client holding a credential it can
  // never renew.
  const brokerSrc = readFileSync(new URL("../src/lib/server/session-broker.ts", import.meta.url), "utf8");
  ok(
    "the refresh token lives in an HttpOnly cookie, scoped to the session endpoints",
    brokerSrc.includes('REFRESH_COOKIE = "nexora_refresh"') &&
      brokerSrc.includes("httpOnly: true") &&
      brokerSrc.includes('sameSite: "lax"') &&
      brokerSrc.includes('COOKIE_PATH = "/auth/session"')
  );
  ok(
    "and the app's own server sets it, so the cookie is same-site by construction",
    brokerSrc.includes("GATEWAY_URL") && brokerSrc.includes("gatewayBase")
  );
  ok(
    "every session endpoint exists on the app's origin",
    ["login", "register", "refresh", "logout", "logout-all"].every((name) =>
      existsSync(new URL(`../src/routes/auth/session/${name}/+server.ts`, import.meta.url))
    )
  );
  ok(
    "the sign-in reply carries the access token and never the refresh token",
    (() => {
      const src = readFileSync(new URL("../src/routes/auth/session/login/+server.ts", import.meta.url), "utf8");
      const reply = src.slice(src.lastIndexOf("return json({"));
      return reply.includes("accessToken") && !reply.includes("refreshToken");
    })()
  );
  ok(
    "the client stores no refresh token and renews through the cookie",
    !sessionSrc.includes("refreshToken") &&
      sessionSrc.includes('SESSION_BASE = "/auth/session"') &&
      sessionSrc.includes("REFRESH_PATH") &&
      sessionSrc.includes("LOGOUT_PATH")
  );
  // Sign-out has to end the credential, not just the ability to renew it. The
  // page sends the access token it is holding to its own server, which passes it
  // to the service; the service records that token's jti and the gateway refuses
  // it from the next request on. Drop either half of that hand-off and sign-out
  // silently goes back to "the token keeps working for the rest of its TTL" —
  // which is exactly the gap this closes, so both halves are asserted here.
  const logoutRouteSrc = readFileSync(
    new URL("../src/routes/auth/session/logout/+server.ts", import.meta.url),
    "utf8"
  );
  ok(
    "signing out presents the access token, so the server can revoke that exact credential",
    sessionSrc.includes("authorization: `Bearer ${token}`") && logoutRouteSrc.includes("accessToken: presented")
  );
  // "Sign out everywhere" needs the same hand-off for the same reason, and it is
  // the one account action that has to report failure: the sessions it ends are on
  // devices the learner cannot see, so a silent failure would tell them everyone
  // else was signed out when nobody was.
  ok(
    "signing out everywhere names the account with a real token and reports what happened",
    sessionSrc.includes("async logoutEverywhere(") &&
      sessionSrc.includes("LOGOUT_ALL_PATH") &&
      sessionSrc.includes('headers: { authorization: `Bearer ${token}` }') &&
      sessionSrc.includes("may still be signed in") &&
      readFileSync(
        new URL("../src/routes/auth/session/logout-all/+server.ts", import.meta.url),
        "utf8"
      ).includes("accessToken: presented")
  );
  // The access token is memory-only. What makes that worth asserting is that it is
  // easy to undo by accident — one line adding persistence would look harmless and
  // would put a bearer credential back where any script on the origin can read it
  // (Missing Security Controls #4).
  ok(
    "the access token is never written to storage, and the old key is dropped",
    !sessionSrc.includes("setItem") && sessionSrc.includes("LEGACY_TOKEN_KEY")
  );
  ok(
    "so a reload re-earns the session from the cookie — and says so, rather than claiming signed out",
    sessionSrc.includes("async restore(") &&
      sessionSrc.includes("await this.refresh()") &&
      sessionSrc.includes("restoring")
  );
  // Every rendering surface that can say "you have no session" has to wait for the
  // answer, or a signed-in learner meets a sign-in prompt on every reload for as
  // long as the round trip takes.
  const claimsASession = srcFiles.filter(
    (f) => f.endsWith(".svelte") && readFileSync(f, "utf8").includes("session.loggedIn")
  );
  ok(
    `every surface that can claim a session is missing waits until it is known (${claimsASession.length} surfaces)`,
    claimsASession.length >= 4 && claimsASession.every((f) => readFileSync(f, "utf8").includes("session.restoring"))
  );
  ok(
    "it renews on a timer as well as retrying a 401, so a stale token is replaced rather than surfaced",
    sessionSrc.includes("setTimeout") && sessionSrc.includes("this.refresh()") && sessionSrc.includes("resolveToken")
  );

  const headerSrc = readFileSync(new URL("../src/lib/components/Header.svelte", import.meta.url), "utf8");
  ok(
    "the header is a front door, not a classroom: it links no browser mission, search, or resume CTA",
    !headerSrc.includes('href="/mission') &&
      !headerSrc.includes("site-search") &&
      !headerSrc.includes("recommend(")
  );

  /* The masthead. The chrome used to be a small wordmark, five inline links and a
     button sharing one line — the shape every SaaS page has — plus a second,
     narrow-screen copy of the same five links, which is two places for the
     current-section marker to be wrong. It is now the shape the genre actually
     has, and each part of that shape is here because something depends on it. */
  ok(
    "the masthead sets the paper's name at display size, and the way home is the word itself rather than a label",
    headerSrc.includes('class="nameplate"') &&
      /class="display block text-\[clamp\(/.test(headerSrc) &&
      headerSrc.includes('<span class="sr-only">Home</span>')
  );
  ok(
    "the nameplate link is the width of the word, not an invisible home hotspot across the top of the page",
    /\.nameplate\s*\{[^}]*display:\s*inline-flex/.test(headerSrc)
  );
  ok(
    "and it clears the thumb floor like every other control in the chrome",
    /\.nameplate\s*\{[^}]*min-height:\s*44px/.test(headerSrc)
  );
  ok(
    "the edition line sits on its own rule, instead of floating over the nameplate as small print",
    headerSrc.includes("border-b border-rule py-3 sm:py-1")
  );
  ok(
    "and the actions on that line are 44px targets, not the 36px house stock",
    !/min-h-\[3[0-9]px\]/.test(headerSrc) && headerSrc.includes("min-h-[44px]")
  );
  ok(
    "the sections are one folio for every width, not a desktop row plus a narrow-screen copy of it",
    (headerSrc.match(/<nav /g) ?? []).length === 1 && headerSrc.includes("{#each NAV as item (item.href)}")
  );
  ok(
    "the folio is a sibling of the masthead, because a sticky bar nested inside a header unsticks the moment the header ends",
    headerSrc.indexOf("</header>") > 0 &&
      headerSrc.indexOf("</header>") < headerSrc.indexOf('class="folio sticky top-0')
  );
  ok(
    "and only the folio is sticky: the nameplate scrolls away with the page it belongs to",
    !/class="masthead[^"]*sticky/.test(headerSrc)
  );
  ok(
    "a folio cell is a 44px thumb target at every width, the same as a pointer target",
    /\.folio-link\s*\{[^}]*min-height:\s*44px/.test(headerSrc)
  );
  ok(
    "the current section is marked from the one list the links come from, so a link added to NAV is marked without a second edit",
    headerSrc.includes("aria-current={currentKind(item.href)}") && headerSrc.includes("NAV.filter")
  );

  /* A focus ring has to be there when focus lands. Tailwind's `transition-colors`
     also covers `outline-color`, so a control whose transition is "colours"
     animates its ring in from its own text colour — on the accent-filled button
     that is the newsprint ground, i.e. invisible, and measured reaching the
     accent only at 200ms. Focus is not a hover: it does not get to fade in. */
  const colorTransitioners = srcFiles.filter(
    (f) => f.endsWith(".svelte") && readFileSync(f, "utf8").includes("transition-colors")
  );
  ok(
    `no component lets its focus ring fade in (${colorTransitioners.length} file(s) transition "colors")`,
    colorTransitioners.length === 0
  );
  ok(
    "and the shared action vocabulary names the properties it moves, for the same reason",
    readFileSync(new URL("../src/lib/ui.ts", import.meta.url), "utf8").includes(
      "transition-[color,background-color,border-color,transform] duration-200"
    )
  );

  const authSrc = readFileSync(new URL("../src/routes/auth/+page.svelte", import.meta.url), "utf8");
  ok(
    "the account page keeps the local-mode story and the password forms",
    authSrc.includes("cloud accounts not connected") &&
      authSrc.includes('type="password"') &&
      authSrc.includes("bcrypt-hashed")
  );
  ok(
    "its Clerk branch mounts both forms and names both failure states",
    authSrc.includes("mountClerkAuth") && authSrc.includes("two ways in") && authSrc.includes("sign-in is unreachable")
  );

  const pricingSrc = readFileSync(new URL("../src/routes/pricing/+page.svelte", import.meta.url), "utf8");
  ok(
    "pricing renders the API's plans and prints the one decided price from the copy module",
    pricingSrc.includes("session.plans()") &&
      pricingSrc.includes("PRICING") &&
      pricingSrc.includes("The plan is priced and it is not on sale yet") &&
      // One price, one source: the number on the page is the number in the
      // copy module, so the page cannot drift from the decision.
      pricingSrc.includes("money(PRICING.monthly)") &&
      pricingSrc.includes("money(PRICING.annual)") &&
      COPY.PRICING.monthly > 0 &&
      Number.isInteger(COPY.PRICING.monthly) &&
      // And it is not written into the page as a literal, where it would be a
      // second copy of the same number. Not one amount, not even the free
      // one: the free price comes out of the module as well.
      !/\$[0-9]/.test(pricingSrc)
  );
  ok(
    "its upgrade path is the shared checkout, and prices live on the provider's page",
    pricingSrc.includes("startCheckout") && pricingSrc.includes("Dodo Payments")
  );
  // D-012's billing-trust rules. These are promises the product makes before it
  // has a price to sell, so the loudest reputational failure in this category
  // cannot be reintroduced silently by a copy edit: a page that quietly drops
  // "cancel in two clicks" fails here. The guarantee is only as good as the
  // assertion guarding it.
  // Svelte wraps this prose across lines, so the source is compared with
  // whitespace collapsed: the assertion is about the promise being stated, not
  // about how the formatter happened to break the line.
  // The promises themselves live in the shared copy module — the same module
  // the page renders from — so a promise cannot be dropped from the page by
  // removing it from here, and cannot survive here while vanishing from the
  // page. Svelte wraps prose across lines, so the source is compared with
  // whitespace collapsed: the assertion is about the promise being stated, not
  // about how the formatter happened to break the line.
  const copyFlat = readFileSync(new URL("../src/lib/content/site.ts", import.meta.url), "utf8").replace(
    /\s+/g,
    " "
  );
  ok(
    "pricing states the billing commitments: no surprise renewal, two-click cancel, visible PPP",
    copyFlat.includes("The renewal date is shown before you pay") &&
      copyFlat.includes("Cancel in two clicks.") &&
      copyFlat.includes("applied as a discount you can see")
  );
  ok(
    "and it promises that no check is ever behind the paywall",
    copyFlat.includes("No check is ever behind the paywall")
  );
  ok(
    "the pricing page renders those promises rather than restating them",
    pricingSrc.includes("BILLING_COMMITMENTS")
  );
  // The free tier is the front door's own offer: the base course inside the
  // IDE, every check free, further courses per tier. Asserted on the page
  // because that is where the promise is made to a learner.
  ok(
    "the free tier still promises the bundled free phases, free checks, and tier-unlocked courses",
    copyFlat.includes("Nine phases bundled with the IDE") &&
      copyFlat.includes("Every check and verdict, free forever") &&
      copyFlat.includes("Further courses per your tier") &&
      pricingSrc.includes("PRICING_PLANS") &&
      (COPY.PRICING_PLANS.find((plan) => plan.id === "free")?.points ?? []).length ===
        COPY.FREE_TIER_POINTS.length
  );
  ok(
    "and it links nowhere but the download — the IDE is the only way to learn",
    pricingSrc.includes('href="/download"') &&
      !pricingSrc.includes('href="/roadmap"') &&
      !pricingSrc.includes('href="/mission')
  );

  const profileSrc = readFileSync(new URL("../src/routes/profile/+page.svelte", import.meta.url), "utf8");
  ok(
    "a checkout return says pending until the provider confirms — the redirect grants nothing",
    profileSrc.includes('searchParams.get("checkout")') &&
      profileSrc.includes("redirect itself grants nothing") &&
      profileSrc.includes("billingLoaded = false")
  );
  ok(
    "the profile holds the account, the plan, and verified proof — never browser progress, XP, or a curriculum record",
    !profileSrc.includes("store.svelte") &&
      !profileSrc.includes("ALL_MISSIONS") &&
      !profileSrc.includes("progress.state") &&
      profileSrc.includes("/auth/ide") &&
      profileSrc.includes('session.myProofs()') &&
      profileSrc.includes('"/api/proofs"') === false
  );
  // The proofs call lives on the session store, not inline in the page: the
  // page renders state, the store owns the bearer. Assert both halves
  // (`sessionSrc` is read once above for the session gates).
  ok(
    "verified rows come only from the attested endpoint, through the session bearer",
    sessionSrc.includes('"/api/proofs"') &&
      sessionSrc.includes("resolveToken()") &&
      profileSrc.includes("myProofs")
  );
  ok(
    "verified rows render the endpoint's own fields — never a hardcoded phase or tier",
    profileSrc.includes("pr.competencyId") &&
      profileSrc.includes("pr.kind") &&
      profileSrc.includes("pr.issuedAt")
  );
  ok(
    "the empty ledger says what it is: no verified runs, practice stays in the IDE",
    profileSrc.includes("No verified runs yet") &&
      profileSrc.includes("Practice stays in the IDE")
  );
  // D-014 in affirmative form: these must never appear as claims on the
  // profile. Bare-word matching would forbid an honest sentence explaining
  // what is not claimed, so each pattern names a claim shape. (The brand
  // gate already scans rendered copy for FORBIDDEN_WORDS; this pins the
  // profile source against the same list plus verdict words.)
  const claim = (re: RegExp): boolean => re.test(profileSrc);
  ok(
    "the profile never claims a credential, rank, or proof it does not hold",
    !claim(/\bcertificate\b/i) &&
      !claim(/\bcertification\b/i) &&
      !claim(/\bcredential\b/i) &&
      !claim(/\bmastery\b/i) &&
      !claim(/\bAI-powered\b/i) &&
      !claim(/\b10x\b/i) &&
      !claim(/\bhas been proven\b/i) &&
      !claim(/\bhave been proven\b/i) &&
      !claim(/\bPortfolio\b/i)
  );
  ok(
    "both tiers are named: verified rows and the practice that stays local",
    profileSrc.includes("Verified means the platform signed it") &&
      profileSrc.includes("Practice stays in the IDE")
  );
  ok(
    "every verified row links the receipt check, not a trophy case",
    (() => {
      const start = profileSrc.indexOf("{#each proofs");
      if (start === -1) return false;
      const block = profileSrc.slice(start, profileSrc.indexOf("{/each}", start));
      return block.includes('href="/verify"');
    })()
  );
  ok(
    "sitemap advertises the pricing page",
    sitemapPaths().includes("/pricing")
  );

  // The curriculum gate. The manifest is the truth and it moves: the course
  // list was split while this suite was being written, and a split that only
  // half lands is exactly the failure a drift gate exists to catch. So the
  // comparison is EQUALITY, course by course: the same courses, the same
  // titles, the same roles, the same phases in the same order, and the same
  // tier on each phase. A subset check would let a course that does not ship
  // stay on the page, and a count-only check would let a phase be renamed or
  // moved without a word. Absent (a front-door-only checkout), say so rather
  // than pass silently.
  const shippedDir = new URL(
    "../../../nexora-ide/extensions/nexora/curriculum/shipped/",
    import.meta.url
  );
  const registry = new URL("index.json", shippedDir);
  let manifestIds: string[] | null = null;
  let manifestCourses: {
    id: string;
    title: string;
    role: string;
    phases: { id: string; title: string; tier: string }[];
  }[] = [];
  let registryMissing = false;
  try {
    const index = JSON.parse(readFileSync(registry, "utf8")) as {
      courses: { id: string; manifest: string }[];
    };
    manifestCourses = index.courses.map((course) => {
      const manifest = JSON.parse(readFileSync(new URL(course.manifest, shippedDir), "utf8")) as {
        id: string;
        title: string;
        role: string;
        phases: { id: string; title: string; tier: string }[];
      };
      return {
        id: manifest.id,
        title: manifest.title,
        role: manifest.role ?? "main",
        phases: manifest.phases,
      };
    });
    manifestIds = manifestCourses.flatMap((course) => course.phases.map((phase) => phase.id));
  } catch {
    manifestIds = null;
    registryMissing = existsSync(fileURLToPath(shippedDir));
  }
  if (manifestIds === null) {
    // A registry that is missing while its directory is present is a failure,
    // not a reason to skip: the gate used to go quiet exactly when it was
    // needed, and the site kept claiming a curriculum that had moved on.
    ok(
      "the curriculum registry is there when the shipped curriculum is",
      !registryMissing,
      registryMissing
        ? "the shipped curriculum directory exists but its index.json could not be read"
        : undefined
    );
    if (!registryMissing) {
      console.log("  (course-list drift not checked: nexora-ide sibling absent)");
    }
  } else {
    // The phase lists live in the content module with the copy, and the page
    // renders them from there. The gate reads the same exports the page
    // renders, so a phase that ships and is not on the page fails here.
    const siteCourses = COPY.COURSES.map((course) => ({
      slug: course.slug,
      title: course.title,
      role: course.role,
      phases: course.phases,
    }));

    // 1. The same courses, no more and no fewer.
    const shippedCourseIds = manifestCourses.map((course) => course.id);
    const siteCourseIds: string[] = siteCourses.map((course) => course.slug);
    ok(
      `the site names exactly the shipped courses (${siteCourseIds.length} on the site, ${shippedCourseIds.length} shipped)`,
      siteCourseIds.length === shippedCourseIds.length &&
        shippedCourseIds.every((id) => siteCourseIds.includes(id)) &&
        siteCourseIds.every((id) => shippedCourseIds.includes(id)),
      `site: ${siteCourseIds.join(", ")}\nshipped: ${shippedCourseIds.join(", ")}`
    );

    // 2. Course by course: the title, the role, and every phase in order,
    //    with its name and its tier. This is equality, not a subset.
    for (const course of manifestCourses) {
      const site = siteCourses.find((c) => c.slug === course.id);
      const shippedPhases = course.phases;
      const sitePhases = site ? site.phases : [];
      const same =
        site !== undefined &&
        site.title === course.title &&
        site.role === course.role &&
        sitePhases.length === shippedPhases.length &&
        shippedPhases.every(
          (phase, i) =>
            sitePhases[i]?.[0] === phase.id &&
            sitePhases[i]?.[1] === phase.title &&
            sitePhases[i]?.[2] === phase.tier
        );
      ok(
        `the site and the manifest are the same course "${course.id}" (${shippedPhases.length} phases, same order, same names, same tiers)`,
        same,
        site === undefined
          ? `the site does not name "${course.id}"`
          : `site: ${site.phases.map(([id]) => id).join(", ")}\nshipped: ${shippedPhases.map((phase) => phase.id).join(", ")}`
      );
    }

    // 3. The curriculum answer on the front page names every course and says
    //    how deep it is, so the sentence cannot drift away from the lists.
    const curriculumAnswer =
      COPY.FAQ.find((item) => item.q === "What is actually in the curriculum?")?.a ?? "";
    ok(
      "the curriculum answer names every course with its depth",
      siteCourses.every(
        (course) =>
          curriculumAnswer.includes(course.title) &&
          curriculumAnswer.includes(`${course.phases.length} phases`)
      )
    );

    // 4. The counts, from the manifest and from the site.
    const shippedFree = manifestCourses
      .flatMap((course) => course.phases)
      .filter((phase) => phase.tier === "free").length;
    const shippedPro = manifestIds.length - shippedFree;
    ok(
      `the site's free phases are the shipped free phases (${shippedFree})`,
      COPY.FREE_PHASE_COUNT === shippedFree
    );
    ok(
      `the site's paid phases are the shipped paid phases (${shippedPro})`,
      COPY.PRO_PHASE_COUNT === shippedPro
    );
    ok(
      "the site's phase list is the manifest's list, with nothing added and nothing left out",
      COPY.ALL_PHASES.length === manifestIds.length &&
        manifestIds.every((id) => COPY.ALL_PHASES.some(([siteId]) => siteId === id)) &&
        new Set(COPY.ALL_PHASES.map(([id]) => id)).size === COPY.ALL_PHASES.length
    );

    // 4. The price opens the phases the manifest ships, not a remembered
    //    number that happens to be right today.
    ok(
      "the price counts the shipped phases, not a remembered number",
      COPY.PRICING.freePhases === shippedFree && COPY.PRICING.paidPhases === shippedPro
    );

    // 5. The headline count is prose, and prose drifts first. Turn the shipped
    //    total into its English word and require it — adding a phase without
    //    updating the headline fails here, not in a learner's screenshot.
    const words = numberWords(manifestIds.length);
    ok(
      "the count the page states matches the shipped total",
      words !== null && copyFlat.toLowerCase().includes(`${words} phases`)
    );

    // The readings on the bench carry the counts too, and they drift the same
    // way. The free count is the one a learner acts on: it is what the free
    // tier actually opens, so it has to be the shipped number.
    const freeFact = COPY.FACTS.find((fact) => fact.label.includes("free"));
    ok(
      `the free-phase reading matches the shipped free phases (${shippedFree})`,
      freeFact !== undefined && freeFact.value === String(shippedFree)
    );
    const phaseFact = COPY.FACTS.find((fact) => fact.label.includes("phases"));
    ok(
      `the phase reading matches the shipped total (${manifestIds.length})`,
      phaseFact !== undefined && phaseFact.value === String(manifestIds.length)
    );
    ok(
      "the masthead's status states the shipped counts, and does not count the courses",
      COPY.MASTHEAD.status.includes(`${manifestIds.length} phases`) &&
        COPY.MASTHEAD.status.includes(`${shippedFree} free`) &&
        // A count of courses reads as a count of videos. The names read as
        // range, so the status line counts phases and says nothing about how
        // many courses there are.
        !COPY.MASTHEAD.status.includes("courses")
    );

    // 6. The site never leads with a count of courses. It names them.
    const courseCount = /(\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b|\d+)\s+courses?\b/i;
    const publicCopy = JSON.stringify([
      COPY.HERO,
      COPY.HIRING,
      COPY.AUDIENCES,
      COPY.SPEC,
      COPY.EMPLOYER,
      COPY.FACTS,
      COPY.WEDGE,
      COPY.STEPS,
      COPY.DISCLOSURE,
      COPY.NO_LIST,
      COPY.FAQ,
      COPY.BILLING_COMMITMENTS,
      COPY.FREE_TIER_POINTS,
      COPY.PRICING_PLANS,
      COPY.NOT_SOLD,
      COPY.CURRICULUM,
      COPY.MASTHEAD,
      COPY.NAV,
      COPY.FOOTER_LINKS,
      COPY.POSITIONING,
      COPY.TAGLINE,
    ]);
    ok("the copy names the courses and never counts them", !courseCount.test(publicCopy));
    const routeCopy = srcFiles
      .filter((f) => f.includes("/routes/"))
      .map((f) =>
        readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/<!--[\s\S]*?-->/g, "")
      );
    ok("and no public page counts them either", !routeCopy.some((src) => courseCount.test(src)));

    // 7. The homepage shows the courses by name and by depth, and does not
    //    print what a phase costs. A phase row with a price on it is a
    //    catalogue, and this page is not a catalogue.
    const courseComponents = ["CourseLedger.svelte", "PhaseMatrix.svelte", "PhaseField.svelte"].map(
      (name) => readFileSync(new URL(`../src/lib/components/${name}`, import.meta.url), "utf8")
    );
    ok(
      "the homepage prints every course by name with its phase count",
      courseComponents[0]!.includes("{course.title}") &&
        courseComponents[0]!.includes("{course.phases.length} phases")
    );
    ok(
      "and no public course surface labels a phase with its tier",
      !courseComponents.some((src) => /phase\[2\]|picked\.tier|<TierStamp/.test(src))
    );
    const fieldSrc = readFileSync(new URL("../src/lib/three/field.ts", import.meta.url), "utf8");
    ok(
      "and the field does not colour a point by what it costs",
      !/tier === "free"/.test(fieldSrc)
    );
  }

  // The price, in three lines, decided and printed from one place.
  {
    const pricingPage = readFileSync(
      new URL("../src/routes/pricing/+page.svelte", import.meta.url),
      "utf8"
    );
    const money = COPY.money;
    ok(
      "the decided prices are the ones that were decided, and they agree with each other",
      COPY.PRICING.monthly === 29 &&
        COPY.PRICING.annual === 290 &&
        COPY.PRICING.annual === COPY.PRICING.monthly * 10 &&
        COPY.PRICING.teams.perLearnerMonthly === COPY.PRICING.monthly &&
        COPY.PRICING.teams.minLearners === 5 &&
        COPY.PRICING.teams.billedYearly === true &&
        COPY.PRICING.free === 0
    );
    const freePlan = COPY.PRICING_PLANS.find((plan) => plan.id === "free");
    const proPlan = COPY.PRICING_PLANS.find((plan) => plan.id === "pro");
    const teamsPlan = COPY.PRICING_PLANS.find((plan) => plan.id === "teams");
    ok(
      "the free line is the first hour, and it is the free phases and the free checks",
      freePlan !== undefined &&
        freePlan.price === money(COPY.PRICING.free) &&
        freePlan.priceNote === "the first hour" &&
        freePlan.points.some((point) =>
          point.includes("Nine phases bundled with the IDE, offline, no account")
        ) &&
        freePlan.points.some((point) => point.includes("Every check and verdict, free forever"))
    );
    ok(
      "the pro line is the whole curriculum, at the monthly or the yearly price",
      proPlan !== undefined &&
        proPlan.price === money(COPY.PRICING.monthly) &&
        proPlan.priceNote.includes(money(COPY.PRICING.annual)) &&
        proPlan.points.some((point) => point.includes(`${COPY.ALL_PHASES.length} phases`)) &&
        proPlan.points.some((point) => point.includes("Hosted runs")) &&
        proPlan.points.some((point) => point.includes("New phases as they land"))
    );
    ok(
      "the teams line reads its per-learner price from the one constant",
      teamsPlan !== undefined &&
        teamsPlan.price === money(COPY.PRICING.teams.perLearnerMonthly) &&
        teamsPlan.priceNote === "per learner per month, billed yearly" &&
        teamsPlan.points.some((point) =>
          point.includes(`${COPY.PRICING.teams.minLearners} learners or more`)
        ) &&
        teamsPlan.points.some((point) => point.includes("one invoice")) &&
        teamsPlan.points.some((point) => point.includes("verified-evidence link"))
    );
    ok(
      "there are three lines, and the page prints all three from the module",
      COPY.PRICING_PLANS.length === 3 && pricingPage.includes("PRICING_PLANS")
    );
    ok(
      "the page writes no amount of its own, and does not restate the teams rule",
      !/\$[0-9]/.test(pricingPage) && !pricingPage.includes("per learner per month")
    );
    ok(
      "the page says checkout is not on sale yet, and that the provider must carry the same price",
      pricingPage.includes("The plan is priced and it is not on sale yet") &&
        pricingPage.includes("configured with the same number")
    );
    ok(
      "and it offers no dead checkout button: the checkout only appears when the provider has plans",
      pricingPage.indexOf("plans.length === 0") < pricingPage.indexOf("upgrade(pl.slug)") &&
        !/Subscribe|Buy now|Upgrade now/.test(pricingPage)
    );
    ok(
      "what is not sold is stated plainly, in the words that were decided",
      COPY.NOT_SOLD.length === 4 &&
        ["certificates", "leaderboards", "AI grading", "content packs"].every((word) =>
          COPY.NOT_SOLD.some((line) => line.toLowerCase().includes(word.toLowerCase()))
        ) &&
        pricingPage.includes("NOT_SOLD")
    );
  }

  // The employer contact path: one real way for a hiring manager to reach a
  // person, with the same privacy treatment as the launch list.
  {
    const employersSrc = readFileSync(
      new URL("../src/routes/employers/+page.svelte", import.meta.url),
      "utf8"
    );
    const enquirySrc = readFileSync(
      new URL("../src/lib/components/HiringEnquiry.svelte", import.meta.url),
      "utf8"
    );
    const mailEndpointSrc = readFileSync(
      new URL("../src/routes/api/mail/+server.ts", import.meta.url),
      "utf8"
    );
    const privacyPageSrc = readFileSync(
      new URL("../src/routes/privacy/+page.svelte", import.meta.url),
      "utf8"
    );
    const termsSrc = readFileSync(new URL("../src/routes/terms/+page.svelte", import.meta.url), "utf8");
    ok(
      "the hiring page gives an employer one real way to reach us",
      employersSrc.includes("HiringEnquiry") && employersSrc.includes("mailto:{HIRING_CONTACT}")
    );
    ok(
      "the form asks for a name, a work email, and what you are hiring for",
      enquirySrc.includes('id="hiring-name"') &&
        enquirySrc.includes('id="hiring-email"') &&
        enquirySrc.includes('id="hiring-need"')
    );
    ok(
      "and it sends through the same endpoint as the launch list",
      enquirySrc.includes('kind: "employer"') &&
        enquirySrc.includes('fetch("/api/mail"') &&
        mailEndpointSrc.includes('kind !== "employer"') &&
        mailEndpointSrc.includes("HIRING_CONTACT")
    );
    ok(
      "the page says what happens next, and only promises what can be kept",
      employersSrc.includes("HIRING_ENQUIRY.lead") &&
        employersSrc.includes("HIRING_ENQUIRY.next") &&
        COPY.HIRING_ENQUIRY.lead.includes(COPY.HIRING_ENQUIRY.replyTime) &&
        // A response time is a promise about a person reading a mailbox. The
        // site does not publish a time it cannot check, so the copy states the
        // commitment instead, and this fails if a time creeps back in.
        !/\b(?:working days|hours|minutes|24 hours|48 hours)\b/.test(
          `${COPY.HIRING_ENQUIRY.lead} ${COPY.HIRING_ENQUIRY.sent}`
        )
    );
    ok(
      "and it says plainly when the mail provider is not configured",
      enquirySrc.includes("notConfigured") &&
        employersSrc.includes("mailConfigured") &&
        COPY.HIRING_ENQUIRY.notConfigured.includes("no mail provider configured")
    );
    ok(
      "the privacy notice and the terms cover what the hiring form collects",
      privacyPageSrc.includes("what you are hiring for") &&
        privacyPageSrc.includes("hiring mailbox") &&
        termsSrc.includes("HIRING_CONTACT")
    );
    ok(
      "and the notice promises the same treatment the form makes",
      COPY.HIRING_ENQUIRY.privacy.includes("not added to a list") &&
        privacyPageSrc.includes("never added to a list")
    );
  }
}

console.log("\n== the contrast floor is computed from the tokens, not promised in a comment ==");
{
  // app.css states the floor in prose and DESIGN.md repeats it, but nothing
  // read the tokens back. These assertions keep both halves true: the table's
  // own arithmetic, and the source rules that stop a page from leaving it.
  const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
  const themeStart = css.indexOf("@theme");
  const theme = css.slice(themeStart, css.indexOf("\n}", themeStart));
  const tokens = new Map<string, string>();
  for (const m of theme.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (m[1] && m[2]) tokens.set(m[1], m[2].toLowerCase());
  }
  const token = (name: string): string => {
    const value = tokens.get(name);
    assert(value, `the theme declares --color-${name}`);
    return value;
  };
  const linear = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  // The four page surfaces plus the sheet: the artefact is a surface a visitor
  // reads on, so it is held to the same floor as the rest of the page rather
  // than trusted because it is white.
  // The two families are measured separately, and the reason is arithmetic
  // rather than taste: no colour can clear 4.5:1 against both a near-black and
  // a near-white surface, so one shared palette could only ever be measured
  // against one of them. The room has its own ink ramp, and the sheet has its
  // own four inks — which is why the amber lamp is never used on the sheet,
  // and why the sheet's verdict is printed in the paper's green and red
  // rather than in the room's.
  const surfaces = ["ground", "panel", "raised", "raised-2", "paper"];
  const darkSurfaces = ["ground", "panel", "raised", "raised-2"];
  const paperInks = ["paper-ink", "paper-muted", "pen", "pass"];
  const svelteFiles = srcFiles.filter((f) => f.endsWith(".svelte"));
  const shortName = (f: string): string => f.slice(f.replace(/\\/g, "/").lastIndexOf("/") + 1);

  ok(
    `the theme declares every surface and the ramp (${tokens.size} colour tokens)`,
    tokens.size >= 15 &&
      surfaces.every((s) => tokens.has(s)) &&
      ["ink", "muted", "faint", "rule", "control", "accent", "accent-dim"].every((t) => tokens.has(t))
  );

  // Three families is the ceiling: one display face, one body face, and at most
  // one outlier for a single typographic moment. A separate body sans used to be
  // a fourth here, doing a job the display grotesque's own text cut already
  // does. The font request is the other half of the claim — a family the page
  // does not draw with is still a family the visitor downloads.
  const themeVars = new Map<string, string>();
  for (const m of theme.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    if (m[1] && m[2]) themeVars.set(m[1], m[2].trim());
  }
  const firstFamily = (value: string): string => {
    let v = value.trim();
    for (let i = 0; i < 4; i++) {
      const name = v.match(/^var\(--([a-z0-9-]+)\)$/)?.[1];
      if (!name || !themeVars.has(name)) break;
      v = themeVars.get(name)!;
    }
    return v.match(/"([^"]+)"/)?.[1] ?? v.split(",")[0]!.trim();
  };
  const families = [
    ...new Set([...theme.matchAll(/--font-[a-z0-9-]+:\s*([^;]+);/g)].map((m) => firstFamily(m[1]!))),
  ];
  const htmlSrc = readFileSync(new URL("../src/app.html", import.meta.url), "utf8");
  ok(
    `the build uses three families and no more (${families.join(" + ")})`,
    families.length === 3 &&
      (htmlSrc.match(/family=/g) ?? []).length === families.length &&
      families.every((f) => htmlSrc.includes(`family=${f.replace(/ /g, "+")}`))
  );

  // A pure white surface and a pure black ground are the two values every screen
  // already has. Beside warm newsprint they read as flat and synthetic rather
  // than as stock, so neither belongs in the palette.
  // Prose is stripped before the scan: the note explaining why there is no
  // #ffffff is allowed to name it, and a rule that cannot be explained is a rule
  // nobody can safely change.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  const cssRules = stripComments(css);
  const svelteRules = svelteFiles.map((f) => stripComments(readFileSync(f, "utf8")));
  ok(
    "no surface is a value the screen already had: no pure white, no pure black",
    !/#ffffff\b/i.test(cssRules) &&
      !/#000000\b/i.test(cssRules) &&
      !svelteRules.some((src) => /\b(?:bg|text|border)-(?:white|black)\b/.test(src))
  );

  // The thumb floor, everywhere: a control may be narrow and small-set, but it
  // is never short. 36px was the "small" stock here; 36 is a button a thumb
  // misses.
  const shortControls = srcFiles.filter((f) => /min-h-\[(?:[0-3]?[0-9])px\]/.test(readFileSync(f, "utf8")));
  ok(
    `no control is shorter than a thumb (${shortControls.length} file(s) below 44px)`,
    shortControls.length === 0
  );

  const rampPairs = ["ink", "muted", "faint"].flatMap((t) => darkSurfaces.map((s) => ({ t, s, r: ratio(token(t), token(s)) })));
  const tightestRamp = rampPairs.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `every text role clears 4.5:1 on every surface (tightest: ${tightestRamp.t} on ${tightestRamp.s} at ${round2(tightestRamp.r)}:1)`,
    rampPairs.every((p) => p.r >= 4.5)
  );

  const stateText = ["accent", "added", "review", "removed", "approved"];
  const statePairs = stateText.flatMap((t) => darkSurfaces.map((s) => ({ t, s, r: ratio(token(t), token(s)) })));
  const tightestState = statePairs.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `the state colours are readable as words, not only as tints (tightest: ${tightestState.t} on ${tightestState.s} at ${round2(tightestState.r)}:1)`,
    statePairs.every((p) => p.r >= 4.5)
  );

  ok(
    `accent-dim is held to 3:1 because it is only ever a border or a focus ring (${darkSurfaces.map((s) => round2(ratio(token("accent-dim"), token(s)))).join(", ")})`,
    darkSurfaces.every((s) => ratio(token("accent-dim"), token(s)) >= 3) &&
      srcFiles.every((f) => !readFileSync(f, "utf8").includes("text-accent-dim"))
  );

  // WCAG 1.4.11: whatever identifies a form field has to clear 3:1 against its
  // neighbours. Fields use their own token — darkest grey that clears 3:1 on
  // all four surfaces.
  const fieldFiles = svelteFiles.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /<input[^>]*type="(text|email|password)"/.test(src) || /<input(?![^>]*type=)/.test(src);
  });
  ok(
    `a field's boundary is not decoration: ${fieldFiles.length} files with text fields each carry border-control`,
    fieldFiles.length >= 1 && fieldFiles.every((f) => readFileSync(f, "utf8").includes("border-control"))
  );
  const controlRatios = darkSurfaces.map((s) => ratio(token("control"), token(s)));
  ok(
    `and that boundary clears 3:1 everywhere it can sit (${controlRatios.map(round2).join(", ")}:1)`,
    controlRatios.every((r) => r >= 3) && ratio(token("control"), token("raised")) > ratio(token("rule"), token("raised"))
  );

  // The sheet's own ink set, measured against the sheet. This is the half of
  // the palette the room's ramp cannot reach: the sheet is the one light
  // surface on the page, and the amber lamp is unreadable on it.
  const paperRatios = paperInks.map((t) => ({ t, r: ratio(token(t), token("paper")) }));
  const tightestPaper = paperRatios.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `every ink on the sheet clears 4.5:1 on the sheet (tightest: ${tightestPaper.t} at ${round2(tightestPaper.r)}:1)`,
    paperRatios.every((p) => p.r >= 4.5)
  );
  // And the room's lamps never land on the sheet, where the amber one is a
  // 1.6:1 smear. The receipt is the only object allowed on the paper, so the
  // rule can be checked there rather than argued about everywhere.
  ok(
    "the sheet never borrows the room's lamps",
    !/\b(text|bg|border)-(accent|added|removed|review|approved)\b/.test(
      readFileSync(new URL("../src/lib/components/Receipt.svelte", import.meta.url), "utf8")
    )
  );

  ok(
    "the focus ring is one accent hairline, and accent clears 3:1 on every surface it is drawn on",
    /:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--color-accent\)/.test(css) &&
      darkSurfaces.every((s) => ratio(token("accent"), token(s)) >= 3)
  );

  // The probe cannot prove this one from the outside: a tab that is not the
  // focused window never matches `:focus`, so every element reads as unindicated
  // whatever it renders. What it can prove is that no stylesheet throws the
  // ring away.
  {
    const outlineKillers: string[] = [];
    for (const f of srcFiles) {
      if (!f.endsWith(".ts") && !f.endsWith(".svelte")) continue;
      const src = readFileSync(f, "utf8");
      if (/outline-none|outline:\s*(none|0)/.test(src)) outlineKillers.push(shortName(f));
    }
    ok(`nothing in the interface removes a focus ring (${srcFiles.length} files scanned)`, outlineKillers.length === 0);
  }

  // Every colour a page paints has to come from the table above, or the
  // measurements stop describing the product.
  const hexOffenders: string[] = [];
  for (const f of svelteFiles) {
    const src = readFileSync(f, "utf8");
    const allowed = new Set(
      [...src.matchAll(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]!.toLowerCase())
    );
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (!allowed.has(m[0].toLowerCase())) hexOffenders.push(`${shortName(f)} ${m[0]}`);
    }
  }
  ok(
    "no component hardcodes a colour the token table does not know",
    hexOffenders.length === 0
  );
  ok(
    "the one literal that is not a class — the browser chrome — paints the same ground as the page",
    readFileSync(new URL("../src/routes/+layout.svelte", import.meta.url), "utf8").includes(
      `<meta name="theme-color" content="${token("ground")}" />`
    )
  );

  const alphaText: string[] = [];
  for (const f of srcFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/\btext-[a-z][a-z0-9-]*\/\d+/g)) {
      alphaText.push(`${shortName(f)} ${m[0]}`);
    }
  }
  ok(
    "no text colour is dialled below the floor with an opacity modifier",
    alphaText.length === 0
  );
}

console.log("\n== a five-minute access token does not end a session: the renewal is scheduled, not hoped for ==");
{
  // The server issues an access token that lives minutes and a refresh
  // credential that lives thirty days, so a learner must never meet the end of
  // the short one. The client renews *before* it dies — asserted here on the
  // arithmetic, because this is the part that can silently stop being true.
  const now = 1_800_000_000_000;
  const TTL_MS = 5 * 60 * 1000;
  const delay = refreshDelayMs(now + TTL_MS, now);
  ok(
    "the store renews before the token expires, with room for a slow request",
    delay !== null && delay > 0 && delay < TTL_MS
  );
  ok("a five-minute token is renewed after four minutes", delay === 240_000);
  ok(
    "a token inside the window counts as expiring; an unknown lifetime is left alone",
    isExpiring(now + 30_000, now) && !isExpiring(now + 2 * 60_000, now) && !isExpiring(null, now)
  );
  ok(
    "a delay is never zero or negative — a timer that fires immediately would loop",
    refreshDelayMs(now + 1_000, now) === 1_000 && refreshDelayMs(null, now) === null
  );
  const jwtLike = (claims: Record<string, unknown>): string =>
    `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  ok(
    "the token's own exp is the clock, not a stored copy of it",
    tokenExpiryMs(jwtLike({ exp: 1_800_000_100 })) === 1_800_000_100_000
  );
  ok(
    "an opaque or damaged token yields no expiry rather than a wrong one",
    tokenExpiryMs("not-a-jwt") === null &&
      tokenExpiryMs(null) === null &&
      tokenExpiryMs(jwtLike({ exp: "soon" })) === null
  );
  const start = parseSessionStart({ accessToken: "t", expiresIn: 300, user: { id: "u", email: "e", name: null } });
  ok("the broker's reply is validated before it becomes a session", start?.expiresIn === 300 && start?.user?.id === "u");
  ok(
    "and a reply with a string, zero, or absent lifetime is refused rather than stored",
    parseSessionStart({ accessToken: "t", expiresIn: "300" }) === null &&
      parseSessionStart({ accessToken: "t", expiresIn: 0 }) === null &&
      parseSessionStart({ accessToken: "", expiresIn: 300 }) === null &&
      parseSessionStart(null) === null
  );
}

{
  // The IDE download surface. The desktop app is a real product, but a build is
  // advertised only when one exists: the page reads one switch and, when it is
  // unset, says so plainly instead of rendering a dead link. These assert that
  // honesty and that the surface is reachable from where the courses are shown.
  const downloadSrc = readFileSync(new URL("../src/routes/download/+page.svelte", import.meta.url), "utf8");
  ok(
    "the download page reads the one switch that says a build exists",
    downloadSrc.includes("PUBLIC_IDE_DOWNLOAD_URL")
  );
  ok(
    "and names no browser fallback when no build is published — the IDE is the only way to learn",
    downloadSrc.includes("not published yet") &&
      !downloadSrc.includes("Start in the browser") &&
      downloadSrc.includes('href="/pricing"')
  );
  ok(
    "the real link comes from the configured URL, never a placeholder href",
    downloadSrc.includes("href={downloadUrl}") && !downloadSrc.includes('href="#"')
  );
  ok(
    "the download is stated to be free, with later phases gated per entitlement",
    /download is free/i.test(downloadSrc) && /per entitlement/i.test(downloadSrc)
  );

  const headerSrc = readFileSync(new URL("../src/lib/components/Header.svelte", import.meta.url), "utf8");
  ok(
    "the shared nav reaches the download page",
    headerSrc.includes('href="/download"')
  );
  ok(
    "the shared nav names the courses on the homepage",
    readFileSync(new URL("../src/lib/content/site.ts", import.meta.url), "utf8").includes(
      '"/#courses"'
    )
  );

  // The footer is a shared component now, so the assertion follows the link to
  // where it lives: the footer's own link set must name the download, and the
  // component must render whatever that set contains.
  ok(
    "the home footer links the IDE download",
    readFileSync(new URL("../src/lib/components/Footer.svelte", import.meta.url), "utf8").includes(
      "{link.href}"
    ) && COPY.FOOTER_LINKS.some((l) => l.href === "/download")
  );

  const pricingDlSrc = readFileSync(new URL("../src/routes/pricing/+page.svelte", import.meta.url), "utf8");
  ok("pricing links the IDE download from the free plan", pricingDlSrc.includes('href="/download"'));
  ok(
    "and its billing effect latches on failure, so an unreachable service is asked once",
    /\.finally\(\(\) => \{[^}]*loaded = true;/.test(pricingDlSrc) &&
      !/plans = p\.plans;\s*loaded = true;/.test(pricingDlSrc)
  );

  ok("the download page is in the sitemap", sitemapPaths().includes("/download"));

  // The GitHub-style browser sign-in for the IDE: the IDE shows a code, the
  // learner approves it here, and the tier decides which courses appear there.
  // These pin the page's shape: it approves through the session (never a pasted
  // token), refuses unknown codes without saying why, and states the tier rule
  // from the public manifest rather than inventing it.
  const ideSrc = readFileSync(new URL("../src/routes/auth/ide/+page.svelte", import.meta.url), "utf8");
  ok(
    "the IDE sign-in page approves a typed code through the signed-in session",
    ideSrc.includes("session.approveDevice") && ideSrc.includes('path="/auth/ide"')
  );
  ok(
    "it refuses unknown codes without an oracle, and names the expiry",
    ideSrc.includes("not valid") && ideSrc.includes("15 minutes")
  );
  ok(
    "it shows what each tier unlocks from the public manifest, not from copy",
    ideSrc.includes("session.ideManifest") && ideSrc.includes("per entitlement")
  );
  ok(
    "the account page points IDE learners at it",
    readFileSync(new URL("../src/routes/auth/+page.svelte", import.meta.url), "utf8").includes('href="/auth/ide"')
  );
  ok("the IDE sign-in page is in the sitemap", sitemapPaths().includes("/auth/ide"));

  // The offline check on /verify rebuilds the exact bytes the platform signed
  // (contracts runReceiptPayload) inside the page. A field added, dropped, or
  // reordered on either side silently breaks every local verification while
  // the server answer keeps working — so the two orders are asserted equal,
  // not eyeballed.
  const payloadKeys = (src: string): string[] => {
    const start = src.indexOf("JSON.stringify({");
    assert(start !== -1, "payload builder found");
    const end = src.indexOf("});", start);
    const slice = src.slice(start, end);
    // Keys are `name:` in the page and `name:` or shorthand `name,` in
    // contracts — both spellings name the same position.
    return [...slice.matchAll(/^ *([A-Za-z]+)(?=:|,)/gm)].map((m) => m[1]!);
  };
  const pageSrc = readFileSync(new URL("../src/routes/verify/+page.svelte", import.meta.url), "utf8");
  const contractsSrc = readFileSync(
    new URL("../../platform/packages/contracts/src/index.ts", import.meta.url),
    "utf8"
  );
  const pageOrder = payloadKeys(pageSrc);
  const contractOrder = payloadKeys(contractsSrc);
  ok(
    `the page rebuilds the signed bytes in the platform's order (${pageOrder.join(",")})`,
    pageOrder.length === 14 && JSON.stringify(pageOrder) === JSON.stringify(contractOrder)
  );
  // Order is not enough: swapping two values keeps the order and breaks every
  // local verification while the server answer keeps working. So each key must
  // read its own fact — same name on both sides of the colon.
  const mapped = ["language", "command", "stdout", "stderr", "exitCode", "timedOut", "truncated", "durationMs", "phase", "runner"];
  ok(
    "every scalar key reads its own fact, not another's",
    mapped.every((k) => pageSrc.includes(`${k}: receipt.facts.${k}`)) &&
      pageSrc.includes("issuedAt: receipt.issuedAt")
  );
  ok(
    "file and diagnostic tuples read their own fields",
    pageSrc.includes("receipt.facts.files.map((f: any) => [f.path, f.sha256])") &&
      pageSrc.includes("[d.kind, d.file, d.line, d.column, d.message]")
  );

  // The design builder mirrors contracts designReceiptPayload the same way:
  // same key order, same own-fact mapping, same check tuples. A design
  // receipt pasted on /verify gets its offline check from these bytes, so a
  // drift here silently breaks every local design verification while the
  // server answer keeps working — the same failure the run gate guards.
  const builderKeys = (src: string, name: string): string[] => {
    const fnStart = src.indexOf(name);
    assert(fnStart !== -1, `${name} builder found`);
    const start = src.indexOf("JSON.stringify({", fnStart);
    assert(start !== -1, `${name} payload builder found`);
    const end = src.indexOf("});", start);
    const slice = src.slice(start, end);
    // Alphanumerics: design keys include graphSha256, which the run-only
    // pattern below cannot spell.
    return [...slice.matchAll(/^ *([A-Za-z][A-Za-z0-9]*)(?=:|,)/gm)].map((m) => m[1]!);
  };
  const pageDesignOrder = builderKeys(pageSrc, "function payloadOfDesign");
  const contractDesignOrder = builderKeys(contractsSrc, "export function designReceiptPayload");
  ok(
    `the page rebuilds design bytes in the platform's order (${pageDesignOrder.join(",")})`,
    pageDesignOrder.length === 7 && JSON.stringify(pageDesignOrder) === JSON.stringify(contractDesignOrder)
  );
  ok(
    "every design key reads its own fact, not another's",
    pageSrc.includes("challengeId: receipt.facts.challengeId") &&
      pageSrc.includes("graphSha256: receipt.facts.graphSha256") &&
      pageSrc.includes("issuedAt: receipt.issuedAt") &&
      pageSrc.includes('kind: "design"')
  );
  ok(
    "design check tuples read their own fields",
    pageSrc.includes("receipt.facts.checks.map((c: any) => [c.checkId, c.passed, c.reason])")
  );
  ok(
    "the offline check picks the builder by receipt kind",
    pageSrc.includes('receipt?.facts?.kind === "design"')
  );
  ok(
    "the verify answer renders a design branch, not just run fields",
    pageSrc.includes('result.kind === "design"') &&
      pageSrc.includes("result.challengeId") &&
      pageSrc.includes("result.checks")
  );
  // The learner binding rides both payloads conditionally: present when the
  // receipt names a user, omitted entirely when it does not, so pre-binding
  // receipts verify on their original bytes. Each side is checked on its own
  // builder — one builder carrying it while the other drops it would still
  // pass a whole-file search.
  const runBlock = pageSrc.slice(pageSrc.indexOf("function payloadOfRun"), pageSrc.indexOf("function payloadOfDesign"));
  const designBlock = pageSrc.slice(pageSrc.indexOf("function payloadOfDesign"), pageSrc.indexOf("function payloadOf("));
  const runContract = contractsSrc.slice(
    contractsSrc.indexOf("export function runReceiptPayload"),
    contractsSrc.indexOf("export function designReceiptPayload")
  );
  ok(
    "both offline builders bind the learner conditionally, reading their own fact",
    runBlock.includes("receipt.facts.userId === undefined") &&
      runBlock.includes("{ userId: receipt.facts.userId }") &&
      designBlock.includes("receipt.facts.userId === undefined") &&
      designBlock.includes("{ userId: receipt.facts.userId }") &&
      runContract.includes("facts.userId === undefined") &&
      runContract.includes("{ userId: facts.userId }") &&
      contractsSrc.includes("{ userId: facts.userId }")
  );
}

console.log("\n== the design is held to the same rules as the product ==");
{
  // A redesign is the cheapest place for a product's own promises to quietly
  // disappear, so the new surface arrives with assertions rather than with a
  // screenshot. Everything below is a rule the design has to keep, not a
  // description of how it happens to look today.
  const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
  const component = (name: string): string =>
    readFileSync(new URL(`../src/lib/components/${name}`, import.meta.url), "utf8");
  const landingSrc = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");

  // MARKET.md §2 forbids these words outright. The check reads the copy that is
  // actually rendered rather than grepping the source, so the list itself
  // cannot trip its own assertion — and a future rewrite cannot reintroduce
  // "mastery" by accident.
  // NOT_SOLD is deliberately not in this list. The forbidden words are the
  // words a claim may not use, and "no certificates" is not a claim: it is
  // the refusal of one, in the owner's words, on the pricing page.
  const corpus = JSON.stringify([
    COPY.HERO,
    COPY.HIRING,
    COPY.AUDIENCES,
    COPY.SPEC,
    COPY.EMPLOYER,
    COPY.FACTS,
    COPY.WEDGE,
    COPY.STEPS,
    COPY.DISCLOSURE,
    COPY.NO_LIST,
    COPY.FAQ,
    COPY.BILLING_COMMITMENTS,
    COPY.FREE_TIER_POINTS,
    COPY.RUN_SCRIPT,
    COPY.RECEIPT,
  ]).toLowerCase();
  const banned = COPY.FORBIDDEN_WORDS.filter((word) => corpus.includes(word.toLowerCase()));
  ok(
    `the copy uses none of the ${COPY.FORBIDDEN_WORDS.length} words the brand forbids`,
    banned.length === 0,
    banned.join(", ")
  );
  ok(
    "the brand's own word lists live in the repository, not in someone's memory",
    COPY.CLAIMED_WORDS.length >= 4 && COPY.FORBIDDEN_WORDS.length >= 8
  );

  // The second clause of the positioning line is the differentiator, so it has
  // to be on the page rather than only in the pitch.
  ok(
    "the page states where the verdicts stop being certain",
    landingSrc.includes("DISCLOSURE") &&
      COPY.DISCLOSURE.rows.length === 2 &&
      COPY.DISCLOSURE.rows.some((r) => r.kind === "self")
  );

  // Reduced motion is one decision, not four. The block has to settle every
  // animated primitive — "slower" would leave the page moving on a screen that
  // asked it not to.
  const reducedBlock = css.slice(css.lastIndexOf("prefers-reduced-motion: reduce"));
  ok(
    "every motion primitive is settled, and the sheet feed collapses, under reduced motion",
    reducedBlock.includes(".line-mask > span") &&
      reducedBlock.includes(".fade-up") &&
      reducedBlock.includes(".draw") &&
      reducedBlock.includes(".feed")
  );

  // Nothing rolls its own motion check: one module owns the decision.
  ok(
    "every animated component asks the one motion module rather than testing the media query itself",
    ["Reveal.svelte", "Headline.svelte", "Ticker.svelte", "ScrollRail.svelte", "ProofRun.svelte", "ActionLink.svelte", "DeviceCode.svelte"].every(
      (name) => component(name).includes("$lib/motion")
    ) &&
      !srcFiles.some(
        (f) =>
          f.endsWith(".svelte") && readFileSync(f, "utf8").includes("prefers-reduced-motion: reduce")
      )
  );

  // The pointer is the platform's. This build drew its own follower behind the
  // pointer — a ring that has to blend the whole viewport on every frame and
  // that duplicates an affordance the operating system already owns. It was
  // cut, and these keep it cut: no cursor is drawn, none is hidden, and no
  // layer claims to sit above the pointer.
  ok(
    "the pointer is the platform's: nothing draws a second one, nothing hides the real one",
    !srcFiles.some((f) => /pen-cursor|z-cursor/.test(readFileSync(f, "utf8"))) &&
      !srcFiles.some((f) => /cursor:\s*(none|url\()/.test(readFileSync(f, "utf8")))
  );

  // The press's textures are drawn, not downloaded: the halftone ground and
  // the perforated edge exist as gradients in the stylesheet, and no component
  // loads a raster asset. A texture file is the one thing a press world would
  // reach for and never need.
  ok(
    "the bench is drawn, not downloaded — its textures are gradients, not images",
    /\.plot\s*\{/.test(css) &&
      /\.scale\s*\{/.test(css) &&
      css.includes("repeating-linear-gradient") &&
      !srcFiles.some(
        (f) => f.endsWith(".svelte") && /\.(png|jpe?g|webp|avif)\b/.test(readFileSync(f, "utf8"))
      )
  );

  // The craft floor's one absolute ban: nothing carries a kicker or an eyebrow
  // above a heading. Asserted on the class and the prop rather than the word,
  // so the prose explaining the ban cannot trip it.
  const eyebrowOffenders = srcFiles.filter((f) =>
    /class="eyebrow|eyebrow=\{|\seyebrow=/.test(readFileSync(f, "utf8"))
  );
  ok(
    `no section or page carries an eyebrow above its heading (${srcFiles.length} files scanned)`,
    eyebrowOffenders.length === 0,
    eyebrowOffenders.map((f) => f.slice(f.replace(/\\/g, "/").lastIndexOf("/") + 1)).join(", ")
  );

  ok(
    "no decorative overlay is exposed to a screen reader",
    ["ScrollRail.svelte"].every((name) => component(name).includes("aria-hidden"))
  );

  // The one light surface still has exactly one owner. When the paper is on
  // everything it stops meaning "this is the artefact worth looking at".
  const paperUsers = srcFiles.filter(
    (f) => f.endsWith(".svelte") && readFileSync(f, "utf8").includes('class="receipt')
  );
  ok(
    `the printed sheet has exactly one owner (${paperUsers.length} file(s))`,
    paperUsers.length === 1 && paperUsers[0]!.endsWith("Receipt.svelte")
  );

  // A phase carries its state in the mark and the border form before it carries
  // it in a colour, and the tier is always printed as a word.
  ok(
    "a phase carries its state in form before hue, and prints its tier as a word",
    css.includes('.phase-row[data-state="completed"]') &&
      css.includes('.phase-row[data-state="locked"]') &&
      css.includes(".row-mark") &&
      component("PhaseRow.svelte").includes("data-state={state}") &&
      component("TierStamp.svelte").includes("{tier}")
  );

  // The hero is a document, not a canvas: one real heading, a scripted run that
  // ships its finished state first, and a control that can replay it without a
  // pointer.
  ok(
    "the hero is one real heading and a real control, not a canvas",
    (landingSrc.match(/as="h1"/g) ?? []).length === 1 &&
      !landingSrc.includes("<h1") &&
      landingSrc.includes("<ProofRun />")
  );
  const runSrc = component("ProofRun.svelte");
  ok(
    "the run serves its finished state first, so a no-JavaScript or reduced-motion visitor gets the whole transcript",
    /let shown = \$state<number>\(RUN_SCRIPT\.length\)/.test(runSrc) &&
      /let passed = \$state\(true\)/.test(runSrc) &&
      component("Terminal.svelte").includes("{#each lines as line, i (i)}")
  );
  ok(
    "and the running order is driven from the content module, not from markup",
    COPY.RUN_SCRIPT.length >= 5 &&
      COPY.RUN_SCRIPT.some((l) => l.kind === "fail") &&
      COPY.RUN_SCRIPT.some((l) => l.kind === "ok")
  );

  // The receipt is an illustration of the product's output. It must say so, or
  // it reads as a record a learner could present.
  ok(
    "the receipt is labelled an illustration rather than a learner's own record",
    COPY.RECEIPT.label.includes("illustration") && COPY.RECEIPT.label.includes("not your work")
  );
}

console.log("\n== the bench: the design is held to the rules it set for itself ==");
// The copy is literal-typed, so a direct comparison against the empty string
// is a comparison the compiler can prove impossible. The check is widened on
// purpose: it asks whether a field is filled in, not what its type is.
const nonEmpty = (value: string): boolean => value.trim().length > 0;
{
  const landingSrc = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
  const footerSrc = readFileSync(new URL("../src/lib/components/Footer.svelte", import.meta.url), "utf8");

  // Two audiences, one page. The selector is a control with two real states,
//  and both arguments are full sections further down, so the switch is a
//  convenience and never the only way in — a crawler, a reader with the
//  script off, and a screen reader all meet the whole argument without it.
  ok(
    "the front door answers both audiences",
    COPY.AUDIENCES.length === 2 &&
      landingSrc.includes("<AudienceSwitch") &&
      landingSrc.includes("learnerHero") &&
      landingSrc.includes("HIRING") &&
      COPY.AUDIENCES.every((a) => nonEmpty(a.id) && nonEmpty(a.label) && nonEmpty(a.lineOne))
  );
  ok(
    "the hiring argument is a section of its own, not only a hero variant",
    landingSrc.includes('id="employers"') && landingSrc.includes("<EmployerBoard")
  );
  ok(
    "and it says as much about what does not exist as about what does",
    COPY.EMPLOYER.notYet.length >= 3 && COPY.EMPLOYER.checks.length >= 3
  );
  ok(
    "and every hiring claim names the artefact behind it",
    COPY.EMPLOYER.checks.every((c) => nonEmpty(c.claim) && nonEmpty(c.evidence))
  );

  // The differentiator, stated as readings rather than as an adjective.
  ok(
    "the product's differentiator is a datasheet, not a promise",
    COPY.SPEC.length === 3 && landingSrc.includes("<SpecSheet")
  );
  ok(
    "and it is grouped into clusters, so it reads as a product rather than as a list of rows",
    COPY.SPEC.every((g) => nonEmpty(g.cluster) && g.rows.length > 0) &&
      readFileSync(
        new URL("../src/lib/components/SpecSheet.svelte", import.meta.url),
        "utf8"
      ).includes("{group.cluster}")
  );
  ok(
    "every reading in the datasheet names a parameter, a value and a limit",
    COPY.SPEC.every((g) =>
      g.rows.every((r) => nonEmpty(r.param) && nonEmpty(r.value) && nonEmpty(r.note))
    ) && COPY.SPEC.reduce((n, g) => n + g.rows.length, 0) >= 8
  );

  // The measurements on the bench are the real ones, drawn from the same
  // module the drift gate reads.
  ok(
    "the readings on the bench are drawn from the shipped content",
    landingSrc.includes("<FactStrip") && COPY.FACTS.length === 4
  );
  ok(
    "the manifest is drawn as a plate of lights, from the shipped curriculum",
    landingSrc.includes("<PhaseMatrix") && COPY.ALL_PHASES.length > 0
  );

  // The chrome is a title block: the product, the documents, and the record.
  ok(
    "the footer is a drawing's title block, and the legal documents are a cell of it",
    footerSrc.includes("the product") &&
      footerSrc.includes("the documents") &&
      footerSrc.includes("LEGAL_LINKS") &&
      footerSrc.includes("{link.href}")
  );

  // Prose is prose. The reading face is a distinct primitive, the lede uses
  // it, and no label or control ever does — a mono label set in a serif is a
  // label that has stopped being a label.
  ok(
    "the reading face is its own primitive, and the hero lede is set in it",
    css.includes(".reading") && landingSrc.includes('class="reading')
  );
  ok(
    "and no label or control is set in the reading face",
    !srcFiles.some((f) => f.endsWith(".svelte") && /class="[^"]*\breading\b[^"]*\bstamp\b/.test(readFileSync(f, "utf8")))
  );

  // The copy rules the design brief states as bans, applied to the surface
  // this site owns: no em-dash in a visible string, one label per intent,
  // and no kicker above a heading.
  {
    const marketingCopy = JSON.stringify([
      COPY.HERO,
      COPY.HIRING,
      COPY.AUDIENCES,
      COPY.SPEC,
      COPY.EMPLOYER,
      COPY.FACTS,
      COPY.WEDGE,
      COPY.STEPS,
      COPY.DISCLOSURE,
      COPY.NO_LIST,
      COPY.FAQ,
      COPY.BILLING_COMMITMENTS,
      COPY.FREE_TIER_POINTS,
      COPY.PRICING_PLANS,
      COPY.NOT_SOLD,
      COPY.CURRICULUM,
      COPY.HIRING_ENQUIRY,
      COPY.TEACHING_ENQUIRY,
      COPY.UNIVERSITY,
      COPY.CAMPUS,
      COPY.RUN_SCRIPT,
      COPY.RECEIPT,
      COPY.MASTHEAD,
      COPY.NAV,
      COPY.FOOTER_LINKS,
      COPY.POSITIONING,
      COPY.TAGLINE,
      COPY.MARKET,
      COPY.PROPS,
      COPY.LANDSCAPE,
      COPY.HERO_VARIANTS,
    ]);
    ok(
      "the copy carries no em-dash",
      !marketingCopy.includes("—") && !marketingCopy.includes("–")
    );
    ok(
      "and no visible string in the marketing surface does either",
      !srcFiles
        .filter(
          (f) => f.includes("/lib/components/") || f.endsWith("/routes/+page.svelte")
        )
        .some((f) => {
          const src = readFileSync(f, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/<!--[\s\S]*?-->/g, "");
          return /"[^"\n]*[—–][^"\n]*"/.test(src);
        })
    );
    {
      // The rule is about what a reader sees, so the check has to look at the
      // markup text and not only at quoted strings: a dash typed straight into
      // a page is exactly the case that slipped through, on the account home,
      // where a retained-record line read "category — reason".
      const dashPages = srcFiles
        .filter((f) => f.endsWith(".svelte"))
        .filter((f) => {
          const markup = readFileSync(f, "utf8")
            // Comments say why, and they are not read by anyone.
            .replace(/<!--[\s\S]*?-->/g, "")
            // The script and style blocks are code, and the string check above
            // already covers the strings inside them.
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .replace(/<style[\s\S]*?<\/style>/g, "");
          return /[—–]/.test(markup);
        })
        .map((f) => f.split("/src/").pop() ?? f);
      ok(
        "and no page shows a dash in its own text, on any route",
        dashPages.length === 0,
        dashPages.length ? `a dash is visible on: ${dashPages.join(", ")}` : ""
      );
    }
    {
      // One intent, one label, across every page and every piece of chrome.
      const labelFiles = srcFiles.filter(
        (f) => f.endsWith(".svelte") || f.endsWith(".ts")
      );
      // Only the labels themselves: a page's meta description is prose and may
      // name the product in full.
      const otherLabels = labelFiles.filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          />(Get the IDE|Get the NEXORA IDE|Download the NEXORA IDE)</.test(src) ||
          /label:\s*"(Get the IDE|Get the NEXORA IDE|Download the NEXORA IDE)"/.test(src)
        );
      });
      ok(
        "one label per intent: the download is called the same thing everywhere",
        COPY.HERO.primary === "Try it free" &&
          COPY.FOOTER_LINKS[0]?.label === "Try it free" &&
          COPY.STEPS[0]?.link.label === "Try it free" &&
          otherLabels.length === 0
      );
    }
    ok(
      "and no section carries a kicker above its heading",
      !/<p[^>]*\bstamp\b[^>]*>[^<]*<\/p>\s*<h[123]/.test(landingSrc)
    );
    ok(
      "and the hero carries no more than the selector, the poster, the lede and the actions",
      !/hero-note/.test(landingSrc)
    );
  }

  // The provenance rule: the argument comes from the research, and not from
  // the front door that was here before. The old sentences are frozen in
  // `scripts/legacy-front-door.txt`, one per line, and the narrative blocks
  // may not repeat one of them.
  //
  // The product's own facts are exempt, and deliberately so. "A model may
  // explain a failure; it never decides one" describes the rule engine, and
  // no market research could have said it. The rule is about the argument,
  // not about the vocabulary.
  {
    const legacy = readFileSync(
      new URL("./legacy-front-door.txt", import.meta.url),
      "utf8"
    )
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const flatten = (value: unknown): string[] => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.flatMap(flatten);
      if (value && typeof value === "object") {
        return Object.values(value).flatMap(flatten);
      }
      return [];
    };

    const sentences = flatten([
      COPY.MARKET,
      COPY.PROPS,
      COPY.LANDSCAPE,
      COPY.HERO_VARIANTS,
      COPY.WEDGE,
      COPY.HERO,
      COPY.HIRING,
      COPY.POSITIONING,
      COPY.TAGLINE,
    ])
      .join(" ")
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    const carried = sentences.filter((sentence) => legacy.includes(sentence));
    ok(
      "the narrative comes from the research, and repeats no sentence of the previous front door",
      legacy.length > 0 && carried.length === 0
    );
    if (carried.length) {
      console.log("      carried over: " + carried.join(" | "));
    }
  }

  // The research-driven content has to stay honest by construction: every
  // figure names the study it came from, every proposition says something,
  // and the headline variants are three different ways of saying one true
  // thing rather than three different promises.
  {
    ok(
      "every market reading names the study it came from",
      COPY.MARKET.readings.length >= 3 &&
        COPY.MARKET.readings.every(
          (reading) =>
            nonEmpty(reading.value) &&
            nonEmpty(reading.label) &&
            reading.source.length > 3
        )
    );
    ok(
      "and every figure in the market block carries a unit",
      COPY.MARKET.readings.every((reading) => /[%+]/.test(reading.value))
    );
    ok(
      "there are three propositions for each audience, and both say something",
      COPY.PROPS.learner.length === 3 &&
        COPY.PROPS.employer.length === 3 &&
        [...COPY.PROPS.learner, ...COPY.PROPS.employer].every(
          (prop) => nonEmpty(prop.title) && nonEmpty(prop.body) && prop.title.length > 8
        )
    );
    ok(
      "and the market's categories are described rather than dismissed",
      COPY.LANDSCAPE.kinds.length === 5 &&
        COPY.LANDSCAPE.kinds.every(
          (kind) => nonEmpty(kind.name) && nonEmpty(kind.leaves) && kind.leaves.length > 20
        ) &&
        nonEmpty(COPY.LANDSCAPE.ours)
    );
    ok(
      "the headline test has three variants, and each one is a different way of saying it",
      COPY.HERO_VARIANTS.length === 3 &&
        COPY.HERO_VARIANTS.every(
          (variant) =>
            nonEmpty(variant.lineOne) &&
            nonEmpty(variant.lineTwo) &&
            nonEmpty(variant.lede)
        ) &&
        new Set(COPY.HERO_VARIANTS.map((variant) => variant.lineOne)).size === 3 &&
        new Set(COPY.HERO_VARIANTS.map((variant) => variant.lineTwo)).size === 3 &&
        new Set(COPY.HERO_VARIANTS.map((variant) => variant.lede)).size === 3
    );
    ok(
      "and the page renders exactly one of them, chosen on the server",
      landingSrc.includes("HERO_VARIANTS.find") &&
        landingSrc.includes("data-headline-variant") &&
        !landingSrc.includes("HERO_VARIANTS.map")
    );

    // The sign-in code the demo prints has to be a real face of the code the
    // platform mints: eight characters from an alphabet with no 0, 1, I or O
    // in it, printed as four and four. A demo that shows an impossible code
    // is a screenshot of a product that does not exist.
    const deviceSrc = readFileSync(
      new URL("../src/lib/components/DeviceCode.svelte", import.meta.url),
      "utf8"
    );
    const demoCode = /const CODE = "([^"]+)"/.exec(deviceSrc)?.[1] ?? "";
    ok(
      "the demo prints a code in the platform's own format",
      /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(demoCode)
    );
    ok(
      "and the real sign-in page asks for the same code, in the same words",
      readFileSync(new URL("../src/routes/auth/ide/+page.svelte", import.meta.url), "utf8").includes(
        "Is that the code on your screen?"
      ) && readFileSync(new URL("../src/routes/auth/ide/+page.svelte", import.meta.url), "utf8").includes(
        "data-device-agree"
      )
    );

    // The launch list. It is the only thing on the site that collects an
    // address, so the promise about it has to be in three places at once: the
    // form, the privacy notice, and the address the mail goes to.
    {
      const launch = readFileSync(
        new URL("../src/lib/components/LaunchList.svelte", import.meta.url),
        "utf8"
      );
      const privacy = readFileSync(
        new URL("../src/routes/privacy/+page.svelte", import.meta.url),
        "utf8"
      );
      const mail = readFileSync(
        new URL("../src/routes/api/mail/+server.ts", import.meta.url),
        "utf8"
      );
      ok(
        "the launch list says what it will do and how to leave it",
        launch.includes("One message, when the desktop build is published.") &&
          launch.includes("removes you")
      );
      ok(
        "and the privacy notice names it, as the one thing a person holds",
        privacy.includes("ask to be told when the desktop build is published") &&
          privacy.includes("a person holds rather than the platform")
      );
      ok(
        "and the mail endpoint has a launch channel of its own",
        mail.includes('kind !== "launch"') && mail.includes("LAUNCH_CONTACT")
      );
    }

    // The employer's gaps are scoped: the front page shows the gap that
    // concerns everybody, and the hiring document carries the rest.
    ok(
      "the gaps are scoped to the audience they concern",
      COPY.EMPLOYER.notYet.length >= 3 &&
        COPY.EMPLOYER.notYet.some((gap) => gap.scope === "all") &&
        COPY.EMPLOYER.notYet.some((gap) => gap.scope === "hiring")
    );

    // The poster's marked word has to be a word that is in the line.
    ok(
      "the poster's second voice marks a word that is actually there",
      COPY.HERO_VARIANTS.every(
        (variant) => variant.lineOne.includes(variant.markOne)
      ) && COPY.HIRING.lineOne.includes(COPY.HIRING.markOne)
    );
  }

  // A state is never carried by a colour alone. The lamp is a shape and the
  //  state is a word, and the readout prints the word beside the lamp so the
  //  mark is legible before it is legible as a hue.
  ok(
    "a state is always printed as a word beside its lamp",
    readFileSync(new URL("../src/lib/components/ProofRun.svelte", import.meta.url), "utf8").includes(
      "{readout.state}"
    ) &&
      readFileSync(new URL("../src/lib/components/ProofRun.svelte", import.meta.url), "utf8").includes(
        "data-state={readout.state}"
      )
  );
}

  // The page must read without its script, and a stalled reveal must not be
  // able to hide it. The reveal hides a heading in CSS, so the hidden state
  // is scoped to a class the script sets on <html> before the first paint:
  // without JavaScript the class is never set and the heading is simply there.
  // The other failure — a browser that has stopped ticking its transitions —
  // is caught by the motion module, which settles a reveal outright once its
  // transition's own time has passed.
  {
    const htmlSrc = readFileSync(new URL("../src/app.html", import.meta.url), "utf8");
    const motionSrc = readFileSync(new URL("../src/lib/motion.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
    ok(
      "the page reads without its script, and a stalled reveal cannot hide it",
      htmlSrc.includes('class="no-js"') &&
        htmlSrc.includes('classList.replace("no-js", "js")') &&
        css.includes(".js .line-mask > span") &&
        css.includes(".js .fade-up") &&
        motionSrc.includes("settle(")
    );
    ok(
      "and the reveal's hidden state is never applied outside that class",
      !/\n\s*\.line-mask > span\s*\{/.test(css) && !/\n\s*\.fade-up\s*\{/.test(css)
    );
  }

  console.log("\n== the teaching surface: a lecturer can check it, and a price that is decided ==");
{
  // The other reader in the room. The hiring page answers one question for a
  // hiring manager; this is the same document for a lecturer, and the same
  // rules apply to it: the claims name the artefact behind them, the gaps are
  // printed with the same weight as the claims, and nothing is promised that
  // a person cannot keep.
  const universitiesDir = join(routesDir, "universities");
  const universitiesSrc = existsSync(join(universitiesDir, "+page.svelte"))
    ? readFileSync(join(universitiesDir, "+page.svelte"), "utf8")
    : "";
  const teachingEnquirySrc = existsSync(
    new URL("../src/lib/components/TeachingEnquiry.svelte", import.meta.url)
  )
    ? readFileSync(new URL("../src/lib/components/TeachingEnquiry.svelte", import.meta.url), "utf8")
    : "";
  const mailEndpointSrc = readFileSync(
    new URL("../src/routes/api/mail/+server.ts", import.meta.url),
    "utf8"
  );
  const headerSrc = readFileSync(new URL("../src/lib/components/Header.svelte", import.meta.url), "utf8");
  const footerSrc = readFileSync(new URL("../src/lib/components/Footer.svelte", import.meta.url), "utf8");
  const pricingSrc = readFileSync(new URL("../src/routes/pricing/+page.svelte", import.meta.url), "utf8");
  const a11ySrc = readFileSync(new URL("./verify-a11y.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
  // The copy module with its whitespace collapsed, so a sentence can be
  // looked for across the lines a formatter broke it into.
  const copyFlat = readFileSync(new URL("../src/lib/content/site.ts", import.meta.url), "utf8").replace(
    /\s+/g,
    " "
  );
  const routeFiles = srcFiles.filter((f) => f.includes("/routes/"));

  // 1. The route exists, and it is reachable from the folio and the footer.
  //    The two lists are the only place those links live, so the assertion
  //    follows them to the components that render them: a link in a list that
  //    nothing renders is not a link.
  ok(
    "the teaching page exists at /universities",
    existsSync(join(universitiesDir, "+page.svelte")) &&
      existsSync(join(universitiesDir, "+page.server.ts"))
  );
  ok(
    "and the folio names it, from the one list the folio renders",
    COPY.NAV.some((item) => item.href === "/universities" && item.label === "For teaching") &&
      headerSrc.includes("{#each NAV as item (item.href)}")
  );
  ok(
    "and the footer names it too",
    COPY.FOOTER_LINKS.some((link) => link.href === "/universities") &&
      footerSrc.includes("FOOTER_LINKS") &&
      footerSrc.includes("{link.href}")
  );
  ok(
    "and it is in the sitemap, and in the accessibility sweep",
    sitemapPaths().includes("/universities") && a11ySrc.includes('"/universities"')
  );

  // 2. The page is a document, like the hiring one: the same wrapper, the
  //    same print stylesheet, and the printed sheet drops the form and keeps
  //    the address.
  ok(
    "it is a printable one-pager, and the print sheet keeps the address and drops the form",
    universitiesSrc.includes('class="onepager') &&
      css.includes("[data-teaching-enquiry]") &&
      universitiesSrc.includes("mailto:{TEACHING_CONTACT}")
  );

  // 3. The counts and the course names come out of the copy module. A page
  //    that types "80 phases" is a page that will be wrong the day a phase
  //    is added, and a page that counts the courses reads as a count of
  //    videos.
  ok(
    "the page names the courses and reads the phase count from the copy module",
    universitiesSrc.includes("ALL_PHASES.length") &&
      universitiesSrc.includes("UNIVERSITY.courses") &&
      copyFlat.includes("${ALL_PHASES.length} phases") &&
      !/\d+\s+phases/.test(universitiesSrc)
  );
  ok(
    "and every course it names is the course the manifest ships",
    COPY.COURSES.every((course) => COPY.UNIVERSITY.courses.includes(course.title)) &&
      COPY.COURSES.length === 5
  );

  // 4. The take-home phase is the anti-cheat mechanism a course needs, and
  //    the page names it by the manifest's own title.
  ok(
    "the take-home phase is named from the shipped phase list, not typed",
    copyFlat.includes("rust-takehome") &&
      COPY.ALL_PHASES.some(
        ([id, title]) => id === "rust-takehome" && JSON.stringify(COPY.UNIVERSITY).includes(title)
      ) &&
      JSON.stringify(COPY.UNIVERSITY).includes("acceptance suite the student does not hold")
  );

  // 5. The gaps. They are the half of the promise, and a reader who finds
  //    one of them later stops trusting the rest of the page.
  const gaps = COPY.UNIVERSITY.notYet.map((gap) => gap.text);
  ok(
    "the page says what is not built yet: no LMS, no roster, no gradebook, no certificate, no credit",
    ["No LMS integration", "No roster", "No gradebook", "No certificates", "No credit"].every((gap) =>
      gaps.some((text) => text.includes(gap))
    ) && universitiesSrc.includes("UNIVERSITY.notYet")
  );
  ok(
    "and it says there is no outcome data, because no cohort has been taught",
    gaps.some((text) => text.includes("No outcome data")) &&
      gaps.some((text) => text.includes("no institution to name"))
  );
  ok(
    "and it says the offer is for higher education and adults, not for a school",
    gaps.some((text) => text.includes("higher education and adult offer"))
  );
  ok(
    "and it links the accessibility statement instead of restating it, without claiming conformance",
    COPY.UNIVERSITY.accessibility.href === "/accessibility" &&
      universitiesSrc.includes("UNIVERSITY.accessibility.href") &&
      COPY.UNIVERSITY.accessibility.text.includes("do not claim full conformance")
  );

  // The claims on the teaching page are scanned for the words the brand
  // forbids, exactly like the rest of the copy. The gaps are not, for the
  // same reason NOT_SOLD is not: "no certificates" is a refusal of a claim,
  // not a claim, and a list that says what is not built is allowed to name
  // the thing it is not.
  ok(
    "and the teaching claims use none of the words the brand forbids",
    COPY.FORBIDDEN_WORDS.filter((word) =>
      JSON.stringify([
        COPY.TEACHING_ENQUIRY,
        COPY.UNIVERSITY.propositions,
        COPY.UNIVERSITY.checks,
        COPY.UNIVERSITY.pilot,
        COPY.UNIVERSITY.close,
      ])
        .toLowerCase()
        .includes(word.toLowerCase())
    ).length === 0
  );

  // 6. The enquiry. One real way to reach a person, through the same
  //    endpoint, with its own kind and its own mailbox.
  ok(
    "the teaching form asks for a name, a work email, and what they teach",
    teachingEnquirySrc.includes('id="teaching-name"') &&
      teachingEnquirySrc.includes('id="teaching-email"') &&
      teachingEnquirySrc.includes('id="teaching-need"')
  );
  ok(
    "and it posts to /api/mail as the teaching kind, to the teaching address",
    teachingEnquirySrc.includes('kind: "teaching"') &&
      teachingEnquirySrc.includes('fetch("/api/mail"') &&
      mailEndpointSrc.includes('kind !== "teaching"') &&
      mailEndpointSrc.includes("TEACHING_CONTACT") &&
      COPY.TEACHING_CONTACT === "teaching@nexora.dev"
  );
  ok(
    "and the endpoint acknowledges it, in the same shape as the hiring one",
    mailEndpointSrc.includes("NEXORA: your teaching enquiry was received") &&
      mailEndpointSrc.includes("A person reads this mailbox, and every enquiry is answered")
  );
  ok(
    "and the privacy treatment says what is collected, what it is used for, and when it is deleted",
    COPY.TEACHING_ENQUIRY.privacy.includes("not added to a list") &&
      COPY.TEACHING_ENQUIRY.privacy.includes("deleted when the thread is over") &&
      COPY.TEACHING_ENQUIRY.privacy.includes("teaching mailbox")
  );
  ok(
    "and the privacy notice and the terms name the teaching mailbox, as they name the hiring one",
    readFileSync(new URL("../src/routes/privacy/+page.svelte", import.meta.url), "utf8").includes(
      "teaching mailbox"
    ) &&
      readFileSync(new URL("../src/routes/terms/+page.svelte", import.meta.url), "utf8").includes(
        "TEACHING_CONTACT"
      )
  );
  ok(
    "and it says plainly when the mail provider is not configured",
    teachingEnquirySrc.includes("notConfigured") &&
      universitiesSrc.includes("mailConfigured") &&
      COPY.TEACHING_ENQUIRY.notConfigured.includes("no mail provider configured")
  );

  // 7. No response time is promised. A time a reader can hold the studio to
  //    is a claim about a person reading a mailbox, so the copy states what
  //    is true of the mechanism instead, and this fails if a time creeps in.
  ok(
    "no response time is promised on the teaching page",
    !/\b(?:working days|hours|minutes|24 hours|48 hours|within a day|same day)\b/.test(
      `${JSON.stringify(COPY.UNIVERSITY)} ${JSON.stringify(COPY.TEACHING_ENQUIRY)}`
    ) &&
      COPY.TEACHING_ENQUIRY.lead.includes(COPY.TEACHING_ENQUIRY.replyTime)
  );

  // 8. The campus licence is the fourth line, and it is a decided number
  //    that lives in the copy module.
  ok(
    "the campus price is decided, and it lives in the copy module",
    COPY.CAMPUS.perStudent === 19 &&
      COPY.CAMPUS.minStudents === 20 &&
      COPY.CAMPUS.plan.price === COPY.money(COPY.CAMPUS.perStudent) &&
      COPY.CAMPUS.plan.priceNote.includes(`${COPY.CAMPUS.minStudents} students or more`)
  );
  ok(
    "and the pricing page prints four lines, the campus one among them",
    pricingSrc.includes("[...PRICING_PLANS, CAMPUS.plan]") && pricingSrc.includes("CAMPUS")
  );
  ok(
    "and the campus licence is invoiced, not a checkout",
    COPY.CAMPUS.plan.points.some((point) => point.includes("Invoiced, not a checkout")) &&
      COPY.CAMPUS.plan.points.some((point) => point.includes("One invoice, no card per student")) &&
      COPY.CAMPUS.checkout.includes("not on sale yet") &&
      pricingSrc.includes("The plan is priced and it is not on sale yet")
  );
  ok(
    "and the discount is visible: the monthly price of Pro beside the price of a term",
    COPY.CAMPUS.note.includes(COPY.money(COPY.PRICING.monthly)) &&
      COPY.CAMPUS.note.includes(COPY.money(COPY.CAMPUS.perStudent)) &&
      // No invented list price, and no local price that is higher for anyone.
      !/list price/i.test(COPY.CAMPUS.note) &&
      COPY.CAMPUS.note.includes("a discount you can see")
  );
  ok(
    "and no page carries a literal price, so the copy module stays the one place a price lives",
    !routeFiles
      .map((file) =>
        readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/<!--[\s\S]*?-->/g, "")
      )
      .some((src) => /\$[0-9]/.test(src))
  );
}

console.log(`\nALL ${passed} ASSERTIONS PASSED`);


