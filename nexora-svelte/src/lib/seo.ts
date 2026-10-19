/* SEO basics (TODO 8.4). These are pure functions rather than templates baked
   into a route so the paths and the documents they produce are asserted in the
   suite, not eyeballed in a browser. The app is local-first and ships with no
   origin configured, so every document takes its origin as an argument and the
   routes fall back to SITE_URL_FALLBACK: an unset variable must never throw.

   The same three rules hold for the metadata as for the crawler files: nothing
   is invented, nothing is duplicated by hand (one builder serves every route),
   and nothing claims a URL the build did not actually emit. There is one way
   to learn — the desktop IDE — so no sitemap entry, title, or description
   names a browser mission, classroom route, or curriculum page. */

/** Where generated URLs point when PUBLIC_SITE_URL is not configured. */
export const SITE_URL_FALLBACK = "http://localhost:5173";

/** The product's name, as it appears in a title tag and on a social card. */
export const SITE_NAME = "NEXORA";

/** The shell's title, and the title any page without its own falls back to. */
export const SITE_TITLE = "NEXORA: a course that runs inside a real IDE, and proves what you built.";

/** The shell's description: the promise with its framing clause. */
export const SITE_DESCRIPTION =
  "A course that runs inside a real desktop IDE. Every phase is a working app, every check comes back with a reason, and every pass leaves a signed receipt.";

/** The same promise without the frame — what a social card has room for. */
export const SITE_TAGLINE =
  "Learn programming inside a desktop IDE, with every step decided by evidence rather than by time served.";

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
    signed-in view, and a crawler has nothing to index behind it. The front door
    is listed — the download, the account, the tier, and the proof — together
    with the legal documents, which are public by design: a policy a visitor
    cannot read without an account is not a policy.

    The legal paths are the same ones the footer prints from `$lib/legal`; that
    module is the single source of truth for the list, and `scripts/verify.ts`
    asserts this array and the footer link list agree.

    `/account` is deliberately absent, and it is the only public-facing page that
    is. It is a signed-in tool, not a document: a crawler has no account, so every
    visit is a sign-in prompt. What it must never become is the *only* route to a
    right — the notice publishes the contact address for exactly that reason, and
    California requires that a request be possible without an account. */
const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/employers",
  "/auth",
  "/auth/ide",
  "/verify",
  "/download",
  "/privacy",
  "/privacy-choices",
  "/ai",
  "/terms",
  "/cookies",
  "/subprocessors",
  "/dpa",
  "/security",
  "/accessibility",
];

/** Every indexable path: exactly the public pages. Nothing else is emitted. */
export function sitemapPaths(): string[] {
  return [...PUBLIC_PATHS];
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
