import { env } from "$env/dynamic/public";

/* Which identity provider this build offers.
 *
 * One public switch, because the browser has to know before it draws the page:
 * with Kinde, there is no local form to show, and the session is a cookie the
 * page cannot read. Keeping the answer in one module means the session store,
 * the sign-out control and the auth page cannot disagree about which door is
 * in front of them.
 *
 * `local` is the default, and it is a real mode rather than a leftover: it is
 * how the product runs with no platform and how the email/password service is
 * exercised. A deployment that sets this to `kinde` must also set the server's
 * KINDE_* variables (see .env.example); the pages say so plainly when it does
 * not. */
const provider = ((env.PUBLIC_AUTH_PROVIDER as string | undefined) ?? "").trim().toLowerCase();

export const authProvider = provider === "kinde" ? "kinde" : "local";
export const kindeConfigured = authProvider === "kinde";
