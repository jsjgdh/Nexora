import type { Mission } from "./types";

/* Go language layer: import and use a package without confusing it with a module. */
export const MISSIONS_R: Mission[] = [
  {
    id: "go-packages",
    stageId: "go-practice",
    title: "Use code from a package",
    tagline: "Read the package clause, import what you need, and qualify its names.",
    type: "practice",
    difficulty: 2,
    estMinutes: 22,
    objectives: [
      "Recognize a package clause and an imported package path",
      "Use a package-qualified exported function from the standard library",
      "Distinguish a Go package from a Go module",
    ],
    prereqIds: ["go-interfaces"],
    competencyIds: ["go-packages"],
    whyItMatters:
      "Go programs are built from packages. Imports let your code reuse standard-library and project code instead of rewriting it, while the package qualifier makes it clear where an imported name comes from.",
    lesson: [
      {
        kind: "prose",
        body:
          "The line `package main` gives this source file its package name; `main` is the special package name for an executable program. An **import path** such as `strings` makes another package available. Write `strings.TrimSpace(value)` to call its exported `TrimSpace` function. The capital letter is significant: names beginning with an uppercase letter are exported for other packages to use.",
      },
      {
        kind: "example",
        body:
          "Here `fmt` and `strings` are separate standard-library packages. The qualifier names the package that provides each function:",
        code:
          'package main\n\nimport (\n\t"fmt"\n\t"strings"\n)\n\nfunc main() {\n\tname := strings.TrimSpace("  Mina  ")\n\tfmt.Println(name)\n}',
      },
      {
        kind: "prose",
        body:
          "A **package** is a group of Go source files built together under one package clause. A **module** is a larger unit with a `go.mod` file: it records a module path and dependency versions, and it can contain multiple packages. Today’s one-file workspace uses the standard-library package `strings`; it does not create or import a second local package.",
      },
      {
        kind: "task",
        body:
          "`cleanName` currently removes only one leading space with `strings.TrimPrefix`. Replace that with `strings.TrimSpace` so both names lose surrounding whitespace. The program should print `Mina` and `Ivo`, one per line. Keep the package qualifier: this function comes from the imported `strings` package. If no runner is available, the questions below still complete the lesson.",
      },
    ],
    starterCode: `package main

import (
	"fmt"
	"strings"
)

func cleanName(value string) string {
	// TODO: remove all surrounding whitespace with the strings package
	return strings.TrimPrefix(value, " ")
}

func main() {
	for _, name := range []string{"  Mina  ", "Ivo  "} {
		fmt.Println(cleanName(name))
	}
}
`,
    checks: [
      {
        id: "run-imported-package",
        label: "Both names are trimmed using strings",
        feedback:
          "Only the first leading space was removed. Use the imported package's `strings.TrimSpace` function so leading and trailing whitespace are both removed.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode", code: 0 },
            { target: "stdout", equals: "Mina\nIvo\n" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "r-package-clause",
        prompt: "What does `package main` identify in this source file?",
        options: [
          "The package this source file belongs to; main is the executable package name",
          "The external module version downloaded by Go",
          "The file name Go must use when compiling",
          "The package that provides every imported function",
        ],
        answer: 0,
        explanation:
          "A package clause names the package of the source file. `main` is special because it identifies a program intended to run as an executable.",
      },
      {
        id: "r-import-qualifier",
        prompt: "In `strings.TrimSpace(value)`, what does `strings` do?",
        options: [
          "It is the package qualifier showing where TrimSpace comes from",
          "It is a variable that stores the value after trimming",
          "It is the module name declared by package main",
          "It converts the argument to a string before the call",
        ],
        answer: 0,
        explanation:
          "The import makes the package available under its package name. The qualifier before the dot identifies the package that provides the exported function.",
      },
      {
        id: "r-package-export",
        prompt: "Why can this program call `strings.TrimSpace` from another package?",
        options: [
          "TrimSpace begins with an uppercase letter, so it is exported",
          "Every function in every package is exported automatically",
          "The function is in package main because it is called from main",
          "Go exports names based only on their file extension",
        ],
        answer: 0,
        explanation:
          "Go uses capitalization for visibility across package boundaries: an identifier beginning with an uppercase letter is exported.",
      },
      {
        id: "r-package-module",
        prompt: "Which statement best distinguishes a Go package from a module?",
        options: [
          "A package groups Go source files; a module records a module path and dependencies and can contain packages",
          "A module is one Go source file; a package contains version history only",
          "Packages and modules are two names for the same directory-level concept",
          "A module is only the name of the executable built from package main",
        ],
        answer: 0,
        explanation:
          "A package is the unit of source code grouped and compiled together. A module is the dependency and versioning unit described by go.mod, and may contain several packages.",
      },
    ],
    hintLadder: [
      "Run the starter and inspect the output: it removes one leading space, but leaves the rest of the whitespace behind.",
      "The imported package is already named `strings`. Which standard-library function removes whitespace at both ends?",
      "Keep the package qualifier and replace the helper called inside `cleanName`.",
      "The expression should call `strings.TrimSpace` with the original `value`.",
      "Solution shape: `return strings.TrimSpace(value)`. Transfer: look up one other standard-library package and explain which exported function would remove a prefix instead.",
    ],
    misconceptions: [
      "package main means this file is the module — it is the source file's package name; a module is described separately by go.mod.",
      "An import path is called without its package name — use the qualifier, such as `strings.TrimSpace`, to show where the exported function comes from.",
      "Every imported identifier is visible — only exported names (uppercase initial) can be used from another package.",
      "TrimPrefix removes every space around a value — it removes one specified prefix; TrimSpace handles surrounding whitespace on both ends.",
    ],
    completionNote:
      "You reused an exported standard-library function through its package qualifier and separated package naming from module dependency management.",
    masteryNote:
      "Independent: explain a package clause and import, use an exported package-qualified name, and distinguish that package from its containing module.",
    fileName: "main.go",
    language: "go",
  },
];
