/* The routes the site serves that a person can meet as a page.
 *
 * One list, two passes over it. The accessibility sweep (scripts/verify-a11y.ts)
 * walks every route with axe, and the content security policy pass
 * (scripts/verify-csp.ts) walks every route again to check that the page's own
 * script tags carry the request's nonce and that a script without one does not
 * run.
 *
 * They are the same list on purpose. A policy that is verified on the routes
 * the accessibility sweep happens to cover is a policy verified on a subset, and
 * the subset is whichever list was edited last. One list, two passes, no drift.
 *
 * A route is here when it is a page a visitor can arrive at and read. The
 * machine-readable files (robots.txt, sitemap.xml) are not pages and carry no
 * script, so they are not here; the error page is, because a visitor meets it
 * the moment a link is wrong. */

import { COURSE_PAGES } from "../src/lib/content/courses";

export const allRoutes = [
  "/",
  "/pricing",
  "/courses",
  ...COURSE_PAGES.map((course) => `/courses/${course.slug}`),
  "/employers",
  "/universities",
  // The cohort surface. A lecturer and a student arrive here, and both pages
  // have to be usable with a screen reader whether or not the visitor is
  // signed in, so both are scanned like any other page.
  "/teach",
  "/teach/join",
  "/auth",
  "/auth/ide",
  // The operator's console, scanned the way a visitor without a session sees
  // it: the refusal. The console behind a sign-in is the platform's job to
  // guard, and the part a screen reader can reach without a session is this
  // one.
  "/admin",
  "/profile",
  "/verify",
  "/download",
  // The legal documents are public pages like any other, so they are scanned
  // like any other. A policy nobody can read with a screen reader is not a
  // policy that was published.
  "/privacy",
  "/privacy-choices",
  "/ai",
  "/terms",
  "/cookies",
  "/subprocessors",
  "/dpa",
  "/security",
  "/accessibility",
  // The data-rights hub, scanned signed-out: this is the page where a control
  // that only exists behind a sign-in would be invisible to anyone who needs it
  // (and California forbids making a request conditional on an account), so the
  // signed-out state is the one that has to be usable.
  "/account",
  // The account flows. They are pages a learner meets when something has gone
  // wrong, so they are scanned like any other page: a form nobody can use with a
  // screen reader is a form nobody can use.
  "/auth/password-reset",
  "/auth/password-reset/confirm",
  "/auth/password-reset/some-token",
  "/auth/verify",
  "/auth/verify-email/confirm",
  "/route-that-does-not-exist",
];
