import type { Competency, Layer, LayerId, Stage, Track } from "./types.js";

/* The path, in four layers (confirmed with the user):
   foundations → one language → algorithms → application tracks.

   A first-time programmer must NOT choose a specialisation first. You learn a
   language, then how to reason about data with it, and only then do you apply
   it. The web track therefore sits LAST and is gated behind the foundations
   — while a diagnostic-placed learner skips straight into it, because
   placement waives prerequisites that lie before the placed starting point. */

export const LAYERS: Layer[] = [
  {
    id: "orientation",
    num: 1,
    title: "Foundations",
    heading: "How software works",
    claim: "What a program is, and what actually runs when you press run.",
    rationale:
      "Before syntax, the mental model: machines follow instructions, and a bug is an instruction that did not say what you meant.",
  },
  {
    id: "language",
    num: 2,
    title: "Language",
    heading: "One language, properly",
    claim: "Go: values, control flow, functions, errors, collections.",
    rationale:
      "One language learned properly beats five skimmed. Everything later — including the web track — is written in it.",
  },
  {
    id: "dsa",
    num: 3,
    title: "Algorithms",
    heading: "Data structures & algorithms",
    claim: "Slices, maps, searching, sorting, recursion, and the cost of it all.",
    rationale:
      "This is the difference between following a tutorial and being able to solve a problem you have never seen. It comes before any framework.",
  },
  {
    id: "application",
    num: 4,
    title: "Application",
    heading: "Application tracks",
    claim: "Web: documents, styling, behaviour, APIs, data, shipping.",
    rationale:
      "Now the specialisation is a choice, not a guess: you bring a language and problem-solving to it.",
  },
];

export const TRACKS: Track[] = [
  {
    id: "platform",
    name: "How software works",
    language: "concepts",
    layerId: "orientation",
    blurb: "No language yet — just the machine, the instructions, and the mistake.",
  },
  {
    id: "go",
    name: "Go",
    language: "go",
    layerId: "language",
    blurb: "One compiled language, from first program to algorithms.",
  },
  {
    id: "web",
    name: "Web Development",
    language: "web",
    layerId: "application",
    blurb: "The browser, the server, the database, and shipping it to real people.",
  },
];

export const COMPETENCIES: Competency[] = [
  {
    id: "prog-model",
    name: "The program model",
    domain: "Foundations",
    description:
      "Understand that a program is a list of instructions executed in order, and that data flows through it as values.",
    proficientLooksLike:
      "Can trace a short program line by line and say what happens when it runs.",
  },
  {
    id: "go-values",
    name: "Values, types & variables",
    domain: "Go",
    description:
      "Declare and reassign variables in Go, choose appropriate types, and convert between them deliberately.",
    proficientLooksLike:
      "Correct type choices; no accidental string/number confusion; clear naming.",
  },
  {
    id: "go-control-flow",
    name: "Control flow",
    domain: "Go",
    description:
      "Direct execution with if/else, for, and switch, including the off-by-one and boundary mistakes they invite.",
    proficientLooksLike:
      "Predicts loop output exactly; handles the empty and single-item cases.",
  },
  {
    id: "go-functions",
    name: "Functions & errors",
    domain: "Go",
    description:
      "Structure programs into named functions, return multiple values, and handle errors instead of ignoring them.",
    proficientLooksLike:
      "Small single-purpose functions; errors checked, wrapped, and surfaced with context.",
  },
  {
    id: "go-structs",
    name: "Structs & data modeling",
    domain: "Go",
    description:
      "Define named record types, create independent values, and read their fields to model related data.",
    proficientLooksLike:
      "Can define a small struct, create keyed values, and explain how functions use its fields.",
  },
  {
    id: "go-methods",
    name: "Methods & receivers",
    domain: "Go",
    description:
      "Attach behavior to a named type with receivers, call methods through values, and distinguish a read-only value receiver from mutation.",
    proficientLooksLike:
      "Can read a method receiver, make a method call on the right type, and explain whether it changes the caller's value.",
  },
  {
    id: "go-interfaces",
    name: "Interfaces & behavior contracts",
    domain: "Go",
    description:
      "Describe required behavior with method sets, rely on implicit satisfaction, and write consumers that accept different concrete values.",
    proficientLooksLike:
      "Can define a small interface, identify satisfying types by their methods, and write a consumer that depends only on that contract.",
  },
  {
    id: "go-packages",
    name: "Packages & imports",
    domain: "Go",
    description:
      "Read package clauses, import packages, use exported names through qualifiers, and distinguish packages from modules.",
    proficientLooksLike:
      "Can read an import and package clause, qualify an exported identifier, and explain the package/module distinction.",
  },
  {
    id: "go-collections",
    name: "Collections & data structures",
    domain: "Algorithms",
    description:
      "Work with slices and maps: append, index, iterate, look up, and know what each operation costs.",
    proficientLooksLike:
      "Picks the right structure for the job and knows why the other one is worse.",
  },
  {
    id: "algo-complexity",
    name: "Reasoning about cost",
    domain: "Algorithms",
    description:
      "Read a loop and estimate its growth; recognise searching, sorting, and recursion as reusable strategies.",
    proficientLooksLike:
      "Explains why an O(n²) pass is fine at 100 items and not at 100,000.",
  },
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
      "Control presentation with the cascade, box model, Flexbox/Grid, and media queries. (Stage 8 — preview)",
    proficientLooksLike: "Layouts adapt across viewports without breakage.",
  },
  {
    id: "js-logic",
    name: "JavaScript logic",
    domain: "Frontend",
    description:
      "Write correct program logic with functions, control flow, and data structures. (Stage 9 — preview)",
    proficientLooksLike: "Functions are pure where possible; edge cases handled.",
  },
  {
    id: "dom-events",
    name: "DOM manipulation & events",
    domain: "Frontend",
    description:
      "Make pages interactive through DOM APIs and event handling. (Stage 9 — preview)",
    proficientLooksLike: "Reliable event handling and DOM updates.",
  },
  {
    id: "async",
    name: "Asynchronous programming",
    domain: "Frontend",
    description:
      "Fetch data, handle promises, and recover from network failure. (Stages 9/11 — preview)",
    proficientLooksLike: "Loading, success, and error states all handled.",
  },
  {
    id: "git-workflow",
    name: "Git & version control",
    domain: "Development workflow",
    description:
      "Commit, branch, merge, and review changes like a working developer. (Stage 9)",
    proficientLooksLike: "Clean branches, clear commits, confident diffs.",
  },
  {
    id: "frontend-arch",
    name: "Frontend architecture",
    domain: "Frontend",
    description:
      "Structure larger apps with components, state, and routing. (Stage 11 — preview)",
    proficientLooksLike: "Sensible component boundaries and predictable state.",
  },
  {
    id: "api-design",
    name: "API design & integration",
    domain: "Backend",
    description:
      "Build and consume HTTP APIs with validation and sane errors. (Stage 12 — preview)",
    proficientLooksLike: "Correct contracts, validation, meaningful errors.",
  },
  {
    id: "data-modeling",
    name: "Databases & data modeling",
    domain: "Data",
    description:
      "Model relational data and query it correctly. (Stage 13 — preview)",
    proficientLooksLike: "Sound schema, correct queries, data integrity.",
  },
  {
    id: "testing-quality",
    name: "Testing & debugging",
    domain: "Quality",
    description:
      "Reproduce bugs, write regression tests, refactor safely. (Stage 14 — preview)",
    proficientLooksLike: "Failing-first tests, safe refactors.",
  },
  {
    id: "deployment-ops",
    name: "Deployment & operations",
    domain: "Operations",
    description:
      "Ship software, read logs, recover from incidents. (Stage 15 — preview)",
    proficientLooksLike: "Reproducible deploys, clear incident reports.",
  },
  {
    id: "eng-communication",
    name: "Engineering communication",
    domain: "Professional practice",
    description:
      "Document decisions, write useful reviews and READMEs. (Stages 10–16 — preview)",
    proficientLooksLike: "Clear docs, kind and precise reviews.",
  },
];

/* Canonical path, layer by layer. Only the early stages carry authored
   missions; everything else is a navigable preview so the journey reads as
   one coherent path rather than a cliff. */

export const STAGES: Stage[] = [
  {
    id: "orientation",
    num: 1,
    title: "How software works",
    layerId: "orientation",
    trackId: "platform",
    goal: "Build the mental model every later stage relies on.",
    description:
      "What a program actually is, how a machine runs one, why values have types, and what a bug really is. No framework, no browser — just the machine.",
    missionIds: ["how-programs-run", "input-process-output"],
  },
  {
    id: "go-basics",
    num: 2,
    title: "Go Basics",
    layerId: "language",
    trackId: "go",
    goal: "Write, read, and predict short Go programs.",
    description:
      "Your first Go program, values and types, control flow, and functions — the vocabulary you will use in every stage after this one.",
    missionIds: ["go-first-program", "go-values", "go-control-flow", "go-functions"],
  },
  {
    id: "go-practice",
    num: 3,
    title: "Go in Practice",
    layerId: "language",
    trackId: "go",
    goal: "Write Go that survives contact with real input.",
    description:
      "Errors as values, reading and validating input, modeling related data, sharing behavior across types, and reusing packages.",
    missionIds: ["go-errors", "go-structs", "go-methods", "go-interfaces", "go-packages"],
  },
  {
    id: "go-dsa",
    num: 4,
    title: "Data Structures & Algorithms in Go",
    layerId: "dsa",
    trackId: "go",
    goal: "Solve unfamiliar problems, not just familiar ones.",
    description:
      "Slices and maps: the collections that later searching and sorting strategies build on.",
    missionIds: ["go-slices", "go-maps"],
  },
  {
    id: "dsa-more",
    num: 5,
    title: "Algorithms, Deeper",
    layerId: "dsa",
    trackId: "go",
    goal: "Recognise standard problem shapes and their costs.",
    description:
      "Binary search, insertion sort, recursion, and operation counts — big-O as a working instinct rather than a memorised table.",
    missionIds: ["go-binary-search", "go-insertion-sort", "go-recursive-sum", "go-cost-instinct"],
  },
  {
    id: "html",
    num: 6,
    title: "HTML Foundations",
    layerId: "application",
    trackId: "web",
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
    num: 7,
    title: "CSS Foundations",
    layerId: "application",
    trackId: "web",
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
    num: 8,
    title: "JavaScript Foundations",
    layerId: "application",
    trackId: "web",
    goal: "Add behavior and logic to web pages.",
    description:
      "Variables to async: DOM manipulation, events, fetch, and debugging with developer tools.",
    missionIds: [
      "js-counter",
      "js-logic",
      "js-state",
      "js-arrays",
      "js-dom",
      "js-forms",
      "js-async",
      "js-debug",
      "js-boss",
    ],
  },
  {
    id: "git",
    num: 9,
    title: "Developer Tools & Git",
    layerId: "application",
    trackId: "web",
    goal: "Work like a developer, not just write code.",
    description:
      "Command line, commits, branches, merge conflicts, diffs, and collaboration on GitHub.",
    missionIds: ["git-resolve-conflict", "scenario-duration-format", "scenario-new-workspace-crash"],
  },
  {
    id: "frontend",
    num: 10,
    title: "Modern Frontend Development",
    layerId: "application",
    trackId: "web",
    goal: "Build larger interactive applications with reusable components.",
    description:
      "Component architecture, state, routing, loading/error states, and frontend testing.",
    missionIds: [],
  },
  {
    id: "backend",
    num: 11,
    title: "HTTP, APIs & Backend",
    layerId: "application",
    trackId: "web",
    goal: "Understand how applications communicate; implement server-side functionality.",
    description:
      "REST conventions, services in Go, validation, auth concepts, and API testing.",
    missionIds: [],
  },
  {
    id: "databases",
    num: 12,
    title: "Databases & Data Modeling",
    layerId: "application",
    trackId: "web",
    goal: "Store, query, and protect application data.",
    description:
      "SQL, schema design, constraints, migrations, and query performance.",
    missionIds: [],
  },
  {
    id: "testing",
    num: 13,
    title: "Testing & Software Quality",
    layerId: "application",
    trackId: "web",
    goal: "Make software reliable and maintainable.",
    description:
      "Unit to end-to-end tests, regression discipline, refactoring, and security basics.",
    missionIds: [],
  },
  {
    id: "deployment",
    num: 14,
    title: "Deployment & Operations",
    layerId: "application",
    trackId: "web",
    goal: "Ship and maintain software.",
    description:
      "Builds, CI/CD, logs, monitoring, rollbacks, and incident postmortems.",
    missionIds: [],
  },
  {
    id: "capstone",
    num: 15,
    title: "Independent Engineering",
    layerId: "application",
    trackId: "web",
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

export function layerById(id: LayerId): Layer | undefined {
  return LAYERS.find((l) => l.id === id);
}

export function trackById(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}

export function stagesInLayer(id: LayerId): Stage[] {
  return STAGES.filter((s) => s.layerId === id);
}

/** The layer that owns a stage — the wayfinding header above a change. */
export function layerForStage(stageId: string): Layer {
  const stage = stageById(stageId);
  return (stage && layerById(stage.layerId)) ?? LAYERS[0];
}

/** First stage of the whole path — where a true beginner starts, always. */
export const FIRST_STAGE_ID = STAGES[0].id;
