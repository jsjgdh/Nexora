# The trust model

NEXORA claims skills, so every verdict has to name **who decided it**. This document is the
in-repo version of a trust model that already exists in comments scattered across the check
engine, the sandbox harness and two services. Read it before adding a check, moving a rule, or
telling a learner something is proven.

The short version: a learner's device uploads its own progress, so anything it sends is a *claim*.
Three authorities decide verdicts today, and only two of them are the platform's.

## What the client is allowed to decide

| Rule kind | Decided by | Where |
|---|---|---|
| `has-element`, `missing-element`, `count-min`, `count-exact`, `text-match`, `doc-text-match`, `attr-match`, `nested`, `labeled-inputs`, `no-placeholder-links`, `style-text-match` | The platform, recomputed from the stored draft | `platform/services/progress/src/verify-document.ts`, interpreter in `document-rules.ts` |
| `runs` | The platform, recomputed from a signed run receipt | `platform/services/progress/src/verify-runs.ts`, evaluator in `run-evidence.ts` |
| `computed-style`, `scripted` | **The client's own report** | `nexora-svelte/src/lib/checks.ts`, `evalRule` |
| Question answers | **The client's own report** | progress service comment, `routes.ts:202` |

`document-rules.ts` publishes exactly which kinds the platform can decide (`SERVER_DECIDABLE_KINDS`,
alongside `isServerDecidable`), and its interpreter returns `null` — not a guess — for the kinds it
does not own. The progress service filters a mission's checks through the same predicate
(`documentChecks` in `verify-document.ts`), so client and server cannot disagree about *which*
verdicts are the platform's.

Two properties hold everywhere in the engine:

- **Absent evidence fails closed.** No observation, no run, no receipt, no saved draft → not a pass.
  `checks.ts` returns `false` when the harness map or run map is missing; `verify-document.ts`
  refuses a mission with no stored draft; `verify-runs.ts` refuses when there is no receipt.
- **An empty assertion list is never a pass.** `evaluateAssertions` (`harness.ts`) and
  `evaluateRunAssertions` (`run-evidence.ts`) both start with `if (assertions.length === 0) return false;`
  A check that asserts nothing must never be able to complete a mission.

## Why the sandbox is opaque-origin

JavaScript missions run the learner's page in an iframe with `sandbox="allow-scripts"` and
**without** `allow-same-origin` (`Workspace.svelte`, the preview element). Scripts execute; the frame
gets an opaque origin and therefore cannot read the parent, touch its storage, or present a fake
same-origin identity.

The driver is appended to the learner's document last (`injectDriver`), so learner scripts load
first. The protocol is deliberately narrow:

- The parent posts one message shape, bound to a **per-run nonce** (`postHarnessRun`, `HARNESS_NS`).
- The parent ignores any reply whose origin is not `"null"` — an opaque frame reports exactly that.
- The reply is accepted only if it matches the namespace, the kind and the nonce
  (`isHarnessReply`).
- The frame returns **raw observations only**: DOM reads, return values, errors — sanitized to
  JSON-able values (`sanitize`, `RUN_OP_SOURCE`).
- Timeouts are owned parent-side (`HARNESS_TIMEOUT_MS`, 6000 ms) with a smaller driver-side cap on
  a single `wait` (`HARNESS_MAX_WAIT_MS`, 2000 ms).

The pass/fail decision is computed **parent-side** by `evaluateAssertions` over those raw
observations. The frame never says "passed".

None of that makes client-side assessment tamper-proof, and the code says so rather than implying
otherwise: a hostile page can spoof its own observations, exactly like any Codecademy-style client
check. The defence is proportionality — the driver accepts one shape, bound to one nonce — plus the
independent transfer challenge as the backstop for mastery, and server-side execution whenever the
stakes demand it. The harness is a teaching device, not an authority.

## The two server authorities

### Execution: a signed receipt, re-judged

The execution service signs what it observed. A receipt is `{ v, issuedAt, facts, sig }`, and the
signature is an HMAC-SHA256 over the facts (`signReceipt` / `verifyReceiptSignature`,
`platform/packages/service-kit/src/receipt.ts`). The key is **derived** from the mesh key with a
purpose string (`nexora/run-receipt/v1`, `receiptKey`) rather than being the mesh key: no new secret
to deploy, and one purpose cannot be replayed as another. Comparison is constant-time.

The progress service re-judges the check from those facts with the *same* evaluator the browser
uses — `run-evidence.ts` is vendored into the service by `npm run sync:curriculum`, so the two sides
cannot drift. It refuses, in the learner's own words, when:

- there is no receipt (`has no record of a run from this platform`);
- the signature is not one this platform issued;
- the run is older than 30 minutes (`RECEIPT_MAX_AGE_MS`; a forward clock skew of 60 s is tolerated);
- the run did not include the mission's own entry file (`entryPathFor`: `fileName` or `main.go`);
- the entry file's `sha256` differs from `codeSha256(draftCode)` of the draft the server holds;
- it ran, but the output does not satisfy the check's assertions.

That hash comparison is the load-bearing one. `codeSha256` normalizes CRLF line endings (a browser
and a container genuinely disagree there) and is otherwise byte-exact on purpose: if the learner
edited after running, the hashes must differ and the completion is refused until they run the code
they actually have. A receipt is a capability, not learner state — it is forwarded and spent, never
stored as progress and never handed back to a client.

### Runs are recorded, and a record is not a verdict

The facts inside a receipt are kept: `POST /missions/:id/runs` writes what was run, what it printed,
and when it died, so a learner who changes device can read their own attempts back
(`GET /missions/:id/runs`, newest first) and the IDE has transcripts to show. Two rules keep that
record honest, and neither of them turns it into evidence: a row is only written from a receipt this
platform signed, and the run must include the mission's own entry file.

Freshness is deliberately **not** one of those rules, where the completion path above does require
it. A completion is a claim about what the learner can do now, so an old receipt is no answer; a
history entry is a claim about what happened, so a run recorded an hour later is still a true record
of that run — and insisting on 30 minutes would lose exactly the attempts a learner made offline.
The record also stores whether the program that ran still matched the draft the service held
(`matchesSavedDraft`), which is the same comparison the completion path refuses on, made readable
instead of hidden.

`receipt_sig` identifies a record and never leaves the service: the same run offered twice — for two
checks, or after a retry — merges onto one row rather than duplicating facts, and a history read
returns a description rather than something that could be spent. Nothing in `mission_runs` marks a
check passed. Run history is durable; evidence is still recomputed.

### Documents: the same interpreter, a real parser

The progress service re-derives document checks from the draft it already stores for the mission,
using the identical vendored interpreter (`evalDocumentRule`) and the same construction the client
uses (`parseFromString(code, "text/html")`). The parser is jsdom — an implementation of the HTML
parsing spec — chosen because a lighter parser moved fragment content and a top-level `<style>`
between body and head, which made `doc-text-match` answer differently on the two sides. A verdict the
learner can see is correct must not depend on who parsed the file.

A refusal names the unmet requirement in the mission's own authored words (`verify-document.ts`
returns `check.feedback`; the reason is used verbatim in the `422`). A rule the interpreter cannot
evaluate also refuses rather than being skipped.

## Where it stops being sufficient

Two rule kinds are the client's word, and the code says why instead of pretending otherwise:

- **`computed-style` needs a rendering engine.** The browser answers it from a real cascade with real
  default styles. No server-side parser reproduces that faithfully, and guessing server-side would
  mean refusing work the learner can see is correct.
- **`scripted` needs a page to be driven** — clicks, input, reads. That is a browser-shaped job and it
  stays where the sandbox is.

The consequences, stated per mission (counted from the shipped content files, `missions-c.ts` and
`missions-d.ts`):

| Mission | Checks | Client-reported | Platform-decidable |
|---|---|---|---|
| `css-selectors` | 3 | 3 `computed-style` | **0** |
| `css-box-model` | 4 | 3 `computed-style` | 1 |
| `css-flexbox` | 4 | 3 `computed-style` | 1 |
| `css-grid` | 4 | 1 `computed-style` | 3 |
| `css-responsive` | 4 | 0 | 4 |
| `css-variables` | 4 | 0 | 4 |
| `css-debug` | 4 | 2 `computed-style` | 2 |
| `css-landing` | 11 | 2 `computed-style` | 9 |
| `js-counter` | 3 | 1 `scripted` | 2 |

Across the content set that is **14 `computed-style` rules and 1 `scripted` rule**. Two of these
missions are worth naming plainly: `css-selectors` is saved entirely on the client's report, and any
mission that mixes these kinds with decidable rules is *half-decided* rather than wholly trusted —
`css-landing` is 9 of 11, not 11 of 11.

Question answers travel the same way. The progress service says so itself (`routes.ts:202`): the
answers, `computed-style` and `scripted` remain the client's own report until there is a tier that can
reproduce them.

## What a headless-browser tier would change

It would move these two kinds from "the client's report" to "the platform's verdict" by giving the
server the equipment it currently lacks: a real cascade for `computed-style`, and a driven page for
`scripted`. Done properly, that is a *replacement* of authority, not a third authority:

- The same declarative rules and the same interpreter, so no new vocabulary appears.
- The same fail-closed rule: no page, no verdict — never a pass by default.
- Determinism has to be earned, not assumed: a driven page needs network stubs for anything that
  fetches, a clock it can trust, and a stated timeout, or the tier becomes a source of flaky
  refusals — which is worse than an honest "the client says so".
- Until then, this table is the limitation. It is a documented gap, not a licence to move more rules
  to the client.

## What a contributor may not do

1. **Never move a check from the server to the client for convenience.** If a rule needs equipment the
   platform lacks, either build the equipment or write the limitation here.
2. **Never special-case a mission id in the engine.** Rules are data; the engine interprets them
   generically, and a mission-specific branch is how the engine stops being auditable.
3. **Never weaken a check to make a mission pass**, and never delete a test (or an assertion in one) to
   get a green run.
4. **Never add hidden imperative test code to the client.** Checks stay declarative data interpreted
   by `checks.ts`.
5. **Never let the UI claim a verdict, a runtime, or a proof the engine did not produce.** If the work
   ran in the browser, say so; if a check could not be assessed, say that instead.
6. **Never treat a parser's answer as a cascade's answer.** A server verdict that contradicts what the
   learner can see on screen is a bug in the verdict, not in the learner.

## Not verified here

This document was written by reading the files it cites. The per-mission counts above were counted
from the shipped content files, not from a running suite. The `422` refusal status for document
checks and the exact quote in `routes.ts:202` are stated as the service states them in its own
comments; the route bodies were not re-read in full for this pass.
