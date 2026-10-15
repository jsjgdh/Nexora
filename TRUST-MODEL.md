# The trust model

NEXORA claims skills, so every verdict has to name **who decided it**.

The short version: there is one way to learn — the desktop IDE — and two
places a verdict can come from. Work judged on the learner's own machine is
*practice*: the IDE's own checks, real and local, but the learner owns every
input, so the product calls it practiced, never proven. Work the platform
re-ran in its own sandbox and signed is *attested*: the only verdict a
stranger is asked to trust, verifiable at `/verify`.

## What the browser does not do

This site teaches nothing in the browser. There are no missions, no check
engine, no sandbox harness, and no visualizations here — the classroom routes,
the `missions-*` content, `checks.ts`, `harness.ts`, `runner.ts`, and the
`viz/` library were removed, and `scripts/verify.ts` fails if any route
reintroduces them. Any paragraph below, in any older copy of this document,
that describes a browser-decided rule kind (`computed-style`, `scripted`) or
a per-mission client-reported table describes a product that no longer exists.
The generator that wrote that table (`npm run trust:report`) is deleted with
it; nothing in this file is generated anymore.

## The two verdicts

### Practice: decided on the learner's machine, by the learner's machine

The IDE runs the course's own suites against the learner's files and records
the outcome with `local` provenance. Local work is not called worthless — it
is called the learner's own, which is what it is. The IDE never promotes a
local record by itself: there is no function in the extension that turns a
passing local run into an attested one, and the suite fails if any code path
besides the attestation client names that provenance.

### Attested: re-judged by the platform, then readable by a stranger

The extension submits a finished run — the check→test mapping, the source
files, the test command — to `POST /api/execute/attest` (authed,
quota-spending, like any other run). The execution service allowlists the
command to `node --test` over registered canonical suites, runs the
platform's own copies of those suites in its sandbox, judges the TAP names
with the same present-AND-passing rule the extension uses, and answers
`{ provenance: 'attested', outcome, checks }`. Three refusals keep it honest:
a learner-supplied file shadowing a canonical suite is rejected; a suite with
nothing registered answers 503 `attestation_unavailable` rather than a
verdict; and the submitted `localTap` is accepted and ignored — evidence here
is only what this service observed.

A receipt itself can be shown to a stranger without an account, two ways.
`POST /api/execute/verify` is public through the gateway and answers whether
this platform issued the receipt and whether it is still fresh, with the
decoded facts — and it names which signature verified. And a stranger can skip
the platform entirely: receipts carry an Ed25519 signature over the same bytes
as the HMAC, and `GET /api/execute/verify-key` publishes the key, so anyone
re-derives the verdict offline with nothing that mints. The HMAC remains for
mesh-internal checks and pre-migration receipts.

## Where it stops being sufficient

Verification still leans on the platform in two ways. Freshness is the
platform's word: an Ed25519 signature proves *what ran and when it claims to
have run*, not that the run is recent — backdating within the 30-minute window
is undetectable offline, so a stranger who cares about recency asks `/verify`.
And the published key is trusted on first sight: rotation is named by `keyId`,
but nothing here pins the key's history, so a key swap mid-dispute is a human
judgment, not a cryptographic one. The IDE's `attestation-gaps` suite fails
if anything claims more than this.

Two properties hold everywhere a verdict is produced:

- **Absent evidence fails closed.** No observation, no run, no receipt → not
  a pass. An empty assertion list is never a pass either.
- **A receipt is a capability, not learner state** — it is forwarded and
  spent, never stored as progress and never handed back to a client. Receipts
  carry a 30-minute freshness bound and are bound to the entry file's sha256,
  so editing after running refuses until the learner runs the code they
  actually have.

## What a contributor may not do

1. **Never move a check from the server to the client for convenience.** If a
   rule needs equipment the platform lacks, either build the equipment or
   write the limitation here.
2. **Never special-case a learner, a course, or a phase id in the engine.**
   Rules are data; the engine interprets them generically, and a special case
   is how the engine stops being auditable.
3. **Never weaken a check to make a course pass**, and never delete a test (or
   an assertion in one) to get a green run.
4. **Never let any surface claim a verdict, a runtime, or a proof the engine
   did not produce.** If the work ran on the learner's machine, say so; if a
   check could not be assessed, say that instead.
5. **Never reintroduce browser teaching through a side door.** A route, a
   component, or a content file that judges learning in the browser is the
   classroom returning, and the front-door suite fails on it by name.

## Not verified here

The platform services that vendored the old browser content
(`services/curriculum`, `services/progress`, `services/tutor`) still carry
those snapshots; removing the web-mission sync and the services' classroom
surface is a platform workstream of its own, recorded in the backlog — this
document does not claim it is done.
