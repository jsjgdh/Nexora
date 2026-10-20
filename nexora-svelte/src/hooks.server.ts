import type { Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";

/* Baseline security headers for the HTML origin.
 *
 * The gateway's helmet covers the JSON API; this app is the surface that serves
 * HTML, and it set nothing. That matters because this origin holds the
 * learner's session: the access token is memory-only (see
 * $lib/session.svelte.ts) and the refresh credential is an HttpOnly cookie,
 * but neither helps once a script is running in the page, and a script that
 * can run in the page can drive the operator's console with the learner's
 * token. Reading or rewriting a session is what a CSP exists to stop.
 *
 * The policy itself now lives in `svelte.config.js`, where SvelteKit builds
 * it: a hash on a prerendered page, a nonce on a page rendered at request
 * time, and no 'unsafe-inline' in script-src in production. It used to be
 * report-only, which meant the browser collected violations nobody read. The
 * other headers below are safe to enforce, so they are enforced.
 *
 * Clerk is same-origin (its script is bundled, not fetched from a CDN) and its
 * API calls are covered by connect-src https:. */

/**
 * The platform's origin, as the browser sees it.
 *
 * The browser talks to the platform directly for the plan, the ledger, the
 * export and the rights calls, and the platform is not this origin: it is the
 * gateway, at PUBLIC_API_URL. In every deployment that address is plain http
 * (the compose stack and the local stack both point the browser at
 * http://127.0.0.1:8080), so a policy that allowed only 'self' and https:
 * would have cut the site off from its own backend the moment it stopped being
 * report-only.
 *
 * So the policy names the one origin it has to reach, by name, rather than
 * opening connect-src to every http origin on the internet. It is resolved
 * here, at runtime, because the address is a runtime setting (the same
 * container image serves the compose stack and a public deployment) and the
 * header is written per request.
 */
function platformOrigin(): string | null {
  const raw = (env.PUBLIC_API_URL ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

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
  /* The one change made to the header SvelteKit built: the platform's origin
   * joins connect-src, so the policy names exactly what the browser is allowed
   * to reach and nothing more. Everything else in it is SvelteKit's own
   * answer, including the nonce, which is why this rewrites the header rather
   * than writing a second one. */
  const origin = platformOrigin();
  const csp = response.headers.get("content-security-policy");
  if (origin && csp && /connect-src [^;]*/.test(csp)) {
    const rewritten = csp.replace(/connect-src ([^;]*)/, `connect-src $1 ${origin}`);
    response.headers.set("content-security-policy", rewritten);
  }
  return response;
};


/* The error reporting hook, in a module of its own so a plain
   script can exercise it. See src/lib/server/error-report.ts. */
export { handleError } from "$lib/server/error-report";
