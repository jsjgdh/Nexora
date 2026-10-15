import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  clearRefreshCookie,
  crossSiteRequest,
  failureReply,
  gatewayPost,
  readRefreshToken,
  setRefreshCookie,
  tokensFrom,
} from "$lib/server/session-broker";

/* Turn the cookie into a fresh access token.
 *
 * This is the credential the browser uses and the one it cannot read: the
 * request carries nothing but the cookie, and the reply carries only a
 * short-lived access token. Rotation happens on every call (the service
 * replaces the row and the cookie), so a stolen-and-replayed token is detected
 * on the server and revokes the family.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const token = readRefreshToken(cookies);
  if (!token) {
    // No cookie means this browser has no session to continue — a plain fact,
    // not an error worth a 500.
    return json({ error: { code: "no_session", message: "No session to refresh." } }, { status: 401 });
  }
  const reply = await gatewayPost("/api/auth/refresh", { refreshToken: token });
  const tokens = reply.status < 300 ? tokensFrom(reply.body) : null;
  if (!tokens) {
    // Only an authoritative rejection ends the session. A 502 means we could not
    // ask — the platform is down, or the connection dropped — and signing a
    // learner out over our own outage is the failure refreshUser deliberately
    // refuses to make. The cookie stays so the next attempt can succeed.
    if (reply.status === 401) clearRefreshCookie(cookies, url);
    const failure = failureReply(reply);
    return json(failure.body, { status: failure.status });
  }
  setRefreshCookie(cookies, url, tokens.refreshToken);
  return json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
};
