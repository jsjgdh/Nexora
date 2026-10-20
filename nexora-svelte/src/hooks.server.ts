import type { Handle, HandleServerError } from "@sveltejs/kit";

/* Baseline security headers for the HTML origin.
 *
 * The gateway's helmet covers the JSON API; this app is the surface that serves
 * HTML, and it set nothing. That matters because this origin still holds the
 * learner's progress in localStorage, and an injection here would act as the
 * signed-in learner for as long as the page is open (the access token is
 * memory-only now — see $lib/session.svelte.ts — and its refresh credential is
 * an HttpOnly cookie, but neither helps once a script is running in the page);
 * reading or rewriting saved progress is what a CSP exists to stop.
 *
 * The CSP ships report-only, deliberately: it was written while the app still
 * carried a browser classroom, and promoting it to enforcing is a verification
 * pass of its own (every route's workers and embeds, measured — not this
 * comment). The other headers below are safe to enforce, so they are enforced.
 *
 * Clerk is same-origin (its script is bundled, not fetched from a CDN) and its
 * API calls are covered by connect-src https:.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const handle: Handle = async ({ event, resolve }) => {
  event.setHeaders({
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });
  // HSTS only where it can be true: a loopback http dev server must never pin
  // the browser to https and take the developer's app away.
  if (event.url.protocol === "https:") {
    event.setHeaders({ "strict-transport-security": "max-age=15552000; includeSubDomains" });
  }
  const response = await resolve(event);
  // Set on the final response so it lands on every reply, including errors.
  response.headers.set("content-security-policy-report-only", CSP);
  return response;
};

/* Error reporting, the web app's half (TODO 5.2).
 *
 * SvelteKit routes every unexpected server error through this hook, and
 * providing it replaces the default handler — the one that logs in its own
 * shape. Every service in this platform reports failures as one structured
 * JSON line with a service name on stderr, and a surface that answers
 * differently is a surface that cannot be grepped with the rest; so the
 * report happens here, in the same shape, and `docker logs` reads the web
 * app exactly like it reads the mesh.
 *
 * What the browser gets back is deliberately the generic message. The
 * detail lives in this log, not in a response — the same posture as the
 * API's own 500 envelopes ("Something went wrong."), so no surface of this
 * product tells a stranger what broke inside. In development SvelteKit
 * shows the original error in the overlay regardless; this only decides
 * what is logged and what a production error page says. */
export const handleError: HandleServerError = ({ event, error }) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  console.error(
    JSON.stringify({
      level: 50,
      service: "web",
      url: event.url.pathname + event.url.search,
      message,
      stack: stack.slice(0, 2000),
      at: new Date().toISOString(),
    })
  );
  return { message: "Internal error" };
};
