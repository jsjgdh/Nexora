import type { DiagnosticItem } from "./types";

/* Practical diagnostic (PRD §5.3): short tasks, not self-ratings.
   Skipping is allowed and never punished — a skip records "unknown",
   which routes the learner to the introductory material. */

export const DIAGNOSTIC_ITEMS: DiagnosticItem[] = [
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

/** Map average diagnostic performance to a starting mission. */
export function htmlStartIndex(results: { correct: boolean; skipped: boolean }[]): number {
  const htmlItems = [0, 1]; // indices into DIAGNOSTIC_ITEMS assessing HTML
  const htmlCorrect = htmlItems.filter((i) => results[i] && results[i].correct).length;
  if (htmlCorrect === 2) return 3; // start at links-and-navigation, intros optional
  if (htmlCorrect === 1) return 1;
  return 0;
}
