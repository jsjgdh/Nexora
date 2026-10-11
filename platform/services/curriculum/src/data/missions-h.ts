import type { Mission } from "./types.js";

/* Language layer, values and types. Four typed values, printed on one line,
   with a real run of the learner's program as the evidence. The two ideas a
   beginner cannot read off the output — Go's zero value, and a type that never
   changes — travel in the questions, because watching output would let both
   slide past. */

export const MISSIONS_H: Mission[] = [
  {
    id: "go-values",
    stageId: "go-basics",
    title: "Values, types and variables",
    tagline: "Give a value a name, a type, and a place in the output.",
    type: "practice",
    difficulty: 1,
    estMinutes: 20,
    objectives: [
      "Declare a variable with var or := and say what type it holds",
      "Recognise Go's zero value — what an int, string, float64 and bool hold before you assign anything",
      "Print several values on one line and see where the spaces come from",
    ],
    prereqIds: ["go-first-program"],
    competencyIds: ["go-values"],
    whyItMatters:
      "Every value in Go has a type, and that type never changes while the program runs. Numbers, text and truth values are different kinds of thing, and the compiler keeps them apart instead of guessing — which is why you can trust the same program to mean the same thing everywhere it runs.",
    lesson: [
      {
        kind: "prose",
        body: "A variable is a name for a value, and in Go the value's type comes with the name. `count` holds an `int`, `label` holds a `string`, `progress` holds a `float64`, `ready` holds a `bool`. Writing `var count int` states the type out loud; writing `count := 3` lets Go infer it from the value on the right. Same variable, two spellings.\n\nA variable you declare and never assign is not empty. Every type has a **zero value**: `0` for numbers, the empty string for text, `false` for truth values. That is why a Go program stays predictable before you set anything.\n\n`fmt.Println` takes any number of values, puts a single space between each of them, and ends the line. The spaces in the output come from `Println` — you never type them.",
      },
      {
        kind: "example",
        body: "One int named two ways, and a single line that prints four different types:",
        code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar count int = 3  // the type, said out loud\n\tlabel := "review"  // the type, inferred from the value\n\n\tfmt.Println(label, count, "values", 62.5, true)\n}',
      },
      {
        kind: "task",
        body: "Two small edits stand between this program and its target. `count` still holds its placeholder `0`, so give it the value `3`. Then rewrite the print so the run reads exactly `review 3 values progress 62.5 ready true` on one line: the variable `label`, the variable `count`, the word values, the word progress, the variable `progress`, the word ready, and the variable `ready`, in that order, with `Println` supplying the spaces. Run it and compare your output with the target character for character.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tlabel := "review"  // string\n\tcount := 0         // int — placeholder; the task sets the real value\n\tprogress := 62.5   // float64\n\tready := true      // bool\n\n\t// TODO: this line prints all four values, but not in the shape the\n\t// task asks for. Run it, read it, then rewrite it.\n\tfmt.Println(label, progress, ready, count)\n}\n',
    checks: [
      {
        id: "run-summary-line",
        label: "A real run printed the summary line",
        feedback:
          "No run on record printed “review 3 values progress 62.5 ready true”. Run the program again and compare your output with that line one character at a time — an operand left out, a value typed by hand instead of read from a variable, or count still holding 0 all show up there.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode" },
            { target: "stdout", equals: "review 3 values progress 62.5 ready true" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "h1",
        prompt:
          "You write `var count int`, never assign it, then print it. What does the run show?",
        options: ["0", "an error — Go refuses to compile", "nothing at all", "nil"],
        answer: 0,
        explanation:
          "Every type has a zero value, and for int it is 0. A declared variable is always usable, which is what makes a Go program predictable before you assign anything.",
      },
      {
        id: "h2",
        prompt:
          "Later in the same function you write `label = 3`, while `label` holds a string. What happens when you run it?",
        options: [
          "It prints 3",
          "It fails to compile — label is a string, and its type never changes",
          "label becomes an int, and printing it shows 3",
          "It prints review, ignoring the 3",
        ],
        answer: 1,
        explanation:
          "Go is statically typed: a variable's type is fixed where it is declared. The compiler stops you rather than letting the meaning of label drift halfway through the program.",
      },
    ],
    hintLadder: [
      "Run the program as it stands and read its output. All four values are already there — in an order the target does not use.",
      "In `fmt.Println` each operand is separated by one space, so you never type the spaces that appear between them.",
      "The target needs seven operands in order: the variable label, the variable count, the word values, the word progress, the variable progress, the word ready, the variable ready.",
      "count still holds its placeholder 0. The value belongs in the variable, so change the line that declares it rather than printing 3 by hand.",
      'Solution shape: `fmt.Println(label, count, "values", "progress", progress, "ready", ready)`. Transfer: add one more value of your own — a string or a bool — and watch the spacing hold.',
    ],
    misconceptions: [
      "Typing the spaces yourself — Println puts one between every operand, so hand-typed spaces arrive doubled.",
      "Editing the value inside the print statement instead of in the variable that holds it.",
      "Expecting a declared-but-unassigned variable to be empty or an error; it holds its type's zero value.",
    ],
    completionNote:
      "One run, four typed values, and output that matched the target to the character.",
    masteryNote: "Values, types and Println's spacing handled without leaning on the ladder.",
    fileName: "main.go",
    language: "go",
  },
];
