import type { RequestHandler } from "./$types";
import { kindeConfigured } from "$lib/auth-mode";
import { kindeServerConfigured } from "$lib/server/kinde";

/* Kinde's own routes: /api/auth/login, /register, /logout and the callback.
 *
 * The SDK owns the OAuth exchange and the HttpOnly cookie session, so this
 * file is only the boundary: it refuses to run in a build that does not offer
 * Kinde, and refuses with a clear sentence when the public switch says `kinde`
 * but the server's half of the configuration is missing. The import is lazy so
 * a local-mode deployment never loads the SDK or its configuration. */
const unavailable = () =>
  new Response(
    JSON.stringify({
      error: { code: "not_configured", message: "Kinde sign-in is not configured in this build." },
    }),
    {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }
  );

const handle: RequestHandler = async (event) => {
  if (!kindeConfigured) {
    return new Response(
      JSON.stringify({
        error: { code: "not_found", message: "This build does not offer Kinde sign-in." },
      }),
      {
        status: 404,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  }
  if (!kindeServerConfigured) return unavailable();
  const { handleAuth } = await import("@kinde-oss/kinde-auth-sveltekit");
  return handleAuth(event);
};

export const GET = handle;
export const POST = handle;
