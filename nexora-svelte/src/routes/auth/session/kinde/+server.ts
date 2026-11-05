import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { kindeConfigured } from "$lib/auth-mode";
import { crossSiteRequest } from "$lib/server/session-broker";
import {
  kindeServerConfigured,
  provisionKindeProfile,
  readKindeIdentity,
} from "$lib/server/kinde";

/* The Kinde session, exchanged for the token the rest of the app holds.
 *
 * Kinde's cookies are HttpOnly, so the page cannot read its own session. This
 * endpoint is the same-origin broker: the request carries Kinde's cookie, the
 * server asks the SDK for the current access token (Kinde rotates it through
 * its own refresh cookie), links the subject to the platform profile, and
 * answers with the short-lived token and the user the platform knows. The page
 * keeps only that token, in memory, exactly as it does for the local mode.
 *
 * It is POST and same-origin-checked because it mints a credential. A GET that
 * returns an access token would be reachable from an image tag or a link, and
 * a cross-site POST must not be able to make the browser hand one back. */

const noStore = { "cache-control": "no-store" };

export const POST: RequestHandler = async (event) => {
  if (crossSiteRequest(event.request, event.url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403, headers: noStore });
  }
  if (!kindeConfigured) {
    return json(
      { error: { code: "not_configured", message: "Kinde sign-in is not offered in this build." } },
      { status: 404, headers: noStore }
    );
  }
  if (!kindeServerConfigured) {
    return json(
      { error: { code: "not_configured", message: "Kinde sign-in is not configured in this build." } },
      { status: 503, headers: noStore }
    );
  }
  const identity = await readKindeIdentity(event);
  if (!identity) {
    return json(
      { error: { code: "no_session", message: "No Kinde session to continue." } },
      { status: 401, headers: noStore }
    );
  }
  const linked = await provisionKindeProfile(identity);
  if (!linked.ok) {
    return json(
      { error: { code: linked.code, message: linked.message } },
      { status: linked.status === 409 ? 409 : 502, headers: noStore }
    );
  }
  return json(
    {
      accessToken: identity.accessToken,
      expiresIn: identity.expiresIn,
      user: linked.user,
    },
    { headers: noStore }
  );
};
