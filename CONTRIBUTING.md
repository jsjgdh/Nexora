# Contributing

The shortest version: **run the suites, keep the product's promises, and never let the UI claim
something the engine cannot verify.**

## Workflow

```bash
cd nexora-svelte && npm ci && npm run check && npm run verify && npm run build
cd nexora-svelte && npm run verify:a11y && npm run verify:ux
cd platform      && npm ci && npm run build && npm run verify
```

All of them must be green before a change is considered finished. `npm run check` is the type gate
(svelte-check over every component); `npm run verify` is the assertion suite. `npm run verify:a11y`
is an axe scan over every public route, and `npm run verify:ux` is a sweep over the production
build for the questions the other two do not ask: does the site reflow, does it read without the
script, does it read without motion, can it be driven from the keyboard, and do the anchors land
where the navigation promised. If your change adds behaviour, add assertions for it in the same
commit — all four are plain Node scripts with a tiny `ok(...)` helper, and they are meant to grow.

### Changing curriculum content

The IDE repo (`nexora-ide`, checked out as a **sibling** of this one — both under
the same parent directory) is the single source of truth for the course, the design
challenges and the suites the platform re-runs for attestation. The services embed
version-stamped snapshots of it, all generated and none edited by hand:

```bash
cd platform && npm run sync        # regenerate all three snapshots
cd platform && npm run sync:check  # assert the committed bytes are current
```

`sync` runs `sync:curriculum` (the course and its roadmap, under
`services/curriculum/src/data`), `sync:design` (the structural-check registry) and
`sync:fixtures` (the attestation suites), the last two under
`services/execution/src/data`.

**The release order is one-way: the IDE content commit lands before the platform
sync commit.** A platform commit that re-syncs content the IDE has not published
vendors bytes no learner can produce, and the next content PR fails `sync:check`
over a diff it did not author. An IDE content commit with no sync behind it leaves
the services serving and judging the previous revision until someone notices. The
stamp is what makes the interval checkable from this repo alone:
`services/curriculum/src/data/ide-version.ts` holds the content hash the snapshot
must produce, so `npm run verify` refuses a hand-edit or a stale copy even where no
`nexora-ide` checkout exists — and says out loud when the source match itself could
not be checked, rather than passing on nothing.

## What a mission must contain

A mission is data, and the model is enforced by `nexora-svelte/scripts/verify.ts`. Every authored
mission needs:

| Field | Rule |
|---|---|
| `objectives` | Observable outcomes, not topics ("predict what a loop prints", not "learn loops") |
| `lesson` | Orient → understand → attempt, ending in a `task` block |
| `hintLadder` | Exactly 5 levels, each >20 chars, escalating: nudge → concept → investigation → worked example → solution review |
| `misconceptions` | Named *predictable* wrong beliefs, not generic warnings |
| `checks` | Declarative rules that fail on the starter code and pass on a correct solution |
| `questions` (optional) | Recall/prediction items with an explanation that teaches, not just confirms |
| `completionNote` / `masteryNote` | What the learner has now proven; no praise inflation |

**Starter code must fail every check.** If the starter passes, the mission teaches nothing and the
suite will reject it. **Feedback must not reveal the answer** — it points at the gap and stops.

## Assessment rules

- Checks are **data**, interpreted by `nexora-svelte/src/lib/checks.ts`. Do not add hidden
  imperative test code to the client.
- Anything that runs learner code does so behind an opaque-origin sandbox, and the verdict is
  computed parent-side from raw observations (`src/lib/harness.ts` documents the trust model and
  where it stops being sufficient).
- **The server decides, and the client only supplies evidence.** Two kinds of check, two
  authorities:
  - *Execution checks* (`runs`) are decided by the progress service from a **signed run
    receipt** the execution service issued when it ran the program. The facts are
    re-judged server-side with `src/lib/run-evidence.ts`, vendored so browser and server
    cannot drift, and the receipt is bound to the hash of the file the mission names — so a
    run of other code, an edited output, an old run or a forged signature all fail closed.
  - *Document checks* (`has-element`, `text-match`, `count-exact`, …) are re-derived server-side
    too, from the draft the platform stores, with the same interpreter and the same parser
    (jsdom) the browser uses. Only `computed-style` and `scripted` — a cascade and a driven page
    — plus question answers remain the client's own report. That is a stated limitation, not a
    licence: do not move a check onto the client for convenience.
- A client cannot award itself a competency. If you add a check that needs the runner, it must be
  decidable from the runner's own facts — never from a value the client can produce.
- Never weaken a check to make a mission pass, and never special-case a mission id in the engine.
  If a rule is missing, add the rule — the whole engine is ~130 lines and fully tested.

The full model — which authority decides which rule kind, how the sandbox works, and which two kinds
are still the client's own report — is written down in [`TRUST-MODEL.md`](TRUST-MODEL.md). Read it
before moving a check between the two sides.

## Copy rules

- Direct, encouraging, engineer-to-engineer. No hype, no exclamation marks, no participation
  trophies.
- Never shame: a failed check is "changes requested", never "wrong" or "failed".
- No invented claims. No testimonials, no customer logos, no statistics we cannot point at a
  source for.
- Say what is true about the environment. If Go execution needs the online runner, the UI says so
  instead of pretending.

## Interface rules

The visual grammar below is implemented in `nexora-svelte/src/app.css`; its
origin blueprint (`design.md`) is preserved in git history (commit `e1ad7b9`).
The rules contributors break most:

1. **State is carried by form before hue.** Solid/dashed/dotted/struck line rules *and* a printed
   word. Colour reinforces; it never carries meaning alone.
2. **No shadows, no large radii, one device pixel of rule.** This is an editor, not a SaaS
   dashboard.
3. **A page renders `<PageHead>`.** The shell deliberately writes no `<title>` and no
   `description`: `svelte:head` *merges* across components, so a layout default plus a page's own
   tags puts two descriptions in the document and leaves the crawler to pick one. A new route that
   declares neither `<PageHead>` nor a `<svelte:head>` fails `scripts/verify.ts` — a page with no
   title is a page nobody can find.

Run the design detector after UI edits (it runs automatically as a project hook where configured).
It is allowed to report nothing; it is not allowed to be ignored.

## Accessibility floor

Keyboard reachable, visible focus, semantic structure, readable contrast. Every UI change should
survive a keyboard-only pass of the flow it touches, and status must never be colour-only.

## Commits

Small, focused, and honest about what they do. Do not commit secrets, do not commit a green suite
you have not run, and do not delete a test to make a change pass — fix the cause or report the
blocker.
