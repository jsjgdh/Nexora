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
 * Second, the words here are drawn from `company/MARKET.md` §2 rather than
 * invented for a landing page. The positioning line is the studio's own — both
 * clauses of it, because the second clause ("and that tells you when it can't")
 * is the differentiator and the first alone is table stakes. The wedge is
 * `MARKET.md`'s wedge: the person who can follow a tutorial perfectly and
 * freezes on a blank file. The words in `CLAIMED_WORDS` are the words that
 * audience already uses; `FORBIDDEN_WORDS` is the list the same document
 * forbids, and `verify.ts` now fails if any of them appears in the copy.
 *
 * Nothing here is a number we have not measured. The phase lists are the real
 * shipped curriculum, the two free phases are the two the installer really
 * bundles, and there is no testimonial, logo, price or download in this file
 * because there is nothing true to put in one. */

/** The product's name, as printed. */
export const BRAND = "NEXORA";

/**
 * The two lines a masthead prints, and the only two it needs: what the desk is
 * called, and the promise under the name. Both moved here from the landing
 * page when the header became a masthead — the dateline belongs to the paper,
 * not to any one page, and a string the suite reads cannot drift between the
 * two places that print it.
 */
export const MASTHEAD = {
  desk: "the proof desk",
  edition: "one way to learn · free to start",
} as const;

/**
 * The one line, for a stranger. Both clauses. Source: `company/MARKET.md` §2.
 */
export const POSITIONING =
  "The IDE that won't tell you you've learned something until it can prove it — and that tells you when it can't.";

/** The same claim, cut for a title tag and a social card. */
export const TAGLINE =
  "A programming course that runs inside a real IDE, and refuses to call you finished until a rule engine agrees.";

/** The hero. The headline is a claim; the lede is the positioning line. */
export const HERO = {
  lineOne: "Tutorials end.",
  lineTwo: "The proof is what's left.",
  lede: POSITIONING,
  note: "Free to download. Base course included, bundled with the installer. No account needed to start.",
  primary: "Download the IDE",
  primaryShort: "Download",
  secondary: "See the courses",
} as const;

/**
 * The wedge, in the visitor's own words (MARKET.md §9.2 names these as the
 * phrases learners actually use).
 */
export const WEDGE = [
  {
    kicker: "the blank editor",
    title: "You can follow a tutorial. Then the file is empty.",
    body: "Nobody freezes because the video was unclear. They freeze because following and building are different skills, and only one of them was ever practised.",
  },
  {
    kicker: "tutorial hell",
    title: "Another course is not the fix. A check is.",
    body: "A course ends when the author stops talking. This one ends when your own code runs and a test says so — and it will say no, with the reason.",
  },
  {
    kicker: "prove it",
    title: "The interview does not ask what you finished.",
    body: "It asks you to build something and explain it. So the thing worth having is a record of work that ran, that a stranger can re-derive without trusting us.",
  },
] as const;

/** The three steps on the door. Numbers are prose, and they are true. */
export const STEPS = [
  {
    n: "01",
    id: "download",
    title: "Download the IDE.",
    caption:
      "A desktop editor with the course inside it. The base course ships in the installer and runs offline, so the first judged verdict is minutes away rather than an account away.",
    points: [
      "Base course, bundled — works offline, no account",
      "Real local workspace: your files, your tests, your mistakes",
      "A miss comes back with the reason, never a score",
    ],
    link: { href: "/download", label: "Get the IDE" },
  },
  {
    n: "02",
    id: "signin",
    title: "Sign in through the browser.",
    caption:
      "The IDE never asks for your password. It shows a short code and opens this site — you sign in here, approve the code, and go back.",
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
      "The base course is free forever and assessment is never gated. A subscription unlocks the rest, and unlocking means the phases appear inside the IDE you already have.",
    points: [
      "Free — the base course, judged end to end",
      "Pro — every further phase, fetched per entitlement",
      "Assessment stays free — a verdict you have to pay for is not one you can trust",
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
  ["independent", "Independent challenge", "pro"],
];

export const GO_TRACK: [string, string, "free" | "pro"][] = [
  ["go-values", "Go values", "pro"],
  ["go-control-flow", "Go control flow", "pro"],
  ["go-functions", "Go functions", "pro"],
  ["go-structs", "Go structs", "pro"],
  ["go-methods", "Go methods", "pro"],
  ["go-interfaces", "Go interfaces", "pro"],
  ["go-packages", "Go packages", "pro"],
  ["go-collections", "Go collections", "pro"],
  ["go-embedding", "Go embedding", "pro"],
  ["go-errors", "Go errors", "pro"],
  ["go-generics", "Go generics", "pro"],
  ["go-modules", "Go modules", "pro"],
  ["go-goroutines", "Goroutines and channels", "pro"],
  ["go-sync", "Shared state and sync", "pro"],
];

export const LAB_TRACK: [string, string, "free" | "pro"][] = [
  ["incident-labs", "Debugging labs", "pro"],
  ["design-labs", "Design labs", "pro"],
];

/** The three courses, with the real counts that follow from the lists above. */
export const COURSES = [
  {
    slug: "task-manager",
    label: "course one · build a real app",
    title: "Task Manager",
    sub: "Sixteen phases, from first install to working alone.",
    phases: TASK_MANAGER,
  },
  {
    slug: "go",
    label: "course two · a backend language",
    title: "Go, values to sync",
    sub: "Fourteen phases, one language taught properly.",
    phases: GO_TRACK,
  },
  {
    slug: "labs",
    label: "course three · prove it under pressure",
    title: "Labs",
    sub: "Two phases: broken systems, and system design.",
    phases: LAB_TRACK,
  },
] as const;

/** Every shipped phase, in one list — the marquee and the headline count. */
export const ALL_PHASES: [string, string, "free" | "pro"][] = [
  ...TASK_MANAGER,
  ...GO_TRACK,
  ...LAB_TRACK,
];

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
    a: "In the IDE. This site holds your download, your account and your proof — the lessons, the editor and the tests live in the desktop app.",
  },
  {
    q: "What does free include?",
    a: "The IDE download, the base course, every check and every verdict. Assessment is never behind the paywall.",
  },
  {
    q: "How am I judged?",
    a: "Not graded — checked. Tests run against your code and a miss tells you the reason. A model may explain a failure; it never decides one.",
  },
  {
    q: "Can someone else check my work?",
    a: "Finished runs produce a signed receipt. Anyone can re-derive it at /verify without an account, and the platform answers too.",
  },
  {
    q: "What is not built yet?",
    a: "The desktop build is not hosted, so the download is not live. There is no portfolio export and no employer-facing record yet, and we do not claim one.",
  },
] as const;

/** What the free tier is, in the words the pricing page and the suite share. */
export const FREE_TIER_POINTS = [
  "Base course bundled with the IDE — offline, no account",
  "Every check and verdict, free forever",
  "Further courses per your tier, inside the same IDE",
  "Account with IDE sign-in through the browser",
] as const;

/** The billing promises. Stated before there is a price to sell (D-012). */
export const BILLING_COMMITMENTS = [
  {
    title: "No surprise renewals.",
    body: "The renewal date is shown before you pay and in your profile, every time — never only at the point of cancelling.",
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
    body: "Assessment stays free — a verdict you have to pay for is not a verdict you can trust.",
  },
] as const;

/** The footer's one job: get back to the four real surfaces. */
export const FOOTER_LINKS = [
  { href: "/download", label: "Get the IDE" },
  { href: "/pricing", label: "Pricing" },
  { href: "/verify", label: "Verify" },
  { href: "/auth", label: "Account" },
] as const;

/** The primary navigation. Still a front door: no classroom, no search. */
export const NAV = [
  { href: "/#courses", label: "Courses" },
  { href: "/#why", label: "Why NEXORA" },
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
  { kind: "note", text: "  src/store.js:42 — the filter runs before the delete resolves" },
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
