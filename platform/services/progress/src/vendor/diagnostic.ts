import type { DiagnosticItem } from "./types.js";

/* Practical diagnostic (PRD §5.3): short tasks, not self-ratings.
   Skipping is allowed and never punished — a skip records "unknown",
   which routes the learner to the introductory material.

   The order matters: the first three items probe the FOUNDATIONS layers, so a
   learner with no programming experience is placed into the language path
   rather than dropped into a web track they never asked for. The remaining
   items probe the application track and only move a learner deeper once the
   language layer has been demonstrated. */

export const DIAGNOSTIC_ITEMS: DiagnosticItem[] = [
  {
    id: "diag-lang-order",
    layerId: "language",
    competencyId: "go-control-flow",
    skill: "Reading a program",
    prompt: "What does this program print, exactly?",
    code: "total := 0\nfor i := 1; i <= 3; i++ {\n    total = total + i\n}\nfmt.Println(total)",
    options: ["3", "6", "10", "It does not compile"],
    answer: 1,
    explanation:
      "The loop adds 1, 2 and 3: the total is 6. Following execution in order is the whole skill this item probes.",
  },
  {
    id: "diag-lang-type",
    layerId: "language",
    competencyId: "go-values",
    skill: "Values and types",
    prompt: "What happens when this runs?",
    code: "age := 30\nfmt.Println(age + \" years old\")",
    options: [
      "It prints 30 years old",
      "It fails to compile: mismatched types int and string",
      "It prints an error at runtime",
      "It prints years old",
    ],
    answer: 1,
    explanation:
      "Go has no implicit number-to-text conversion, so the compiler stops you and asks you to convert deliberately.",
  },
  {
    id: "diag-lang-func",
    layerId: "language",
    competencyId: "go-functions",
    skill: "Functions and errors",
    prompt: "What is the second returned value in this function for?",
    code: "func parse(s string) (int, error) {\n    ...\n}",
    options: [
      "It is the length of s",
      "It reports whether the conversion succeeded",
      "It is a second result value",
      "It makes the function run faster",
    ],
    answer: 1,
    explanation:
      "Go returns errors as ordinary values, so a function hands back the result and the reason it might not exist.",
  },
  {
    id: "diag-html-structure",
    competencyId: "html-structure",
    skill: "HTML document structure",
    prompt: "Which snippet is a correctly structured HTML document?",
    options: [
      "<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>",
      "<html><body><head>Hi</head></body><title>Hi</title></html>",
      "<head><body><h1>Hi</h1></body></head>",
      "<html><h1>Hi</h1><p>No head or body needed</p></html>",
    ],
    answer: 0,
    explanation:
      "A document needs <html> wrapping a <head> (metadata like <title>) and a <body> (visible content), in that order.",
  },
  {
    id: "diag-semantics",
    competencyId: "html-structure",
    skill: "Semantic elements",
    prompt:
      "A blog post's main content is wrapped in <div class=\"article\">. What is the most meaningful replacement?",
    options: ["<span class=\"article\">", "<article>", "<section class=\"div\">", "<bold>"],
    answer: 1,
    explanation:
      "<article> tells browsers and assistive technologies that this is a self-contained composition — a <div> says nothing.",
  },
  {
    id: "diag-js-predict",
    competencyId: "js-logic",
    skill: "Reading JavaScript",
    prompt: "What does this program log?",
    code: "const scores = [4, 9, 2];\nconst best = scores.filter((s) => s > 3);\nconsole.log(best.length);",
    options: ["3", "2", "9", "It throws an error"],
    answer: 1,
    explanation:
      "filter keeps 4 and 9 (both > 3), so best has length 2. If this felt unfamiliar, the JavaScript stage will build it up from zero.",
  },
  {
    id: "diag-css-fix",
    competencyId: "css-layout",
    skill: "Reading CSS",
    prompt: "This rule has no visible effect. What is the most likely cause?",
    code: ".signup-button {\n  colour: white;\n  background-color: navy;\n}",
    options: [
      "The class is not used in the HTML",
      "colour is not a valid CSS property — it should be color",
      "navy is not a valid color",
      "CSS cannot style buttons",
    ],
    answer: 1,
    explanation:
      "CSS uses American spelling: color, not colour. Unknown property names are silently ignored — a classic silent failure.",
  },
  {
    id: "diag-git-diff",
    competencyId: "git-workflow",
    skill: "Reading a diff",
    prompt: "In a Git diff, what does a line starting with + mean?",
    code: "  <h1>Welcome</h1>\n- <p>Old intro</p>\n+ <p>New intro</p>",
    options: [
      "The line was deleted",
      "The line was added",
      "The line has a merge conflict",
      "The line was commented out",
    ],
    answer: 1,
    explanation:
      "+ marks added lines, − marks removed ones. Reading diffs is the core skill of code review.",
  },
  {
    id: "diag-debug",
    competencyId: "testing-quality",
    skill: "Debugging instinct",
    prompt:
      "A page shows a button, but clicking it does nothing and there are no errors. What is the most productive first step?",
    options: [
      "Rewrite the whole page from scratch",
      "Check whether any click handler is actually attached to the button",
      "Add more buttons to see if any of them work",
      "Assume the browser is broken and switch browsers",
    ],
    answer: 1,
    explanation:
      "Debugging is hypothesis-driven: verify the simplest assumption first — is the handler even wired up? — before changing anything.",
  },
];

/* ---------- Placement ----------
   Placement walks the layers in order. A learner is placed at the EARLIEST
   layer they have not demonstrated, which is what keeps a true beginner out of
   a specialisation they never chose. */

export interface DiagnosticProbe {
  itemId: string;
  correct: boolean;
  skipped: boolean;
}

/** Items that probe the language layer — the gate onto the whole Go path. */
export const LANGUAGE_ITEM_IDS: string[] = DIAGNOSTIC_ITEMS.filter(
  (i) => i.layerId === "language"
).map((i) => i.id);

/** Items that probe document structure, which sets the depth inside the web track. */
export const HTML_ITEM_IDS: string[] = DIAGNOSTIC_ITEMS.filter(
  (i) => i.competencyId === "html-structure"
).map((i) => i.id);

/** Items that probe the application track as a whole. */
export const WEB_ITEM_IDS: string[] = DIAGNOSTIC_ITEMS.filter(
  (i) => i.layerId !== "language"
).map((i) => i.id);

/** The mission a result set places the learner at. */
export function placementStartMissionId(probes: DiagnosticProbe[]): string {
  const passed = (id: string) => probes.some((p) => p.itemId === id && p.correct);
  const languageScore = LANGUAGE_ITEM_IDS.filter(passed).length;
  const htmlScore = HTML_ITEM_IDS.filter(passed).length;
  const webScore = WEB_ITEM_IDS.filter(passed).length;

  // The second persona: someone who already builds for the web. Demonstrated
  // application competence outranks an incomplete language layer, because the
  // diagnostic exists precisely so capable learners are not made to re-walk
  // foundations they can already apply. The bar is deliberately high — both
  // document-structure items and four more — so a lucky guess cannot fire it.
  if (htmlScore === 2 && webScore >= 4) return "links-and-navigation";

  // Layer 1 — no programming demonstrated at all. Start before syntax.
  if (languageScore === 0) return "how-programs-run";
  // Layer 2 — partial fluency: enter Go where the material still teaches.
  if (languageScore === 1) return "go-values";
  if (languageScore === 2) return "go-functions";

  // The language layer is demonstrated but the web track is not. The
  // document-structure items set the depth if there is any exposure at all.
  if (htmlScore === 2) return "links-and-navigation";
  if (htmlScore === 1) return "first-page";

  // Can program, no web exposure: algorithms come before any track.
  return "go-slices";
}

/** Cell-prose version of the intent above, shown on the results screen. */
export function placementExplanation(probes: DiagnosticProbe[]): string {
  const startId = placementStartMissionId(probes);
  const foundationStarts = [
    "how-programs-run",
    "go-values",
    "go-functions",
    "go-slices",
  ];
  if (foundationStarts.includes(startId)) {
    return "You are starting in the foundations layer: one language, then how to reason about data with it. The application track opens when you get there — you will choose it with evidence, not a guess.";
  }
  return "You demonstrated the language layer, so your path starts in the web track. The foundations stages stay open as review rather than being locked away.";
}
