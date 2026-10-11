import type { Mission } from "./types.js";

/* Stage 5: move from collections to reusable strategies. Each mission has a
   deterministic Go output check and prediction questions for runnerless use. */
export const MISSIONS_N: Mission[] = [
  {
    id: "go-binary-search",
    stageId: "dsa-more",
    title: "Binary search: cut the range in half",
    tagline: "Use sorted order to rule out half the candidates at each step.",
    type: "practice",
    difficulty: 3,
    estMinutes: 30,
    objectives: [
      "Search a sorted slice by narrowing an exclusive index range",
      "Return the matching index or -1 when the target is absent",
      "Explain why binary search depends on sorted input",
    ],
    prereqIds: ["go-maps"],
    competencyIds: ["go-collections", "algo-complexity"],
    whyItMatters:
      "A scan can inspect every item. When data is sorted, binary search uses the order to discard half the remaining range after each comparison — a different strategy with a different growth rate.",
    lesson: [
      {
        kind: "prose",
        body: "Binary search only works when the values are already sorted. Keep a half-open range `[low, high)`: `low` is included and `high` is excluded, so the first range is `[0, len(values))` and an empty range is easy to recognize.\n\nChoose the midpoint inside that range. If it is the target, return its index. If its value is smaller, the target can only be to the right, so move `low` past the midpoint. Otherwise move `high` back to the midpoint. Each comparison removes about half the remaining candidates. If the range becomes empty, the target is absent.",
      },
      {
        kind: "example",
        body: "For `[3 7 12 18 23 31 44]`, the first midpoint is index 3, containing 18. A target of 23 is to its right; the next range is `[4, 7)`, whose midpoint is index 5. The range keeps shrinking because its endpoints move inward.",
      },
      {
        kind: "task",
        body: "Complete `search` using the sorted slice and half-open range. Print the index of 23 and the result for absent value 8 as `found 4 missing -1`. The check runs this file and compares its output exactly. A scan that happens to find 23 is not the requested strategy; use the midpoint to discard a half-range. If no runner is available, answer the prediction questions to complete the mission.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc search(values []int, target int) int {\n\t// TODO: narrow a sorted, half-open range until the value is found\n\t// or no candidates remain. Return -1 when it is absent.\n\treturn -1\n}\n\nfunc main() {\n\tvalues := []int{3, 7, 12, 18, 23, 31, 44}\n\tfmt.Println("found", search(values, 23), "missing", search(values, 8))\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run found the value and reported an absent target",
        feedback:
          "The run did not return both expected results. Check the half-open bounds first: the last valid index is `len(values)-1`, and after ruling out a midpoint the next range must exclude it.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [{ target: "exitCode" }, { target: "stdout", equals: "found 4 missing -1" }],
        },
      },
    ],
    questions: [
      {
        id: "n1",
        prompt:
          "Binary search checks the middle of `[2 5 9 14 20 27 31]` for target 20. The middle value is 14. Which range can still contain the target?",
        options: [
          "Only the part before 14",
          "Only the part after 14",
          "Every item, because the target has not been checked yet",
          "No part; 14 is close enough",
        ],
        answer: 1,
        explanation:
          "Sorted order proves every value before 14 is too small. The algorithm can discard that half without inspecting each item.",
      },
      {
        id: "n2",
        prompt:
          "The same slice is changed to `[2 20 5 14 9 27 31]`. Why can the original binary-search steps no longer promise to find 20?",
        options: [
          "Binary search requires unique values",
          "The values are not sorted, so a comparison no longer proves which half can be discarded",
          "The slice has an odd number of elements",
          "Binary search only works on strings",
        ],
        answer: 1,
        explanation:
          "The comparison is useful only because all values on one side are known to be smaller or larger. Unsorted input breaks that guarantee.",
      },
    ],
    hintLadder: [
      "The starter always returns -1. Trace the first midpoint before changing the function.",
      "Start with `low := 0` and `high := len(values)`. Keep `high` exclusive so an empty slice starts with an empty range.",
      "While `low < high`, calculate `mid := low + (high-low)/2` and compare `values[mid]` with `target`.",
      "Return `mid` on equality. Move `low` to `mid+1` when the midpoint is too small; otherwise move `high` to `mid`.",
      "Solution shape: an exclusive upper bound, a shrinking range, and -1 after it empties. Transfer: search a sorted slice with duplicates and decide which matching index your function promises to return.",
    ],
    misconceptions: [
      "Setting `high` to `len(values)-1` while treating it as exclusive, which skips the last element.",
      "Leaving `low` at `mid` when the midpoint is too small, so a one-element range can repeat forever.",
      "Using binary search on unsorted data because the values still look searchable by eye.",
    ],
    completionNote: "Used sorted order to find a value and rule out an absent one.",
    masteryNote: "Built a bounded binary search and explained the sorted-input condition.",
    fileName: "main.go",
    language: "go",
  },
  {
    id: "go-insertion-sort",
    stageId: "dsa-more",
    title: "Insertion sort: grow a sorted prefix",
    tagline: "Place each new value where it belongs in the part already ordered.",
    type: "practice",
    difficulty: 3,
    estMinutes: 30,
    objectives: [
      "Sort integers in place by inserting each value into a sorted prefix",
      "Shift larger values right without overwriting the saved value",
      "Keep duplicate values and negative values in the result",
    ],
    prereqIds: ["go-binary-search"],
    competencyIds: ["go-collections", "algo-complexity"],
    whyItMatters:
      "Sorting is a family of strategies, not a magic operation. Insertion sort makes the invariant visible: before each pass, the prefix is already sorted, and the next value is inserted into its place.",
    lesson: [
      {
        kind: "prose",
        body: "Treat the first value as a sorted prefix. For each later value, save it as `key`, then move left through the prefix while values are larger. Shift those larger values one position right. When the correct gap appears, write `key` there.\n\nThe saved key matters: shifting overwrites its old slot. The prefix grows by one each pass, so after the final value is inserted the whole slice is sorted. Equal values do not need to move past one another; using `>` rather than `>=` keeps their relative order.",
      },
      {
        kind: "example",
        body: "Start with `[8 3 5]`. Save 3, shift 8 right, then place 3 at index 0: `[3 8 5]`. Next save 5, shift 8 right, and place 5 before it: `[3 5 8]`.",
      },
      {
        kind: "task",
        body: "Implement `insertionSort` in place. Sort `[8 3 5 3 -1]` and print the slice as `[-1 3 3 5 8]`. Keep both copies of 3. The check runs the program and compares the exact output; the prediction questions remain available when there is no runner.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc insertionSort(values []int) {\n\t// TODO: grow a sorted prefix by inserting each next value\n}\n\nfunc main() {\n\tvalues := []int{8, 3, 5, 3, -1}\n\tinsertionSort(values)\n\tfmt.Println(values)\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run sorted the values and kept both duplicates",
        feedback:
          "The result is not in the requested order or lost a value. Save the value being inserted before shifting, and place it into the gap left by those shifts.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [{ target: "exitCode" }, { target: "stdout", equals: "[-1 3 3 5 8]" }],
        },
      },
    ],
    questions: [
      {
        id: "n1",
        prompt:
          "During insertion sort, the prefix is `[2 6 9]` and the saved key is 5. Which values shift right before 5 is placed?",
        options: ["Only 2", "6 and 9", "2, 6, and 9", "None; 5 is appended"],
        answer: 1,
        explanation:
          "Only values greater than 5 move. The 2 stays in place, while 9 and 6 shift right to open the gap.",
      },
      {
        id: "n2",
        prompt:
          "Why is the value being inserted saved in `key` before the shifts begin?",
        options: [
          "To prevent the loop from changing the slice length",
          "Because shifting can overwrite the slot where that value started",
          "Because Go cannot compare slice elements directly",
          "To force a copy of the whole slice",
        ],
        answer: 1,
        explanation:
          "A right shift writes over the current slot. Keeping the key in a separate variable preserves the value until its insertion point is known.",
      },
    ],
    hintLadder: [
      "The starter leaves the slice unchanged. Follow one value through a single insertion before writing both loops.",
      "The sorted prefix starts at index 0. Begin each pass at index 1 and save that value in `key`.",
      "Walk left with an index while the preceding value is greater than `key`; shift that value one place right.",
      "When the loop stops, write `key` at `j+1`. The `j >= 0` check must come before indexing `values[j]`.",
      "Solution shape: save key, shift larger prefix values right, then fill the gap. Transfer: try the same method on a reverse-ordered slice and count how many shifts it needs.",
    ],
    misconceptions: [
      "Overwriting the key while shifting because it was not saved before the loop.",
      "Stopping after one comparison instead of shifting every larger prefix value.",
      "Using `>=` and moving equal values unnecessarily, which changes their relative order.",
    ],
    completionNote: "Sorted the slice by inserting each value into its ordered prefix.",
    masteryNote: "Maintained the sorted-prefix invariant and preserved duplicates in place.",
    fileName: "main.go",
    language: "go",
  },
  {
    id: "go-recursive-sum",
    stageId: "dsa-more",
    title: "Recursion: make the problem smaller",
    tagline: "Solve one small part, then hand the rest to the same function.",
    type: "practice",
    difficulty: 3,
    estMinutes: 30,
    objectives: [
      "Write a recursive function with a base case and a smaller input",
      "Sum a slice by combining its first value with the rest",
      "Handle an empty slice without indexing it",
    ],
    prereqIds: ["go-insertion-sort"],
    competencyIds: ["algo-complexity", "go-functions"],
    whyItMatters:
      "Recursion is useful when a problem has the same shape at a smaller size. Its safety depends on two visible parts: a base case that stops, and each call moving toward that case.",
    lesson: [
      {
        kind: "prose",
        body: "To sum a slice recursively, split the question into its first value and everything after it. The sum is `values[0] + sum(values[1:])`. That works only when the slice is non-empty, so first ask whether its length is zero. The sum of an empty slice is 0: that is the base case.\n\nEach call receives a shorter slice, so it moves toward the base case. When the empty slice returns 0, the earlier calls add their saved first values as the calls finish. If a call receives the same input again, the function never reaches its base case.",
      },
      {
        kind: "example",
        body: "`sum([4 6 5])` becomes `4 + sum([6 5])`, then `4 + 6 + sum([5])`, then `4 + 6 + 5 + sum([])`. The empty slice returns 0, so the final result is 15.",
      },
      {
        kind: "task",
        body: "Complete `sum` so it prints `sum 15 empty 0` for the provided values and an empty slice. Put the base case before indexing `values[0]`, then make each recursive call use a shorter slice. The check runs the program; questions can complete the mission without a runner.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc sum(values []int) int {\n\t// TODO: stop on an empty slice, otherwise add its first value\n\t// to the sum of the remaining values\n\treturn 0\n}\n\nfunc main() {\n\tvalues := []int{4, 6, 5}\n\tfmt.Println("sum", sum(values), "empty", sum([]int{}))\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run summed the values and handled the empty case",
        feedback:
          "The run did not return both totals. Check the stopping case before taking the first element, and make sure the recursive call receives fewer values.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [{ target: "exitCode" }, { target: "stdout", equals: "sum 15 empty 0" }],
        },
      },
    ],
    questions: [
      {
        id: "n1",
        prompt:
          "A recursive function receives `[]int{}`. Which part must answer before the function tries to read `values[0]`?",
        options: [
          "The recursive call with the same slice",
          "The base case that returns 0 for an empty slice",
          "A loop that appends a value",
          "A map lookup for the first value",
        ],
        answer: 1,
        explanation:
          "There is no first element in an empty slice. The base case returns before indexing and gives every larger call a result to add to.",
      },
      {
        id: "n2",
        prompt:
          "A call to `sum(values)` makes another call with `values[1:]`. What guarantees that this sequence can stop?",
        options: [
          "Go limits recursion to one call",
          "Each call receives fewer elements and eventually reaches the empty-slice base case",
          "The slice is sorted first",
          "The return value is always positive",
        ],
        answer: 1,
        explanation:
          "The input size decreases on every call. For a finite slice, repeated shortening reaches length zero, where the base case stops recursion.",
      },
    ],
    hintLadder: [
      "The same return value for both inputs hides two separate cases: empty and non-empty.",
      "For an empty slice, return 0 before reading its first value.",
      "For a non-empty slice, combine `values[0]` with a recursive call on `values[1:]`.",
      "Keep the base case first, then return `values[0] + sum(values[1:])`. The input gets shorter each time.",
      "Solution shape: empty returns zero; otherwise first plus the sum of the rest. Transfer: recursively count values above a threshold, including the empty-slice case.",
    ],
    misconceptions: [
      "Indexing the first value before checking for an empty slice, which panics on the required edge case.",
      "Calling `sum(values)` again with the same slice, so the call never gets closer to its base case.",
      "Returning the first value without adding the result of the smaller problem.",
    ],
    completionNote: "Summed a slice through a base case and a smaller recursive call.",
    masteryNote: "Built recursion that terminates for both populated and empty input.",
    fileName: "main.go",
    language: "go",
  },
  {
    id: "go-cost-instinct",
    stageId: "dsa-more",
    title: "Big-O: notice how work grows",
    tagline: "Count the work at two input sizes before naming its growth.",
    type: "practice",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Count one-pass work and nested-pair work for a chosen input size",
      "Compare the counts when input size doubles",
      "Connect the observed growth to linear and quadratic behavior",
    ],
    prereqIds: ["go-recursive-sum"],
    competencyIds: ["algo-complexity"],
    whyItMatters:
      "Big-O is a way to reason about how work grows, not a stopwatch reading. Counting loop iterations makes the difference between one pass and a nested pair of passes concrete and repeatable.",
    lesson: [
      {
        kind: "prose",
        body: "For one pass over `n` items, the loop body runs `n` times. If `n` doubles, that count doubles: this is linear growth, written O(n).\n\nWith two loops that each visit all `n` items, the body runs `n × n` times. Doubling `n` multiplies that count by four: quadratic growth, written O(n²). The exact counts in a real program can include constants and other work; Big-O focuses on how the growth changes as input gets larger.",
      },
      {
        kind: "example",
        body: "At `n = 2`, a single loop visits 2 times and a nested pair visits 4 pairs. At `n = 4`, those counts are 4 and 16. The input doubled; one count doubled and the other became four times as large.",
      },
      {
        kind: "task",
        body: "Implement `countWork` with one loop and a nested pair of loops. Print the counts for n=2 and n=4 exactly as `n=2 linear=2 pairs=4` and `n=4 linear=4 pairs=16`, one line each. This counts loop-body executions, not elapsed time. The questions remain available without a runner.",
      },
    ],
    starterCode:
      'package main\n\nimport "fmt"\n\nfunc countWork(n int) (linear, pairs int) {\n\t// TODO: count one pass and every pair from two full loops\n\treturn 0, 0\n}\n\nfunc main() {\n\tfor _, n := range []int{2, 4} {\n\t\tlinear, pairs := countWork(n)\n\t\tfmt.Printf("n=%d linear=%d pairs=%d\\n", n, linear, pairs)\n\t}\n}\n',
    checks: [
      {
        id: "run-answer",
        label: "A real run showed linear and quadratic counts at two sizes",
        feedback:
          "The counts do not show how each loop shape grows. Increment the first count once per outer item; increment the pair count inside both loops.",
        rule: {
          kind: "runs",
          language: "go",
          assertions: [
            { target: "exitCode" },
            {
              target: "stdout",
              equals: "n=2 linear=2 pairs=4\nn=4 linear=4 pairs=16",
            },
          ],
        },
      },
    ],
    questions: [
      {
        id: "n1",
        prompt:
          "A single loop over n items runs 20 times. If the input doubles and the loop shape stays the same, about how many times does its body run?",
        options: ["20", "40", "400", "It cannot be estimated"],
        answer: 1,
        explanation:
          "One pass does work proportional to the number of items. Twice as many items means about twice as many body executions.",
      },
      {
        id: "n2",
        prompt:
          "Two nested loops each visit all n items. What happens to the number of inner-body executions when n doubles?",
        options: ["It doubles", "It triples", "It becomes about four times as large", "It stays the same"],
        answer: 2,
        explanation:
          "The inner body runs n times for each of n outer iterations, or n² times. Replacing n with 2n gives (2n)² = 4n².",
      },
    ],
    hintLadder: [
      "The starter reports zero for both shapes at both sizes. Count loop-body visits, not the number of loop statements.",
      "A single loop from 0 up to n visits its body n times. Add one to `linear` inside that loop.",
      "A second counter belongs inside two nested loops, each ranging from 0 up to n.",
      "Return the counters after the loops. At n=2 the pair count is 4; at n=4 it is 16.",
      "Solution shape: one increment in a single loop, another in the inner body of two loops. Transfer: predict the counts at n=8 before running, then compare the growth ratios.",
    ],
    misconceptions: [
      "Counting how many loops appear in the source instead of how many times their bodies execute.",
      "Calling the nested work linear because both loops are individually linear.",
      "Treating measured elapsed time as the definition of Big-O, even though runtime also depends on machine and input details.",
    ],
    completionNote: "Compared one-pass and nested-loop work by counting executions.",
    masteryNote: "Used observed operation counts to explain linear versus quadratic growth.",
    fileName: "main.go",
    language: "go",
  },
];
