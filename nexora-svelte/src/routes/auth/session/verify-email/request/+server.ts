import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { crossSiteRequest, gatewayPost, readJsonBody } from "$lib/server/session-broker";

/* Ask the platform to send a verification email.
 *
 * Same contract as the password reset request, and the same reason for it:
 * the platform answers 202 and never says whether the address has an
 * account, and this endpoint keeps that promise on its own side of the wire
 * by answering one thing for every address.
 *
 * A learner who asks for a second email is not told whether the first one
 * arrived, because that would be the same oracle with a different question. */
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
  const reply = await gatewayPost("/api/auth/verify-email/request", { email });
  if (reply.status >= 200 && reply.status < 300) {
    return json({ ok: true }, { status: 202 });
  }
  const failure = reply.body ?? {
    error: { code: "auth_unavailable", message: "The sign-in service did not answer." },
  };
  return json(failure, { status: reply.status >= 400 && reply.status <= 599 ? reply.status : 502 });
};
