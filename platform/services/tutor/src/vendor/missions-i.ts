import type { Mission } from "./types.js";

/* Language layer, control flow. The starter is the honest starting point for
   someone who has not met a loop yet: five hand-written lines that work, and
   that anyone can see are ridiculous. The run is the assessment — a loop and a
   branch have to produce exactly the five lines the task names. */

export const MISSIONS_I: Mission[] = [
  {
    id: "go-control-flow",
    stageId: "go-basics",
    title: "Making decisions and repeating work",
    tagline: "Branch on what is true, then let one loop replace five lines.",
    type: "practice",
    difficulty: 2,
    estMinutes: 25,
    objectives: [
      "Read a condition and predict which branch runs",
      "Write if / else if / else over real comparisons",
      "Replace repeated statements with Go's one loop, for",
      "Spot a loop whose condition can never become false",
    ],
    prereqIds: ["go-values"],
    competencyIds: ["go-control-flow"],
    whyItMatters:
      "A program that only runs top to bottom can do exactly one thing. Branches and loops are what let it react to values and repeat work without you repeating yourself — and every stage after this one assumes you can trace both by hand.",
    lesson: [
      {
        kind: "prose",
        body: "An `if` chooses between two paths. Go writes the condition without parentheses, and the braces are required:\n\n```go\nif score >= 60 {\n\tfmt.Println(\"passed\")\n} else {\n\tfmt.Println(\"not yet\")\n}\n```\n\nThe condition has to be a `bool`. Go will not accept `if score` — a number is not a truth. When you chain `else if`, the first true branch runs and the rest are never evaluated at all.",
      },
      {
        kind: "prose",
        body: "Go has one loop keyword, `for`, wearing three shapes: a counting form that names a start, a condition and a step; a condition-only form that keeps going while something stays true; and a bare `for` that never stops on its own.\n\n```go\nfor i := 1; i <= 3; i++ { ... }   // counting\nfor total < 100 { ... }            // while-style\nfor { ... }                        // forever, until a break\n```\n\nIn all three the condition is checked **before** every pass, including the first. That is why a body that never moves the value the condition watches will hang: the program is still doing exactly what you told it to.",
      },
      {
        kind: "example",
        body: "A branch inside a counting loop, with the output readable one line at a time:",
        code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfor i := 1; i <= 3; i++ {\n\t\tif i%2 == 0 {\n\t\t\tfmt.Println(i, "even")\n\t\t} else {\n\t\t\tfmt.Println(i, "odd")\n\t\t}\n\t}\n}',
        codeCaption: "Prints: 1 odd / 2 even / 3 odd",
      },
      {
        kind: "task",
        body: "The starter prints the numbers 1 to 5 by writing five separate lines — correct, and exactly the kind of repetition a loop exists to remove. Rewrite it with a single `for` loop, and inside that loop print each number followed by the word `odd` or `even`, so a run prints five lines beginning `1 odd`. The check compares your run's real output, so run it and read what it printed before you believe it.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(1)\n\tfmt.Println(2)\n\tfmt.Println(3)\n\tfmt.Println(4)\n\tfmt.Println(5)\n}\n',
    checks: [
      {
        id: "run-parity",
        label: "A real run printed each number with its parity",
        feedback:
          "No run on record printed the five lines with their words: the number and its word have to share a line, and the numbers have to run 1 to 5. Run the program and compare what it actually said.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode" },
            { target: "stdout", equals: "1 odd\n2 even\n3 odd\n4 even\n5 odd" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "i1",
        prompt: "The loop `for i := 1; i <= 5; i++` has just run its body with i equal to 5. What happens next?",
        options: [
          "The body runs again with i equal to 6",
          "i becomes 6, the condition is false, and the loop stops",
          "The loop stops immediately, before i changes",
          "Nothing — the body runs a sixth time with i equal to 5",
        ],
        answer: 1,
        explanation:
          "The step runs first, then the condition is tested again with the new value: 6 <= 5 is false, so the loop ends. The body never sees 6. Every off-by-one loop bug lives at this exact boundary.",
      },
      {
        id: "i2",
        prompt: "A loop reads `for total < 100 {`. What single change makes it run forever?",
        options: [
          "Remove the statement inside the body that increases total",
          "Change 100 to 1000",
          "Move the condition into an if statement",
          "Rename total to sum",
        ],
        answer: 0,
        explanation:
          "The condition is re-checked before every pass. If nothing in the body ever moves total toward 100, the condition stays true — the program is not broken, it is following your instructions.",
      },
      {
        id: "i3",
        prompt: "How many branches of a Go `switch` run when three cases match?",
        options: [
          "Exactly one — the first case that matches",
          "All three, in the order they are written",
          "Every case until a `break` appears",
          "None, unless each case ends with `break`",
        ],
        answer: 0,
        explanation:
          "Go stops at the first matching case; there is no automatic fallthrough and `break` is unnecessary. Languages in the C family keep going without a `break`, which is where that habit comes from.",
      },
    ],
    hintLadder: [
      "Run the starter as it stands and count the lines. Nothing in it is wrong — it is simply a lot of typing.",
      "One loop replaces all five lines: `for i := 1; i <= 5; i++ { ... }` runs its body once per number.",
      "The decision belongs inside the loop, not before it: compare `i % 2` with 0 and print one of two different lines.",
      "`i%2 == 0` is true when the number is even. If your first line reads `1 even`, your two branches are swapped.",
      "Solution shape: a `for` from 1 to 5 inclusive, and inside it an `if i%2 == 0` printing `i, \"even\"` with an `else` printing `i, \"odd\"`. Transfer: print the multiples of 3 as `three` as well.",
    ],
    misconceptions: [
      "Putting `else` on a line of its own — Go ends the statement at the newline, so `else` must start on the same line as the closing brace.",
      "Believing the condition is checked after the body. It is checked before every pass, which is also why a loop can run zero times.",
      "Expecting `i%2` to work as a condition: it is a number, not a `bool`. Write the comparison out (`i%2 == 0`) and let the type checker catch it.",
    ],
    completionNote: "A branch and a loop, traced by hand and then confirmed by a real run.",
    masteryNote: "Chose the loop bounds and the branch condition without help on the first pass.",
    fileName: "main.go",
    language: "go",
  },
];
