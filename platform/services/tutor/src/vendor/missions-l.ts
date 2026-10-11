import type { Mission } from "./types.js";

/* Algorithms layer, first data structure. Assessed by a real run of the
   learner's Go program (a `runs` check against the runner's signed record),
   plus prediction questions so it stays completable where no runner is
   reachable. */

export const MISSIONS_L: Mission[] = [
  {
    id: "go-slices",
    stageId: "go-dsa",
    title: "Slices: a growing list of values",
    tagline: "A list you grow — append, range, and a length that changes.",
    type: "practice",
    difficulty: 2,
    estMinutes: 25,
    objectives: [
      "Build a slice from nothing with append, keeping its return value",
      "Iterate a slice with range and keep only what a condition allows",
      "Read what a slice prints as, and what len reports",
    ],
    prereqIds: ["go-errors"],
    competencyIds: ["go-collections"],
    whyItMatters:
      "Nearly every real program keeps a growing list of things: results, rows, files, names. In Go that list is a slice, and `append` is the operation you will write more than any other — so it is worth knowing exactly what it hands back.",
    lesson: [
      {
        kind: "prose",
        body: "A slice is a window onto data: it knows where it starts and how many values it can see. You write one with a literal — `[]int{42, 91, 7}` — and the backing array underneath stays out of the way until it fills up.\n\nTwo things matter today. First, **iterate** with `for _, s := range scores`, which hands you each value in order. Second, **grow** with `append(passing, s)` — but read that line carefully: `append` does not add to `passing`, it returns a slice that includes the addition. If you throw the return value away, your careful addition vanishes with it. When the backing array runs out of room, `append` moves the data somewhere bigger and hands you that new slice — which is exactly why what it returns is the thing you keep.\n\n`len(slice)` is how many values it currently holds. And when you print a slice, Go shows it in brackets with spaces between the values — no commas, however much your eye expects them. The check compares characters, so read what the program actually printed.",
      },
      {
        kind: "example",
        body: "The same motion with a different question — accumulate a result, then print it next to a count:",
        code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tnums := []int{3, 8, 2}\n\ttotal := 0\n\tfor _, n := range nums {\n\t\ttotal = total + n\n\t}\n\tfmt.Println(total, len(nums))\n}',
      },
      {
        kind: "task",
        body: "Collect the scores that are 60 or more — in the order they appear — into a new slice using `append`, then print that slice and how many scores it holds, on one line. Run the program yourself first and read what it printed: the check runs this file and compares your run's output character for character, so a right idea with the wrong line on screen still fails honestly. Where there is no runner around, the prediction questions below are what completes the mission.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tscores := []int{42, 91, 7, 65, 88, 30}\n\n\t// TODO: keep only the scores that are 60 or more, in order, using append.\n\t// Then print that slice and how many scores it holds, on one line.\n\tfmt.Println(scores, len(scores))\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run printed the passing scores with their count",
        feedback:
          "No run on record printed the filtered scores and their count on one line. Check that each passing score was appended — append returns the slice, so the value you keep is what you pass forward — and that the line holds both the slice and its length.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [{ target: "exitCode" }, { target: "stdout", equals: "[91 65 88] 3" }],
        },
      },
    ],
    questions: [
      {
        id: "l1",
        prompt:
          "`var passing []int` starts empty, then the loop appends three scores that pass the condition. You print `fmt.Println(len(passing))`. What appears?",
        options: ["0", "3", "6", "A compile error"],
        answer: 1,
        explanation:
          "The empty declaration gives a slice of length 0, and each successful `append` hands back a slice one longer. Length grows with what you keep, not with how many scores existed.",
      },
      {
        id: "l2",
        prompt:
          "You write `for i, s := range scores` but the slice's position is never interesting to you — only the value. What is the honest fix?",
        options: [
          "Leave `i` alone; Go ignores unused loop variables",
          "Write `for _, s := range scores`",
          "Declare `i` before the loop instead",
          "Drop the value and index both",
        ],
        answer: 1,
        explanation:
          "A range variable you declare is a variable you must use — an unused one is a compile error, not a warning. `_` says plainly that the position is not part of the question.",
      },
    ],
    hintLadder: [
      "Run the starter first: it prints every score and the full count. That unfiltered list is the thing to change, not the thing to fix.",
      "You need somewhere to collect: `var passing []int` before the loop, then add the ones that pass inside it.",
      "`append` returns a new slice. `append(passing, s)` on its own throws it away — write `passing = append(passing, s)`.",
      "Compare with `if s >= 60` inside `for _, s := range scores`. Then print the slice and its length together: `fmt.Println(passing, len(passing))`.",
      "Solution shape: an empty `[]int`, one `range` loop, `append` when the score is 60 or more, then print the slice and `len` of it on one line. Transfer: print the scores above 90 next — same motion, new threshold.",
    ],
    misconceptions: [
      "Printing inside the loop — that gives one line per value, when the task asks for one line holding the whole result.",
      "Ignoring what `append` returns, so the collected values disappear before the program prints.",
      "Expecting commas in a printed slice: Go writes `[91 65 88]`, and the check compares exactly that.",
    ],
    completionNote: "Filtered a slice with append and printed it with its length.",
    masteryNote: "Built a slice from a condition unaided, keeping append's return value and reading the run's real output.",
    fileName: "main.go",
    language: "go",
  },
];
