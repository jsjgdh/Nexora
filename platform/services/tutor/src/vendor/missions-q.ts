import type { Mission } from "./types.js";

/* Go language layer: consume behavior through an implicitly satisfied interface. */
export const MISSIONS_Q: Mission[] = [
  {
    id: "go-interfaces",
    stageId: "go-practice",
    title: "Ask for behavior, not a concrete type",
    tagline: "Let different values answer the same method call.",
    type: "practice",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Read an interface as a set of required method signatures",
      "Explain how a type satisfies a Go interface implicitly",
      "Write a function that accepts behavior shared by different concrete values",
    ],
    prereqIds: ["go-methods"],
    competencyIds: ["go-interfaces"],
    whyItMatters:
      "A function that needs one behavior should not have to know every concrete type that can provide it. Interfaces make that boundary small: callers can pass different values as long as they have the required methods.",
    lesson: [
      {
        kind: "prose",
        body:
          "A Go **interface** describes behavior through method signatures. `type Labeler interface { label() string }` says a value can be used as a `Labeler` when its type has a `label() string` method. Go checks that match implicitly: the type does not need an `implements` declaration.",
      },
      {
        kind: "example",
        body:
          "Both a task and a notice can provide the same method, even though their data is different. One consumer can accept either:",
        code:
          'package main\n\nimport "fmt"\n\ntype Labeler interface {\n\tlabel() string\n}\n\ntype Task struct { title string }\nfunc (task Task) label() string { return task.title }\n\ntype Notice struct { message string }\nfunc (notice Notice) label() string { return notice.message }\n\nfunc printLabel(item Labeler) {\n\tfmt.Println(item.label())\n}\n\nfunc main() {\n\tprintLabel(Task{title: "Write the brief"})\n\tprintLabel(Notice{message: "Build passed"})\n}',
      },
      {
        kind: "prose",
        body:
          "The parameter type `Labeler` is the contract the function relies on; `Task` and `Notice` remain the concrete values that carry their own data. At the call, Go uses the concrete value's matching method. This is not inheritance: each type independently has the required method, and extra methods are fine.",
      },
      {
        kind: "task",
        body:
          "The interface and `Task.label()` are already written. Complete `Notice.label()` and `printLabel(item Labeler)`. The existing calls pass one Task and one Notice; print `✓ Write the brief` and `Build passed`, in that order. Do not use a type switch or add an implements declaration: make both values fit the one-method contract. If no runner is available, the questions below still complete the lesson.",
      },
    ],
    starterCode: `package main

import "fmt"

type Labeler interface {
	label() string
}

type Task struct {
	title string
	done  bool
}

func (task Task) label() string {
	if task.done {
		return "✓ " + task.title
	}
	return task.title
}

type Notice struct {
	message string
}

func (notice Notice) label() string {
	// TODO: return the notice's message
	return ""
}

func printLabel(item Labeler) {
	// TODO: print the label supplied by the interface
	fmt.Println("")
}

func main() {
	printLabel(Task{title: "Write the brief", done: true})
	printLabel(Notice{message: "Build passed"})
}
`,
    checks: [
      {
        id: "run-interface-labelers",
        label: "Different concrete values work through Labeler",
        feedback:
          "The program should print both labels through `printLabel(item Labeler)`. Give Notice the required `label() string` method, then have the consumer call that method instead of depending on either concrete type.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode", code: 0 },
            { target: "stdout", equals: "✓ Write the brief\nBuild passed\n" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "q-interface-contract",
        prompt: "What does `type Labeler interface { label() string }` require?",
        options: [
          "A value's type must provide a `label() string` method to be used as Labeler",
          "Every Labeler must store a string field named label",
          "A type must embed Labeler before it can define methods",
          "The interface creates one shared label string for the program",
        ],
        answer: 0,
        explanation:
          "The interface lists behavior as a method signature. A value whose type provides that method can be used where a Labeler is expected.",
      },
      {
        id: "q-interface-implicit",
        prompt: "How does `Notice` satisfy `Labeler` in Go?",
        options: [
          "By declaring `implements Labeler` beside the type",
          "By having the required method signature; no explicit declaration is needed",
          "By embedding the Labeler interface in the struct",
          "Only because Notice was declared after Labeler",
        ],
        answer: 1,
        explanation:
          "Go interface satisfaction is implicit. The method set is what matters, not an implements clause or declaration order.",
      },
      {
        id: "q-interface-parameter",
        prompt: "Why does `printLabel(item Labeler)` accept both Task and Notice?",
        options: [
          "Both concrete types provide the method required by Labeler",
          "The two structs have the same fields",
          "Go converts every struct to an interface automatically, regardless of methods",
          "The function checks type names and chooses a separate branch",
        ],
        answer: 0,
        explanation:
          "The function depends on one behavior, `label() string`. Both concrete types provide it, so both values fit the interface contract.",
      },
      {
        id: "q-interface-dispatch",
        prompt: "When `printLabel` calls `item.label()`, which implementation supplies the result?",
        options: [
          "The method belonging to the concrete value passed at that call",
          "One method is selected permanently when Labeler is declared",
          "The compiler joins both method bodies and runs them in order",
          "The interface returns an empty string because it has no fields",
        ],
        answer: 0,
        explanation:
          "The interface value carries a concrete value and its type. The matching method for that concrete value provides the behavior.",
      },
    ],
    hintLadder: [
      "Run the starter: the Task has a label method, but Notice's label and the consumer are unfinished.",
      "The interface requires one exact method: `label() string`. What should Notice return for its label?",
      "`printLabel` only knows its parameter as Labeler. Call the method the interface promises, then print the returned string.",
      "The consumer can use `fmt.Println(item.label())`; it does not need to know whether item holds a Task or Notice.",
      "Solution shape: Notice returns `notice.message`; the consumer prints `item.label()`. Transfer: define a second interface with a method that returns a count, then pass two unrelated types that can report one.",
    ],
    misconceptions: [
      "A type must opt into an interface — Go checks the method set implicitly; there is no implements declaration.",
      "The interface stores or creates the behavior — concrete types provide the method body; the interface states the contract a consumer may rely on.",
      "An interface parameter means every concrete type is interchangeable in every way — the function may rely only on the methods listed in that interface.",
      "The consumer needs a type switch for each implementation — call the interface method and let each concrete value provide its own behavior.",
    ],
    completionNote:
      "You used one small behavior contract to let a function work with two different concrete types.",
    masteryNote:
      "Independent: define a small interface, identify which types satisfy it, and write a consumer that relies only on its listed methods.",
    fileName: "main.go",
    language: "go",
  },
];
