import type { Mission } from "./types";

/* Stage 3 pilot: the first scripted (JavaScript) mission. Behavior is
   assessed by driving the rendered page through the sandbox harness —
   clicks in, observations out, verdict parent-side. */

export const MISSIONS_D: Mission[] = [
  {
    id: "js-counter",
    stageId: "js",
    title: "Make it count",
    tagline: "Pilot: your first interactive page — clicks in, numbers out.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Select elements with getElementById",
      "React to clicks with addEventListener",
      "Update the page by writing textContent",
    ],
    prereqIds: ["css-landing"],
    competencyIds: ["js-logic", "dom-events"],
    whyItMatters:
      "Selecting something, listening for something, updating something — that loop is 80% of frontend interactivity. Everything later (forms, fetch, frameworks) is this loop wearing a costume.",
    lesson: [
      {
        kind: "prose",
        body: "JavaScript talks to the page through the **DOM**. Three moves cover this mission:\n\n- **Select**: `document.getElementById('count')` grabs the element with `id=\"count\"`.\n- **Listen**: `button.addEventListener('click', () => { … })` runs your function on every click.\n- **Update**: `el.textContent = '2'` rewrites what the visitor sees.\n\nYour script runs in a sandboxed preview: fully interactive, fully isolated. Press **Run** and click the button yourself before you press **Check**.",
      },
      {
        kind: "example",
        body: "The whole pattern in four lines:",
        code: "const btn = document.getElementById('inc');\nconst out = document.getElementById('count');\nbtn.addEventListener('click', () => {\n  out.textContent = String(Number(out.textContent) + 1);\n});",
      },
      {
        kind: "task",
        body: "Wire up the counter: clicking **#inc** adds **1** to the number in **#count**. The automated check will click twice and expect **2**. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>Counter</title>\n  </head>\n  <body>\n    <h1>Counter</h1>\n    <p id=\"count\">0</p>\n    <button id=\"inc\" type=\"button\">+1</button>\n    <script>\n      // TODO: when #inc is clicked, add 1 to the number in #count\n    </script>\n  </body>\n</html>\n",
    checks: [
      {
        id: "has-button",
        label: "A #inc button exists",
        feedback: "No element with id=\"inc\" found. Keep the starter button — the test clicks it.",
        rule: { kind: "has-element", selector: "#inc" },
      },
      {
        id: "has-handler",
        label: "A click handler is wired in script",
        feedback:
          "No event wiring found in your <script>. Use button.addEventListener('click', …) — and check the script has no syntax errors (a broken script wires nothing).",
        rule: { kind: "text-match", selector: "script", pattern: "addEventListener|onclick|function" },
      },
      {
        id: "counter-works",
        label: "Two clicks show 2 (interactive test)",
        feedback:
          "After two clicks the count didn't read 2. Click it yourself in the preview: does the number move? Common culprits: selecting the wrong id, forgetting Number() (so '0'+1 becomes '01'), or a script error — open each suspect in order.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "c1", act: "click", selector: "#inc" },
            { id: "c2", act: "click", selector: "#inc" },
            { id: "r", act: "read", selector: "#count", prop: "text" },
          ],
          assertions: [{ op: "r", equals: "2" }],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "What does btn.addEventListener('click', fn) do?",
        options: [
          "Calls fn once immediately",
          "Calls fn every time btn is clicked",
          "Clicks btn automatically",
          "Removes all other click handlers",
        ],
        answer: 1,
        explanation:
          "addEventListener registers fn for future clicks — it doesn't run it now, and it stacks with other listeners rather than replacing them.",
      },
    ],
    hintLadder: [
      "Three moves: select both elements, listen on the button, update the count. Which line does what in the example?",
      "getElementById grabs each element once, outside the listener. Inside, read the current text, add one, write it back.",
      "Without Number(), '0' + 1 is the string '01' — the test expects the number 2 as text. Convert, then String() it back.",
      "If clicks do nothing at all, the listener never attached: check both ids character by character and look for a script typo above the addEventListener line.",
      "Solution shape is the four example lines adapted to your ids. Transfer: add a reset button that sets the count to 0 — same loop, new branch.",
    ],
    misconceptions: [
      "Forgetting Number() — string concatenation masquerades as addition.",
      "Querying inside the handler every click — works, but selecting once outside is the habit.",
      "A silent script error above the wiring — nothing attaches and nothing complains visibly.",
    ],
    completionNote: "Your page listens and responds — the fundamental interactive loop.",
    masteryNote: "Select–listen–update with minimal help. The DOM is no longer read-only.",
    needsScript: true,
  },
];
