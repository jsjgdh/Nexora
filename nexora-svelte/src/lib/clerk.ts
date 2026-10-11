import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { session } from "./session.svelte";

/* Clerk identity for the learner app (AUTH_MODE=clerk deployments).
 *
 * The boundary the rest of the app relies on is unchanged: everything reads
 * session.token, and only this module ever talks to Clerk. clerk-js is
 * loaded lazily (never during SSR/prerender), the session token is adopted
 * into session.token on every Clerk change, and a live provider keeps it
 * fresh across Clerk's rotation — a cached copy would go stale mid-lesson.
 *
 * First-sight provisioning: a Clerk subject has no local profile row until
 * POST /api/auth/link creates it (idempotent; email conflicts 409 rather
 * than merging identities). Until the row exists /api/auth/me 404s, which
 * refreshUser tolerates by design — so this module links, then re-resolves.
 */

const PUBLISHABLE_KEY = ((env.PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined) ?? "").trim();

/** True when this build should offer Clerk sign-in (key present and shaped). */
export const clerkConfigured = PUBLISHABLE_KEY.startsWith("pk_");

type ClerkInstance = import("@clerk/clerk-js").Clerk;

let clerk: ClerkInstance | null = null;
let loading: Promise<ClerkInstance | null> | null = null;
/** Clerk user ids already linked this session — the endpoint is idempotent,
    but there is no reason to call it twice. */
const linkedFor = new Set<string>();

/** Clerk's components in the Code Review grammar: brass primary, squared
    corners, night-desk surfaces. Cosmetic only — never a trust decision. */
const appearance = {
  variables: {
    colorPrimary: "#c9a227",
    colorBackground: "#151e1a",
    colorInputBackground: "#1c2723",
    colorText: "#eef2ed",
    colorTextSecondary: "#a9b7b0",
    borderRadius: "0px",
  },
} as const;

async function ensureClerk(): Promise<ClerkInstance | null> {
  if (!browser || !clerkConfigured) return null;
  if (clerk) return clerk;
  loading ??= (async () => {
    try {
      const { Clerk } = await import("@clerk/clerk-js");
      const instance = new Clerk(PUBLISHABLE_KEY);
      await instance.load();
      instance.addListener(({ session: s }) => {
        void absorbSession(instance, s?.user?.id ?? null);
      });
      clerk = instance;
      return instance;
    } catch {
      return null;
    }
  })();
  return loading;
}

async function liveToken(instance: ClerkInstance): Promise<string | null> {
  try {
    return (await instance.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Adopt Clerk's current session: store the token, install the freshness
 * provider, provision the local profile row on first sight, and report what
 * happened so the page can say it plainly. Never throws.
 */
export async function absorbSession(
  instance: ClerkInstance,
  clerkUserId: string | null
): Promise<"linked" | "conflict" | "unavailable" | "signed-out"> {
  const token = clerkUserId ? await liveToken(instance) : null;
  if (!clerkUserId || !token) {
    session.useExternalToken(null);
    return "signed-out";
  }
  // Adopt only on change: re-saving the same token would clear the already
  // resolved user and flicker every surface that reads it (the listener
  // refires on rotation). A changed token always brings a null user with it.
  if (token !== session.token) session.useExternalToken(token);
  // useExternalToken drops any provider by design (it cannot know the mode),
  // so reinstall the live one right after adopting a Clerk token.
  session.setTokenProvider(() => liveToken(instance));
  await session.refreshUser();
  if (session.user) return "linked";
  const primary = instance.user?.primaryEmailAddress?.emailAddress ?? null;
  const name =
    instance.user?.fullName ?? [instance.user?.firstName, instance.user?.lastName].filter(Boolean).join(" ") ?? undefined;
  if (!primary) return "unavailable";
  if (!linkedFor.has(clerkUserId)) {
    linkedFor.add(clerkUserId);
    try {
      await session.linkClerkProfile(primary, name || undefined);
    } catch (err) {
      if ((err as { code?: string }).code === "conflict") return "conflict";
      return "unavailable";
    }
    await session.refreshUser();
  }
  return session.user ? "linked" : "unavailable";
}

/** Resolve the current Clerk state once (page mount, return visits). */
export async function clerkStatus(): Promise<"linked" | "conflict" | "unavailable" | "signed-out" | "unconfigured"> {
  const instance = await ensureClerk();
  if (!instance) return "unconfigured";
  return absorbSession(instance, instance.session?.user?.id ?? null);
}

/** Render Clerk's sign-in / sign-up into our own container. Returns cleanup. */
export async function mountClerkAuth(kind: "sign-in" | "sign-up", node: HTMLDivElement): Promise<() => void> {
  const instance = await ensureClerk();
  if (!instance || !browser) return () => {};
  if (kind === "sign-in") {
    instance.mountSignIn(node, { appearance });
    return () => instance.unmountSignIn(node);
  }
  instance.mountSignUp(node, { appearance });
  return () => instance.unmountSignUp(node);
}

/** Sign out everywhere the app reads auth state: Clerk first, then local. */
export async function signOutEverywhere(): Promise<void> {
  try {
    await clerk?.signOut();
  } catch {
    /* a failed remote sign-out must not keep a local session alive */
  } finally {
    linkedFor.clear();
    session.useExternalToken(null);
    session.logout();
  }
}
