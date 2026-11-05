import type { PageServerLoad } from "./$types";
import { kindeConfigured } from "$lib/auth-mode";
import { enabledKindeSocialProviders } from "$lib/server/kinde";

/* Which provider buttons the account page draws.
 *
 * The answer is configuration, not content: a connection gets a button only
 * when its Kinde connection id is present and the server can start a flow.
 * Returning labels rather than ids keeps the ids on the server, and returning
 * an empty list in a local build keeps the page from advertising a door that
 * does not exist. */
export const load: PageServerLoad = () => ({
  socialProviders: kindeConfigured ? enabledKindeSocialProviders() : [],
});
