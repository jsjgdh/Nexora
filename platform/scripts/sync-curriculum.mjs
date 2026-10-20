#!/usr/bin/env node
/* Syncs curriculum content into backend services from one source.
   The IDE extension (a sibling repo): the whole authored task-manager plus
   the generated roadmap manifest, so the platform can serve paid phases
   behind entitlement while the artefact ships only the free loop.
   Run:
     npm run sync:curriculum
   Check (what a gate runs, because it must not rewrite what it is verifying):
     npm run sync:curriculum -- --check

   Retired: the web front door used to be a second source — every browser
   mission under nexora-svelte/src/lib was snapshotted into the curriculum,
   progress, and tutor services. That classroom is deleted (one way to learn:
   the desktop IDE), so there is nothing to snapshot and no stamp to check.
   the committed vendor copies under the services (vendor dirs and the
   curriculum data dir) remain until the platform pass removes the services' classroom
   surface; this script no longer reads or writes them. */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

/* The IDE curriculum lives in the nexora-ide repo, checked out as a sibling of
   branchcraft. The catalogue decides what crosses over, and the catalogue is
   the IDE's own `curriculum/shipped/index.json` — the same file the extension
   reads to know which courses it carries. So a course added in the IDE arrives
   here without a line of platform code, and a course removed in the IDE leaves
   here without one.

   Two files cross over per course:
     <id>.json                    every phase and activity — the content an
                                  entitled IDE fetches per session and holds in
                                  memory.
     shipped/<id>.manifest.json   the roadmap by name and tier, holding no
                                  lesson body.
   The manifest is synced rather than re-derived here on purpose: the free/pro
   boundary is computed by the extension's own tier.ts, and re-deriving it in
   this script would be a second place that boundary can be wrong. Syncing the
   generated manifest keeps one source of truth and lets the drift check catch a
   stale copy. */
const ideSrc = join(root, "..", "..", "nexora-ide", "extensions", "nexora", "curriculum");
const ideDataDir = join(root, "services", "curriculum", "src", "data");
const ideIndex = JSON.parse(await readFile(join(ideSrc, "shipped", "index.json"), "utf8"));
const ideDefaultCourse = ideIndex.defaultCourse;
const IDE_COURSES = (ideIndex.courses ?? []).map((course) => {
  const stem = course.id.toUpperCase().replace(/-/g, "_");
  return {
    id: course.id,
    doc: {
      rel: `${course.id}.json`,
      out: `ide-course-${course.id}.ts`,
      symbol: `IDE_COURSE_${stem}`,
    },
    manifest: {
      rel: join("shipped", `${course.id}.manifest.json`),
      out: `ide-manifest-${course.id}.ts`,
      symbol: `IDE_MANIFEST_${stem}`,
    },
  };
});
if (IDE_COURSES.length === 0) {
  throw new Error("sync-curriculum: the IDE catalogue names no course");
}
/* The one file the service reads: it maps every course id to its document and
   its manifest, so the service has no list of courses of its own to fall out
   of date. Generated, because the courses are data. */
const IDE_COURSES_INDEX = {
  rel: "shipped/index.json",
  out: "ide-courses.ts",
  symbol: "IDE_COURSES",
};
const IDE_SOURCES = IDE_COURSES.flatMap((course) => [course.doc, course.manifest]);


/* The web-classroom snapshot list is intentionally empty: the browser missions
   it used to copy no longer exist (see the header comment). TARGETS stays as
   a named empty map — rather than deleting the web loop outright — so the
   retirement is visible here and the verify harness can assert the sources
   stay absent instead of silently passing on nothing. */
const TARGETS = {};

// Retired: the web-classroom snapshot list is empty (see TARGETS above), so
// there is no web digest to compute and no stamp to write. The committed
// vendor copies and their version stamps stay byte-stable until the platform
// pass removes the services' classroom surface. If entries ever return here,
// they must name sources that exist — the verify harness asserts the retired
// sources stay absent.
if (Object.keys(TARGETS).length > 0) {
  throw new Error(
    "sync-curriculum: web TARGETS are retired with the browser classroom — " +
      "do not re-add web sources here; the platform pass owns the vendor copies."
  );
}
/* ---- Second source: the IDE curriculum, its own stamp ----
   Generated as .ts wrappers rather than verbatim .json for two reasons. An
   explicit `: unknown` annotation keeps tsc from inferring a type the size of
   the document (declaration: true would otherwise emit it). And re-serializing
   the parsed value makes the output canonical — the same bytes whatever line
   endings the sibling repo checks out with (task-manager.json is CRLF there,
   the manifest is LF), so the committed snapshot and a fresh sync always agree
   under this repo's `* text=auto eol=lf`. A separate hash and version file
   because this content has a different source and a different edit cadence than
   the web missions; folding it into CONTENT_VERSION would rewrite the progress
   and tutor stamps whenever an IDE phase changed. */
const ideHash = createHash("sha256");
const ideJobs = [];
/* The catalogue is hashed first, and it is hashed because it is content: a
   course added or removed changes what this snapshot holds, and the version
   stamp has to say so. The order is the catalogue's own order, then each
   course's document and manifest, and the drift check in verify.mjs mirrors
   it exactly. */
ideHash.update("ide/" + IDE_COURSES_INDEX.rel.split("\\").join("/") + "\n" + JSON.stringify(ideIndex) + "\n");
for (const s of IDE_SOURCES) {
  const from = join(ideSrc, s.rel);
  let raw;
  try {
    raw = await readFile(from, "utf8");
  } catch {
    throw new Error(
      `cannot sync the IDE curriculum: no file at ${from}\n` +
        `   nexora-ide must be checked out as a sibling of branchcraft (both under the same parent directory).`
    );
  }
  const parsed = JSON.parse(raw);
  // Hash the canonical form, never the raw bytes, so a CRLF-vs-LF checkout
  // difference cannot masquerade as a content change.
  const canonicalRel = s.rel.split("\\").join("/");
  ideHash.update("ide/" + canonicalRel + "\n" + JSON.stringify(parsed) + "\n");
  ideJobs.push({ ...s, parsed, canonicalRel });
}
const ideVersion = ideHash.digest("hex").slice(0, 12);

/* The generated bytes, collected before anything is written, so `--check` can
   answer "would regenerating change the commit?" without changing it. A gate may
   not rewrite the file it verifies: regenerating first and diffing after can only
   ever be silent, and the drift it exists to catch is erased before it is read. */
const emitted = ideJobs.map((job) => [
  join(ideDataDir, job.out),
  `// Generated by npm run sync:curriculum — do not edit by hand.\n` +
    `// Source: nexora-ide/extensions/nexora/curriculum/${job.canonicalRel}\n` +
    `export const ${job.symbol}: unknown = ${JSON.stringify(job.parsed, null, 2)};\n`,
]);
/* The catalogue file the service reads: every course, its document and its
   manifest, in one map. Generated from the IDE's own index, so the service
   never holds a list of courses of its own. */
const courseIndexImports = IDE_COURSES.map(
  (course) =>
    `import { ${course.doc.symbol} } from "./${course.doc.out.replace(/\.ts$/, ".js")}";\n` +
    `import { ${course.manifest.symbol} } from "./${course.manifest.out.replace(/\.ts$/, ".js")}";`
).join("\n");
const courseIndexEntries = IDE_COURSES.map(
  (course) =>
    `  ${JSON.stringify(course.id)}: { manifest: ${course.manifest.symbol}, document: ${course.doc.symbol} },`
).join("\n");
emitted.push([
  join(ideDataDir, IDE_COURSES_INDEX.out),
  `// Generated by npm run sync:curriculum — do not edit by hand.\n` +
    `// Source: nexora-ide/extensions/nexora/curriculum/${IDE_COURSES_INDEX.rel.split("\\").join("/")}\n` +
    courseIndexImports +
    `\n\n/** The course a fresh install opens, as the IDE's catalogue says. */\n` +
    `export const IDE_DEFAULT_COURSE = ${JSON.stringify(ideDefaultCourse)};\n\n` +
    `/** Every course the IDE carries, with its roadmap and its authored document. */\n` +
    `export const IDE_COURSES: Record<string, { manifest: unknown; document: unknown }> = {\n` +
    courseIndexEntries +
    `\n};\n`,
]);

// Same idempotent-stamp rule as CONTENT_VERSION: it records when this content
// was last snapshotted, so it must not move when the content does not. That rule
// is also what makes the byte comparison below honest rather than a date trap: a
// re-sync of unchanged content emits the bytes already committed.
const ideVersionFile = join(ideDataDir, "ide-version.ts");
const idePrev = await readFile(ideVersionFile, "utf8").catch(() => "");
const idePrevHash = /IDE_CONTENT_VERSION = "([^"]+)"/.exec(idePrev)?.[1];
const idePrevStamp = /IDE_CONTENT_SYNCED_AT = "([^"]+)"/.exec(idePrev)?.[1];
const ideSyncedAt =
  idePrevHash === ideVersion && idePrevStamp ? idePrevStamp : new Date().toISOString();
emitted.push([
  ideVersionFile,
  `// Generated by npm run sync:curriculum — do not edit by hand.\n` +
    `export const IDE_CONTENT_VERSION = ${JSON.stringify(ideVersion)};\n` +
    `export const IDE_CONTENT_SYNCED_AT = ${JSON.stringify(ideSyncedAt)};\n` +
    `export const IDE_CONTENT_SOURCE = "nexora-ide/extensions/nexora/curriculum";\n`,
]);

/* The files this sync owns: everything in the data dir whose name starts with
   `ide-`. A file that is not emitted any more is a leftover from a course that
   is gone, and it is removed rather than left to rot: a stale snapshot beside
   a fresh one is a snapshot somebody will read. The dir is generated in full
   (the verify harness asserts exactly that), so this is safe to do. */
const emittedNames = new Set(emitted.map(([file]) => basename(file)));
const stale = (await readdir(ideDataDir).catch(() => []))
  .filter((name) => name.startsWith("ide-") && !emittedNames.has(name))
  .map((name) => join(ideDataDir, name));

if (check) {
  const drifted = [];
  for (const [file, text] of emitted) {
    const committed = await readFile(file, "utf8").catch(() => null);
    if (committed !== text) {
      drifted.push(file.slice(root.length + 1).split("\\").join("/"));
    }
  }
  for (const file of stale) {
    drifted.push(file.slice(root.length + 1).split("\\").join("/") + " (stale: not emitted any more)");
  }
  if (drifted.length > 0) {
    throw new Error(
      `IDE curriculum sync has drifted: ${drifted.join(", ")} is not what the IDE source emits — ` +
        "run `npm run sync:curriculum` and commit the regenerated snapshot. The platform must never serve stale curriculum."
    );
  }
  console.log(`curriculum sync clean (ide ${ideVersion}, ${IDE_COURSES.length} course(s)).`);
} else {
  await mkdir(ideDataDir, { recursive: true });
  for (const [file, text] of emitted) {
    await writeFile(file, text, "utf8");
  }
  for (const file of stale) {
    await rm(file, { force: true });
    console.log(`removed stale ${file.slice(root.length + 1).split("\\").join("/")}`);
  }
  console.log(`curriculum synced (ide ${ideVersion}, ${IDE_COURSES.length} course(s)).`);
  // The suite reads the BUILT artifact, not the source. A sync that leaves the
  // build stale makes the next run fail for a reason that looks like drift —
  // and it looks like drift in the WRONG direction, which is the worst kind of
  // confusing. So the sync rebuilds what it changed.
  //
  // `execSync` and not `execFileSync`: on Windows the package manager is a
  // `.cmd`, and spawning one without a shell is refused (it is how a command
  // that works on a colleague's Linux fails on a colleague's Windows).
  execSync("npm run build --workspace=@nexora/curriculum", { stdio: "inherit" });
}
