import { kindeConfigured } from "./auth-mode";
import { session } from "./session.svelte";

/* Re-exported so that a component can ask which identity is in charge
   without importing the provider module itself. */
export { kindeConfigured };

/* Ending the session on this device, in one place.
 *
 * There are two identities this product can hold: one the platform issued,
 * and one Kinde issued. Signing out has to end the right one, and the answer
 * depends on which is in charge.
 *
 * This module exists so that the sign-out control can live in a component
 * without that component knowing about Kinde. The rule the suite keeps is that
 * Kinde is mounted in the server hooks and its routes, and a component that
 * imported the provider directly would be a second place that knows about it.
 *
 * In Kinde mode the local state is cleared first, then the browser leaves for
 * Kinde's own logout route. That route clears the cookies and ends the SSO
 * session, and Kinde sends the learner back to KINDE_POST_LOGOUT_REDIRECT_URL.
 * A page that keeps acting signed in while that redirect is in flight would be
 * showing the wrong thing, so nothing waits for it. */
export async function signOutThisDevice(): Promise<void> {
  if (kindeConfigured) {
    await session.logout();
    if (typeof window !== "undefined") window.location.assign("/api/auth/logout");
    return;
  }
  await session.logout();
}
