import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import {
  isExpiring,
  parseSessionStart,
  refreshDelayMs,
  tokenExpiryMs,
  type SessionUser,
} from "./session-core";
import type { Cohort, CohortDetail, CohortJoin } from "./cohorts";

export type { SessionUser } from "./session-core";

/* Cloud session layer (production backend). When PUBLIC_API_URL is unset the
   app runs fully local (localStorage progress, on-page tutor) — the gateway
   slice below activates automatically once configured. In AUTH_MODE=clerk
   deployments, swap the email/password forms for the Clerk components and
   store the Clerk session token here instead (see /auth page notes).
 *
 * Two credentials, two homes, deliberately (see lib/server/session-broker.ts):
 *
 *   access token  short-lived (minutes), held in memory for the life of the
 *                 page — a variable, not storage. It is the half an XSS could
 *                 take, so it is deliberately the cheap half: gone on the next
 *                 reload, worthless in a few minutes, and refused by the gateway
 *                 right after a sign-out.
 *   refresh token 30 days, in an HttpOnly cookie on this origin. No script can
 *                 read it, and it is what a reload re-earns the session from and
 *                 what renews it silently through the broker.
 *
 * Two consequences worth stating. A session no longer ends when the access token
 * expires — that was the whole point of issuing a renewable credential — and it
 * no longer depends on a page-readable token surviving: the page relearns who it
 * is from a credential it cannot read. */

const BASE = ((env.PUBLIC_API_URL as string | undefined) ?? "").replace(/\/$/, "");
/**
 * A relic: the local-storage key this module used to keep the access token under.
 * It is deleted on boot so a token from before the change does not sit in
 * page-readable storage. Nothing reads it.
 */
const LEGACY_TOKEN_KEY = "nexora-jwt";
/**
 * Clerk deployments keep their session in Clerk's own storage and renew it
 * through the provider, so there is no cookie here to restore and nothing for the
 * broker to do. Read from the same public key clerk.ts keys off, so the two agree
 * about the mode without this module importing Clerk.
 */
const CLERK_MODE = (((env.PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined) ?? "").trim()).startsWith("pk_");
/**
 * Same-origin, always: these are the app's own endpoints, served by this app's
 * server rather than by the gateway. Named one by one so the whole session
 * surface is greppable — "where does the browser renew?" has one answer, and
 * the test suite asserts it exists.
 */
const SESSION_BASE = "/auth/session";
const LOGIN_PATH = `${SESSION_BASE}/login`;
const REGISTER_PATH = `${SESSION_BASE}/register`;
const REFRESH_PATH = `${SESSION_BASE}/refresh`;
const LOGOUT_PATH = `${SESSION_BASE}/logout`;
const LOGOUT_ALL_PATH = `${SESSION_BASE}/logout-all`;
/* The three account flows that are not a session but go through the same
   broker: the password reset (ask, then set), the email verification (ask,
   then confirm) and the proof ledger. They are same-origin for the same
   reason the session endpoints are: the platform is a different origin, and
   the app's server is the one that can reach it. */
const PASSWORD_RESET_REQUEST_PATH = `${SESSION_BASE}/password-reset/request`;
const PASSWORD_RESET_CONFIRM_PATH = `${SESSION_BASE}/password-reset/confirm`;
const VERIFY_EMAIL_REQUEST_PATH = `${SESSION_BASE}/verify-email/request`;
const VERIFY_EMAIL_CONFIRM_PATH = `${SESSION_BASE}/verify-email/confirm`;
/** Cross-tab serialization of refreshes (see rotate()). */
const REFRESH_LOCK = "nexora-session-refresh";

export const apiConfigured = BASE.length > 0;

interface ApiError {
  status: number;
  code: string;
  message: string;
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * Run `job` with refreshing serialized across this origin's tabs.
 *
 * Not an optimisation. Refresh tokens rotate and the service treats a *replayed*
 * one as proof of theft — it revokes every session in the family. Two tabs
 * refreshing at the same instant therefore look like theft, so exactly one may
 * talk to the server at a time. Tabs still agree without sharing a token, because
 * the refresh *cookie* belongs to the whole browser: a second tab's request
 * naturally carries whatever the first tab just rotated it to, and a live
 * rotation is not a replay. What the lock removes is two requests in flight with
 * the same value. Where the Web Locks API is missing (Safari before 15.4) that
 * narrow race is unguarded, and losing it costs a sign-in rather than exposing
 * anything.
 */
async function withCrossTabLock<T>(run: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as unknown as { locks?: LockManagerLike } | undefined)?.locks;
  if (!locks?.request) return run();
  return locks.request(REFRESH_LOCK, run);
}

class SessionStore {
  /**
   * The access token, in memory only.
   *
   * Deliberate: it is a bearer credential for the next few minutes, and whatever
   * a script on this origin can read is what an injected script would walk away
   * with. Nothing here writes it to storage, so a reload starts with nothing and
   * re-earns the session from the HttpOnly cookie (see restore()). It also means
   * the page's copy dies with the page — a cleared browser, another tab signing
   * out, or a session ending server-side is not something this copy can outlive.
   */
  token = $state<string | null>(null);
  user = $state<SessionUser | null>(null);
  loadingUser = $state(false);
  /**
   * True while the session is still being re-established from the cookie.
   *
   * Any surface that would otherwise claim "you are signed out" has to wait for
   * this to clear: on a fresh load that claim is not yet known to be true, because
   * the credential is a cookie and no cookie is readable to scripts.
   */
  restoring = $state(apiConfigured && !CLERK_MODE);
  /**
   * Bumped when the *identity* changes — sign-in, sign-out, an account switch —
   * and never when a live session is renewed.
   *
   * Surfaces that belong to one account key their work on this rather than on
   * the token value. The billing latch is the reason it exists: one plan
   * read per account, re-armed on a sign-in or account switch — but a silent
   * token rotation must never look like a switch, so keying on the token
   * would re-hit billing every few minutes.
   */
  epoch = $state(0);
  /**
   * External identity (Clerk). When set, API calls resolve a fresh token
   * through it instead of trusting the stored one — Clerk rotates session
   * tokens, and a cached copy would go stale mid-lesson. The rest of the
   * app keeps reading `session.token`; the provider only refreshes it.
   */
  private tokenProvider: (() => Promise<string | null>) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<string | null> | null = null;
  private bootstrapped = false;

  get loggedIn(): boolean {
    return this.token !== null;
  }

  setTokenProvider(provider: (() => Promise<string | null>) | null) {
    this.tokenProvider = provider;
    // Whoever owns freshness, owns it alone: two schedulers would race each
    // other into the rotation-reuse detection above.
    if (provider) this.cancelTimer();
    else this.schedule();
  }

  /**
   * Adopt a token minted elsewhere (a Clerk session token). Clears the
   * cached user so the header re-resolves identity against the new token,
   * and drops any provider the previous mode installed.
   */
  useExternalToken(token: string | null) {
    this.setTokenProvider(null);
    this.persist(token, null);
  }

  /**
   * Re-establish a session on page load. Called once per app load (the layout's
   * onMount), for every visitor.
   *
   * The page begins with no token by design, so this is the only way it can learn
   * whether a learner is signed in — the credential is the HttpOnly cookie, which
   * no script can read. Asking costs one request even for a signed-out visitor,
   * and it does not leave this server: without a cookie the broker answers 401
   * itself and never touches the platform. That is a cheaper price than a learner
   * who has to sign in again on every reload, and the cookie lasts thirty days.
   *
   * `restoring` clears exactly once, in a finally, so no failure can leave the
   * interface unable to say either way.
   */
  async restore(): Promise<void> {
    if (!browser || this.bootstrapped) return;
    this.bootstrapped = true;
    try {
      // A token from before this change lived in local storage. Drop it: it is
      // page-readable, and nothing reads it any more.
      try {
        window.localStorage.removeItem(LEGACY_TOKEN_KEY);
      } catch {
        /* storage disabled */
      }
      if (!apiConfigured || CLERK_MODE) return;
      await this.refresh();
    } finally {
      this.restoring = false;
    }
  }

  /**
   * A fresh access token, or null when the session is genuinely over.
   *
   * Single-flight per tab, serialized across tabs: ten callers that all notice a
   * stale token must produce one rotation, not ten.
   */
  async refresh(): Promise<string | null> {
    if (this.tokenProvider) return this.token;
    if (!apiConfigured) return this.token;
    this.inFlight ??= this.rotate().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async resolveToken(): Promise<string | null> {
    if (this.tokenProvider) {
      try {
        const fresh = await this.tokenProvider();
        // persist(), not useExternalToken(): the latter drops the provider as
        // part of adopting a token from elsewhere, and here the provider is the
        // thing keeping this token fresh. Dropping it would leave Clerk sessions
        // with no renewal path on the first call after a rotation.
        if (fresh && fresh !== this.token) this.persist(fresh, this.user);
        return fresh ?? this.token;
      } catch {
        return this.token;
      }
    }
    // No token yet — a page that has not finished restoring, or one whose copy
    // was cleared: the cookie may still hold the session, so ask for it rather
    // than send a request the platform will reject.
    if (!this.token) return apiConfigured ? this.refresh() : null;
    // Every gateway call goes through here, so a token that is about to die is
    // replaced before the request rather than after a 401.
    if (isExpiring(tokenExpiryMs(this.token))) return this.refresh();
    return this.token;
  }

  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Refresh this token slightly before it dies, for as long as it lives. */
  private schedule() {
    this.cancelTimer();
    if (!browser || this.tokenProvider || !this.token || !apiConfigured) return;
    const delay = refreshDelayMs(tokenExpiryMs(this.token));
    if (delay === null) return;
    this.timer = setTimeout(() => {
      void this.refresh();
    }, delay);
  }

  private async rotate(): Promise<string | null> {
    return withCrossTabLock(async () => {
      // Nothing to look up here for a sibling tab's work: the refresh token is a
      // cookie the entire browser shares, so whatever another tab rotated it to is
      // already what this request carries. The lock is what keeps two of them
      // from being in flight with the same value.
      let res: Response;
      try {
        res = await fetch(REFRESH_PATH, { method: "POST" });
      } catch {
        // We learned nothing (offline, tunnel down). The session stands, and the
        // timer or the next call retries.
        return this.token;
      }
      if (res.status === 401) {
        // Authoritative: revoked, expired, or replayed. The session is over, and
        // pretending otherwise would leave a signed-in shell around nothing.
        this.persist(null, null);
        return null;
      }
      if (!res.ok) return this.token;
      const start = parseSessionStart(await res.json().catch(() => null));
      if (!start) return this.token;
      this.persist(start.accessToken, start.user ?? this.user);
      return this.token;
    });
  }

  private persist(token: string | null, user: SessionUser | null) {
    const wasSignedIn = this.token !== null;
    const idBefore = this.user?.id ?? null;
    const idAfter = user?.id ?? null;
    // In memory, and only in memory: see the note on `token` above. Nothing here
    // touches storage, which is what makes a stolen page snapshot expire with the
    // page instead of lasting until someone clears their browser.
    this.token = token;
    this.user = user;
    // A renewal keeps the same identity, so it must not look like a switch. A
    // Clerk rotation passes through a null user on its way back to the same one,
    // which is why the account test needs both sides to be known.
    const signedInChanged = wasSignedIn !== (token !== null);
    const switchedAccount = idBefore !== null && idAfter !== null && idBefore !== idAfter;
    if (signedInChanged || switchedAccount) this.epoch += 1;
    this.schedule();
  }

  /**
   * One JSON call to the platform. A 401 is retried once against a renewed
   * token, because the alternative — surfacing an expired credential as an error
   * to whatever the learner was doing — is how a short access-token life becomes
   * visible to them at all.
   */
  private async request<T>(
    path: string,
    opts: { method?: string; token?: string | null; body?: unknown; retry?: boolean } = {}
  ): Promise<T> {
    const sameOrigin = path.startsWith(SESSION_BASE);
    if (!sameOrigin && !apiConfigured) throw new Error("API not configured");
    const send = (token: string | null | undefined): Promise<Response> => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      return fetch((sameOrigin ? "" : BASE) + path, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    };
    let sent = opts.token;
    let res = await send(sent);
    if (res.status === 401 && !sameOrigin && opts.retry !== false && sent) {
      const renewed = await this.refresh();
      if (renewed && renewed !== sent) {
        sent = renewed;
        res = await send(sent);
      }
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON edge (proxies should always be JSON) */
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      const e = new Error(err?.message ?? `Request failed (${res.status})`) as Error & ApiError;
      e.status = res.status;
      e.code = err?.code ?? "request_failed";
      throw e;
    }
    return json as T;
  }

  /** Sign in or register through the broker, then hold the short-lived token. */
  private async startSession(path: string, body: unknown): Promise<void> {
    const reply = await this.request<unknown>(path, { method: "POST", body, retry: false });
    const start = parseSessionStart(reply);
    if (!start) throw new Error("The sign-in service answered with something we could not use.");
    this.persist(start.accessToken, start.user);
  }

  /**
   * Create an account, carrying the notice the learner was shown.
   *
   * The declarations are not decoration: a production deployment refuses to
   * create an account without them (see the auth service's consentRequired), and
   * the *versions* travel with the request so the record the platform keeps says
   * which wording was on screen rather than which wording happened to be current
   * when the row was written. A mismatch is a 409 with nothing created, and the
   * page turns that into "reload and read them again".
   */
  async register(
    email: string,
    password: string,
    name: string,
    declarations: {
      acceptTerms: boolean;
      acceptPrivacy: boolean;
      ageAffirmed: boolean;
      documentVersions: { terms: string; privacy: string };
    }
  ) {
    await this.startSession(REGISTER_PATH, {
      email,
      password,
      name: name || undefined,
      ...declarations,
    });
  }

  /* ---- the rights surface (see company/legal/COMPLIANCE-MATRIX.md) ----
   *
   * Four calls, and every one of them is a right with a deadline attached rather
   * than a support request: export (access and portability), deletion (erasure),
   * consent records (Art. 7(1) proof, shown back to the person who gave them) and
   * the request ledger for everything that needs a human answer.
   *
   * They go straight to the gateway rather than through the broker routes under
   * /auth/session: that broker exists to keep a refresh token out of the page's
   * reach, and these calls need only the short-lived access token already in
   * memory.
   */

  /** This half of the export. Billing answers for its own half; the account page
   * merges the two so the file a learner downloads is the whole record, with each
   * half labelled by the service that produced it. */
  async exportAuth() {
    return this.request<Record<string, unknown>>("/api/auth/account/export", {
      token: await this.resolveToken(),
    });
  }

  async exportBilling() {
    return this.request<{ export: Record<string, unknown> }>("/api/billing/export", {
      token: await this.resolveToken(),
    });
  }

  /**
   * Erase the account. The word is required by the server as well as here: this
   * is the one action a learner cannot undo, so it is confirmed by typing rather
   * than by a checkbox a stray click could reach.
   */
  async deleteAccount(reason?: string) {
    return this.request<{
      deleted: Record<string, number>;
      retained: { category: string; reason: string; basis: string }[];
      processorsQueued: string[];
      receiptId: string;
    }>("/api/auth/account/delete", {
      method: "POST",
      token: await this.resolveToken(),
      body: { confirm: "DELETE", reason: reason || undefined },
    });
  }

  /** What this account is currently bound to, with versions and bases. */
  async myConsents() {
    return this.request<{
      consents: {
        document: string;
        version: string;
        purpose: string;
        basis: string;
        acceptedAt: string;
        withdrawnAt: string | null;
      }[];
      currentVersions: { terms: string; privacy: string };
    }>("/api/auth/consents", { token: await this.resolveToken() });
  }

  async withdrawConsent(document: string) {
    return this.request<{ withdrawn: boolean; document: string; effect: string | null }>(
      "/api/auth/consents/withdraw",
      { method: "POST", token: await this.resolveToken(), body: { document } }
    );
  }

  async fileRightsRequest(kind: string, detail: string, nominee?: string) {
    return this.request<{
      request: { id: string; kind: string; status: string; dueAt: string };
      responseDays: number;
      immediate: string | null;
    }>("/api/auth/rights", {
      method: "POST",
      token: await this.resolveToken(),
      body: nominee ? { kind, detail, nominee } : { kind, detail },
    });
  }

  async myRightsRequests() {
    return this.request<{
      requests: {
        id: string;
        kind: string;
        status: string;
        detail: string;
        createdAt: string;
        dueAt: string;
        resolvedAt: string | null;
        resolution: string | null;
      }[];
      responseDays: number;
    }>("/api/auth/rights", { token: await this.resolveToken() });
  }

  async login(email: string, password: string) {
    await this.startSession(LOGIN_PATH, { email, password });
  }

  /* ---- the two account flows that are not sessions ----
   *
   * A password reset and an email verification are not a session: they
   * neither mint a token nor read one. They travel through the same broker
   * anyway, for two reasons that both matter.
   *
   * The first is reachability. The gateway is a different origin from this
   * app, and in a compose deployment the browser's `127.0.0.1` is not the
   * gateway's address, so the call belongs on this origin's own server
   * (see lib/server/session-broker.ts).
   *
   * The second is the shape of the answer. The platform's contract for the
   * request half of both flows is that it always answers 202 and never says
   * whether the address has an account. That guarantee has to hold on this
   * side of the wire as well, so the broker answers 202 whatever the
   * platform said, and the page has one sentence for both cases. If the
   * broker passed the platform's body through, a future platform that
   * started answering "no such account" would turn this page into an
   * oracle without anybody changing the page.
   *
   * The confirm half is different: it has to be able to fail, so its error
   * envelope is passed through as it is, and the page reads the code. */

  /**
   * Ask for a password reset link.
   *
   * The answer is deliberately uninteresting: `ok` is true when the request
   * was accepted, and it says nothing about whether the address has an
   * account. A failure here is either the platform being unreachable or
   * this build having no platform, and both are reported as themselves.
   */
  async requestPasswordReset(email: string) {
    return this.request<{ ok: boolean }>(PASSWORD_RESET_REQUEST_PATH, {
      method: "POST",
      body: { email },
      retry: false,
    });
  }

  /**
   * Set a new password with the token from the link.
   *
   * The token is a one-time credential and it is used the way a one-time
   * credential is used: it is sent once, in a body, to this app's own
   * server, and it is never written to storage or to the URL by anything
   * this code controls.
   */
  async confirmPasswordReset(token: string, newPassword: string) {
    return this.request<{ ok: boolean }>(PASSWORD_RESET_CONFIRM_PATH, {
      method: "POST",
      body: { token, newPassword },
      retry: false,
    });
  }

  /** Ask for a verification email. The answer never says whether one was sent. */
  async requestEmailVerification(email: string) {
    return this.request<{ ok: boolean }>(VERIFY_EMAIL_REQUEST_PATH, {
      method: "POST",
      body: { email },
      retry: false,
    });
  }

  /**
   * Confirm an address with the code or the token from the link.
   *
   * The platform answers with the user it verified, so the page can say
   * whose address it was without asking again.
   */
  async confirmEmailVerification(token: string) {
    return this.request<{ user: SessionUser; verified: boolean }>(VERIFY_EMAIL_CONFIRM_PATH, {
      method: "POST",
      body: { token },
      retry: false,
    });
  }

  /**
   * Approve an IDE's device code, binding this browser session's account to it.
   * The IDE polls and signs itself in — the browser never sees the device
   * secret and the IDE never sees the password. A wrong code is a 404 from the
   * platform, surfaced here as words rather than a status.
   */
  async approveDevice(userCode: string) {
    return this.request<{ ok: boolean }>("/api/auth/device/approve", {
      method: "POST",
      token: await this.resolveToken(),
      body: { userCode },
    });
  }

  /** The public IDE roadmap: every phase by name and tier, no lesson bodies. */
  async ideManifest() {
    return this.request<{
      manifest: {
        id: string;
        title: string;
        version: number;
        phases: { id: string; title: string; goal: string; tier: string; authored: boolean; activityCount: number }[];
      };
    }>("/api/curriculum/ide/manifest", { token: await this.resolveToken() });
  }

  async linkClerkProfile(email: string, name?: string) {
    const r = await this.request<{ user: SessionUser; linked: boolean }>("/api/auth/link", {
      method: "POST",
      token: await this.resolveToken(),
      body: name ? { email, name } : { email },
    });
    this.user = r.user;
  }

  /**
   * End the session locally first, then revoke it on the server.
   *
   * Local state goes immediately so nothing in the interface keeps acting as a
   * signed-in learner if the network is slow; the broker call then revokes both
   * halves — the refresh family (and with it the cookie) and, because the access
   * token travels with the request, that token's own `jti`, so the credential in
   * hand stops being accepted at once instead of at the end of its TTL. It never
   * throws: a sign-out that fails must still leave the learner signed out here.
   */
  async logout(): Promise<void> {
    // Read before clearing, and do not renew: this is the credential the server
    // has to revoke, and it exists nowhere else — storage never held it. A page
    // with no token has nothing of its own left to revoke, and minting a fresh
    // one purely to revoke it would be work with no effect.
    const token = this.token;
    this.persist(null, null);
    if (!apiConfigured) return;
    try {
      await fetch(LOGOUT_PATH, {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    } catch {
      /* The cookie is HttpOnly, so only the server can clear it; if this call
         fails the row it names lives until its own expiry. Signing out locally
         is still the right answer here. */
    }
  }

  /**
   * End every session this account has, on every device — the answer to "I think
   * someone else is signed in".
   *
   * This device is signed out the moment the learner asks (local state first, as
   * in logout), because a page that keeps acting signed in while a security call
   * is in flight is the wrong thing to show them. Unlike logout it reports
   * failure: the sessions it ends are on devices the learner cannot see, so
   * silence there would let them believe the others are gone when they are not.
   *
   * Returns how many server-side sessions were ended, for the confirmation line.
   */
  async logoutEverywhere(): Promise<number> {
    const token = this.token;
    if (!apiConfigured || !token) {
      this.persist(null, null);
      throw new Error("Sign in first. This ends sessions on every device.");
    }
    this.persist(null, null);
    let res: Response;
    try {
      res = await fetch(LOGOUT_ALL_PATH, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error("The sign-in service did not answer. Your other devices may still be signed in.");
    }
    const body = (await res.json().catch(() => null)) as { sessions?: unknown } | null;
    if (!res.ok) {
      throw new Error("Could not end your other sessions. Try again.");
    }
    return typeof body?.sessions === "number" ? body.sessions : 0;
  }

  async refreshUser() {
    if (!this.token || this.loadingUser) return;
    this.loadingUser = true;
    try {
      const r = await this.request<{ user: SessionUser }>("/api/auth/me", { token: await this.resolveToken() });
      this.user = r.user;
    } catch (err) {
      // Two very different failures used to look identical here, and both
      // signed the learner out:
      //   - the server rejected the token → the session really is over
      //   - the server could not be reached → we do not know anything yet
      // An unreachable platform is the ordinary case mid-lesson (a tunnel, a
      // deploy, a flaky connection). Throwing away a valid token there signs a
      // signed-in learner out for our operational problem, and they meet a
      // sign-in form instead of their work. Only an authoritative rejection
      // ends the session; anything else keeps the token and retries next load.
      // (A 401 that reaches here has already been retried against a renewed
      // token, so it means the renewal was refused too.)
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) this.persist(null, null);
    } finally {
      this.loadingUser = false;
    }
  }

  async plans() {
    return this.request<{ plans: { slug: string; name: string }[] }>("/api/billing/plans", {
      token: await this.resolveToken(),
    });
  }

  async checkout(input: { plan: string; email: string; name?: string; returnUrl?: string }) {
    return this.request<{ checkoutUrl: string; sessionId: string }>("/api/billing/checkout", {
      method: "POST",
      token: await this.resolveToken(),
      body: input,
    });
  }

  /**
   * Mint a Dodo customer-portal session. Cancel, card update and invoice
   * history live in the provider's portal; the app only redirects to it.
   */
  async portal(input: { returnUrl?: string } = {}) {
    return this.request<{ portalUrl: string }>("/api/billing/portal", {
      method: "POST",
      token: await this.resolveToken(),
      body: input,
    });
  }

  async subscription() {
    return this.request<{
      subscription: { plan: string | null; status: string | null; entitled: boolean; currentPeriodEnd: string | null };
    }>("/api/billing/subscription", { token: await this.resolveToken() });
  }

  /**
   * Verified proof, synced from the IDE: attested records the platform's own
   * signatures verify, newest first. Rendered as-is — rows are never
   * synthesized, cached as credentials, or mixed with local practice.
   *
   * The ledger lives in the auth service, and the gateway publishes it twice:
   * under the auth prefix, where the service's own routes live, and under the
   * proofs prefix, which is the same service behind a name that says what the
   * route is for. The auth prefix is asked first because that is the
   * service's own path, and the proofs prefix is the fallback for a
   * deployment that publishes only that one. A 404 falls through to the
   * other path; anything else is the answer, because a 401 must not be
   * retried against a second route and reported as something it is not.
   */
  async myProofs() {
    const paths = ["/api/auth/proofs", "/api/proofs"];
    let last: unknown = null;
    for (const path of paths) {
      try {
        return await this.request<{
          proofs: { competencyId: string; level: string; kind: string; issuedAt: string }[];
        }>(path, { token: await this.resolveToken() });
      } catch (err) {
        last = err;
        const status = (err as { status?: number }).status;
        if (status !== 404 && status !== 501) throw err;
      }
    }
    throw last instanceof Error ? last : new Error("Could not load verified proof.");
  }

  /* ---- the cohort surface ----
   *
   * A cohort is a group of learners, in one course, in one term, under one
   * licence. The routes are the contract's, and the bearer is the same short
   * lived token every other call uses: the refresh token stays in its
   * HttpOnly cookie, and the page never holds a credential of its own.
   *
   * The calls are here rather than in the pages for the reason the other
   * calls are: the page renders state, the store owns the bearer, and the
   * suite can then check that no page talks to the platform directly. */

  /** The cohorts the caller teaches. */
  async listCohorts(): Promise<Cohort[]> {
    const reply = await this.request<{ cohorts: Cohort[] }>("/api/auth/cohorts", {
      token: await this.resolveToken(),
    });
    return reply.cohorts ?? [];
  }

  /** The cohorts the caller is in. */
  async myCohorts(): Promise<Cohort[]> {
    const reply = await this.request<{ cohorts: Cohort[] }>("/api/auth/cohorts/mine", {
      token: await this.resolveToken(),
    });
    return reply.cohorts ?? [];
  }

  /** Create a cohort. The platform creates it in the pending state. */
  async createCohort(input: {
    name: string;
    institution: string;
    courseId: string;
    term: string;
    seats: number;
  }): Promise<Cohort> {
    const reply = await this.request<{ cohort: Cohort }>("/api/auth/cohorts", {
      method: "POST",
      token: await this.resolveToken(),
      body: input,
    });
    return reply.cohort;
  }

  /** A cohort, with its roster and what the platform has verified. */
  async cohortDetail(id: string): Promise<CohortDetail> {
    return this.request<CohortDetail>(`/api/auth/cohorts/${encodeURIComponent(id)}`, {
      token: await this.resolveToken(),
    });
  }

  /** End a licence, so no new entitlement is granted. */
  async endCohort(id: string): Promise<void> {
    await this.request<{ ok: boolean }>(
      `/api/auth/cohorts/${encodeURIComponent(id)}/end`,
      { method: "POST", token: await this.resolveToken() }
    );
  }

  /** Join a cohort with the code on the slide. */
  async joinCohort(joinCode: string): Promise<CohortJoin> {
    return this.request<CohortJoin>("/api/auth/cohorts/join", {
      method: "POST",
      token: await this.resolveToken(),
      body: { joinCode },
    });
  }

  /**
   * The file of what the platform judged, as the CSV the platform sent it.
   *
   * Fetched as text rather than through `request()`, because `request()`
   * reads every answer as JSON and this one is a file. The bearer is the
   * same one, and it is still only in memory.
   */
  async cohortExport(id: string): Promise<string> {
    const token = await this.resolveToken();
    const response = await fetch(
      `${BASE}/api/auth/cohorts/${encodeURIComponent(id)}/export`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} }
    );
    if (!response.ok) {
      const error = new Error(`The file could not be fetched (${response.status})`) as Error & {
        status: number;
        code: string;
      };
      error.status = response.status;
      error.code = "request_failed";
      throw error;
    }
    return response.text();
  }
}

export const session = new SessionStore();
