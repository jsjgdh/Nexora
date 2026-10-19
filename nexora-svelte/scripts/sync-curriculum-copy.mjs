// Rewrite the site's phase list from the shipped manifests.
//
// The site's phase list is not marketing: it is the manifest, and the suite
// compares the two. Regenerating it here means the only way for the list to
// be wrong is for the suite to have been broken, which is now its own
// assertion.
//
// It rewrites the three phase arrays and nothing else. The prose around them
// — the course titles, the counts in the masthead, the headline — is written
// by a person, and this script must never touch it: an earlier version of it
// replaced the whole block between the first phase list and the end of
// ALL_PHASES, and took the course list and two other exports with it.
//
//   npm run sync:copy
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const shippedDir = fileURLToPath(
  new URL("../../nexora-ide/extensions/nexora/curriculum/shipped/", import.meta.url)
);
const index = JSON.parse(readFileSync(`${shippedDir}/index.json`, "utf8"));

const course = (id) => {
  const entry = index.courses.find((c) => c.id === id);
  if (!entry) throw new Error(`no course ${id} in index.json`);
  const manifest = JSON.parse(readFileSync(`${shippedDir}/${entry.manifest}`, "utf8"));
  return manifest.phases.map((p) => [p.id, p.title, p.tier]);
};

const taskManager = course("task-manager");
const rustLedger = course("rust-ledger");
const apiBasics = course("api-basics");

const tuple = (rows) =>
  rows.map(([id, title, tier]) => `  ["${id}", "${title}", "${tier}"],`).join("\n");

const array = (name, rows) =>
  `export const ${name}: [string, string, "free" | "pro"][] = [\n${tuple(rows)}\n] as const;`;

const block = [
  array("TASK_MANAGER", taskManager),
  "",
  array("RUST_LEDGER", rustLedger),
  "",
  array("API_BASICS", apiBasics),
].join("\n");

const path = "src/lib/content/site.ts";
let src = readFileSync(path, "utf8");

// Only the three arrays, from the first one to the end of the last.
const start = src.indexOf("export const TASK_MANAGER");
const endMarker = "export const API_BASICS";
const endStart = src.indexOf(endMarker);
if (start === -1 || endStart === -1) throw new Error("the phase arrays were not found");
const end = src.indexOf("] as const;", endStart) + "] as const;".length;

src = src.slice(0, start) + block + src.slice(end);
writeFileSync(path, src);

const free =
  taskManager.filter(([, , tier]) => tier === "free").length +
  rustLedger.filter(([, , tier]) => tier === "free").length +
  apiBasics.filter(([, , tier]) => tier === "free").length;
const total = taskManager.length + rustLedger.length + apiBasics.length;

console.log(`phase lists rewritten from the shipped manifests.`);
console.log(`  task-manager ${taskManager.length} · rust-ledger ${rustLedger.length} · api-basics ${apiBasics.length}`);
console.log(`  total ${total} phases, ${free} free.`);
console.log(`  the suite now checks that the prose agrees: the headline count, the`);
console.log(`  course titles and counts, and the free-phase reading.`);
