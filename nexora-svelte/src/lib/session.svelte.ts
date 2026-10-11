import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";

/* Cloud session layer (production backend). When PUBLIC_API_URL is unset the
   app runs fully local (localStorage progress, on-page tutor) — the gateway
   slice below activates automatically once configured. In AUTH_MODE=clerk
   deployments, swap the email/password forms for the Clerk components and
   store the Clerk session token here instead (see /auth page notes). */

const BASE = ((env.PUBLIC_API_URL as string | undefined) ?? "").replace(/\/$/, "");
const TOKEN_KEY = "nexora-jwt";

export const apiConfigured = BASE.length > 0;

interface ApiError {
  status: number;
  code: string;
  message: string;
}

async function call<T>(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> {
  if (!apiConfigured) throw new Error("API not configured");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
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

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

class SessionStore {
  token = $state<string | null>(browser ? window.localStorage.getItem(TOKEN_KEY) : null);
  user = $state<SessionUser | null>(null);
  loadingUser = $state(false);
  /**
   * External identity (Clerk). When set, API calls resolve a fresh token
   * through it instead of trusting the stored one — Clerk rotates session
   * tokens, and a cached copy would go stale mid-lesson. The rest of the
   * app keeps reading `session.token`; the provider only refreshes it.
   */
  private tokenProvider: (() => Promise<string | null>) | null = null;

  get loggedIn(): boolean {
    return this.token !== null;
  }

  setTokenProvider(provider: (() => Promise<string | null>) | null) {
    this.tokenProvider = provider;
  }

  async resolveToken(): Promise<string | null> {
    if (!this.tokenProvider) return this.token;
    try {
      const fresh = await this.tokenProvider();
      if (fresh && fresh !== this.token) this.save(fresh, this.user);
      return fresh ?? this.token;
    } catch {
      return this.token;
    }
  }

  private save(token: string | null, user: SessionUser | null) {
    this.token = token;
    this.user = user;
    if (!browser) return;
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
  }

  async register(email: string, password: string, name: string) {
    const r = await call<{ user: SessionUser; tokens: { accessToken: string } }>("/api/auth/register", {
      method: "POST",
      body: { email, password, name: name || undefined },
    });
    this.save(r.tokens.accessToken, r.user);
  }

  async login(email: string, password: string) {
    const r = await call<{ user: SessionUser; tokens: { accessToken: string } }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    this.save(r.tokens.accessToken, r.user);
  }

  /**
   * Adopt a token minted elsewhere (a Clerk session token). Clears the
   * cached user so the header re-resolves identity against the new token,
   * and drops any provider the previous mode installed.
   */
  useExternalToken(token: string | null) {
    this.setTokenProvider(null);
    this.save(token, null);
  }

  async linkClerkProfile(email: string, name?: string) {
    const r = await call<{ user: SessionUser; linked: boolean }>("/api/auth/link", {
      method: "POST",
      token: this.token,
      body: name ? { email, name } : { email },
    });
    this.user = r.user;
  }

  logout() {
    this.save(null, null);
  }

  async refreshUser() {
    if (!this.token || this.loadingUser) return;
    this.loadingUser = true;
    try {
      const r = await call<{ user: SessionUser }>("/api/auth/me", { token: this.token });
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
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) this.save(null, null);
    } finally {
      this.loadingUser = false;
    }
  }

  async askTutor(input: {
    missionId: string;
    code: string;
    failingChecks: string[];
    /** The learner's real compiler/runtime output, so the tutor explains the
        error actually in front of them rather than a hypothetical one. */
    errorOutput?: string;
    hintLevel: number;
  }) {
    return call<{ text: string; source: string }>("/api/tutor/ask", {
      method: "POST",
      token: await this.resolveToken(),
      body: input,
    });
  }

  async plans() {
    return call<{ plans: { slug: string; name: string }[] }>("/api/billing/plans", { token: await this.resolveToken() });
  }

  async checkout(input: { plan: string; email: string; name?: string; returnUrl?: string }) {
    return call<{ checkoutUrl: string; sessionId: string }>("/api/billing/checkout", {
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
    return call<{ portalUrl: string }>("/api/billing/portal", {
      method: "POST",
      token: await this.resolveToken(),
      body: input,
    });
  }

  async subscription() {
    return call<{
      subscription: { plan: string | null; status: string | null; entitled: boolean; currentPeriodEnd: string | null };
    }>("/api/billing/subscription", { token: await this.resolveToken() });
  }
}

export const session = new SessionStore();
