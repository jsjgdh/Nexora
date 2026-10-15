import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  crossSiteRequest,
  failureReply,
  gatewayPost,
  readJsonBody,
  setRefreshCookie,
  tokensFrom,
} from "$lib/server/session-broker";

/* Sign in through the broker.
 *
 * The gateway still verifies the password; what changes is where the answer
 * goes. The 30-day refresh token is put in an HttpOnly cookie on this origin and
 * stripped from the reply, so the page receives a short-lived access token and
 * nothing it could keep (see $lib/server/session-broker.ts for why the cookie
 * lives here rather than on the API).
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
  }
  const reply = await gatewayPost("/api/auth/login", parsed.value);
  const tokens = reply.status < 300 ? tokensFrom(reply.body) : null;
  if (!tokens) {
    const failure = failureReply(reply);
    return json(failure.body, { status: failure.status });
  }
  setRefreshCookie(cookies, url, tokens.refreshToken);
  // accessToken only. Echoing the refresh token here would put the long-lived
  // credential straight back within reach of any script on the page.
  return json({
    user: reply.body?.user ?? null,
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
  });
};
