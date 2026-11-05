import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { kindeConfigured } from "$lib/auth-mode";
import {
  isKindeSocialProvider,
  kindeConnectionId,
  kindeServerConfigured,
  kindeSocialLoginUrl,
} from "$lib/server/kinde";

/* The provider buttons, and nothing else.
 *
 * Each button is a link to this route, which asks the Kinde SDK for an
 * authorization URL with `connection_id` set. That is the whole difference
 * from /api/auth/login: the learner lands on Google, GitHub or Discord directly
 * instead of on Kinde's chooser, and still comes back through Kinde's callback
 * with the same session cookies and the same profile link.
 *
 * The route is a GET because it starts a navigation, not because it changes
 * anything: PKCE and state are created here by the SDK and stored in the
 * session hook, and the callback is what exchanges them. An unknown provider,
 * a local build, and a connection that was not configured all answer 404: a
 * URL that cannot start a flow should not pretend it did. A build whose Kinde
 * configuration is incomplete sends the learner to the account page's readable
 * "sign-in is unreachable" state instead of a blank error. */

const notFound = new Response("Not Found", {
  status: 404,
  headers: { "cache-control": "no-store" },
});

export const GET: RequestHandler = async (event) => {
  if (!kindeConfigured) return notFound;
  if (!kindeServerConfigured) throw redirect(303, "/auth?error=unavailable");
  const slug = event.params.provider ?? "";
  if (!isKindeSocialProvider(slug)) return notFound;
  const connectionId = kindeConnectionId(slug);
  if (!connectionId) return notFound;
  const url = await kindeSocialLoginUrl(event, connectionId);
  if (!url) throw redirect(303, "/auth?error=unavailable");
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), "cache-control": "no-store" },
  });
};
