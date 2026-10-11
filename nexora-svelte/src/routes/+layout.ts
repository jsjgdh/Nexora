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

export function load() {
  return { origin: resolveOrigin(env.PUBLIC_SITE_URL) };
}
