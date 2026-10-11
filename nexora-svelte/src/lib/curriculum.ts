import type { Competency, Stage } from "./types";

/* Canonical 10-stage Web Development path (PRD §7).
   Stage 1 ships with full missions in the MVP; stages 2–10 are
   navigable previews so the journey reads as one coherent map. */

export const COMPETENCIES: Competency[] = [
  {
    id: "html-structure",
    name: "HTML structure & semantics",
    domain: "Web foundations",
    description:
      "Write well-formed HTML documents and choose elements that communicate meaning to browsers, assistive technologies, and other developers.",
    proficientLooksLike:
      "Pages validate structurally: one h1, landmarks (header/main/footer/nav), semantic sectioning, no orphaned or unclosed tags.",
  },
  {
    id: "html-links-nav",
    name: "Links & navigation",
    domain: "Web foundations",
    description:
      "Connect pages with relative and absolute URLs and build navigation that works without JavaScript.",
    proficientLooksLike:
      "Multi-page sites link correctly with relative paths; navigation is wrapped in <nav> with meaningful link text.",
  },
  {
    id: "html-media",
    name: "Media & accessibility basics",
    domain: "Web foundations",
    description:
      "Embed images and media responsibly with alternative text and accessible fallbacks.",
    proficientLooksLike:
      "Every informative image has concise, meaningful alt text; decorative images are hidden from assistive tech.",
  },
  {
    id: "html-forms",
    name: "Forms & input",
    domain: "Web foundations",
    description:
      "Build forms with correctly associated labels, appropriate input types, and native validation.",
    proficientLooksLike:
      "Every input has a label (or accessible name), types match the data requested, and required fields are declared.",
  },
  {
    id: "css-layout",
    name: "CSS layout & responsive design",
    domain: "Frontend",
    description:
      "Control presentation with the cascade, box model, Flexbox/Grid, and media queries. (Stage 2 — preview)",
    proficientLooksLike: "Layouts adapt across viewports without breakage.",
  },
  {
    id: "js-logic",
    name: "JavaScript logic",
    domain: "Frontend",
    description:
      "Write correct program logic with functions, control flow, and data structures. (Stage 3 — preview)",
    proficientLooksLike: "Functions are pure where possible; edge cases handled.",
  },
  {
    id: "dom-events",
    name: "DOM manipulation & events",
    domain: "Frontend",
    description:
      "Make pages interactive through DOM APIs and event handling. (Stage 3 — preview)",
    proficientLooksLike: "Reliable event handling and DOM updates.",
  },
  {
    id: "async",
    name: "Asynchronous programming",
    domain: "Frontend",
    description:
      "Fetch data, handle promises, and recover from network failure. (Stages 3/5 — preview)",
    proficientLooksLike: "Loading, success, and error states all handled.",
  },
  {
    id: "git-workflow",
    name: "Git & version control",
    domain: "Development workflow",
    description:
      "Commit, branch, merge, and review changes like a working developer. (Stage 4 — preview)",
    proficientLooksLike: "Clean branches, clear commits, confident diffs.",
  },
  {
    id: "frontend-arch",
    name: "Frontend architecture",
    domain: "Frontend",
    description:
      "Structure larger apps with components, state, and routing. (Stage 5 — preview)",
    proficientLooksLike: "Sensible component boundaries and predictable state.",
  },
  {
    id: "api-design",
    name: "API design & integration",
    domain: "Backend",
    description:
      "Build and consume HTTP APIs with validation and sane errors. (Stage 6 — preview)",
    proficientLooksLike: "Correct contracts, validation, meaningful errors.",
  },
  {
    id: "data-modeling",
    name: "Databases & data modeling",
    domain: "Data",
    description:
      "Model relational data and query it correctly. (Stage 7 — preview)",
    proficientLooksLike: "Sound schema, correct queries, data integrity.",
  },
  {
    id: "testing-quality",
    name: "Testing & debugging",
    domain: "Quality",
    description:
      "Reproduce bugs, write regression tests, refactor safely. (Stage 8 — preview)",
    proficientLooksLike: "Failing-first tests, safe refactors.",
  },
  {
    id: "deployment-ops",
    name: "Deployment & operations",
    domain: "Operations",
    description:
      "Ship software, read logs, recover from incidents. (Stage 9 — preview)",
    proficientLooksLike: "Reproducible deploys, clear incident reports.",
  },
  {
    id: "eng-communication",
    name: "Engineering communication",
    domain: "Professional practice",
    description:
      "Document decisions, write useful reviews and READMEs. (Stages 4–10 — preview)",
    proficientLooksLike: "Clear docs, kind and precise reviews.",
  },
];

export const STAGES: Stage[] = [
  {
    id: "html",
    num: 1,
    title: "HTML Foundations",
    goal: "Understand how web documents are structured.",
    description:
      "How browsers read documents, semantic elements, links, media, lists, and forms — the skeleton everything else hangs on.",
    missionIds: [
      "web-and-browsers",
      "first-page",
      "text-and-structure",
      "links-and-navigation",
      "images-and-alt",
      "lists",
      "semantic-html",
      "contact-form",
      "personal-website",
    ],
  },
  {
    id: "css",
    num: 2,
    title: "CSS Foundations",
    goal: "Control layout, visual presentation, and responsive behavior.",
    description:
      "Cascade, box model, Flexbox, Grid, responsive design — make pages look intentional on every screen.",
    missionIds: [
      "css-selectors",
      "css-box-model",
      "css-flexbox",
      "css-grid",
      "css-responsive",
      "css-variables",
      "css-debug",
      "css-landing",
    ],
  },
  {
    id: "js",
    num: 3,
    title: "JavaScript Foundations",
    goal: "Add behavior and logic to web pages.",
    description:
      "Variables to async: DOM manipulation, events, fetch, and debugging with developer tools.",
    missionIds: ["js-counter"],
  },
  {
    id: "git",
    num: 4,
    title: "Developer Tools & Git",
    goal: "Work like a developer, not just write code.",
    description:
      "Command line, commits, branches, merge conflicts, diffs, and collaboration on GitHub.",
    missionIds: [],
  },
  {
    id: "frontend",
    num: 5,
    title: "Modern Frontend Development",
    goal: "Build larger interactive applications with reusable components.",
    description:
      "Component architecture, state, routing, loading/error states, and frontend testing.",
    missionIds: [],
  },
  {
    id: "backend",
    num: 6,
    title: "HTTP, APIs & Backend",
    goal: "Understand how applications communicate; implement server-side functionality.",
    description:
      "REST conventions, Node.js, validation, auth concepts, and API testing.",
    missionIds: [],
  },
  {
    id: "databases",
    num: 7,
    title: "Databases & Data Modeling",
    goal: "Store, query, and protect application data.",
    description:
      "SQL, schema design, constraints, migrations, and query performance.",
    missionIds: [],
  },
  {
    id: "testing",
    num: 8,
    title: "Testing & Software Quality",
    goal: "Make software reliable and maintainable.",
    description:
      "Unit to end-to-end tests, regression discipline, refactoring, and security basics.",
    missionIds: [],
  },
  {
    id: "deployment",
    num: 9,
    title: "Deployment & Operations",
    goal: "Ship and maintain software.",
    description:
      "Builds, CI/CD, logs, monitoring, rollbacks, and incident postmortems.",
    missionIds: [],
  },
  {
    id: "capstone",
    num: 10,
    title: "Independent Engineering",
    goal: "Deliver a project with minimal guidance.",
    description:
      "A real brief, an existing repo, tests, review, deployment — and a defense of your trade-offs.",
    missionIds: [],
  },
];

export function competencyById(id: string): Competency | undefined {
  return COMPETENCIES.find((c) => c.id === id);
}

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}
