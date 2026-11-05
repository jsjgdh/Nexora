import { env } from "$env/dynamic/private";
import type { RequestEvent } from "@sveltejs/kit";
import type { SessionManager } from "@kinde-oss/kinde-auth-sveltekit";
import { gatewayPost } from "./session-broker";
import type { SessionUser } from "../session-core";

/* Kinde on this app's server.
 *
 * Kinde's SvelteKit SDK keeps the access, refresh and ID tokens in HttpOnly
 * cookies on this origin. The page cannot read them, and the rest of the app
 * still expects the same thing it always did: a short-lived access token in
 * memory and a SessionUser beside it. This module is the exchange between the
 * two — it asks Kinde for the current token (refreshing through Kinde's own
 * refresh cookie when needed), reads the profile it verified, and links that
 * subject to the platform's profile row.
 *
 * Why the link happens here rather than in the browser: the gateway verifies a
 * Kinde token and forwards its subject as x-user-id, and the auth service owns
 * the row that id names. Doing it in one server call means the browser never
 * sees the Kinde token until the account behind it exists, and a conflict is a
 * redirect to a page the learner can read rather than a half-signed-in shell.
 *
 * The audience is required. Kinde signs tokens for a whole business, not for a
 * single application; `aud` is what says a token was minted for this platform's
 * API rather than for another app in the same Kinde environment. Without it the
 * gateway would be accepting a wider set of tokens than this service is. */

function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const issuer = ((env.KINDE_ISSUER_URL as string | undefined) ?? "").trim().replace(/\/$/, "");
const redirectUrl = ((env.KINDE_REDIRECT_URL as string | undefined) ?? "").trim();
const postLogin = ((env.KINDE_POST_LOGIN_REDIRECT_URL as string | undefined) ?? "").trim();
const postLogout = ((env.KINDE_POST_LOGOUT_REDIRECT_URL as string | undefined) ?? "").trim();
const audience = ((env.KINDE_AUDIENCE as string | undefined) ?? "").trim();

/**
 * Whether the server has everything Kinde needs to complete a flow.
 *
 * The auth page can be reached in a build where the public switch says `kinde`
 * but the server's half was never filled in. In that state the honest answer is
 * "sign-in is not configured", not a redirect to an endpoint that cannot build
 * an authorization URL. This is deliberately a boolean rather than the values:
 * the page has no business knowing the client secret.
 */
export const kindeServerConfigured = Boolean(
  httpUrl(issuer) &&
    ((env.KINDE_CLIENT_ID as string | undefined) ?? "").trim() &&
    ((env.KINDE_CLIENT_SECRET as string | undefined) ?? "").trim() &&
    httpUrl(redirectUrl) &&
    postLogin &&
    postLogout &&
    audience
);

/* Social connections that can get their own button on the account page.
 *
 * The value is Kinde's connection id, not a provider client id: the provider's
 * OAuth client id and secret live in Kinde, and this app never holds them. A
 * connection with no id is simply not offered as its own button, which is the
 * honest state before somebody has finished the dashboard half; Kinde's own
 * page still shows every connection that is enabled there.
 *
 * Keeping the ids server-side is deliberate. They are not secrets, but which
 * providers a deployment offers is configuration, and the page only needs the
 * slugs and labels it draws. */
export const KINDE_SOCIAL_PROVIDERS = [
  { slug: "google", label: "Google", envKey: "KINDE_CONNECTION_GOOGLE" },
  { slug: "github", label: "GitHub", envKey: "KINDE_CONNECTION_GITHUB" },
  { slug: "discord", label: "Discord", envKey: "KINDE_CONNECTION_DISCORD" },
] as const;

export type KindeSocialProvider = (typeof KINDE_SOCIAL_PROVIDERS)[number]["slug"];

export interface KindeSocialOption {
  slug: KindeSocialProvider;
  label: string;
}

export function isKindeSocialProvider(value: string): value is KindeSocialProvider {
  return KINDE_SOCIAL_PROVIDERS.some((provider) => provider.slug === value);
}

export function kindeConnectionId(slug: KindeSocialProvider): string | null {
  const provider = KINDE_SOCIAL_PROVIDERS.find((item) => item.slug === slug);
  if (!provider) return null;
  const value = ((env[provider.envKey] as string | undefined) ?? "").trim();
  return value || null;
}

export function enabledKindeSocialProviders(): KindeSocialOption[] {
  if (!kindeServerConfigured) return [];
  return KINDE_SOCIAL_PROVIDERS.flatMap((provider) => {
    const value = ((env[provider.envKey] as string | undefined) ?? "").trim();
    return value ? [{ slug: provider.slug, label: provider.label }] : [];
  });
}

/**
 * The authorization URL for one connection.
 *
 * `connection_id` is the SDK's supported way to skip Kinde's chooser: the
 * learner lands on the provider's own page instead of a list they have already
 * chosen from. The SDK still creates the state and PKCE verifier and stores
 * them through the session hook, so this is the same flow as the hosted login,
 * only with the provider preselected. Null means the build cannot start the
 * flow; the caller turns that into the page's unavailable state.
 */
export async function kindeSocialLoginUrl(
  event: RequestEvent,
  connectionId: string
): Promise<URL | null> {
  if (!kindeServerConfigured) return null;
  try {
    const { kindeAuthClient } = await import("@kinde-oss/kinde-auth-sveltekit");
    const manager = event.request as unknown as SessionManager;
    return await kindeAuthClient.login(manager, {
      authUrlParams: { connection_id: connectionId },
    });
  } catch {
    return null;
  }
}

export interface KindeIdentity {
  accessToken: string;
  /** The lifetime the client's broker contract asks for. The token's own `exp`
      is what the client schedules from; this only has to be positive. */
  expiresIn: number;
  user: SessionUser;
}

interface KindeProfile {
  id?: unknown;
  email?: unknown;
  given_name?: unknown;
  family_name?: unknown;
}

function decodePayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
    );
    const value = JSON.parse(json) as unknown;
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function lifetimeSeconds(token: string): number {
  const payload = decodePayload(token);
  const exp = payload?.exp;
  if (typeof exp === "number" && Number.isFinite(exp)) {
    const left = Math.floor(exp - Date.now() / 1000);
    if (left > 0) return Math.min(left, 604_800);
  }
  return 3_600;
}

function profileUser(value: unknown): SessionUser | null {
  if (typeof value !== "object" || value === null) return null;
  const user = value as { id?: unknown; email?: unknown; name?: unknown };
  if (typeof user.id !== "string" || user.id.length === 0) return null;
  if (typeof user.email !== "string" || user.email.length === 0) return null;
  const name = user.name === null || user.name === undefined ? null : typeof user.name === "string" ? user.name : null;
  return { id: user.id, email: user.email, name };
}

/**
 * The verified Kinde identity behind this request, or null when there is none.
 *
 * `getToken` is the SDK's own check: it validates the access token, and when it
 * has expired it uses Kinde's refresh cookie and commits the rotated tokens
 * back to the response's cookies. `getUser` validates the ID token and reads the
 * profile from it. Both are the provider's verification, not a decode this
 * module invents — the only local read is the `sub` comparison that makes sure
 * the token the gateway will trust and the profile being linked describe the
 * same person.
 */
export async function readKindeIdentity(event: RequestEvent): Promise<KindeIdentity | null> {
  if (!kindeServerConfigured) return null;
  try {
    const { kindeAuthClient } = await import("@kinde-oss/kinde-auth-sveltekit");
    const manager = event.request as unknown as SessionManager;
    const accessToken = await kindeAuthClient.getToken(manager);
    const profile = (await kindeAuthClient.getUser(manager)) as unknown as KindeProfile;
    const id = typeof profile.id === "string" ? profile.id : "";
    const email = typeof profile.email === "string" ? profile.email.trim() : "";
    if (!id || !email) return null;
    const claims = decodePayload(accessToken);
    if (claims?.sub !== id) return null;
    const name =
      [profile.given_name, profile.family_name]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(" ")
        .trim() || null;
    return {
      accessToken,
      expiresIn: lifetimeSeconds(accessToken),
      user: { id, email, name },
    };
  } catch {
    /* No cookie, an expired Kinde session, a token that failed Kinde's own
       validation, or Kinde unreachable. All of them mean the same thing to the
       caller: there is no session to hand to the page. */
    return null;
  }
}

export type ProvisionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: number; code: "conflict" | "identity_invalid" | "unavailable"; message: string };

/**
 * Create or find the platform row behind a Kinde subject.
 *
 * The gateway verifies the Kinde token and the auth service's /link route uses
 * its subject as the row id, so this call is what makes the account the rest of
 * the app reads. It is idempotent: every session restore may call it, and a
 * replay returns the existing row without changing its email.
 */
export async function provisionKindeProfile(identity: KindeIdentity): Promise<ProvisionResult> {
  const payload = identity.user.name
    ? { email: identity.user.email, name: identity.user.name }
    : { email: identity.user.email };
  const reply = await gatewayPost("/api/auth/link", payload, 8_000, {
    authorization: `Bearer ${identity.accessToken}`,
  });
  const body = reply.body as
    | { user?: unknown; error?: { code?: unknown; message?: unknown } }
    | null;
  if (reply.status < 300) {
    const user = profileUser(body?.user);
    if (user) return { ok: true, user };
    return {
      ok: false,
      status: 502,
      code: "unavailable",
      message: "The platform answered without the account behind this sign-in.",
    };
  }
  const code = typeof body?.error?.code === "string" ? body.error.code : "";
  const message = typeof body?.error?.message === "string" ? body.error.message : "";
  if (reply.status === 409 && code === "conflict") {
    return {
      ok: false,
      status: 409,
      code: "conflict",
      message:
        message ||
        "An account with this email already exists under a different sign-in method. This site will not merge two identities.",
    };
  }
  if (reply.status === 401 || reply.status === 403) {
    return {
      ok: false,
      status: 401,
      code: "identity_invalid",
      message:
        message ||
        "The platform did not accept the Kinde session. The two sign-in settings may not match.",
    };
  }
  return {
    ok: false,
    status: 502,
    code: "unavailable",
    message:
      message || "The platform did not answer, so the account behind this sign-in could not be opened.",
  };
}
