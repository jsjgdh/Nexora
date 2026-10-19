import type { PageServerLoad } from "./$types";
import { HERO_VARIANTS } from "$lib/content/site";

/* The headline assignment.
 *
 * The research's §5 lists a headline split test among the five landing-page
 * tests it recommends, and a split test needs three things: a set of
 * variants, an assignment that happens before the first byte, and a way to
 * read the assignment back later. This file is the middle one.
 *
 * The assignment is a cookie, so a reader who comes back sees the same
 * headline they saw the first time, and a query string can override it for a
 * manual check. The variants themselves live in the content module, next to
 * the rest of the copy, because a headline is copy and copy has one home.
 *
 * Only the assigned variant is rendered. A page that renders all three is not
 * a test, it is a menu, and a menu measures nothing. */

const COOKIE = "nexora_headline";
const MAX_AGE = 60 * 60 * 24 * 90;

const IDS: string[] = HERO_VARIANTS.map((variant) => variant.id);

export const load: PageServerLoad = async ({ url, cookies }) => {
  const asked = (url.searchParams.get("v") ?? "").trim().toLowerCase();
  const stored = (cookies.get(COOKIE) ?? "").trim().toLowerCase();

  const id = IDS.includes(asked) ? asked : IDS.includes(stored) ? stored : IDS[0];

  cookies.set(COOKIE, id, {
    path: "/",
    maxAge: MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  });

  return { headline: id };
};
