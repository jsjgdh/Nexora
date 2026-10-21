// Rewrite the site's curriculum copy from the shipped manifests.
//
// The site's phase list is not marketing: it is the manifest, and the suite
// compares the two. Regenerating it here means the only way for the list to
// be wrong is for the suite to have been broken, which is now its own
// assertion.
//
// It rewrites the five phase arrays, the phase goals, and the activity
// counts, and nothing else. The prose around them — the course titles, the
// counts in the masthead, the headline — is written by a person, and this
// script must never touch it.
//
//   npm run sync:copy
//
// The earlier version of this script replaced the whole block between the
// first phase list and the end of ALL_PHASES, and took the course list and
// two other exports with it. Then it replaced the block between TASK_MANAGER
// and the end of API_BASICS, which looked safer and was not: the two Go
// arrays sit inside that region, so running it would have deleted them. The
// surgery here is per array, by name: each export is found, its bracket is
// matched, and only that statement is replaced. A bracket match cannot reach
// past the array it is matching, and a per-array match cannot reach past the
// export it is matching.
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

/* The manifest's own description, which is the sentence the site quotes. */
const description = (id) => {
  const entry = index.courses.find((c) => c.id === id);
  if (!entry) throw new Error(`no course ${id} in index.json`);
  const manifest = JSON.parse(readFileSync(`${shipped}${entry.manifest}`, "utf8"));
  return manifest.description;
};

/* The goal and the activity count, per phase. The goal is the manifest's own
 * sentence about what the phase is for, and it is what the site prints in
 * place of a phase list: the syllabus a reader actually wants, rather than
 * eighty names. */
const detail = (id) => {
  const entry = index.courses.find((c) => c.id === id);
  if (!entry) throw new Error(`no course ${id} in index.json`);
  const manifest = JSON.parse(readFileSync(`${shipped}${entry.manifest}`, "utf8"));
  return manifest.phases.map((p) => [p.id, p.goal ?? "", p.activityCount ?? 0]);
};

const COURSES = [
  ["task-manager", "TASK_MANAGER"],
  ["go-fundamentals", "GO_FUNDAMENTALS"],
  ["go-in-production", "GO_IN_PRODUCTION"],
  ["rust-fundamentals", "RUST_FUNDAMENTALS"],
  ["rust-in-production", "RUST_IN_PRODUCTION"],
  ["sql-fundamentals", "SQL_FUNDAMENTALS"],
  ["zig-fundamentals", "ZIG_FUNDAMENTALS"],
  ["ocaml-fundamentals", "OCAML_FUNDAMENTALS"],
  ["api-basics", "API_BASICS"],
];

const tuple = (rows) =>
  rows.map(([id, title, tier]) => `  ["${id}", "${title}", "${tier}"],`).join("\n");

const array = (name, rows) =>
  `export const ${name}: [string, string, "free" | "pro"][] = [\n${tuple(rows)}\n];`;

/**
 * Replace one exported array, by name.
 *
 * The statement starts at `export const <name>` and ends at the bracket that
 * closes the array literal. The opening bracket is the one after the
 * assignment, not the one in the type annotation: the annotation's own
 * brackets would close the match before the array had started.
 */
function replaceArray(src, name, replacement) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`the ${name} array was not found`);
  const assign = src.indexOf("=", start);
  const open = src.indexOf("[", assign);
  if (open === -1) throw new Error(`the ${name} array has no literal`);
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
  if (close === -1) throw new Error(`the ${name} array is not closed`);
  const end = src.indexOf("\n", close) + 1;
  return src.slice(0, start) + replacement + "\n" + src.slice(end);
}

const path = "src/lib/content/site.ts";
let src = readFileSync(path, "utf8");

for (const [id, name] of COURSES) {
  src = replaceArray(src, name, array(name, course(id)));
}
writeFileSync(path, src);

/* The goals, the activity counts, and each course's own description. These go
 * in their own generated file rather than inside the hand-written content
 * module, so the surgery above cannot reach them and the hand-written prose
 * cannot drift away from the generated data. */
const goals = {};
const counts = {};
for (const [id] of COURSES) {
  goals[id] = {};
  counts[id] = 0;
  for (const [phaseId, goal, count] of detail(id)) {
    goals[id][phaseId] = { goal, activities: count };
    counts[id] += count;
  }
}

const generated = `// Generated by npm run sync:copy — do not edit by hand.
// Source: nexora-ide/extensions/nexora/curriculum/shipped/*.manifest.json
//
// The goal of a phase is the shipped manifest's own sentence about what the
// phase is for, and the activity count is the number of activities the
// manifest says the phase holds. Both come from the manifests, so neither
// can be edited into a number the IDE does not ship.

export interface PhaseDetail {
  /** The manifest's sentence about what the phase is for. */
  readonly goal: string;
  /** How many activities the manifest says the phase holds. */
  readonly activities: number;
}

export const PHASE_DETAIL: Record<string, Record<string, PhaseDetail>> = ${JSON.stringify(goals, null, 2)};

export const COURSE_ACTIVITY_COUNTS: Record<string, number> = ${JSON.stringify(counts, null, 2)};

export const COURSE_DESCRIPTIONS: Record<string, string> = ${JSON.stringify(
  Object.fromEntries(COURSES.map(([id]) => [id, description(id)])),
  null,
  2
)};
`;

writeFileSync("src/lib/content/phase-detail.generated.ts", generated);

let total = 0;
let free = 0;
for (const [id] of COURSES) {
  const rows = course(id);
  total += rows.length;
  free += rows.filter(([, , tier]) => tier === "free").length;
  console.log(
    `  ${id.padEnd(18)} ${String(rows.length).padStart(2)} phases · ${String(counts[id]).padStart(3)} activities`
  );
}
console.log(`phase lists rewritten from the shipped manifests.`);
console.log(`  total ${total} phases, ${free} free.`);
console.log(`  the goals and the activity counts are in phase-detail.generated.ts.`);
console.log(`  the suite checks that the prose agrees: the headline count, the`);
console.log(`  course titles and counts, the free-phase reading, and every goal.`);
