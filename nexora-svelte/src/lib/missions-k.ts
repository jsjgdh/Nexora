import type { Mission } from "./types";

/* Language layer, Go in Practice. This is the gate the application track sits
   behind: nothing in the web layer is reachable until a failure can travel
   through a program as a value. Assessed by a real run — the program must
   reject the bad input *and* still exit cleanly — plus prediction questions so
   it stays completable where no runner is reachable. */

export const MISSIONS_K: Mission[] = [
  {
    id: "go-errors",
    stageId: "go-practice",
    title: "Errors are values",
    tagline: "Bad input is not a crash — it is a value you decide what to do with.",
    type: "practice",
    difficulty: 2,
    estMinutes: 25,
    objectives: [
      "Return a failure instead of discarding it",
      "Wrap an error with `%w` so the cause survives while the message stays readable",
      "Keep a program running after bad input, printing what actually went wrong",
    ],
    prereqIds: ["go-functions"],
    competencyIds: ["go-functions"],
    whyItMatters:
      "Every mission after this one that reads input, parses it, or calls something that can fail uses this shape. Go has no exceptions to catch: a failure is a value returned beside the result, and a program that drops it does not stop — it carries on with the wrong answer.",
    lesson: [
      {
        kind: "prose",
        body: "`strconv.Atoi` returns an integer and a possible error. For text such as `\"eighty\"`, it returns a zero result with a non-nil error; callers must check the error before trusting the number. Go has no exceptions to catch, so a failure travels beside the result as a second return value — which is why `parsePort` is declared `(int, error)` rather than `int`.",
      },
      {
        kind: "prose",
        body: "The `if err != nil` line after a call is not ceremony. It is the moment the program decides what a failure means: `return 0, err` hands that decision to the caller, and printing it and carrying on is a decision too. The one thing that is never a decision is dropping it — a discarded error leaves the program running with a zero value that looks exactly like a real port number.",
      },
      {
        kind: "example",
        body: "The call site already present in `listen` — the value on the left, the failure checked on the right:",
        code: `port, err := parsePort(text)
if err != nil {
    fmt.Println("rejected:", err)
    return
}
fmt.Println("listening on port", port)`,
      },
      {
        kind: "prose",
        body: 'Wrapping keeps the cause while adding context: `fmt.Errorf("port %q: %w", text, ErrBadPort)` prints a readable line and still lets a caller ask `errors.Is(err, ErrBadPort)` — identity, not wording. Compare whole errors, never their messages.',
      },
      {
        kind: "task",
        body: '`parsePort` drops the error `strconv.Atoi` hands it, so a bad port becomes port 0 and the run looks healthy. Make it honest: when `Atoi` fails, return `0` and an error whose message is `port "eighty": not a port number`. Running `main.go` must then print exactly two lines — `listening on port 8080`, then `rejected: port "eighty": not a port number` — and still exit 0, because the program handled the failure instead of dying. Where no runner is reachable, the questions below complete the mission.',
      },
    ],
    starterCode: `package main

import (
    "errors"
    "fmt"
    "strconv"
)

// ErrBadPort says the text was not a port number. It is a value, so a caller
// can ask about it with errors.Is instead of reading the message.
var ErrBadPort = errors.New("not a port number")

// parsePort turns text into a port number, or an error saying why not.
func parsePort(text string) (int, error) {
    n, _ := strconv.Atoi(text)
    return n, nil
}

func listen(text string) {
    port, err := parsePort(text)
    if err != nil {
        fmt.Println("rejected:", err)
        return
    }
    fmt.Println("listening on port", port)
}

func main() {
    listen("8080")
    listen("eighty")
}
`,
    checks: [
      {
        id: "run-answer",
        label: "A real run rejected the bad port and carried on",
        feedback:
          "No run on record printed both lines. Run the program (not just read it): the second call has to report the bad port instead of quietly listening on port 0.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode" },
            {
              target: "stdout",
              equals: `listening on port 8080
rejected: port "eighty": not a port number`,
            },
          ],
        },
      },
    ],
    questions: [
      {
        id: "k1",
        prompt:
          "The starter runs and prints `listening on port 0`. What did `parsePort` do with the error from `strconv.Atoi`?",
        options: [
          "Discarded it, so `listen` never saw a failure",
          "Wrapped it with `%w`",
          "Returned it, but `listen` ignored it",
          "Atoi does not return an error for text",
        ],
        answer: 0,
        explanation:
          "`Atoi` returned 0 and a non-nil error. `n, _ :=` threw the error away, so `parsePort` reported success with the number zero — the exact failure this mission fixes.",
      },
      {
        id: "k2",
        prompt:
          "Why does `parsePort` return `(int, error)` instead of panicking when the text is not a number?",
        options: [
          "Panicking is not allowed inside a function that returns a value",
          "So the caller decides what bad input means; a panic would end the program before it could",
          "Because Atoi cannot return an int on failure",
          "Because two return values are faster than one",
        ],
        answer: 1,
        explanation:
          "The failure is data, not an event that unwinds the program. `listen` decides to report it and carry on; another caller could retry, substitute a default, or pass it further up — all without the program dying.",
      },
      {
        id: "k3",
        prompt:
          "A later caller wants to know whether a failure was a bad port, without reading the message. What should it use?",
        options: [
          'err.Error() == "not a port number"',
          "errors.Is(err, ErrBadPort)",
          "err == ErrBadPort",
          "len(err.Error()) > 0",
        ],
        answer: 1,
        explanation:
          "The error was wrapped with `%w`, so `errors.Is` walks the chain and finds `ErrBadPort`. Comparing messages breaks the moment the wording changes, and comparing `err == ErrBadPort` breaks as soon as the error is wrapped.",
      },
    ],
    hintLadder: [
      "Run it first. Which line tells you the second call failed, and which line tells you the program thinks it succeeded?",
      "Look at the two names on the left of `n, _ := strconv.Atoi(text)`. One of them is being thrown away.",
      "Keep the error and return it: `if err != nil { return 0, ... }` so `listen` can see the failure at all.",
      'For the exact message, wrap the sentinel: `fmt.Errorf("port %q: %w", text, ErrBadPort)`. `%q` quotes the text, `%w` keeps the cause attached.',
      'Solution shape: `n, err := strconv.Atoi(text)`; on error `return 0, fmt.Errorf("port %q: %w", text, ErrBadPort)`; otherwise `return n, nil`. Transfer: reject ports above 65535 the same way — same motion, new rule.',
    ],
    misconceptions: [
      "Discarding an error and returning nil, so the caller keeps going with a zero value that looks like real data.",
      "Comparing error text as a string instead of using errors.Is — it breaks the moment the wording changes.",
      "Reading a returned error as a crash: the program is still running, and deciding to continue is a legitimate choice.",
    ],
    completionNote: "Bad input handled as a value: reported, printed, and the run still clean.",
    masteryNote: "Wrapped and propagated a real error with %w, unaided.",
    fileName: "main.go",
    language: "go",
  },
];
