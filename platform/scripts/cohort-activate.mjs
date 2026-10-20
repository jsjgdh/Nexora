#!/usr/bin/env node
/* Confirm a cohort's licence, as the operator.
 *
 *   cd platform
 *   npm run cohort:activate -- KQ7M-XR42 --seats 20 --price 1200
 *
 * The licence is the commercial object and it is the operator's, not the
 * instructor's: an instructor creates a cohort, the cohort sits in `pending`
 * and entitles nobody, and this is the one thing that makes it real. The
 * platform records the licence so that entitlement can be real; it does not
 * take the money.
 *
 * The money is a QUOTE, and the operator states it here, at the moment the
 * licence is confirmed, because a licence is priced for the cohort it covers
 * and the operator is the one who quoted it. The cohort carries no price
 * before this: there is no price until there is a quote.
 *
 * Why a script and not a button: the confirmation is a commercial decision
 * about somebody else's invoice, and it has to leave a record that an operator
 * ran it. The same thing can be done over the mesh by automation, through the
 * same route this script calls, and there is no way to do it from the public
 * surface at all.
 *
 * The mesh key is read from the environment (or from the gitignored
 * platform/.env.local the local stack writes), never from a file in the
 * repository and never from an argument: an argument would put the key in the
 * shell history of whoever ran it. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The environment the local stack runs with.
 *
 * The stack writes platform/.env.local at run time and it is gitignored, so
 * reading it here is reading a file this machine wrote, not a secret from the
 * repository. The process environment wins over it, so a deployment that sets
 * its own variables is never overridden by a leftover file.
 */
function localEnv() {
  const env = {};
  try {
    for (const raw of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    /* no local env file: the process environment is all there is */
  }
  return env;
}

function usage() {
  return [
    "Usage:",
    "  npm run cohort:activate -- <join-code> --seats <n> --price <cents>",
    "",
    "  <join-code>   the code on the slide, e.g. KQ7M-XR42. The dash is display-only.",
    "  --seats <n>   how many seats were bought. Required: this is the number the",
    "                licence carries, and the operator is the one who knows it.",
    "                It used to default to the cohort's own count, which made the",
    "                quantity that carries money the instructor's own claim.",
    "  --price <c>   what one seat was quoted at, in cents. Required, and the",
    "                operator's number. A licence is quoted rather than listed:",
    "                the price depends on the cohort, the term and the courses, so",
    "                there is no price on the cohort until the studio quotes one,",
    "                and the operator states it when the licence is confirmed.",
    "",
    "The environment it needs:",
    "  AUTH_URL           the auth service (default http://127.0.0.1:8101)",
    "  INTERNAL_API_KEY   the mesh key. The route is unreachable without it.",
  ].join("\n");
}

/** The arguments, read leniently: the code may come with or without its dash. */
function parseArgs(argv) {
  const code = { value: "", seats: null, price: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seats") {
      code.seats = Number(argv[++i]);
    } else if (arg.startsWith("--seats=")) {
      code.seats = Number(arg.slice("--seats=".length));
    } else if (arg === "--price") {
      code.price = Number(argv[++i]);
    } else if (arg.startsWith("--price=")) {
      code.price = Number(arg.slice("--price=".length));
    } else if (arg === "--help" || arg === "-h") {
      code.help = true;
    } else if (!arg.startsWith("-") && !code.value) {
      code.value = arg;
    }
  }
  return code;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage() + "\n");
    return 0;
  }
  if (!args.value) {
    process.stderr.write("A join code is required.\n\n" + usage() + "\n");
    return 2;
  }
  if (args.seats === null) {
    process.stderr.write(
      "--seats is required. Say how many seats were bought: the licence carries that\nnumber, and the operator is the one who knows it.\n\n" + usage() + "\n"
    );
    return 2;
  }
  if (!Number.isInteger(args.seats) || args.seats < 1) {
    process.stderr.write("--seats must be a whole number of seats, at least one.\n");
    return 2;
  }
  if (args.price === null) {
    process.stderr.write(
      "--price is required. Say what one seat was quoted at, in cents: the licence\ncarries the quote, and the operator is the one who knows it.\n\n" + usage() + "\n"
    );
    return 2;
  }
  if (!Number.isInteger(args.price) || args.price < 1) {
    process.stderr.write("--price must be a whole number of cents, at least one.\n");
    return 2;
  }

  const env = { ...localEnv(), ...process.env };
  const base = (env.AUTH_URL ?? "http://127.0.0.1:8101").replace(/\/$/, "");
  const meshKey = env.INTERNAL_API_KEY ?? "";
  if (!meshKey) {
    process.stderr.write(
      "INTERNAL_API_KEY is not set. The confirmation route is the mesh's, and it answers nobody without the key.\n"
    );
    return 2;
  }

  const body = { joinCode: args.value, seats: args.seats, perStudentCents: args.price };

  let res;
  try {
    res = await fetch(`${base}/internal/cohorts/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": meshKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    process.stderr.write(`Could not reach the auth service at ${base}: ${err.message}\n`);
    return 1;
  }

  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message ?? text;
    } catch {
      /* not JSON: the raw body is the answer */
    }
    process.stderr.write(`The licence was not confirmed: ${message}\n`);
    return 1;
  }

  let cohort = null;
  try {
    cohort = JSON.parse(text)?.cohort ?? null;
  } catch {
    /* the status is the answer; the parse is a convenience */
  }
  if (!cohort) {
    process.stdout.write(`The licence was confirmed.\n${text}\n`);
    return 0;
  }
  process.stdout.write(
    [
      `Licence confirmed for ${cohort.name} (${cohort.institution}).`,
      `  cohort:   ${cohort.id}`,
      `  course:   ${cohort.courseId}`,
      `  term:     ${cohort.term}`,
      `  status:   ${cohort.status}`,
      `  seats:    ${cohort.seats}`,
      `  members:  ${cohort.memberCount}`,
      "",
      "The members of this cohort now hold a seat in this course, and only this course.",
      "",
    ].join("\n")
  );
  return 0;
}

process.exitCode = await main();
