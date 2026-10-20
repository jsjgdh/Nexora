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
- [ ] Quotas + limiter leave single-instance memory: rate limiter and
  per-account quotas move to Redis (or one gateway is declared and
  documented). Anonymous caps and a global breaker included. Edge hardening
  done while probing this: the limiter keys on `req.ip`, and the gateway
  trusted every proxy hop (`trustProxy: true`), so a caller could set their
  own `X-Forwarded-For` and rotate both caps away. Now opt-in via
  `TRUST_PROXY` (default 0, refuses a blanket `true`); a reverse proxy in
  front sets it to 1.
- [ ] Compile-time abuse bounds: `go build` CPU/wall limits, oversized
  sources rejected before any runner sees them.

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
- [ ] Deploy procedure rehearsed: build images (Go toolchain baked in, or
  every Go mission silently degrades), migrate, roll, verify, roll back —
  performed on purpose once, rollback included.
- [ ] Backups: automated Postgres dumps for all databases + a restore
  drill, not just a job. Forward-only reviewed migrations, run before
  dependent code.
- [ ] Observability: structured logs with request ids somewhere greppable;
  error reporting for web app + every service; per-service health plus a
  synthetic login→mission→run check; dashboards (signup→first run,
  completions, execution failures by language, sync errors); alerts (error
  rate, queue depth, connections, disk).
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
- [ ] Rubrics as data (which checks prove *demonstrated* vs *independent*)
  and provenance per mission (author, reviewer, source, licence) — the
  portfolio reads these, so they must exist where the portfolio reads.
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
