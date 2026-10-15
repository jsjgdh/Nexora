/* Session arithmetic and the token broker's payload shape, kept pure.
 *
 * Why a separate module: the parts of a session that can be wrong in a way
 * nobody notices are all arithmetic — how early to treat a token as stale, and
 * how long to wait before replacing it. Neither existed while the client could
 * not renew at all, and both are invisible in a browser until a learner is
 * signed out mid-lesson, so they live here where the test suite can drive them
 * directly.
 *
 * No SvelteKit imports: `$app/environment` and `$env/dynamic/public` would make
 * this unimportable from a plain script.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/** Refresh this long before the token dies, so a slow network still lands
    inside the token's life. One minute of a five-minute token. */
export const REFRESH_SKEW_MS = 60_000;

/** Never schedule a refresh closer than this (a zero/negative delay would spin). */
export const MIN_REFRESH_DELAY_MS = 1_000;

/** setTimeout's ceiling: a longer delay overflows and fires immediately. */
export const MAX_REFRESH_DELAY_MS = 2_000_000_000;

function base64UrlToText(part: string): string | null {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The `exp` claim of a JWT as epoch milliseconds, or null when it is not a JWT
 * we can read (an opaque Clerk token, a truncated value, a legacy entry).
 *
 * Read rather than trusted from local storage: the stored expiry is a copy some
 * other tab wrote, while the token carries its own. When they disagree the
 * token wins.
 */
export function tokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  const text = base64UrlToText(part);
  if (!text) return null;
  try {
    const claims = JSON.parse(text) as { exp?: unknown };
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= 0) return null;
    return claims.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Is this token close enough to death that it must be replaced before use?
 *
 * An unknown expiry (null) is *not* expiring: we cannot tell, and forcing a
 * refresh on every call would turn one unknown into a request storm. The 401
 * retry in the store is the backstop for that case.
 */
export function isExpiring(expMs: number | null, now = Date.now(), skewMs = REFRESH_SKEW_MS): boolean {
  if (expMs === null) return false;
  return expMs - now <= skewMs;
}

/**
 * How long to wait before refreshing, or null when there is no expiry to count
 * down from. Always strictly less than the token's remaining life, so the timer
 * that uses it fires while the token still works.
 */
export function refreshDelayMs(
  expMs: number | null,
  now = Date.now(),
  skewMs = REFRESH_SKEW_MS
): number | null {
  if (expMs === null) return null;
  const delay = expMs - now - skewMs;
  return Math.min(Math.max(delay, MIN_REFRESH_DELAY_MS), MAX_REFRESH_DELAY_MS);
}

function parseUser(value: unknown): SessionUser | null {
  if (typeof value !== "object" || value === null) return null;
  const u = value as { id?: unknown; email?: unknown; name?: unknown };
  if (typeof u.id !== "string" || u.id.length === 0) return null;
  if (typeof u.email !== "string" || u.email.length === 0) return null;
  const name = u.name === null || u.name === undefined ? null : typeof u.name === "string" ? u.name : null;
  return { id: u.id, email: u.email, name };
}

export interface SessionStart {
  accessToken: string;
  /** Seconds, as the server stated them. */
  expiresIn: number;
  user: SessionUser | null;
}

/**
 * Validate what the broker sent back: `{ accessToken, expiresIn, user? }`.
 *
 * Returns null on anything malformed, and the caller keeps the session it
 * already had rather than adopting a token it cannot reason about. A number that
 * arrives as a string, a zero or negative lifetime, a missing token — each of
 * those is a broker bug or a captive portal answering instead of us, and each
 * would otherwise be stored as a session that expires at once or never.
 */
export function parseSessionStart(value: unknown): SessionStart | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { accessToken?: unknown; expiresIn?: unknown; user?: unknown };
  if (typeof v.accessToken !== "string" || v.accessToken.length === 0 || v.accessToken.length > 4096) {
    return null;
  }
  const expiresIn = v.expiresIn;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 604_800) {
    return null;
  }
  return { accessToken: v.accessToken, expiresIn, user: parseUser(v.user) };
}
