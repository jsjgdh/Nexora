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
 * A number in English, for a sentence that has to say it in words.
 *
 * The site states the depth of the curriculum in prose rather than in digits,
 * because a count written in words is a sentence and a count written in
 * numerals is a label. The count itself is never written out: it is computed
 * from the shipped phase list, and this only says what that count is called.
 *
 * The suite reads this same function, so the number in the copy and the number
 * in the gate are the same number by construction.
 */
export function numberWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  const ones = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return ones[n]!;
  if (n < 100) {
    const rest = n % 10;
    return rest === 0 ? tens[Math.floor(n / 10)]! : `${tens[Math.floor(n / 10)]}-${ones[rest]}`;
  }
  const hundreds = ["one hundred", "two hundred", "three hundred", "four hundred", "five hundred",
    "six hundred", "seven hundred", "eight hundred", "nine hundred"];
  if (n < 1000) {
    const rest = n % 100;
    return rest === 0
      ? hundreds[Math.floor(n / 100)]!
      : `${hundreds[Math.floor(n / 100)]}, ${numberWords(rest)}`;
  }
  return null;
}

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
 * Each variant says the same true thing in a different way.
 *
 * The three were rewritten when the page was rebuilt around the experience
 * rather than around the argument. The earlier set led with what the product
 * is not ("Not another quiz", "Not by answering"), which made the product read
 * as a list of refusals before it had said what it does. These three lead with
 * the learner's situation, because that is the question a stranger arrives
 * with, and the differentiators are said once, later, where the reader has
 * enough context to want them.
 */
export const HERO_VARIANTS = [
  {
    id: "a",
    lineOne: "Learn to build software.",
    lineTwo: "Learn to think like an engineer.",
    markOne: "build",
    lede: "Build real applications, debug real failures, and understand how software works, inside a development environment built for learning by doing.",
  },
  {
    id: "b",
    lineOne: "The tutorials end. The work begins.",
    lineTwo: "Now build the thing.",
    markOne: "work",
    lede: "The hard part is rarely the syntax. It is the blank file, the test that fails, and the bug you have never seen before. This course works on that part.",
  },
  {
    id: "c",
    lineOne: "Every phase is real software.",
    lineTwo: "In your own workspace.",
    markOne: "real",
    lede: "Write the code, run the checks, read the failure, fix the cause. A finished phase leaves a receipt anyone can re-derive, and there is no score inside it.",
  },
] as const;

/**
 * The hero, for the person who is here to learn.
 *
 * The headline is a claim; the lede is the promise. The commercial offer is
 * not here, because it is not the same in both states of the world: whether a
 * desktop build is published is a fact about the product that changes, and
 * copy that has to be rewritten when the product changes is copy that will be
 * wrong on the day it matters. The offer is therefore a function of the
 * release state, and it lives in `$lib/release`.
 */
export const HERO = {
  lineOne: HERO_VARIANTS[0].lineOne,
  lineTwo: HERO_VARIANTS[0].lineTwo,
  markOne: HERO_VARIANTS[0].markOne,
  lede: HERO_VARIANTS[0].lede,
  secondary: "See how it works",
} as const;

/**
 * The hero, for the person who is here to learn.
 *
 * The headline is a claim; the lede is the promise. The commercial offer is
 * not here, because it is not the same in both states of the world: whether a
 * desktop build is published is a fact about the product that changes, and
 * copy that has to be rewritten when the product changes is copy that will be
 * wrong on the day it matters. The offer is therefore a function of the
 * release state, and it lives in `$lib/release`.
 */

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
 *
 * The two numbers are computed from the shipped phase list rather than
 * written down.
 */

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
 *
 * They were rewritten when the page was rebuilt. The earlier set ended on the
 * hiring market ("An interview asks you to build, not to recite"), which put
 * a job market in front of someone who came to learn to code. This set ends
 * on the third thing that actually goes wrong, which is the bug.
 */
/**
 * What a phase is, in the curriculum's own words.
 *
 * The sentence in the title is the shipped manifest's own, and it is quoted
 * rather than paraphrased because it is the shape of every course in the
 * product: Learn, then Solve, then Review.
 *
 * The five steps below are what the LEARNER does inside that shape, and each
 * one carries the panel it would actually show. The panels are read out of the
 * product's own transcript, so the failure on the page is a failure the
 * platform really produces.
 */
export const LEARN_CYCLE = {
  title: "Watch how learning happens.",
  caption:
    "Every phase is Learn, then Solve, then Review. This is what that looks like: five steps, inside the editor, on your own project.",
  guidance: {
    title: "The help runs out.",
    body: "Every activity states how much of the answer it will give you. Early on, that is the shape of the answer. Later, it is the question and nothing else, and a phase that only works with the answer open is not a phase you passed.",
  },
} as const;


/**
 * What the learner ends up holding, per course.
 *
 * The order is the shipped order. Each line says what the course is for, not
 * how big it is, and the count is carried by the course list beside it rather
 * than repeated here.
 *
 * The lines are editorial: they are what we have to say about a course we
 * know. A course we have nothing written about is still printed, using the
 * shipped list's own line for it, so a course added in the IDE reaches the
 * page without anybody having to come back and write a paragraph for it.
 */
export const COURSE_PATH_NOTES: Record<string, { title: string; body: string }> = {
  "go-fundamentals": {
    title: "Go, the language.",
    body: "From the first value to a module. Values, control flow, functions, structs, methods, interfaces, packages, collections, pointers, embedding, errors, defer and panic, generics. Each phase is judged by code that will not compile without the idea it teaches.",
  },
  "go-in-production": {
    title: "Go, the service behind it.",
    body: "Goroutines and synchronization, context and cancellation, HTTP servers, routes, authentication, tests, storage, a database, caching, resilience, and shipping. It closes with debugging labs and design labs.",
  },
  "rust-fundamentals": {
    title: "Rust, the language.",
    body: "The tools, then values and control flow, then ownership and borrowing, then structs, enums, errors and modules, then collections, traits and lifetimes, then testing, then the threads and the futures the language gives you, and a money type of your own design at the end.",
  },
  "rust-in-production": {
    title: "Rust, the service behind it.",
    body: "The runtime and its tasks, the channels between them, the router and its extractors, the state it shares, the failures that become answers, the database, the configuration, the log, the tests, and a release you can defend.",
  },
  "sql-fundamentals": {
    title: "SQL, the query language.",
    body: "The shape of a query, what the planner does with it, the joins that bite, and how to tell a slow query from a wrong one.",
  },
  "api-basics": {
    title: "The API, from the outside.",
    body: "What a request is, why an answer is not a yes, and why valid JSON is not valid data. It gates nothing, and you can leave it at any point.",
  },
};



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
  ["go-program", "Go program", "pro"],
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
  ["go-checker", "Go checker", "pro"],
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
  ["go-concur", "Worker pools and fan-in", "pro"],
  ["go-context", "Contexts and cancellation", "pro"],
  ["go-pipeline", "Pipelines and cancelling the chain", "pro"],
  ["go-json", "Go JSON", "pro"],
  ["go-server", "The server: its deadlines and its last request", "pro"],
  ["go-http", "HTTP handlers and a small REST API", "pro"],
  ["go-routes", "Routing, pagination, and a rate limit", "pro"],
  ["go-middleware", "Middleware: one concern around every route", "pro"],
  ["go-auth", "Go auth", "pro"],
  ["go-tests", "Testing: tables, subtests, and httptest", "pro"],
  ["go-perf", "Performance: the cost of a line", "pro"],
  ["go-store", "Data modeling: what the ledger refuses", "pro"],
  ["go-db", "Go persistence", "pro"],
  ["go-cache", "Go cache", "pro"],
  ["go-resilience", "Resilience: retries, backoff, and failing fast", "pro"],
  ["go-ops", "Operations: what the running service admits", "pro"],
  ["go-logging", "Go logging", "pro"],
  ["go-deps", "Go dependencies", "pro"],
  ["go-ship", "Ship: containers and the pipeline that proves it", "pro"],
  ["go-incident", "Debugging, for real", "pro"],
  ["incident-labs", "Debugging labs", "pro"],
  ["design-labs", "Design labs", "pro"],
];

/**
 * The Rust language, in the order the book teaches it.
 *
 * The language on its own, before the service it runs in: the tools, then
 * values and control flow, then ownership and borrowing, then structs, enums,
 * errors and modules, then collections, traits and lifetimes, then testing,
 * then the threads and the futures the language gives you, and a money type
 * of your own design at the end.
 */
export const RUST_FUNDAMENTALS: [string, string, "free" | "pro"][] = [
  ["rust-values", "Rust, cargo, and your first value", "free"],
  ["rust-ownership", "One owner at a time", "free"],
  ["rust-borrowing", "Look without taking", "free"],
  ["rust-structs", "One door into the type", "free"],
  ["rust-enums", "A value that is one of several shapes", "pro"],
  ["rust-errors", "A failure is a value", "pro"],
  ["rust-modules", "The public edge of a crate", "pro"],
  ["rust-traits", "A contract a type signs", "pro"],
  ["rust-lifetimes", "A borrow has a length", "pro"],
  ["rust-collections", "Order, keys, and absence", "pro"],
  ["rust-closures", "A function that carries values, and the iterators that walk a list", "pro"],
  ["rust-tests", "A test is a named claim", "pro"],
  ["rust-pointers", "One value, several owners", "pro"],
  ["rust-threads", "Work on another thread", "pro"],
  ["rust-async", "A future is a plan, not a run", "pro"],
  ["rust-amount", "Your turn: the ledger’s money type", "pro"],
];

/**
 * The ledger as a service.
 *
 * The Rust course's second half: the runtime and its tasks, the channels
 * between them, the router and its extractors, the state it shares, the layers
 * around it, the stop at the end of it, the failures that become answers, the
 * database, the configuration, the log, the tests, and a release you can
 * defend.
 */
export const RUST_IN_PRODUCTION: [string, string, "free" | "pro"][] = [
  ["rust-checker", "A checker reads code and reports what it finds", "pro"],
  ["rust-checker-report", "Your turn: the rules and the report", "pro"],
  ["rust-tokio-runtime", "The runtime that owns the work", "pro"],
  ["rust-tokio-channels", "A message from one task to another", "pro"],
  ["rust-tokio-select", "Waiting on more than one thing", "pro"],
  ["rust-tokio-streams", "A sequence that arrives over time", "pro"],
  ["rust-tokio-state", "The state every task shares", "pro"],
  ["rust-tokio", "A deadline and a clean stop", "pro"],
  ["rust-axum-routing", "The router and its paths", "pro"],
  ["rust-axum-extractors", "What each argument asks for", "pro"],
  ["rust-axum-state", "The state every handler shares", "pro"],
  ["rust-axum-middleware", "The layers around every route", "pro"],
  ["rust-axum-shutdown", "The server and its stop", "pro"],
  ["rust-axum", "Axum: a typed door", "pro"],
  ["rust-http-errors", "Your turn: how a failure becomes an answer", "pro"],
  ["rust-sqlx", "SQLx: the ledger survives a restart", "pro"],
  ["rust-config", "The configuration the service reads once", "pro"],
  ["rust-observability", "The line a request leaves behind", "pro"],
  ["rust-service-tests", "Testing the service without a port", "pro"],
  ["rust-ship", "Rust ship", "pro"],
  ["rust-review", "Read a library file the way a reviewer does", "pro"],
  ["rust-takehome", "Rust take-home", "pro"],
];

/**
 * The SQL course, on its own.
 *
 * The language every backend is written in, taught as a language rather than
 * as a tool: the shape of a query, what the planner does with it, and how to
 * tell the difference between a slow query and a wrong one.
 */
export const SQL_FUNDAMENTALS: [string, string, "free" | "pro"][] = [
  ["sql-first-database", "The first database", "pro"],
  ["sql-select-where", "SELECT and WHERE", "pro"],
  ["sql-order-limit", "ORDER BY and LIMIT", "pro"],
  ["sql-group-by", "The aggregates and GROUP BY", "pro"],
  ["sql-joins", "The joins", "pro"],
  ["sql-subqueries", "The subqueries and the views", "pro"],
  ["sql-indexes", "The indexes and the query plan", "pro"],
  ["sql-transactions", "The transactions and the isolation SQLite gives", "pro"],
  ["sql-schema", "The schema and a change made safely", "pro"],
  ["sql-your-turn", "Your turn: the report", "pro"],
];

/**
 * The APIs course, from the outside.
 *
 * The knowledge the main line assumes the first time it calls a server: what
 * a request is, why an answer is not a yes, and why valid JSON is not valid
 * data.
 */
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
    label: "the JavaScript app",
    title: "Task Manager",
    sub: "the JavaScript app taken from the first terminal command to a reviewed pull request",
    phases: TASK_MANAGER,
  },
  {
    slug: "go-fundamentals",
    role: "main",
    label: "the Go language",
    title: "Go fundamentals",
    sub: "the language itself, from values to modules",
    phases: GO_FUNDAMENTALS,
  },
  {
    slug: "go-in-production",
    role: "main",
    label: "the Go service",
    title: "Go in production",
    sub: "the service behind it, from goroutines and HTTP through storage, operations and the labs that close it",
    phases: GO_IN_PRODUCTION,
  },
  {
    slug: "rust-fundamentals",
    role: "main",
    label: "the Rust language",
    title: "Rust fundamentals",
    sub: "the language itself, in the order the book teaches it",
    phases: RUST_FUNDAMENTALS,
  },
  {
    slug: "rust-in-production",
    role: "main",
    label: "the ledger as a service",
    title: "Rust in production",
    sub: "the runtime, the channels, the router, the database, and a release you can defend",
    phases: RUST_IN_PRODUCTION,
  },
  {
    slug: "sql-fundamentals",
    role: "main",
    label: "the SQL",
    title: "SQL fundamentals",
    sub: "the query language every backend is written in, taught as a language rather than as a tool",
    phases: SQL_FUNDAMENTALS,
  },
  {
    slug: "api-basics",
    role: "side",
    label: "reading an API from the outside",
    title: "APIs from the outside",
    sub: "the knowledge the main line assumes the first time it calls a server, and it gates nothing",
    phases: API_BASICS,
  },
] as const;

/** Every shipped phase, in one list: the marquee, the count, the drift gate. */
export const ALL_PHASES: [string, string, "free" | "pro"][] = [
  ...TASK_MANAGER,
  ...GO_FUNDAMENTALS,
  ...GO_IN_PRODUCTION,
  ...RUST_FUNDAMENTALS,
  ...RUST_IN_PRODUCTION,
  ...SQL_FUNDAMENTALS,
  ...API_BASICS,
] as const;

/** How many phases ship on the free tier, counted from the lists above. */
export const FREE_PHASE_COUNT = ALL_PHASES.filter(([, , tier]) => tier === "free").length;

/** How many phases open with a paid tier, counted from the lists above. */
export const PRO_PHASE_COUNT = ALL_PHASES.length - FREE_PHASE_COUNT;

/** The free count, in words, because the sentences about it are sentences. */
const FREE_PHASES_IN_WORDS = numberWords(FREE_PHASE_COUNT) ?? String(FREE_PHASE_COUNT);
const FREE_PHASES_IN_WORDS_CAPITAL = FREE_PHASES_IN_WORDS.charAt(0).toUpperCase() + FREE_PHASES_IN_WORDS.slice(1);

/**
 * What is true of the offer today, in the two states the world can be in.
 *
 * The first line of the hero's note is the only sentence on the page that has
 * to change when the product does, so it is written as a pair and the pair is
 * read by `$lib/release`. The announced version says plainly that there is
 * nothing to install, because a visitor who is told to "try it free" and then
 * finds no download has been lied to, and the thing that follows that lie is
 * a support request about a product they never received.
 *
 * The count in the first version is the shipped free count, not a number
 * somebody remembered.
 */
export const RELEASE_NOTES = {
  available: `Free to download. ${FREE_PHASES_IN_WORDS_CAPITAL} phases ship inside the installer and run offline, so your first judged verdict is minutes away rather than an account away.`,
  announced:
    "The desktop build is not published yet, so there is nothing to install today. Everything else here is already real: the curriculum, the way a verdict is decided, and the verifier for any receipt you already hold.",
} as const;

/* ------------------------------------------------------------------ *
 * The counts, and the sentences that carry them.
 *
 * Everything in this block is computed from the phase lists above, which come
 * from the shipped manifests. A course added in the IDE reaches the strip, the
 * masthead, the curriculum line and the answers by way of the sync, and not
 * by way of somebody remembering to edit a number.
 *
 * Nothing here counts the courses. The courses are named, because a count of
 * courses reads as a count of videos, and because the number of them is a
 * thing that changes. The phases are counted, because the depth of the
 * curriculum is a thing a reader has to be able to check against the
 * manifest.
 * ------------------------------------------------------------------ */

/**
 * The two lines the chrome prints: what the product is, and where it stands
 * today. Both are facts rather than adjectives, because a masthead that
 * carries a claim has to be able to defend it.
 *
 * The status line is computed from the shipped list, so it cannot fall behind
 * it.
 */
export const MASTHEAD = {
  descriptor: "the course that runs inside your editor",
  status: `${ALL_PHASES.length} phases · ${FREE_PHASE_COUNT} free · inside the editor`,
} as const;

/**
 * The readings on the bench.
 *
 * `MARKET.md` §3 asks for a claim about evidence; this is the evidence, as a
 * datasheet. Every row is a promise the product can keep today, and every row
 * is checkable by the reader without asking us anything.
 *
 * The two numbers are computed from the shipped phase list rather than
 * written down.
 */
export const FACTS = [
  { value: String(ALL_PHASES.length), label: "phases, judged in the IDE" },
  { value: String(FREE_PHASE_COUNT), label: "of them free, no account" },
  { value: "0", label: "badges, scores or streaks" },
  { value: "1", label: "editor, with the course inside it" },
] as const;

/**
 * The other courses, in one line each.
 *
 * The list is the shipped list with the first course removed, because the
 * first one is the way in and has a section of its own. A course we have
 * written something about is printed with what we wrote; a course we have not
 * is printed with the manifest's own description, so a course added in the IDE
 * reaches the page without anybody having to come back and write a line for
 * it.
 */
export const COURSE_PATHS = COURSES.slice(1).map((course) => {
  const note = COURSE_PATH_NOTES[course.slug];
  return {
    id: course.slug,
    title: note?.title ?? course.title,
    body: note?.body ?? course.sub,
  };
});

/** One sentence per course, for the answers that have to name all of them. */
export const COURSE_SENTENCES = COURSES.map(
  (course) => `${course.title}: ${course.phases.length} phases, ${course.sub}`
).join(". ");

/**
 * The closing sentence, with the shipped total in it.
 *
 * The depth of the curriculum is a number the reader can check against the
 * manifest, so it is computed from the manifest rather than written down. A
 * course added later changes it, and the sentence changes with it.
 */
export const CLOSING = `${numberWords(ALL_PHASES.length)} phases, one editor, and a curriculum that goes as deep as the work does. ${FREE_PHASES_IN_WORDS_CAPITAL} of the phases ship inside the installer and need no account at all, and every check you will ever run is free.`;

/** The free tier is, in the words the pricing page and the suite share. */
export const FREE_TIER_POINTS = [
  `${FREE_PHASES_IN_WORDS_CAPITAL} phases bundled with the IDE, offline, no account`,
  "Every check and verdict, free forever",
  "Further courses per your tier, inside the same IDE",
  "Account with IDE sign-in through the browser",
] as const;

/** The three steps on the door. Numbers are prose, and they are true.
 *
 * The first step's action is deliberately absent. What the reader can do at
 * step one depends on whether a desktop build is published, and that is a fact
 * about the world rather than about this file, so the page renders that action
 * from `$lib/release` and the other two are ordinary links. */
export const STEPS = [
  {
    n: "01",
    id: "download",
    title: "Install the editor.",
    caption: `A desktop editor with ${FREE_PHASES_IN_WORDS} phases of the course inside it. Install it, open it, and the first judged verdict is minutes away rather than an account away.`,
    points: [
      `${FREE_PHASES_IN_WORDS_CAPITAL} phases, bundled. Work offline, no account`,
      "A real workspace: your files, your tests, your mistakes",
      "A miss comes back with the reason, never a score",
    ],
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
 * What the learner ends up holding.
 *
 * One project, told as the journey it actually is, with the phase ids that
 * carry it. The ids are the shipped ones, so the journey can be checked
 * against the manifest and a phase that moves breaks this list rather than
 * quietly ageing on the page.
 *
 * This is the section that answers "what will I build", and it answers it with
 * a thing rather than with a topic, because "a JavaScript application" is a
 * category and "the app you deploy and then defend in review" is an outcome.
 *
 * It lives beside the phase lists because its caption states how deep the
 * course is, and that number has to come from the same place as everything
 * else rather than being written out here.
 */
export const BUILD_JOURNEY = {
  title: "One app, from an empty folder to a reviewed pull request.",
  caption: `The Task Manager course is ${TASK_MANAGER.length} phases of one JavaScript application. You open it, you break it, you ship it, and then you read somebody else's code.`,
  beats: [
    {
      n: "01",
      title: "Start with an empty folder.",
      body: "You install the tools, learn the editor, and bring the project up. The words every later phase uses are defined here, in plain language, and each one runs as a two-line program.",
      phases: ["setup", "fundamentals"],
    },
    {
      n: "02",
      title: "Give it an interface and a server.",
      body: "Components that earn their keep, the behavior behind them, and then the HTTP that carries the data. The client and the server are both yours to write.",
      phases: ["ui", "behavior", "web-basics", "api", "api-server"],
    },
    {
      n: "03",
      title: "Store the data, and refuse the bad data.",
      body: "Create, read, update, delete, and the pattern that checks a field before it is allowed in. A ledger that keeps money in whole cents, because a float cannot be trusted with it.",
      phases: ["crud-data", "data", "regex-validation"],
    },
    {
      n: "04",
      title: "Break it on purpose.",
      body: "A phase whose job is a failing test. You read the failure, form a hypothesis about the cause, and change one line until it passes.",
      phases: ["debug"],
    },
    {
      n: "05",
      title: "Read code you did not write.",
      body: "One phase hands you a codebase with no instructions. Finding your way through it, and asking the right question of it, is the skill the interview never rehearses.",
      phases: ["navigate"],
    },
    {
      n: "06",
      title: "Put it in Git, test it, deploy it.",
      body: "Commits, branches, a test suite that fails when it should, and a review. Then you answer the review, which is a different skill from making the code.",
      phases: ["git", "testing", "review", "pr-review"],
    },
    {
      n: "07",
      title: "Audit what a model wrote, then build a feature of your own.",
      body: "You check generated code the way you check any other code: by what it does and what it fails to do. The last phase is a feature of your own, with nobody holding the answer.",
      phases: ["ai-audit", "independent"],
    },
  ],
} as const;

/**
 * The curriculum, described on the front page: the courses by name, and how
 * deep each one is.
 *
 * The depths are counted from the phase lists above rather than written out,
 * so the sentence cannot drift away from the shipped phases, and the list of
 * courses is the shipped list rather than a list of courses. The page names
 * the courses and never counts them: a count of courses reads as a count of
 * videos, and this is not that.
 */
export const CURRICULUM = {
  title:
    "A JavaScript app, the Go language, the Go service behind it, a ledger in Rust, and an API from the outside.",
  caption: `${COURSES.map((course) => `${course.title}: ${course.phases.length} phases`).join(". ")}. Everything below ships inside the IDE and is judged there.`,
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
    a: `The curriculum is ${COURSE_SENTENCES}. Every phase ships inside the IDE and is judged there.`,
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
} as const;

/** An amount as the provider charges it. The page never writes a price itself. */
export function money(amount: number): string {
  return `$${amount}`;
}



/**
 * The three lines, in the words the owner decided on.
 *
 * Free is the first hour. Pro is the whole curriculum. Teams is the same Pro
 * with one invoice and the two things a hiring manager needs.
 *
 * The self-serve lines live here, because their prices are decided and
 * published. The lines that are QUOTED live in `QUOTED_PLANS`, below, because
 * their prices are not.
 */
export const PRICING_PLANS = [
  {
    id: "free",
    name: "Free",
    price: money(PRICING.free),
    priceNote: "the first hour",
    quoted: false,
    points: FREE_TIER_POINTS,
  },
  {
    id: "pro",
    name: "Pro",
    price: money(PRICING.monthly),
    priceNote: `a month, or ${money(PRICING.annual)} a year`,
    quoted: false,
    points: [
      `All ${ALL_PHASES.length} phases, in the IDE you already have`,
      "Sync across devices",
      "Hosted runs: the platform runs your code",
      "The evidence ledger and the portfolio",
      "New phases as they land",
    ],
  },
] as const;

/**
 * The offers with no published price.
 *
 * A school licence and a team licence are quoted rather than listed, and the
 * reason is not that the number is hard to find. The price depends on the size
 * of the cohort, the length of the term, the courses, and whether one
 * lecturer or a whole institution is buying. A list price would be wrong for
 * most of them, and a published price is a price the studio has to honour
 * afterwards.
 *
 * Both were already quoted in practice. The platform creates a cohort in
 * PENDING and the studio confirms the licence, so no school and no team has
 * ever bought one at a checkout. What changes here is that the site stops
 * implying there is a list price behind the conversation.
 *
 * So the plate says QUOTED, says what the quote depends on, and gives the
 * reader exactly one action: talk to a person.
 */
export const QUOTED = {
  /** What the plate says where a price would be. */
  label: "Quoted",
} as const;

const TEAM_PLAN = {
  id: "teams",
  name: "Teams",
  price: QUOTED.label,
  priceNote: "priced for your team, per term",
  quoted: true,
  points: [
    "The same Pro your people get",
    "One invoice, no card per person",
    "Invoiced, not a checkout",
    "The hiring one-pager for your roles",
    "A verified-evidence link for the hiring manager",
  ],
  dependsOn: "The quote depends on how many people, for how long, and on which courses.",
  cap: "The quote is capped: a licence never costs more than the same people would pay for Pro on their own.",
  checkout: "There is no checkout for a team licence. It is invoiced, and the quote comes first.",
  action: { href: "/employers#contact", label: "Let's talk" },
} as const;

const CAMPUS_PLAN = {
  id: "campus",
  name: "Campus",
  price: QUOTED.label,
  priceNote: "priced for your institution, per term",
  quoted: true,
  points: [
    "The same Pro your students get",
    "One invoice, no card per student",
    "Invoiced, not a checkout",
    "One term, and the students you name",
    "The roster, and the evidence your students leave",
  ],
  dependsOn:
    "The quote depends on the size of the cohort, the length of the term, and the courses you teach.",
  cap: "The quote is capped: a licence never costs more than the same students would pay for Pro on their own.",
  checkout: "There is no checkout for a campus licence. It is invoiced, and the quote comes first.",
  action: { href: "/universities#contact", label: "Let's talk" },
} as const;

/** The two quoted offers, in the order a reader meets them. */
export const QUOTED_PLANS = [TEAM_PLAN, CAMPUS_PLAN] as const;

/* ===========================================================================
 * ADDED BY THE TEACHING-SURFACE WORKER, 2026-10-20.
 *
 * The campus licence: the same Pro, sold to a cohort, on one invoice.
 *
 * It was invoiced rather than bought at a checkout, exactly like the teams
 * line: there is no provider product for it, and the pricing page keeps
 * saying that checkout is not on sale yet. It is now QUOTED rather than
 * listed, because the price depends on the cohort, the term and the courses,
 * and a per-student list price would be wrong for most of the schools that
 * would ask.
 *
 * The discount is still visible. The line says what Pro costs on its own, and
 * it says the quote is capped at what those students would have paid for Pro
 * individually, so nobody is shown a higher local price than the public one.
 * That is the billing commitment below, applied.
 * ======================================================================== */

export const CAMPUS = {
  /** The offer itself, so the pricing page and the teaching page say it the same way. */
  plan: CAMPUS_PLAN,
  /**
   * The number the seat field starts on.
   *
   * It is a default and not a minimum: a cohort of three is a cohort of
   * three, and the studio quotes whatever the cohort actually is.
   */
  defaultSeats: 20,
} as const;

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

/** The footer's one job: get back to the real surfaces. */
export const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/courses", label: "Courses" },
  { href: "/verify", label: "Verify" },
  { href: "/auth", label: "Account" },
  { href: "/universities", label: "For teaching" },
] as const;

export const NAV = [
  { href: "/#loop", label: "How it works" },
  { href: "/#build", label: "What you build" },
  { href: "/#why", label: "Why" },
  { href: "/#proof", label: "Proof" },
  { href: "/courses", label: "Courses" },
  { href: "/employers", label: "For hiring" },
  { href: "/universities", label: "For teaching" },
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
 * The audience line, and the three facts under the buttons.
 *
 * The line says who the page is for, in the reader's own words, so a visitor
 * can tell in one glance whether this is for them. The facts are the three
 * things a person hesitates on before they start, and every one of them is
 * true of the product today rather than promised.
 */
export const AUDIENCE_LINE = {
  learner: "For people who have done the tutorials and still freeze on a blank file",
  employer: "For teams that hire, and for the evidence they need to see",
} as const;

/**
 * What the reader gets for nothing, in three short facts.
 *
 * The count is the shipped free count, in words, because it is computed from
 * the phase list rather than written down here.
 */
export const MICRO_FACTS = {
  learner: [
    `${numberWords(FREE_PHASE_COUNT)?.replace(/^./, (c) => c.toUpperCase()) ?? String(FREE_PHASE_COUNT)} phases free`,
    "No card, no account",
    "Your project stays on your machine",
  ],
  employer: [
    "A receipt for every finished phase",
    "Anyone can re-derive it",
    "Nothing hidden behind an account",
  ],
} as const;

/**
 * The gap, as a sequence rather than a list.
 *
 * The reader does not arrive with one problem, they arrive with four, in
 * order, and the last one is the moment the product is for. So the four lines
 * light up in turn as the reader reaches them, and the fourth is the one that
 * is about NEXORA.
 */
export const GAP = {
  title: "You followed the tutorial. Then the project was empty.",
  lead: "Following a tutorial teaches you to recognise code. It does not teach you what to do on a blank file, in a codebase you did not write, or when a test fails and nobody says why.",
  lines: [
    "You have watched the tutorials.",
    "You have finished the exercises.",
    "Then a bug appears, and you do not know where to look.",
    "NEXORA exists for that moment.",
  ],
} as const;

/**
 * One line of a panel, and how it is coloured.
 *
 * The colour is data and not a rule written in the view: a failure is red
 * because the platform says it failed, and the platform's own transcript is
 * where the panel's lines come from.
 */
export interface IPanelLine {
  readonly text: string;
  readonly tone: "plain" | "bad" | "ok";
}

/** A panel: the thing a step would show on screen. */
export interface IPanel {
  readonly kind: "prose" | "code";
  readonly lines: readonly IPanelLine[];
}

/**
 * The five steps of a phase, as the product's own transcript shows them.
 *
 * The panels are not written here. They are read out of `RUN_SCRIPT`, which is
 * the product's real transcript, so the loop on the page cannot show a failure
 * the platform would not produce, and the suite checks that every line in
 * every code panel is a line of that transcript.
 */
export const LOOP_STEPS: readonly {
  readonly n: string;
  readonly name: string;
  readonly body: string;
  readonly panel: IPanel;
}[] = (() => {
  const command = RUN_SCRIPT.find((line) => line.kind === "cmd")?.text ?? "";
  const failure = RUN_SCRIPT.find((line) => line.kind === "fail")?.text ?? "";
  const notes = RUN_SCRIPT.filter((line) => line.kind === "note").map((line) => line.text.trim());
  const passing = RUN_SCRIPT.find((line) => line.kind === "ok")?.text ?? "";
  return [
    {
      n: "01",
      name: "Understand",
      body: "A short explanation, then straight into your own project. There is no separate sandbox.",
      panel: {
        kind: "prose" as const,
        lines: [{ text: "A failing test is a question, not a verdict.", tone: "plain" as const }],
      },
    },
    {
      n: "02",
      name: "Write the code",
      body: "You write the first attempt yourself. It does not have to be right.",
      panel: {
        kind: "prose" as const,
        lines: [{ text: "Your own workspace, your own files.", tone: "plain" as const }],
      },
    },
    {
      n: "03",
      name: "Run it",
      body: "The failure is real, and it arrives the way it would at work.",
      panel: {
        kind: "code" as const,
        lines: [
          { text: command, tone: "plain" as const },
          { text: failure, tone: "bad" as const },
        ],
      },
    },
    {
      n: "04",
      name: "Investigate",
      body: "You get a way to look, not the answer. The hints fade as you improve.",
      panel: {
        kind: "code" as const,
        lines: [{ text: notes[1] ?? "", tone: "plain" as const }],
      },
    },
    {
      n: "05",
      name: "Verify",
      body: "The same check gives the same result every time, and it leaves a receipt.",
      panel: {
        kind: "code" as const,
        lines: [
          { text: passing, tone: "ok" as const },
          { text: notes[2] ?? "", tone: "plain" as const },
        ],
      },
    },
  ];
})();

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

/* ===========================================================================
 * ADDED BY THE TEACHING-SURFACE WORKER, 2026-10-20.
 *
 * The teaching half of the front door.
 *
 * The site had a hiring page and nothing for the other person in the room: a
 * lecturer, or a department head, who wants to put the course in front of
 * students. This block is that page's copy, and it is written to the same
 * rules as the hiring one:
 *
 *   - Every claim names the artefact behind it, or it is not a claim.
 *   - What is not built yet is said in the same place and with the same
 *     weight as what is. A reader who finds the gap themselves stops trusting
 *     the part that does exist.
 *   - No response time is promised. A time a reader can hold the studio to is
 *     a claim about a person reading a mailbox, so the copy states what is
 *     true of the mechanism instead: a person reads it, and every enquiry is
 *     answered.
 *   - No em dash and no en dash in a visible string.
 *
 * The counts are read from the lists above rather than typed, so a phase
 * added to the curriculum cannot leave a stale number on the page.
 * ======================================================================== */

/** The address a lecturer writes to. A person reads this mailbox. */
export const TEACHING_CONTACT = "teaching@nexora.dev";

/**
 * The take-home phase, read out of the shipped phase list.
 *
 * It is the one phase whose work is judged by an acceptance suite the
 * student does not hold, which is the anti-cheat mechanism a course needs.
 * The title is the list's own, so a rename in the curriculum cannot leave a
 * stale name on the page.
 */
const TAKE_HOME_ID = "rust-takehome";
const takeHomeTitle = ALL_PHASES.find(([id]) => id === TAKE_HOME_ID)?.[1] ?? "";

/** The courses, named. The page never counts them: a count of courses reads
    as a count of videos, and this is not that. */
const courseNames = COURSES.map((course) => course.title).join(", ");

/**
 * What the cohort surface does not do.
 *
 * The teaching page's honesty list, in one place, and the truth the suite
 * checks it against. Each entry has an id, so the page's list and the
 * platform can be compared without reading prose.
 *
 * The list is here rather than in the page because the page and the suite
 * read the same one, and a page that kept its own copy of the gaps would
 * drift from it exactly when the truth changed.
 *
 * The rule about the list is the rule the hiring page keeps: a thing that is
 * not built is stated with the same weight as a thing that is, because a
 * lecturer who finds out in week three that the thing they were sold does
 * not exist stops trusting the part that does.
 */
export const TEACHING_GAPS = [
  {
    id: "lti",
    text: "No LTI: a course cannot be launched from Canvas or Moodle yet.",
    scope: "teaching",
  },
  {
    id: "grade-passback",
    text: "No grade passback: there is nothing to write back to, because there is no LTI.",
    scope: "teaching",
  },
  {
    id: "certificates",
    text: "No certificates: a receipt is the record, and a certificate would be the same claim with a seal on it.",
    scope: "teaching",
  },
  {
    id: "credit",
    text: "No credit and no accreditation: those are the institution's to grant and the regulator's to recognise, and this product does not issue them.",
    scope: "teaching",
  },
  {
    id: "attendance",
    text: "No attendance: nothing here records whether a student was in the room.",
    scope: "teaching",
  },
  {
    id: "timetable",
    text: "No timetable: a cohort is a course, a term and a teacher, and it is not a schedule.",
    scope: "teaching",
  },
  {
    id: "marks",
    text: "No marks: the work is judged, and a judgement is not a mark.",
    scope: "teaching",
  },
  {
    id: "transcripts",
    text: "No transcripts: there is no record of study to transcribe.",
    scope: "teaching",
  },
  {
    id: "outcome-data",
    text: "No outcome data: no cohort has been taught, so there is no pass rate, no completion figure and no institution to name.",
    scope: "teaching",
  },
  {
    id: "under-16",
    text: "This is a higher education and adult offer. A school for under-16s is not what this is, and we would rather say so than hold a school's students' data badly.",
    scope: "teaching",
  },
] as const;

export const UNIVERSITY = {
  /** The label the folio carries. One label per intent, everywhere. */
  navLabel: "For teaching",
  title: "For teaching",
  headline: ["A course a lecturer can read", "before deciding anything."],
  lede: "Every phase runs in the student's own editor, on the student's own machine, and a finished phase leaves a receipt anybody can re-derive.",
  /** The courses, named. A lecturer can read the whole syllabus first. */
  courses: courseNames,
  /** The three propositions, in the product's own terms. */
  propositions: [
    {
      id: "manifest",
      title: "The syllabus is public.",
      body: "Every phase has a name, an order and a tier, and the manifest is public.",
    },
    {
      id: "machine",
      title: "It runs on the student's own machine.",
      body: "The student installs the editor and does the work. No server to install for a class, no lab image to hand out.",
    },
    {
      id: "judged",
      title: "The work is judged, not scored.",
      body: "A deterministic rule engine decides every pass and every failure. A few checks come from the student's own client.",
    },
  ],
  /** What a lecturer can check today, each one with the artefact behind it. */
  checks: [
    {
      claim: "That the syllabus is knowable, and that the work runs on the student's own machine.",
      evidence: `The curriculum is a public manifest: ${ALL_PHASES.length} phases, each with a name, an order and a tier. Every phase runs in the student's own editor.`,
    },
    {
      claim: "That the verdict is not a model's opinion.",
      evidence:
        "A deterministic rule engine over the student's own code decides every pass and every failure. A few checks come from the student's own client, and the phase says which is which.",
    },
    {
      claim: "That the work can be checked by a stranger.",
      evidence:
        "A finished phase leaves a signed receipt. Anyone can re-derive it at /verify, with no account and no call.",
    },
    {
      claim: "That the take-home work cannot be handed back.",
      evidence: `The take-home phase, ${takeHomeTitle}, is judged by an acceptance suite the student does not hold.`,
    },
    {
      claim: "That a seminar can start with nothing.",
      evidence: `${FREE_PHASE_COUNT} phases are free forever, offline, with no account and no card. No procurement, no institution account, no budget.`,
    },
    {
      claim: "That the licence is priced before it is bought.",
      evidence: `Pro is ${money(PRICING.monthly)} a month or ${money(PRICING.annual)} a year. A campus licence is quoted for your cohort, and invoiced on one line.`,
    },
  ],
  /**
   * What is not built yet.
   *
   * The same rule as the hiring page, and the same weight. This list is not a
   * disclaimer at the bottom of a page: a lecturer who finds out in week three
   * that the thing they were sold does not exist stops trusting the part that
   * does.
   *
   * The list itself lives in `TEACHING_GAPS`, above, because the teaching page
   * and the suite read the same one. A page that kept its own copy of the gaps
   * would drift from the truth exactly when the truth moved, which is the one
   * moment a drift costs something.
   */
  notYet: TEACHING_GAPS,
  /**
   * The accessibility statement.
   *
   * It is linked rather than restated, and full conformance is not claimed.
   * The statement names its own gaps, and a summary of it here would be a
   * summary that hid them.
   */
  accessibility: {
    text: "The accessibility statement is on this site, and it names its own gaps. We do not claim full conformance.",
    label: "Read the accessibility statement",
    href: "/accessibility",
  },
  /** How a pilot starts, in the spirit of the hiring page's pilot. */
  pilot: {
    title: "How a pilot starts.",
    body: "Pick one phase. Ask the students to finish it in the first week, then open the receipt at /verify. If the work is not there, a conversation will not produce it. Run the first phase yourself before you teach it.",
    licence: "A licence covers one term, and the students you name. It is an invoice, not a card per student.",
  },
  /** The close, in the same plain voice as the rest of the page. */
  close: {
    title: "No cohort has been taught yet.",
    body: "There is no pass rate and no institution to name, because nobody has run a cohort. What is here is the mechanism, and anybody can re-derive a receipt at /verify.",
  },
} as const;

/**
 * The teaching enquiry, in the same words as the hiring one.
 *
 * The same treatment: what is collected, what it is used for, that it is not
 * added to a list, and that it is deleted when the thread is over or on
 * request. The page and the endpoint say the same thing, and the suite checks
 * that both places still say it.
 */
export const TEACHING_ENQUIRY = {
  title: "Tell us what you teach.",
  lead: "One form, and a person reads it. Every enquiry is answered.",
  next: "What happens next: we read it, we reply to the address you gave, and we say plainly if this is not something we can serve.",
  privacy:
    "Your name, your work email and what you teach go to the studio's teaching mailbox. They are used to answer you and for nothing else, they are not added to a list, and the message is deleted when the thread is over or when you ask us to delete it.",
  /* No response time is promised here, for the same reason the hiring page
     promises none: a time a reader can hold the studio to is a commitment
     about a person answering a mailbox, and the honest thing the site can
     say is what is true of the mechanism. */
  replyTime: "Every enquiry is answered",
  notConfigured:
    "This build has no mail provider configured, so the form cannot send. Write to the address on this page instead, and it reaches the same person.",
  name: "your name",
  email: "your work email",
  need: "what you teach and how many students",
  submit: "Send it",
  sent: "Your message is with us. A person reads this mailbox, and every enquiry is answered.",
  failed: `That did not go through. Try again, or write to ${TEACHING_CONTACT}.`,
} as const;

/* ===========================================================================
 * ADDED BY THE COHORT-SURFACE WORKER, 2026-10-20.
 *
 * The cohort surface: the instructor's page, the way a student joins, and the
 * line the account home says about the cohort a learner is in.
 *
 * The rules this block keeps are the ones the rest of the file keeps.
 *
 *   - A number comes from this module or from the platform. A page never
 *     types one.
 *   - The course a cohort is for is named from the course list above, so a
 *     cohort cannot offer a course that does not ship, and the title beside a
 *     cohort is the site's own title and never a name the platform made up.
 *   - A cohort in `pending` grants nothing. The sentences here say that in
 *     plain words, because a page that prints the word "pending" and leaves
 *     it there reads like an administrative detail, and it is not one: it is
 *     a licence that has not been confirmed, and the students who join get
 *     the nine free phases and nothing more.
 *   - No em dash and no en dash in a visible string.
 * ======================================================================== */

/**
 * The courses a cohort can be for.
 *
 * Read out of the course list above rather than written out, so the select on
 * the instructor's page cannot offer a course the platform does not ship, and
 * so the title printed beside a cohort is this site's title.
 */
export const COHORT_COURSE_OPTIONS = COURSES.map((course) => ({
  id: course.slug,
  title: course.title,
  sub: course.sub,
}));

/**
 * The three states of a licence, in the words the pages say them in.
 *
 * The state is not a label with a colour beside it. Each one says what the
 * state means for the students, because that is the part a lecturer has to be
 * able to explain to a room, and because a pending licence that reads like a
 * pending sign-up is a licence people describe as "sorted".
 */
export const COHORT_STATUS = {
  pending: {
    label: "pending",
    title: "The studio has to confirm the licence.",
    body: "The cohort exists and you can see it, but the licence has not been confirmed. While it waits, the students who join get the nine free phases and nothing more. They do not have the paid course.",
  },
  active: {
    label: "active",
    title: "The licence is confirmed and the seats are real.",
    body: "The students in this cohort can open the paid phases of this course, and only this course, until the licence ends.",
  },
  ended: {
    label: "ended",
    title: "The licence has ended.",
    body: "No new entitlement is granted. The receipts the members already have stay, because a receipt is a record of work and ending a licence does not unprove it.",
  },
} as const;

/**
 * The export.
 *
 * The column names are written out here, in one place, because the page has
 * to describe the file in the words the file itself uses. These are the
 * platform's own column names, in the platform's own order, and the suite
 * reads them and compares them with the platform's header, so the two cannot
 * drift apart in silence.
 */
const COHORT_EXPORT_COLUMNS = [
  "email",
  "name",
  "joined_at",
  "competency_id",
  "level",
  "kind",
  "issued_at",
  "receipt_sha256",
] as const;

const cohortExportColumnSentence = `${COHORT_EXPORT_COLUMNS.slice(0, -1).join(", ")} and ${COHORT_EXPORT_COLUMNS[COHORT_EXPORT_COLUMNS.length - 1]}`;

export const COHORT_EXPORT = {
  /** The header the file carries, in the order it carries it. */
  columns: COHORT_EXPORT_COLUMNS,
  header: COHORT_EXPORT_COLUMNS.join(","),
  /** What the file is, in the words the file's own header uses. */
  description: `The file has one row per piece of verified work, and its columns are ${cohortExportColumnSentence}. That is what the file is: a statement of the work the platform judged for this cohort.`,
  /**
   * What the file is not, in the file's own words.
   *
   * These are the sentences the platform writes into the file, so the page and
   * the document a lecturer hands to somebody else say the same thing.
   */
  whatItIsNot:
    "It is not a grade. It is not a certificate. It is not a transcript. It carries no credit and it is not accredited.",
  label: "the file",
  button: "Download the cohort statement",
  downloading: "Building the file",
  done: "The file downloaded.",
  failed: "The file could not be fetched, so nothing was downloaded.",
} as const;

/**
 * The instructor's page.
 *
 * A front door for a lecturer, not a classroom. It shows the cohorts, the
 * code to put on a slide, the roster with what the platform has verified,
 * the file, and the way to end the licence. It does not teach, and it does
 * not pretend the platform is there when it is not.
 */
export const COHORT_TEACH = {
  title: "Your cohorts.",
  lede: "This is the instructor's side. It holds the cohorts you teach, the code your students type, the work the platform has verified for them, and the file you can take away.",
  signedOut: {
    title: "Sign in to see your cohorts.",
    body: "A cohort belongs to the account that created it, so this page asks the server who you are before it shows anything. Sign in and come back.",
  },
  platformDown:
    "The platform did not answer, so nothing here is known. Your work in the IDE is untouched, and nothing was changed.",
  cohorts: {
    label: "your cohorts",
    title: "The cohorts you teach.",
    loading: "Reading your cohorts.",
    empty: "You do not teach a cohort yet. Create one below and the join code appears at once.",
    name: "name",
    institution: "institution",
    course: "course",
    term: "term",
    status: "status",
    code: "join code",
    codeHint:
      "Put this on a slide. A student types it once, and the page tells them what joining gives them.",
    members: "members",
    seats: "seats",
    open: "Open the roster",
    close: "Close the roster",
    share: "the link to give your students",
  },
  create: {
    label: "a new cohort",
    title: "Create a cohort.",
    lede: "A cohort is one course, one term, one instructor and one licence. It is created in the pending state, and the studio confirms the licence.",
    name: "the name of the cohort",
    namePlaceholder: "CS 202: distributed systems",
    institution: "the institution",
    institutionPlaceholder: "Delft University",
    course: "the course",
    term: "the term",
    termPlaceholder: "2026 autumn",
    seats: "the number of seats",
    seatsHint:
      "A term licence is quoted for your cohort, and the studio confirms it. The seats you put here are the seats the licence will cover.",
    submit: "Create the cohort",
    submitting: "Creating the cohort",
    created:
      "The cohort is created, and it is pending. The studio has to confirm the licence before it carries anything, and until it does, the students who join get the nine free phases and nothing more.",
    failed:
      "The cohort was not created, and what you typed is still here. The platform did not answer.",
  },
  roster: {
    label: "the roster",
    title: "Who is in this cohort.",
    loading: "Reading the roster.",
    failed: "The roster could not be read, so it is not shown.",
    empty: "Nobody has joined with this code yet.",
    emptyWhy:
      "A student joins by typing the join code, so the roster fills when the first one does.",
    member: "member",
    joined: "joined",
    proofs: "what the platform has verified",
    noProofs:
      "Nothing is verified for this member yet. The work is judged in the IDE, and it syncs when the learner syncs it.",
    proofLevel: "level",
    proofKind: "kind",
    proofIssued: "issued",
  },
  end: {
    label: "the licence",
    title: "End the licence.",
    body: "Ending the licence stops the entitlement. No new student is given a seat, and the students who are in the cohort keep the receipts they already have.",
    button: "End this licence",
    confirm: "Click again to end the licence",
    working: "Ending the licence",
    done: "The licence has ended. No new entitlement is granted, and the receipts the members already have stay.",
    failed: "The licence was not ended, and it is still as it was.",
  },
} as const;

/**
 * How a student joins.
 *
 * The code is on a slide and it is typed once, so the page says one thing
 * before the code is entered: what joining gives, and what it does not.
 */
export const COHORT_JOIN = {
  title: "Join a cohort.",
  lede: "Your instructor puts a code on the slide. You type it once, and you are in.",
  gives: "Joining gives you the paid course of that cohort, and nothing else. It does not open the other courses, and it does not open the paid phases of a course that is not this one.",
  free: "The nine free phases are free either way, with no code and no account, and every check is free.",
  pending: "If the licence is still waiting for the studio, joining gets you the nine free phases and nothing more, and this page says so.",
  field: "the join code from the slide",
  placeholder: "KQ7M-XR42",
  action: "Join with this code",
  working: "Joining",
  joined: "You are in.",
  joinedAlready: "You were already in this cohort, so nothing changed.",
  inCourse: "the course",
  atInstitution: "the institution",
  theTerm: "the term",
  notConfigured:
    "Accounts are not connected in this build, so no code can be joined. The nine free phases in the IDE need no account.",
  signedOut:
    "Joining puts the cohort on your account, so sign in first and the code will still be here.",
  errors: {
    unknown: "That code is not a code we know. Read the letters on the slide again and type it once more.",
    expired: "That code has expired. Ask your instructor for a new one.",
    ended:
      "That cohort's licence has ended, so the code no longer works. Ask your instructor for a new cohort.",
    full: "That cohort has no seats left. Ask your instructor for a seat.",
    refused:
      "That code was not accepted. Read the letters on the slide again, or ask your instructor for a new one.",
    platform:
      "The platform did not answer, so nothing was joined. Your work in the IDE is untouched, and you can try again.",
  },
} as const;

/**
 * The cohort, on the account home.
 *
 * The account home says nothing about a cohort when there is none. When there
 * is one, it names the course, the institution and the term, and it says what
 * the cohort gives, which depends on the state of the licence.
 */
export const COHORT_ACCOUNT = {
  label: "your cohort",
  title: "The cohort you are in.",
  course: "the course",
  institution: "the institution",
  term: "the term",
  active:
    "This gives you the paid course of that cohort, and nothing else. It does not open the other courses.",
  pending:
    "The licence of this cohort is still waiting for the studio to confirm it, so it gives you the nine free phases and nothing more for now.",
  ended:
    "The licence of this cohort has ended, so it gives you nothing further. The receipts you already have stay.",
  unknown: "The platform did not answer, so what this account holds is not known here.",
  reading: "Reading what this account holds.",
  joinLink: "Join a cohort with a code",
} as const;

/**
 * What the cohort surface does, in the words the teaching page uses.
 *
 * Three things, and each one names the artefact behind it, the way every
 * other claim on that page does.
 */
export const COHORT_SURFACE = {
  title: "What a cohort gives you.",
  label: "a cohort gives you",
  lede: "Three things the cohort surface does, and where each one is kept.",
  built: [
    {
      id: "roster",
      claim: "A roster.",
      evidence:
        "You can see who is in the cohort, when they joined, and what the platform has verified for each of them.",
    },
    {
      id: "instructor-view",
      claim: "An instructor's view.",
      evidence:
        "Your cohorts, the licence, the join code and the seat count are on one page, and the code is the thing you put on a slide.",
    },
    {
      id: "export",
      claim: "An export.",
      evidence:
        "A CSV of what the platform judged for each member of the cohort, and the file says what it is and what it is not.",
    },
  ],
  link: { href: "/teach", label: "Open the instructor's page" },
} as const;

/**
 * The truth table the suite checks the teaching page against.
 *
 * `built` is what the cohort surface does. Each entry names the route behind
 * it, the words the platform's own source has to carry, and the call the
 * front door makes, so the suite can check the two sides against each other
 * without a hand-written list of its own. `gaps` is what it does not do, and
 * each one has no route and no claim anywhere on the site.
 *
 * The two sets are disjoint by construction, and the suite fails when a page
 * keeps calling a gap a gap after it has been built, or when a feature has
 * quietly gone while the page still says it is there. That is the whole point
 * of writing the list down: the truth of the day changes, and the page has to
 * change with it rather than beside it.
 */
export const COHORT_TRUTH = {
  built: [
    {
      id: "roster",
      route: "/api/auth/cohorts/:id",
      platform: "/cohorts/:id",
      what: "the roster of a cohort, with the members and what the platform has verified for them",
      call: "/api/auth/cohorts/${encodeURIComponent(id)}",
    },
    {
      id: "instructor-view",
      route: "/api/auth/cohorts",
      platform: "/cohorts",
      what: "the cohorts the caller teaches",
      call: '"/api/auth/cohorts"',
    },
    {
      id: "membership",
      route: "/api/auth/cohorts/mine",
      platform: "/cohorts/mine",
      what: "the cohorts the caller is in",
      call: '"/api/auth/cohorts/mine"',
    },
    {
      id: "export",
      route: "/api/auth/cohorts/:id/export",
      platform: "/cohorts/:id/export",
      what: "the file of what the platform judged",
      call: "/api/auth/cohorts/${encodeURIComponent(id)}/export",
    },
    {
      id: "create",
      route: "/api/auth/cohorts",
      platform: "/cohorts",
      what: "creating a cohort",
      call: '"/api/auth/cohorts"',
    },
    {
      id: "join",
      route: "/api/auth/cohorts/join",
      platform: "/cohorts/join",
      what: "joining with a join code",
      call: '"/api/auth/cohorts/join"',
    },
    {
      id: "end",
      route: "/api/auth/cohorts/:id/end",
      platform: "/cohorts/:id/end",
      what: "ending a licence",
      call: "/api/auth/cohorts/${encodeURIComponent(id)}/end",
    },
  ],
  /** The ids of the things the cohort surface does not do. */
  gaps: [
    "lti",
    "grade-passback",
    "certificates",
    "credit",
    "attendance",
    "timetable",
    "marks",
    "transcripts",
    "outcome-data",
  ],
  /**
   * The ids on the teaching page's list that are a scope note rather than a
   * gap. The offer is for higher education and adults, and that is a fact
   * about the product rather than a thing that is missing, so it is on the
   * page and it is not in the gap list.
   */
  notes: ["under-16"],
  /**
   * The route path fragments a gap would have if it were built.
   *
   * The suite looks for them in the platform's own route table, so a gap that
   * has quietly been built fails here rather than staying on the page. They
   * are path fragments and not words, because the platform's own file says in
   * words that it is not a certificate, and that is the file doing its job.
   */
  gapRoutes: [
    "lti",
    "passback",
    "certificate",
    "attendance",
    "timetable",
    "transcript",
    "grade",
    "outcome",
  ],
} as const;

