/* The checker's own test.
 *
 * A checker that cries wolf is worse than no checker, so the rules are driven
 * over a list of strings that are known good and known bad, and the walk is
 * driven over a file that holds every kind of string that is not copy. A rule
 * that fires on a comment, a log line, a URL or a class name fails here.
 *
 * The last test runs the checker over the site itself. It fails while any rule
 * is broken in the tree, which is the point: the copy is fixed by the people
 * who own it, and the suite says so until they do.
 *
 *   npx tsx --test scripts/copy-rules.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  CTA_LABEL,
  RULES,
  checkText,
  closesSentence,
  ctaVariant,
  labelKey,
  sameIntent,
} from "./copy-rules";
import {
  CODE_KEYS,
  COPY_KEYS,
  COPY_MODULES,
  attributesOf,
  extractModule,
  extractSvelte,
  isControl,
  literalPieces,
  looksLikeCode,
  plainText,
  readsLikeProse,
} from "./copy-extract";
import { checkSite, collectStrings, collectSurfaces } from "./verify-copy";

const siteRoot = join(fileURLToPath(import.meta.url), "..", "..");

/** The rules a string breaks. */
const rulesOf = (text: string): string[] => checkText(text).map((violation) => violation.rule);

/* -------------------------------------------------------------- the rules */

test("a plain sentence breaks no rule", () => {
  const good = [
    "The page states what the product does and what it does not.",
    "Download the IDE",
    "Try it free",
    "Nine phases ship inside the installer.",
    "The renewal date is shown before you pay.",
  ];
  for (const text of good) {
    assert.deepEqual(rulesOf(text), [], `expected no finding for: ${text}`);
  }
});

test("an em dash and an en dash are both refused", () => {
  assert.ok(rulesOf("Billing details for a paid tier — email and name.").includes("no-dash"));
  assert.ok(rulesOf("Billing details for a paid tier – email and name.").includes("no-dash"));
  assert.ok(rulesOf("a - b").length === 0, "a hyphen is not a dash");
});

test("an exclamation mark is refused, and a marker is not", () => {
  assert.ok(rulesOf("Try it now!").includes("no-exclamation"));
  assert.ok(rulesOf("That is fast. Wow! Try it again.").includes("no-exclamation"));
  assert.ok(!rulesOf("? not found").includes("no-exclamation"), "a marker is not an exclamation");
  assert.ok(
    !rulesOf('hand back "Hello, " plus "!"').includes("no-exclamation"),
    "a quoted character is not an exclamation"
  );
});

test("an emoji is refused, and the marks the product uses are not", () => {
  assert.ok(rulesOf("Ship it 🚀").includes("no-emoji"));
  assert.ok(rulesOf("Done 🎉").includes("no-emoji"));
  assert.ok(!rulesOf("★ done").includes("no-emoji"), "a star is a mark, not an emoji");
  assert.ok(!rulesOf("› next").includes("no-emoji"), "a chevron is a mark, not an emoji");
});

test("every refused word is refused", () => {
  const refused: [string, string][] = [
    ["let's", "Let's start with the free phases."],
    ["let's go", "Let's go."],
    ["exciting", "The exercise is exciting."],
    ["amazing", "That is amazing."],
    ["powerful", "A powerful idea."],
    ["seamless", "A seamless handover."],
    ["robust", "A robust solution."],
    ["dive in", "Dive in and build it."],
    ["unlock", "Unlock the next phase."],
    ["level up", "Level up the skill."],
    ["master", "A mastered skill."],
    ["crush it", "Crush it before Friday."],
    ["supercharge", "Supercharge the workflow."],
  ];
  for (const [word, text] of refused) {
    const found = checkText(text).find((violation) => violation.rule === "no-banned-word");
    assert.ok(found, `expected "${word}" to be refused in: ${text}`);
    assert.equal(found.detail, word);
  }
});

test("the refused words are refused as the words the product refuses them", () => {
  assert.ok(rulesOf("Mastery Map").includes("no-banned-word"), "mastery carries master");
  assert.ok(rulesOf("It unlocks the next step.").includes("no-banned-word"), "unlocks carries unlock");
});

test("journey is refused as a marketing word and kept as a noun", () => {
  assert.ok(rulesOf("Your Journey").includes("no-banned-word"), "your journey sells");
  assert.ok(rulesOf("Start your journey today").includes("no-banned-word"));
  assert.ok(
    !rulesOf("The build journey has four beats.").includes("no-banned-word"),
    "a build journey is a noun"
  );
});

test("marketing voice is refused, and a plain instruction is not", () => {
  const bad = [
    "Congratulations, you finished the course.",
    "Welcome to the only course you will ever need.",
    "You'll be amazed at what you can build.",
    "Imagine a code base that never drifts.",
    "Get ready to change the way you work.",
    "Buckle up, this is going to be fast.",
    "You deserve a better tool.",
    "Ready to dive in?",
    "A world-class developer experience.",
    "Join thousands of learners.",
    "Used by thousands of teams.",
    "100% satisfaction, guaranteed.",
  ];
  for (const text of bad) {
    assert.ok(rulesOf(text).includes("no-marketing-voice"), `expected marketing voice in: ${text}`);
  }
  const good = [
    "Sign in to continue.",
    "You will see the result after the checks run.",
    "Install Node 20 or newer, then run the tests.",
    "The page shows what the product does.",
  ];
  for (const text of good) {
    assert.ok(
      !rulesOf(text).includes("no-marketing-voice"),
      `expected no marketing voice in: ${text}`
    );
  }
});

test("the call to action has one spelling", () => {
  assert.equal(ctaVariant(CTA_LABEL), null);
  assert.equal(ctaVariant("Try it free today"), "Try it free today");
  assert.equal(ctaVariant("Try the free tier"), "Try the free tier");
  assert.equal(ctaVariant("Download the IDE"), null);
});

test("two labels are the same when they read the same", () => {
  assert.equal(labelKey("Mark as Complete!"), "mark as complete");
  assert.ok(sameIntent("Mark as complete", "Mark complete"));
  assert.ok(!sameIntent("Mark as complete", "Reset the phase"));
});

test("a sentence after a mark starts with a capital", () => {
  assert.ok(closesSentence("Done! Next.", 5));
  assert.ok(!closesSentence("select! polls", 7));
});

/* ---------------------------------------------------------------- the walk */

test("a comment is not copy", () => {
  const source = [
    "// The em dash is banned — and this comment must not be read as copy.",
    "/* A block comment with an em dash — also not copy. */",
    "const label = 'Mark as Complete';",
  ].join("\n");
  const found = extractModule("sample.ts", source);
  assert.deepEqual(found.map((entry) => entry.text), ["Mark as Complete"]);
});

test("a type name is not copy, and the word printed for it is", () => {
  const source = [
    "export type Tier = 'free' | 'pro';",
    "export const TIER_WORD: Record<Tier, string> = {",
    "  pro: 'Pro tier',",
    "};",
  ].join("\n");
  const found = extractModule("sample.ts", source);
  assert.deepEqual(found.map((entry) => entry.text), ["Pro tier"]);
});

test("an identifier under a code key is not copy", () => {
  const source = [
    "const item = {",
    "  id: 'setup',",
    "  href: '/download',",
    "  slug: 'task-manager',",
    "  label: 'Mark as Complete',",
    "};",
  ].join("\n");
  const found = extractModule("sample.ts", source);
  assert.deepEqual(found.map((entry) => entry.text), ["Mark as Complete"]);
});

test("a log line is not copy", () => {
  const source = "console.log('the phase unlocked — writing the record');";
  const found = extractModule("sample.ts", source);
  assert.deepEqual(found, []);
});

test("the list of refused words is not copy", () => {
  const source = ['export const FORBIDDEN_WORDS = [', '  "mastery",', '  "level up",', "] as const;"].join(
    "\n"
  );
  const found = extractModule("sample.ts", source, { copyModule: true });
  assert.deepEqual(found, []);
});

test("the text of a page is copy, and the class names are not", () => {
  const source = [
    "<section class=\"hero\">",
    "  <h1>Billing details for a paid tier — email and name</h1>",
    "  <!-- a comment with an em dash — not copy -->",
    "</section>",
  ].join("\n");
  const found = extractSvelte("sample.svelte", source);
  assert.deepEqual(
    found.strings.map((entry) => entry.text),
    ["Billing details for a paid tier — email and name"]
  );
});

test("the attributes that name a control are copy", () => {
  const source = '<button title="Close the receipt" aria-label="Close">Close</button>';
  const found = extractSvelte("sample.svelte", source);
  const texts = found.strings.map((entry) => entry.text);
  assert.ok(texts.includes("Close the receipt"), "the tooltip is copy");
  assert.ok(texts.includes("Close"), "the accessible name is copy");
});

test("a control is a link or a button, and a section is not", () => {
  assert.ok(isControl("a", {}));
  assert.ok(isControl("button", {}));
  assert.ok(isControl("ActionLink", { href: "/download" }));
  assert.ok(!isControl("section", { id: "market" }));
  assert.ok(!isControl("p", { id: "note" }));
});

test("the words of an element are its label, and an expression is not", () => {
  assert.equal(plainText("Try it free"), "Try it free");
  assert.equal(plainText("{release.label}"), null);
});

test("the reader of a page keeps the text around an expression", () => {
  const pieces = literalPieces("Sign in to continue");
  assert.deepEqual(
    pieces.map((piece) => piece.text),
    ["Sign in to continue"]
  );
  const split = literalPieces("{plan.name} plan");
  assert.deepEqual(
    split.map((piece) => piece.text.trim()),
    ["plan"]
  );
});

test("a URL and a path are not copy", () => {
  assert.ok(looksLikeCode("https://example.invalid/docs"));
  assert.ok(looksLikeCode("teaching@nexora.dev"));
  assert.ok(looksLikeCode("/download"));
  assert.ok(!looksLikeCode("The page states what the product does."));
  assert.ok(readsLikeProse("The page states what the product does."));
  assert.ok(!readsLikeProse("task-manager"));
});

test("the attributes of a tag are read with their values", () => {
  const attributes = attributesOf('<a href="/download" class="text-accent">Download</a>');
  assert.equal(attributes.href, "/download");
  assert.equal(attributes.class, "text-accent");
});

test("the copy modules and the code keys are the ones the walk uses", () => {
  assert.ok(COPY_MODULES.has("src/lib/content/site.ts"));
  assert.ok(COPY_MODULES.has("src/lib/legal.ts"));
  assert.ok(CODE_KEYS.has("href"));
  assert.ok(COPY_KEYS.has("label"));
});

/* ------------------------------------------------------------ the product */

test("the rules the checker decides are the rules it reports on", () => {
  assert.deepEqual(
    RULES.map((rule) => rule.id),
    [
      "no-dash",
      "no-exclamation",
      "no-emoji",
      "no-banned-word",
      "no-marketing-voice",
      "one-label-per-intent",
      "cta-once",
    ]
  );
});

test("the walk finds the copy of the pages, the chrome and the copy module", () => {
  const { strings } = collectStrings(siteRoot);
  const files = new Set(strings.map((entry) => entry.file));
  assert.ok(files.has("src/lib/content/site.ts"), "the copy module is read");
  assert.ok(files.has("src/lib/components/Header.svelte"), "the chrome is read");
  assert.ok(
    [...files].some((file) => file.startsWith("src/routes/")),
    "the pages are read"
  );
  assert.ok(
    ![...files].some((file) => file.startsWith("scripts/") || file.startsWith("src/lib/server/")),
    "the scripts and the server side are not read"
  );
});

test("every route is a surface", () => {
  const surfaces = collectSurfaces(siteRoot);
  const ids = surfaces.map((surface) => surface.id);
  assert.ok(ids.includes("/"), "the home page is a surface");
  assert.ok(ids.includes("/pricing"), "the pricing page is a surface");
  for (const surface of surfaces) {
    assert.ok(surface.files.size > 0, `the surface ${surface.id} renders something`);
  }
});

test("the site holds no copy that breaks a rule", () => {
  const result = checkSite(siteRoot);
  const counts = new Map<string, number>();
  for (const violation of result.violations) {
    counts.set(violation.rule, (counts.get(violation.rule) ?? 0) + 1);
  }
  const summary = [...counts.entries()].map(([rule, count]) => `${rule}: ${count}`).join(", ");
  assert.equal(
    result.violations.length,
    0,
    `the site breaks ${result.violations.length} copy rule(s): ${summary}\n` +
      result.violations
        .slice(0, 20)
        .map((v) => `  ${v.file}:${v.line} ${v.rule} ${v.detail} ${JSON.stringify(v.text)}`)
        .join("\n")
  );
});
