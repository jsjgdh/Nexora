import type { Mission } from "./types.js";

/* Go language layer: model one concept with related fields. Methods and
   interfaces build on this data shape in later authored lessons. */
export const MISSIONS_O: Mission[] = [
  {
    id: "go-structs",
    stageId: "go-practice",
    title: "Keep related data together",
    tagline: "Give a small record one name, then read its fields on purpose.",
    type: "practice",
    difficulty: 2,
    estMinutes: 22,
    objectives: [
      "Define a Go struct type with named fields",
      "Create independent values with keyed struct literals",
      "Read fields with the dot selector and use them in a function",
    ],
    prereqIds: ["go-errors"],
    competencyIds: ["go-structs"],
    whyItMatters:
      "A real concept rarely arrives as one number or one string. A task has a title and a state; an account has a name and an email. A struct gives related values one shape, so a function can accept the concept instead of a loose list of arguments.",
    lesson: [
      {
        kind: "prose",
        body:
          "A **struct type** names a shape of data. `type Task struct { title string; done bool }` says every `Task` value has a text field named `title` and a true-or-false field named `done`. The type describes the fields; it is not itself one particular task.",
      },
      {
        kind: "example",
        body:
          "A keyed literal makes the connection between each field and its value visible. These are two separate values with the same shape:",
        code:
          'package main\n\nimport "fmt"\n\ntype Task struct {\n\ttitle string\n\tdone bool\n}\n\nfunc main() {\n\topen := Task{title: "Write the brief", done: false}\n\tfinished := Task{title: "Write the brief", done: true}\n\tfmt.Println(open.title)\n\tfmt.Println(finished.done)\n}',
      },
      {
        kind: "prose",
        body:
          "The **dot selector** reads a field from one value: `open.title` is the title stored in `open`; `finished.done` is the boolean stored in `finished`. The type name `Task` is the shape, so `Task.title` is not a value to read. A struct is passed to a function like other Go values, which lets the function work with the concept as one argument.",
      },
      {
        kind: "task",
        body:
          "`Task` and both values are already defined. Finish `taskLabel(task Task)` so it reads the task's `title`, and puts `✓ ` in front only when `done` is true. Run the program: an open task prints `Write the brief`; a finished one prints `✓ Write the brief`. Keep the values as data and let the function derive each line from the fields. If no runner is available, the questions below still complete the lesson.",
      },
    ],
    starterCode: `package main

import "fmt"

type Task struct {
	title string
	done  bool
}

func taskLabel(task Task) string {
	// TODO: build the label from task.title and task.done
	return ""
}

func main() {
	open := Task{title: "Write the brief", done: false}
	finished := Task{title: "Write the brief", done: true}
	fmt.Println(taskLabel(open))
	fmt.Println(taskLabel(finished))
}
`,
    checks: [
      {
        id: "run-task-labels",
        label: "Both task values produce labels from their fields",
        feedback:
          "The run did not print both expected labels. Use the `task` parameter: return its title for an open task, and prefix that same title with `✓ ` when its `done` field is true.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode", code: 0 },
            { target: "stdout", equals: "Write the brief\n✓ Write the brief\n" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "o-struct-shape",
        prompt: "What does `type Task struct { title string; done bool }` define?",
        options: [
          "One particular task, already marked done",
          "A named shape whose values have a string title and a boolean done field",
          "A function that prints both fields",
          "A pair of unrelated values that can only be used together in main",
        ],
        answer: 1,
        explanation:
          "The struct declaration defines the fields every Task value can hold. A literal such as `Task{title: \"Write the brief\", done: false}` creates one particular value of that shape.",
      },
      {
        id: "o-struct-selector",
        prompt: "Inside `taskLabel(task Task)`, which expression reads the task's title?",
        options: ["Task.title", "title.Task", "task.title", "task[\"title\"]"],
        answer: 2,
        explanation:
          "The variable `task` is a value, and the dot selector reads one of that value's fields. `Task` is only the type name; a struct is not indexed like a map.",
      },
      {
        id: "o-struct-value",
        prompt: "If `open` and `finished` are created with separate `Task{...}` literals, what happens when `finished.done` is true?",
        options: [
          "`open.done` also becomes true because both values have type Task",
          "Only the `done` field stored in `finished` is true",
          "The `Task` type changes from false to true",
          "Go rejects two values of the same struct type",
        ],
        answer: 1,
        explanation:
          "The type is shared; the values are not. Each literal creates a separate Task with its own field values.",
      },
      {
        id: "o-struct-keyed",
        prompt: "Why use `Task{title: \"Write the brief\", done: false}` instead of an unkeyed literal?",
        options: [
          "The field names show which value fills each part of the record",
          "Keyed literals are the only way to make a struct value",
          "The field names make Go infer a different type for each value",
          "Unkeyed literals are only valid for maps",
        ],
        answer: 0,
        explanation:
          "A keyed literal makes intent visible and stays readable if the struct gains another field. Go also permits positional literals, but they hide which value belongs to which field.",
      },
    ],
    hintLadder: [
      "Run the starter first. It prints two blank lines: the fields exist, but `taskLabel` does not read them yet.",
      "The function already receives one Task value named `task`. Which expression selects that value's title field?",
      "Build one result from `task.title`, then use `task.done` to decide whether the result needs a `✓ ` prefix.",
      "An `if task.done` branch can return `\"✓ \" + task.title`; the other path should return the title without the mark.",
      "Solution shape: return `task.title` when it is open, otherwise return `\"✓ \" + task.title`. Transfer: add a priority field and make a second function that reports it without changing either Task value.",
    ],
    misconceptions: [
      "The struct type is one record — the type describes a shape; each literal creates a separate record with its own field values.",
      "A field is selected from the type name — field access needs a value such as `task.title`, not `Task.title`.",
      "Two fields should stay as separate function arguments — passing Task groups the values that describe one concept and keeps the call site meaningful.",
      "A keyed literal's values are positional — `title:` and `done:` explicitly name the field each value belongs to.",
    ],
    completionNote:
      "You used one named value to carry a title and a state, then derived output from the fields instead of duplicating the answer.",
    masteryNote:
      "Independent: define a small record, create two distinct values, and explain which function behavior comes from which field.",
    fileName: "main.go",
    language: "go",
  },
];
