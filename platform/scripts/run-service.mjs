#!/usr/bin/env node
/* Runs one service, and stops when the stack that started it stops.
 *
 *   node scripts/run-service.mjs services/auth/dist/index.js
 *
 * The stack holds the write end of this process's stdin. When the stack goes
 * away - cleanly, or killed so hard that no handler runs - the pipe closes and
 * this process exits, so a service is never left running with no stack around
 * it. The service itself still handles SIGTERM and SIGINT the way it always
 * did; this is only the backstop for the case where the signal never arrives.
 */

import { pathToFileURL } from "node:url";

const entry = process.argv[2];
if (!entry) {
  process.stderr.write("usage: run-service <path to the service entry point>\n");
  process.exit(2);
}

process.stdin.on("end", () => process.exit(0));
process.stdin.resume();

await import(pathToFileURL(entry).href);
