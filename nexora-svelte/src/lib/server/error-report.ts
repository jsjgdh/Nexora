import type { HandleServerError } from "@sveltejs/kit";

/* The web app's half of the error reporting.
 *
 * It lives here, and not in `src/hooks.server.ts`, for one reason: the
 * hooks module reads the runtime environment, and the environment module
 * only exists inside the bundler. A plain script that wants to exercise
 * this reporter cannot import the hooks module, so the reporter is its own
 * module with no environment in it, and the hooks module re-exports it.
 *
 * What the browser gets back is deliberately the generic message. The
 * detail lives in this log, not in a response, so no surface of this
 * product tells a stranger what broke inside. */
export const handleError: HandleServerError = ({ event, error }) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  console.error(
    JSON.stringify({
      level: 50,
      service: "web",
      url: event.url.pathname + event.url.search,
      message,
      stack: stack.slice(0, 2000),
      at: new Date().toISOString(),
    })
  );
  return { message: "Internal error" };
};
