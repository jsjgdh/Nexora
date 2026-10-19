import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { crossSiteRequest, gatewayPost, readJsonBody } from "$lib/server/session-broker";

/* Ask the platform for a password reset link.
 *
 * The platform's contract for this route is that it answers 202 whatever it
 * finds, and that it never says whether the address has an account. This
 * endpoint keeps that promise on its own side of the wire too: a 2xx from the
 * platform becomes a 202 with `{ ok: true }` and nothing else, whatever the
 * body said. If the platform's body were passed through, a later release
 * that answered "no such account" would turn this page into an oracle of
 * which addresses are registered, and nobody would have changed the page.
 *
 * The two failures that are not the platform's answer are passed through as
 * themselves, because the page has to be honest about them: an unreachable
 * platform is an outage, and a build with no platform behind it has sent
 * nothing at all.
 *
 * No token is involved on this half, and none is issued. */
export const POST: RequestHandler = async ({ request, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
  }
  const body = parsed.value as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length === 0) {
    return json(
      { error: { code: "bad_request", message: "Give the email address on the account." } },
      { status: 400 }
    );
  }
  const reply = await gatewayPost("/api/auth/password-reset/request", { email });
  if (reply.status >= 200 && reply.status < 300) {
    // The one answer this route gives for any address at all.
    return json({ ok: true }, { status: 202 });
  }
  const failure = reply.body ?? {
    error: { code: "auth_unavailable", message: "The sign-in service did not answer." },
  };
  return json(failure, { status: reply.status >= 400 && reply.status <= 599 ? reply.status : 502 });
};
