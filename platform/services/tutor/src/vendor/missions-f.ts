import type { Mission } from "./types.js";

/* Scenarios: missions where the learner repairs a small, real repository
   instead of writing a program from a blank file.

   The shape here is deliberate and minimal. A scenario supplies:

     - a *broken state* as the starter (Git's own conflict markers, verbatim)
     - a *fixture* the learner does not write and cannot edit: the test suite
     - deterministic checks that read the runner's own output

   The fixture is what makes this trustworthy. It travels from the mission, not
   from the learner's editor, so the definition of "done" cannot be edited by
   the person being assessed — the same reason the Go missions are graded
   server-side. It also means the learner can read exactly what will be asked of
   them, which is how real work goes: here are the tests, make them pass.

   The first scenario is a merge conflict because the state is *representable*
   as a single file plus fixtures: no Git binary, no repository, no terminal
   needed to teach the part that matters most — that both changes are intended,
   and resolving means combining them rather than picking a side. Scenarios that
   need real branch state (bisect, revert, rebase) need infrastructure this
   platform does not have yet; SCENARIOS.md records that boundary. */

/** The merge that stopped: both branches changed the same function. */
const STARTER = `// The merge stopped here: both branches changed the same function, and Git
// refuses to guess which change to keep.
function renderTask(task) {
<<<<<<< HEAD
  return "Task: " + task.title;
=======
  return task.done ? "✓ " + task.title : task.title;
>>>>>>> feature/status
}

module.exports = { renderTask };
`;

/* The suite that runs against the learner's file. It is shown to them in the
   lesson (verify.ts asserts it is the same text) so nothing about the
   assessment is hidden — only the answer is. */
const VERIFY_MERGE = `const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "src", "task.js");
const MARKERS = ["<<<<<<<", "=======", ">>>>>>>"];

const leftover = fs
  .readFileSync(FILE, "utf8")
  .split("\\n")
  .map((line, i) => [i + 1, line])
  .filter(([, line]) => MARKERS.some((m) => line.startsWith(m)));

if (leftover.length > 0) {
  console.log("CONFLICT MARKERS STILL PRESENT on line(s): " + leftover.map(([n]) => n).join(", "));
  console.log("Both versions of the line are still in the file. Git left them for you to decide.");
  process.exit(1);
}
console.log("NO CONFLICT MARKERS");

const { renderTask } = require("./src/task.js");

const cases = [
  ["a task keeps its descriptive label", renderTask({ title: "Write the brief", done: false }), "Task: Write the brief"],
  ["a finished task is marked", renderTask({ title: "Write the brief", done: true }), "✓ Task: Write the brief"],
];

let failed = 0;
for (const [name, actual, expected] of cases) {
  if (actual === expected) {
    console.log("ok   " + name);
  } else {
    failed += 1;
    console.log("FAIL " + name);
    console.log("       expected: " + JSON.stringify(expected));
    console.log("       actual:   " + JSON.stringify(actual));
  }
}
console.log(failed === 0 ? "ALL TESTS PASSED" : failed + " of " + cases.length + " tests failed");
process.exit(failed === 0 ? 0 : 1);
`;

const DURATION_STARTER = `function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + seconds;
}

module.exports = { formatDuration };
`;

const VERIFY_DURATION = `const { formatDuration } = require("./src/duration.js");

const cases = [
  ["zero seconds uses two digits", 0, "0:00"],
  ["a short remainder is padded", 123, "2:03"],
  ["a two-digit remainder stays intact", 610, "10:10"],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const actual = formatDuration(input);
  if (actual === expected) {
    console.log("ok   " + name);
  } else {
    failed += 1;
    console.log("FAIL " + name);
    console.log("       input:    " + input);
    console.log("       expected: " + JSON.stringify(expected));
    console.log("       actual:   " + JSON.stringify(actual));
  }
}
console.log(failed === 0 ? "ALL TESTS PASSED" : failed + " of " + cases.length + " tests failed");
process.exit(failed === 0 ? 0 : 1);
`;

const TASKS_BUG_STARTER = `function dashboardTitle(tasks) {
  return "First: " + tasks[0].title;
}

module.exports = { dashboardTitle };
`;

const VERIFY_TASKS_BUG = `const { dashboardTitle } = require("./src/dashboard.js");

const cases = [
  ["saved sample workspace", [{ title: "Fix startup" }], "First: Fix startup"],
  ["workspace just created", [], "No tasks yet"],
  ["workspace with several tasks", [{ title: "Fix startup" }, { title: "Add a test" }], "First: Fix startup"],
];

let failed = 0;
for (const [name, tasks, expected] of cases) {
  let actual;
  try {
    actual = dashboardTitle(tasks);
  } catch (error) {
    actual = "THREW " + error.name;
  }
  if (actual === expected) {
    console.log("ok   " + name);
  } else {
    failed += 1;
    console.log("FAIL " + name);
    console.log("       task count: " + tasks.length);
    console.log("       expected:   " + JSON.stringify(expected));
    console.log("       actual:     " + JSON.stringify(actual));
  }
}
console.log(failed === 0 ? "ALL TESTS PASSED" : failed + " of " + cases.length + " tests failed");
process.exit(failed === 0 ? 0 : 1);
`;

export const MISSIONS_F: Mission[] = [
  {
    id: "git-resolve-conflict",
    stageId: "git",
    title: "The Conflicting Feature",
    tagline: "Two branches changed the same line. Finish the merge without losing either change.",
    type: "debugging",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Say why Git stops instead of choosing a side",
      "Read the three conflict markers and name which side is which",
      "Combine two competing changes into one behaviour",
      "Treat a failing test suite as the definition of done",
    ],
    prereqIds: ["js-counter"],
    competencyIds: ["git-workflow"],
    whyItMatters:
      "Merge conflicts are the first thing in a working repository that cannot be guessed, copied, or googled into place: the two changes are both correct, and only a person who understands the intent can combine them. Developers who fear conflicts avoid branches, and developers who avoid branches commit straight to main. This is the twenty minutes that stops that.",
    lesson: [
      {
        kind: "prose",
        body:
          "Two people worked from the same starting point. One changed how a task is labelled. The other made finished tasks show a check mark. Both edited **the same function**, and both merged into `main` — so when Git tried to combine them, it found two different versions of the same lines.\n\nGit merges text, not intentions. When two branches change different lines it can combine them silently; when they change the same line it has no basis to choose, so it stops and marks the file instead of guessing. That marker is not an error. It is Git saying: *one of you has to decide this.*",
      },
      {
        kind: "example",
        body:
          "A conflict marks the same region three times: the version from **your current branch**, a separator, then **the version coming in**.",
        code:
          "<<<<<<< HEAD\n  return \"Task: \" + task.title;\n=======\n  return task.done ? \"✓ \" + task.title : task.title;\n>>>>>>> feature/status",
        codeCaption: "`HEAD` is where you are; the name after `>>>>>>>` is the branch being merged in.",
      },
      {
        kind: "prose",
        body:
          "The mistake everyone makes once is deleting the markers and keeping **one** side. That is not resolving a conflict, it is discarding someone's work — and if it is the other person's, it usually comes back as a bug report.\n\nDecide what each change was *for*, then express both intentions in one piece of code. Deleting the markers is only the last step, not the fix.",
      },
      {
        kind: "prose",
        body:
          "`src/task.js` is yours to edit. The test file below is supplied by the runner and cannot be edited — the same way a repository's tests are not yours to rewrite when they fail. It checks two things: that no conflict markers are left behind, and that both behaviours work.",
      },
      {
        kind: "example",
        body: "This is the whole assessment. Read it before you start.",
        code: VERIFY_MERGE,
        codeCaption: "verify-merge.js — supplied with your submission, runs against your file.",
      },
      {
        kind: "task",
        body:
          "Resolve the conflict in `src/task.js` so that a task keeps its descriptive label **and** finished tasks show the check mark — `Task: Write the brief` and `✓ Task: Write the brief`. Then finish the merge by running it: no markers may remain, and both behaviours must pass.",
      },
    ],
    starterCode: STARTER,
    checks: [
      {
        id: "merge-complete",
        label: "Both behaviours work and no conflict markers remain",
        feedback:
          "The suite failed. Read its output: if it reports conflict markers, Git's three lines are still in the file — combine the two changes and delete them. If a case FAILs, one of the two intentions was lost: `Task: ` labels a task, and a finished task is marked with `✓ `.",
        rule: {
          kind: "runs",
          language: "node",
          entry: "verify-merge.js",
          harness: [{ path: "verify-merge.js", content: VERIFY_MERGE }],
          assertions: [
            { target: "stdout", matches: "NO CONFLICT MARKERS" },
            { target: "stdout", matches: "ALL TESTS PASSED" },
            { target: "exitCode", code: 0 },
          ],
        },
      },
    ],
    hintLadder: [
      "Run it first, before editing anything. The output tells you exactly what is wrong — markers, a failing case, or both.",
      "The file has one conflicted region: `<<<<<<<` starts your branch's version, `=======` separates it, `>>>>>>>` ends the incoming one. Both versions are wanted.",
      "Build the label first (`\"Task: \" + task.title`), then let `task.done` decide whether the check mark goes in front of it.",
      "One shape that keeps both: keep the incoming `done` check, and use the label from your branch as what it returns — for example assign the label to a variable, then return `task.done ? \"✓ \" + label : label`.",
      "The resolved function: `const label = \"Task: \" + task.title; return task.done ? \"✓ \" + label : label;` — markers deleted, both behaviours expressed once.",
    ],
    misconceptions: [
      "Deleting the markers and keeping one side: the suite fails because a case expects the behaviour that was discarded.",
      "Editing the test file to make it pass: the runner supplies it with your submission, so only `src/task.js` is yours.",
      "Assuming the conflict means someone made a mistake: it means two correct changes touched the same lines, which is ordinary team work.",
      "Treating the markers as syntax to delete rather than a decision to make: the decision is *how the two intentions fit*, and the code should say it.",
    ],
    completionNote:
      "Merge resolved. You read someone else's change, kept your own, and combined them into one behaviour — which is most of what working in a shared repository actually is.",
    masteryNote:
      "Independent: you resolved this without a step-by-step and cited the failing case you were fixing. Conflicts are now a normal part of your workflow rather than a thing to avoid.",
    questions: [
      {
        id: "why-conflict",
        prompt: "Why did Git stop instead of merging the two branches?",
        options: [
          "Both branches changed the same lines, so Git has no basis to choose between them",
          "The branches contain different code, and Git cannot merge files that differ",
          "The feature branch was created from an older commit than main",
        ],
        answer: 0,
        explanation:
          "Git merges line by line. Changes on different lines combine silently; two versions of the same line cannot, so it stops and hands the decision to you.",
      },
      {
        id: "both-intentions",
        prompt: "Which edit keeps both intentions from the two branches?",
        options: [
          "Keep only the check-mark branch: it is more recent, so it must be the intended version",
          "Keep only the label branch and add the check mark separately later",
          "Build the label, then return the label with or without a check mark depending on `task.done`",
        ],
        answer: 2,
        explanation:
          "Each branch expressed one intention: a descriptive label, and a marker for finished tasks. Resolving is finding the code that says both — not choosing which teammate to disappoint.",
      },
    ],
    fileName: "src/task.js",
    language: "node",
    files: [
      { path: "src/task.js", content: STARTER, editable: true },
      { path: "verify-merge.js", content: VERIFY_MERGE, editable: false },
    ],
  },
  {
    id: "scenario-duration-format",
    stageId: "git",
    title: "The Failing Duration Tests",
    tagline: "Read the assertion. Fix the formatter, not the test.",
    type: "debugging",
    difficulty: 1,
    estMinutes: 15,
    objectives: [
      "Run a supplied test suite and identify what its failure says",
      "Compare the actual result with the expected output for that case",
      "Repair a function without changing the tests that define its contract",
    ],
    prereqIds: ["js-counter"],
    competencyIds: ["testing-quality"],
    whyItMatters:
      "Tests are a description of behaviour the rest of a program relies on. A failing case gives you a small, concrete disagreement to investigate; changing the test to agree with a bug only hides the disagreement from everyone who depends on that output.",
    lesson: [
      {
        kind: "prose",
        body:
          "A test compares an **actual** result with an **expected** result for a particular input. When they disagree, the first useful question is not “how do I make the test green?” but “what did the program return, and what does the caller rely on?”. Read the case name, input, expected value, and actual value before editing.",
      },
      {
        kind: "example",
        body:
          "This formatter displays a duration as `minutes:seconds`. The seconds field is text, so it needs a consistent width: `2:03`, not `2:3`. The minute field is not capped at 59; ten minutes is `10:00`.",
        code: "formatDuration(123) → expected `2:03`\nactual from the starter → `2:3`",
      },
      {
        kind: "prose",
        body:
          "`src/duration.js` is the only file you edit. The suite is supplied separately and cannot be changed in your submission. Its output names every case that failed; read the first one, trace the calculation, then run again to see whether your change fixes the whole contract rather than one example.",
      },
      {
        kind: "example",
        body: "The complete test suite is visible before you start; this exact file is what the runner executes.",
        code: VERIFY_DURATION,
        codeCaption: "verify-duration.js — supplied fixture, not an editable learner file.",
      },
      {
        kind: "task",
        body:
          "Run the starter first. Read each `FAIL` line and compare its input, expected output, and actual output. Change `src/duration.js` so all three cases pass; leave the supplied tests alone, then run the suite again.",
      },
    ],
    starterCode: DURATION_STARTER,
    checks: [
      {
        id: "duration-suite-passes",
        label: "Every duration example matches the expected display",
        feedback:
          "The test suite failed. Start with its first `FAIL` line: it names the case, input, expected display, and actual display. Repair the formatter in `src/duration.js`; the supplied test file is part of the contract and is not yours to change.",
        rule: {
          kind: "runs",
          language: "node",
          entry: "verify-duration.js",
          harness: [{ path: "verify-duration.js", content: VERIFY_DURATION }],
          assertions: [
            { target: "stdout", matches: "ALL TESTS PASSED" },
            { target: "exitCode", code: 0 },
          ],
        },
      },
    ],
    hintLadder: [
      "Run it before editing. Read the named case and compare its expected output with the actual string the function returned.",
      "For each input, `Math.floor(totalSeconds / 60)` gives the minutes and `% 60` gives the seconds left over. Trace both values for 123.",
      "The arithmetic can be right while the displayed text is wrong: the test expects the seconds part to occupy two characters.",
      "Keep the remainder numeric for the calculation, then convert it to text and add a leading zero when it has only one digit. Do this for every input, not just 123.",
      "One solution shape: `const seconds = String(totalSeconds % 60).padStart(2, \"0\"); return Math.floor(totalSeconds / 60) + \":\" + seconds;`. Transfer: write a test for 3,600 seconds before you change anything.",
    ],
    misconceptions: [
      "Changing the expected value to match `2:3` makes the test green but breaks the display contract for every caller that expects `M:SS`.",
      "The arithmetic is wrong because the output is wrong — the minutes and remainder can be correct while their string representation violates the format.",
      "Padding every output with a fixed literal works — it only fixes one-digit seconds and corrupts values that already have two digits.",
      "A test failure is a verdict on you rather than evidence about one input — the named case narrows the disagreement to a behaviour you can inspect.",
    ],
    completionNote:
      "All supplied cases agree with the function. You read the disagreement before changing code and kept the test contract intact.",
    masteryNote:
      "Independent: you found the formatting bug from the failed case and could add a new boundary case before changing the function.",
    questions: [
      {
        id: "duration-actual-expected",
        prompt: "A case says the expected value is `2:03` but the actual value is `2:3`. What is the specific disagreement?",
        options: [
          "The total number of seconds is necessarily wrong",
          "The seconds value is numerically different",
          "The seconds are right numerically but the displayed field has the wrong width",
          "The test has no useful information",
        ],
        answer: 2,
        explanation:
          "Both strings describe two minutes and three seconds, but the documented `M:SS` output requires a two-character seconds field. The test shows a formatting bug, not necessarily an arithmetic one.",
      },
      {
        id: "duration-trust-test",
        prompt: "The test file is supplied and cannot be edited. What should you do when its expected value disagrees with the starter?",
        options: [
          "Change the function until its actual output satisfies the stated contract",
          "Delete the failing case so the suite only checks the starter's behaviour",
          "Print `ALL TESTS PASSED` from the learner file",
          "Ignore the named input and change an unrelated function",
        ],
        answer: 0,
        explanation:
          "The fixture is the acceptance contract for the task. Repairing the formatter preserves that contract for its callers; editing or bypassing the tests only conceals the bug.",
      },
      {
        id: "duration-transfer",
        prompt: "The required format is `M:SS`, and minutes are not capped at 59. How should 3,610 seconds display?",
        options: ["60:10", "1:10", "60:010", "59:70"],
        answer: 0,
        explanation:
          "There are 60 whole minutes and 10 seconds left. The minute field can exceed 59; only the seconds field has a fixed two-character width.",
      },
    ],
    fileName: "src/duration.js",
    language: "node",
    files: [
      { path: "src/duration.js", content: DURATION_STARTER, editable: true },
      { path: "verify-duration.js", content: VERIFY_DURATION, editable: false },
    ],
  },
  {
    id: "scenario-new-workspace-crash",
    stageId: "git",
    title: "The Dashboard Crash Report",
    tagline: "Reproduce the report. Find which state makes it fail.",
    type: "debugging",
    difficulty: 2,
    estMinutes: 18,
    objectives: [
      "Turn a brief bug report into a minimal reproduction",
      "Use a named test failure to find the condition the report left out",
      "Repair the function while preserving its working behaviour",
    ],
    prereqIds: ["js-counter"],
    competencyIds: ["testing-quality", "js-logic"],
    whyItMatters:
      "A bug report gives you observations, not a complete explanation. Developers narrow the problem by comparing a case that works with the smallest case that fails. A minimal reproduction makes the missing condition visible and gives the repair a boundary to protect.",
    lesson: [
      {
        kind: "prose",
        body:
          "**Support report:** “The dashboard sometimes crashes when a brand-new workspace is opened. Our saved sample project loads. Someone said it worked after they added a task, but I can't reproduce it in my own workspace. Please investigate; don't change what the dashboard shows for working projects.” The report describes a symptom and a couple of observations. It does not yet tell you exactly which input caused the crash.",
      },
      {
        kind: "prose",
        body:
          "Start with the smallest comparison the report suggests: run the supplied cases, then compare the failing input with the inputs that work. A good reproduction changes one condition at a time. Once you find the state that triggers the failure, fix that boundary and rerun the working cases too — a repair that hides the crash by breaking normal projects is not a repair.",
      },
      {
        kind: "example",
        body:
          "The editor contains `src/dashboard.js`. The runner supplies the suite below as a read-only fixture. It catches a crash so later cases still run, and prints the input condition, expected output, and actual result for each failure.",
        code: VERIFY_TASKS_BUG,
        codeCaption: "verify-dashboard.js — visible evidence, supplied by the mission.",
      },
      {
        kind: "task",
        body:
          "Run the code as it is. Use the report and the suite's failures to find the smallest state that reproduces the crash. Repair `dashboardTitle` so the dashboard gives a useful title in that state and keeps its existing result for projects with tasks. Do not change the test fixture.",
      },
    ],
    starterCode: TASKS_BUG_STARTER,
    checks: [
      {
        id: "dashboard-report-reproduced-and-fixed",
        label: "The reported crash is fixed without changing working projects",
        feedback:
          "The suite failed. Compare the failing case's task count with the cases that pass, then trace what `dashboardTitle` reads in that state. Fix the source function; the fixture is the report's reproducible contract and cannot be edited.",
        rule: {
          kind: "runs",
          language: "node",
          entry: "verify-dashboard.js",
          harness: [{ path: "verify-dashboard.js", content: VERIFY_TASKS_BUG }],
          assertions: [
            { target: "stdout", matches: "ALL TESTS PASSED" },
            { target: "exitCode", code: 0 },
          ],
        },
      },
    ],
    hintLadder: [
      "Run the supplied suite. Which named case fails, and which observations from the report match that case?",
      "Compare the failing input with the working saved sample. The report says someone got a different result after adding something; use the printed task count to narrow it down.",
      "The starter reads `tasks[0].title`. Before looking at a title, ask whether `tasks[0]` exists in every case the dashboard can receive.",
      "Handle the no-first-task state explicitly, before reading `.title`. Keep the current title format for non-empty arrays.",
      "One repair shape: `if (tasks.length === 0) return \"No tasks yet\";` then keep the existing return. Transfer: add a case for a one-item array and verify it still uses that item's title.",
    ],
    misconceptions: [
      "The suite catches the crash, so a crash is acceptable — the report asks for a usable dashboard state, not merely a process that stays alive.",
      "The working saved-sample case is enough — the report says newly created workspaces fail, so the unseen difference between those states matters.",
      "A fix may change the title for every project — preserve the existing output for working inputs while handling the state that has no first task.",
      "The fixture's task count is just noise — comparing it is the clue that turns an intermittent report into a repeatable reproduction.",
    ],
    completionNote:
      "The reported crash is reproducible and fixed; the same suite confirms that existing workspaces still show their first task.",
    masteryNote:
      "Independent: you found the triggering state from the report and could add the smallest regression test before writing the fix.",
    questions: [
      {
        id: "dashboard-minimal-reproduction",
        prompt: "The saved sample works, but a newly created workspace fails. What is the best next step?",
        options: [
          "Compare the smallest inputs for those two states and run the failing case repeatedly",
          "Rewrite the working sample so it behaves like the broken one",
          "Assume every project is corrupted and replace the whole dashboard",
          "Remove the failing case from the suite",
        ],
        answer: 0,
        explanation:
          "A minimal comparison isolates what differs between a working and failing state. Repeating the failing case confirms it is reproducible before you change code.",
      },
      {
        id: "dashboard-crash-cause",
        prompt: "The failing case has zero tasks, and the function reads `tasks[0].title`. What makes that state different?",
        options: [
          "The array has a first task, but its title is longer",
          "There is no first item, so reading its title throws before producing output",
          "JavaScript arrays cannot contain objects",
          "The test fixture changed the function's return value",
        ],
        answer: 1,
        explanation:
          "For an empty array, `tasks[0]` is undefined. Reading `.title` from it throws; the function needs to decide what to show before accessing the first task.",
      },
      {
        id: "dashboard-regression",
        prompt: "After fixing the no-task case, why rerun the cases with one and several tasks?",
        options: [
          "To check that handling the failing boundary did not change working behaviour",
          "To make the empty case occur again",
          "Because tests only count if they run in a particular order",
          "To prove that no other dashboard bugs can exist",
        ],
        answer: 0,
        explanation:
          "A regression check protects behaviour that already worked. The fix must cover the new boundary without changing the first-task output for non-empty projects.",
      },
    ],
    fileName: "src/dashboard.js",
    language: "node",
    files: [
      { path: "src/dashboard.js", content: TASKS_BUG_STARTER, editable: true },
      { path: "verify-dashboard.js", content: VERIFY_TASKS_BUG, editable: false },
    ],
  },
];
