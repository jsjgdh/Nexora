import { COURSES } from "./site";
import { COURSE_ACTIVITY_COUNTS } from "./phase-detail.generated";

/* The shelf, as a reader meets it.
 *
 * A language or a project is one page. Go fundamentals and the Go service are
 * two tracks of the Go page, not two products with two front doors; the same
 * is true of Rust. The phase lists are not copied here: each track points at
 * the shipped course and the page reads the manifest's own phases, goals and
 * counts.
 *
 * Editorial copy lives here. It is deliberately short: a promise, two
 * paragraphs, three things the reader builds, and the places the language is
 * actually used. No ranking, no salary, no invented outcome. */

export type Tier = "free" | "pro";
export type ShippedPhase = readonly [string, string, Tier];

export type Track = {
  slug: string;
  eyebrow: string;
  title: string;
  summary: string;
};

export type CoursePage = {
  slug: string;
  language: string;
  title: string;
  mark: string;
  /** The project's own mark, where the project publishes one and permits its
      use. Absent means the typographic mark is the honest identity. */
  logo?: string;
  /** How the mark fills the plate. The Go gopher is wide line art, so it is
      cropped to the face; the other marks keep their full outline. */
  logoFit?: "contain" | "cover";
  accent: "task-manager" | "go" | "rust" | "sql" | "zig" | "ocaml" | "api";
  kicker: string;
  promise: string;
  intro: readonly [string, string];
  build: readonly { title: string; body: string }[];
  use: readonly string[];
  why: readonly [string, string];
  tracks: readonly Track[];
};

export const COURSE_PAGES: readonly CoursePage[] = [
  {
    slug: "task-manager",
    language: "JavaScript",
    title: "Task Manager",
    mark: "JS",
    logo: "/logos/javascript.png",
    accent: "task-manager",
    kicker: "JavaScript · One app",
    promise:
      "Build one JavaScript application from an empty folder to a reviewed pull request.",
    intro: [
      "The course begins with a terminal and an empty folder. You install the tools, learn the words the rest of the course uses, and bring a small task application up before the first hour is over.",
      "Every later phase changes that same application. You add an interface, a server, storage, tests and a review, so the work accumulates instead of resetting between lessons.",
    ],
    build: [
      {
        title: "A working task app",
        body: "A real workspace with a browser interface, an HTTP server and data that survives a restart.",
      },
      {
        title: "A test suite you can trust",
        body: "Tests that fail for the right reason, then pass once the cause is fixed.",
      },
      {
        title: "A reviewed pull request",
        body: "A branch, a review, a response, and a feature of your own at the end.",
      },
    ],
    use: [
      "The loop behind almost every web application",
      "Front end, server, data and tests in one project",
      "A portfolio artefact you can walk through",
    ],
    why: [
      "JavaScript is the language a browser already runs. That makes it the shortest path from a first line of code to an interface a person can use, without a second runtime or a build system you have to invent.",
      "The course keeps one application for its whole length. The phases are arranged by the questions a real project asks, not by language features in isolation, so the vocabulary arrives when the work needs it.",
    ],
    tracks: [{ slug: "task-manager", eyebrow: "The main line", title: "The application", summary: "One project, built phase by phase." }],
  },
  {
    slug: "go",
    language: "Go",
    title: "Go",
    mark: "Go",
    logo: "/logos/go-gopher.svg",
    logoFit: "cover",
    accent: "go",
    kicker: "Concurrency · Services",
    promise:
      "Learn Go as a language, then run it as a service with deadlines, storage and tests.",
    intro: [
      "Go is a small language with a serious runtime. The first track teaches the language itself: values, control flow, functions, structs, interfaces, errors and modules, with each phase judged by code that will not compile or pass without the idea it teaches.",
      "The second track takes that language into a service. You add goroutines, cancellation, JSON, an HTTP server, middleware, authentication, storage, caching, logging and a release you can defend.",
    ],
    build: [
      {
        title: "A small ledger",
        body: "The language track ends with a working program that keeps money in whole cents.",
      },
      {
        title: "A concurrent service",
        body: "Routes, deadlines, shared state and a stop path that behaves when the process is asked to leave.",
      },
      {
        title: "A service you can operate",
        body: "A database, a cache, logs, tests and a release with the reasons written down.",
      },
    ],
    use: [
      "Network services and APIs",
      "Command line tools and automation",
      "Concurrent backends and infrastructure",
    ],
    why: [
      "Go makes concurrency a normal part of a program rather than a separate discipline. Goroutines and channels are small enough to learn early, and the runtime gives a service the pieces it needs to stop, time out and recover.",
      "The language is deliberately narrow. A reader can hold most of it in their head, which leaves attention for the part that decides whether a service survives: the boundaries, the data and the failures.",
    ],
    tracks: [
      { slug: "go-fundamentals", eyebrow: "Track one", title: "The language", summary: "From the first value to a module, judged by compiled code." },
      { slug: "go-in-production", eyebrow: "Track two", title: "The service", summary: "Concurrency, HTTP, storage, operations and the labs that close it." },
    ],
  },
  {
    slug: "rust",
    language: "Rust",
    title: "Rust",
    mark: "Rs",
    logo: "/logos/rust.svg",
    accent: "rust",
    kicker: "Ownership · Services",
    promise:
      "Learn Rust through ownership, then carry it into a service that survives a restart.",
    intro: [
      "Rust asks a different question of a program: who owns this value, and for how long. The first track teaches that question through values, control flow, ownership, borrowing, structs, enums, errors, modules, collections, traits and lifetimes.",
      "The second track makes the answer pay. You build a ledger service with a runtime, tasks, channels, a typed router, shared state, a database, configuration, logs, tests and a release you can defend.",
    ],
    build: [
      {
        title: "A money type",
        body: "A type of your own design, with the invariants enforced by the compiler rather than by a comment.",
      },
      {
        title: "A typed service",
        body: "A router, its extractors, shared state and the layers around a request.",
      },
      {
        title: "A durable ledger",
        body: "Data that survives a restart, a stop path, logs and tests without a port.",
      },
    ],
    use: [
      "Systems and embedded work",
      "Network services and command line tools",
      "Code where ownership and memory are part of the design",
    ],
    why: [
      "Rust moves a class of mistakes from run time to compile time. The borrow checker is strict because the alternative is a program whose failures arrive in production, when the context needed to understand them is gone.",
      "The course does not pretend the compiler is the whole language. It spends time on the parts that make a service usable: errors that become answers, a router a reader can follow, and a release whose behaviour is known.",
    ],
    tracks: [
      { slug: "rust-fundamentals", eyebrow: "Track one", title: "The language", summary: "Ownership, borrowing, types and the standard library." },
      { slug: "rust-in-production", eyebrow: "Track two", title: "The ledger", summary: "A runtime, a router, a database and a release you can defend." },
    ],
  },
  {
    slug: "sql",
    language: "SQL",
    title: "SQL",
    mark: "SQL",
    accent: "sql",
    kicker: "Queries · Plans",
    promise:
      "Read and write SQL as a language, then make the planner's choices visible.",
    intro: [
      "SQL is the language most backends are written in, even when the application is written in something else. The course treats it as a language: the shape of a query, the order the database evaluates it, and the difference between a slow query and a wrong one.",
      "The data is a ledger of accounts and transactions. It ships with the course, the database is one file in your own folder, and there is no server to start.",
    ],
    build: [
      {
        title: "A working database",
        body: "A schema, a first query and data you can change without fear.",
      },
      {
        title: "Queries that answer a question",
        body: "Joins, aggregates, subqueries and views, each tied to a question the ledger asks.",
      },
      {
        title: "A safe schema change",
        body: "An index, a query plan and a migration that can be run more than once.",
      },
    ],
    use: [
      "Backend services and application data",
      "Reporting and analysis",
      "Schema changes that have to be safe",
    ],
    why: [
      "Most application bugs that look like code bugs are data bugs. Knowing what a query returns, and what it costs, shortens the distance between a symptom and its cause.",
      "The course uses SQLite because it is in the standard library of the language you already have, and because a database in one file makes the plan, the transaction and the schema visible instead of hidden behind a service.",
    ],
    tracks: [{ slug: "sql-fundamentals", eyebrow: "The course", title: "SQL, on a ledger", summary: "From the first database to a schema change made safely." }],
  },
  {
    slug: "zig",
    language: "Zig",
    title: "Zig",
    mark: "Zg",
    logo: "/logos/zig-mark.svg",
    accent: "zig",
    kicker: "Memory · Compile time",
    promise:
      "Learn Zig with explicit memory, error unions and the build system in view.",
    intro: [
      "Zig keeps the machinery visible. The course starts with what build.zig decides, then moves through values, control flow, functions, structs, pointers, error unions and the allocator.",
      "Later phases introduce defer, comptime and generics, the standard library and the test runner. You build a sheet program and a second audit program, and the Zig tests the project ships judge each phase.",
    ],
    build: [
      {
        title: "A sheet program",
        body: "A small program whose behaviour is checked by the tests in the project.",
      },
      {
        title: "An audit program",
        body: "A second program that reads what the first produced and reports what it finds.",
      },
      {
        title: "A test suite",
        body: "The test runner wired into the project, not added at the end.",
      },
    ],
    use: [
      "Systems programming",
      "Game engines and tooling",
      "Programs that trade abstraction for control",
    ],
    why: [
      "Zig asks the programmer to say what they mean about memory and errors. That is more work up front and less guesswork later, especially in code that has to run close to the machine.",
      "The language is also a build system and a test runner. Learning all three together means the first real project does not have to stop while you invent the parts around the language.",
    ],
    tracks: [{ slug: "zig-fundamentals", eyebrow: "The course", title: "Zig, from the build file", summary: "Values, pointers, allocators, comptime and the test runner." }],
  },
  {
    slug: "ocaml",
    language: "OCaml",
    title: "OCaml",
    mark: "ML",
    logo: "/logos/ocaml-icon.svg",
    accent: "ocaml",
    kicker: "Types · Modules",
    promise:
      "Learn OCaml through types, pattern matching and modules that compose.",
    intro: [
      "OCaml makes the shape of a program explicit. The course begins with a dune project and the compiler, then moves through values, control flow, pattern matching, functions, lists and recursion.",
      "Records, mutable state, variants, polymorphic variants, modules, functors, errors and the standard library follow. The phases build one calculator, one module at a time, and end with an evaluator you write yourself.",
    ],
    build: [
      {
        title: "A calculator",
        body: "One program grown module by module, with the compiler as a constant reader.",
      },
      {
        title: "A module built by a functor",
        body: "A reusable piece with an interface the rest of the program can rely on.",
      },
      {
        title: "An evaluator",
        body: "The final phase: a small language, its values and its rules, written by you.",
      },
    ],
    use: [
      "Compilers and language tools",
      "Financial and formal systems",
      "Services that model a domain precisely",
    ],
    why: [
      "Pattern matching and algebraic types make impossible states hard to write down. That is valuable in any program with rules, and it is the reason OCaml keeps appearing in compilers, analysis tools and systems with a formal core.",
      "The course uses the compiler as a teaching instrument. A phase is not finished when it looks right; it is finished when the types agree and the tests the project ships pass.",
    ],
    tracks: [{ slug: "ocaml-fundamentals", eyebrow: "The course", title: "OCaml, one module at a time", summary: "From the first program to a module built by a functor." }],
  },
  {
    slug: "api",
    language: "HTTP",
    title: "APIs from the outside",
    mark: "API",
    accent: "api",
    kicker: "Contracts · Payloads",
    promise:
      "Read an API from the outside: the contract, the response and the payload.",
    intro: [
      "Most courses assume you already know what happens when a program calls a server. This one starts there: what a request is, why an answer is not a yes, and why valid JSON is not valid data.",
      "It is a short side course. It gates nothing, and it can be read before, during or after the main line.",
    ],
    build: [
      {
        title: "A contract you can read",
        body: "The endpoint, the method, the fields and the promises a server makes.",
      },
      {
        title: "A response you can question",
        body: "Status codes, headers and the difference between a successful call and a correct answer.",
      },
      {
        title: "A payload you can distrust",
        body: "Validation at the boundary, before the data reaches the rest of the program.",
      },
    ],
    use: [
      "Consuming a third-party service",
      "Debugging a request that fails",
      "Reading a contract before writing code",
    ],
    why: [
      "An API is a conversation with rules. The rules are usually written down, and reading them first is faster than discovering them one failed request at a time.",
      "The course is short because the knowledge is small and reusable. Once the contract, the response and the payload are separate ideas, most of the confusion around a network call disappears.",
    ],
    tracks: [{ slug: "api-basics", eyebrow: "The side course", title: "The API, from the outside", summary: "Three phases that assume nothing." }],
  },
] as const;

export const COURSE_BY_SLUG: Record<string, CoursePage> = Object.fromEntries(
  COURSE_PAGES.map((course) => [course.slug, course])
);

export function shippedCourse(slug: string) {
  const course = COURSES.find((item) => item.slug === slug);
  if (!course) throw new Error(`Unknown shipped course: ${slug}`);
  return course;
}

export function trackPhases(track: Track): readonly ShippedPhase[] {
  return shippedCourse(track.slug).phases;
}

export function trackActivities(track: Track): number {
  return COURSE_ACTIVITY_COUNTS[track.slug] ?? 0;
}

export function coursePhases(course: CoursePage): readonly ShippedPhase[] {
  return course.tracks.flatMap((track) => trackPhases(track));
}

export function courseActivities(course: CoursePage): number {
  return course.tracks.reduce((total, track) => total + trackActivities(track), 0);
}

export function courseFreePhases(course: CoursePage): number {
  return coursePhases(course).filter(([, , tier]) => tier === "free").length;
}

export function courseTierWords(course: CoursePage): string {
  const tracks = course.tracks.length;
  return tracks === 1 ? "One track" : `${tracks} tracks`;
}

/** The route a course lives at. `go-fundamentals` and `go-in-production` both
    resolve to `/courses/go`, because a language is one page. */
export const TRACK_TO_COURSE: Record<string, string> = {
  "task-manager": "task-manager",
  "go-fundamentals": "go",
  "go-in-production": "go",
  "rust-fundamentals": "rust",
  "rust-in-production": "rust",
  "sql-fundamentals": "sql",
  "zig-fundamentals": "zig",
  "ocaml-fundamentals": "ocaml",
  "api-basics": "api",
};
