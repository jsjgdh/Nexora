import type { PageServerLoad } from "./$types";

/**
 * The join code, read on the server.
 *
 * The link an instructor puts on a slide carries the code in the query
 * string, so the field is filled before the page is sent. It is read here
 * rather than in the browser because a code typed once should not have to be
 * typed again, and because the page has to read without its script.
 */
export const load: PageServerLoad = ({ url }) => ({
  code: (url.searchParams.get("code") ?? "").trim(),
});
