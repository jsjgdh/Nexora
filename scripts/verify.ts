/* Acceptance verification: check engine, recommendation rules, content integrity.
   Run with: npx tsx scripts/verify.ts */
import { JSDOM } from "jsdom";
import assert from "node:assert";

// jsdom globals for the DOM-dependent check engine
const dom = new JSDOM("", { url: "http://localhost/" });
(global as any).DOMParser = dom.window.DOMParser;
(global as any).CSS = dom.window.CSS;

import { runChecks } from "../lib/checks";
import {
  buildDriverSource,
  evaluateAssertions,
  HARNESS_NS,
  injectDriver,
  isHarnessReply,
  materializeRunOp,
} from "../lib/harness";
// The exact shipped bytes, materialized: tests execute what the frame runs.
const runOp = materializeRunOp();
import { ALL_MISSIONS, missionById } from "../lib/missions";
import { STAGES } from "../lib/curriculum";
import { DIAGNOSTIC_ITEMS } from "../lib/diagnostic";
import { defaultState, computeFinalization } from "../lib/store";
import { recommend, nodeStateFor, prereqsMet, continueTarget, missionActionLabel } from "../lib/recommend";
import { actionVerb } from "../lib/format";

let passed = 0;
function ok(name: string, cond: boolean) {
  assert(cond, `FAILED: ${name}`);
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
ok("9 missions in stage 1, 8 in stage 2, 1 pilot in stage 3", ALL_MISSIONS.length === 18);
const allIds = new Set(ALL_MISSIONS.map((m) => m.id));
for (const s of STAGES) {
  for (const id of s.missionIds) ok(`stage ${s.id} lists existing mission ${id}`, allIds.has(id));
}
for (const m of ALL_MISSIONS) {
  const st = STAGES.find((s) => s.id === m.stageId);
  ok(`${m.id} registered in its stage`, !!st && st.missionIds.includes(m.id));
}
for (const m of ALL_MISSIONS) {
  for (const p of m.prereqIds) ok(`${m.id}: prereq ${p} resolves`, !!missionById(p));
  for (const c of m.competencyIds) ok(`${m.id}: competency ${c} non-empty`, c.length > 0);
  ok(`${m.id}: 5-level hint ladder`, m.hintLadder.length === 5 && m.hintLadder.every((h) => h.length > 20));
  ok(`${m.id}: unique check ids`, new Set(m.checks.map((c) => c.id)).size === m.checks.length);
  for (const q of m.questions ?? []) ok(`${m.id}: question ${q.id} answer in range`, q.answer >= 0 && q.answer < q.options.length);
  ok(`${m.id}: starter code non-empty`, m.starterCode.length > 50);
}
for (const d of DIAGNOSTIC_ITEMS) ok(`diag ${d.id} answer in range`, d.answer >= 0 && d.answer < d.options.length);

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
// Diagnostic: strong HTML (first two correct), rest skipped -> start at links (index 3)
s.diagnostic = {
  completedAt: new Date().toISOString(),
  results: DIAGNOSTIC_ITEMS.map((d, i) => ({ itemId: d.id, selected: i < 2 ? d.answer : -1, correct: i < 2, skipped: i >= 2 })),
};
let rec = recommend(s);
ok("strong-HTML diagnostic starts at links-and-navigation", rec.primaryId === "links-and-navigation");
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
  "// TODO: when #inc is clicked, add 1 to the number in #count",
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
  const m0 = missionById("web-and-browsers")!;
  const m1 = missionById("first-page")!;
  ok("fresh mission verb", missionActionLabel(m0, v, null) === "Start mission");
  ok("gated mission has no verb", missionActionLabel(m1, v, null) === "");
  const prog = (missionId: string, over: any = {}) => ({
    missionId, code: "", startedAt: null, attempts: 0, checksPassed: [],
    hintsUsed: 0, maxHintLevel: 0, questionsAnswered: {}, questionsCorrect: {},
    completedAt: null, masteredAt: null, independent: false, xpAwarded: 0, ...over,
  });
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

console.log(`\nALL ${passed} ASSERTIONS PASSED`);
})();
