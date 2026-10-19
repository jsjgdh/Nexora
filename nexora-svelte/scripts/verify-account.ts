/* The account surface: the assertions that matter for it.
   Run with: npx tsx scripts/verify-account.ts

   This file is the account-surface half of the front door's gate, and it is
   separate from `scripts/verify.ts` on purpose: another worker owns the
   content assertions in that file, and a gate that two workers edit is a gate
   that loses a change. The main `verify` script runs both, so nothing is
   skipped.

   What is asserted here is not "the page says a thing". It is the four
   properties that the account surface is easy to break and hard to notice:

     1. The broker discipline. The refresh token stays in the HttpOnly
        cookie, the new account flows go through this app's own endpoints
        under /auth/session, and the browser never learns a token it could
        keep.

     2. The no-oracle property. A password reset must never say whether an
        address has an account, on this side of the wire as well as the
        platform's.

     3. The honest states. Local mode says so instead of showing a form that
        cannot work, and the three failures (a rejection, an ended session,
        an unreachable platform) are three different sentences.

     4. The account home actually answers the questions it claims to answer,
        and the landing page after a sign-in is the account home and not the
        subscription panel.

   Each assertion below says in its name which of those it defends, so a
   failure names the thing that broke rather than the file that broke. */
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sitemapPaths } from "../src/lib/seo";
import { AUTH_MESSAGES, authFailure, authMessage } from "../src/lib/auth-errors";
import { ACCOUNT_HOME, PASSWORD_RESET, VERIFY_EMAIL } from "../src/lib/content/site";

let passed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const exists = (rel: string): boolean => existsSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)));

console.log("== the account surface: one token boundary, three honest states ==");

{
  /* ----------------------------------------------------------------------
   * 1. The account flow pages exist, they are real routes, and they are
   *    not advertised. A flow page is not a document: nobody searches for
   *    "choose a new password", and a crawler that finds a token in a query
   *    string should not find one in the sitemap either.
   *
   *    The platform's email names two of these routes, and the paths are
   *    configurable on its side, so the site serves both the shape the
   *    platform defaults to and the shapes a learner might paste.
   * ------------------------------------------------------------------- */
  const pages = [
    "src/routes/auth/password-reset/+page.svelte",
    "src/routes/auth/password-reset/confirm/+page.svelte",
    "src/routes/auth/password-reset/[token]/+page.svelte",
    "src/routes/auth/verify/+page.svelte",
    "src/routes/auth/verify-email/confirm/+page.svelte",
  ];
  for (const page of pages) {
    ok(`the page at ${page.replace("src/routes", "")} exists`, exists(page));
  }
  ok(
    "and none of them is advertised to a crawler",
    !sitemapPaths().some(
      (p) => p.startsWith("/auth/password-reset") || p.startsWith("/auth/verify")
    )
  );

  /* The two shapes the platform's links can take, and the one a learner
     pastes. Both are served, and both read the token the same way. */
  const resetConfirm = read("src/routes/auth/password-reset/confirm/+page.svelte");
  const resetPath = read("src/routes/auth/password-reset/[token]/+page.svelte");
  const verifyConfirm = read("src/routes/auth/verify-email/confirm/+page.svelte");
  const verifyFriendly = read("src/routes/auth/verify/+page.svelte");
  ok(
    "the platform's reset link, /auth/password-reset/confirm?token=, is served",
    resetConfirm.includes('searchParams.get("token")')
  );
  ok(
    "the path form of the reset link is served too",
    resetPath.includes("page.params.token")
  );
  ok(
    "the platform's verification link, /auth/verify-email/confirm?token=, is served",
    verifyConfirm.includes('searchParams.get("token")')
  );
  ok(
    "and the friendly verification page reads a code from the query string",
    verifyFriendly.includes('searchParams.get("token")') &&
      verifyFriendly.includes('searchParams.get("code")')
  );
  ok(
    "the two shapes of each flow render the same component, so they cannot drift",
    resetConfirm.includes("PasswordResetPage") &&
      resetPath.includes("PasswordResetPage") &&
      verifyConfirm.includes("VerifyEmailPage") &&
      verifyFriendly.includes("VerifyEmailPage")
  );

  /* ----------------------------------------------------------------------
   * 2. A token in an address bar is a token in a server log and in a
   *    Referer. It is read once and then taken out of the address bar.
   * ------------------------------------------------------------------- */
  const resetForm = read("src/lib/components/PasswordResetPage.svelte");
  const verifyForm = read("src/lib/components/VerifyEmailPage.svelte");
  ok(
    "the reset form takes the token out of the address bar once it has read it",
    resetForm.includes("replaceState(") && resetForm.includes("onMount")
  );
  ok(
    "and so does the verification form",
    verifyForm.includes("replaceState(") && verifyForm.includes("onMount")
  );
  ok(
    "and neither form fetches anything itself, so the token goes to one place only",
    !resetForm.includes("fetch(") && !verifyForm.includes("fetch(")
  );
  const sessionSrc = read("src/lib/session.svelte.ts");
  ok(
    "the token travels to this app's own endpoint and nowhere else",
    sessionSrc.includes("PASSWORD_RESET_CONFIRM_PATH") &&
      sessionSrc.includes("VERIFY_EMAIL_CONFIRM_PATH") &&
      sessionSrc.includes('SESSION_BASE = "/auth/session"')
  );

  /* ----------------------------------------------------------------------
   * 3. The broker discipline. Four new endpoints, all on this app's own
   *    origin, all refusing a cross-site POST, and none of them minting or
   *    returning a credential.
   * ------------------------------------------------------------------- */
  const endpoints = [
    "auth/session/password-reset/request",
    "auth/session/password-reset/confirm",
    "auth/session/verify-email/request",
    "auth/session/verify-email/confirm",
  ];
  for (const endpoint of endpoints) {
    const src = read(`src/routes/${endpoint}/+server.ts`);
    ok(
      `the ${endpoint} endpoint exists on the app's own origin`,
      exists(`src/routes/${endpoint}/+server.ts`) && src.includes("gatewayPost(")
    );
    ok(
      `and ${endpoint} refuses a cross-site POST`,
      src.includes("crossSiteRequest(request, url)")
    );
    ok(
      `and ${endpoint} never hands a token back to the page`,
      !src.includes("refreshToken") && !src.includes("accessToken")
    );
  }

  const requestEndpoint = read("src/routes/auth/session/password-reset/request/+server.ts");
  ok(
    "the reset request answers 202 with one body whatever the platform said",
    requestEndpoint.includes('json({ ok: true }, { status: 202 })') &&
      // The platform's own body is never passed through, so it cannot become
      // an oracle on this side of the wire.
      !/json\(reply\.body/.test(requestEndpoint)
  );
  const verifyRequestEndpoint = read("src/routes/auth/session/verify-email/request/+server.ts");
  ok(
    "the verification request answers the same way",
    verifyRequestEndpoint.includes('json({ ok: true }, { status: 202 })') &&
      !/json\(reply\.body/.test(verifyRequestEndpoint)
  );

  ok(
    "the browser never calls the platform for these flows, it calls this app",
    sessionSrc.includes("PASSWORD_RESET_REQUEST_PATH") &&
      sessionSrc.includes("VERIFY_EMAIL_CONFIRM_PATH")
  );
  ok(
    "and no token is ever written to storage, by the old code or the new",
    !sessionSrc.includes("setItem") && sessionSrc.includes("LEGACY_TOKEN_KEY")
  );
  for (const file of [...pages, "src/lib/components/PasswordResetPage.svelte", "src/lib/components/VerifyEmailPage.svelte"]) {
    const src = read(file);
    ok(
      `${file.replace("src/", "")} never reads the platform address itself`,
      !src.includes("PUBLIC_API_URL") && !src.includes("env.")
    );
  }

  /* ----------------------------------------------------------------------
   * 4. The no-oracle property, on the page as well as on the wire.
   * ------------------------------------------------------------------- */
  ok(
    "the reset request says one sentence, and it says both halves of it",
    PASSWORD_RESET.request.sent.includes("If that address has an account") &&
      PASSWORD_RESET.request.sent.includes("no account is created")
  );
  const resetRequestPage = read("src/routes/auth/password-reset/+page.svelte");
  ok(
    "and the page prints that one sentence rather than a sentence of its own",
    resetRequestPage.includes("PASSWORD_RESET.request.sent") &&
      // The page does not read the reply's body to decide what to say.
      !/\.\bok\b/.test(resetRequestPage)
  );
  ok(
    "the verification resend says the same kind of sentence",
    VERIFY_EMAIL.resent.includes("If that address has an account") &&
      VERIFY_EMAIL.resent.includes("no account is created")
  );

  /* ----------------------------------------------------------------------
   * 5. The password rule is the sign-up rule, written the same way.
   * ------------------------------------------------------------------- */
  const authPage = read("src/routes/auth/+page.svelte");
  ok(
    "the reset form holds the password to the same ten characters as sign-up",
    resetForm.includes("minlength={10}") &&
      authPage.includes("minlength={mode === \"register\" ? 10 : 1}")
  );
  ok(
    "and both forms say so in the label, in the same words",
    resetForm.includes("PASSWORD_RESET.confirm.field") &&
      PASSWORD_RESET.confirm.field.includes("10 characters or more") &&
      authPage.includes("password{mode === \"register\" ? \": 10 characters or more\" : \"\"}")
  );

  /* ----------------------------------------------------------------------
   * 6. The verification screen takes a code from the address bar and a
   *    code pasted in, and it says the account is created.
   * ------------------------------------------------------------------- */
  ok(
    "and accepts a code pasted into a field of its own",
    verifyForm.includes('id="verify-code"') && verifyForm.includes("confirmEmailVerification")
  );
  ok(
    "and it says the account is created and the link is on its way",
    verifyForm.includes("VERIFY_EMAIL.created") &&
      VERIFY_EMAIL.created.includes("Your account is created") &&
      VERIFY_EMAIL.created.includes("on its way")
  );
  ok(
    "and when the platform is not connected it says nothing was sent",
    verifyForm.includes("VERIFY_EMAIL.notConnected") &&
      VERIFY_EMAIL.notConnected.includes("no verification was sent")
  );

  /* ----------------------------------------------------------------------
   * 7. Local mode. The decision is that there is no form at all when the
   *    platform is not connected, because a local account kept in the
   *    browser would be a fiction. The assertion reads the branch itself,
   *    not the page around it.
   * ------------------------------------------------------------------- */
  const notConnectedAt = authPage.indexOf("{:else if !apiConfigured}");
  const formAt = authPage.indexOf('type="password"');
  const branchEnd = authPage.indexOf("{:else if session.loggedIn", notConnectedAt);
  ok(
    "the local-mode branch of /auth has no password field in it",
    notConnectedAt > -1 && branchEnd > notConnectedAt && formAt > branchEnd
  );
  ok(
    "and it offers the honest next step instead",
    authPage.includes("cloud accounts not connected") &&
      authPage.includes('href="/download"') &&
      authPage.includes("no password to")
  );
  ok(
    "the local-mode story is the one the product makes everywhere else",
    authPage.includes("free phases")
  );

  /* ----------------------------------------------------------------------
   * 8. The three failures are three sentences, taken from the platform's
   *    own codes.
   * ------------------------------------------------------------------- */
  ok(
    "a rejected sign-in says what was rejected",
    authMessage({ code: "invalid_credentials" }) === AUTH_MESSAGES.invalidCredentials &&
      AUTH_MESSAGES.invalidCredentials.includes("were not accepted")
  );
  ok(
    "an ended session says the session ended and that the work is untouched",
    authMessage({ code: "expired" }) === AUTH_MESSAGES.expired &&
      AUTH_MESSAGES.expired.includes("session has ended") &&
      AUTH_MESSAGES.expired.includes("untouched")
  );
  ok(
    "a replayed credential says it was ended for safety, and why",
    authMessage({ code: "token_reused" }) === AUTH_MESSAGES.tokenReused &&
      AUTH_MESSAGES.tokenReused.includes("untouched")
  );
  ok(
    "an unreachable platform says the service did not answer, and that the free phases work",
    authMessage({ code: "auth_unavailable" }) === AUTH_MESSAGES.unavailable &&
      AUTH_MESSAGES.unavailable.includes("did not answer") &&
      AUTH_MESSAGES.unavailable.includes("free phases")
  );
  ok(
    "a build with no platform says so, and says nothing was sent",
    authMessage({ code: "not_configured" }) === AUTH_MESSAGES.notConfigured &&
      AUTH_MESSAGES.notConfigured.includes("nothing was sent")
  );
  ok(
    "the three are told apart by the code, not by the status number",
    authFailure({ code: "invalid_credentials" }) === "rejected" &&
      authFailure({ code: "auth_unavailable" }) === "outage" &&
      authFailure({ code: "not_configured" }) === "not-configured" &&
      authFailure({ status: 502 }) === "other"
  );
  ok(
    "a rejected sign-in is offered the reset route, and an outage is not",
    authPage.includes("failure === \"rejected\"") &&
      authPage.includes('href="/auth/password-reset"') &&
      authPage.includes("failure === \"outage\"")
  );
  ok(
    "the sign-in page links the two new pages by name",
    authPage.includes("Forgot your password?") && authPage.includes("Verify your email")
  );

  /* ----------------------------------------------------------------------
   * 9. The account home.
   * ------------------------------------------------------------------- */
  const accountPage = read("src/routes/account/+page.svelte");
  ok(
    "the account home says who you are, and when the account was made if the platform says",
    accountPage.includes("ACCOUNT_HOME.identity.label") &&
      accountPage.includes("subject?.createdAt") &&
      accountPage.includes("ACCOUNT_HOME.identity.unknown")
  );
  ok(
    "it reads the plan from the billing service, the way the profile does",
    accountPage.includes("session.subscription()")
  );
  ok(
    "and falls back to the local copy when the platform is not connected",
    accountPage.includes("FREE_TIER_POINTS") && accountPage.includes("ACCOUNT_HOME.plan.free")
  );
  ok(
    "and it hard-codes no phase count of its own, so the count cannot drift from the platform's",
    !/nine phases/i.test(accountPage) && !/\b\d+ phases\b/.test(accountPage)
  );
  ok(
    "it shows the evidence from the attested ledger, and says plainly when there is none",
    accountPage.includes("session.myProofs()") &&
      accountPage.includes("ACCOUNT_HOME.evidence.empty") &&
      ACCOUNT_HOME.evidence.empty.length > 0
  );
  ok(
    "the ledger is asked at the path the platform publishes it on",
    sessionSrc.includes('"/api/auth/proofs"') && sessionSrc.includes('"/api/proofs"')
  );
  ok(
    "it gives the way into the IDE and the IDE sign-in code",
    accountPage.includes('href="/download"') && accountPage.includes('href="/auth/ide"')
  );
  ok(
    "it links the billing detail page rather than replacing it",
    accountPage.includes('href="/profile"') && exists("src/routes/profile/+page.svelte")
  );
  ok(
    "it keeps the data rights: the export, the erasure, the acceptance record and the ledger",
    accountPage.includes("session.exportAuth()") &&
      accountPage.includes("session.deleteAccount(") &&
      accountPage.includes("session.fileRightsRequest(") &&
      accountPage.includes("session.withdrawConsent(")
  );
  ok(
    "and the erasure still says what is kept and on what basis",
    accountPage.includes("deletion.retained") && accountPage.includes("basis")
  );
  ok(
    "and the self-service route is still not the only route",
    accountPage.includes("not the only one") && accountPage.includes("cannot sign in")
  );

  /* ----------------------------------------------------------------------
   * 10. The session controls exist once, and both pages use them.
   * ------------------------------------------------------------------- */
  const controls = read("src/lib/components/SessionControls.svelte");
  ok(
    "the session controls are one component, not two copies",
    exists("src/lib/components/SessionControls.svelte") &&
      controls.includes("Sign out everywhere") &&
      controls.includes("session.logoutEverywhere()")
  );
  ok(
    "and both the account home and the sign-in page render it",
    accountPage.includes("<SessionControls") && authPage.includes("<SessionControls")
  );
  ok(
    "and it is the only place the two-click confirmation lives",
    !authPage.includes("confirmEverywhere") && !accountPage.includes("confirmEverywhere")
  );
  const headerSrc = read("src/lib/components/Header.svelte");
  ok(
    "the header's account avatar points at the account home",
    headerSrc.includes('href="/account"')
  );
  ok(
    "and the header always offers an account control, in every mode",
    headerSrc.includes('href="/auth"') && !headerSrc.includes("apiConfigured")
  );
  ok(
    "a successful sign-in lands on the account home",
    authPage.includes('goto("/account")')
  );
  ok(
    "and creating an account says that verification is next",
    authPage.includes('goto("/auth/verify?created=1")')
  );

  /* ----------------------------------------------------------------------
   * 11. Accessibility, in the part of it that a source file can prove.
   * ------------------------------------------------------------------- */
  const forms = [
    ...pages,
    "src/lib/components/PasswordResetPage.svelte",
    "src/lib/components/VerifyEmailPage.svelte",
    "src/routes/account/+page.svelte",
    "src/routes/auth/+page.svelte",
  ];
  for (const file of forms) {
    const src = read(file);
    const ids = [...src.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]!);
    const labelled = ids.every((id) => src.includes(`for="${id}"`));
    ok(
      `every field on ${file.replace("src/", "")} has a label`,
      ids.length > 0 ? labelled : true
    );
  }
  ok(
    "the new pages use the house's own surfaces, and no shadows or large radii",
    pages.every((page) => {
      const src = read(page);
      return !/shadow-\[|rounded-(xl|2xl|3xl|full)/.test(src);
    })
  );

  /* ----------------------------------------------------------------------
   * 12. The copy obeys the house's rules: no em dash, no en dash, and none
   *     of the words the brand forbids.
   * ------------------------------------------------------------------- */
  const newCopy = JSON.stringify([ACCOUNT_HOME, PASSWORD_RESET, VERIFY_EMAIL]);
  ok("the new copy carries no em dash and no en dash", !newCopy.includes("—") && !newCopy.includes("–"));
  for (const file of forms) {
    const src = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    ok(
      `no visible string on ${file.replace("src/", "")} carries a dash`,
      !/"[^"\n]*[—–][^"\n]*"/.test(src)
    );
  }
}

console.log(`\n${passed} ACCOUNT ASSERTIONS PASSED`);
