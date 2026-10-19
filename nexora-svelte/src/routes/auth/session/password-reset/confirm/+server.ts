import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { crossSiteRequest, gatewayPost, readJsonBody } from "$lib/server/session-broker";

/* Set a new password with the token from the link.
 *
 * This half can fail, and it has to: the token is one-time, it expires, and
 * a learner who already used it cannot use it again. So the platform's error
 * envelope is passed through as it is and the page reads the code, rather
 * than being flattened into one message.
 *
 * The password rule is checked here as well as in the browser, and it is the
 * same rule the sign-up form uses: ten characters at least. The browser
 * check is for the learner, and this one is because the platform is not the
 * only thing that should refuse a one-character password.
 *
 * The token travels in the body and nowhere else. It is never written to
 * storage, never put in a log line, and never echoed back in the reply. */
export const POST: RequestHandler = async ({ request, url }) => {
  if (crossSiteRequest(request, url)) {
    return json({ error: { code: "forbidden", message: "Forbidden." } }, { status: 403 });
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
  }
  const body = parsed.value as { token?: unknown; newPassword?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (token.length === 0) {
    return json(
      { error: { code: "bad_request", message: "That link is missing its code." } },
      { status: 400 }
    );
  }
  if (newPassword.length < 10) {
    return json(
      { error: { code: "bad_request", message: "Use 10 characters or more." } },
      { status: 400 }
    );
  }
  const reply = await gatewayPost("/api/auth/password-reset/confirm", { token, newPassword });
  if (reply.status >= 200 && reply.status < 300) {
    return json({ ok: true }, { status: 200 });
  }
  const failure = reply.body ?? {
    error: { code: "auth_unavailable", message: "The sign-in service did not answer." },
  };
  return json(failure, { status: reply.status >= 400 && reply.status <= 599 ? reply.status : 502 });
};
