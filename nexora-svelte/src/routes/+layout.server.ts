import type { LayoutServerLoad } from "./$types";
import { env } from "$env/dynamic/public";
import { releaseState, type ReleaseState } from "$lib/release";

/* The release state, decided on the server.
 *
 * This is a *server* load rather than a universal one for one reason: the
 * release state must not be recomputed in the browser. A universal load runs
 * again during hydration, and if the browser could not see the switch it
 * would hand the reader a different answer than the server did. The hero
 * would change its label under them, and the page would be offering a build
 * it had just withdrawn.
 *
 * The server decides once, the answer travels with the page, and every surface
 * reads that one answer. */
export const load: LayoutServerLoad<{ release: ReleaseState }> = async () => ({
  release: releaseState(env.PUBLIC_IDE_DOWNLOAD_URL),
});
