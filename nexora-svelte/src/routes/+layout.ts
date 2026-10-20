import type { LayoutLoad } from "./$types";
import { env } from "$env/dynamic/public";
import { resolveOrigin } from "$lib/seo";

// Pages render at runtime (adapter-node). Prerendering would bake
// PUBLIC_API_URL — and any future runtime config — at build time, which
// breaks the same image moving between dev, preview, and production.
//
// The canonical origin is the deliberate exception: it is read here, on every
// request, so runtime pages advertise the origin they are actually served
// from. The routes that ARE prerendered (the mission pages, /sitemap.xml and
// /robots.txt) bake the build's value — which is why .env.example says to set
// PUBLIC_SITE_URL wherever the build runs as well as wherever the server runs.
export const prerender = false;

/* The release state comes from the server and travels down with the page.
 *
 * `+layout.server.ts` reads the switch on the server. This load carries that
 * answer into the universal data, so the layout, the pages and every
 * component read one value and the browser never recomputes it. A universal
 * load runs again on a client-side navigation, but its `data` is always the
 * server's answer to that navigation, so the label a reader sees never
 * changes under them.
 *
 * The answer arrives as the load event's own `data`, not as `parent()`:
 * `parent()` is the parent *layout's* server data, and this layout is the
 * root, so it has none.
 *
 * The origin is read here rather than in the server load because it is a
 * public value that may legitimately differ between a build and a run, and
 * because the pages that bake it are the prerendered ones. */
export const load: LayoutLoad = async ({ data }) => {
  return {
    origin: resolveOrigin(env.PUBLIC_SITE_URL),
    release: data.release,
  };
};
