import type { RequestHandler } from "./$types";
import { kindeConfigured } from "$lib/auth-mode";
import {
  kindeServerConfigured,
  provisionKindeProfile,
  readKindeIdentity,
} from "$lib/server/kinde";

/* Where Kinde sends the learner after it has authenticated them.
 *
 * The callback itself is another route (/api/auth/kinde_callback), owned by the
 * SDK. This one runs after it, with Kinde's cookies in place, and does the two
 * things the rest of the app needs before it can call the learner signed in:
 * read the verified identity, and create or find the platform row it names.
 *
 * A conflict leaves for /auth with a reason instead of dropping the learner on
 * a page that looks signed out. A success leaves for the account home. Either
 * way this route never renders: it answers with a redirect, so a refresh cannot
 * replay a half-finished handoff. */

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "no-store" },
  });
}

export const GET: RequestHandler = async (event) => {
  if (!kindeConfigured) return seeOther("/auth");
  if (!kindeServerConfigured) return seeOther("/auth?error=unavailable");
  const identity = await readKindeIdentity(event);
  if (!identity) return seeOther("/auth?error=session");
  const linked = await provisionKindeProfile(identity);
  if (!linked.ok) {
    if (linked.code === "conflict") return seeOther("/auth?error=conflict");
    if (linked.code === "identity_invalid") return seeOther("/auth?error=identity");
    return seeOther("/auth?error=unavailable");
  }
  return seeOther("/account");
};
