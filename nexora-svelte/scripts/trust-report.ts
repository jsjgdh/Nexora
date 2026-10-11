/* The generated half of TRUST-MODEL.md.
 *
 * Why this file exists: the trust model's per-mission counts were hand-written,
 * and by the time anyone looked they were wrong by thirteen rules and eight
 * missions — in the one document whose entire job is to stop the platform
 * claiming more than it can decide. A disclosure a human maintains by hand is a
 * disclosure that drifts; this one is derived from the shipped content and the
 * authority table in `document-rules.ts`, and `scripts/verify.ts` fails when the
 * document and the content disagree.
 *
 *   npm run trust:report            rewrite the block in TRUST-MODEL.md
 *   npm run trust:report -- --check print nothing, exit 1 if it is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_MISSIONS } from "../src/lib/missions";
import {
  CLIENT_REPORTED_KINDS,
  KIND_AUTHORITY,
  RECEIPT_DECIDED_KINDS,
  SERVER_DECIDABLE_KINDS,
  authorityOf,
} from "../src/lib/document-rules";
import type { CheckDef, CheckRule, Mission } from "../src/lib/types";

export const BEGIN_MARKER =
  "<!-- BEGIN GENERATED: assessment authorities — written by `npm run trust:report`, checked by `npm run verify` -->";
export const END_MARKER = "<!-- END GENERATED: assessment authorities -->";
const DOC_PATH = new URL("../../TRUST-MODEL.md", import.meta.url);

/** How a kind's authority reads in the document. */
const AUTHORITY_WORD: Record<string, string> = {
  platform: "platform, from the stored draft",
  receipt: "platform, from a signed run receipt",
  client: "the learner's browser",
};

const clientChecks = (mission: Mission): CheckDef[] =>
  mission.checks.filter((c) => authorityOf(c.rule) === "client");

const kindBreakdown = (checks: CheckDef[]): string => {
  const counts = new Map<string, number>();
  for (const c of checks) counts.set(c.rule.kind, (counts.get(c.rule.kind) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, n]) => `${n} \`${kind}\``)
    .join(", ");
};

/** The block that belongs between the markers, markers included, newline-terminated. */
export function renderTrustBlock(): string {
  let checks = 0;
  let client = 0;

  const rows: string[] = [];
  for (const mission of ALL_MISSIONS) {
    const own = clientChecks(mission);
    checks += mission.checks.length;
    client += own.length;
    if (own.length === 0) continue;
    const platform = mission.checks.length - own.length;
    rows.push(
      `| \`${mission.id}\` | ${mission.checks.length} | ${kindBreakdown(own)} | ${platform} |`
    );
  }
  const pct = ((client / checks) * 100).toFixed(1);

  const kindCensus = (Object.keys(KIND_AUTHORITY) as CheckRule["kind"][])
    .sort()
    .map((kind) => {
      const shipped = ALL_MISSIONS.flatMap((m) => m.checks).filter((c) => c.rule.kind === kind).length;
      return `| \`${kind}\` | ${AUTHORITY_WORD[KIND_AUTHORITY[kind]]} | ${shipped} |`;
    });

  const lines: string[] = [];
  lines.push(BEGIN_MARKER);
  lines.push("");
  lines.push(
    "Every mission that ships a requirement only the learner's browser can decide. A rule the"
  );
  lines.push(
    "platform cannot re-run is *recorded and named*; it is never presented as the platform's"
  );
  lines.push("verdict.");
  lines.push("");
  lines.push("| Mission | Checks | Client-reported | Platform-decided |");
  lines.push("|---|---|---|---|");
  lines.push(...rows);
  lines.push(
    `| **All ${ALL_MISSIONS.length} missions** | **${checks}** | **${client}** (${pct} %) | **${checks - client}** |`
  );
  lines.push("");
  lines.push("Who decides each rule kind, and how much of it the content actually ships:");
  lines.push("");
  lines.push("| Rule kind | Decided by | Rules shipped |");
  lines.push("|---|---|---|");
  lines.push(...kindCensus);
  lines.push("");
  lines.push(
    `${SERVER_DECIDABLE_KINDS.length} kinds are the platform's from the stored draft, ` +
      `${RECEIPT_DECIDED_KINDS.length} from a signed receipt, and ${CLIENT_REPORTED_KINDS.length} ` +
      `(\`${CLIENT_REPORTED_KINDS.join("`, `")}\`) are the learner's own browser — ` +
      `${client} of ${checks} shipped requirements, ${pct} %.`
  );
  lines.push("");
  lines.push(END_MARKER);
  return `${lines.join("\n")}\n`;
}

/** The block currently in the document, or null when the markers are missing. */
export function currentTrustBlock(): string | null {
  const text = readFileSync(DOC_PATH, "utf8");
  const start = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + END_MARKER.length + 1);
}

function main(): void {
  const expected = renderTrustBlock();
  const check = process.argv.includes("--check");
  if (check) {
    const actual = currentTrustBlock();
    if (actual === expected) {
      console.log("TRUST-MODEL.md matches the shipped content.");
      return;
    }
    console.error(
      "TRUST-MODEL.md is stale: the generated block does not match the shipped content.\n" +
        "Run `npm run trust:report` in nexora-svelte/ and commit the result."
    );
    process.exit(1);
  }

  const text = readFileSync(DOC_PATH, "utf8");
  const start = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start === -1 || end === -1) {
    console.error("TRUST-MODEL.md has no generated block to replace.");
    process.exit(1);
  }
  writeFileSync(
    DOC_PATH,
    text.slice(0, start) + expected + text.slice(end + END_MARKER.length + 1),
    "utf8"
  );
  console.log("Rewrote the generated block in TRUST-MODEL.md.");
}

// Only run the CLI when executed directly, so the suite can import the renderer.
const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
