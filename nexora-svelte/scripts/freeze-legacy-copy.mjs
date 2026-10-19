// Freeze the previous front door's sentences.
//
// The brief for this rebuild says the content comes from the research, not
// from the website that was here before. A sentence carried over is a
// sentence the research never said, so the old copy is frozen here once, as
// data, and the assertion suite reads it: no visible sentence of the current
// marketing surface may be one of these.
//
// Run it once, at the point where the old front door is still in history. The
// revision is pinned rather than "HEAD", because HEAD moves and a frozen file
// that was regenerated from a later commit would freeze the wrong sentences.
//
//   node scripts/freeze-legacy-copy.mjs
//
// It writes one sentence per line, and only the ones long enough to be a
// sentence rather than a label.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "scripts/legacy-front-door.txt";

/* The last commit that still held the previous front door. */
const BASELINE = "4c7535f";

function at(rev, path) {
  try {
    return execFileSync("git", ["show", `${rev}:${path}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

const sources = [
  at(BASELINE, "nexora-svelte/src/lib/content/site.ts"),
  at(BASELINE, "nexora-svelte/src/routes/+page.svelte"),
];

const strings = new Set();
for (const src of sources) {
  for (const match of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const raw = match[1] ?? "";
    if (raw.length < 20) continue;
    strings.add(raw.replace(/\\"/g, '"').replace(/\\n/g, " "));
  }
}

const sentences = new Set();
for (const value of strings) {
  for (const part of value.split(/(?<=[.!?])\s+/)) {
    const trimmed = part.trim();
    if (trimmed.length < 40) continue;
    if (trimmed.split(/\s+/).length < 8) continue;
    sentences.add(trimmed);
  }
}

const sorted = [...sentences].sort((a, b) => a.localeCompare(b));
writeFileSync(OUT, sorted.join("\n") + "\n", "utf8");
console.log(`froze ${sorted.length} sentences into ${OUT}`);
