import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { crossSiteRequest, gatewayPost, readJsonBody } from "$lib/server/session-broker";

/* Confirm an email address with the code or the token from the link.
 *
 * The platform answers 200 with the user it verified, or 400 with its error
 * envelope. Both are passed through as they are, so the page can say plainly
 * that the address is verified, and can say plainly that a code was not
 * accepted.
 *
 * The token is a one-time credential. It travels in the body, it is used
 * once, and it is never written to storage or printed in a log line. */
export const POST: RequestHandler = async ({ request, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
  }
  const body = parsed.value as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length === 0) {
    return json(
      { error: { code: "bad_request", message: "That code is missing." } },
      { status: 400 }
    );
  }
  const reply = await gatewayPost("/api/auth/verify-email/confirm", { token });
  if (reply.status >= 200 && reply.status < 300) {
    const verified = (reply.body as { user?: unknown; verified?: unknown } | null)?.user ?? null;
    return json(
      {
        ok: true,
        verified: true,
        user: verified,
      },
      { status: 200 }
    );
  }
  const failure = reply.body ?? {
    error: { code: "auth_unavailable", message: "The sign-in service did not answer." },
  };
  return json(failure, { status: reply.status >= 400 && reply.status <= 599 ? reply.status : 502 });
};
