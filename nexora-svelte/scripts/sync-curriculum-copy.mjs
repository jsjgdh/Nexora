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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* Where the IDE checkout is.
 *
 * The sibling lives beside the repository (`../nexora-ide` from the repo
 * root), but a checkout that is inside the repository is a thing people do
 * too, and the script should not care which one it is looking at. The
 * environment variable is the escape hatch for either arrangement. */
const candidates = [
  process.env.NEXORA_IDE_PATH
    ? `${process.env.NEXORA_IDE_PATH}/extensions/nexora/curriculum/shipped/`
    : null,
  "../../../nexora-ide/extensions/nexora/curriculum/shipped/",
  "../../nexora-ide/extensions/nexora/curriculum/shipped/",
].filter(Boolean);

const shippedDir = candidates
  .map((candidate) =>
    fileURLToPath(new URL(`${candidate}/index.json`, import.meta.url))
  )
  .find((candidate) => existsSync(candidate));

if (!shippedDir) {
  console.error(
    "no shipped manifests found. Checkout nexora-ide beside the repository, " +
      "or point NEXORA_IDE_PATH at the checkout."
  );
  process.exit(1);
}
const shipped = shippedDir.replace(/[\\/]index\.json$/, "");
const index = JSON.parse(readFileSync(shippedDir, "utf8"));

const course = (id) => {
  const entry = index.courses.find((c) => c.id === id);
  if (!entry) throw new Error(`no course ${id} in index.json`);
  const manifest = JSON.parse(readFileSync(`${shipped}${entry.manifest}`, "utf8"));
  return manifest.phases.map((p) => [p.id, p.title, p.tier]);
};

const taskManager = course("task-manager");
const rustLedger = course("rust-ledger");
const apiBasics = course("api-basics");

const tuple = (rows) =>
  rows.map(([id, title, tier]) => `  ["${id}", "${title}", "${tier}"],`).join("\n");

const array = (name, rows) =>
  `export const ${name}: [string, string, "free" | "pro"][] = [\n${tuple(rows)}\n];`;

const block = [
  array("TASK_MANAGER", taskManager),
  "",
  array("RUST_LEDGER", rustLedger),
  "",
  array("API_BASICS", apiBasics),
  "",
].join("\n");

const path = "src/lib/content/site.ts";
let src = readFileSync(path, "utf8");

// Only the three arrays, from the first one to the end of the last.
//
// The end of the last array is found by matching brackets, not by looking for
// the text that closes it. The earlier version searched for the first
// "] as const;" after the API_BASICS export, which is the end of the course
// list when the arrays are closed with a plain bracket, and it deleted the
// course list, the phases export and the free count in one go. A bracket
// match cannot reach past the array it is matching.
const start = src.indexOf("export const TASK_MANAGER");
const endMarker = "export const API_BASICS";
const endStart = src.indexOf(endMarker);
if (start === -1 || endStart === -1) throw new Error("the phase arrays were not found");

// The opening bracket is the one after the assignment, not the one in the
// type annotation: the annotation's own brackets would close the match before
// the array had started.
const assign = src.indexOf("=", endStart);
const open = src.indexOf("[", assign);
let depth = 0;
let close = -1;
for (let i = open; i < src.length; i++) {
  const ch = src[i];
  if (ch === "[") depth += 1;
  else if (ch === "]") {
    depth -= 1;
    if (depth === 0) {
      close = i;
      break;
    }
  }
}
if (close === -1) throw new Error("the API_BASICS array is not closed");
const end = src.indexOf("\n", close) + 1;

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
