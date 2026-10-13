import { layerForStage, stageById } from "./curriculum";
import { ALL_MISSIONS } from "./missions";
import type { Mission } from "./types";

/* SEO basics (TODO 8.4). These are pure functions rather than templates baked
   into a route so the paths and the documents they produce are asserted in the
   suite, not eyeballed in a browser. The app is local-first and ships with no
   origin configured, so every document takes its origin as an argument and the
   routes fall back to SITE_URL_FALLBACK: an unset variable must never throw.

   The same three rules hold for the metadata as for the crawler files: nothing
   is invented (a mission's description is built only from its own authored
   words plus the curriculum's own names), nothing is duplicated by hand (one
   builder serves every route), and nothing claims a URL the build did not
   actually emit. */

/** Where generated URLs point when PUBLIC_SITE_URL is not configured. */
export const SITE_URL_FALLBACK = "http://localhost:5173";

/** The product's name, as it appears in a title tag and on a social card. */
export const SITE_NAME = "NEXORA";

/** The shell's title, and the title any page without its own falls back to. */
export const SITE_TITLE = "NEXORA — Download the IDE. Base course included.";

/** The shell's description: the promise with its framing clause. */
export const SITE_DESCRIPTION =
  "NEXORA teaches programming inside a desktop IDE: download it with the base course bundled, sign in through the browser, and unlock courses per your tier.";

/** The same promise without the frame — what a social card has room for. */
export const SITE_TAGLINE =
  "Learn programming inside a desktop IDE — with every step decided by evidence, not by time served.";

/** Crawlers truncate around here; a description longer than this is wasted. */
export const META_DESCRIPTION_LIMIT = 160;

/**
 * The origin generated URLs are built from. Absent, empty and whitespace-only
 * all mean "not configured" and resolve to the local fallback rather than to a
 * broken URL or a thrown error.
 */
export function resolveOrigin(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return (trimmed || SITE_URL_FALLBACK).replace(/\/+$/, "");
}

/** Absolutise a path against an origin, tolerating a trailing slash. */
export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/** The public, account-free pages. `/profile` is deliberately absent: it is a
    signed-in view, and a crawler has nothing to index behind it. */
const PUBLIC_PATHS = [
  "/",
  "/roadmap",
  "/skills",
  "/projects",
  "/practice",
  "/pricing",
  "/visualizations",
  "/onboarding",
  "/diagnostic",
  "/auth",
  "/auth/ide",
  "/verify",
  "/download",
];

/** Every indexable path: the public pages, then one URL per mission. */
export function sitemapPaths(): string[] {
  return [...PUBLIC_PATHS, ...ALL_MISSIONS.map((m) => `/mission/${m.id}`)];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The sitemap document. Deterministic — no timestamps — so it can be asserted
    byte-for-byte rather than only "parses as XML". */
export function sitemapXml(origin: string): string {
  const urls = sitemapPaths()
    .map((p) => `  <url><loc>${escapeXml(absoluteUrl(origin, p))}</loc></url>`)
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n` +
    "</urlset>\n"
  );
}

/** The robots file: crawl everything public, and name the sitemap. */
export function robotsTxt(origin: string): string {
  const base = resolveOrigin(origin);
  return ["User-agent: *", "Allow: /", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}

/* ---------- Page metadata ---------- */

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  og: {
    title: string;
    description: string;
    url: string;
    type: "website" | "article";
    siteName: string;
  };
}

/**
 * A description that fits. Search results and social cards cut a description
 * off mid-word past ~160 characters, so long text is trimmed at a word
 * boundary and marked with an ellipsis — visibly, rather than pretending the
 * sentence ended there. Whitespace is collapsed first, so a description
 * authored across lines does not carry its newlines into an attribute.
 */
export function clampDescription(text: string, limit = META_DESCRIPTION_LIMIT): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" "));
  return `${(atWord.length > cut.length * 0.6 ? atWord : cut).trimEnd()}…`;
}

/** A page's document title: the page, then the product. */
export function pageTitle(name: string): string {
  return `${name} — ${SITE_NAME}`;
}

/**
 * A mission's meta description, built only from its own authored words plus
 * the path's own names — no marketing sentence is appended to it, because a
 * crawler snippet is a claim like any other.
 */
export function missionDescription(mission: Mission): string {
  const stage = stageById(mission.stageId);
  const layer = layerForStage(mission.stageId);
  const where = stage ? `Stage ${stage.num} · ${stage.title}` : "";
  const context = layer ? `${layer.title} layer` : "";
  const suffix = [where, context].filter(Boolean).join(" · ");
  return clampDescription([mission.tagline, suffix].filter(Boolean).join(" "));
}

/**
 * The head of one page. Every route builds its metadata here rather than
 * writing tags by hand, so a title, a canonical URL and a social card can never
 * disagree with each other on one page.
 */
export function pageMeta(input: {
  title: string;
  description: string;
  path: string;
  origin: string | null | undefined;
  type?: "website" | "article";
}): PageMeta {
  const url = absoluteUrl(resolveOrigin(input.origin), input.path);
  const description = clampDescription(input.description);
  return {
    title: input.title,
    description,
    canonical: url,
    og: {
      title: input.title,
      description,
      url,
      type: input.type ?? "website",
      siteName: SITE_NAME,
    },
  };
}
