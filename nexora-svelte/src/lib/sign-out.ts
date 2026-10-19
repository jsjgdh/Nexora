import { clerkConfigured, signOutEverywhere as signOutOfClerk } from "./clerk";
import { session } from "./session.svelte";

/* Re-exported so that a component can ask which identity is in charge
   without importing the provider module itself. */
export { clerkConfigured };

/* Ending the session on this device, in one place.
 *
 * There are two identities this product can hold: one the platform issued,
 * and one Clerk issued. Signing out has to end the right one, and the
 * answer depends on which is in charge.
 *
 * This module exists so that the sign-out control can live in a component
 * without that component knowing about Clerk. The rule the suite keeps is
 * that Clerk is mounted by exactly one page, and a component that imported
 * the provider directly would be a second place that knows about it. */
export async function signOutThisDevice(): Promise<void> {
  if (clerkConfigured) {
    await signOutOfClerk();
    return;
  }
  await session.logout();
}
