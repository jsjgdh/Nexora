import type { RequestHandler } from "./$types";
import { kindeConfigured } from "$lib/auth-mode";
import { crossSiteRequest } from "$lib/server/session-broker";

/* Clear this browser's Kinde cookie session without leaving the page.
 *
 * The normal sign-out navigates to /api/auth/logout so Kinde's own SSO session
 * ends too. Account deletion cannot do that: the receipt is on the page and a
 * redirect would throw it away. This endpoint is the smaller half — it removes
 * the kinde_* cookies this origin holds, so a reload cannot quietly restore the
 * session that was just erased, and leaves the receipt where it is. */
export const POST: RequestHandler = async (event) => {
  if (crossSiteRequest(event.request, event.url)) {
    return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  }
  if (!kindeConfigured) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const manager = event.request as unknown as { destroySession?: () => Promise<void> };
  try {
    await manager.destroySession?.();
  } catch {
    /* No session to destroy, or the cookie layer refused. The page is already
       signed out locally; the redirect path is the one that must be loud. */
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
};
