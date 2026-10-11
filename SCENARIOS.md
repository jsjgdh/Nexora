# Scenarios: teaching the work around the code

> What this is: the design for missions where the learner repairs a real, broken
> state — a merge conflict, a failing test, a bug report — instead of writing a
> program from a blank file. It maps the proposal onto what this codebase already
> has, states what is missing, and records the order of work.
>
> Status: **three scenarios ship** (`git-resolve-conflict`,
> `scenario-duration-format`, and `scenario-new-workspace-crash`, Stage 9). The engine they need turned out to
> exist; what was missing was small pieces of runner plumbing and an honest
> boundary around multi-file/repository work. The remaining slices are below.

---

## 1. What the proposal asks for, against what exists

The proposal describes a scenario engine with an initial state, permitted
actions, success conditions, evidence, and reset behaviour. Most of that
vocabulary already exists in `nexora-svelte/src/lib/types.ts`, unnamed:

| Proposed concept | What already implements it | Gap |
|---|---|---|
| Learning objectives | `Mission.objectives`, rendered as a lesson block | — |
| Prerequisites | `Mission.prereqIds` + `prereqsMet` in `recommend.ts` | — |
| Interaction sequence (predict, edit, run, debug, reflect) | `MissionQuestion[]` for predict/reflect; the workspace's editor + Run for edit/run; the hint ladder for debug | — |
| **Workspace fixture** | `runs` checks carry `harness: { path, content }[]`, merged into the submission and **not editable by the learner** | Fixtures can be read in the lesson, but are absent from the editor; a scenario with many files would want one fixture block |
| **Assessment specification** | `CheckRule` union: DOM checks, computed styles, the scripted harness, and `runs` with declarative assertions | — |
| Hint ladder | `Mission.hintLadder` (5 levels, escalating) | Non-punitive by default: hints are recorded, not subtracted |
| Mastery rubric | `Mission.masteryNote` + `independent` evidence in `progress-core.ts` (completed without a level-4+ hint) | Rubrics are prose, not structured |
| Follow-up rules | `recommend.ts` (prerequisite graph, practice queue) | — |
| **Evidence** | `checksPassed` + the run outcome behind each execution check | Runs are not persisted server-side (see §4) |
| **Reset policy** | `MissionProgress.code` draft + reset in the workspace | Reset restores the mission starter and overwrites the current local draft; a confirmation now says so explicitly before the learner commits |
| Provenance | `platform/scripts/sync-curriculum.mjs` gives every published curriculum a content version (`f11a654b` → `1c071bb7` as content moves) | Per-mission author/reviewer/licence is not recorded |
| Versioning | `CONTENT_VERSION` stamped into every service response header | A learner's attempt is not pinned to the mission version it started on |

So the "content pipeline plus simulation engine" is not a rewrite: the mission
model was already declarative, deterministic and fixture-aware. What the
proposal adds is a **kind of state** (a repository, not a file) and a **kind of
action** (commands, not edits).

## 2. The first scenario, and why it is that one

`git-resolve-conflict` — "The Conflicting Feature" — ships in
`nexora-svelte/src/lib/missions-f.ts`:

- the starter is a real conflicted file, Git's three markers verbatim;
- the fixture is a test suite the learner cannot edit, shown to them in the
  lesson (an assertion enforces that the shown text and the executed text are
  the same bytes);
- the check is one `runs` check on the **fixture** as entry, asserting a clean
  exit, `NO CONFLICT MARKERS`, and `ALL TESTS PASSED`;
- the evidence is the runner's own output, graded server-side — the same
  "the interface cannot claim a runtime the work did not use" rule as the Go
  missions.

Verified, not asserted: the suite is executed for real by three separate
parties, and each of them fails a wrong answer —

1. `scripts/verify.ts` runs it with `node` against the starter (fails, naming
   the leftover markers), a resolution (passes, both cases `ok`), and a
   **one-sided resolution** (fails on the lost behaviour, not on syntax);
2. `platform/scripts/verify.mjs` runs the same shape through the execution
   service's own route, proving nested paths land where the suite expects them
   and that an explicit `command` runs the fixture rather than the learner's
   file;
3. the app's check engine (`evaluateRunAssertions`) is evaluated against both
   real outcomes.

Why this scenario first: it is the highest-value piece of Git that is
*representable without a repository*. The part that teaches — two intended
changes, one line, and a decision only a person can make — needs no branches,
no binary, and no terminal. That is the honest reason to start here rather than
with `git merge` as a command to type.

The second scenario, `scenario-duration-format` — “The Failing Duration
Tests” — keeps the visible-fixture contract while teaching a different repair
loop:

- the starter is a formatter whose arithmetic works but whose one-digit
  seconds do not meet the `M:SS` output contract;
- the supplied suite names each input, expected string and actual string, and
  checks `0:00`, `2:03`, and `10:10`;
- the check runs the fixture against the learner's `src/duration.js`, and the
  runner returns the failing cases rather than a hidden grade;
- the starter fails two cases, a general zero-padding repair passes all three,
  and frontend and platform suites execute those versions for real.

This comes second because learners need practice responding to an assertion
before they need a terminal or repository. The fixture can show its full
contract and still leave the diagnosis and repair to the learner.

The third scenario, `scenario-new-workspace-crash` — “The Dashboard Crash
Report” — starts from a report with observations but no known trigger:

- saved projects work; some newly created workspaces crash; the reporter says
  the dashboard works after a task is added but cannot isolate why;
- the supplied suite compares a saved sample, a just-created workspace, and a
  multi-task workspace. It catches the exception so the other cases still run
  and prints the task count with expected and actual results;
- the learner must connect the failing case to the report, then fix
  `dashboardTitle` without changing the working outputs;
- the starter reproduces a `TypeError` only in the just-created workspace
  case, while a minimal no-task fallback passes all three cases. Both suites
  execute the starter and repair against the real fixture.

The report does not name the trigger, but the complete fixture remains visible:
the learner can discover the condition by running or reading the cases. This
keeps the grading honest without turning the answer into hidden-test trivia.

## 3. What a scenario needs that this platform does not have yet

Recorded plainly, because these are the next slices:

1. **A repository, not a file.** A multi-file workspace (`Mission.files[]` with
   one editable file marked), a diff view, and fixtures that are visible but
   read-only in the editor. Today: one editable file; fixtures are shown in
   lesson content but do not appear in the editor.
2. **A terminal.** A command channel to the sandbox (allowlisted argv, streamed
   output, cwd visible) so `git status`, `git diff`, and `npm test` are things
   the learner *runs* rather than things the mission says. Today the runner
   executes exactly one command per submission, chosen by the check.
3. **A Git-capable sandbox.** `git` is not in the execution allowlist
   (`platform/services/execution/src/validate.ts` allows `go`, `node`,
   `python3`), and the docker runner's images are per-language
   (`nexora-go-runner`, `node:22-alpine`). Real branch state means: a git image,
   a fixture repository as data, and a *replay* of the learner's commands
   against it. That is a scenario runner, not a lesson tweak.
4. **A server-side provider for scenarios that alter state.** Our runners take
   one submission — a file set and a single command — so a scenario that
   branches, commits and reads state back belongs on the local runner until a
   provider can carry a filesystem between commands.
5. **Attempt history.** One run is one verdict today; a scenario wants the
   transcript (commands, outputs, hints, final state) as evidence, which is
   `TODO.md` §1.6.
6. **Structured provenance and mastery.** Per-mission author, reviewer, source
   and licence; a rubric expressed as data rather than prose.

## 4. Order of work

Each slice is independently verifiable, and each is worth shipping on its own:

1. ~~One scenario end to end on the existing engine~~ — **done** (§2).
2. ~~**Two more scenarios of the same shape**~~ — both ship above: a failing
   test suite repair and a bug report whose reproduction condition the learner
   has to find. They use the existing `runs` fixture; no new infrastructure.
3. **A multi-file workspace** — `Mission.files[]`, an editable-file marker, a
   read-only fixture view. This is the prerequisite for everything Git-shaped.
4. **A terminal** — one command at a time, streamed, allowlisted, resettable.
5. **A scenario runner with real repository state** — git image, fixture repos
   as data, command replay, and checks that read repository state (no conflict
   markers, merged, tests pass) rather than a single stdout.
6. **Attempt history and rubrics** — the transcript as evidence, rubrics as
   data, both described in `TODO.md`.

Two constraints carry through all of it, and they are the reason this platform
can teach these things at all: **assessment stays deterministic** (a fixture the
learner cannot edit, run by a machine the learner does not control), and **the
UI never claims more than happened** (if the work did not run, the check records
*not run*, and the mission says why).
