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
    "the page states the base course ships inside the download",
    copy.includes("Base course included") && copy.includes("bundled")
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
    "api",
  ]) {
    ok(`no classroom route remains at /${gone}`, !existsSync(join(routesDir, gone)));
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

  // The crawler contract matches the emitted surface exactly: the six public
  // pages, no mission URLs, no classroom entries.
  const paths = sitemapPaths();
  ok(
    "the sitemap is exactly the six public pages",
    JSON.stringify([...paths].sort()) ===
      JSON.stringify(["/", "/auth", "/auth/ide", "/download", "/pricing", "/verify"].sort())
  );
  ok(
    "no sitemap entry names a mission or a classroom page",
    paths.every((p) => !p.startsWith("/mission/"))
  );
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
    headerSrc.includes("border-b border-rule py-1")
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
      "transition-[color,background-color,border-color] duration-200"
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
    "pricing renders the API's plans, names the empty feed, and never invents a price",
    pricingSrc.includes("session.plans()") &&
      pricingSrc.includes("No paid plans published yet") &&
      // $0 is the stated free tier, not a price — any other amount would be invented.
      !/\$[1-9]/.test(pricingSrc)
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
    "the free tier still promises the bundled base course, free checks, and tier-unlocked courses",
    copyFlat.includes("Base course bundled with the IDE") &&
      copyFlat.includes("Every check and verdict, free forever") &&
      copyFlat.includes("Further courses per your tier") &&
      pricingSrc.includes("FREE_TIER_POINTS")
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

  // The courses section names real phases with real tiers. The manifest is
  // the truth and it moves (phases landed mid-session twice); hardcoded
  // lists that drift become invented courses. When the sibling checkout is
  // present, the homepage's listed ids must equal the manifest's — no more,
  // no fewer. Absent (a front-door-only checkout), say so rather than pass
  // silently.
  const ideManifest = new URL("../../../nexora-ide/extensions/nexora/curriculum/shipped/manifest.json", import.meta.url);
  let manifestIds: string[] | null = null;
  try {
    manifestIds = JSON.parse(readFileSync(ideManifest, "utf8")).phases.map((p: { id: string }) => p.id);
  } catch {
    manifestIds = null;
  }
  if (manifestIds === null) {
    console.log("  (course-list drift not checked: nexora-ide sibling absent)");
  } else {
    // The phase lists moved into the content module with the copy; the page
    // renders them from there. The gate follows them, so it still fails when a
    // phase is listed that the manifest does not ship (or the reverse).
    const contentSrc = readFileSync(new URL("../src/lib/content/site.ts", import.meta.url), "utf8");
    const listed = [...contentSrc.matchAll(/\["([a-z0-9-]+)", "[^"]+", "(?:free|pro)"\]/g)].map(
      (m) => m[1]!
    );
    ok(
      `the homepage lists every shipped phase exactly once (${listed.length} listed, ${manifestIds.length} shipped)`,
      listed.length === manifestIds.length &&
        manifestIds.every((id) => listed.includes(id)) &&
        new Set(listed).size === listed.length
    );
    // The headline count is prose, and prose drifts first. Map the manifest
    // total to its English word and require it — adding phase 33 without
    // updating the headline fails here, not in a learner's screenshot.
    const words: Record<number, string> = {
      28: "Twenty-eight", 29: "Twenty-nine", 30: "Thirty", 31: "Thirty-one",
      32: "Thirty-two", 33: "Thirty-three", 34: "Thirty-four", 35: "Thirty-five",
      36: "Thirty-six",
    };
    ok(
      "the headline count matches the shipped total",
      words[manifestIds.length] !== undefined &&
        readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8").includes(
          `${words[manifestIds.length]} phases`
        )
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
  const surfaces = ["ground", "panel", "raised", "raised-2", "paper"];
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

  const rampPairs = ["ink", "muted", "faint"].flatMap((t) => surfaces.map((s) => ({ t, s, r: ratio(token(t), token(s)) })));
  const tightestRamp = rampPairs.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `every text role clears 4.5:1 on every surface (tightest: ${tightestRamp.t} on ${tightestRamp.s} at ${round2(tightestRamp.r)}:1)`,
    rampPairs.every((p) => p.r >= 4.5)
  );

  const stateText = ["accent", "added", "review", "removed", "approved"];
  const statePairs = stateText.flatMap((t) => surfaces.map((s) => ({ t, s, r: ratio(token(t), token(s)) })));
  const tightestState = statePairs.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `the state colours are readable as words, not only as tints (tightest: ${tightestState.t} on ${tightestState.s} at ${round2(tightestState.r)}:1)`,
    statePairs.every((p) => p.r >= 4.5)
  );

  ok(
    `accent-dim is held to 3:1 because it is only ever a border or a focus ring (${surfaces.map((s) => round2(ratio(token("accent-dim"), token(s)))).join(", ")})`,
    surfaces.every((s) => ratio(token("accent-dim"), token(s)) >= 3) &&
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
  const controlRatios = surfaces.map((s) => ratio(token("control"), token(s)));
  ok(
    `and that boundary clears 3:1 everywhere it can sit (${controlRatios.map(round2).join(", ")}:1)`,
    controlRatios.every((r) => r >= 3) && ratio(token("control"), token("raised")) > ratio(token("rule"), token("raised"))
  );

  ok(
    "the focus ring is one accent hairline, and accent clears 3:1 on every surface it is drawn on",
    /:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--color-accent\)/.test(css) &&
      surfaces.every((s) => ratio(token("accent"), token(s)) >= 3)
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
  const corpus = JSON.stringify([
    COPY.HERO,
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
    "the press is drawn, not downloaded — its textures are gradients, not images",
    /\.halftone\s*\{/.test(css) &&
      /\.perf-edge\s*\{/.test(css) &&
      css.includes("repeating-conic-gradient") &&
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

console.log(`\nALL ${passed} ASSERTIONS PASSED`);


