import { mailConfigured } from "$lib/mail";

/**
 * The teaching page needs to know one thing the browser cannot know: whether
 * this build has a mail provider configured. If it does not, the page says so
 * and gives the address instead of a form that cannot send, and that is
 * decided here rather than in the page, so the page cannot claim a channel
 * the server does not have.
 */
export const load = () => ({
  mailConfigured,
});
