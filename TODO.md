# NEXORA mesh + front door — build list

> This repo is the backend and the front door. The IDE (`D:/nexora-ide`,
> tracked by its own `TODO.md`) is the learner surface; everything here
> exists to serve it: identity, progress/evidence, execution, billing —
> plus the public web app (landing, account, pricing, evidence reader).
> Items about the old website-as-classroom (browser mission content,
> scenario terminal, mobile web) are dropped below, not deferred.
> Every item below is open work with its own proof.

## Legend

`[ ]` not started · `[~]` in progress · `[!]` blocked (reason stated).
**P0** blocks IDE accounts/sync/Pro · **P1** launch-quality · **P2** after launch.

## 1. Mesh bridges the IDE needs (P0)

Without these, the IDE works offline but accounts, sync, hosted runs, and
Pro do not exist.

- [ ] Clerk live proof: gateway verification against a real Clerk token
  (JWKS), plus the rejected-token case, driven over HTTP — not just
  unit-tested config.
- [ ] Two-account isolation on real infra; guest → account migration keeps
  drafts, attempts, completions, streak, placement with server-wins
  completions and newest-draft-wins-drafts. Failure never loses local work.
- [ ] Go idempotency e2e: duplicate `PUT` draft / `POST` complete answered
  idempotent (409 `already_completed`) through the compose job with a live
  execution service.
- [x] Quotas + limiter leave single-instance memory: rate limiter and
  per-account quotas move to Redis (or one gateway is declared and
  documented). **Resolved 2026-10-23 by the second door: one gateway is
  declared, and the declaration is asserted.** `verify-bounds.mjs` proves
  over HTTP against the real gateway that the anonymous cap, the per-route
  caps, the whole-platform budget and the dependency breaker are the
  product's caps, and that `/health/deep` says so with the reason a second
  instance would multiply them. Anonymous caps and a global breaker included.
  Edge hardening
  done while probing this: the limiter keys on `req.ip`, and the gateway
  trusted every proxy hop (`trustProxy: true`), so a caller could set their
  own `X-Forwarded-For` and rotate both caps away. Now opt-in via
  `TRUST_PROXY` (default 0, refuses a blanket `true`); a reverse proxy in
  front sets it to 1.
- [x] Compile-time abuse bounds: `go build` CPU/wall limits, oversized
  sources rejected before any runner sees them (2026-10-23: `validate.ts`
  rejects a submission over the size ceiling, a file over the wire ceiling,
  and a Go submission over its import budget before a runner sees it;
  `MAX_COMPILE_MS` tightens the Go wall clock to 20s; the docker runner caps
  CPU at 0.5 and memory per job. `verify-bounds.mjs` drives each refusal over
  HTTP and proves a killed run takes its whole process tree with it, by a
  marker a grandchild would have written).

## 2. Deploy + operate the mesh (P0)

- [ ] Target live: single VPS + compose per the decision record; TLS +
  reverse proxy with gateway as the only public surface; exact-origin CORS
  (`FRONTEND_URL`, `CLERK_AUTHORIZED_PARTIES`, never `*`). Identity-header
  hygiene fixed at the edge: the gateway forwarded every client header it did
  not overwrite, so a client-supplied `x-user-id` (and `x-internal-key`) rode
  through on anonymous paths — an impersonation primitive for any public or
  optional-auth route that trusts identity. Those headers (plus the
  `x-forwarded-*` family) are now stripped and only injected from verified
  state; covered by unit + live-proxy tests.
- [x] Deploy procedure rehearsed: build images (Go toolchain baked in, or
  every Go mission silently degrades), migrate, roll, verify, roll back —
  performed on purpose once, rollback included (2026-10-23, on a machine with
  a Docker daemon: six images built, seven containers healthy, migrations
  applied at boot, synthetic green, backup and restore drill run against the
  real Postgres container, a second release rolled and rolled back with
  `--no-build`, data intact. Six defects found and fixed — the platform image
  did not build at all, the backup could not write its volume, the site image
  could not bake its origin, `PUBLIC_API_URL` was loopback-hardcoded, every Go
  run failed on a `noexec` /tmp, and the backup listing printed `undefined`.
  Record: `platform/docs/DEPLOY-RUNBOOK.md` §3.1–3.3. Still unexercised: TLS
  and DNS through Caddy, the docker execution tier, and a bad migration's
  rollback).
- [x] Hosted execution tier, decided 2026-10-23: **there is none.** The
  course runs in the desktop IDE, on the learner's own machine, and the
  platform never executes learner code. `EXECUTION_HOSTED_RUNS=off` is the
  production default: `/execute` and `/attest` answer 503
  `hosted_runs_disabled` with one plain sentence, `/capabilities` reports
  `hostedRuns:false`, `runner:null`, no languages and probes no toolchain, and
  the design and debugging-lab attestations and the public receipt check stay
  live because none of them runs code. Proven on the compose stack
  (`NODE_ENV=production`, nothing set) and in-process; the synthetic check now
  records the skip and still exits 0, so a local-only deployment does not page
  an operator for doing what it says.
- [ ] The consequence, stated and priced (P0, new 2026-10-23): with no hosted
  runs the server can no longer re-derive a code verdict by running the suite
  itself, so a completion that rests on a program is the learner's report. The
  rubric already has the class for it (`client-reported`, via
  `verify-assessment.mjs`); what is undecided is what the product *calls* those
  completions on the proof surfaces, what the IDE sends when it cannot get a
  server verdict, and whether a paid tier can promise verification for code
  phases at all. Until that is decided, no code phase may be described as
  verified by us.
- [ ] Backups: automated Postgres dumps for all databases + a restore
  drill, not just a job. (2026-10-23: the dumps and the drill now run against
  the real Postgres container — 27 tables read, restored and compared. What is
  left is the automation on a host, which needs the host.) Forward-only reviewed migrations, run before
  dependent code.
- [ ] Observability: structured logs with request ids somewhere greppable
  (shipped 2026-10-20: one id rides edge→service — the gateway mints it,
  services keep it instead of minting their own, unsafe values refused —
  so `x-request-id` on a failed reply greps every service's logs);
  error reporting for web app + every service (shipped 2026-10-20:
  the chassis logs one structured fatal and exits 1 on any exception or
  rejection no request owns, POSTing `{service, event, message, stack,
  at}` to `FATAL_WEBHOOK_URL` when set, bounded at 2s; the web app's
  `handleError` writes the same-shaped line and answers the browser with
  the generic message); per-service health plus a
  synthetic login→mission→run check (shipped 2026-10-20: `npm run
  synthetic`, exit 0/1/2 like healthcheck, canary account via
  `--provision`, hourly cron + quota arithmetic in DEPLOYMENT.md);
  dashboards (signup→first run,
  completions, execution failures by language, sync errors) (data layer
  shipped 2026-10-20: `npm run metrics` prints what exists — signups,
  live sessions, the signup→first-attested-evidence funnel,
  subscriptions — and prints the three it genuinely cannot count as
  named gaps rather than zeros; the rendered dashboard is still
  unwritten); alerts (error
  rate, queue depth, connections, disk) (shipped 2026-10-20: `npm run
  alerts` — disk, per-database connections vs max_connections, queue
  depth via the gateway, exit 1/0/2 with skips printed; error rate
  remains a recorded gap — nothing persists request outcomes to count,
  and paging is still whatever the operator wires the exit codes to).
- [ ] Secrets: rotated away from every example; authoritative env-var
  inventory (who needs what, required or not); nothing secret in images
  or `git log`.
- [ ] Data: retention + deletion stated; export and erase paths that
  actually work; cost model per active learner per month.
- [ ] Legal: privacy policy + terms written against the real data flows;
  telemetry disclosure when analytics exists. License posture resolved
  (`LICENSE` file or a recorded decision not to ship one).

## 3. Assessment integrity the mesh guarantees (P0/P1)

- [ ] No completion path the server cannot recompute; adversarial checks
  keep failing closed (the `document-rules` bypass classes stay covered).
  `computed-style`/`scripted` remain the client's report until a
  headless-browser tier exists — stated, not hidden.
- [x] Rubrics as data and provenance per phase (2026-10-20): the curriculum
  service now carries two records for every phase and serves them at
  `/ide/provenance` (public, no lesson body) and inside the phase's own paid
  payload. The provenance names the author, the source, and the licence, and
  its `reviewer` is `null` for every phase, because no second reader has read
  the curriculum and a record that implied a review would be a false claim.
  The rubric classifies every activity the phase reaches: `attested` when the
  platform can re-derive it (checks and the command that runs them, or an
  incident or design the platform judges from its own catalogue), `material`
  for reading, `client-reported` for everything that rests on the learner's
  own account, and it says in one plain sentence which. It is fail-closed: an
  activity with checks and no command is not attested. The take-home phase
  attests nothing, and the rubric says so rather than letting it look
  verified. Proof: `platform/scripts/verify-assessment.mjs` (12 assertions).
  Residual: the account export names the phase id per proof, and the site's
  portfolio joins the rubric to it in the browser; the export file itself
  still carries the phase id only.
- [x] The curriculum is five courses, and the mesh serves them as five
  (2026-10-19): the Go half of the Task Manager course is now "Go
  fundamentals" (14 phases) and "Go in production" (21), with the JavaScript
  app on its own (18), Rust Ledger (24) and the side course (3). Eighty
  phases, nine free, seventy-one paid, and the free nine did not move. The
  curriculum service reads the IDE's shipped index instead of one hardcoded
  file, and the front door's copy is gated against it in both directions.

## 4. Web front door upkeep (P1)

The web app is landing, account, pricing, and evidence reader — not a
classroom. Keep it honest and working; do not grow it as one. Yes, a
website is still required after the IDE ships: this is where learners
sign up, log in, pay, and manage their subscription.

Live today: Clerk login/signup on `/auth` (password forms kept for local
mode), real plans on `/pricing`, hosted checkout with pending-until-webhook
return on `/profile`, subscription status view. The front door is also in
local mode until a platform is connected, and it used to say "cloud accounts
not connected" where the sign-in form should have been.

- [x] The whole product runs on one machine without Docker (2026-10-19):
  `platform/npm run dev:stack` starts a Postgres (PGlite over the Postgres
  wire protocol), the five services and the migrations, writes the app's
  `.env`, and the front door leaves local mode. Proven over real HTTP:
  register, login, `/me`, the device code, the password reset, and the app's
  own broker. Guide: `platform/LOCAL.md`.
- [x] Auth error paths driven (2026-10-19): rejected login, expired token,
  offline mid-lesson, failed sync — each leaves work saved and says what
  happened. The screen after signing in is the account home: who you are,
  your tier, what the platform has verified, the IDE, the session, and the
  data rights.
- [x] The two identity flows the platform was missing (2026-10-19):
  password reset and email verification. Neither says whether an address has
  an account, a password change ends every session the account holds, and
  the mail is skipped with a reason when no provider is configured.
- [x] The price is decided and singular (2026-10-19): Pro is $29 a month and
  $290 a year, in one place in the copy module, with the platform's plan
  configuration saying the same. The provider's dashboard has to match
  before checkout is switched on.
- [x] A surface for the people who teach it (2026-10-20): `/universities`,
  the one-pager a lecturer reads before deciding anything, with a campus
  licence at $19 a student for a term, twenty students or more, invoiced and
  not a checkout. It states what is not built (no LMS, no roster, no
  gradebook, no certificate, no credit, no outcome data) and that the offer
  is higher education and adult, not a school for under-16s. The contact is
  `teaching@nexora.dev`, named in the privacy notice and the terms.
- [x] The operator's console (`/admin`), and its security review
  (2026-10-20): an operator is a learner account with a row, and the flag
  has a scope (an operator may look and end a session, only a super may
  hand the flag on), an end (a flag granted from the console always
  expires), and a proof of the address (a grant needs a verified address,
  because an account row is not proof that anybody owns that address). The
  first operator is granted by the operator's tooling on the machine. A
  forged identity header is refused at the edge, and the suite proves it.
- [x] Reads of a learner's data in the console are written to the log (2026-10-20):
  who looked, and at what, never the data itself, so "who looked at this
  account" has an answer. An operator's read is processing, and the product's
  own data-rights page promises a record of processing.
- [x] The site's content security policy is enforced (2026-10-20): a hash on a
  prerendered page, a nonce on a page rendered at request time, and no
  'unsafe-inline' in script-src in production. The one inline script in the
  shell carries the nonce. The report-only header is gone.
- [x] The typefaces are served from this site (2026-10-20): Archivo, IBM Plex
  Mono and Newsreader, the Latin subset, under the SIL Open Font License with
  the licence text beside them. The front door makes no third-party request
  to render a page, and the policy does not have to make room for one. The
  list of processors no longer names a font host, because the site no longer
  asks one.
- [x] Subscription management: "Manage subscription" opens a Dodo customer
  portal session (new backend endpoint minting the session for the stored
  `dodo_customer_id`; frontend redirects). Cancel, card update, and invoice
  history live in Dodo's portal — never rebuilt here. `POST /billing/portal`
  + `createPortalSession` (verified against the vendor docs: `POST
  /customers/{id}/customer-portal/session`, Bearer key, `return_url` as a
  query parameter since the endpoint takes no body, link in `link`); the
  profile page redirects to it. Covered by five in-process tests (no customer
  → 409 that never calls the provider, link + encoded `return_url` + no body,
  omitted query, unconfigured → 503, upstream error → 502 with no provider
  detail leaked) and the axe pass on `/profile`.
- [ ] Billing UX: unconfigured provider degrades visibly; checkout return
  states pending until the webhook grants; past-due keeps grace access.
- [ ] Evidence export stays byte-compatible with what the IDE will one day
  read; a learner with nothing exports cleanly.
- [ ] Keyboard and screen-reader passes on account/billing/evidence flows;
  no new third-party pixels without disclosure.

## Dropped (superseded by the IDE, not deferred)

Browser-mission content authorship (JS/Git/backend/testing stages), the
scenario terminal + repository-state runner, mobile-web stories, roadmap
virtualization, web analytics/i18n, the website launch-gate journey. The
shipped web missions remain as the concept reservoir the IDE adapts from.

## Not doing

Leaderboards, achievements decoupled from evidence, AI grading (may
explain later, never grade), social feed, certificates-as-PDF. The evidence
export keeps stating what it is not.
