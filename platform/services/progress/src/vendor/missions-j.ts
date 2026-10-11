import type { Mission } from "./types.js";

/* Language layer, functions — and the first return of two values. Assessed by
   a real run of the learner's program (a `runs` check against the runner's
   signed record), plus prediction questions so it stays completable where no
   runner is reachable. */

export const MISSIONS_J: Mission[] = [
  {
    id: "go-functions",
    stageId: "go-basics",
    title: "Functions and the shape of a program",
    tagline: "Give a job a name, and give failure somewhere to go.",
    type: "practice",
    difficulty: 2,
    estMinutes: 25,
    objectives: [
      "Declare and call a function with parameters and a return value",
      "Return two values and use the second one",
      "Signal failure with an error instead of a wrong answer",
      "Check the error at the call site before using the result",
    ],
    prereqIds: ["go-control-flow"],
    competencyIds: ["go-functions"],
    whyItMatters:
      "A function is where a program gets its shape: a name for one job, inputs, and an answer. Go's second return value is how that answer says “I could not do this”, and every language layer mission from here returns errors this way.",
    lesson: [
      {
        kind: "prose",
        body: "A function is a name for a job: inputs in, an answer out, and the rest of the program stops caring how the work happens. Naming the job well is most of the design work — `share` says more than `doStuff` ever will.\n\nGo adds one idea that shapes everything after this: a function can return more than one value, and when a job can fail it returns its result *and* an `error`. The two travel together on purpose, so the only way to reach the result is to pass the error and decide what to do with it. A function that answers with a wrong-but-plausible value and no error is the bug you cannot see.",
      },
      {
        kind: "example",
        body: "A function that can fail, and a call site that deals with it:",
        code: 'package main\n\nimport (\n\t"errors"\n\t"fmt"\n)\n\n// half returns both a value and a reason. When it cannot do the job it says\n// why, instead of returning a number that looks like a real answer.\nfunc half(n int) (int, error) {\n\tif n%2 != 0 {\n\t\treturn 0, errors.New("odd numbers do not halve cleanly")\n\t}\n\treturn n / 2, nil\n}\n\nfunc main() {\n\tresult, err := half(8)\n\tif err != nil {\n\t\tfmt.Println("error:", err)\n\t\treturn\n\t}\n\tfmt.Println(result)\n}\n',
      },
      {
        kind: "task",
        body: "Make the program print exactly `each person gets 3`. Right now `share` promises to split the total but hands it back untouched — give it the ability to fail instead of guessing: return `(int, error)`, refuse to split into zero parts rather than dividing by zero, and check the error at the call site before printing. Then run it and read the output; the check reads your run's stdout, never your code.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\n// share splits a total into equal parts.\nfunc share(total, parts int) int {\n\treturn total\n}\n\nfunc main() {\n\tperPerson := share(12, 4)\n\tfmt.Println("TODO", perPerson)\n}\n',
    checks: [
      {
        id: "run-share",
        label: "A real run printed each person gets 3",
        feedback:
          "No run on record printed “each person gets 3”. Run it and read what actually came out: a split that ignores the part count, a print line with extra words, or an error you never handled all show up in the run.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode" },
            { target: "stdout", equals: "each person gets 3" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt:
          "You write `perPerson, err := share(12, 4)`, print `perPerson`, and never mention `err` again. What happens when you run it?",
        options: [
          "It runs and prints the number",
          "It fails to compile: err is declared and never used",
          "It panics when the error is non-nil",
          "It prints the error instead of the number",
        ],
        answer: 1,
        explanation:
          "An unused local variable is a compile error in Go, so a function that hands you an error forces you to acknowledge it. Ignoring one is still possible — `_` exists for that — but it can never happen by accident.",
      },
      {
        id: "j2",
        prompt:
          "With the guard in place, what does `share(12, 0)` return for a part count of zero?",
        options: [
          "0 and an error",
          "3 and nil",
          "It panics — integer division by zero",
          "A zero value and no error",
        ],
        answer: 0,
        explanation:
          "The guard returns before the divide: a zero value plus a reason. Integer division by zero panics in Go, which is exactly what the early return prevents.",
      },
    ],
    hintLadder: [
      "Run the starter first. What does it print, and what does the comment above `share` claim the function does?",
      "The gap between that comment and the code is the task: `share` needs an answer and a way to say it failed. Write the signature before the body.",
      "A Go function can return several values: `func share(total, parts int) (int, error)`. Return `0` with an error when `parts == 0`, and `total / parts` with `nil` when it can. `errors.New` needs `errors` added to the import block at the top.",
      "At the call site take both values — `perPerson, err := share(12, 4)` — then handle `err` before printing. Go will not compile an error you never mention, so the code shape forces the decision.",
      "Solution shape: `if parts == 0 { return 0, errors.New(\"cannot split into zero parts\") }`, otherwise `return total / parts, nil`; at the call site handle `err`, then print exactly `each person gets 3`. Transfer: name your next function after what it returns.",
    ],
    misconceptions: [
      "Treating the return value as the whole answer — the error is part of it, in the same signature.",
      "Assuming a two-value return needs two statements; `result, err := half(8)` is one assignment.",
      "Thinking an unused parameter is a compile error. Unused local variables are; unused parameters are allowed.",
    ],
    completionNote: "A function that can fail, and a call site that deals with it.",
    masteryNote: "Error-first function shape written with no hints.",
    fileName: "main.go",
    language: "go",
  },
];
