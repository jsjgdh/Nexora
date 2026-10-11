import { env } from "$env/dynamic/public";
import { resolveOrigin, sitemapXml } from "$lib/seo";

/* The sitemap is a build artefact: it is the same document on every request for
   a given deployment, so it is prerendered.
   `$env/dynamic/public` rather than `$env/static/public` deliberately: a static
   import of an unset variable fails the build, and local mode — the product's
   default — configures no origin at all. Unset therefore means the fallback,
   never a failed build. */
export const prerender = true;

export function GET() {
  const origin = resolveOrigin(env.PUBLIC_SITE_URL);
  return new Response(sitemapXml(origin), {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
