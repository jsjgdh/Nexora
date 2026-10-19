/* The front door's copy, in one place.
 *
 * This module exists for two reasons, and both of them are about the suite
 * rather than about tidiness.
 *
 * First, the previous build kept the landing page's sentences inside the
 * template that rendered them, so `scripts/verify.ts` had to grep the markup
 * to prove the product was described honestly. That couples an assertion about
 * the *claim* to the shape of the *element*, which is exactly backwards: a
 * redesign should not be able to fail a product-honesty test, and a dishonest
 * claim should not be able to hide behind a new class name. The assertions now
 * read these exports.
 *
 * Second, the words here are drawn from the research the studio did, not
 * invented for a landing page. `D:\nexora\resaerch.md` is the source: the six
 * value propositions in §3, the hiring-market readings in §2, the shape of the
 * market in §1, and the sample headlines in §8. Where the research promises
 * something the product does not have (a trial, a placement rate, a portfolio
 * the learner can attach to a ticket), the promise is dropped and the honest
 * substitute is used instead, because a page that sells a future is a page
 * that has to be apologised for later.
 *
 * The positioning line is the studio's own — both clauses of it, because the
 * second clause ("and that tells you when it can't") is the differentiator and
 * the first alone is table stakes. The words in `CLAIMED_WORDS` are the words
 * that audience already uses; `FORBIDDEN_WORDS` is the list the same document
 * forbids, and `verify.ts` now fails if any of them appears in the copy.
 *
 * Nothing here is a number we have not measured. The phase lists are the real
 * shipped curriculum, the free phases are the phases the installer really
 * bundles, and the readings in `MARKET` are the research's own figures with
 * the study named beside each one. There is no testimonial, logo, price or
 * download in this file because there is nothing true to put in one.
 *
 * The second half of this file is the market's other half. The research names
 * two audiences — the person learning, and the person who hires — and the
 * previous build only ever spoke to the first one. A hiring manager arrives
 * with a different question and a different standard of proof, so `HIRING`,
 * `PROPS`, `SPEC` and `EMPLOYER` answer it directly, in the product's own
 * terms, and say plainly what is not built yet. */

/** The product's name, as printed. */
export const BRAND = "NEXORA";

/**
 * The two lines the chrome prints: what the product is, and where it stands
 * today. Both are facts rather than adjectives, because a masthead that
 * carries a claim has to be able to defend it.
 */
export const MASTHEAD = {
  descriptor: "the course that runs inside your editor",
  status: "80 phases · 9 free · inside the editor",
} as const;

/**
 * The one line, for a stranger. Both clauses. Source: `company/MARKET.md` §2.
 */
export const POSITIONING =
  "The IDE that won't tell you you've learned something until it can prove it, and that tells you when it can't.";

/** The same claim, cut for a title tag and a social card. */
export const TAGLINE =
  "A course inside a real IDE, where a rule engine decides whether your code passed, and a receipt lets anyone check.";

/**
 * The three headlines the research offers, kept as a real test rather than a
 * footnote.
 *
 * The research's §5 asks for a headline split test, and a split test that
 * cannot be run is a wish. So the page assigns one of these server-side, from
 * a query string or a cookie, and writes the assignment into the document.
 * Each variant says the same true thing in a different way: the product is a
 * course that runs in the editor, it is checked rather than graded, and the
 * record of it can be re-derived by a stranger.
 */
export const HERO_VARIANTS = [
  {
    id: "a",
    lineOne: "Build real software.",
    lineTwo: "Not another quiz.",
    markOne: "real",
    lede: "A course that runs inside your editor. Every phase is a working app in your own workspace, and every miss comes back with the reason, the file and the line.",
  },
  {
    id: "b",
    lineOne: "One window, start to finish.",
    lineTwo: "Lesson, editor and test together.",
    markOne: "window",
    lede: "Nothing to paste and no second app to keep in sync. The tutorial, the code and the check are one object, so the work never leaves the screen it started on.",
  },
  {
    id: "c",
    lineOne: "Prove it by building.",
    lineTwo: "Not by answering.",
    markOne: "building",
    lede: "A finished phase leaves a receipt anyone can re-derive: the command, the exit code, the file hash. No score, and nothing to collect.",
  },
] as const;

/**
 * The hero, for the person who is here to learn.
 *
 * The headline is a claim; the lede is the positioning line. The note is the
 * whole commercial offer, because the offer is small and should not need a
 * pricing page to be understood: it is free, the first course is in the box,
 * and no account stands between a visitor and their first verdict.
 */
export const HERO = {
  lineOne: HERO_VARIANTS[0].lineOne,
  lineTwo: HERO_VARIANTS[0].lineTwo,
  markOne: HERO_VARIANTS[0].markOne,
  lede: HERO_VARIANTS[0].lede,
  note: "Free to download. Nine phases ship inside the installer, and they run offline, so your first judged verdict is minutes away rather than an account away.",
  primary: "Try it free",
  primaryShort: "Try free",
  secondary: "See the courses",
} as const;

/**
 * The same hero, for the person who is here to hire.
 *
 * This is the audience the previous build never spoke to, and the research
 * behind this rewrite is blunt about why: entry-level hiring has tightened,
 * and the differentiator that survives it is evidence rather than a claim.
 * So this variant promises the one thing the product can actually back — a
 * receipt anybody can re-derive — and refuses to promise a portfolio, a
 * report or a placement rate, because none of those exist yet.
 */
export const HIRING = {
  lineOne: "Juniors arrive with work,",
  lineTwo: "not with promises.",
  markOne: "work",
  lede: "A finished phase leaves a signed receipt. Anyone can re-derive it at /verify, with no account and no call.",
  
  primary: "See the evidence",
  primaryShort: "See the proof",
  secondary: "Read the curriculum",
} as const;

/**
 * The two doors. The switch in the hero reads this list, and both variants
 * are always in the document: one is hidden, never removed, so a crawler and
 * a screen reader both find the whole argument.
 */
export const AUDIENCES = [
  { id: "learner", label: "I'm learning", ...HERO },
  { id: "employer", label: "I'm hiring", ...HIRING },
] as const;

/**
 * The market the learner and the hirer are both standing in.
 *
 * The research's §2 is the reason this product has the shape it has, and the
 * figures are the research's own, each one attributed to the study it came
 * from. Three of them are about the rung of the ladder and the promise on it.
 * The fourth is the counterweight, because a page that only reports decline is
 * a page that talks a reader out of starting.
 */
export const MARKET = {
  title: "The rung came off the ladder.",
  caption:
    "Four readings from the hiring research, each with the study it came from. The work is still there. What changed is what a stranger can check about the person claiming it.",
  readings: [
    {
      value: "-25%",
      label: "entry-level tech hiring, in 2024",
      source: "Stack Overflow engineering blog, December 2025",
    },
    {
      value: "-20%",
      label: "developer jobs for 22 to 25 year olds, by mid 2025",
      source: "Stack Overflow engineering blog, December 2025",
    },
    {
      value: "6 to 7.5%",
      label: "unemployment for recent computer science graduates, against about 4.3% overall",
      source: "CIO.com",
    },
    {
      value: "+15%",
      label: "growth in software developer jobs projected from 2024 to 2034",
      source: "U.S. Bureau of Labor Statistics",
    },
  ],
  turn: "A title says one thing and a receipt says another, and only one of them can be re-derived by somebody who does not trust us. That is the whole argument for judging the work instead of the person.",
} as const;

/**
 * The six propositions, three for each audience.
 *
 * The research's §3, translated into what this product can back today. The
 * learner's three are about building, flow and proof. The hirer's three are
 * about checkability, onboarding and the habit of reading a machine's output.
 * The switch in the hero switches this list too, because a hiring manager being
 * read learner propositions is being read to.
 */
export const PROPS = {
  learner: [
    {
      id: "build",
      title: "Build real software.",
      body: "Every phase is a working app, not a question about one. You write it in your own workspace and the check runs against your own code.",
    },
    {
      id: "flow",
      title: "Stay in flow.",
      body: "The lesson, the editor and the test are the same window. There is no second app to keep in sync and no code to copy between two places.",
    },
    {
      id: "proof",
      title: "Prove what you can do.",
      body: "Finishing is a build, not an answer. The record of it is a receipt a stranger can re-derive, with no score anywhere inside it.",
    },
  ],
  employer: [
    {
      id: "checkable",
      title: "Skill you can check.",
      body: "You can read what ran, what it judged, what failed and why. No interview needed to find out whether the work exists.",
    },
    {
      id: "onboarding",
      title: "Less time on the basics.",
      body: "The phases assume an editor and a terminal, so a new joiner starts inside the work instead of inside a syllabus.",
    },
    {
      id: "judgement",
      title: "Trained to read the machine.",
      body: "Every miss explains itself, so the habit being built is checking the output rather than trusting it. That is the habit a team that leans on generated code needs most.",
    },
  ],
} as const;

/**
 * What the rest of the market sells, and where each one stops.
 *
 * The research's §1 audit, with the names taken off. A category is a fair
 * thing to describe: a video library teaches recognition, a course
 * subscription teaches a syllabus, an interview simulator teaches
 * interviewing, an assistant writes the answer, enterprise training teaches a
 * team that already hires. None of them is bad. Each of them stops short of
 * the same line, and the line is the one this product is on.
 */
export const LANDSCAPE = {
  title: "Where the other products stop.",
  caption:
    "Five kinds of thing you can buy to learn or to hire. None of them is bad. Each one leaves the same gap, and the gap is the work itself.",
  kinds: [
    {
      name: "The video library",
      leaves: "You can follow a professional perfectly and still be unable to open a blank file.",
    },
    {
      name: "The course subscription",
      leaves: "A syllabus and a progress bar. The work happens in a sandbox nobody else can read.",
    },
    {
      name: "The interview practice",
      leaves: "A simulated interviewer, for people who already interview well.",
    },
    {
      name: "The assistant",
      leaves: "It writes the answer. It is not the one who has to understand it.",
    },
    {
      name: "The enterprise training",
      leaves: "It trains the team that already hires juniors. It does not change what a junior can do on Monday.",
    },
  ],
  ours: "Here the lesson, the editor and the check are one thing, and the check leaves a receipt that anybody can re-derive.",
} as const;

/**
 * The readings on the bench.
 *
 * `MARKET.md` §3 asks for a claim about evidence; this is the evidence, as a
 * datasheet. Every row is a promise the product can keep today, and every row
 * is checkable by the reader without asking us anything.
 */
export const FACTS = [
  { value: "80", label: "phases, judged in the IDE" },
  { value: "9", label: "of them free, no account" },
  { value: "0", label: "badges, scores or streaks" },
  { value: "1", label: "editor, with the course inside it" },
] as const;

export const SPEC = [
  {
    cluster: "where it runs",
    rows: [
      {
        param: "where the lessons run",
        value: "Inside the desktop IDE, on your machine",
        note: "Not a browser tab. There is no second way to learn here, and there is not going to be one.",
      },
      {
        param: "how you sign in",
        value: "A short code shown by the IDE, approved in the browser",
        note: "The editor never asks for your password, so there is nothing to paste and nowhere to mistype.",
      },
      {
        param: "what it costs to start",
        value: "Nothing",
        note: "Nine phases ship inside the installer. Every check is free, forever.",
      },
    ],
  },
  {
    cluster: "what decides a verdict",
    rows: [
      {
        param: "what decides a verdict",
        value: "A deterministic rule engine",
        note: "A model may explain a failure. It never decides one.",
      },
      {
        param: "what a failure returns",
        value: "The reason, the file and the line",
        note: "Not a score, and not a number of attempts.",
      },
      {
        param: "who can check a receipt",
        value: "Anyone, at /verify, with no account",
        note: "You do not have to trust us, and you do not have to be us.",
      },
    ],
  },
  {
    cluster: "what you keep",
    rows: [
      {
        param: "what a pass leaves behind",
        value: "A signed receipt, bound to the file it judged",
        note: "The bytes that were checked are the bytes the signature covers.",
      },
      {
        param: "what it will not issue",
        value: "A badge, a score, a streak, a leaderboard",
        note: "Activity is not evidence, so nothing here counts it.",
      },
    ],
  },
] as const;

/**
 * The employer half of the market, in the product's own terms.
 *
 * `checks` is what a hiring manager can verify today, and each row names the
 * artefact rather than the benefit. `notYet` is the other half of the same
 * promise: the thing that does not exist is stated as plainly as the thing
 * that does, because a hiring manager who finds out in week three that the
 * report they were promised does not exist stops trusting the part that does.
 */
export const EMPLOYER = {
  title: "What a hiring manager can check today.",
  caption:
    "Not a claim about what a graduate might do. Five things that are true of a finished phase today, each one with the artefact behind it.",
  checks: [
    {
      claim: "That the work ran.",
      evidence:
        "A finished phase produces a signed receipt: the command, the exit code, the file hash, the duration. Anyone can re-derive it at /verify without an account.",
    },
    {
      claim: "That the verdict is not a model's opinion.",
      evidence:
        "A deterministic rule engine decides every pass and every failure. A model may explain a failure; it never decides one.",
    },
    {
      claim: "That the person understands the failure.",
      evidence:
        "A miss returns the reason, the file and the line. The transcript is the evidence, with no score hiding behind it.",
    },
    {
      claim: "That the scope is known.",
      evidence:
        "The curriculum is a public manifest: eighty phases, each with a name, an order and a tier.",
    },
    {
      claim: "That it was not a quiz.",
      evidence:
        "Nothing to collect. No badge, no score, no streak, no leaderboard. There is nothing here to rank a candidate on.",
    },
  ],
  notYet: [
    {
      text: "No employer console and no candidate record: there is no place yet to see a person, only the work they did.",
      scope: "hiring",
    },
    {
      text: "No portfolio export and no ATS integration, so nothing here can be attached to a ticket.",
      scope: "hiring",
    },
    {
      text: "No placement rate, no salary figure and no customer logo, because we have not run a cohort we could honestly report on.",
      scope: "all",
    },
  ],
  pilot: {
    title: "A pilot starts with the receipt, not a form.",
    body: "The fastest way to judge this is to install the IDE, finish one phase, and open the receipt at /verify. If the work is not there yet, a conversation will not produce it, so we would rather you look than believe us.",
  },
} as const;

/**
 * The situation the learner is in, in their own words.
 *
 * The research's §3 opens with the distinction the whole product is built on:
 * a lesson that unfolds in a living codebase, and a learner who can follow
 * perfectly and still cannot start. These three columns are that situation,
 * written out, so the reader meets the problem in their own words before the
 * page offers the answer.
 */
export const WEDGE = [
  {
    title: "You have followed a hundred tutorials.",
    body: "Following is not building. The video ends, the file is empty, and the two are different skills. Only one of them was ever practised.",
  },
  {
    title: "The blank file is where it happens.",
    body: "Nobody freezes because the video was unclear. They freeze because nothing tells them what to type first, and the first line is the whole distance.",
  },
  {
    title: "An interview asks you to build, not to recite.",
    body: "So the record of what you built has to exist outside your own account of it. A mark of completion cannot be re-derived. A receipt can.",
  },
] as const;

/** The three steps on the door. Numbers are prose, and they are true. */
export const STEPS = [
  {
    n: "01",
    id: "download",
    title: "Download the IDE.",
    caption:
      "A desktop editor with nine phases of the course inside it. Install it, open it, and the first judged verdict is minutes away rather than an account away.",
    points: [
      "Nine phases, bundled. Work offline, no account",
      "A real workspace: your files, your tests, your mistakes",
      "A miss comes back with the reason, never a score",
    ],
    link: { href: "/download", label: "Try it free" },
  },
  {
    n: "02",
    id: "signin",
    title: "Sign in through the browser.",
    caption:
      "The IDE never asks for your password. It shows a short code and opens this site. You sign in here, approve the code, and go back.",
    steps: [
      "The IDE shows a code like KQ7M-XR42 and opens your browser.",
      "You sign in on this site and approve that code.",
      "The IDE signs in by itself. Nothing to paste, nowhere to mistype.",
    ],
    link: { href: "/auth/ide", label: "Why it works this way" },
  },
  {
    n: "03",
    id: "tier",
    title: "Your tier opens the courses.",
    caption:
      "Those nine phases are free forever and assessment is never gated. A subscription unlocks the rest, and unlocking means the phases appear inside the IDE you already have.",
    points: [
      "Free: nine phases, judged end to end",
      "Pro: every further phase, fetched per entitlement",
      "Assessment stays free. A verdict you have to pay for is not one you can trust",
    ],
    link: { href: "/pricing", label: "See pricing" },
  },
] as const;

/**
 * The shipped curriculum, exactly as the manifest names it: id, printed title,
 * tier. `scripts/verify.ts` compares these ids against the IDE manifest when
 * the sibling checkout is present, so a phase added without updating this list
 * fails the suite rather than drifting quietly into the marketing page.
 *
 * Each entry is [id, title, tier]. Keep the tuple shape: the drift gate reads
 * it, and nothing else in this module uses it.
 */
export const TASK_MANAGER: [string, string, "free" | "pro"][] = [
  ["setup", "Project setup", "free"],
  ["fundamentals", "Programming fundamentals", "free"],
  ["web-basics", "How the web talks", "pro"],
  ["crud-data", "Create, read, update, delete", "pro"],
  ["regex-validation", "Reading and writing a pattern", "pro"],
  ["ui", "Build the UI", "pro"],
  ["behavior", "Add behavior", "pro"],
  ["data", "Manage data", "pro"],
  ["debug", "Debug failures", "pro"],
  ["navigate", "Read code you did not write", "pro"],
  ["git", "Use Git", "pro"],
  ["api", "Connect an API", "pro"],
  ["api-server", "Build the API", "pro"],
  ["testing", "Test the application", "pro"],
  ["review", "Review and deploy", "pro"],
  ["pr-review", "Respond to code review", "pro"],
  ["ai-audit", "Audit AI-generated code", "pro"],
  ["independent", "Independent challenge", "pro"],
];

/**
 * The Go language on its own, from its first value to a module.
 *
 * This was the first half of what used to be one course with the JavaScript
 * app, and it is now its own course because it is its own subject: the
 * language, before the service and before the app it sits behind.
 */
export const GO_FUNDAMENTALS: [string, string, "free" | "pro"][] = [
  ["go-values", "Go values", "pro"],
  ["go-control-flow", "Go control flow", "pro"],
  ["go-functions", "Go functions", "pro"],
  ["go-structs", "Go structs", "pro"],
  ["go-methods", "Go methods", "pro"],
  ["go-interfaces", "Go interfaces", "pro"],
  ["go-packages", "Go packages", "pro"],
  ["go-collections", "Go collections", "pro"],
  ["go-pointers", "Go pointers", "pro"],
  ["go-embedding", "Go embedding", "pro"],
  ["go-errors", "Go errors", "pro"],
  ["go-lifecycle", "Go cleanup and panic", "pro"],
  ["go-generics", "Go generics", "pro"],
  ["go-modules", "Go modules", "pro"],
];

/**
 * The Go service, from its first goroutine to the two labs that close it.
 *
 * The second half of the old course, split off because it is a different
 * subject: a running service, its storage, its operations and its failures.
 */
export const GO_IN_PRODUCTION: [string, string, "free" | "pro"][] = [
  ["go-goroutines", "Goroutines and channels", "pro"],
  ["go-sync", "Shared state and sync", "pro"],
  ["go-context", "Contexts and cancellation", "pro"],
  ["go-concur", "Worker pools and fan-in", "pro"],
  ["go-json", "Go JSON", "pro"],
  ["go-http", "HTTP handlers and a small REST API", "pro"],
  ["go-routes", "Routing, pagination, and a rate limit", "pro"],
  ["go-auth", "Go auth", "pro"],
  ["go-tests", "Testing: tables, subtests, and httptest", "pro"],
  ["go-perf", "Performance: the cost of a line", "pro"],
  ["go-store", "Data modeling: what the ledger refuses", "pro"],
  ["go-db", "Go persistence", "pro"],
  ["go-cache", "Go cache", "pro"],
  ["go-ops", "Operations: what the running service admits", "pro"],
  ["go-logging", "Go logging", "pro"],
  ["go-deps", "Go dependencies", "pro"],
  ["go-resilience", "Resilience: retries, backoff, and failing fast", "pro"],
  ["go-ship", "Ship: containers and the pipeline that proves it", "pro"],
  ["go-incident", "Debugging, for real", "pro"],
  ["incident-labs", "Debugging labs", "pro"],
  ["design-labs", "Design labs", "pro"],
];

export const RUST_LEDGER: [string, string, "free" | "pro"][] = [
  ["rust-values", "Rust values", "free"],
  ["rust-ownership", "Rust ownership", "free"],
  ["rust-borrowing", "Rust borrowing", "free"],
  ["rust-structs", "Rust structs", "free"],
  ["rust-enums", "Rust enums", "pro"],
  ["rust-errors", "Rust errors", "pro"],
  ["rust-modules", "Rust modules", "pro"],
  ["rust-traits", "Rust traits", "pro"],
  ["rust-lifetimes", "Lifetimes", "pro"],
  ["rust-collections", "Collections", "pro"],
  ["rust-closures", "Closures", "pro"],
  ["rust-tests", "Tests", "pro"],
  ["rust-pointers", "Rust pointers", "pro"],
  ["rust-threads", "Rust threads", "pro"],
  ["rust-async", "Rust async", "pro"],
  ["rust-tokio", "Tokio", "pro"],
  ["rust-axum", "Axum: a typed door", "pro"],
  ["rust-http-errors", "HTTP errors that say the right thing", "pro"],
  ["rust-sqlx", "SQLx: the ledger survives a restart", "pro"],
  ["rust-service-tests", "Testing the service without a port", "pro"],
  ["rust-observability", "Rust observability", "pro"],
  ["rust-ship", "Rust ship", "pro"],
  ["rust-review", "Rust review", "pro"],
  ["rust-takehome", "Rust take-home", "pro"],
];

export const API_BASICS: [string, string, "free" | "pro"][] = [
  ["api-contract", "Read the contract first", "free"],
  ["api-response", "An answer is not a yes", "free"],
  ["api-payload", "Trust nothing on the wire", "free"],
];

/**
 * The five shipped courses, with the real counts that follow from the lists
 * above.
 *
 * The order is the shipped order: the line a learner starts on, the two Go
 * courses behind it, the Rust ledger, and the side course that gates nothing.
 * `role` is not marketing: it is the manifest's own word for whether a course
 * is a main line, and the side course is the one that can be left at any point.
 *
 * The label says what a course IS, never how big it is. A count next to a name
 * turns a curriculum into a price list, and the prices are on the pricing page.
 */
export const COURSES = [
  {
    slug: "task-manager",
    role: "main",
    label: "course one · the JavaScript app",
    title: "Task Manager",
    sub: "the JavaScript app taken from the first terminal command to a reviewed pull request",
    phases: TASK_MANAGER,
  },
  {
    slug: "go-fundamentals",
    role: "main",
    label: "course two · the Go language",
    title: "Go fundamentals",
    sub: "the language itself, from values to modules",
    phases: GO_FUNDAMENTALS,
  },
  {
    slug: "go-in-production",
    role: "main",
    label: "course three · the Go service",
    title: "Go in production",
    sub: "the service behind it, from goroutines and HTTP through storage, operations and the two labs that close it",
    phases: GO_IN_PRODUCTION,
  },
  {
    slug: "rust-ledger",
    role: "main",
    label: "course four · the ledger in Rust",
    title: "Rust Ledger",
    sub: "the ledger rebuilt in Rust, taken to a tested Axum service",
    phases: RUST_LEDGER,
  },
  {
    slug: "api-basics",
    role: "side",
    label: "course five · reading an API from the outside",
    title: "APIs from the outside",
    sub: "three phases on what a request is, and it gates nothing",
    phases: API_BASICS,
  },
] as const;

/** Every shipped phase, in one list: the marquee, the count, the drift gate. */
export const ALL_PHASES: [string, string, "free" | "pro"][] = [
  ...TASK_MANAGER,
  ...GO_FUNDAMENTALS,
  ...GO_IN_PRODUCTION,
  ...RUST_LEDGER,
  ...API_BASICS,
] as const;

/** How many phases ship on the free tier, counted from the lists above. */
export const FREE_PHASE_COUNT = ALL_PHASES.filter(([, , tier]) => tier === "free").length;

/** How many phases open with a paid tier, counted from the lists above. */
export const PRO_PHASE_COUNT = ALL_PHASES.length - FREE_PHASE_COUNT;

/**
 * The curriculum, described on the front page: the courses by name, and how
 * deep each one is.
 *
 * The depths are counted from the phase lists above rather than written out,
 * so the sentence cannot drift away from the shipped phases. The page names
 * the courses and never counts them: a count of courses reads as a count of
 * videos, and this is not that.
 */
export const CURRICULUM = {
  title:
    "A JavaScript app, the Go language, the Go service behind it, a ledger in Rust, and an API from the outside.",
  caption: `The JavaScript app is ${TASK_MANAGER.length} phases. The Go service is ${GO_FUNDAMENTALS.length + GO_IN_PRODUCTION.length}, across the language course and the production course. The Rust ledger is ${RUST_LEDGER.length}, and the side course is ${API_BASICS.length}. Everything below ships inside the IDE and is judged there.`,
} as const;

/**
 * The disclosure. This is the second clause of the positioning line made
 * concrete, and it is the part a competitor cannot copy without rebuilding
 * their grading. `company/TRUST-MODEL.md` and `VISION.md` both require it, so
 * it lives on the front door rather than in a footnote.
 */
export const DISCLOSURE = {
  title: "Not every check is the platform's opinion.",
  caption:
    "Some checks can be recomputed by the platform from your own run. A few are your browser's report of what it saw, and the platform has to take that on trust. We say which is which, on every phase, before you start it.",
  rows: [
    {
      kind: "recomputed",
      label: "Recomputed by the platform",
      body: "The run is re-executed server-side against a signed receipt bound to the hash of the file it judged. Re-derivable by anyone, including a sceptic.",
    },
    {
      kind: "self",
      label: "Reported by your own client",
      body: "Computed-style and scripted checks report what your browser observed. The platform cannot re-derive them, so they are labelled as yours, never as ours.",
    },
  ],
} as const;

/** What the product refuses to do. Kept short; each line is a real constraint. */
export const NO_LIST = [
  "No model decides whether you passed. It explains a failure; it never grades one.",
  "Nothing to collect: no completion badge, no badge at all, and no score for finishing.",
  "No XP, no streak, no leaderboard. Activity is not evidence.",
] as const;

/** The questions that actually get asked before the first download. */
export const FAQ = [
  {
    q: "Do I learn in the browser or in the IDE?",
    a: "In the IDE. This site holds your download, your account and your proof. The lessons, the editor and the tests live in the desktop app.",
  },
  {
    q: "What does free include?",
    a: "The IDE download, the nine free phases, every check and every verdict. Assessment is never behind the paywall.",
  },
  {
    q: "How am I judged?",
    a: "Not graded. Checked. Tests run against your code and a miss tells you the reason. A model may explain a failure; it never decides one.",
  },
  {
    q: "Can someone else check my work?",
    a: "Finished runs produce a signed receipt. Anyone can re-derive it at /verify without an account, and the platform answers too.",
  },
  {
    q: "Can a hiring manager see what I have built?",
    a: "They can read a receipt: what ran, what it judged, what failed and why. There is no employer console and no candidate report yet, so there is nothing else to see.",
  },
  {
    q: "What is not built yet?",
    a: "The desktop build is not published, so the download is not live. There is no portfolio export and no employer-facing record yet, and we do not claim one.",
  },
  {
    q: "I already know the basics. Is this for me?",
    a: "The first course opens with the tools and the editor, which are free, and it does not spend a phase on what a variable is. After that it assumes you can read code and use a terminal, and it says so before it asks.",
  },
  {
    q: "How long does a phase take?",
    a: "We are not going to guess. A phase is a working app with a check on it, so the time it takes is the time the work takes, and the two that are about setup are the short ones because there is little in them.",
  },
  {
    q: "Do I have to be a programmer to start?",
    a: "No. The first phase is putting the tools on the machine and bringing an app up, and it is free. The course expects a terminal by the second phase and tells you so when it asks.",
  },
  {
    q: "Will it teach me a framework?",
    a: "It teaches a JavaScript app, the Go language on its own, the Go service behind that app, a ledger in Rust taken to a tested service, and reading an API from the outside. There is no React course, and we are not going to pretend one is coming.",
  },
  {
    q: "What is actually in the curriculum?",
    a: `Task Manager is the JavaScript app, ${TASK_MANAGER.length} phases, from the first terminal command to a reviewed pull request. Go fundamentals is the language itself, ${GO_FUNDAMENTALS.length} phases, from values to modules. Go in production is the service behind it, ${GO_IN_PRODUCTION.length} phases, ending in the debugging and design labs. Rust Ledger is the ledger rebuilt in Rust, ${RUST_LEDGER.length} phases, taken to a tested Axum service. APIs from the outside is ${API_BASICS.length} phases on what a request is, and it gates nothing.`,
  },
  {
    q: "Is there a mark of completion?",
    a: "No, and there will not be. There is nothing to collect here: no badge, no score, no streak. What a finished phase leaves is a receipt, and a receipt is the one thing a stranger can check.",
  },
] as const;

/**
 * The price, decided.
 *
 * Every number a buyer can be charged lives here and nowhere else: the page
 * prints them, the suite reads them, and the payment provider is configured
 * with the same figures. The monthly price is the one the provider is set to.
 * The yearly price is the same plan bought in advance. The teams price is the
 * same plan again, with one invoice instead of several.
 *
 * The phase counts are not written here either: they are counted from the
 * phase lists above, so a phase added to the curriculum cannot leave a stale
 * count behind in the price.
 */
export const PRICING = {
  plan: "Pro",
  currency: "USD",
  free: 0,
  monthly: 29,
  annual: 290,
  freePhases: FREE_PHASE_COUNT,
  paidPhases: PRO_PHASE_COUNT,
  teams: {
    perLearnerMonthly: 29,
    minLearners: 5,
    billedYearly: true,
  },
} as const;

/** An amount as the provider charges it. The page never writes a price itself. */
export function money(amount: number): string {
  return `$${amount}`;
}

/** The free tier is, in the words the pricing page and the suite share. */
export const FREE_TIER_POINTS = [
  "Nine phases bundled with the IDE, offline, no account",
  "Every check and verdict, free forever",
  "Further courses per your tier, inside the same IDE",
  "Account with IDE sign-in through the browser",
] as const;

/**
 * The three lines, in the words the owner decided on.
 *
 * Free is the first hour. Pro is the whole curriculum. Teams is the same Pro
 * with one invoice and the two things a hiring manager needs.
 */
export const PRICING_PLANS = [
  {
    id: "free",
    name: "Free",
    price: money(PRICING.free),
    priceNote: "the first hour",
    points: FREE_TIER_POINTS,
  },
  {
    id: "pro",
    name: "Pro",
    price: money(PRICING.monthly),
    priceNote: `a month, or ${money(PRICING.annual)} a year`,
    points: [
      `All ${ALL_PHASES.length} phases, in the IDE you already have`,
      "Sync across devices",
      "Hosted runs: the platform runs your code",
      "The evidence ledger and the portfolio",
      "New phases as they land",
    ],
  },
  {
    id: "teams",
    name: "Teams",
    price: money(PRICING.teams.perLearnerMonthly),
    priceNote: "per learner per month, billed yearly",
    points: [
      "The same Pro, on one invoice",
      `${PRICING.teams.minLearners} learners or more`,
      "The hiring one-pager",
      "A verified-evidence link for the hiring manager",
    ],
  },
] as const;

/**
 * What is not sold.
 *
 * The list is here because a buyer is better served by a plain refusal than by
 * a quiet omission. These are not things that are coming later either: they
 * are the product's shape, stated in the negative.
 */
export const NOT_SOLD = [
  "No certificates. Nothing here is issued, framed and signed.",
  "No leaderboards, and no ranking of learners.",
  "No AI grading. A model explains a failure; it never decides one.",
  "No content packs. The curriculum is the shipped phases, and new ones arrive as they land.",
] as const;

/**
 * The address a hiring manager writes to, and the promise made about it.
 *
 * Same treatment as the launch list: a person holds the mailbox, the message
 * is used to answer the question, and it is not added to anything.
 */
export const HIRING_CONTACT = "hiring@nexora.dev";

export const HIRING_ENQUIRY = {
  title: "Tell us what you are hiring for.",
  lead: "One form, and a person reads it. Every enquiry is answered.",
  next: "What happens next: we read it, we reply to the address you gave, and we say plainly if we are not the right fit for the role.",
  privacy:
    "Your name, your work email and what you are hiring for go to the studio's hiring mailbox. They are used to answer you and for nothing else, they are not added to a list, and the message is deleted when the thread is over or when you ask us to delete it.",
  /* No response time is promised here. A time a reader can hold us to is a
     commitment about a person answering a mailbox, and the honest thing the
     site can say is what is true of the mechanism: a person reads it, and
     every enquiry is answered. The time belongs in the reply, where it can
     be kept, not on the page, where it cannot. */
  replyTime: "Every enquiry is answered",
  notConfigured:
    "This build has no mail provider configured, so the form cannot send. Write to the address on this page instead, and it reaches the same person.",
  name: "your name",
  email: "your work email",
  need: "what you are hiring for",
  submit: "Send it",
  sent: "Your message is with us. A person reads this mailbox, and every enquiry is answered.",
  failed: "That did not go through. Try again, or write to hiring@nexora.dev.",
} as const;

/** The billing promises. Stated before there is a price to sell (D-012). */
export const BILLING_COMMITMENTS = [
  {
    title: "No surprise renewals.",
    body: "The renewal date is shown before you pay and in your profile, every time, never only at the point of cancelling.",
  },
  {
    title: "Cancel in two clicks.",
    body: "Self-serve, in this product. No email, no retention maze, no “are you sure?” loop.",
  },
  {
    title: "One visible price.",
    body: "Purchasing-power discounts are applied as a discount you can see, never as a higher local price.",
  },
  {
    title: "No check is ever behind the paywall.",
    body: "Assessment stays free. A verdict you have to pay for is not a verdict you can trust.",
  },
] as const;

/** The footer's one job: get back to the four real surfaces. */
export const FOOTER_LINKS = [
  { href: "/download", label: "Try it free" },
  { href: "/pricing", label: "Pricing" },
  { href: "/verify", label: "Verify" },
  { href: "/auth", label: "Account" },
] as const;

/** The primary navigation. Still a front door: no classroom, no search. */
export const NAV = [
  { href: "/#why", label: "Why" },
  { href: "/#measures", label: "Measures" },
  { href: "/#courses", label: "Courses" },
  { href: "/employers", label: "For hiring" },
  { href: "/#limits", label: "Limits" },
  { href: "/pricing", label: "Pricing" },
  { href: "/verify", label: "Verify" },
] as const;

/**
 * The transcript the hero plays.
 *
 * This is an *example* of what a run leaves behind, and it is labelled as one
 * everywhere it is shown — a screenshot of a receipt that a visitor could
 * mistake for their own credential would be a claim about the product that no
 * build currently backs. The content is deliberately ordinary: a check that
 * fails, the reason it failed, and the same check passing once the cause is
 * fixed. That is the whole product in seven lines.
 */
export const RUN_SCRIPT = [
  { kind: "cmd", text: "nexora run task-manager/debug --phase 09" },
  { kind: "fail", text: "not ok 1 - completing a task removes it from the list" },
  { kind: "note", text: "  expected 3 items, got 4" },
  { kind: "note", text: "  src/store.js:42 - the filter runs before the delete resolves" },
  { kind: "cmd", text: "nexora run task-manager/debug --phase 09" },
  { kind: "ok", text: "ok 1 - completing a task removes it from the list" },
  { kind: "note", text: "  checks 1 · passed 1 · failed 0 · 412ms" },
] as const;

/** The receipt the hero prints, once the run passes. An example, not a record. */
export const RECEIPT = {
  label: "example receipt · an illustration, not your work",
  serial: "04d1-09b7-2f",
  rows: [
    { key: "phase", value: "09 · debug failures" },
    { key: "command", value: "nexora run --phase 09" },
    { key: "exit", value: "0" },
    { key: "file", value: "src/store.js" },
    { key: "sha256", value: "3f9a41c07e6b⋯c41d" },
    { key: "runner", value: "node 22 · linux-x64" },
    { key: "duration", value: "412ms" },
  ],
} as const;

/**
 * The words this audience already uses (MARKET.md §9.2). Present so a future
 * rewrite can be checked against the list rather than against memory.
 */
export const CLAIMED_WORDS = [
  "tutorial hell",
  "blank editor",
  "can I actually build this",
  "prove it",
] as const;

/**
 * The words the product does not use (MARKET.md §2). `verify.ts` fails the
 * suite if any of them reaches this module — a marketing rewrite should not be
 * able to reintroduce "mastery" or "AI-powered" by accident.
 */
export const FORBIDDEN_WORDS = [
  "certificate",
  "certification",
  "credential",
  "professional",
  "mastery",
  "level up",
  "AI-powered",
  "10x",
] as const;

/* ===========================================================================
 * ADDED BY THE ACCOUNT-SURFACE WORKER, 2026-10-20.
 *
 * The copy for the account home, the password reset and the email
 * verification. It lives here, at the end of the file, in one block, because
 * the worker that owns the rest of this module did not write it: the shape
 * of the existing constants is untouched, and the block can be moved into
 * the body of the file whenever the two are next edited together.
 *
 * Two rules this block keeps, the same ones the rest of the file keeps.
 *
 *   - Every sentence is true of the shipped product. Where a thing does not
 *     exist yet, the page says so in the same way `/pricing` does.
 *   - No em dash and no en dash in a visible string.
 *
 * The account page is not a marketing page. Nothing here promises anything,
 * and the sentences are written the way a bench is labelled: what it is,
 * what it does, and what happens when it cannot answer.
 * ======================================================================== */

/**
 * The account home: the screen a learner lands on after signing in.
 *
 * It answers four questions in order, and the order is the point. Who you
 * are, what your plan opens, what you have actually proved, and how to get
 * back to the work. The last one is first in the reader's mind, so it is
 * never the last thing on the page.
 */
export const ACCOUNT_HOME = {
  title: "Your account.",
  lede: "This is what the platform holds about this account, and what it opens. Your work itself stays on your own machine, in the IDE.",
  identity: {
    label: "who you are",
    title: "The account",
    empty: "No account is connected to this browser.",
    created: "Account made",
    unknown: "The platform does not say when this account was made.",
  },
  plan: {
    label: "your plan",
    title: "What your tier opens",
    free: "Free plan. The phases bundled with the IDE are free, they run offline, and every check is free.",
    pro: "Pro. Every further phase appears inside the IDE you already have, fetched per entitlement.",
    renews: "Renews",
    unknown: "The billing service did not answer, so what this account is entitled to is not known here.",
    manage: "Manage your plan",
  },
  evidence: {
    label: "your evidence",
    title: "What the platform has verified",
    empty:
      "Nothing is verified yet. A finished phase leaves a signed receipt, and the platform signs those receipts as your IDE syncs them. Practice stays in the IDE either way.",
    footnote:
      "Verified means the platform signed it. Each row re-derives at /verify, and it says nothing about who wrote it, only that the platform judged it.",
  },
  ide: {
    label: "the editor",
    title: "The IDE",
    body: "The lessons, the editor and the checks are one thing, and they run on your machine. The IDE shows a short code and opens this site, so your password is never typed into an editor.",
    download: "Download the IDE",
    ideSignIn: "IDE sign-in code",
  },
  session: {
    label: "this session",
    title: "Signed in on this browser",
    body: "Signing out ends this session here. Signing out everywhere ends every session this account has, on every device, including this one.",
  },
} as const;

/**
 * The password reset, in two parts: asking for a link, and using it.
 *
 * The request copy is the same sentence whether or not the address has an
 * account, and that is deliberate: the page must never be able to tell a
 * prober which addresses are registered. The sentence therefore says both
 * halves in one breath.
 */
export const PASSWORD_RESET = {
  request: {
    title: "Set a new password.",
    lede: "Give the address you signed up with. If it has an account, a link to set a new password is on its way.",
    field: "email address",
    action: "Send the link",
    sending: "Sending the link",
    /* One sentence, and it is the only one: the same words whether the
       address is known or not, so this page can never be an oracle. */
    sent: "If that address has an account, a link to set a new password is on its way. If it has not, nothing is sent and no account is created.",
    again: "Ask for another link",
  },
  confirm: {
    title: "Choose a new password.",
    lede: "This link lets you set the password on the account it was sent to, and then it stops working.",
    field: "new password: 10 characters or more",
    tokenField: "the link, if you opened it in another browser",
    action: "Set the new password",
    sending: "Setting the password",
    done: "Your password is set. Sign in with it.",
    failed:
      "That link was not accepted. It may have expired, or it may already have been used. Ask for a new one.",
    newLink: "Ask for a new link",
  },
} as const;

/**
 * The email verification screen.
 *
 * Two facts are stated here rather than implied: that the account is created,
 * and that a link is on its way. The screen also accepts a code, because a
 * learner who opened the mail on another machine has a code and not a link.
 */
export const VERIFY_EMAIL = {
  title: "Verify your email.",
  created: "Your account is created. A verification link is on its way to the address you gave.",
  idle: "Paste the code from the verification email, or open the link in that email.",
  field: "verification code",
  action: "Verify my email",
  sending: "Verifying",
  done: "Verified. Your email address is confirmed, and nothing else about the account changes.",
  failed: "That code was not accepted. It may have expired, or it may already have been used.",
  notConnected:
    "Accounts are not connected in this build, so no verification was sent and no code is waiting for you.",
  back: "Back to your account",
  /* Asking for another code. The sentence is the same one the password reset
     uses: an address that has an account gets a code, an address that has not
     gets nothing, and the page cannot tell the two apart. */
  resend: "Send another code",
  resending: "Sending the code",
  resent:
    "If that address has an account, a verification code is on its way. If it has not, nothing is sent and no account is created.",
  addressField: "email address",
} as const;

