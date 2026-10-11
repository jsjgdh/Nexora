import type { Mission } from "./types.js";

/* Go language layer: attach behavior to a named data type. */
export const MISSIONS_P: Mission[] = [
  {
    id: "go-methods",
    stageId: "go-practice",
    title: "Give a value its own behavior",
    tagline: "Use a receiver to make behavior belong to a type.",
    type: "practice",
    difficulty: 2,
    estMinutes: 22,
    objectives: [
      "Read a Go method declaration and identify its receiver",
      "Call a method with dot notation on a value of its receiver type",
      "Choose a method when behavior naturally belongs to a data type",
    ],
    prereqIds: ["go-structs"],
    competencyIds: ["go-methods"],
    whyItMatters:
      "When a value has a natural action or description, a method keeps that behavior beside the type it works on. Call sites read as `card.summary()` instead of passing the same value through a generic helper each time.",
    lesson: [
      {
        kind: "prose",
        body:
          "A **method** is a function with a receiver. In `func (card ScoreCard) summary() string`, `(card ScoreCard)` is the receiver: inside the method, `card` is the value the method works with. The method is declared on the named type `ScoreCard`, and the call `card.summary()` supplies that receiver for you.",
      },
      {
        kind: "example",
        body:
          "This method reads fields from its receiver and returns a description. It does not need a separate `card` argument at the call site:",
        code:
          'package main\n\nimport "fmt"\n\ntype ScoreCard struct {\n\tname string\n\tpoints int\n}\n\nfunc (card ScoreCard) summary() string {\n\treturn fmt.Sprintf("%s: %d points", card.name, card.points)\n}\n\nfunc main() {\n\tcard := ScoreCard{name: "Mina", points: 12}\n\tfmt.Println(card.summary())\n}',
      },
      {
        kind: "prose",
        body:
          "The receiver is part of the method declaration, before the method name. This example uses a **value receiver**, so the method reads the `ScoreCard` it receives; it does not change the caller's value. Go also has pointer receivers for methods that need to mutate a value, but today the job is only to read and describe one.",
      },
      {
        kind: "task",
        body:
          "Complete the `summary` method on `ScoreCard`. Use its receiver's `name` and `points` fields to return `Mina: 12 points` and `Ivo: 7 points`. The calls are already written as `card.summary()`; do not add a standalone helper or duplicate either answer in `main`. If no runner is available, the questions below still complete the lesson.",
      },
    ],
    starterCode: `package main

import "fmt"

type ScoreCard struct {
	name   string
	points int
}

func (card ScoreCard) summary() string {
	// TODO: use the receiver's fields to build "Name: N points"
	return ""
}

func main() {
	cards := []ScoreCard{
		{name: "Mina", points: 12},
		{name: "Ivo", points: 7},
	}
	for _, card := range cards {
		fmt.Println(card.summary())
	}
}
`,
    checks: [
      {
        id: "run-card-summaries",
        label: "Each card describes its own fields",
        feedback:
          "The run did not print both summaries. Build each result from the receiver's `name` and `points` fields, then let the existing `card.summary()` calls use the method.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode", code: 0 },
            { target: "stdout", equals: "Mina: 12 points\nIvo: 7 points\n" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "p-method-receiver",
        prompt: "In `func (card ScoreCard) summary() string`, what is `(card ScoreCard)`?",
        options: [
          "The method's receiver: a ScoreCard value named card inside the method",
          "A second return value that must be assigned in main",
          "A pointer that always changes the caller's card",
          "A struct field declaration",
        ],
        answer: 0,
        explanation:
          "The receiver introduces the value the method operates on. Here `card` has type `ScoreCard`, and the method can read its fields by that name.",
      },
      {
        id: "p-method-call",
        prompt: "Given `card := ScoreCard{...}`, how do you call its `summary` method?",
        options: ["`ScoreCard.summary(card)`", "`summary.card()`", "`card.summary()`", "`card[summary]`"],
        answer: 2,
        explanation:
          "Go method calls use dot notation on a value of the receiver type. The receiver is supplied by `card` in `card.summary()`.",
      },
      {
        id: "p-method-belongs",
        prompt: "Where is `summary` declared in `func (card ScoreCard) summary() string`?",
        options: [
          "On the named type ScoreCard, through its receiver",
          "On every struct in the program",
          "Only inside main, because main calls it",
          "On the string type returned by the method",
        ],
        answer: 0,
        explanation:
          "The receiver makes `summary` a method of `ScoreCard`. That is why a ScoreCard value can call it with dot notation.",
      },
      {
        id: "p-method-value-receiver",
        prompt: "This `summary` method has a value receiver and only reads fields. What does `card.summary()` do to the caller's card?",
        options: [
          "It leaves the caller's card unchanged",
          "It clears the points field after formatting",
          "It converts the card into a string permanently",
          "It changes every ScoreCard with the same name",
        ],
        answer: 0,
        explanation:
          "This value receiver is used to read and describe its copy of the value. Returning a string does not mutate the caller's ScoreCard.",
      },
    ],
    hintLadder: [
      "Run the starter: it prints two blank lines because the method currently returns an empty string.",
      "Inside `summary`, the receiver is named `card`. Which fields hold the name and number of points?",
      "Use `fmt.Sprintf` to combine the receiver fields into one string; the format needs a string and an integer.",
      "A format like `\"%s: %d points\"` matches `card.name` and `card.points` in that order.",
      "Solution shape: return `fmt.Sprintf(\"%s: %d points\", card.name, card.points)`. Transfer: add a method that reports whether a ScoreCard has reached a chosen points threshold.",
    ],
    misconceptions: [
      "The receiver is a special argument written at the call site — its declaration is on the method; `card.summary()` supplies the receiver through the value before the dot.",
      "A method is a function available to every type — the receiver ties this method to ScoreCard values.",
      "Every receiver mutates its value — this one is a value receiver and only reads fields; changing a caller's value requires a different design.",
      "The summary should be duplicated at each call — one method lets each ScoreCard describe its own fields consistently.",
    ],
    completionNote:
      "You attached a description to the type it describes and called it through the receiver value.",
    masteryNote:
      "Independent: declare a small method, identify its receiver, and explain whether its receiver choice can change the caller's value.",
    fileName: "main.go",
    language: "go",
  },
];
