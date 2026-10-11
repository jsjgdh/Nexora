import type { Mission } from "./types";

/* Algorithms layer, second data structure. Assessed by a real run of the
   learner's Go program (a `runs` check against the runner's signed record),
   plus prediction questions so it stays completable where no runner is
   reachable. Map iteration order is deliberately part of the lesson: the
   expected output is built from sorted keys, so the check is deterministic
   rather than a coin toss. */

export const MISSIONS_M: Mission[] = [
  {
    id: "go-maps",
    stageId: "go-dsa",
    title: "Maps: looking things up by key",
    tagline: "Ask by key, count in one line, and print in an order you chose.",
    type: "practice",
    difficulty: 2,
    estMinutes: 30,
    objectives: [
      "Count occurrences by key with a map and a one-line increment",
      "Tell a missing key from a real zero with the comma-ok form",
      "Copy the keys out and sort them, so every run prints the same thing",
    ],
    prereqIds: ["go-slices"],
    competencyIds: ["go-collections", "algo-complexity"],
    whyItMatters:
      "Counting and looking things up are the two jobs a map exists for, and both are the difference between a program that scans everything and one that asks once. Cost also becomes visible here for the first time: a map is something you buy — you pay to build it and you give up any meaningful order — so reaching for it should be a decision rather than a reflex.",
    lesson: [
      {
        kind: "prose",
        body: "Go has two everyday containers. A slice is an ordered list you walk from the front; a map is a lookup table you ask by key. `map[string]int` reads as “keys are strings, values are ints”, and an empty one you can count into is written `map[string]int{}`.\n\nReading a key that is not there is not an error: you get the zero value for the value type — 0 for an int, the empty string for a string. That is the trick that makes counting short. `counts[string(letter)]++` works the very first time a letter appears, because reading its absent count gives 0 and incrementing that gives 1.\n\nSometimes though the zero is a real answer, and you need to tell it apart from “this key was never set”. That is what the comma-ok form is for: `v, ok := counts[k]` hands you the value and a bool saying whether the key was actually there.\n\nOne trap, and today's whole point: `for k := range counts` gives you keys in an order Go does not promise, and it can differ between two runs of the very same program. Output built from a map is therefore unstable unless you impose an order — copy the keys into a slice, `sort.Strings` them, then iterate the slice. Stable output you chose beats output that happens to look right once.",
      },
      {
        kind: "example",
        body: "Counting letters, then printing them in an order we picked. The map does the counting; the slice and the sort do the ordering:",
        code: 'package main\n\nimport (\n\t"fmt"\n\t"sort"\n)\n\nfunc main() {\n\tword := "moon"\n\tcounts := map[string]int{}\n\tfor _, letter := range word {\n\t\tcounts[string(letter)]++\n\t}\n\n\tkeys := make([]string, 0, len(counts))\n\tfor k := range counts {\n\t\tkeys = append(keys, k)\n\t}\n\tsort.Strings(keys)\n\n\tfor _, k := range keys {\n\t\tfmt.Printf("%s=%d\\n", k, counts[k])\n\t}\n}',
      },
      {
        kind: "task",
        body: "Count every letter in the word `banana` with a map, then print one letter per line, in alphabetical order, in the form `a=3` — letter, equals sign, count, no spaces, no quotes, nothing else on the line. Run it yourself and check the counts against what you can find with your own eyes: the check runs this file and compares your run's output line for line. Because map order is not guaranteed, an unsorted program fails most runs and passes a few by luck, which is worse than failing. Where there is no runner around, the prediction questions below are what completes the mission.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tword := "banana"\n\n\t// TODO: count every letter in word with a map, then print one letter per\n\t// line in alphabetical order, in the form a=3.\n\tfmt.Println(word, len(word))\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run printed each letter with its count, in sorted order",
        feedback:
          "No run on record printed the counts the check expects. Three things are worth checking in order: every letter was counted with a map, the keys were copied out and sorted before printing, and each line has the exact shape `a=3` — letter, equals sign, count, with nothing else on the line.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [{ target: "exitCode" }, { target: "stdout", equals: "a=3\nb=1\nn=2" }],
        },
      },
    ],
    questions: [
      {
        id: "m1",
        prompt:
          "`counts := map[string]int{}` is empty. The next line is `counts[\"z\"]++` — a key that was never added. What happens?",
        options: [
          "A compile error: the key has to exist before it can be incremented",
          "The program panics when the key is missing",
          "`counts[\"z\"]` becomes 1, because reading a missing key gives the zero value",
          "The increment is silently dropped and the map stays empty",
        ],
        answer: 2,
        explanation:
          "A missing key reads as 0, not an error. That is exactly why the counting loop is one line long — the first sighting of a letter is handled by the same code as the fifth.",
      },
      {
        id: "m2",
        prompt:
          "The same program prints `a=3 b=1 n=2` on one run and `n=2 a=3 b=1` on the next, with no edits in between. What is the honest reason?",
        options: [
          "The map is corrupt and should be rebuilt from scratch",
          "`range` over a map gives keys in no guaranteed order, so the output has to be sorted before it is printed",
          "`Println` reorders its arguments",
          "Go randomises the counts themselves to catch hard-coded output",
        ],
        answer: 1,
        explanation:
          "The counts were never wrong — the order was never promised. Copying the keys into a slice and sorting it turns output you hope is stable into output you know is stable.",
      },
      {
        id: "m3",
        prompt:
          "A slice holds 10,000 names and you need to know whether one specific name is in it. You scan the slice from the front and the name turns out to be last. Compared with the same question asked of a map, what is the honest difference?",
        options: [
          "None — Go optimises equality checks on slices",
          "The scan does up to 10,000 comparisons; a map lookup is roughly constant work however many names it holds",
          "The map is slower, because hashing each key costs more than comparing it",
          "The slice is quicker because indexing it is constant time",
        ],
        answer: 1,
        explanation:
          "Indexing `names[i]` is constant, but finding out which index holds the name means a loop whose work grows with the list. A lookup does roughly the same amount of work whether the map holds ten names or ten thousand — that is what you pay for when you build one.",
      },
    ],
    hintLadder: [
      "Run the starter first: it prints the word and its length. Both true, and neither is the question the check asks.",
      "One map does all the counting: `counts := map[string]int{}` before the loop, then `counts[string(letter)]++` inside a `range` over the word.",
      "A map has no order to print in. Copy the keys out with `for k := range counts` and collect them into a `[]string` with `append`.",
      "`sort.Strings(keys)` puts the copied keys in alphabetical order. Then loop over the sorted keys and print the key and `counts[k]` together on each line.",
      "Solution shape: count in a map, collect the keys, sort them, then print one `letter=count` line per key. Transfer: count the letters in your own name next — same three steps, new input.",
    ],
    misconceptions: [
      "Printing the map directly with `range` and hoping: the order changes between runs, so correct counts still fail the check most of the time.",
      "Expecting an error from a missing key — it reads as the zero value, which is why counting works and why the comma-ok form exists for when zero is a real value.",
      "Reading `len(word)` as the number of distinct letters: `banana` is six characters and only three distinct ones, and the check wants the three.",
    ],
    completionNote: "Counted with a map, then printed it in an order you chose.",
    masteryNote: "Built and printed a map unaided, sorting the keys so the run is deterministic rather than lucky.",
    fileName: "main.go",
    language: "go",
  },
];
