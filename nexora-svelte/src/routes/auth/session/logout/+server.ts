import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearRefreshCookie, crossSiteRequest, gatewayPost, readRefreshToken } from "$lib/server/session-broker";

/* End the session: revoke both credentials server-side, then forget the cookie.
 *
 * The order matters. Revoking first means a learner who signs out on a shared
 * machine cannot be resumed by a later reload; then the cookie is cleared so the
 * browser stops presenting a token that is already dead. If the gateway is
 * unreachable the cookie is still cleared — the learner asked to sign out, and
 * their browser must stop holding a usable credential whatever the platform's
 * state. The row it left behind expires on its own, and it is a hash at rest, not
 * a credential anyone can replay from a database read.
 *
 * Two credentials travel, because ending the session is not the same as ending
 * the token. The refresh token sits in the cookie and only this server can
 * present it; the access token is the one the *page* was holding, so the page
 * sends it here in an Authorization header (same origin, and it never touches
 * storage) and this route passes it on. That is what lets the auth service record
 * the token's `jti` as revoked, which is what makes sign-out immediate rather
 * than a wait for the TTL to run out. Without it, a copy of that token taken
 * before sign-out — by a script on the page, a log, a shared machine — would keep
 * working.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const token = readRefreshToken(cookies);
  const presented = /^Bearer (.+)$/.exec(request.headers.get("authorization")?.trim() ?? "")?.[1] ?? null;
  if (token || presented) {
    await gatewayPost("/api/auth/logout", {
      ...(token ? { refreshToken: token } : {}),
      ...(presented ? { accessToken: presented } : {}),
    });
  }
  clearRefreshCookie(cookies, url);
  // Always 200, like the service behind it: a caller learns nothing about
  // whether a token existed, and signing out twice is not an error.
  return json({ ok: true });
};
