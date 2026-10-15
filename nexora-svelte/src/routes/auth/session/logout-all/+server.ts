import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearRefreshCookie, crossSiteRequest, gatewayPost } from "$lib/server/session-broker";

/* End every session this account has, on every device.
 *
 * The access token is required and travels as the Authorization header of this
 * same-origin call, because it is what names the account: the platform verifies it
 * and revokes everything issued to that subject. Nothing else is used to identify
 * the learner — a body-supplied id would let anyone end anyone's sessions.
 *
 * The refresh token is deliberately NOT sent: "everywhere" already revokes every
 * family this account owns, so forwarding the one in the cookie would carry a
 * long-lived credential for nothing.
 *
 * Unlike sign-out, failure is reported rather than swallowed: this is a security
 * action across devices the learner cannot see, so "we could not reach the
 * platform, your other devices may still be signed in" is the honest answer, and
 * the page shows it. The cookie is cleared only when the platform confirmed —
 * leaving it in place is what lets the learner try again.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const presented = /^Bearer (.+)$/.exec(request.headers.get("authorization")?.trim() ?? "")?.[1] ?? null;
  if (!presented) {
    return json(
      { error: { code: "unauthorized", message: "Sign in first — this ends sessions on every device." } },
      { status: 401 }
    );
  }
  const reply = await gatewayPost("/api/auth/logout-all", { accessToken: presented });
  if (reply.status >= 200 && reply.status < 300) {
    clearRefreshCookie(cookies, url);
    const sessions = (reply.body as { sessions?: unknown } | null)?.sessions;
    return json({ ok: true, sessions: typeof sessions === "number" ? sessions : 0 });
  }
  // Not a success: the cookie stays, so a retry still has a session to name.
  const body = reply.body ?? {
    error: { code: "auth_unavailable", message: "The sign-in service did not answer. Try again." },
  };
  return json(body, { status: reply.status >= 400 && reply.status <= 599 ? reply.status : 502 });
};
