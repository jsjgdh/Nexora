import { page } from "$app/state";
import { releaseState, type ReleaseState } from "./release";

/* The release state, for a component that is not a page.
 *
 * The layout's server load decides the state and puts it in the page data, so
 * the answer a component reads here is the same answer the page was served
 * with. The fallback exists for the one case where there is no page data at
 * all, and it is the honest one: no switch, no build, so the state says the
 * build is not published.
 *
 * This is the only place in the site that reads the release state from
 * anywhere other than the server's answer, and it reads the same answer. */
export function currentRelease(): ReleaseState {
  const data = page.data as { release?: ReleaseState } | undefined;
  return data?.release ?? releaseState(null);
}
