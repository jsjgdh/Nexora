import { env } from "$env/dynamic/public";
import { resolveOrigin, robotsTxt } from "$lib/seo";

/* Prerendered for the same reason as the sitemap, and reading the origin the
   same way — see `sitemap.xml/+server.ts` for why this is `dynamic/public`. */
export const prerender = true;

export function GET() {
  const origin = resolveOrigin(env.PUBLIC_SITE_URL);
  return new Response(robotsTxt(origin), {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
