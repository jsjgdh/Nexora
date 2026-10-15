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

/* Create an account through the broker — same shape as sign-in, and for the same
 * reason: the service's refresh token belongs in an HttpOnly cookie on this
 * origin, not in the reply the page receives. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
  }
  const reply = await gatewayPost("/api/auth/register", parsed.value);
  const tokens = reply.status < 300 ? tokensFrom(reply.body) : null;
  if (!tokens) {
    const failure = failureReply(reply);
    return json(failure.body, { status: failure.status });
  }
  setRefreshCookie(cookies, url, tokens.refreshToken);
  return json(
    {
      user: reply.body?.user ?? null,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
    // The account was created: 201, as the service itself answers.
    { status: 201 }
  );
};
