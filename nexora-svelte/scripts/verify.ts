/* Acceptance verification: check engine, recommendation rules, content integrity.
   Run with: npx tsx scripts/verify.ts */
import { JSDOM } from "jsdom";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// jsdom globals for the DOM-dependent check engine
const dom = new JSDOM("", { url: "http://localhost/" });
(global as any).DOMParser = dom.window.DOMParser;
(global as any).CSS = dom.window.CSS;

import { runChecks, evaluateRunAssertions } from "../src/lib/checks";
import type { RunDiagnostic, RunOutcome } from "../src/lib/types";
import { chooseRuntime, needForMission, providerLabel } from "../src/lib/execution-router";
import { diffLines } from "../src/lib/line-diff";
import { workspaceFilesFor } from "../src/lib/workspace-files";
import {
  buildDriverSource,
  evaluateAssertions,
  HARNESS_NS,
  injectDriver,
  isHarnessReply,
  materializeRunOp,
} from "../src/lib/harness";
// The exact shipped bytes, materialized: tests execute what the frame runs.
const runOp = materializeRunOp();
import { ALL_MISSIONS, missionById } from "../src/lib/missions";
import {
  COMPETENCIES,
  LAYERS,
  STAGES,
  layerById,
  stageById,
  trackById,
} from "../src/lib/curriculum";
import {
  DIAGNOSTIC_ITEMS,
  HTML_ITEM_IDS,
  LANGUAGE_ITEM_IDS,
  placementStartMissionId,
} from "../src/lib/diagnostic";
import { STORAGE_KEY, defaultState, computeFinalization, defaultMissionProgress, normalizeReflections } from "../src/lib/progress-core";
import {
  PRACTICE_BANNED_WORDS,
  PRACTICE_CAP,
  PRACTICE_COPY,
  PRACTICE_STORAGE_KEY,
  beatenThisWeek,
  emptyPractice,
  mistakeId,
  normalizePractice,
  observe,
  openMistakes,
  practiceSet,
  practiceSummary,
  resolvedMistakes,
  rotate,
} from "../src/lib/practice-core";
import type { Mistake, PracticeState } from "../src/lib/practice-core";
import { EVIDENCE_CAVEAT, buildEvidence, evidenceJson, evidenceMarkdown } from "../src/lib/evidence";
import {
  META_DESCRIPTION_LIMIT,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL_FALLBACK,
  clampDescription,
  missionDescription,
  pageMeta,
  pageTitle,
  resolveOrigin,
  robotsTxt,
  sitemapPaths,
  sitemapXml,
} from "../src/lib/seo";
import {
  CLIENT_REPORTED_KINDS,
  KIND_AUTHORITY,
  RECEIPT_DECIDED_KINDS,
  SERVER_DECIDABLE_KINDS,
  isClientReported,
} from "../src/lib/document-rules";
import { currentTrustBlock, renderTrustBlock } from "./trust-report";
import { draftOf, mergeStates, meaningfulWork, protectCompleted, receiptEvidenceFor } from "../src/lib/sync-core";
import { isExpiring, parseSessionStart, refreshDelayMs, tokenExpiryMs } from "../src/lib/session-core";
import { recommend, nodeStateFor, prereqsMet, continueTarget, missionActionLabel } from "../src/lib/recommend";
import { actionVerb } from "../src/lib/format";

let passed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  // `detail` is for the cases whose evidence is captured output (a child
  // process's stdout, a runner's answer): printing it only on failure keeps the
  // passing log readable and makes the failing one diagnosable.
  assert(cond, `FAILED: ${name}${detail === undefined ? "" : `\n${detail}`}`);
  passed++;
  console.log(`  ok - ${name}`);
}
function passes(missionId: string, code: string): string[] {
  const m = missionById(missionId)!;
  return runChecks(code, m.checks).filter((o: any) => o.passed).map((o: any) => o.checkId);
}
function fails(missionId: string, code: string): string[] {
  const m = missionById(missionId)!;
  return runChecks(code, m.checks).filter((o: any) => !o.passed).map((o: any) => o.checkId);
}

console.log("== content integrity ==");
ok(
  "60 missions on the path: 2 orientation entries, 15 Go language and algorithms missions, 29 web missions (including backend), and 3 engineering scenarios",
  ALL_MISSIONS.length === 60
);
ok(
  "the three engineering scenarios are the non-web, non-Go missions",
  ALL_MISSIONS.filter((m) => m.language === "node").length === 3
);
const goWorkspaceMissions = ALL_MISSIONS.filter((m) => m.language === "go");
const webWorkspaceMissions = ALL_MISSIONS.filter((m) => m.language !== "go" && m.language !== "node" && m.stageId !== "orientation");
const legacyWorkspaceMissions = ALL_MISSIONS.filter((m) => m.language !== "node");
ok("the cohort has 26 Go missions and 29 web missions (including new backend missions)", goWorkspaceMissions.length === 26 && webWorkspaceMissions.length === 29);
ok("every mission resolves to exactly one editable source at its original path", legacyWorkspaceMissions.length === 57 && legacyWorkspaceMissions.every((m) => {
  const files = workspaceFilesFor(m);
  return files.length === 1 && files[0].editable && files[0].path === (m.fileName ?? "index.html") && files[0].content === m.starterCode;
}));
const allIds = new Set(ALL_MISSIONS.map((m) => m.id));
// NOTE (stages → missions direction): stage lists deliberately reference
// unshipped missions — the map renders those stages as previews. So there is
// intentionally NO assertion that every listed id resolves; it would fail on
// every partially-shipped stage, which is the normal state of this codebase.
// Integrity flows the other way (every authored mission registered; every
// prerequisite resolves or names declared future content) plus the UI
// degrades gracefully (empty states, no dead recommendations, no crashes).
for (const m of ALL_MISSIONS) {
  const st = STAGES.find((s) => s.id === m.stageId);
  ok(`${m.id} registered in its stage`, !!st && st.missionIds.includes(m.id));
}
for (const m of ALL_MISSIONS) {
  // Prereqs must resolve — unless they name declared future content (a stage
  // lists them but no mission file ships yet). Previews never block, so a
  // dangling reference is only a bug when nothing declares it.
  const stageListed = new Set(STAGES.flatMap((s) => s.missionIds));
  for (const p of m.prereqIds)
    ok(`${m.id}: prereq ${p} resolves or is a declared preview`, !!missionById(p) || stageListed.has(p));
  for (const c of m.competencyIds) ok(`${m.id}: competency ${c} non-empty`, c.length > 0);
  ok(`${m.id}: 5-level hint ladder`, m.hintLadder.length === 5 && m.hintLadder.every((h) => h.length > 20));
  ok(`${m.id}: unique check ids`, new Set(m.checks.map((c) => c.id)).size === m.checks.length);
  for (const q of m.questions ?? []) ok(`${m.id}: question ${q.id} answer in range`, q.answer >= 0 && q.answer < q.options.length);
  // Missions with document checks are practised in the editor, so they need
  // starter code. Concept missions are assessed by inline questions only.
  ok(
    `${m.id}: starter code present when the mission has checks`,
    m.checks.length === 0 || m.starterCode.length > 50
  );
  // When every check needs the runner, a runnerless environment can decide
  // nothing here — so the questions are what completes the mission. The
  // workspace states that outright; this keeps the statement true.
  const runsOnly = m.checks.length > 0 && m.checks.every((c) => c.rule.kind === "runs");
  ok(
    `${m.id}: completable without a runner (questions, when every check is an execution check)`,
    !runsOnly || (m.questions?.length ?? 0) > 0
  );
  // The server binds a signed run to the mission's own file: it hashes the
  // draft the learner saved and compares it with the file the runner saw. A
  // mission that executes code without naming that file could not be verified,
  // so the binding would silently become a no-op.
  if (m.checks.some((c) => c.rule.kind === "runs")) {
    ok(`${m.id}: execution missions name the file the run is bound to`, !!m.fileName);
  }
}
for (const d of DIAGNOSTIC_ITEMS) ok(`diag ${d.id} answer in range`, d.answer >= 0 && d.answer < d.options.length);

console.log("== path: layers, placement, and the foundations gate ==");
ok(
  "four layers in the confirmed order",
  LAYERS.map((l) => l.id).join(",") === "orientation,language,dsa,application"
);
ok("every stage belongs to a real layer", STAGES.every((s) => !!layerById(s.layerId)));
ok("every stage belongs to a real track", STAGES.every((s) => !!trackById(s.trackId)));
ok("stage numbers run 1..n in path order", STAGES.every((s, i) => s.num === i + 1));
ok(
  "the path opens with foundations, not a specialisation",
  STAGES[0].layerId === "orientation" && STAGES[0].trackId === "platform"
);
ok(
  "Foundations offers a follow-on concept that builds on its first mission",
  STAGES[0].missionIds.join(",") === "how-programs-run,input-process-output" &&
    missionById("input-process-output")?.prereqIds.includes("how-programs-run") === true &&
    missionById("input-process-output")?.checks.length === 0
);
const inputProcessOutput = missionById("input-process-output")!;
ok(
  "input-process-output has four taught, explained questions rather than a runner gate",
  inputProcessOutput.questions?.length === 4 &&
    inputProcessOutput.questions.every((q) => q.options.length === 4 && q.explanation.length > 40) &&
    inputProcessOutput.checks.length === 0
);
ok(
  "the web track lives in the application layer only",
  STAGES.filter((s) => s.trackId === "web").every((s) => s.layerId === "application")
);
ok("algorithms sit between the language and the application layers", LAYERS[2].id === "dsa");
ok(
  "Stage 5 has authored work in searching, sorting, recursion and cost",
  stageById("dsa-more")?.missionIds.join(",") ===
    "go-binary-search,go-insertion-sort,go-recursive-sum,go-cost-instinct"
);
ok(
  "every diagnostic probe resolves to a real competency",
  DIAGNOSTIC_ITEMS.every((d) => COMPETENCIES.some((c) => c.id === d.competencyId))
);
ok(
  "the diagnostic probes both the foundations and the application layers",
  new Set(DIAGNOSTIC_ITEMS.map((d) => d.layerId ?? "application")).size >= 2
);

const probes = (correctIds: string[]) =>
  DIAGNOSTIC_ITEMS.map((d) => ({
    itemId: d.id,
    correct: correctIds.includes(d.id),
    skipped: false,
  }));
ok(
  "nothing demonstrated starts before syntax",
  placementStartMissionId(probes([])) === "how-programs-run"
);
ok(
  "one language item enters Go at values",
  placementStartMissionId(probes([LANGUAGE_ITEM_IDS[0]])) === "go-values"
);
ok(
  "two language items enter Go at functions",
  placementStartMissionId(probes(LANGUAGE_ITEM_IDS.slice(0, 2))) === "go-functions"
);
ok(
  "language fluent with no web exposure reaches algorithms before any track",
  placementStartMissionId(probes(LANGUAGE_ITEM_IDS)) === "go-slices"
);
ok(
  "language fluent plus one HTML item enters the web track at the intro",
  placementStartMissionId(probes([...LANGUAGE_ITEM_IDS, HTML_ITEM_IDS[0]])) === "first-page"
);
ok(
  "language fluent plus both HTML items waives the web intros",
  placementStartMissionId(probes([...LANGUAGE_ITEM_IDS, ...HTML_ITEM_IDS])) ===
    "links-and-navigation"
);
// The second persona must not be trapped in foundations by a partial language
// score when their application work is already demonstrated.
ok(
  "a capable web learner is placed in the web track despite a partial language score",
  placementStartMissionId(
    probes([
      "diag-lang-order",
      "diag-html-structure",
      "diag-semantics",
      "diag-js-predict",
      "diag-css-fix",
    ])
  ) === "links-and-navigation"
);
ok(
  "the override needs a high bar: one HTML item alone does not fire it",
  placementStartMissionId(probes(["diag-html-structure", "diag-css-fix", "diag-git-diff"])) ===
    "how-programs-run"
);
// The ladder above is only worth anything if the rungs exist. A placement
// screen that names a mission the path does not ship sends the learner it was
// meant to help to a dead page, so every target the diagnostic can choose is
// asserted to be authored content — and the web gate's own prerequisite with
// it, or the gate would only be a promise.
for (const target of [
  "how-programs-run",
  "go-values",
  "go-functions",
  "go-slices",
  "first-page",
  "links-and-navigation",
  "go-errors",
]) {
  ok(`placement target ${target} is an authored mission`, !!missionById(target));
}

// The flow the product promises: no specialisation before you can write a
// loop — while placement must never trap a learner who already can.
const webFirst = missionById("web-and-browsers")!;
ok("the web track is gated behind the language layer", webFirst.prereqIds.includes("go-errors"));
const novice = defaultState();
novice.profile.completedAt = "2026-01-01T00:00:00.000Z";
ok("a true beginner cannot reach the web track yet", prereqsMet(webFirst, novice) === false);
const placed = defaultState();
placed.profile.completedAt = "2026-01-01T00:00:00.000Z";
placed.diagnostic.completedAt = "2026-01-01T00:00:00.000Z";
placed.diagnostic.results = DIAGNOSTIC_ITEMS.map((d) => ({
  itemId: d.id,
  selected: d.answer,
  correct: true,
  skipped: false,
}));
ok("placement unlocks the web track for a fluent learner", prereqsMet(webFirst, placed) === true);

novice.diagnostic.completedAt = "2026-01-01T00:00:00.000Z";
novice.diagnostic.results = DIAGNOSTIC_ITEMS.map((d) => ({
  itemId: d.id,
  selected: -1,
  correct: false,
  skipped: true,
}));
const noviceRec = recommend(novice);
// The contract the interim rule was written against is now met: the
// foundations layer ships, so a true beginner is sent to the orientation
// entry rather than to "nothing yet". The old guard — null, done:false, a
// foundations reason — is deliberately gone; what replaces it is stronger,
// because a recommended mission must now exist and must sit outside the
// application layer.
const noviceMission = noviceRec.primaryId ? missionById(noviceRec.primaryId) : undefined;
ok(
  "a true beginner is recommended the foundations entry, never the web track",
  noviceRec.primaryId === "how-programs-run" &&
    noviceRec.done === false &&
    !!noviceMission &&
    stageById(noviceMission.stageId)!.layerId !== "application"
);
const fluentRec = recommend(placed);
ok(
  "a fluent learner is recommended straight into the application track",
  !!fluentRec.primaryId && stageById(missionById(fluentRec.primaryId)!.stageId)!.trackId === "web"
);

console.log("== check engine: starters fail, solutions pass ==");
const first = missionById("first-page")!;
ok("first-page starter fails all", fails("first-page", first.starterCode).length === 3);
const firstSol = first.starterCode
  .replace("Untitled page", "My learning page")
  .replace("<!-- TODO: add an h1 heading and a p paragraph below -->", "<h1>My learning page</h1>\n    <p>I built this myself.</p>");
ok("first-page solution passes all", fails("first-page", firstSol).length === 0);

const txt = missionById("text-and-structure")!;
const txtFails = fails("text-and-structure", txt.starterCode);
ok("text starter fails one-h1/two-h2/emphasis, passes two-p", txtFails.includes("one-h1") && txtFails.includes("two-h2") && txtFails.includes("emphasis") && passes("text-and-structure", txt.starterCode).includes("two-p"));
const txtSol = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>City gardening guide</title></head><body><h1>City gardening guide</h1><h2>Choosing containers</h2><p>Drainage matters <em>more</em> than size.</p><h2>Watering schedule</h2><p><strong>Never</strong> water at midday in summer.</p></body></html>`;
ok("text solution passes all", fails("text-and-structure", txtSol).length === 0);

const links = missionById("links-and-navigation")!;
ok("links starter fails nav checks", fails("links-and-navigation", links.starterCode).includes("nav-links"));
const linksSol = links.starterCode.replace("<!-- TODO: add a nav with 3 links: two relative pages, one absolute URL -->",
  `<nav><a href="index.html">Home</a><a href="about.html">About</a><a href="https://example.com">Example</a></nav>`);
ok("links solution passes all", fails("links-and-navigation", linksSol).length === 0);
const linksPlaceholder = linksSol.replace('href="about.html"', 'href="#"');
ok("placeholder href fails no-placeholders", fails("links-and-navigation", linksPlaceholder).includes("no-placeholders"));
const linksMissingHref = linksSol.replace('<a href="about.html">About</a>', "<a>About</a>");
ok("an anchor with no href is not invisible to no-placeholders", fails("links-and-navigation", linksMissingHref).includes("no-placeholders"));
const linksObfuscatedScheme = linksSol.replace('href="about.html"', 'href="java&#10;script:alert(1)"');
ok("ASCII line breaks cannot disguise a javascript URL scheme", fails("links-and-navigation", linksObfuscatedScheme).includes("no-placeholders"));
const linksNoHost = linksSol.replace('href="https://example.com"', 'href="https://"');
ok("an absolute URL without a host is still a placeholder", fails("links-and-navigation", linksNoHost).includes("no-placeholders"));
const linksEmptyMail = linksSol.replace('href="about.html"', 'href="mailto:"');
ok("an empty mailto destination is rejected", fails("links-and-navigation", linksEmptyMail).includes("no-placeholders"));
const linksEmptyPhone = linksSol.replace('href="about.html"', 'href="tel:"');
ok("an empty telephone destination is rejected", fails("links-and-navigation", linksEmptyPhone).includes("no-placeholders"));

const img = missionById("images-and-alt")!;
ok("images starter fails all", fails("images-and-alt", img.starterCode).length === 3);
const imgSol = img.starterCode.replace("<!-- TODO: add a figure with an img (src + meaningful alt) and a figcaption -->",
  `<figure><img src="https://picsum.photos/seed/dog/600/400" alt="Brown dog running on a beach" width="600" height="400"/><figcaption>Morning run.</figcaption></figure>`);
ok("images solution passes all", fails("images-and-alt", imgSol).length === 0);
const imgShortAlt = imgSol.replace("Brown dog running on a beach", "dog");
ok("short alt fails good-alt", fails("images-and-alt", imgShortAlt).includes("good-alt"));

const lists = missionById("lists")!;
ok("lists starter fails all", fails("lists", lists.starterCode).length === 3);
const listsSol = lists.starterCode.replace("<!-- TODO: an ol with 3+ steps, one step nesting a ul; 6+ li total -->",
  `<ol><li>Mix dry<ul><li>200g flour</li><li>2 tbsp sugar</li><li>1 tsp salt</li></ul></li><li>Whisk</li><li>Rest</li></ol>`);
ok("lists solution passes all", fails("lists", listsSol).length === 0);

const sem = missionById("semantic-html")!;
ok("semantic starter fails landmarks", fails("semantic-html", sem.starterCode).length === 6);
const semSol = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>My blog</title></head><body><header><p>My blog</p><nav><a href="index.html">Home</a><a href="about.html">About</a></nav></header><main><article><h1>Why semantic HTML matters</h1><p>Divs say nothing about their content.</p></article></main><footer><p>© 2026 My blog</p></footer></body></html>`;
ok("semantic solution passes all", fails("semantic-html", semSol).length === 0);

const form = missionById("contact-form")!;
ok("form starter fails (form + labeled)", fails("contact-form", form.starterCode).length >= 2);
const formSol = form.starterCode.replace("<!-- TODO: build the form here -->",
  `<form action="/contact" method="post"><label for="name">Name</label><input type="text" id="name" name="name" required/><label for="email">Email address</label><input type="email" id="email" name="email" required/><label for="message">Message</label><textarea id="message" name="message" rows="4" required></textarea><button type="submit">Send message</button></form>`);
ok("form solution passes all", fails("contact-form", formSol).length === 0);
const formPlaceholder = formSol.replace(/<label for="email">Email address<\/label>/, "").replace(/<label for="message">Message<\/label>/, "");
ok("unlabeled inputs fail labeled-inputs", fails("contact-form", formPlaceholder).includes("labeled"));
const formGhostAria = formSol
  .replace(/<label for="[^"]+">[^<]*<\/label>/g, "")
  .replace('id="name"', 'id="name" aria-labelledby="missing-name"')
  .replace('id="email"', 'id="email" aria-labelledby="missing-email"')
  .replace('id="message"', 'id="message" aria-labelledby="missing-message"');
ok("aria-labelledby references must resolve to a non-empty name", fails("contact-form", formGhostAria).includes("labeled"));
const formAriaNamed = formSol
  .replace(/<label for="[^"]+">[^<]*<\/label>/g, "")
  .replace('id="name"', 'id="name" aria-label="Name"')
  .replace('id="email"', 'id="email" aria-label="Email address"')
  .replace('id="message"', 'id="message" aria-label="Message"');
ok("non-empty aria-labels remain valid programmatic names", passes("contact-form", formAriaNamed).includes("labeled"));
const formResolvedAria = formSol
  .replace(/<label for="[^"]+">[^<]*<\/label>/g, "")
  .replace('method="post">', 'method="post"><span id="name-caption">Name</span><span id="email-caption">Email address</span><span id="message-caption">Message</span>')
  .replace('id="name"', 'id="name" aria-labelledby="name-caption"')
  .replace('id="email"', 'id="email" aria-labelledby="email-caption"')
  .replace('id="message"', 'id="message" aria-labelledby="message-caption"');
ok("aria-labelledby passes when its references resolve to real text", passes("contact-form", formResolvedAria).includes("labeled"));
const formEmptyWrap = formSol.replace('<label for="name">Name</label><input type="text" id="name" name="name" required/>', '<label><input type="text" name="name" required/></label>');
ok("an empty wrapping label is not treated as an accessible name", fails("contact-form", formEmptyWrap).includes("labeled"));
const formWrapped = formSol.replace('<label for="name">Name</label><input type="text" id="name" name="name" required/>', '<label>Name<input type="text" name="name" required/></label>');
ok("wrapped-label input still passes", passes("contact-form", formWrapped).includes("labeled"));

const boss = missionById("personal-website")!;
ok("boss starter fails most", fails("personal-website", boss.starterCode).length >= 8);
const bossSol = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Ada Lovelace — developer</title></head><body><header><p>Ada Lovelace</p><nav><a href="index.html">Home</a><a href="projects.html">Projects</a><a href="https://example.com">Elsewhere</a></nav></header><main><h1>Ada Lovelace</h1><h2>About</h2><p>Analytical engines.</p><h2>Work</h2><figure><img src="https://picsum.photos/seed/ada/600/400" alt="Portrait-style photo of Ada at a desk"/><figcaption>At work.</figcaption></figure><ul><li>Engines</li><li>Notes</li><li>Looms</li></ul><form action="/contact" method="post"><label for="email">Email</label><input type="email" id="email" name="email" required/><label for="msg">Message</label><textarea id="msg" name="msg" required></textarea><button type="submit">Send</button></form></main><footer><p>© 2026 Ada</p></footer></body></html>`;
ok("boss solution passes all 9", fails("personal-website", bossSol).length === 0);

console.log("== recommendation engine ==");
let s = defaultState();
ok("fresh state -> onboarding", continueTarget(s).href === "/onboarding");
s.profile = { ...s.profile, name: "Ada", goal: "websites", completedAt: new Date().toISOString() };
ok("profile only -> diagnostic", continueTarget(s).href === "/diagnostic");
// Diagnostic: language layer fluent AND document structure demonstrated ->
// the web intros are waived and the path starts at links-and-navigation.
const placedCorrect = new Set([...LANGUAGE_ITEM_IDS, ...HTML_ITEM_IDS]);
s.diagnostic = {
  completedAt: new Date().toISOString(),
  results: DIAGNOSTIC_ITEMS.map((d) => ({
    itemId: d.id,
    selected: placedCorrect.has(d.id) ? d.answer : -1,
    correct: placedCorrect.has(d.id),
    skipped: !placedCorrect.has(d.id),
  })),
};
let rec = recommend(s);
ok("a placed learner starts at links-and-navigation", rec.primaryId === "links-and-navigation");
ok("pre-start missions marked optional", nodeStateFor(missionById("first-page")!, s, rec.primaryId) === "optional");
ok("post-start mission locked until start mission done", nodeStateFor(missionById("images-and-alt")!, s, rec.primaryId) === "locked");
// Complete links -> next is images
s.missions["links-and-navigation"] = { ...s.missions["links-and-navigation"] as any, missionId: "links-and-navigation", code: "", startedAt: new Date().toISOString(), attempts: 1, checksPassed: [], hintsUsed: 0, maxHintLevel: 0, questionsAnswered: {}, questionsCorrect: {}, completedAt: new Date().toISOString(), masteredAt: new Date().toISOString(), independent: true, xpAwarded: 100 };
rec = recommend(s);
ok("after links -> images-and-alt", rec.primaryId === "images-and-alt");
ok("locked mission detected", !prereqsMet(missionById("contact-form")!, s));
ok("locked node state", nodeStateFor(missionById("contact-form")!, s, rec.primaryId) === "locked");
// In-progress priority
s.missions["images-and-alt"] = { ...(s.missions["links-and-navigation"] as any), missionId: "images-and-alt", completedAt: null, masteredAt: null };
rec = recommend(s);
ok("in-progress mission prioritized", rec.primaryId === "images-and-alt");
// All done -> done state
for (const m of ALL_MISSIONS) {
  s.missions[m.id] = { ...(s.missions["links-and-navigation"] as any), missionId: m.id };
}
rec = recommend(s);
ok("all complete -> done", rec.done && rec.primaryId === null);

console.log("== finalization math ==");
const clean = { missionId: "first-page", code: "", startedAt: "x", attempts: 2, checksPassed: [], hintsUsed: 1, maxHintLevel: 1, questionsAnswered: {}, questionsCorrect: {}, completedAt: null, masteredAt: null, independent: false, xpAwarded: 0 };
const fClean = computeFinalization(missionById("first-page")!, clean as any);
ok("clean run -> mastered with bonus", fClean.mastered && fClean.xpGained === 50 + 25 * 1 + 50);
const aided = { ...clean, attempts: 6, hintsUsed: 5, maxHintLevel: 4 };
const fAided = computeFinalization(missionById("first-page")!, aided as any);
ok("heavy hints -> completed, needs practice, no bonus", !fAided.mastered && fAided.needsPractice && fAided.xpGained === 75);
const bossF = computeFinalization(missionById("personal-website")!, { ...clean, missionId: "personal-website" } as any);
ok("boss mastery XP", bossF.mastered && bossF.xpGained === 400);

console.log("== stage 2: starters fail, solutions pass ==");
function liveDocFor(html: string): Document {
  return new JSDOM(html, { url: "http://localhost/" }).window.document as unknown as Document;
}
function cssFails(missionId: string, code: string): string[] {
  const m = missionById(missionId)!;
  return runChecks(code, m.checks, liveDocFor(code))
    .filter((o) => !o.passed)
    .map((o) => o.checkId);
}
function withStyle(missionId: string, css: string): string {
  const m = missionById(missionId)!;
  assert(m.starterCode.includes("/* TODO: write your CSS here */"), `${missionId} starter has TODO`);
  return m.starterCode.replace("/* TODO: write your CSS here */", css);
}

const sel = missionById("css-selectors")!;
ok("selectors starter fails all", cssFails("css-selectors", sel.starterCode).length === 3);
ok(
  "selectors solution passes all",
  cssFails("css-selectors", withStyle("css-selectors", "h1 { color: #fa8072; }\n.card { background: #18222b; padding: 16px; }\n.tag { background: #55e6c1; color: #10161d; }")).length === 0
);

const boxm = missionById("css-box-model")!;
ok("box starter fails all", cssFails("css-box-model", boxm.starterCode).length === 4);
ok(
  "box solution passes all",
  cssFails("css-box-model", withStyle("css-box-model", "* { box-sizing: border-box; }\n.box { padding: 24px; border: 2px solid #55e6c1; margin-bottom: 16px; }")).length === 0
);

const flexm = missionById("css-flexbox")!;
ok("flex starter fails all", cssFails("css-flexbox", flexm.starterCode).length === 4);
ok(
  "flex solution passes all",
  cssFails("css-flexbox", withStyle("css-flexbox", "nav { display: flex; gap: 16px; }\n.cards { display: flex; flex-wrap: wrap; gap: 16px; }")).length === 0
);

const gridm = missionById("css-grid")!;
ok("grid starter fails all", cssFails("css-grid", gridm.starterCode).length === 4);
ok(
  "grid solution passes all",
  cssFails("css-grid", withStyle("css-grid", ".dashboard { display: grid; grid-template-columns: 200px 1fr; gap: 16px; }\n.topbar { grid-column: 1 / -1; }")).length === 0
);

const respm = missionById("css-responsive")!;
ok("responsive starter fails all", cssFails("css-responsive", respm.starterCode).length === 4);
const respSol = respm.starterCode
  .replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />')
  .replace(
    ".details { flex: 1; }",
    ".details { flex: 1; }\n      img { max-width: 100%; height: auto; }\n      @media (max-width: 640px) {\n        .layout { flex-direction: column; }\n      }"
  );
ok("responsive solution passes all", cssFails("css-responsive", respSol).length === 0);

const varm = missionById("css-variables")!;
ok("variables starter fails all", cssFails("css-variables", varm.starterCode).length === 4);
ok(
  "variables solution passes all",
  cssFails("css-variables", withStyle("css-variables", ":root { --accent: #55e6c1; }\n.btn { background: var(--accent); color: #10161d; border-radius: 8px; transition: background 0.2s; }\n.btn:hover { background: #6ff0cf; }")).length === 0
);
ok(
  "misspelled token fails honestly",
  cssFails("css-variables", withStyle("css-variables", ":root { --accnet: #55e6c1; }\n.btn { background: var(--accent); }")).length > 0
);

const dbg = missionById("css-debug")!;
ok("debug starter fails all 4", cssFails("css-debug", dbg.starterCode).length === 4);
const dbgSol = dbg.starterCode
  .replace("nav a { margin-right: 8px; }", "nav { display: flex; gap: 16px; }")
  .replace(".hero img { width: 900px; }", ".hero img { max-width: 100%; height: auto; }")
  .replace("color: #c8d4da;", "color: #10161d;")
  .replace(".content { width: 1200px; margin: 0 auto; }", ".content { max-width: 720px; margin: 0 auto; }");
ok("debug solution passes all", cssFails("css-debug", dbgSol).length === 0);

const boss2 = missionById("css-landing")!;
ok("css boss starter fails almost all", cssFails("css-landing", boss2.starterCode).length >= 10);
const boss2Sol = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Drift Notes — tiny notes</title>
    <style>
      :root { --accent: #55e6c1; }
      body { font-family: system-ui, sans-serif; margin: 0; }
      header nav { display: flex; gap: 16px; padding: 16px; }
      .hero { padding: 48px 16px; }
      .btn { background: var(--accent); color: #10161d; border: 0; border-radius: 8px; padding: 12px 24px; }
      .features { display: flex; gap: 16px; padding: 16px; }
      .features article { flex: 1; border: 1px solid #2a3947; padding: 16px; }
      @media (max-width: 640px) {
        .features { flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <header>
      <nav>
        <a href="index.html">Home</a>
        <a href="features.html">Features</a>
        <a href="https://example.com">Blog</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <h1>Drift Notes</h1>
        <p>Tiny notes, zero friction.</p>
        <button class="btn" type="button">Start writing</button>
      </section>
      <section class="features">
        <article><h2>Fast</h2><p>Opens instantly.</p></article>
        <article><h2>Private</h2><p>Local first.</p></article>
        <article><h2>Simple</h2><p>No accounts.</p></article>
      </section>
    </main>
    <footer><p>© 2026 Drift Notes</p></footer>
  </body>
</html>`;
ok("css boss solution passes all 11", cssFails("css-landing", boss2Sol).length === 0);

console.log("== harness: ops, assertions, protocol ==");
const tdom = new JSDOM(
  `<button id="b" type="button">0</button><input id="i" value="a"/><div id="t">hi</div><ul><li>x</li><li>y</li></ul>`
);
const tdoc = tdom.window.document as unknown as Document;
const twin: any = tdom.window;
let clicks = 0;
tdoc.querySelector("#b")!.addEventListener("click", () => clicks++);
let inputs: string[] = [];
(tdoc.querySelector("#i") as any).addEventListener("input", (e: any) => inputs.push(e.target.value));
twin.add = (a: number, b: number) => a + b;

ok("op click dispatches", runOp(tdoc, twin, { id: "c", act: "click", selector: "#b" }).ok && clicks === 1);
ok("op click missing fails", !runOp(tdoc, twin, { id: "c", act: "click", selector: "#nope" }).ok);
const fillObs = runOp(tdoc, twin, { id: "f", act: "fill", selector: "#i", value: "zz" });
ok("op fill sets value + fires input", fillObs.ok && fillObs.value === "zz" && inputs.includes("zz"));
ok("op call returns value", runOp(tdoc, twin, { id: "k", act: "call", fn: "add", args: [2, 3] }).value === 5);
ok("op call missing fn fails", !runOp(tdoc, twin, { id: "k", act: "call", fn: "nope" }).ok);
ok("op read text", runOp(tdoc, twin, { id: "r", act: "read", selector: "#t", prop: "text" }).value === "hi");
ok("op read count", runOp(tdoc, twin, { id: "r", act: "read", selector: "li", prop: "count" }).value === 2);
ok("op read exists-false", runOp(tdoc, twin, { id: "r", act: "read", selector: "#nope", prop: "exists" }).value === false);
ok("op read missing fails", !runOp(tdoc, twin, { id: "r", act: "read", selector: "#nope", prop: "text" }).ok);

const obsMap = new Map([
  ["a", { id: "a", ok: true, value: "2" }],
  ["b", { id: "b", ok: true, value: "hello world" }],
  ["c", { id: "c", ok: false, error: "x" }],
]);
ok("assert equals", evaluateAssertions(obsMap, [{ op: "a", equals: "2" }]));
ok("assert equals rejects", !evaluateAssertions(obsMap, [{ op: "a", equals: "3" }]));
ok("assert matches", evaluateAssertions(obsMap, [{ op: "b", matches: "^hello" }]));
ok("assert truthy", evaluateAssertions(obsMap, [{ op: "a", truthy: true }, { op: "b", truthy: true }]));
ok("assert failed-op fails", !evaluateAssertions(obsMap, [{ op: "c", truthy: true }]));
ok("assert missing-op fails", !evaluateAssertions(obsMap, [{ op: "zz", truthy: true }]));
ok("assert empty fails closed", !evaluateAssertions(obsMap, []));
ok("assert bad regex fails closed", !evaluateAssertions(obsMap, [{ op: "a", matches: "([" }]));

const drv = buildDriverSource();
ok("driver embeds executor + ns gate", drv.includes(HARNESS_NS) && drv.includes("var RUN_OP = ("));
const injected = injectDriver("<html><body><p>x</p></body></html>");
ok("driver appended after learner code", injected.indexOf("<p>x</p>") < injected.indexOf(HARNESS_NS));
ok("reply validation binds nonce", isHarnessReply({ ns: HARNESS_NS, kind: "obs", nonce: "n1", results: [] }, "n1"));
ok("reply rejects wrong nonce", !isHarnessReply({ ns: HARNESS_NS, kind: "obs", nonce: "n1", results: [] }, "n2"));
ok("reply rejects wrong shape", !isHarnessReply({ ns: "other", kind: "obs", nonce: "n1", results: [] }, "n1"));

// True protocol round-trip: driver runs inside jsdom, parent drives via MessageEvent.
async function drive(html: string, ops: any[], nonce = "t-nonce"): Promise<any[]> {
  const child = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously" });
  const win = child.window as any;
  let captured: any = null;
  const source = { postMessage: (msg: any) => { captured = msg; } };
  const payload = { ns: HARNESS_NS, kind: "run", nonce, ops };
  let ev: any;
  try {
    ev = new win.MessageEvent("message", { data: payload, source });
  } catch {
    ev = win.document.createEvent("Event");
    ev.initEvent("message", false, false);
    ev.data = payload;
  }
  try {
    Object.defineProperty(ev, "source", { value: source });
  } catch {
    /* constructor may already have set it */
  }
  win.dispatchEvent(ev);
  for (let i = 0; i < 60 && !captured; i++) await new Promise((r) => setTimeout(r, 25));
  assert(captured, "driver replied");
  assert(isHarnessReply(captured, nonce), "reply shape + nonce valid");
  return captured.results;
}

console.log("== cloud sync: merge + plan ==");
{
  const iso = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const prog = (missionId: string, over: any = {}) => ({
    ...defaultMissionProgress(missionId, missionById(missionId)!.starterCode),
    missionId,
    ...over,
  });

  const legacy = defaultState();
  const oldDraft = prog("first-page") as any;
  delete oldDraft.reflection;
  legacy.missions["first-page"] = oldDraft;
  const migrated = normalizeReflections(legacy).missions["first-page"].reflection!;
  ok(
    "existing local drafts gain blank reflection fields without losing their code",
    migrated.expected === "" && migrated.observed === "" && migrated.nextChange === "" &&
      legacy.missions["first-page"].code === oldDraft.code
  );

  // Draft payloads must match the server's missionDraftSchema exactly.
  ok(
    "draft keys match the API contract",
    JSON.stringify(Object.keys(draftOf(prog("first-page"))).sort()) ===
      JSON.stringify(
        ["code", "checksPassed", "attempts", "hintsUsed", "maxHintLevel", "questionsAnswered", "questionsCorrect"].sort()
      )
  );

  // Run evidence travels with a completion. The rule the server depends on:
  // a claim without a receipt is never sent as if it were proof.
  const receipt = (sig: string) =>
    ({
      v: 1,
      issuedAt: new Date().toISOString(),
      facts: {
        language: "go",
        command: ["go", "run", "main.go"],
        files: [{ path: "main.go", sha256: "a".repeat(64) }],
        stdout: "Hello, Go\n",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        truncated: false,
        durationMs: 5,
        phase: "run",
        diagnostics: [],
        runner: "docker",
      },
      sig,
    }) as any;
  ok(
    "a claim with no receipt contributes no evidence",
    receiptEvidenceFor([{ checkId: "run-answer", receipt: null }]).length === 0
  );
  ok(
    "claims without receipts are dropped, kept ones survive",
    receiptEvidenceFor([
      { checkId: "a", receipt: null },
      { checkId: "b", receipt: receipt("b".repeat(64)) },
    ]).map((e) => e.checkId).join(",") === "b"
  );
  ok(
    "a later run supersedes an earlier one for the same check",
    (() => {
      const kept = receiptEvidenceFor([
        { checkId: "run-answer", receipt: receipt("1".repeat(64)) },
        { checkId: "run-answer", receipt: receipt("2".repeat(64)) },
      ]);
      return kept.length === 1 && kept[0].receipt.sig === "2".repeat(64);
    })()
  );

  // 1) First sign-in: guest work is kept AND planned for push.
  {
    const local = defaultState();
    local.profile = { ...local.profile, name: "Ada", goal: "websites", completedAt: iso(10) };
    local.diagnostic = {
      completedAt: iso(9),
      results: DIAGNOSTIC_ITEMS.map((d) => ({ itemId: d.id, selected: d.answer, correct: true, skipped: false })),
    };
    local.missions["web-and-browsers"] = prog("web-and-browsers", {
      startedAt: iso(8), completedAt: iso(7), masteredAt: iso(7), independent: true, attempts: 1, xpAwarded: 125,
      checksPassed: ["page-has-title"],
    });
    local.missions["first-page"] = prog("first-page", { startedAt: iso(6), code: "<h1>mine</h1>", attempts: 2, checksPassed: ["one-h1"] });
    local.xp = 125;
    const { merged, plan } = mergeStates(local, defaultState());
    ok("empty server: local profile wins and is planned", plan.profile && merged.profile.name === "Ada");
    ok("local diagnostic planned for push", plan.diagnostic !== null && plan.diagnostic.length === DIAGNOSTIC_ITEMS.length);
    ok(
      "completed + draft planned, untouched excluded",
      plan.missions.length === 2 &&
        plan.missions.some((p) => p.missionId === "web-and-browsers" && p.complete) &&
        plan.missions.some((p) => p.missionId === "first-page" && !p.complete)
    );
    ok("completions ordered before drafts", plan.missions[0].complete === true && plan.missions[1].complete === false);
    const comp = plan.missions.find((p) => p.complete)!;
    ok("completion draft carries evidence", comp.draft.attempts === 1 && comp.draft.checksPassed.length === 1);
    ok("xp recomputed from merged completions", merged.xp === 125);
  }

  // 2) Restore on a fresh device: server adopted, nothing pushed.
  {
    const server = defaultState();
    server.profile = { ...server.profile, name: "Ada", goal: "websites", completedAt: iso(100) };
    server.missions["web-and-browsers"] = prog("web-and-browsers", { startedAt: iso(99), completedAt: iso(98), xpAwarded: 125 });
    server.xp = 125;
    server.activeDays = ["2026-01-01"];
    const { merged, plan } = mergeStates(defaultState(), server);
    ok("restore adopts profile without push", merged.profile.name === "Ada" && !plan.profile);
    ok("restore adopts mission without push", !!merged.missions["web-and-browsers"].completedAt && plan.missions.length === 0);
    ok("restore xp + streaks", merged.xp === 125 && merged.activeDays.includes("2026-01-01"));
    ok("restore does not push diagnostic", plan.diagnostic === null);
  }

  // 3) Server completion beats an uncompleted local draft.
  {
    const local = defaultState();
    local.missions["first-page"] = prog("first-page", { startedAt: iso(5), attempts: 1 });
    const server = defaultState();
    server.missions["first-page"] = prog("first-page", { startedAt: iso(50), completedAt: iso(49), xpAwarded: 125 });
    const { merged, plan } = mergeStates(local, server);
    ok("server completion wins over local draft", !!merged.missions["first-page"].completedAt && plan.missions.length === 0);
  }

  // 4) Two drafts: richer work wins; local wins ties; identical stays quiet.
  {
    const server = defaultState();
    server.missions["first-page"] = prog("first-page", { startedAt: iso(50), attempts: 2, code: "server draft" });
    const localRicher = defaultState();
    localRicher.missions["first-page"] = prog("first-page", { startedAt: iso(5), attempts: 3, code: "local draft" });
    const m1 = mergeStates(localRicher, server);
    ok("richer local draft wins + planned", m1.merged.missions["first-page"].code === "local draft" && m1.plan.missions.length === 1 && !m1.plan.missions[0].complete);
    const localWeaker = defaultState();
    localWeaker.missions["first-page"] = prog("first-page", {
      startedAt: iso(5),
      attempts: 1,
      code: "weaker",
      reflection: { expected: "I thought it would compile", observed: "undefined: fmt", nextChange: "Add the import" },
    });
    const m2 = mergeStates(localWeaker, server);
    ok(
      "richer server draft wins while the local reflection stays beside it",
      m2.merged.missions["first-page"].code === "server draft" &&
        m2.merged.missions["first-page"].reflection?.expected === "I thought it would compile" &&
        m2.plan.missions.length === 0
    );
    const localSame = defaultState();
    localSame.missions["first-page"] = prog("first-page", { startedAt: iso(50), attempts: 1, code: "server draft" });
    ok("identical drafts stay quiet", mergeStates(localSame, server).plan.missions.length === 0);
  }

  // 5) Both completed → server is canonical, no echo push.
  {
    const local = defaultState();
    local.missions["first-page"] = prog("first-page", { startedAt: iso(5), completedAt: iso(4), xpAwarded: 125 });
    const server = defaultState();
    server.missions["first-page"] = prog("first-page", { startedAt: iso(50), completedAt: iso(49), xpAwarded: 125 });
    const { merged, plan } = mergeStates(local, server);
    ok("both completed → server canonical, no push", merged.missions["first-page"].completedAt === server.missions["first-page"].completedAt && plan.missions.length === 0);
  }

  // 6) Diagnostic recency in both directions.
  {
    const results = DIAGNOSTIC_ITEMS.map((d) => ({ itemId: d.id, selected: d.answer, correct: true, skipped: false }));
    const localNewer = defaultState();
    localNewer.diagnostic = { completedAt: iso(1), results };
    const serverOlder = defaultState();
    serverOlder.diagnostic = { completedAt: iso(100), results: [] };
    ok("newer local diagnostic wins + pushed", mergeStates(localNewer, serverOlder).plan.diagnostic !== null);
    const localOlder = defaultState();
    localOlder.diagnostic = { completedAt: iso(100), results: [] };
    const serverNewer = defaultState();
    serverNewer.diagnostic = { completedAt: iso(1), results };
    const m = mergeStates(localOlder, serverNewer);
    ok("newer server diagnostic wins, no push", m.plan.diagnostic === null && m.merged.diagnostic.results.length === results.length);
  }

  // 7) Competency evidence unions; the higher level wins.
  {
    const local = defaultState();
    local.competencies["html-structure"] = { competencyId: "html-structure", level: "practiced", evidence: ["note-a"], updatedAt: iso(10) };
    const server = defaultState();
    server.competencies["html-structure"] = { competencyId: "html-structure", level: "demonstrated", evidence: ["note-a", "note-b"], updatedAt: iso(20) };
    const { merged } = mergeStates(local, server);
    const c = merged.competencies["html-structure"];
    ok("level max wins", c.level === "demonstrated");
    ok("evidence unions without dupes", c.evidence.includes("note-a") && c.evidence.includes("note-b") && c.evidence.filter((e) => e === "note-a").length === 1);
  }

  // 8) Push guardrails.
  {
    ok("untouched starter is not meaningful", !meaningfulWork(prog("first-page")));
    ok("touched draft is meaningful", meaningfulWork(prog("first-page", { startedAt: iso(1) })));
    const current = defaultState();
    current.missions["first-page"] = prog("first-page", { completedAt: iso(1), xpAwarded: 125 });
    const adopted = defaultState();
    adopted.missions["first-page"] = prog("first-page", { startedAt: iso(2) });
    const guarded = protectCompleted(adopted, current);
    ok("adopt never regresses a fresh local completion", guarded.missions["first-page"].completedAt !== null);
    ok("protectCompleted passes through otherwise", protectCompleted(current, current) === current);
  }
}

(async () => {
console.log("== pilot mission end-to-end through the driver ==");
const pilot = missionById("js-counter")!;
ok("pilot is scripted", pilot.needsScript === true);
const scriptedCheck: any = pilot.checks.find((c) => c.rule.kind === "scripted")!;
const scriptedOps = scriptedCheck.rule.ops;
const starterObs = await drive(injectDriver(pilot.starterCode), scriptedOps);
const starterScriptObs = new Map([[ "counter-works", starterObs ]]);
const starterFails = runChecks(pilot.starterCode, pilot.checks, null, starterScriptObs)
  .filter((o) => !o.passed)
  .map((o) => o.checkId);
ok("starter fails handler + interactive (button exists)", starterFails.includes("has-handler") && starterFails.includes("counter-works") && !starterFails.includes("has-button"));
const pilotSol = pilot.starterCode.replace(
  /\/\/ TODO:[^\n]*/,
  "const btn = document.getElementById('inc');\n      const out = document.getElementById('count');\n      btn.addEventListener('click', () => {\n        out.textContent = String(Number(out.textContent) + 1);\n      });"
);
const solObs = await drive(injectDriver(pilotSol), scriptedOps);
const solFails = runChecks(pilotSol, pilot.checks, null, new Map([["counter-works", solObs]]))
  .filter((o) => !o.passed)
  .map((o) => o.checkId);
ok("solution passes all incl. interactive", solFails.length === 0);
ok(
  "scripted fails closed without observations",
  runChecks(pilotSol, pilot.checks, null, null).some((o) => o.checkId === "counter-works" && !o.passed)
);

// Authoring guardrails for scripted content.
for (const m of ALL_MISSIONS) {
  const scripted = m.checks.filter((c) => c.rule.kind === "scripted");
  const opIds = scripted.flatMap((c) => (c.rule.kind === "scripted" ? c.rule.ops.map((o) => o.id) : []));
  ok(`${m.id}: op ids unique`, new Set(opIds).size === opIds.length);
  if (m.needsScript) {
    ok(`${m.id}: scripted mission ships a scripted rule`, scripted.length > 0);
    ok(
      `${m.id}: no computed-style rules (opaque origin)`,
      !m.checks.some((c) => c.rule.kind === "computed-style")
    );
  } else {
    ok(`${m.id}: static mission ships no scripted rules`, scripted.length === 0);
  }
}

console.log("== stage 3: starters fail, solutions pass ==");
// One combined evaluation per mission: every scripted rule driven on a
// FRESH page (isolation), static rules via DOMParser — mirroring how the
// workspace evaluates, minus the shared-run optimization.
async function scriptedFails(missionId: string, code: string): Promise<string[]> {
  const m = missionById(missionId)!;
  const scriptObs = new Map<string, any[]>();
  for (const c of m.checks) {
    if (c.rule.kind !== "scripted") continue;
    scriptObs.set(c.id, await drive(injectDriver(code), c.rule.ops));
  }
  return runChecks(code, m.checks, null, scriptObs)
    .filter((o) => !o.passed)
    .map((o) => o.checkId);
}

{
  const logic = missionById("js-logic")!;
  ok("logic starter fails all 3", (await scriptedFails("js-logic", logic.starterCode)).length === 3);
  const logicSol = logic.starterCode
    .replace(/\/\/ TODO 1:[^\n]*/, "function isAdult(age) { return age >= 18; }")
    .replace(/\/\/ TODO 2:[^\n]*/, "function greet(name) { return 'Hello, ' + name + '!'; }");
  ok("logic solution passes all", (await scriptedFails("js-logic", logicSol)).length === 0);
}
{
  const state = missionById("js-state")!;
  ok("state starter fails all 3", (await scriptedFails("js-state", state.starterCode)).length === 3);
  const stateSol = state.starterCode
    .replace(/\/\/ TODO: add one to count and return the new total[^\n]*/, "count += 1;\n        return count;")
    .replace(/\/\/ TODO: set count back to 0[^\n]*/, "count = 0;\n        return count;");
  ok("state solution passes all", (await scriptedFails("js-state", stateSol)).length === 0);
}
{
  const arr = missionById("js-arrays")!;
  ok("arrays starter fails all 3", (await scriptedFails("js-arrays", arr.starterCode)).length === 3);
  // Match the whole TODO line, not a prefix of it: the sentence after the
  // marker is content and gets reworded, and a prefix match used to leave the
  // tail of the comment behind — uncommented, which is a syntax error rather
  // than a failing test.
  const arrSol = arr.starterCode
    .replace(
      "// TODO 1: doubleAll(nums)",
      "function doubleAll(nums) { return nums.map(function (n) { return n * 2; }); } // done"
    )
    .replace(
      "// TODO 2: totalAbove(nums, limit)",
      "function totalAbove(nums, limit) { return nums.filter(function (n) { return n > limit; }).reduce(function (s, n) { return s + n; }, 0); } // done"
    );
  ok("arrays solution passes all", (await scriptedFails("js-arrays", arrSol)).length === 0);
}
{
  const dom = missionById("js-dom")!;
  const domFails = await scriptedFails("js-dom", dom.starterCode);
  ok(
    "dom starter fails wiring + grows (list exists)",
    domFails.includes("wiring") && domFails.includes("grows") && !domFails.includes("has-list")
  );
  const domSol = dom.starterCode.replace(
    "// TODO: when #add is clicked, append the input value as a new li in #guests",
    "const input = document.getElementById('name');\n      const btn = document.getElementById('add');\n      const list = document.getElementById('guests');\n      btn.addEventListener('click', () => {\n        const li = document.createElement('li');\n        li.textContent = input.value;\n        list.appendChild(li);\n        input.value = '';\n      });"
  );
  ok("dom solution passes all", (await scriptedFails("js-dom", domSol)).length === 0);
}
{
  const forms = missionById("js-forms")!;
  const formsFails = await scriptedFails("js-forms", forms.starterCode);
  ok(
    "forms starter fails wiring + both behaviors (form exists)",
    formsFails.includes("wiring") &&
      formsFails.includes("rejects-bad") &&
      formsFails.includes("accepts-good") &&
      !formsFails.includes("has-form")
  );
  const formsSol = forms.starterCode.replace(
    /\/\/ TODO:[^\n]*/,
    "const form = document.getElementById('signup'); // done\n      const email = document.getElementById('email');\n      const error = document.getElementById('error');\n      const done = document.getElementById('done');\n      form.addEventListener('submit', (e) => {\n        e.preventDefault();\n        if (!email.value.includes('@')) { error.textContent = 'Enter an email with @.'; return; }\n        error.textContent = '';\n        done.textContent = 'Welcome!';\n      }); // done"
  );
  ok("forms solution passes all", (await scriptedFails("js-forms", formsSol)).length === 0);
}
{
  const asy = missionById("js-async")!;
  ok("async starter fails all 3", (await scriptedFails("js-async", asy.starterCode)).length === 3);
  const asySol = asy.starterCode
    .replace(
      /\/\/ TODO 1:[^\n]*/,
      "function loadUser() { // done\n        return new Promise((resolve) => {\n          setTimeout(() => resolve({ name: 'Ada', role: 'admin' }), 200);\n        });\n      } // done"
    )
    .replace(
      /\/\/ TODO 2:[^\n]*/,
      "function failLogin() { // done\n        return new Promise((_, reject) => {\n          setTimeout(() => reject(new Error('timeout')), 100);\n        });\n      } // done"
    );
  ok("async solution passes all", (await scriptedFails("js-async", asySol)).length === 0);
}
{
  const dbg = missionById("js-debug")!;
  const dbgFails = await scriptedFails("js-debug", dbg.starterCode);
  ok(
    "debug starter fails conversion + total (buttons exist)",
    dbgFails.includes("converts") && dbgFails.includes("total-right") && !dbgFails.includes("has-buttons")
  );
  const dbgSol = dbg.starterCode.replace(
    "total = total + btn.dataset.price;",
    "total = total + Number(btn.dataset.price);"
  );
  ok("debug solution passes all", (await scriptedFails("js-debug", dbgSol)).length === 0);
}
{
  const boss = missionById("js-boss")!;
  const bossFails = await scriptedFails("js-boss", boss.starterCode);
  ok(
    "boss starter fails wiring + flow (structure exists)",
    bossFails.includes("boss-wiring") && bossFails.includes("boss-flow") && !bossFails.includes("boss-structure")
  );
  const bossSol = boss.starterCode.replace(
    "// The brief is the instruction. Build it all here.",
    `const input = document.getElementById('task');
      const addBtn = document.getElementById('add');
      const list = document.getElementById('tasks');
      function refresh() {
        const items = Array.from(list.querySelectorAll('li'));
        const open = items.filter((li) => !li.classList.contains('done'));
        document.getElementById('open-count').textContent = open.length + ' open';
      }
      list.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        li.classList.toggle('done');
        refresh();
      });
      addBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        const li = document.createElement('li');
        li.className = 'task';
        li.textContent = text;
        list.appendChild(li);
        input.value = '';
        refresh();
      });
      document.getElementById('show-all').addEventListener('click', () => {
        list.querySelectorAll('li').forEach((li) => { li.style.display = ''; });
      });
      document.getElementById('show-open').addEventListener('click', () => {
        list.querySelectorAll('li').forEach((li) => { li.style.display = li.classList.contains('done') ? 'none' : ''; });
      });
      document.getElementById('show-done').addEventListener('click', () => {
        list.querySelectorAll('li').forEach((li) => { li.style.display = li.classList.contains('done') ? '' : 'none'; });
      });
      refresh();`
  );
  ok("boss solution passes all", (await scriptedFails("js-boss", bossSol)).length === 0);
}

// Harness protocol extensions: promise results + expected failures.
{
  const tdom = new JSDOM(`<div id="t">x</div>`);
  const twin: any = tdom.window;
  twin.asyncAdd = async (a: number, b: number) => a + b;
  twin.asyncFail = async () => {
    throw new Error("boom-timeout");
  };
  const p1: any = await runOp(tdom.window.document as unknown as Document, twin, {
    id: "p",
    act: "call",
    fn: "asyncAdd",
    args: [20, 22],
  });
  ok("op awaits promised results", p1.ok && p1.value === 42);
  const p2: any = await runOp(tdom.window.document as unknown as Document, twin, {
    id: "q",
    act: "call",
    fn: "asyncFail",
    args: [],
  });
  ok("op surfaces rejections", !p2.ok && /boom/.test(p2.error));
  ok(
    "expectError asserts failures",
    evaluateAssertions(new Map([["q", p2]]), [{ op: "q", expectError: "boom" }]) &&
      !evaluateAssertions(new Map([["p", p1]]), [{ op: "p", expectError: "boom" }])
  );
  const waited = await drive(injectDriver("<html><body><p>hi</p></body></html>"), [
    { id: "w", act: "wait", ms: 30 },
    { id: "r", act: "read", selector: "p", prop: "text" },
  ]);
  ok(
    "wait op pauses the chain",
    waited.find((o: any) => o.id === "w")?.value === "waited" &&
      waited.find((o: any) => o.id === "r")?.value === "hi"
  );
}

console.log("== action verbs ==");
ok("verb locked is empty", actionVerb("locked") === "");
ok("verb available", actionVerb("available") === "Start mission");
ok("verb recommended", actionVerb("recommended") === "Continue learning");
ok("verb in-progress", actionVerb("in-progress") === "Resume mission");
ok("verb completed", actionVerb("completed") === "Revisit");
ok("verb mastered", actionVerb("mastered") === "Review");
ok("verb needs-practice", actionVerb("needs-practice") === "Start the drill");
ok("verb optional", actionVerb("optional") === "Start mission");
{
  const v = defaultState();
  // Tracked against shipped missions. The foundations layer is authored now,
  // so these labels could be asserted on it instead; they stay on the web
  // track because the states built below (a completed intro, a gated second
  // mission) live there.
  const m0 = missionById("first-page")!;
  const m1 = missionById("images-and-alt")!;
  const prog = (missionId: string, over: any = {}) => ({
    missionId, code: "", startedAt: null, attempts: 0, checksPassed: [],
    hintsUsed: 0, maxHintLevel: 0, questionsAnswered: {}, questionsCorrect: {},
    completedAt: null, masteredAt: null, independent: false, xpAwarded: 0, ...over,
  });
  // Open the path the honest way: web-and-browsers completed — its own
  // go-errors prerequisite cannot block here because a completed mission's
  // own prerequisites are never re-checked.
  const open = {
    ...v,
    missions: {
      "web-and-browsers": prog("web-and-browsers", {
        startedAt: "2026-01-01",
        completedAt: "2026-01-01",
      }),
    },
  };
  ok("fresh mission verb", missionActionLabel(m0, open, null) === "Start mission");
  ok("gated mission has no verb", missionActionLabel(m1, open, null) === "");
  const withBase = (m1over: any, queue: string[] = []) => ({
    ...v,
    missions: {
      [m0.id]: prog(m0.id, { startedAt: "2026-01-01", completedAt: "2026-01-01" }),
      [m1.id]: prog(m1.id, m1over),
    },
    practiceQueue: queue,
  });
  ok("started mission verb", missionActionLabel(m1, withBase({ startedAt: "2026-01-02" }) as any, null) === "Resume mission");
  ok("completed mission verb", missionActionLabel(m1, withBase({ startedAt: "2026-01-02", completedAt: "2026-01-03" }) as any, null) === "Revisit");
  ok("mastered mission verb", missionActionLabel(m1, withBase({ startedAt: "2026-01-02", completedAt: "2026-01-03", masteredAt: "2026-01-03" }) as any, null) === "Review");
  ok("drill mission verb", missionActionLabel(m1, withBase({ startedAt: "2026-01-02", completedAt: "2026-01-03" }, [m1.id]) as any, null) === "Start the drill");
}

console.log("== source diff ==");
{
  const unchanged = diffLines("alpha\nbeta", "alpha\nbeta");
  ok("an unchanged draft contains context only", unchanged.length === 2 && unchanged.every((r) => r.kind === "context"));
  const changed = diffLines("keep\nold value\nlast", "keep\nnew value\nlast");
  ok("a one-line edit shows removed and added rows with stable line numbers", changed.map((r) => r.kind).join() === "context,removed,added,context" && changed[1].oldLine === 2 && changed[2].newLine === 2);
  const largeBefore = `${"same\n".repeat(1000)}before\nend`;
  const largeAfter = `${"same\n".repeat(1000)}after\nend`;
  const bounded = diffLines(largeBefore, largeAfter);
  ok("large files use the bounded-memory prefix/suffix diff", bounded.some((r) => r.kind === "removed" && r.text === "before") && bounded.some((r) => r.kind === "added" && r.text === "after"));

  // 9.3 the wiring around the pure function: the diff reads the editable
  // file against the live draft, has a desktop entry point and a phone one,
  // names its empty state, and exposes a labelled region — so the
  // browser walkthrough this replaces would have had nothing new to prove
  // except pixels, and pixels are already held by the token guards below.
  const workspaceSrc = readFileSync(new URL("../src/lib/components/Workspace.svelte", import.meta.url), "utf8");
  ok(
    "the diff compares the editable file's starter against the live draft",
    workspaceSrc.includes("diffLines(editableFile?.content") && workspaceSrc.includes('selectPane("diff")')
  );
  ok(
    "with a desktop entry point and an honest empty state",
    workspaceSrc.includes("diff from starter") && workspaceSrc.includes("No changes from the starter yet")
  );
  ok(
    "the changed-lines region is labelled for assistive technology",
    workspaceSrc.includes('aria-label="Added and removed source lines"')
  );
  ok(
    "and the diff is reachable from the phone tab bar, not desktop-only",
    workspaceSrc.includes('"instructions", "code", "preview", "diff", "tests"')
  );
}

console.log("== run assertions (real execution) ==");
{
  // A complete, successful run — the shape the platform runner returns.
  const ran = (over: Partial<RunOutcome> = {}): RunOutcome => ({
    ran: true,
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    diagnostics: [],
    phase: "run",
    durationMs: 12,
    ...over,
  });
  const diag = (kind: "compile" | "runtime", message: string): RunDiagnostic => ({
    kind,
    file: "main.go",
    line: 4,
    column: 2,
    message,
  });

  ok("stdout equals passes on exact output", evaluateRunAssertions(ran({ stdout: "42\n" }), [{ target: "stdout", equals: "42" }]));
  ok("stdout equals trims surrounding whitespace only", evaluateRunAssertions(ran({ stdout: " 42 " }), [{ target: "stdout", equals: "42" }]));
  ok(
    "stdout equals fails on a near miss (the actual teaching case)",
    !evaluateRunAssertions(ran({ stdout: "42 items\n" }), [{ target: "stdout", equals: "42" }])
  );
  ok("stdout matches is case-insensitive", evaluateRunAssertions(ran({ stdout: "Hello, Go" }), [{ target: "stdout", matches: "hello, go" }]));
  ok("stdout with no assertion means “printed something”", evaluateRunAssertions(ran({ stdout: "x" }), [{ target: "stdout" }]));
  ok("empty stdout fails a bare stdout assertion", !evaluateRunAssertions(ran({ stdout: "  \n" }), [{ target: "stdout" }]));
  ok("exitCode defaults to zero", evaluateRunAssertions(ran({ exitCode: 0 }), [{ target: "exitCode" }]));
  ok("exitCode can require a non-zero status", evaluateRunAssertions(ran({ exitCode: 2 }), [{ target: "exitCode", code: 2 }]));
  ok("a non-zero exit fails a zero expectation", !evaluateRunAssertions(ran({ exitCode: 2 }), [{ target: "exitCode" }]));
  ok("not inverts a match", evaluateRunAssertions(ran({ stderr: "" }), [{ target: "stderr", matches: "panic", not: true }]));
  ok("not inverts equality", !evaluateRunAssertions(ran({ stdout: "55" }), [{ target: "stdout", equals: "55", not: true }]));
  ok(
    "diagnostics can be required by kind",
    evaluateRunAssertions(
      ran({ exitCode: 1, phase: "compile", diagnostics: [diag("compile", "undefined: fmt")] }),
      [{ target: "diagnostics", kind: "compile", matches: "undefined" }]
    )
  );
  ok(
    "a compile diagnostic does not satisfy a runtime requirement",
    !evaluateRunAssertions(
      ran({ exitCode: 1, phase: "compile", diagnostics: [diag("compile", "undefined: fmt")] }),
      [{ target: "diagnostics", kind: "runtime" }]
    )
  );
  ok(
    "phase is assertable on its own",
    evaluateRunAssertions(ran({ exitCode: 1, phase: "compile", diagnostics: [diag("compile", "x")] }), [{ target: "diagnostics", phase: "compile" }])
  );
  ok(
    "a clean run satisfies “no diagnostics”",
    evaluateRunAssertions(ran(), [{ target: "diagnostics", not: true }])
  );
  ok("assertions are required — an empty list never passes", !evaluateRunAssertions(ran({ stdout: "anything" }), []));
  ok(
    "a malformed pattern fails rather than throwing",
    !evaluateRunAssertions(ran({ stdout: "42" }), [{ target: "stdout", matches: "([unclosed" }])
  );
}

console.log("== a run check never passes without a run ==");
{
  const goMission = missionById("go-first-program");
  if (!goMission) {
    // Content-gated: activates the moment the mission ships (same rule as
    // stage previews — unshipped content skips, never fails).
    console.log("-- skipped: go-first-program not authored yet");
  } else {
  const checks = goMission.checks;
  ok("the mission ships exactly one execution check", checks.length === 1 && checks[0].rule.kind === "runs");
  // The engine's fail-closed contract, end to end through runChecks.
  ok("no run: the check fails", runChecks(goMission.starterCode, checks, null, null, null)[0].passed === false);
  ok(
    "a run that did not happen: the check fails",
    runChecks(
      goMission.starterCode,
      checks,
      null,
      null,
      new Map([["run-answer", { ran: false, stdout: "", stderr: "", exitCode: null, timedOut: false, diagnostics: [], phase: null, durationMs: null, error: "no runner" } as RunOutcome]])
    )[0].passed === false
  );
  ok(
    "the starter's own output fails the check",
    runChecks(
      goMission.starterCode,
      checks,
      null,
      null,
      new Map([["run-answer", { ran: true, stdout: "TODO\n", stderr: "", exitCode: 0, timedOut: false, diagnostics: [], phase: "run", durationMs: 5 } as RunOutcome]])
    )[0].passed === false
  );
  ok(
    "a correct run passes the check",
    runChecks(
      goMission.starterCode,
      checks,
      null,
      null,
      new Map([["run-answer", { ran: true, stdout: "Hello, Go\n", stderr: "", exitCode: 0, timedOut: false, diagnostics: [], phase: "run", durationMs: 5 } as RunOutcome]])
    )[0].passed === true
  );
  }
}

console.log("== execution router: where does this work run? ==");
{
  const both = { serverConfigured: true, browserCapable: true };
  const browserOnly = { serverConfigured: false, browserCapable: true };
  const serverOnly = { serverConfigured: true, browserCapable: false };
  const neither = { serverConfigured: false, browserCapable: false };

  const doc = { kind: "document" as const, language: "go" as const, trustedGrading: false, needsOsFeatures: false };
  const script = { kind: "page-script" as const, language: "go" as const, trustedGrading: false, needsOsFeatures: false };
  const compiled = { kind: "executable" as const, language: "go" as const, trustedGrading: false, needsOsFeatures: false };
  const tests = { kind: "executable" as const, language: "node" as const, trustedGrading: false, needsOsFeatures: false };
  const trusted = { kind: "page-script" as const, language: "go" as const, trustedGrading: true, needsOsFeatures: false };
  const osNeeded = { kind: "document" as const, language: "go" as const, trustedGrading: false, needsOsFeatures: true };

  // The default is the browser: no per-attempt compute cost, works offline.
  ok("a document runs in the browser by default", chooseRuntime(doc, both).runtime === "browser");
  ok("page behaviour runs in the browser by default", chooseRuntime(script, both).runtime === "browser");
  ok("the browser decision is available", chooseRuntime(doc, both).available === true);
  ok("the browser decision explains itself", chooseRuntime(doc, both).reason.includes("browser"));

  // A compiled program never runs in a tab, whoever is available.
  ok("Go routes to the server even with everything available", chooseRuntime(compiled, both).runtime === "server");
  ok("Go on a browser-only deployment is unavailable, not faked", (() => {
    const d = chooseRuntime(compiled, browserOnly);
    return d.runtime === "server" && d.available === false && d.fallback === null;
  })());
  ok("Go says why it cannot run locally", chooseRuntime(compiled, browserOnly).reason.includes("compiler"));
  ok("Go names the sandbox when it can run", chooseRuntime(compiled, both).reason.includes("sandbox"));

  // A scenario's test suite also runs on the server, and for its own reason:
  // the machine that decides must not be the one the learner controls.
  ok("a test suite routes to the server", chooseRuntime(tests, both).runtime === "server");
  ok("a test suite says why it cannot run locally", chooseRuntime(tests, browserOnly).reason.includes("tests"));
  ok(
    "a scenario never claims the browser graded it",
    chooseRuntime(tests, browserOnly).available === false && chooseRuntime(tests, both).available === true
  );

  // OS features are a hard boundary.
  ok("a task needing OS features routes to the server", chooseRuntime(osNeeded, both).runtime === "server");
  ok("and is reported unavailable with no server", chooseRuntime(osNeeded, browserOnly).available === false);

  // Trusted grading prefers the server, but never blocks the learner entirely.
  ok("trusted grading prefers the server", chooseRuntime(trusted, both).runtime === "server");
  ok(
    "trusted grading without a server falls back to the browser and says so",
    (() => {
      const d = chooseRuntime(trusted, browserOnly);
      return d.runtime === "browser" && d.reason.includes("self-assessed");
    })()
  );
  ok(
    "a server with no browser capability is used instead of failing",
    chooseRuntime(doc, serverOnly).runtime === "server" && chooseRuntime(doc, serverOnly).available
  );
  ok("nothing available: the decision is honest about it", chooseRuntime(doc, neither).available === false);
  ok(
    "every decision carries a readable reason",
    [doc, script, compiled, trusted, osNeeded].every((need) =>
      [both, browserOnly, serverOnly, neither].every((env) => chooseRuntime(need, env).reason.length > 20)
    )
  );

  // The need is derived from the mission, never re-decided by a component.
  // Go assertions activate with the Go content (same skip rule as above).
  const goMission = missionById("go-first-program");
  if (!goMission) {
    console.log("-- skipped: go execution routing needs go-first-program");
  } else {
    ok("a Go mission needs an executable runtime", needForMission(goMission).kind === "executable");
    ok("and names Go as the language that runs", needForMission(goMission).language === "go");
  }
  const webMission = missionById("js-counter")!;
  const docMission = missionById("first-page")!;
  ok("a scripted web mission needs a page runtime", needForMission(webMission).kind === "page-script");
  ok("a static web mission needs only a document", needForMission(docMission).kind === "document");
  ok(
    "every Go mission routes to the server",
    ALL_MISSIONS.filter((m) => m.language === "go").every(
      (m) => chooseRuntime(needForMission(m), both).runtime === "server"
    )
  );
  // Documents and page behaviour stay in the browser. Only missions that
  // actually execute something (Go programs, a scenario's test suite) leave it.
  ok(
    "no document or page mission routes off the browser",
    ALL_MISSIONS.filter((m) => m.language !== "go" && m.language !== "node").every(
      (m) => chooseRuntime(needForMission(m), both).runtime === "browser"
    )
  );
  ok(
    "a scenario's test suite is graded on the server",
    ALL_MISSIONS.filter((m) => m.language === "node").every(
      (m) => chooseRuntime(needForMission(m), both).runtime === "server"
    )
  );
  ok(
    "provider labels are readable",
    providerLabel("subprocess") === "local sandbox" &&
      providerLabel("docker") === "sandboxed containers" &&
      providerLabel("an-unnameable-runner") === "an-unnameable-runner" &&
      providerLabel(null) === null
  );
}

console.log("== go missions execute the learner's own program ==");
{
  // The language and algorithms layers only. The application layers' Go missions
  // are proven the same way, in their own pass further down.
  const isFoundationsLayer = (m: (typeof ALL_MISSIONS)[number]) => {
    const layer = stageById(m.stageId)?.layerId;
    return layer === "language" || layer === "dsa";
  };
  const goMissions = ALL_MISSIONS.filter((m) => m.language === "go" && isFoundationsLayer(m));
  if (goMissions.length === 0) {
    console.log("-- skipped: no Go missions authored yet");
  } else {
  ok("fifteen missions in the language and algorithms layers run Go", goMissions.length === 15);
  for (const m of goMissions) {
    ok(`${m.id}: names its real file`, m.fileName === "main.go");
    ok(`${m.id}: is a practice, not a reading`, m.type === "practice");
    ok(`${m.id}: ships starter code to edit`, m.starterCode.length > 60);
    ok(`${m.id}: the starter compiles as a program`, m.starterCode.startsWith("package main"));
    const runs = m.checks.filter((c) => c.rule.kind === "runs");
    ok(`${m.id}: has an execution check`, runs.length >= 1);
    for (const c of runs) {
      if (c.rule.kind !== "runs") continue;
      ok(`${m.id}/${c.id}: targets go`, c.rule.language === "go");
      ok(`${m.id}/${c.id}: asserts something`, c.rule.assertions.length > 0);
      ok(
        `${m.id}/${c.id}: requires a clean exit or an explicit status`,
        c.rule.assertions.some((a) => a.target === "exitCode")
      );
      // The answer must not already be sitting in the starter: a check the
      // learner passes without doing the work teaches nothing.
      for (const a of c.rule.assertions) {
        if (a.target === "stdout" && a.equals) {
          ok(
            `${m.id}/${c.id}: the starter does not already print the answer`,
            !m.starterCode.includes(a.equals)
          );
        }
      }
    }
    // The task must tell the learner what to do, now that doing is required.
    const task = m.lesson.find((b) => b.kind === "task");
    ok(`${m.id}: the task block describes the work`, !!task && task.body.length > 80);
  }
  } // end: Go content present
  const runnableGoIds = ["go-structs", "go-methods", "go-interfaces", "go-packages", "go-binary-search", "go-insertion-sort", "go-recursive-sum", "go-cost-instinct"];
  const goVersion = spawnSync("go", ["version"], { encoding: "utf8", timeout: 10_000 });
  if (goVersion.status !== 0) {
    console.log("-- skipped: Go toolchain unavailable; CI installs Go for this fixture pass");
  } else {
    const solutions: Record<string, string> = {
      "go-structs": `package main

import "fmt"

type Task struct {
	title string
	done  bool
}

func taskLabel(task Task) string {
	if task.done {
		return "✓ " + task.title
	}
	return task.title
}

func main() {
	open := Task{title: "Write the brief", done: false}
	finished := Task{title: "Write the brief", done: true}
	fmt.Println(taskLabel(open))
	fmt.Println(taskLabel(finished))
}
`,
      "go-methods": `package main

import "fmt"

type ScoreCard struct {
	name   string
	points int
}

func (card ScoreCard) summary() string {
	return fmt.Sprintf("%s: %d points", card.name, card.points)
}

func main() {
	cards := []ScoreCard{{name: "Mina", points: 12}, {name: "Ivo", points: 7}}
	for _, card := range cards {
		fmt.Println(card.summary())
	}
}
`,
      "go-interfaces": `package main

import "fmt"

type Labeler interface { label() string }

type Task struct { title string; done bool }
func (task Task) label() string {
	if task.done { return "✓ " + task.title }
	return task.title
}

type Notice struct { message string }
func (notice Notice) label() string { return notice.message }

func printLabel(item Labeler) { fmt.Println(item.label()) }

func main() {
	printLabel(Task{title: "Write the brief", done: true})
	printLabel(Notice{message: "Build passed"})
}
`,
      "go-packages": `package main

import (
	"fmt"
	"strings"
)

func cleanName(value string) string {
	return strings.TrimSpace(value)
}

func main() {
	for _, name := range []string{"  Mina  ", "Ivo  "} {
		fmt.Println(cleanName(name))
	}
}
`,
      "go-binary-search": `package main

import "fmt"

func search(values []int, target int) int {
	low, high := 0, len(values)
	for low < high {
		mid := low + (high-low)/2
		if values[mid] == target { return mid }
		if values[mid] < target { low = mid + 1 } else { high = mid }
	}
	return -1
}

func main() {
	values := []int{3, 7, 12, 18, 23, 31, 44}
	fmt.Println("found", search(values, 23), "missing", search(values, 8))
}
`,
      "go-insertion-sort": `package main

import "fmt"

func insertionSort(values []int) {
	for i := 1; i < len(values); i++ {
		key := values[i]
		j := i - 1
		for j >= 0 && values[j] > key {
			values[j+1] = values[j]
			j--
		}
		values[j+1] = key
	}
}

func main() {
	values := []int{8, 3, 5, 3, -1}
	insertionSort(values)
	fmt.Println(values)
}
`,
      "go-recursive-sum": `package main

import "fmt"

func sum(values []int) int {
	if len(values) == 0 { return 0 }
	return values[0] + sum(values[1:])
}

func main() {
	values := []int{4, 6, 5}
	fmt.Println("sum", sum(values), "empty", sum([]int{}))
}
`,
      "go-cost-instinct": `package main

import "fmt"

func countWork(n int) (linear, pairs int) {
	for i := 0; i < n; i++ { linear++ }
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ { pairs++ }
	}
	return linear, pairs
}

func main() {
	for _, n := range []int{2, 4} {
		linear, pairs := countWork(n)
		fmt.Printf("n=%d linear=%d pairs=%d\\n", n, linear, pairs)
	}
}
`,
    };
    const dir = mkdtempSync(join(tmpdir(), "nexora-dsa-go-"));
    try {
      for (const id of runnableGoIds) {
        const mission = missionById(id)!;
        const check = mission.checks.find((candidate) => candidate.rule.kind === "runs");
        if (!check || check.rule.kind !== "runs") continue;
        const run = (source: string) => {
          writeFileSync(join(dir, "main.go"), source, "utf8");
          return spawnSync("go", ["run", "main.go"], {
            cwd: dir,
            encoding: "utf8",
            timeout: 30_000,
            env: { ...process.env, GOTOOLCHAIN: "local" },
          });
        };
        const starter = run(mission.starterCode);
        ok(`${id}: starter compiles and runs`, starter.status === 0, starter.stderr);
        const toOutcome = (result: typeof starter): RunOutcome => ({
          ran: result.status !== null,
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
          exitCode: result.status,
          timedOut: result.error?.name === "TimeoutError",
          diagnostics: [],
          phase: "run",
          durationMs: 0,
        });
        ok(
          `${id}: starter output fails its own run check`,
          !evaluateRunAssertions(toOutcome(starter), check.rule.assertions)
        );
        const solved = run(solutions[id]!);
        ok(`${id}: solution compiles and runs`, solved.status === 0, solved.stderr);
        ok(
          `${id}: solution output passes its run check`,
          evaluateRunAssertions(toOutcome(solved), check.rule.assertions)
        );
        if (["go-structs", "go-methods", "go-interfaces", "go-packages"].includes(id)) {
          const examples = mission.lesson.filter((block) => block.kind === "example" && block.code);
          ok(`${id}: has a complete runnable lesson example`, examples.length > 0);
          examples.forEach((example, index) => {
            const compiled = run(example.code!);
            ok(`${id}: example ${index + 1} compiles and runs`, compiled.status === 0, compiled.stderr);
          });
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const stillReading = ALL_MISSIONS.filter(
    (m) => m.language !== "go" && m.language !== "node" && m.checks.some((c) => c.rule.kind === "runs")
  );
  ok("no document or page mission claims to run code", stillReading.length === 0);
}

console.log("== a scenario: the broken state, the fixture, and the real suite ==");
{
  const scenario = missionById("git-resolve-conflict");
  ok("the scenario mission exists", !!scenario);
  ok("it belongs to the tools and Git stage", scenario?.stageId === "git");
  ok(
    "and that stage lists it",
    stageById("git")?.missionIds.includes("git-resolve-conflict") === true
  );
  ok("it is the file a developer would open", scenario?.fileName === "src/task.js");
  ok("its source is editable and its test suite is visible read-only", scenario?.files?.length === 2 && scenario.files.filter((f) => f.editable).length === 1 && scenario.files.some((f) => f.path === "verify-merge.js" && !f.editable && f.content === (scenario.checks[0].rule.kind === "runs" ? scenario.checks[0].rule.harness?.[0]?.content : undefined)));
  ok("it runs JavaScript on the runner", scenario?.language === "node");
  ok("it is a debugging mission, not a reading", scenario?.type === "debugging");
  ok("it grants the Git competency", scenario?.competencyIds.join() === "git-workflow");
  ok("that competency is real", COMPETENCIES.some((c) => c.id === "git-workflow"));
  ok("it has an unmet prerequisite to check", (scenario?.prereqIds.length ?? 0) >= 1);

  // The starter must be the state Git actually leaves behind, not a description.
  const markers = ["<<<<<<<", "=======", ">>>>>>>"];
  ok("the starter is a broken state, not a blank file", scenario!.starterCode.length > 120);
  ok(
    "the starter carries all three conflict markers",
    markers.every((m) => scenario!.starterCode.includes(m))
  );
  ok(
    "both sides of the conflict are real code",
    scenario!.starterCode.includes('return "Task: " + task.title;') &&
      scenario!.starterCode.includes("task.done ?")
  );
  ok("it exports what the suite imports", scenario!.starterCode.includes("module.exports"));

  // Hints must escalate, and never hand over the resolved function first.
  ok("the hint ladder has five levels", scenario!.hintLadder.length === 5);
  ok("every hint says something", scenario!.hintLadder.every((h) => h.length > 30));
  ok("the first hint is a nudge, not the answer", !scenario!.hintLadder[0].includes("? "));
  ok("the misconceptions are specific", scenario!.misconceptions.length >= 3);
  ok(
    "the questions check understanding, with a valid answer",
    (scenario!.questions?.length ?? 0) >= 2 &&
      scenario!.questions!.every((q) => q.answer >= 0 && q.answer < q.options.length && q.explanation.length > 40)
  );
  ok("it says what completion and mastery mean", scenario!.completionNote.length > 40 && scenario!.masteryNote.length > 40);

  // The check: an execution check whose entry is the fixture, never the learner's file.
  const runCheck = scenario!.checks[0];
  ok("it has exactly one execution check", scenario!.checks.length === 1 && runCheck.rule.kind === "runs");
  const rule = runCheck.rule.kind === "runs" ? runCheck.rule : null;
  ok("the check runs node", rule?.language === "node");
  ok("the entry is the fixture, not the learner's file", rule?.entry === "verify-merge.js" && rule.entry !== scenario!.fileName);
  ok("the fixture ships with the check", (rule?.harness?.length ?? 0) === 1 && rule!.harness![0].path === rule!.entry);
  ok(
    "the check requires a clean exit and both facts",
    rule!.assertions.some((a) => a.target === "exitCode" && a.code === 0) &&
      rule!.assertions.some((a) => a.matches === "ALL TESTS PASSED") &&
      rule!.assertions.some((a) => a.matches === "NO CONFLICT MARKERS")
  );
  ok("the feedback explains the failure without giving the answer", runCheck.feedback.length > 80);

  // The learner can read the suite that judges them: the lesson shows the exact
  // bytes the runner supplies. If these ever diverge, the mission is lying.
  const fixture = rule!.harness![0].content;
  const shown = scenario!.lesson.find((b) => b.kind === "example" && (b.code ?? "").includes("ALL TESTS PASSED"));
  ok("the lesson shows the suite that will actually run", shown !== undefined);
  ok("and shows it unchanged", shown?.code === fixture);

  // Now the part that matters: run the suite for real, the way the runner will.
  // Broken state -> it must fail and say why. Resolution -> it must pass.
  const dir = mkdtempSync(join(tmpdir(), "nexora-scenario-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, rule!.entry!), fixture, "utf8");

    const runSuite = (source: string) => {
      writeFileSync(join(dir, scenario!.fileName!), source, "utf8");
      return spawnSync(process.execPath, [rule!.entry!], { cwd: dir, encoding: "utf8", timeout: 30_000 });
    };

    const broken = runSuite(scenario!.starterCode);
    ok("the starter fails the suite", broken.status !== 0);
    ok("and the failure names the leftover markers", broken.stdout.includes("CONFLICT MARKERS STILL PRESENT"));
    ok("so the check cannot pass on the broken state", !broken.stdout.includes("ALL TESTS PASSED"));

    // A resolution a learner would actually write: both intentions, once.
    const resolved = `function renderTask(task) {
  const label = "Task: " + task.title;
  return task.done ? "✓ " + label : label;
}

module.exports = { renderTask };
`;
    const fixed = runSuite(resolved);
    ok("the resolution passes the suite", fixed.status === 0, fixed.stdout + fixed.stderr);
    ok("with both behaviours exercised", fixed.stdout.includes("ok   a task keeps its descriptive label") && fixed.stdout.includes("ok   a finished task is marked"));
    ok("and no markers left", fixed.stdout.includes("NO CONFLICT MARKERS"));

    // Half a resolution — the tempting wrong answer — must fail, and only
    // because the behaviour was discarded, not because of syntax.
    const oneSided = `function renderTask(task) {
  return "Task: " + task.title;
}

module.exports = { renderTask };
`;
    const half = runSuite(oneSided);
    ok("keeping one side fails the suite", half.status !== 0);
    // A one-sided resolution is a *lost behaviour*, and the suite must say so
    // rather than complain about syntax ("NO CONFLICT MARKERS" is a pass line,
    // so the marker check is the "STILL PRESENT" wording, not the substring).
    ok("and the failure is a lost behaviour, not a syntax error", !half.stdout.includes("STILL PRESENT") && half.stdout.includes("FAIL"));

    // The check itself, evaluated against the real outcome: the verdict the
    // app would record, produced by the same code path the workspace uses.
    const outcome: RunOutcome = {
      ran: true,
      stdout: fixed.stdout,
      stderr: fixed.stderr,
      exitCode: fixed.status,
      timedOut: false,
      diagnostics: [],
      phase: "run",
      durationMs: 0,
    };
    ok("the check passes a real resolution", evaluateRunAssertions(outcome, rule!.assertions));
    const halfOutcome: RunOutcome = { ...outcome, stdout: half.stdout, exitCode: half.status };
    ok("and fails a one-sided resolution", !evaluateRunAssertions(halfOutcome, rule!.assertions));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("== scenario: repair the function the supplied tests catch ==");
{
  const scenario = missionById("scenario-duration-format")!;
  const stage = stageById("git");
  const rule = scenario.checks[0].rule;
  ok("the duration repair is registered in Stage 9", scenario.stageId === "git" && stage?.missionIds.includes(scenario.id) === true);
  ok("the learner edits one named source file", scenario.fileName === "src/duration.js" && scenario.language === "node");
  ok("the workspace lists its editable source and read-only suite", scenario.files?.length === 2 && scenario.files.filter((f) => f.editable).length === 1 && scenario.files.some((f) => f.path === "verify-duration.js" && !f.editable && f.content === (rule.kind === "runs" ? rule.harness?.[0]?.content : undefined)));
  ok("the supplied suite is the execution entry, not learner code", rule.kind === "runs" && rule.entry === "verify-duration.js");
  ok("feedback directs the learner to the named failing case without giving the patch", scenario.checks[0].feedback.includes("first `FAIL` line") && !scenario.checks[0].feedback.includes("padStart"));
  ok("the assessment fixture is shown exactly in the lesson", scenario.lesson.some((b) => b.code === (rule.kind === "runs" ? rule.harness?.[0]?.content : undefined)));

  const fixture = rule.kind === "runs" ? rule.harness![0].content : "";
  const dir = mkdtempSync(join(tmpdir(), "nexora-duration-scenario-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "verify-duration.js"), fixture, "utf8");
    const runSuite = (source: string) => {
      writeFileSync(join(dir, scenario.fileName!), source, "utf8");
      return spawnSync(process.execPath, ["verify-duration.js"], { cwd: dir, encoding: "utf8", timeout: 30_000 });
    };
    const broken = runSuite(scenario.starterCode);
    ok("the starter really fails its suite", broken.status !== 0);
    ok("the failure explains the input, expected and actual values", broken.stdout.includes("FAIL zero seconds uses two digits") && broken.stdout.includes('expected: "0:00"') && broken.stdout.includes('actual:   "0:0"'));
    ok("the broken starter cannot claim the pass line", !broken.stdout.includes("ALL TESTS PASSED"));

    const repaired = `function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}

module.exports = { formatDuration };
`;
    const fixed = runSuite(repaired);
    ok("the repaired function passes every named case", fixed.status === 0 && fixed.stdout.includes("ALL TESTS PASSED"), fixed.stdout + fixed.stderr);
    const outcome: RunOutcome = {
      ran: true,
      stdout: fixed.stdout,
      stderr: fixed.stderr,
      exitCode: fixed.status,
      timedOut: false,
      diagnostics: [],
      phase: "run",
      durationMs: 0,
    };
    ok("the app's deterministic run assertions accept the real passing outcome", rule.kind === "runs" && evaluateRunAssertions(outcome, rule.assertions));
    const failedOutcome: RunOutcome = { ...outcome, stdout: broken.stdout, exitCode: broken.status };
    ok("and the same assertions reject the real broken outcome", rule.kind === "runs" && !evaluateRunAssertions(failedOutcome, rule.assertions));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("== scenario: find a bug report's missing condition ==");
{
  const scenario = missionById("scenario-new-workspace-crash")!;
  const rule = scenario.checks[0].rule;
  ok("the crash report is registered in Stage 9", scenario.stageId === "git" && stageById("git")?.missionIds.includes(scenario.id) === true);
  ok("the brief reports observations without stating the trigger", scenario.lesson[0].body.includes("brand-new workspace") && !/empty array|zero tasks|no tasks/i.test(scenario.lesson[0].body));
  ok("the learner edits one named JavaScript function", scenario.fileName === "src/dashboard.js" && scenario.starterCode.includes("tasks[0].title"));
  ok("the dashboard suite is a visible read-only workspace file", scenario.files?.length === 2 && scenario.files.filter((f) => f.editable).length === 1 && scenario.files.some((f) => f.path === "verify-dashboard.js" && !f.editable && f.content === (rule.kind === "runs" ? rule.harness?.[0]?.content : undefined)));
  ok("the supplied fixture is the runner entry and is shown unchanged", rule.kind === "runs" && rule.entry === "verify-dashboard.js" && scenario.lesson.some((b) => b.code === (rule.kind === "runs" ? rule.harness?.[0]?.content : undefined)));
  const workspaceSource = readFileSync(new URL("../src/lib/components/Workspace.svelte", import.meta.url), "utf8");
  ok("reset tells the learner it replaces their current draft with the mission starter", workspaceSource.includes("Your current draft will be replaced with the mission starter.") && workspaceSource.includes("Replace draft"));

  const fixture = rule.kind === "runs" ? rule.harness![0].content : "";
  const dir = mkdtempSync(join(tmpdir(), "nexora-dashboard-scenario-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "verify-dashboard.js"), fixture, "utf8");
    const runSuite = (source: string) => {
      writeFileSync(join(dir, scenario.fileName!), source, "utf8");
      return spawnSync(process.execPath, ["verify-dashboard.js"], { cwd: dir, encoding: "utf8", timeout: 30_000 });
    };

    const broken = runSuite(scenario.starterCode);
    ok("the starter reproduces the dashboard crash", broken.status !== 0);
    ok("the failing case names the task count and thrown error", broken.stdout.includes("FAIL workspace just created") && broken.stdout.includes("task count: 0") && broken.stdout.includes('actual:     "THREW TypeError"'));
    ok("the working project cases still run beside the failure", broken.stdout.includes("ok   saved sample workspace") && broken.stdout.includes("ok   workspace with several tasks"));

    const repaired = `function dashboardTitle(tasks) {
  if (tasks.length === 0) return "No tasks yet";
  return "First: " + tasks[0].title;
}

module.exports = { dashboardTitle };
`;
    const fixed = runSuite(repaired);
    ok("the minimal boundary repair passes the full suite", fixed.status === 0 && fixed.stdout.includes("ALL TESTS PASSED"), fixed.stdout + fixed.stderr);
    const outcome: RunOutcome = {
      ran: true,
      stdout: fixed.stdout,
      stderr: fixed.stderr,
      exitCode: fixed.status,
      timedOut: false,
      diagnostics: [],
      phase: "run",
      durationMs: 0,
    };
    ok("the check accepts the repaired workspace and existing-project behaviour", rule.kind === "runs" && evaluateRunAssertions(outcome, rule.assertions));
    const failedOutcome: RunOutcome = { ...outcome, stdout: broken.stdout, exitCode: broken.status };
    ok("the check rejects the reproducible crash", rule.kind === "runs" && !evaluateRunAssertions(failedOutcome, rule.assertions));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n== the practice log: what beat you, and what you do about it ==");
{
  // Fixed instants, so an ordering assertion cannot depend on when the suite ran.
  const at = (day: number): string => new Date(Date.UTC(2026, 0, day, 12)).toISOString();
  const older = new Date(Date.UTC(2025, 11, 1, 12)).toISOString();
  const host = ALL_MISSIONS.find((m) => m.checks.length >= 2)!;
  const other = ALL_MISSIONS.find((m) => m.stageId !== host.stageId)!;
  const c0 = host.checks[0].id;
  const c1 = host.checks[1].id;
  const miss = (checkId: string, label = checkId) => ({
    checkId,
    label,
    message: `the engine's reading of ${checkId}`,
  });
  const rec = (missionId: string, checkId: string, over: Partial<Mistake> = {}): Mistake => ({
    id: mistakeId(missionId, checkId),
    missionId,
    checkId,
    label: checkId,
    message: "",
    code: "",
    firstFailedAt: at(1),
    lastFailedAt: at(1),
    failures: 1,
    resolvedAt: null,
    resolvedCode: null,
    ...over,
  });

  // 4.1 the record itself: a failure is kept with the code and the engine's words.
  const first = observe(emptyPractice(), {
    missionId: host.id,
    code: "console.log(1)",
    at: at(1),
    failed: [miss(c0, "requirement one")],
    passed: [],
  });
  ok(
    "a turned-back requirement is written down, keyed by mission and check",
    first.mistakes.length === 1 && first.mistakes[0].id === mistakeId(host.id, c0)
  );
  ok(
    "with the learner's code at the time and the engine's own reason",
    first.mistakes[0].code === "console.log(1)" && first.mistakes[0].message.includes(c0)
  );
  ok(
    "and it starts open, counted once",
    first.mistakes[0].resolvedAt === null && first.mistakes[0].failures === 1
  );

  const twice = observe(first, {
    missionId: host.id,
    code: "console.log(2)",
    at: at(2),
    failed: [miss(c0)],
    passed: [],
  });
  ok(
    "a second failure updates one record and counts it again",
    twice.mistakes.length === 1 && twice.mistakes[0].failures === 2
  );
  ok(
    "keeping the first time it happened and the latest",
    twice.mistakes[0].firstFailedAt === at(1) && twice.mistakes[0].lastFailedAt === at(2)
  );

  const cleared = observe(twice, {
    missionId: host.id,
    code: "console.log(3)",
    at: at(3),
    failed: [],
    passed: [c0],
  });
  ok(
    "passing does not erase the record — it dates it",
    cleared.mistakes.length === 1 && cleared.mistakes[0].resolvedAt === at(3)
  );
  ok("and keeps the code that finally worked", cleared.mistakes[0].resolvedCode === "console.log(3)");
  ok("while the count of what it cost stays honest", cleared.mistakes[0].failures === 2);

  const reopened = observe(cleared, {
    missionId: host.id,
    code: "console.log(4)",
    at: at(4),
    failed: [miss(c0)],
    passed: [],
  });
  ok(
    "a regression honestly re-opens the record",
    reopened.mistakes[0].resolvedAt === null && reopened.mistakes[0].failures === 3
  );
  ok(
    "an attempt with no verdicts at all leaves the log untouched",
    observe(first, { missionId: host.id, code: "x", at: at(9), failed: [], passed: [] }) === first
  );
  ok(
    "a pass for a requirement never failed invents nothing",
    observe(emptyPractice(), { missionId: host.id, code: "x", at: at(9), failed: [], passed: [c1] })
      .mistakes.length === 0
  );

  // 4.1 retention, stated as a guarantee rather than discovered by loss.
  const flood: Mistake[] = [];
  for (let i = 0; i < 60; i++) {
    flood.push(
      rec(host.id, `c${i}`, {
        resolvedAt: i === 59 ? null : at(1),
        resolvedCode: i === 59 ? null : "code",
        lastFailedAt: at((i % 25) + 1),
      })
    );
  }
  const kept = rotate(flood);
  ok(`the log is capped (${PRACTICE_CAP})`, kept.length === PRACTICE_CAP);
  ok("an open record is never rotated out by cleared ones", kept[0].id === mistakeId(host.id, "c59"));
  ok("cleared records keep the most recent", kept.slice(1).every((m) => m.resolvedAt !== null));
  ok("rotation does not mutate what it was given", flood.length === 60);

  // 4.3 the framing guard: this surface is work, never a score against a person.
  const script = readFileSync(new URL("../src/routes/practice/+page.svelte", import.meta.url), "utf8");
  // The rendered markup only: a comment in the script block is not shown to a
  // learner, and a data field name (`item.failures`) is not copy either.
  const markup = script.slice(script.indexOf("</script>"));
  const copy = Object.values(PRACTICE_COPY).join(" ").toLowerCase();
  ok("the practice surface never uses a shaming word", PRACTICE_BANNED_WORDS.every((w) => !copy.includes(w)));
  ok(
    "and the banned list is not vacuous — a shaming line is caught",
    PRACTICE_BANNED_WORDS.some((w) => "you failed and lost your streak".includes(w))
  );
  ok(
    "the page renders that copy rather than writing its own",
    script.includes("PRACTICE_COPY.heading") && script.includes("PRACTICE_COPY.promise")
  );
  ok("and no streak or punishment mechanic accompanies the log", !/(streak|penalt|punish|locked)/i.test(markup));
  const keys: string[] = [PRACTICE_STORAGE_KEY, STORAGE_KEY];
  ok(
    "the log lives under its own key, outside the synced state",
    new Set(keys).size === 2 && !keys[0].includes(keys[1])
  );

  // 4.2 a session: varied across stages, open work first, capped by the ask.
  const mixed: PracticeState = {
    version: 1,
    mistakes: [
      rec(host.id, c0, { lastFailedAt: at(4) }),
      rec(host.id, c1, { lastFailedAt: at(3) }),
      rec(other.id, "x1", { lastFailedAt: at(2) }),
      rec(other.id, "x2", { lastFailedAt: at(1) }),
      rec(other.id, "x3", { resolvedAt: at(5), resolvedCode: "code" }),
      rec(host.id, "y1", { resolvedAt: at(6), resolvedCode: "code" }),
      rec(other.id, "old", { lastFailedAt: older }),
    ],
  };
  ok("a session takes the number asked for", practiceSet(mixed, 3).length === 3 && practiceSet(mixed, 4).length === 4);
  ok(
    "and mixes stages instead of repeating one mistake",
    new Set(practiceSet(mixed, 4).map((m) => missionById(m.missionId)!.stageId)).size === 2
  );
  ok("open work fills the session before revisiting", practiceSet(mixed, 4).every((m) => m.resolvedAt === null));
  ok(
    "and cleared work is only reached to make up the numbers",
    practiceSet(mixed, 7).slice(5).every((m) => m.resolvedAt !== null)
  );
  ok("open records read newest first", openMistakes(mixed)[0].checkId === c0);
  ok("cleared records read most-recently-cleared first", resolvedMistakes(mixed)[0].id === mistakeId(host.id, "y1"));
  ok(
    "the week's window excludes older work",
    beatenThisWeek(mixed, new Date(Date.UTC(2026, 0, 6, 12))).length === 6
  );
  const summary = practiceSummary(mixed, new Date(Date.UTC(2026, 0, 6, 12)));
  ok(
    "the summary is open, cleared, this week, and the spread",
    summary.open === 5 && summary.cleared === 2 && summary.thisWeek === 6 && summary.stages === 2
  );

  // Storage is the learner's own, so a malformed log is salvaged, never fatal.
  ok(
    "junk normalises to an empty log rather than throwing",
    normalizePractice(null).mistakes.length === 0 && normalizePractice("junk").mistakes.length === 0
  );
  ok(
    "an entry without a mission or a check is dropped",
    normalizePractice({ mistakes: [null, 7, { id: "x" }] }).mistakes.length === 0
  );
  const salvaged = normalizePractice({ mistakes: [{ missionId: host.id, checkId: c0, failures: -3 }] });
  ok(
    "a salvageable record gets safe defaults",
    salvaged.mistakes.length === 1 &&
      salvaged.mistakes[0].id === mistakeId(host.id, c0) &&
      salvaged.mistakes[0].failures === 1 &&
      salvaged.mistakes[0].resolvedAt === null
  );
  ok("and the salvaged log obeys the same cap", normalizePractice({ mistakes: flood }).mistakes.length === PRACTICE_CAP);

  // 2.3 evidence export: the record leaves the app, or it proves nothing.
  const learner = defaultState();
  learner.profile = { ...learner.profile, name: "Ada", goal: "websites", hoursPerWeek: "6" };
  const cid0 = COMPETENCIES[0].id;
  const cid1 = COMPETENCIES[1].id;
  learner.competencies[cid0] = {
    ...learner.competencies[cid0],
    level: "independent",
    evidence: ["passed the checks unaided"],
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
  learner.competencies[cid1] = { ...learner.competencies[cid1], level: "practiced" };
  const done = host;
  learner.missions[done.id] = {
    ...defaultMissionProgress(done.id, ""),
    completedAt: "2026-02-02T00:00:00.000Z",
    attempts: 2,
    checksPassed: [done.checks[0].id],
    xpAwarded: 75,
  };
  learner.xp = 75;
  learner.activeDays = ["2026-02-01", "2026-02-02"];

  const doc = buildEvidence(learner, mixed, new Date("2026-03-01T00:00:00.000Z"));
  ok(
    "the export is a versioned document, not a screenshot",
    doc.format === "nexora.evidence" && doc.version === 1 && doc.exportedAt === "2026-03-01T00:00:00.000Z"
  );
  ok(
    "approved skills are counted, tracked skills are named",
    doc.summary.skillsApproved === 1 && doc.summary.skillsTracked === COMPETENCIES.length
  );
  ok(
    "only completed missions carry evidence",
    doc.summary.missionsCompleted === 1 && doc.missions[0].id === done.id && doc.summary.missionsMastered === 0
  );
  ok(
    "a skill travels in the same words the app uses",
    doc.skills.find((s) => s.competencyId === cid0)!.word === "approved" &&
      doc.skills.find((s) => s.competencyId === cid1)!.word === "under review"
  );
  ok(
    "with its criterion and its own evidence",
    doc.skills.find((s) => s.competencyId === cid0)!.criterion.length > 0 &&
      doc.skills.find((s) => s.competencyId === cid0)!.evidence.includes("passed the checks unaided")
  );
  ok("the practice record travels with it", doc.practice.open === 5 && doc.practice.items.length === 7);
  ok(
    "and prints the caveat rather than hiding it",
    /not a certificate/i.test(EVIDENCE_CAVEAT) && EVIDENCE_CAVEAT.includes("re-run")
  );

  const json = evidenceJson(doc);
  const roundTrip = JSON.parse(json) as { format: string; skills: unknown[] };
  ok(
    "the JSON export parses and keeps every skill",
    roundTrip.format === "nexora.evidence" && roundTrip.skills.length === COMPETENCIES.length && json.endsWith("\n")
  );
  const md = evidenceMarkdown(doc);
  ok("the readable export names the learner and the work", md.includes("Ada") && md.includes(done.title));
  ok("and carries the caveat with it", md.includes(EVIDENCE_CAVEAT));
  const blank = buildEvidence(defaultState());
  ok(
    "a learner with nothing yet exports cleanly",
    blank.summary.skillsApproved === 0 &&
      blank.missions.length === 0 &&
      evidenceMarkdown(blank).includes("None completed yet.")
  );

  // The assessment split, stated where it can be checked. The export above is
  // the artefact a learner sends to a stranger, so the difference between "the
  // platform recomputed this" and "my own browser said so" has to survive the
  // trip — and the document that promises to state it has to match the content.
  const cssOnlyMission = missionById("css-selectors")!;
  const platformMission = missionById("first-page")!;
  const splitState = defaultState();
  splitState.profile = { ...splitState.profile, name: "Ada" };
  splitState.missions[cssOnlyMission.id] = {
    ...defaultMissionProgress(cssOnlyMission.id, ""),
    completedAt: "2026-02-03T00:00:00.000Z",
    checksPassed: cssOnlyMission.checks.map((c) => c.id),
  };
  splitState.missions[platformMission.id] = {
    ...defaultMissionProgress(platformMission.id, ""),
    completedAt: "2026-02-04T00:00:00.000Z",
    checksPassed: [platformMission.checks[0].id],
  };
  const splitDoc = buildEvidence(splitState, null, new Date("2026-03-02T00:00:00.000Z"));
  const cssEntry = splitDoc.missions.find((m) => m.id === cssOnlyMission.id)!;
  ok(
    "a requirement only the browser could decide travels as the learner's report",
    cssEntry.learnerReported.length === cssOnlyMission.checks.length &&
      cssOnlyMission.checks.every((c) => isClientReported(c.rule))
  );
  ok(
    "a requirement the platform recomputed is not marked as the learner's",
    splitDoc.missions.find((m) => m.id === platformMission.id)!.learnerReported.length === 0
  );
  const splitLines = evidenceMarkdown(splitDoc).split("\n");
  const cssAt = splitLines.findIndex((l) => l.includes(`**${cssOnlyMission.title}**`));
  const cssBlock = splitLines.slice(cssAt, cssAt + 4).join("\n");
  ok(
    "a wholly client-reported mission claims no platform-verified requirement",
    cssAt !== -1 &&
      !cssBlock.includes("requirements met:") &&
      cssBlock.includes("reported by this learner's own browser")
  );
  ok(
    "and the caveat describes what the export does, not what it wishes it did",
    !/excludes the checks/i.test(EVIDENCE_CAVEAT)
  );

  const authorities = new Set(Object.values(KIND_AUTHORITY));
  ok(
    "every rule kind has exactly one authority, and no kind is unclassified",
    authorities.size === 3 &&
      Object.keys(KIND_AUTHORITY).length ===
        SERVER_DECIDABLE_KINDS.length + RECEIPT_DECIDED_KINDS.length + CLIENT_REPORTED_KINDS.length
  );
  const trustDoc = readFileSync(new URL("../../TRUST-MODEL.md", import.meta.url), "utf8");
  ok(
    "TRUST-MODEL.md states the split the shipped content actually has",
    currentTrustBlock() === renderTrustBlock()
  );
  const numberWord = ["zero", "one", "two", "three", "four"][authorities.size]!;
  ok(
    "and names as many authorities as the code defines",
    trustDoc.includes(
      `${numberWord.charAt(0).toUpperCase()}${numberWord.slice(1)} authorities decide verdicts today`
    )
  );
  const shippedChecks = ALL_MISSIONS.flatMap((m) => m.checks);
  const shippedClient = shippedChecks.filter((c) => isClientReported(c.rule)).length;
  ok(
    `the client's share is stated, not assumed (${shippedClient} of ${shippedChecks.length})`,
    renderTrustBlock().includes(`| **All ${ALL_MISSIONS.length} missions** | **${shippedChecks.length}** | **${shippedClient}** (`)
  );

  // 8.4 SEO basics: titles and social cards in the shell, plus crawler files.
  const origin = "https://nexora.example";
  const paths = sitemapPaths();
  ok(
    "every mission is listed exactly once",
    paths.filter((p) => p.startsWith("/mission/")).length === ALL_MISSIONS.length &&
      new Set(paths).size === paths.length &&
      paths.includes("/")
  );
  ok("pages a crawler cannot read are left out", !paths.includes("/profile"));

  const xml = sitemapXml(origin);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(
    "each sitemap entry is an absolute URL",
    locs.length === paths.length && locs.every((l) => l.startsWith(`${origin}/`))
  );
  ok("generating it twice gives the same bytes", sitemapXml(origin) === xml);
  ok("a trailing slash in the origin is not doubled", sitemapXml(`${origin}/`) === xml);
  const xmlDoc = new JSDOM(xml, { contentType: "text/xml" }).window.document;
  ok("and the document parses as XML with one url per path", xmlDoc.querySelectorAll("url").length === paths.length);

  const robots = robotsTxt(origin);
  ok(
    "robots allows crawling and names the sitemap",
    robots.startsWith("User-agent: *\nAllow: /") && robots.includes(`Sitemap: ${origin}/sitemap.xml`)
  );
  ok(
    "and tolerates a trailing slash in the origin",
    robotsTxt(`${origin}/`).includes(`${origin}/sitemap.xml`) && !robotsTxt(`${origin}/`).includes("example//")
  );
  ok(
    "an unconfigured origin still yields a crawlable file",
    robotsTxt(SITE_URL_FALLBACK).includes(`${SITE_URL_FALLBACK}/sitemap.xml`)
  );

  // Origin and description handling: one resolver serves the crawler files and
  // every page's head, so a canonical URL cannot disagree with the sitemap.
  ok(
    "an absent, empty or blank origin resolves to the local fallback",
    [undefined, null, "", "   "].every(
      (v) => resolveOrigin(v as string | null | undefined) === SITE_URL_FALLBACK
    )
  );
  ok(
    "a configured origin loses its trailing slashes",
    resolveOrigin("https://nexora.example//") === "https://nexora.example"
  );
  ok(
    "a short description is returned with its whitespace collapsed",
    clampDescription("  one\n  line  ") === "one line"
  );
  const repetitive = "aaa ".repeat(60);
  const clamped = clampDescription(repetitive);
  ok(
    `a long description is cut at a word boundary and marked as cut (${clamped.length} chars)`,
    clamped.length <= META_DESCRIPTION_LIMIT && clamped.endsWith("…") && !clamped.endsWith(" …")
  );
  const unbreakable = clampDescription("x".repeat(400));
  ok(
    "and a description that is one unbreakable word is still bounded, and still marked",
    unbreakable.length <= META_DESCRIPTION_LIMIT && unbreakable.endsWith("…")
  );

  const onePage = pageMeta({
    title: pageTitle("Practice log"),
    description: "a description",
    path: "/practice",
    origin: "https://nexora.example",
  });
  ok(
    "one builder produces the title, the canonical URL and the card together",
    onePage.title === `Practice log — ${SITE_NAME}` &&
      onePage.canonical === "https://nexora.example/practice" &&
      onePage.og.url === onePage.canonical &&
      onePage.og.title === onePage.title &&
      onePage.og.description === onePage.description &&
      onePage.og.siteName === SITE_NAME
  );
  const typed = (type?: "website" | "article") =>
    pageMeta({ title: "t", description: "d", path: "/", origin: "", type }).og.type;
  ok("a page that does not say otherwise is a website", typed() === "website" && typed("article") === "article");
  ok(
    "the home path keeps its trailing slash, and no origin still yields an absolute URL",
    pageMeta({ title: "t", description: "d", path: "/", origin: "https://a.example" }).canonical ===
      "https://a.example/" &&
      pageMeta({ title: "t", description: "d", path: "/x", origin: undefined }).canonical ===
        `${SITE_URL_FALLBACK}/x`
  );

  // Per-mission metadata: 27 pages that must not all share one title.
  const missionMetas = ALL_MISSIONS.map((m) => ({
    id: m.id,
    title: pageTitle(m.title),
    description: missionDescription(m),
    canonical: pageMeta({
      title: pageTitle(m.title),
      description: missionDescription(m),
      path: `/mission/${m.id}`,
      origin,
    }).canonical,
  }));
  ok(
    "every mission has a title of its own",
    new Set(missionMetas.map((m) => m.title)).size === ALL_MISSIONS.length
  );
  ok(
    "and a canonical URL of its own",
    new Set(missionMetas.map((m) => m.canonical)).size === ALL_MISSIONS.length &&
      missionMetas.every((m) => m.canonical.startsWith(`${origin}/mission/`))
  );
  ok(
    "and a bounded description that is not the shell's",
    missionMetas.every(
      (m) => m.description.length > 0 && m.description.length <= META_DESCRIPTION_LIMIT
    ) && missionMetas.every((m) => m.description !== SITE_DESCRIPTION)
  );
  ok(
    "built from the mission's own words rather than a marketing line",
    ALL_MISSIONS.every((m) => {
      const d = missionDescription(m);
      return d.startsWith(clampDescription(m.tagline)) || d.length === META_DESCRIPTION_LIMIT;
    })
  );
  ok(
    "and the practice page's own search description fits a search result",
    PRACTICE_COPY.metaDescription.length <= META_DESCRIPTION_LIMIT
  );

  const layout = readFileSync(new URL("../src/routes/+layout.svelte", import.meta.url), "utf8");
  ok(
    "the shell keeps only the tags that are the same on every page",
    layout.includes('name="theme-color"') &&
      layout.includes('property="og:site_name"') &&
      layout.includes('name="twitter:card"')
  );
  ok(
    "and writes no title or description a page would end up duplicating",
    !layout.includes("<title>") &&
      !layout.includes('name="description"') &&
      !layout.includes('property="og:title"') &&
      !layout.includes('property="og:description"')
  );

  // Every route page must declare its own metadata, because the shell no longer
  // states one: a new page that forgets would render with no title at all.
  const routeFiles: string[] = [];
  const walkRoutes = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walkRoutes(path);
      else if (entry.name === "+page.svelte" || entry.name === "+error.svelte") routeFiles.push(path);
    }
  };
  walkRoutes(fileURLToPath(new URL("../src/routes", import.meta.url)));
  const headless = routeFiles.filter((f) => {
    const src = readFileSync(f, "utf8");
    return !src.includes("PageHead") && !src.includes("<svelte:head>");
  });
  ok(
    `every route page declares its own metadata (${routeFiles.length} checked)`,
    routeFiles.length >= 9 && headless.length === 0
  );
  const noindexFiles = routeFiles.filter((f) => readFileSync(f, "utf8").includes("noindex"));
  ok(
    "the pages kept out of the index are exactly the account view and the unlisted prototype",
    noindexFiles.length === 2 &&
      noindexFiles.some((f) => f.includes("profile")) &&
      noindexFiles.some((f) => f.includes("containers"))
  );
  ok(
    "and neither of them is advertised in the sitemap",
    sitemapPaths().every((p) => p !== "/profile" && p !== "/lab/containers")
  );
  const sitemapRoute = readFileSync(new URL("../src/routes/sitemap.xml/+server.ts", import.meta.url), "utf8");
  const robotsRoute = readFileSync(new URL("../src/routes/robots.txt/+server.ts", import.meta.url), "utf8");
  ok(
    "both crawler documents are prerendered routes",
    sitemapRoute.includes("export const prerender = true") && robotsRoute.includes("export const prerender = true")
  );
  const staticEnv = /^\s*import[^\n]*\$env\/static\/public/m;
  ok(
    "and both read the origin dynamically (an unset variable must not fail a build)",
    sitemapRoute.includes('from "$env/dynamic/public"') &&
      robotsRoute.includes('from "$env/dynamic/public"') &&
      !staticEnv.test(sitemapRoute) &&
      !staticEnv.test(robotsRoute)
  );
}

console.log("\n== a learner is never left without a next step ==");
{
  // Found by driving the app as a brand-new learner: the roadmap's reviewer
  // summary answers "what is requested of me", and with no goal set it read
  // "Nothing outstanding" with a link to the portfolio — while the sentence
  // beside it asked for a goal. It now renders the engine's own target.
  const fresh = defaultState();
  const freshTarget = continueTarget(fresh);
  ok(
    "a learner with no goal is asked for a goal, not shown a portfolio",
    recommend(fresh).primaryId === null &&
      freshTarget.href === "/onboarding" &&
      freshTarget.detail.length > 0 &&
      freshTarget.label.length > 0
  );

  const withGoal = defaultState();
  withGoal.profile = { ...withGoal.profile, name: "Ada", goal: "websites", completedAt: "2026-01-01T00:00:00.000Z" };
  ok(
    "and one who has a goal but no diagnostic is sent to the diagnostic",
    recommend(withGoal).primaryId === null && continueTarget(withGoal).href === "/diagnostic"
  );

  const landing = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  ok(
    "the public entry leads with the IDE download, not a browser mission",
    landing.includes('const downloadHref = "/download"') &&
      landing.includes("href={downloadHref}")
  );
  const roadmap = readFileSync(new URL("../src/routes/roadmap/+page.svelte", import.meta.url), "utf8");
  const summary = roadmap.slice(roadmap.indexOf('aria-label="Reviewer command gutter"'));
  ok(
    "the reviewer summary renders that target instead of naming one of its own",
    summary.includes("continueTarget(progress.state)") && summary.includes("href={target.href}")
  );
  ok(
    "so the portfolio is reachable only when the target itself is the portfolio",
    /target\.href === "\/projects"/.test(summary) && !/href="\/projects"/.test(summary)
  );
}

console.log("\n== the front door describes the real product ==");
{
  // The pivot: there is one way to learn, and it is the desktop IDE. The root
  // sells the download (with the base course inside it), the browser sign-in,
  // and the tier unlock — never a browser mission. These pin that shape so a
  // copy edit cannot quietly reintroduce the second way to learn.
  const landing = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  ok(
    "the page names no browser mission as a way to learn",
    !landing.includes("/mission/") && !landing.includes("firstMission")
  );
  ok(
    "every call on the page opens the download",
    landing.includes('const downloadHref = "/download"') &&
      landing.split("href={downloadHref}").length - 1 >= 3
  );
  ok(
    "the page states the base course ships inside the download",
    landing.includes("Base course included") && landing.includes("bundled")
  );
  ok(
    "the page explains the browser sign-in: the IDE opens this site",
    landing.includes("opens this site") && landing.includes("approve")
  );
  ok(
    "the page states the tier decides which courses appear in the IDE",
    landing.includes("tier") && landing.includes("appear inside the IDE")
  );
}

console.log("\n== teaching guards: ladders escalate, misconceptions are concrete ==");
{
  // 2.1 The hint ladder is five named rungs (nudge → solution review) and
  // the workspace pairs each rung with its name by position — so a ladder
  // with any other shape would either hide help or crash the pairing. Every
  // misconception list names at least one concrete wrong belief. These pin
  // the shape and the substance floor; the sentence-by-sentence novice
  // read remains a content pass, not an assertion.
  const workspaceSrc = readFileSync(new URL("../src/lib/components/Workspace.svelte", import.meta.url), "utf8");
  for (const rung of ["Nudge", "Concept", "Investigation", "Worked example", "Solution review"]) {
    ok(`the workspace names the ${rung} rung in order`, workspaceSrc.includes(rung));
  }
  ok(
    "every mission carries all five rungs",
    ALL_MISSIONS.every((m) => m.hintLadder.length === 5)
  );
  ok(
    "no rung repeats its neighbour — each step escalates instead of restating",
    ALL_MISSIONS.every((m) => m.hintLadder.every((h, i) => i === 0 || h.trim() !== m.hintLadder[i - 1].trim()))
  );
  ok(
    "every rung is substantive prose, not a placeholder",
    ALL_MISSIONS.every((m) => m.hintLadder.every((h) => h.trim().length >= 20))
  );
  ok(
    "every mission names at least one predictable wrong belief",
    ALL_MISSIONS.every((m) => m.misconceptions.length >= 1 && m.misconceptions.every((x) => x.trim().length >= 20))
  );

  // 2.2 mastery vs completion: the math already distinguishes them
  // (clean run → mastered with bonus; heavy hints → completed with practice
  // assigned — asserted with computeFinalization above). What was unproven is
  // the independent-transfer challenge: one mission per layer that asks for
  // the same motion in a new situation, so "mastered" means it travels.
  const stageLayer = new Map(STAGES.map((s) => [s.id, (s as unknown as { layerId: string }).layerId]));
  const transferOf = (m: (typeof ALL_MISSIONS)[number]): string =>
    [...m.lesson.map((b) => `${b.body}\n${b.code ?? ""}`), ...m.hintLadder, m.completionNote, m.masteryNote].join("\n");
  for (const layer of LAYERS) {
    const bearer = ALL_MISSIONS.find(
      (m) => stageLayer.get(m.stageId) === layer.id && /transfer/i.test(transferOf(m))
    );
    ok(
      `the ${layer.id} layer proves transfer with its own challenge (${bearer?.id ?? "none"})`,
      bearer !== undefined
    );
  }
}

console.log("\n== execution feedback in the editor: gutter markers and quota ==");
{
  // 1.2 The compiler's diagnostics must be visible where the learner looks
  // (the editor gutter, beside the offending line — proximity), use the
  // compiler's own words, and never point at stale code. The output pane
  // keeps the full verbatim list for screen readers; the gutter is
  // deliberately aria-hidden so it is not announced twice.
  const editorSrc = readFileSync(new URL("../src/lib/components/Editor.svelte", import.meta.url), "utf8");
  const workspaceSrc = readFileSync(new URL("../src/lib/components/Workspace.svelte", import.meta.url), "utf8");
  const runnerSrc = readFileSync(new URL("../src/lib/runner.ts", import.meta.url), "utf8");
  ok(
    "gutter diagnostics are grouped by line, one marker per offending line",
    editorSrc.includes("diagnosticsByLine") && editorSrc.includes("diagnosticsByLine.get(n)")
  );
  ok(
    "a diagnostic with no line, or a line outside the file, marks nothing",
    editorSrc.includes("diagnostic.line === null") && editorSrc.includes("diagnostic.line > lines")
  );
  ok(
    "the marker uses the removed state colour and the compiler's own message as its hover text",
    editorSrc.includes("class:text-removed={!!messages}") && editorSrc.includes("messages?.join(")
  );
  ok(
    "the gutter is presentational: screen readers get the verbatim list in the output pane, not the marker",
    editorSrc.includes('bind:this={gutter}') && editorSrc.includes('aria-hidden="true"') &&
      workspaceSrc.includes("runOutcome.diagnostics") && workspaceSrc.includes("diagnosticLine(d)")
  );
  ok(
    "markers clear as soon as the source changes, so they cannot point at stale code",
    workspaceSrc.includes("diagnostics={code === runCode") && workspaceSrc.includes("code === runCode")
  );
  ok(
    "and only the entry file is marked — fixture output never decorates the learner's source",
    workspaceSrc.includes('mission.language === "go"') &&
      workspaceSrc.includes("diagnostic.file === (mission.fileName")
  );
  ok(
    "the output pane labels the phase in the compiler's own terms, not a generic failure",
    workspaceSrc.includes("compiler stopped this") && workspaceSrc.includes("it ran and crashed")
  );
  // Quota UX: the count is shown beside Run before exhaustion, Run is
  // disabled at zero, and the zero state names the reset — no surprise dead
  // button, no silent 429. Both the accepted run and the 429 carry the
  // remaining count from the same header, guarded to a non-negative integer.
  ok(
    "the remaining count comes from the platform header on both the accepted run and the refusal",
    runnerSrc.split('X-Execution-Daily-Remaining').length - 1 >= 2 &&
      runnerSrc.includes("Number.isInteger(quotaRemaining) && quotaRemaining >= 0")
  );
  ok(
    "the workspace shows the count beside Run while it is still actionable (10 or fewer)",
    workspaceSrc.includes("runnerRemaining !== null && runnerRemaining <= 10") &&
      workspaceSrc.includes("runs left today")
  );
  ok(
    "Run is disabled at zero and the zero state names the reset",
    workspaceSrc.includes("runnerRemaining === 0") && workspaceSrc.includes("resets at midnight UTC")
  );
}

console.log("\n== post-run reflection: three prompts that change nothing but the draft ==");
{
  // 1.4 The failed-run UI branch: three prompts appear after a failed
  // executable check and save beside the mission draft on this device. They
  // do not affect checks and never enter cloud sync — the suite pins all
  // three halves: when the branch renders, what it saves, and that the
  // server contract cannot carry it.
  const workspaceSrc = readFileSync(new URL("../src/lib/components/Workspace.svelte", import.meta.url), "utf8");
  const syncSrc = readFileSync(new URL("../src/lib/sync-core.ts", import.meta.url), "utf8");
  ok(
    "the reflection appears only after a real run whose checks were read and at least one failed",
    workspaceSrc.includes("code === runCode") &&
      workspaceSrc.includes("runOutcome?.ran") &&
      workspaceSrc.includes("!runOutcome?.unavailable") &&
      workspaceSrc.includes("outcomes?.some((outcome) => !outcome.passed)")
  );
  ok(
    "a drill never shows it — practice writes to the log, not the mission record",
    workspaceSrc.includes("!drill &&") && workspaceSrc.includes("if (!mission || drill) return;")
  );
  ok(
    "the three prompts are labelled fields with their own ids",
    workspaceSrc.includes('id="reflection-expected"') &&
      workspaceSrc.includes('id="reflection-observed"') &&
      workspaceSrc.includes('id="reflection-next-change"')
  );
  ok(
    "the page states the bargain in place: saved beside the draft, affecting no check",
    workspaceSrc.includes("This reflection is saved beside your draft on this device. It does not affect your checks.")
  );
  ok(
    "answering writes through the local draft store only",
    workspaceSrc.includes("progress.saveReflection(mission.id, field, value)")
  );
  const draftIface = syncSrc.slice(
    syncSrc.indexOf("export interface MissionDraft {"),
    syncSrc.indexOf("export interface MissionPush")
  );
  ok(
    "the server draft contract has no reflection field — it can never enter cloud sync",
    draftIface.length > 0 && !draftIface.includes("reflection")
  );
  ok(
    "and a merge that adopts the server's draft still keeps the local reflection beside it",
    syncSrc.includes("reflection: L?.reflection ?? S?.reflection")
  );
}

console.log("\n== identity and billing: one token boundary, one checkout path ==");
{
  // Phase 3 + 6.2. Clerk and Dodo join through narrow, named doors: the only
  // module that imports clerk-js is lib/clerk.ts, the only page that mounts
  // it is /auth, everything else reads session.token, every checkout starts
  // in lib/billing.ts, and the sync engine runs exactly while a token exists
  // (which is also what migrates a guest's work onto a fresh account).
  const srcFiles: string[] = [];
  const walkSrc = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) walkSrc(p);
      else if (p.endsWith(".svelte") || p.endsWith(".ts")) srcFiles.push(p);
    }
  };
  walkSrc(fileURLToPath(new URL("../src", import.meta.url)));
  const withClerkJs = srcFiles.filter((f) => readFileSync(f, "utf8").includes("@clerk/clerk-js"));
  ok(
    "clerk-js is imported in exactly one module",
    withClerkJs.length === 1 && withClerkJs[0].endsWith("lib/clerk.ts")
  );
  const mountingClerk = srcFiles.filter(
    (f) => f.endsWith(".svelte") && readFileSync(f, "utf8").includes("$lib/clerk")
  );
  ok(
    "and mounted by exactly one page",
    mountingClerk.length === 1 && mountingClerk[0].endsWith("routes/auth/+page.svelte")
  );
  const checkoutCallers = srcFiles.filter((f) => readFileSync(f, "utf8").includes("session.checkout("));
  ok(
    "every checkout starts in the one billing helper",
    checkoutCallers.length === 1 && checkoutCallers[0].endsWith("lib/billing.ts")
  );

  const sessionSrc = readFileSync(new URL("../src/lib/session.svelte.ts", import.meta.url), "utf8");
  ok(
    "the session accepts an external token, provisions the profile row, and refreshes through a provider",
    sessionSrc.includes("useExternalToken") &&
      sessionSrc.includes("linkClerkProfile") &&
      sessionSrc.includes("setTokenProvider") &&
      sessionSrc.includes("resolveToken") &&
      sessionSrc.includes("/api/auth/link")
  );

  // L-3 + M-1. A session is two credentials with two homes: a minutes-long
  // access token the page holds, and a thirty-day refresh token in an HttpOnly
  // cookie the page cannot read. Either half alone is the failure those findings
  // described — a cookie nothing spends, or a client holding a credential it can
  // never renew.
  const brokerSrc = readFileSync(new URL("../src/lib/server/session-broker.ts", import.meta.url), "utf8");
  ok(
    "the refresh token lives in an HttpOnly cookie, scoped to the session endpoints",
    brokerSrc.includes('REFRESH_COOKIE = "nexora_refresh"') &&
      brokerSrc.includes("httpOnly: true") &&
      brokerSrc.includes('sameSite: "lax"') &&
      brokerSrc.includes('COOKIE_PATH = "/auth/session"')
  );
  ok(
    "and the app's own server sets it, so the cookie is same-site by construction",
    brokerSrc.includes("GATEWAY_URL") && brokerSrc.includes("gatewayBase")
  );
  ok(
    "every session endpoint exists on the app's origin",
    ["login", "register", "refresh", "logout", "logout-all"].every((name) =>
      existsSync(new URL(`../src/routes/auth/session/${name}/+server.ts`, import.meta.url))
    )
  );
  ok(
    "the sign-in reply carries the access token and never the refresh token",
    (() => {
      const src = readFileSync(new URL("../src/routes/auth/session/login/+server.ts", import.meta.url), "utf8");
      const reply = src.slice(src.lastIndexOf("return json({"));
      return reply.includes("accessToken") && !reply.includes("refreshToken");
    })()
  );
  ok(
    "the client stores no refresh token and renews through the cookie",
    !sessionSrc.includes("refreshToken") &&
      sessionSrc.includes('SESSION_BASE = "/auth/session"') &&
      sessionSrc.includes("REFRESH_PATH") &&
      sessionSrc.includes("LOGOUT_PATH")
  );
  // Sign-out has to end the credential, not just the ability to renew it. The
  // page sends the access token it is holding to its own server, which passes it
  // to the service; the service records that token's jti and the gateway refuses
  // it from the next request on. Drop either half of that hand-off and sign-out
  // silently goes back to "the token keeps working for the rest of its TTL" —
  // which is exactly the gap this closes, so both halves are asserted here.
  const logoutRouteSrc = readFileSync(
    new URL("../src/routes/auth/session/logout/+server.ts", import.meta.url),
    "utf8"
  );
  ok(
    "signing out presents the access token, so the server can revoke that exact credential",
    sessionSrc.includes("authorization: `Bearer ${token}`") && logoutRouteSrc.includes("accessToken: presented")
  );
  // "Sign out everywhere" needs the same hand-off for the same reason, and it is
  // the one account action that has to report failure: the sessions it ends are on
  // devices the learner cannot see, so a silent failure would tell them everyone
  // else was signed out when nobody was.
  ok(
    "signing out everywhere names the account with a real token and reports what happened",
    sessionSrc.includes("async logoutEverywhere(") &&
      sessionSrc.includes("LOGOUT_ALL_PATH") &&
      sessionSrc.includes('headers: { authorization: `Bearer ${token}` }') &&
      sessionSrc.includes("may still be signed in") &&
      readFileSync(
        new URL("../src/routes/auth/session/logout-all/+server.ts", import.meta.url),
        "utf8"
      ).includes("accessToken: presented")
  );
  // The access token is memory-only. What makes that worth asserting is that it is
  // easy to undo by accident — one line adding persistence would look harmless and
  // would put a bearer credential back where any script on the origin can read it
  // (Missing Security Controls #4).
  ok(
    "the access token is never written to storage, and the old key is dropped",
    !sessionSrc.includes("setItem") && sessionSrc.includes("LEGACY_TOKEN_KEY")
  );
  ok(
    "so a reload re-earns the session from the cookie — and says so, rather than claiming signed out",
    sessionSrc.includes("async restore(") &&
      sessionSrc.includes("await this.refresh()") &&
      sessionSrc.includes("restoring")
  );
  // Every rendering surface that can say "you have no session" has to wait for the
  // answer, or a signed-in learner meets a sign-in prompt on every reload for as
  // long as the round trip takes. (Non-rendering consumers — sync's `enabled`, the
  // runner's precondition — are preconditions, not claims, and correctly just wait
  // for a token.)
  const claimsASession = srcFiles.filter(
    (f) => f.endsWith(".svelte") && readFileSync(f, "utf8").includes("session.loggedIn")
  );
  ok(
    `every surface that can claim a session is missing waits until it is known (${claimsASession.length} surfaces)`,
    claimsASession.length >= 4 && claimsASession.every((f) => readFileSync(f, "utf8").includes("session.restoring"))
  );
  ok(
    "it renews on a timer as well as retrying a 401, so a stale token is replaced rather than surfaced",
    sessionSrc.includes("setTimeout") && sessionSrc.includes("this.refresh()") && sessionSrc.includes("resolveToken")
  );

  const headerSrc = readFileSync(new URL("../src/lib/components/Header.svelte", import.meta.url), "utf8");
  ok(
    "the header is a front door, not a classroom: it never starts the progress-sync engine",
    !headerSrc.includes("sync.start()") && !headerSrc.includes("syncRunningFor")
  );
  ok(
    "and it links no browser mission, search, or resume CTA",
    !headerSrc.includes('href="/mission') &&
      !headerSrc.includes("site-search") &&
      !headerSrc.includes("recommend(")
  );

  const authSrc = readFileSync(new URL("../src/routes/auth/+page.svelte", import.meta.url), "utf8");
  ok(
    "the account page keeps the local-mode story and the password forms",
    authSrc.includes("cloud accounts not connected") &&
      authSrc.includes('type="password"') &&
      authSrc.includes("bcrypt-hashed")
  );
  ok(
    "its Clerk branch mounts both forms and names both failure states",
    authSrc.includes("mountClerkAuth") && authSrc.includes("two ways in") && authSrc.includes("sign-in is unreachable")
  );

  const pricingSrc = readFileSync(new URL("../src/routes/pricing/+page.svelte", import.meta.url), "utf8");
  ok(
    "pricing renders the API's plans, names the empty feed, and never invents a price",
    pricingSrc.includes("session.plans()") &&
      pricingSrc.includes("No paid plans published yet") &&
      // $0 is the stated free tier, not a price — any other amount would be invented.
      !/\$[1-9]/.test(pricingSrc)
  );
  ok(
    "its upgrade path is the shared checkout, and prices live on the provider's page",
    pricingSrc.includes("startCheckout") && pricingSrc.includes("Dodo Payments")
  );
  // D-012's billing-trust rules. These are promises the product makes before it
  // has a price to sell, so the loudest reputational failure in this category
  // cannot be reintroduced silently by a copy edit: a page that quietly drops
  // "cancel in two clicks" fails here. The guarantee is only as good as the
  // assertion guarding it.
  // Svelte wraps this prose across lines, so the source is compared with
  // whitespace collapsed: the assertion is about the promise being stated, not
  // about how the formatter happened to break the line.
  const pricingFlat = pricingSrc.replace(/\s+/g, " ");
  ok(
    "pricing states the billing commitments: no surprise renewal, two-click cancel, visible PPP",
    pricingFlat.includes("The renewal date is shown before you pay") &&
      pricingFlat.includes("Cancel in two clicks.") &&
      pricingFlat.includes("applied as a discount you can see")
  );
  ok(
    "and it promises that no check is ever behind the paywall",
    pricingFlat.includes("No check is ever behind the paywall")
  );
  // The free tier is the moat's front door: if a check ever became a paid
  // feature, the claim we sell — that our verdicts are real — would be gone.
  // Asserted on the page because that is where the promise is made to a learner.
  ok(
    "the free tier still promises every mission, the diagnostic, and the evidence export",
    pricingSrc.includes("All 46 missions") &&
      pricingSrc.includes("Diagnostic placement") &&
      pricingSrc.includes("Evidence export")
  );

  const profileSrc = readFileSync(new URL("../src/routes/profile/+page.svelte", import.meta.url), "utf8");
  ok(
    "a checkout return says pending until the provider confirms — the redirect grants nothing",
    profileSrc.includes('searchParams.get("checkout")') &&
      profileSrc.includes("redirect itself grants nothing") &&
      profileSrc.includes("billingLoaded = false")
  );
  ok(
    "sitemap advertises the pricing page",
    sitemapPaths().includes("/pricing")
  );
}

console.log("\n== the contrast floor is computed from the tokens, not promised in a comment ==");
{
  // app.css states the floor in prose ("ink 16:1 on the ground, muted 8.3:1,
  // faint 5.6:1 ... never sit below the contrast floor") and DESIGN.md repeats
  // it, but nothing read the tokens back. Driving every route with a live
  // contrast probe (scripts/a11y-probe.js) found the one place that bypassed
  // the ramp: the code editor painted comments with `text-muted/70`, which
  // renders 4.39:1 on the editor's panel — under the floor the prose claimed.
  // The ramp itself held; the class had stopped coming from it. These
  // assertions keep both halves true: the table's own arithmetic, and the
  // source rules that stop a page from leaving the table.
  const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
  const themeStart = css.indexOf("@theme");
  const theme = css.slice(themeStart, css.indexOf("\n}", themeStart));
  const tokens = new Map<string, string>();
  for (const m of theme.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (m[1] && m[2]) tokens.set(m[1], m[2].toLowerCase());
  }
  const token = (name: string): string => {
    const value = tokens.get(name);
    assert(value, `the theme declares --color-${name}`);
    return value;
  };
  const linear = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const surfaces = ["ground", "panel", "raised", "raised-2"];
  const sourceFiles: string[] = [];
  const walkSrc = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walkSrc(path);
      else if (entry.name.endsWith(".svelte") || entry.name.endsWith(".ts")) sourceFiles.push(path);
    }
  };
  walkSrc(fileURLToPath(new URL("../src", import.meta.url)));
  const svelteFiles = sourceFiles.filter((f) => f.endsWith(".svelte"));
  const shortName = (f: string): string => f.slice(f.replace(/\\/g, "/").lastIndexOf("/") + 1);

  ok(
    `the theme declares its four surfaces and the ramp (${tokens.size} colour tokens)`,
    tokens.size >= 15 &&
      surfaces.every((s) => tokens.has(s)) &&
      ["ink", "muted", "faint", "rule", "control", "accent", "accent-dim"].every((t) => tokens.has(t))
  );

  const rampPairs = ["ink", "muted", "faint"].flatMap((t) => surfaces.map((s) => ({ t, s, r: ratio(token(t), token(s)) })));
  const tightestRamp = rampPairs.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `every text role clears 4.5:1 on every surface (tightest: ${tightestRamp.t} on ${tightestRamp.s} at ${round2(tightestRamp.r)}:1)`,
    rampPairs.every((p) => p.r >= 4.5)
  );

  const stateText = ["accent", "added", "review", "removed", "approved"];
  const statePairs = stateText.flatMap((t) => surfaces.map((s) => ({ t, s, r: ratio(token(t), token(s)) })));
  const tightestState = statePairs.reduce((a, b) => (b.r < a.r ? b : a));
  ok(
    `the state colours are readable as words, not only as tints (tightest: ${tightestState.t} on ${tightestState.s} at ${round2(tightestState.r)}:1)`,
    statePairs.every((p) => p.r >= 4.5)
  );

  ok(
    `accent-dim is held to 3:1 because it is only ever a border or a focus ring (${surfaces.map((s) => round2(ratio(token("accent-dim"), token(s)))).join(", ")})`,
    surfaces.every((s) => ratio(token("accent-dim"), token(s)) >= 3) &&
      sourceFiles.every((f) => !readFileSync(f, "utf8").includes("text-accent-dim"))
  );

  // WCAG 1.4.11: whatever identifies a form field has to clear 3:1 against its
  // neighbours. The hairline that separates rows measures 1.33:1 on raised, so
  // fields use their own token — darkest grey that clears 3:1 on all four.
  const fieldFiles = svelteFiles.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /<input[^>]*type="(text|email|password)"/.test(src) || /<input(?![^>]*type=)/.test(src);
  });
  ok(
    `a field's boundary is not decoration: ${fieldFiles.length} files with text fields each carry border-control`,
    fieldFiles.length >= 3 && fieldFiles.every((f) => readFileSync(f, "utf8").includes("border-control"))
  );
  const controlRatios = surfaces.map((s) => ratio(token("control"), token(s)));
  ok(
    `and that boundary clears 3:1 everywhere it can sit (${controlRatios.map(round2).join(", ")}:1)`,
    controlRatios.every((r) => r >= 3) && ratio(token("control"), token("raised")) > ratio(token("rule"), token("raised"))
  );

  ok(
    "the focus ring is one accent hairline, and accent clears 3:1 on every surface it is drawn on",
    /:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--color-accent\)/.test(css) &&
      surfaces.every((s) => ratio(token("accent"), token(s)) >= 3)
  );

  // The probe cannot prove this one from the outside: a tab that is not the
  // focused window never matches `:focus`, so every element reads as unindicated
  // whatever it renders. What it can prove is that no stylesheet throws the
  // ring away — which is exactly how the text fields lost theirs (a
  // `focus:outline-none` beside a border that only moved from #30363d to
  // #1f6feb).
  {
    const outlineKillers: string[] = [];
    for (const f of sourceFiles) {
      if (!f.endsWith(".ts") && !f.endsWith(".svelte")) continue;
      const src = readFileSync(f, "utf8");
      if (/\/\/[^/].*missions-/.test(f) || /src\/lib\/missions-(.*)[.]ts$/.test(f) || /src\/lib\/missions-orientation[.]ts$/.test(f)) continue;
      if (/outline-none|outline:\s*(none|0)/.test(src)) outlineKillers.push(shortName(f));
    }
    ok(`nothing in the interface removes a focus ring (${sourceFiles.length} files scanned)`, outlineKillers.length === 0);
  }

  // Every colour a page paints has to come from the table above, or the
  // measurements stop describing the product.
  const hexOffenders: string[] = [];
  for (const f of svelteFiles) {
    if (f.match(/\/missions-(.*)[.]ts$/i) || f.endsWith('/missions-orientation.ts')) continue;
    const src = readFileSync(f, "utf8");
    const allowed = new Set(
      [...src.matchAll(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]!.toLowerCase())
    );
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (!allowed.has(m[0].toLowerCase())) hexOffenders.push(`${shortName(f)} ${m[0]}`);
    }
  }
  ok(
    "no component hardcodes a colour the token table does not know",
    hexOffenders.length === 0
  );
  ok(
    "the one literal that is not a class — the browser chrome — paints the same ground as the page",
    readFileSync(new URL("../src/routes/+layout.svelte", import.meta.url), "utf8").includes(
      `<meta name="theme-color" content="${token("ground")}" />`
    )
  );

  const alphaText: string[] = [];
  for (const f of sourceFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/\btext-[a-z][a-z0-9-]*\/\d+/g)) {
      alphaText.push(`${shortName(f)} ${m[0]}`);
    }
  }
  ok(
    "no text colour is dialled below the floor with an opacity modifier",
    alphaText.length === 0
  );

  const editor = readFileSync(new URL("../src/lib/components/Editor.svelte", import.meta.url), "utf8");
  const editorClasses = [...editor.matchAll(/span\("([^"]+)"/g)].map((m) => m[1]!);
  const strayClasses = editorClasses.flatMap((cls) =>
    cls
      .split(/\s+/)
      .filter((c) => c.startsWith("text-") && !tokens.has(c.slice(5)))
  );
  ok(
    `every class the editor paints code with is a theme token (${editorClasses.length} syntax roles)`,
    editorClasses.length >= 4 && strayClasses.length === 0
  );
}

console.log("\n== a five-minute access token does not end a session: the renewal is scheduled, not hoped for ==");
{
  // The server issues an access token that lives minutes and a refresh
  // credential that lives thirty days, so a learner must never meet the end of
  // the short one. The client renews *before* it dies — asserted here on the
  // arithmetic, because this is the part that can silently stop being true.
  // This is L-3's prevention note: a credential the server issues and the client
  // ignores has to fail in CI rather than in someone's lesson.
  const now = 1_800_000_000_000;
  const TTL_MS = 5 * 60 * 1000;
  const delay = refreshDelayMs(now + TTL_MS, now);
  ok(
    "the store renews before the token expires, with room for a slow request",
    delay !== null && delay > 0 && delay < TTL_MS
  );
  ok("a five-minute token is renewed after four minutes", delay === 240_000);
  ok(
    "a token inside the window counts as expiring; an unknown lifetime is left alone",
    isExpiring(now + 30_000, now) && !isExpiring(now + 2 * 60_000, now) && !isExpiring(null, now)
  );
  ok(
    "a delay is never zero or negative — a timer that fires immediately would loop",
    refreshDelayMs(now + 1_000, now) === 1_000 && refreshDelayMs(null, now) === null
  );
  const jwtLike = (claims: Record<string, unknown>): string =>
    `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  ok(
    "the token's own exp is the clock, not a stored copy of it",
    tokenExpiryMs(jwtLike({ exp: 1_800_000_100 })) === 1_800_000_100_000
  );
  ok(
    "an opaque or damaged token yields no expiry rather than a wrong one",
    tokenExpiryMs("not-a-jwt") === null &&
      tokenExpiryMs(null) === null &&
      tokenExpiryMs(jwtLike({ exp: "soon" })) === null
  );
  const start = parseSessionStart({ accessToken: "t", expiresIn: 300, user: { id: "u", email: "e", name: null } });
  ok("the broker's reply is validated before it becomes a session", start?.expiresIn === 300 && start?.user?.id === "u");
  ok(
    "and a reply with a string, zero, or absent lifetime is refused rather than stored",
    parseSessionStart({ accessToken: "t", expiresIn: "300" }) === null &&
      parseSessionStart({ accessToken: "t", expiresIn: 0 }) === null &&
      parseSessionStart({ accessToken: "", expiresIn: 300 }) === null &&
      parseSessionStart(null) === null
  );
}

{
  // The IDE download surface. The desktop app is a real product, but a build is
  // advertised only when one exists: the page reads one switch and, when it is
  // unset, says so plainly instead of rendering a dead link. These assert that
  // honesty and that the surface is reachable from where the courses are shown.
  const downloadSrc = readFileSync(new URL("../src/routes/download/+page.svelte", import.meta.url), "utf8");
  ok(
    "the download page reads the one switch that says a build exists",
    downloadSrc.includes("PUBLIC_IDE_DOWNLOAD_URL")
  );
  ok(
    "and names no browser fallback when no build is published — the IDE is the only way to learn",
    downloadSrc.includes("not published yet") &&
      !downloadSrc.includes("Start in the browser") &&
      downloadSrc.includes('href="/pricing"')
  );
  ok(
    "the real link comes from the configured URL, never a placeholder href",
    downloadSrc.includes("href={downloadUrl}") && !downloadSrc.includes('href="#"')
  );
  ok(
    "the download is stated to be free, with later phases gated per entitlement",
    /download is free/i.test(downloadSrc) && /per entitlement/i.test(downloadSrc)
  );

  const headerSrc = readFileSync(new URL("../src/lib/components/Header.svelte", import.meta.url), "utf8");
  ok(
    "the shared nav reaches the download page",
    headerSrc.includes('{ href: "/download", label: "Get the IDE" }')
  );

  const homeSrc = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  ok("the home footer links the IDE download", homeSrc.includes('href="/download"'));

  const pricingDlSrc = readFileSync(new URL("../src/routes/pricing/+page.svelte", import.meta.url), "utf8");
  ok("pricing links the IDE download from the free plan", pricingDlSrc.includes('href="/download"'));
  ok(
    "and its billing effect latches on failure, so an unreachable service is asked once",
    /\.finally\(\(\) => \{[^}]*loaded = true;/.test(pricingDlSrc) &&
      !/plans = p\.plans;\s*loaded = true;/.test(pricingDlSrc)
  );

  ok("the download page is in the sitemap", sitemapPaths().includes("/download"));

  // The GitHub-style browser sign-in for the IDE: the IDE shows a code, the
  // learner approves it here, and the tier decides which courses appear there.
  // These pin the page's shape: it approves through the session (never a pasted
  // token), refuses unknown codes without saying why, and states the tier rule
  // from the public manifest rather than inventing it.
  const ideSrc = readFileSync(new URL("../src/routes/auth/ide/+page.svelte", import.meta.url), "utf8");
  ok(
    "the IDE sign-in page approves a typed code through the signed-in session",
    ideSrc.includes("session.approveDevice") && ideSrc.includes('path="/auth/ide"')
  );
  ok(
    "it refuses unknown codes without an oracle, and names the expiry",
    ideSrc.includes("not valid") && ideSrc.includes("15 minutes")
  );
  ok(
    "it shows what each tier unlocks from the public manifest, not from copy",
    ideSrc.includes("session.ideManifest") && ideSrc.includes("per entitlement")
  );
  ok(
    "the account page points IDE learners at it",
    readFileSync(new URL("../src/routes/auth/+page.svelte", import.meta.url), "utf8").includes('href="/auth/ide"')
  );
  ok("the IDE sign-in page is in the sitemap", sitemapPaths().includes("/auth/ide"));
}

console.log(`\nALL ${passed} ASSERTIONS PASSED`);
})();
