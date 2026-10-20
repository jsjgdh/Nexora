# Running the platform locally, without Docker

This is the way to run the whole platform on a machine that has no Docker
daemon. It starts the databases, applies the migrations, starts the five
services, waits until each one is healthy, and stops them all when you stop it.

```bash
cd platform
npm install
npm run dev:stack
```

That is the whole command. It is safe to run twice: the second run reuses the
databases and the secrets, and the migrations are forward-only, so nothing is
applied twice.

The learner app is a separate process, because it has its own dependencies:

```bash
cd nexora-svelte
npm ci
npm run dev            # http://localhost:5173
```

`npm run dev:stack` writes `nexora-svelte/.env` for you, so the app leaves
local mode and `/auth` shows the sign-in form instead of the "cloud accounts
not connected" plate.

## What each address is

| Address | What it is |
|---|---|
| `http://127.0.0.1:8080` | the gateway, the only public surface. Everything a client calls goes through it. |
| `http://127.0.0.1:8101` | auth. Accounts, sessions, the device sign-in, the rights ledger. |
| `http://127.0.0.1:8102` | curriculum. The IDE manifest, the version, the phases. |
| `http://127.0.0.1:8104` | execution. Runs a learner's code. |
| `http://127.0.0.1:8106` | billing. Plans, checkout, the subscription. |
| `http://127.0.0.1:55432` | the auth database. |
| `http://127.0.0.1:55433` | the billing database. |
| `http://localhost:5173` | the learner app, when you start it yourself. |

The gateway answers CORS for exactly one origin, `http://localhost:5173`. If
you serve the app on another port, put that origin in `FRONTEND_URL` in
`platform/.env.local` and start the stack again.

## The database

The stack needs Postgres and this machine has no Postgres and no Docker, so
the database is [PGlite](https://pglite.dev): Postgres compiled to
WebAssembly, served over the Postgres wire protocol by a socket server. The
services are not changed by this in any way. They use the ordinary `pg`
driver, the ordinary `DATABASE_URL`, and the ordinary SQL, and the migrations
in `services/*/migrations/` are the same files the compose stack applies.

Two things are worth knowing about it:

- PGlite is one database per instance and cannot run `CREATE DATABASE`, so the
  auth database and the billing database are two instances on two ports. The
  isolation between them is the isolation the compose stack has.
- Queries inside one instance are serialized, so it is slower than a real
  Postgres. It is a development database, not a production one.

The data lives in `platform/.local/pg/`. Delete that directory, or run
`npm run dev:stack -- --reset-db`, to start from nothing.

## What is written where

Three things are written at run time, and all three are gitignored:

- `platform/.env.local` holds the environment the services run with. The two
  secrets in it, `AUTH_JWT_SECRET` and `INTERNAL_API_KEY`, are generated when
  the file is first written and never leave this machine. The mesh is
  authenticated: the services check each other's key, so `ALLOW_INSECURE_MESH`
  is not used and not needed.
- `nexora-svelte/.env` holds `PUBLIC_API_URL`, `GATEWAY_URL` and
  `PUBLIC_SITE_URL`, the three values that take the app out of local mode and
  tell the auth service where the site is served from.
- `platform/.local/pg/` holds the two databases.

Nothing in any of them is committed, and no secret is ever written into a
tracked file.

## Mail, and the two identity flows

The auth service can send mail through Resend, and a local run has no Resend
key, so no mail is sent. The request is still answered, the token is still
stored, and the service says so in its log:

```json
{"event":"mail.skipped","reason":"RESEND_API_KEY is not configured","to":"...","subject":"..."}
```

Outside production the service also writes the token it would have mailed to
the same log, so the flow can be finished with no mail provider at all:

```json
{"event":"auth.dev-token","purpose":"password_reset","to":"...","token":"...","url":"http://localhost:5173/auth/password-reset/confirm?token=..."}
```

That line is the local equivalent of an inbox. To walk a password reset by
hand:

```bash
curl -X POST http://127.0.0.1:8080/api/auth/password-reset/request \
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'
# 202 {"ok":true}, and the token is in the log line above
curl -X POST http://127.0.0.1:8080/api/auth/password-reset/confirm \
  -H 'content-type: application/json' -d '{"token":"...","newPassword":"a-long-new-password"}'
```

`POST /api/auth/verify-email/request` and `POST /api/auth/verify-email/confirm`
are the same shape for an unverified address.

`PUBLIC_SITE_URL` is what makes this work: the service builds the link
against it, and it refuses to issue a token when it is missing, because a
link pointing at a host that is not this product is a token in somebody else's
inbox. The local value is the origin the app is served from.

## Cohorts, and the licence an operator confirms

A cohort is a group of learners in one course, under one licence. The licence is
the operator's: an instructor creates a cohort and it sits in `pending`, which
entitles nobody. The operator confirms it, and the members of an active cohort
hold a seat in that course, and in no other course.

The confirmation is a command:

```bash
cd platform
npm run cohort:activate -- KQ7M-XR42 --seats 20
```

It needs the mesh key, which it reads from the environment or from the
gitignored `platform/.env.local` the local stack writes. The join code is the
one the instructor puts on a slide; the dash is display-only. The same
confirmation is available over the mesh for automation, at
`POST /internal/cohorts/activate` on the auth service, and there is no way to
reach it from the public surface.

A seat appears at the edge within the entitlement cache's TTL (30 seconds by
default), because the edge caches a verdict for that long and no longer.

## What the local run does not do

- The execution service runs learner code as a child process on this host,
  because there is no Docker daemon to put it in a container. That code can
  read this machine's environment. Do not point it at anything you care about.
- The stack runs with `NODE_ENV=development`, so error responses carry the
  field-level detail that a production deployment hides. The notice
  requirement is switched on anyway (`NEXORA_REQUIRE_CONSENT=1`), so a
  registration without the terms, the privacy notice and the age affirmation
  is refused here exactly as it is in production.
- Billing has no payment provider configured, so checkout answers 503 with a
  clear message and the plan and subscription reads still work.

## When something is not running

**A port is already in use.** Something else is on 8080 or on one of the
service ports. `netstat -ano | findstr 8080` finds the process, and the stack
will say which service it could not start.

**The learner app says "cloud accounts not connected".** Its `.env` is missing
or empty, or the dev server was started before the file existed. Run
`npm run dev:stack` once, then restart the app's dev server: the file is read
when the server starts.

**The learner app says the sign-in service did not answer.** The app's server
is calling `GATEWAY_URL` and cannot reach the gateway. Check that the stack
is up (`curl http://127.0.0.1:8080/health/live`) and that `GATEWAY_URL` in
`nexora-svelte/.env` is the gateway's address.

**A request comes back as "Mesh authentication failed" (403).** The services
do not agree on the mesh key. That happens when `platform/.env.local` was
edited while the stack was running. Stop the stack and start it again.

**The stack stops as soon as it starts.** Read the last lines it printed. The
usual cause is a service that refused to boot, and each one says which
variable it refused and why.

**A service died while the stack was running.** The stack stops the rest of it
and says which service went, so nothing is left half-running.

## Checking the stack

```bash
cd platform
npm run healthcheck          # asks the gateway, exit 0 healthy, 1 degraded, 2 no answer
```

To ask a running stack whether it is well, including the per-service checks
and the revocation state, read `http://127.0.0.1:8080/health/deep` directly.
