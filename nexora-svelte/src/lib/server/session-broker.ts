import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import type { Cookies } from "@sveltejs/kit";

/* The token broker: the app's own server, keeping the refresh token in a cookie
 * the page's JavaScript cannot read.
 *
 * Why the app's server and not the API directly. The gateway is a different
 * origin from the app (PUBLIC_API_URL is the browser's route to it), so a cookie
 * set by the gateway would be a cross-site cookie: `SameSite=None` plus
 * `Secure`, which does not work over plain http at all — so a local dev server
 * could never exercise the real thing, and production would need the app and the
 * API behind one origin to be safe. Serving the cookie from the app's own origin
 * instead makes it same-site by construction: `HttpOnly` (no script can read it,
 * so no XSS steals a 30-day credential), `SameSite=Lax` (a cross-site POST
 * cannot reach these endpoints with it), and a path scoped to exactly these
 * endpoints so it travels nowhere else.
 *
 * The refresh token therefore never reaches the browser's storage, and the
 * access token the browser does hold is short-lived by design. The gateway is
 * still the only public API surface; this module only calls its public
 * /api/auth routes, so it needs no mesh key of its own.
 */

export const REFRESH_COOKIE = "nexora_refresh";
/** Sent only to the four broker endpoints below, never to a page or the API. */
export const COOKIE_PATH = "/auth/session";
/** Matches the server's 30-day refresh lifetime. */
export const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Sign-in bodies are small; a cap is what stops an unbounded parse. */
const MAX_BODY_BYTES = 8192;
const GATEWAY_TIMEOUT_MS = 8000;

/**
 * Where this server reaches the gateway.
 *
 * `GATEWAY_URL` is the server-side address (in compose: http://gateway:8080) and
 * exists because `PUBLIC_API_URL` is the *browser's* route — a container cannot
 * reach the gateway at the browser's 127.0.0.1. Falling back to PUBLIC_API_URL
 * keeps a plain `vite dev` working with one variable, where both are localhost.
 */
export function gatewayBase(): string {
  const raw = ((env.GATEWAY_URL as string | undefined) ?? (publicEnv.PUBLIC_API_URL as string | undefined) ?? "")
    .trim()
    .replace(/\/+$/, "");
  return raw;
}

export function readRefreshToken(cookies: Cookies): string | null {
  const value = cookies.get(REFRESH_COOKIE);
  return value && value.length > 0 ? value : null;
}

/**
 * Attributes, and why each one:
 * - `httpOnly`: the page's scripts cannot read the credential (the whole point).
 * - `sameSite: "lax"`: a cross-site form/fetch POST does not carry it, which is
 *   what makes the broker endpoints safe without a CSRF token; a top-level
 *   navigation still sends it, so nothing about the normal flow changes.
 * - `secure` when the app is served over https. Not hardcoded true: that would
 *   silently drop the cookie on a plain-http dev host, which is exactly how the
 *   real flow would go untested.
 * - `path`: the cookie exists for these endpoints and is sent nowhere else.
 */
function cookieAttributes(url: URL) {
  return {
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: url.protocol === "https:",
    maxAge: REFRESH_MAX_AGE_S,
  };
}

export function setRefreshCookie(cookies: Cookies, url: URL, token: string): void {
  cookies.set(REFRESH_COOKIE, token, cookieAttributes(url));
}

export function clearRefreshCookie(cookies: Cookies, url: URL): void {
  cookies.delete(REFRESH_COOKIE, { path: COOKIE_PATH, httpOnly: true, sameSite: "lax", secure: url.protocol === "https:" });
}

/**
 * True when a browser told us the request came from another origin.
 *
 * A missing Origin (curl, a server-side caller) is not treated as cross-site:
 * there is no browser session to hijack in that case, and rejecting it would
 * break scripted use for no gain. A *present* mismatched Origin is exactly the
 * cross-site request `SameSite=Lax` already blocks, and this is the second
 * opinion that does not depend on the browser honouring it.
 */
export function crossSiteRequest(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== "" && origin !== url.origin;
}

/** Read a JSON body with a hard size cap, or report why not. */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; code: string; message: string }> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, status: 400, code: "bad_request", message: "Invalid request body." };
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, code: "too_large", message: "Request too large." };
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null) throw new Error("not an object");
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, code: "bad_request", message: "Invalid request body." };
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * The `{ accessToken, refreshToken, expiresIn }` triple the auth service issues,
 * or null when the reply is not that.
 *
 * Validated even though it comes from our own service: a captive portal, a
 * misrouted proxy or a future contract change must not be able to plant a
 * half-token in the learner's cookie, and a session that cannot be refreshed is
 * worse than a clear error at sign-in.
 */
export function tokensFrom(body: Record<string, unknown> | null): IssuedTokens | null {
  const t = body?.tokens as { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown } | undefined;
  if (!t) return null;
  if (typeof t.accessToken !== "string" || t.accessToken.length === 0) return null;
  if (typeof t.refreshToken !== "string" || t.refreshToken.length < 32) return null;
  if (typeof t.expiresIn !== "number" || !Number.isFinite(t.expiresIn) || t.expiresIn <= 0) return null;
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn };
}

/** A missing credential or a 200 that carried no tokens is never a success. */
const UNAVAILABLE = {
  error: { code: "auth_unavailable", message: "The sign-in service did not answer. Your work is saved locally." },
};

/**
 * Normalize any non-success reply into the platform's error envelope.
 *
 * A reply we cannot interpret (a 200 with no tokens, an HTML error page from a
 * proxy) becomes 502 rather than being passed through as the client's fault.
 */
export function failureReply(reply: GatewayReply): { status: number; body: Record<string, unknown> } {
  const status = reply.status >= 400 && reply.status <= 599 ? reply.status : 502;
  const error = reply.body?.error;
  const body =
    typeof error === "object" && error !== null
      ? reply.body
      : UNAVAILABLE;
  return { status, body: body as Record<string, unknown> };
}

export interface GatewayReply {
  /** The status the gateway (or the transport failure) produced. */
  status: number;
  body: Record<string, unknown> | null;
}

/**
 * Call a public /api/auth route on the gateway.
 *
 * An unreachable gateway is reported as 502 with the same error envelope the
 * platform uses, and never as a 200: the caller decides whether that ends a
 * session (it must not — an outage is not a rejection) or is merely an error to
 * show.
 */
export async function gatewayPost(
  path: string,
  payload: unknown,
  timeoutMs = GATEWAY_TIMEOUT_MS,
  headers: Record<string, string> = {}
): Promise<GatewayReply> {
  const base = gatewayBase();
  if (!base) {
    return {
      status: 503,
      body: { error: { code: "not_configured", message: "Accounts are not connected in this build." } },
    };
  }
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body: Record<string, unknown> | null = null;
    try {
      const parsed = (await res.json()) as unknown;
      if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
      /* an empty or non-JSON reply: status is still the answer */
    }
    return { status: res.status, body };
  } catch {
    return {
      status: 502,
      body: {
        error: { code: "auth_unavailable", message: "The sign-in service did not answer. Your work is saved locally." },
      },
    };
  }
}
