import type { Mission } from "./types";

/* Language layer, first program. This mission is assessed by a real run of
   the learner's Go program (a `runs` check against the runner's signed
   record), plus one prediction question so it stays completable where no
   runner is reachable. */

export const MISSIONS_G: Mission[] = [
  {
    id: "go-first-program",
    stageId: "go-basics",
    title: "Your first Go program",
    tagline: "Print something real, then prove the run said it.",
    type: "practice",
    difficulty: 1,
    estMinutes: 20,
    objectives: [
      "Structure a Go program (package main, func main)",
      "Print output with fmt.Println",
      "Run the program and read what it actually printed",
    ],
    prereqIds: ["how-programs-run"],
    competencyIds: ["go-values"],
    whyItMatters:
      "Every language layer mission from here runs your actual code. This one establishes the loop: write, run, read the output, believe the output.",
    lesson: [
      {
        kind: "prose",
        body: "A Go program starts with two promises: `package main` says “this builds into something that runs”, and `func main()` says “start here”. Output goes through `fmt.Println`, which prints its arguments plus a newline.\n\nThe check does not read your code — it runs it. Whatever your program printed is the evidence, so run it yourself first and read what it really said.",
      },
      {
        kind: "example",
        body: "The smallest program that prints:",
        code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, Go")\n}',
      },
      {
        kind: "task",
        body: "Make the program print exactly `Hello, Go` on its own line — then run it. The assessment compares your run's output character for character, so extra words, missing commas, and stray spaces all fail honestly. When there is no runner around, the prediction question below is what completes the mission.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("TODO")\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run printed Hello, Go",
        feedback:
          "No run on record printed exactly “Hello, Go”. Run the program (not just read it), then check what its output really was.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [{ target: "exitCode" }, { target: "stdout", equals: "Hello, Go\n" }],
        },
      },
    ],
    questions: [
      {
        id: "g1",
        prompt: "You change the printed text to “Hello, Go” and run again. What appears?",
        options: ["TODO", "Hello, Go", "package main", "Nothing — checks read the code"],
        answer: 1,
        explanation:
          "Checks read runs, not files. The output is whatever the program printed last — which is why running it yourself first is the whole skill.",
      },
    ],
    hintLadder: [
      "What does the program print right now? Run it and read the output before changing anything.",
      "Only the string inside Println decides the output. Everything else is scaffolding.",
      "Replace TODO with Hello, Go — exact capitals, comma, and no extra words. Then run again.",
      "If the run still shows TODO, you edited a different copy than the one that ran. Edit main.go, save, then run.",
      "Solution shape: Println with exactly “Hello, Go”. Transfer: print your name next — same motion, new string.",
    ],
    misconceptions: [
      "Editing without re-running — the evidence is the run, not the file.",
      "Almost-exact output — the comparison is character-exact; intent doesn't count.",
    ],
    completionNote: "Your first real run, with output to prove it.",
    masteryNote: "Write-run-read loop established with minimal help.",
    fileName: "main.go",
    language: "go",
  },
];
