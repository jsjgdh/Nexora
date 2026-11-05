import { error, redirect } from "@sveltejs/kit";
import { COURSE_BY_SLUG, TRACK_TO_COURSE } from "$lib/content/courses";

/* A track slug resolves to its language page. `go-fundamentals` and
   `go-in-production` both redirect to `/courses/go`, because a language is one
   page; the same is true of the two Rust tracks. */

export function load({ params }: { params: { slug: string } }) {
  const canonical = TRACK_TO_COURSE[params.slug] ?? params.slug;

  if (canonical !== params.slug) {
    redirect(308, `/courses/${canonical}`);
  }

  const course = COURSE_BY_SLUG[params.slug];
  if (!course) {
    error(404, "That course is not on the shelf.");
  }

  return { course };
}
