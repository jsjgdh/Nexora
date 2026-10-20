/* The web app's error reporting: the assertions that matter for it.
   Run with: npx tsx scripts/verify-observability.ts

   Why this file exists at all: TODO 5.2 asks for error reporting for the web
   app and every service. The services' half lives in the platform chassis
   (a structured fatal line, plus an optional webhook). This app's half is
   the `handleError` hook in `src/hooks.server.ts`: SvelteKit routes every
   unexpected server error through it, and it replaces SvelteKit's default
   handler — the one that logs in its own shape — so the report happens here,
   once, in the same shape every service writes: one JSON line on stderr
   with a service name, ready to be read by the same `docker logs | grep`
   that reads the rest of the platform.

   What is asserted here is not "a function exists":

     1. The shape. One line, valid JSON, level 50, service "web", the URL
        that was being served, the error's own words, a bounded stack, and
        a timestamp the receiving end can store.

     2. The honesty under stress. A thrown non-Error (a rejected promise
        whose reason is a string) is reported too, not dropped into a
        handler that only understands Error objects — the moment a report
        hook is picky is the moment the interesting failures are the ones
        it drops.

     3. The boundary. What the browser gets back is the generic message;
        the detail lives in the log. This mirrors the API's own 500
        envelopes ("Something went wrong."), so no surface of this product
        tells a stranger what broke inside.

   What is deliberately not asserted here: that SvelteKit calls the hook at
   all in a running server — that is SvelteKit's documented contract, and
   pinning it would mean booting the whole app inside this script. This gate
   pins our half of it: when called, it reports exactly like this. */
import assert from "node:assert";
import { handleError } from "../src/hooks.server";

let passed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}

/* Call the hook the way SvelteKit would, capturing both the line it writes
   and the answer it returns. console.error is swapped rather than spied on
   with a wrapper module: the report's destination is the process's stderr,
   and the honest test of "it writes one line" is reading what the process
   was about to print. */
const call = (url: string, error: unknown): { lines: string[]; returned: unknown } => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const returned = handleError({
      event: { url: new URL(url) },
      error,
    } as unknown as Parameters<typeof handleError>[0]);
    return { lines, returned };
  } finally {
    console.error = original;
  }
};

{
  const { lines, returned } = call("http://localhost:5173/dev?q=1", new Error("boom-web-b12"));
  ok("an unexpected error is reported as exactly one line", lines.length === 1, lines.join("\n"));
  const report = JSON.parse(lines[0]);
  ok(
    "the line is the platform's structured shape",
    report.level === 50 && report.service === "web",
    lines[0]
  );
  ok("the line says where the failure happened", report.url === "/dev?q=1");
  ok("the line carries the error's own words", report.message === "boom-web-b12");
  ok(
    "and a stack — present, carrying the error, and bounded",
    typeof report.stack === "string" &&
      report.stack.includes("boom-web-b12") &&
      report.stack.length <= 2000
  );
  ok("and a timestamp the receiving end can store", !Number.isNaN(Date.parse(report.at)));
  ok(
    "the browser's answer is the generic one",
    (returned as { message: string }).message === "Internal error",
    JSON.stringify(returned)
  );
  ok(
    "and it does not leak what broke",
    !JSON.stringify(returned).includes("boom-web-b12")
  );
}

{
  const { lines, returned } = call("http://localhost:5173/x", "plain-string-failure");
  ok("a thrown non-Error is reported too, not dropped", lines.length === 1, lines.join("\n"));
  const report = JSON.parse(lines[0]);
  ok("as its own words, stringified", report.message === "plain-string-failure");
  ok("with no invented stack", report.stack === "");
  ok(
    "and the same generic answer",
    (returned as { message: string }).message === "Internal error"
  );
}

console.log(`\n${passed} OBSERVABILITY ASSERTIONS PASSED`);
