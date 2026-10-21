#!/usr/bin/env node
/* Syncs the canonical code-attestation suites into the execution service.
   The IDE authors activities naming test paths (`test/api.test.mjs`); the
   platform re-runs its OWN copy of each suite for attestation. Only the
   suites named by authored commands cross over, keyed `project/path` — two
   projects can own the same relative path with different suites
   (`task-manager` and `go-ledger` both ship `test/merge.test.mjs`, judging
   different work), so a bare path is not an identity and is never used as one.
   Run:
     npm run sync:fixtures
   Check (what the verify suite runs):
     npm run sync:fixtures -- --check
   The output is a .ts module rather than .json so it ships inside dist/ with
   the service build. Suite bytes are normalized to LF on emit, so a
   CRLF-vs-LF checkout difference can never masquerade as a content change.
   Refusals, all loud: an authored path no fixture ships, an unknown project,
   or an empty suite. There is deliberately no guessing and no fallback. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const ideRoot = join(root, "..", "..", "nexora-ide", "extensions", "nexora");
const outFile = join(root, "services", "execution", "src", "data", "attest-fixtures.ts");

/* Phase project to the fixture directory holding its suites. This is the only
   place that mapping lives: the route never derives it, it only looks up the
   qualified keys this script emits. */
const PROJECT_ROOTS = {
  "task-manager": "fixtures/task-manager-stub",
  "unfamiliar-codebase": "fixtures/unfamiliar-codebase",
  "go-ledger": "fixtures/go-ledger",
  "go-deps": "fixtures/go-deps",
  "go-persist": "fixtures/go-persist",
  /* The two Go courses run in the Go workspace. Their phases name it
     explicitly, so these two entries are the fallback for the ones that do
     not — and a fallback that pointed at the wrong directory would sync the
     wrong suite, so it is stated rather than guessed. */
  "go-fundamentals": "fixtures/go-ledger",
  "go-in-production": "fixtures/go-ledger",
  /* The short course and the Rust course have workspaces of their own. Their
     suites were never synced while the script read one course's document; now
     that it reads the catalogue, they come with it. */
  "api-basics": "fixtures/api-basics",
  "rust-ledger": "fixtures/rust-ledger",
  /* The two Rust courses run in the Rust workspace, and their phases name it
     explicitly, so these two entries are the workspace and not a fallback. */
  "rust-fundamentals": "fixtures/rust-ledger",
  "rust-in-production": "fixtures/rust-ledger",
  /* The SQL course has a workspace of its own, and its phases name it
     explicitly, so the entry is the workspace and not a fallback. */
  "sql-ledger": "fixtures/sql-ledger",
  /* The Zig and OCaml courses have workspaces of their own, and their phases
     name them explicitly, the same way the SQL course's do. */
  "zig-sheet": "fixtures/zig-sheet",
  "zig-fundamentals": "fixtures/zig-sheet",
  "ocaml-calc": "fixtures/ocaml-calc",
  "ocaml-fundamentals": "fixtures/ocaml-calc",
};

/* Every course the IDE carries, and the suites its activities name.
 *
 * The catalogue is the IDE's own `curriculum/shipped/index.json`, the same file
 * the extension reads: a course added in the IDE brings its suites with it, and
 * a course removed takes them. Reading one course's document by name would
 * have left the Go suites behind when the Go track became two courses of its
 * own, and the platform would have judged a Go run against a suite it did not
 * hold. */
const ideCurriculum = join(ideRoot, "curriculum");
let catalogue;
try {
  catalogue = JSON.parse(await readFile(join(ideCurriculum, "shipped", "index.json"), "utf8"));
} catch {
  throw new Error(
    `cannot sync attestation fixtures: no curriculum catalogue at ${join(ideCurriculum, "shipped", "index.json")}\n` +
      `   nexora-ide must be checked out as a sibling of branchcraft (both under the same parent directory).`
  );
}

const activities = {};
/* The project a phase runs in. A phase that names none runs in its own
   course's project, which is what the extension's loader does with it. */
const projectOfActivity = new Map();
for (const course of catalogue.courses ?? []) {
  let doc;
  try {
    doc = JSON.parse(await readFile(join(ideCurriculum, `${course.id}.json`), "utf8"));
  } catch {
    throw new Error(
      `cannot sync attestation fixtures: no course document at ${join(ideCurriculum, `${course.id}.json`)}\n` +
        `   nexora-ide must be checked out as a sibling of branchcraft (both under the same parent directory).`
    );
  }
  for (const phase of doc.phases) {
    const project = phase.project || course.id;
    for (const aid of phase.activities ?? []) {
      projectOfActivity.set(aid, project);
    }
  }
  Object.assign(activities, doc.activities);
}

const seen = new Map();
const add = (key, file, content, via) => {
  if (seen.has(key)) {
    if (seen.get(key).content !== content) {
      throw new Error(
        `cannot sync attestation fixtures: ${key} resolves twice with different bytes (via ${seen.get(key).via} and ${via})`
      );
    }
    return;
  }
  seen.set(key, { file, content, via });
};

for (const [aid, activity] of Object.entries(activities)) {
  for (const kind of ["testCommand", "acceptanceCommand"]) {
    const command = activity[kind];
    if (!command) continue;
    const paths = [...command.matchAll(/[\w\-.\\/]+\.test\.mjs/g)].map((m) => m[0]);
    const project = projectOfActivity.get(aid) ?? "task-manager";
    for (const rel of paths) {
      let key;
      let full;
      if (rel.startsWith("acceptance/")) {
        key = rel;
        full = join(ideRoot, rel);
      } else {
        const fixture = PROJECT_ROOTS[project];
        if (!fixture) {
          throw new Error(`cannot sync attestation fixtures: ${aid} belongs to unknown project ${JSON.stringify(project)}`);
        }
        key = `${project}/${rel}`;
        full = join(ideRoot, fixture, rel);
      }
      let content;
      try {
        content = (await readFile(full, "utf8")).replace(/\r\n/g, "\n");
      } catch {
        throw new Error(`cannot sync attestation fixtures: ${aid} ${kind} names ${rel} and no fixture ships it`);
      }
      if (content.trim().length === 0) {
        throw new Error(`cannot sync attestation fixtures: ${rel} is empty — a suite that asserts nothing`);
      }
      // `file` is the layout path the runner writes: the bare relative path,
      // so the suite's own relative imports (../src/x, ../package.json) keep
      // working exactly as they do in the learner's folder.
      add(key, rel, content, `${aid} ${kind}`);
    }
  }
}

const entries = [...seen].map(([key, v]) => ({ key, file: v.file, content: v.content }));
const emitted =
  `// Generated by npm run sync:fixtures — do not edit by hand.\n` +
  `// Source: nexora-ide/extensions/nexora curriculum task-manager.json (which suites)\n` +
  `// plus fixtures/{task-manager-stub,unfamiliar-codebase,go-ledger}/test plus\n` +
  `// acceptance/*.test.mjs (their bytes). Keys are project-qualified; the route\n` +
  `// lays each suite out at its bare file path.\n` +
  `export interface SyncedAttestFixture {\n` +
  `  key: string;\n` +
  `  file: string;\n` +
  `  content: string;\n` +
  `}\n` +
  `export const SYNCED_ATTEST_FIXTURES: SyncedAttestFixture[] = ${JSON.stringify(entries)};\n`;

if (check) {
  let prev = null;
  try {
    prev = await readFile(outFile, "utf8");
  } catch {
    prev = null;
  }
  if (prev !== emitted) {
    throw new Error(
      "attestation fixture sync has drifted: the committed registry no longer equals what the IDE curriculum emits — " +
        "run `npm run sync:fixtures` and commit the regenerated module. The platform must never judge stale suites."
    );
  }
  console.log(`fixture sync clean (${entries.length} suites).`);
} else {
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, emitted, "utf8");
  console.log(`attestation fixtures synced (${entries.length} suites).`);
}
