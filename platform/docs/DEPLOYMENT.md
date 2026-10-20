# NEXORA production deployment — decided 2026-10-11

**Decision: one VPS + `docker compose`.** Not a managed platform.

Why, in one paragraph: the stack is already a compose file with
production-shaped properties (per-service healthchecks, `restart:
unless-stopped`, memory/CPU caps, Postgres unpublished, one gateway
everything flows through). A managed platform would re-platform the thing
that makes this product what it is — the sandbox that runs learner code
and signs what it observed, so a completion can be re-judged instead of
trusted — plus five databases, for scale we do not have. One host we
control keeps the isolation story inspectable and the bill legible.
Revisit when one host stops being enough (sustained CPU saturation on
`execution`, or Postgres past comfortable single-volume size); that
revisit is a capacity decision with numbers, not a fashion one.

## What production is

- The `platform/docker-compose.yml` stack, unchanged in shape: postgres,
  auth, curriculum, execution, billing, gateway, frontend.
  Learner code runs in the `execution` service's own sandboxed runner —
  one container per job (`EXECUTION_RUNNER=docker`) — on the learner's
  machine when the course runs in the IDE, and here only when a run is hosted.
  The single-process tier (`subprocess`) is refused at boot in production:
  it runs the learner's program as a child of the very service that holds
  `INTERNAL_API_KEY` and `DATABASE_URL`, sharing its filesystem, network and
  process namespace, so a submitted program can read both (and that key also
  seeds the run-receipt signing key). Accept it with
  `EXECUTION_ALLOW_SUBPROCESS=1` only on a single-tenant host you control,
  and never on a host that also serves the public API.
- One reverse proxy in front, terminating TLS. Caddy is the default
  recommendation (automatic TLS, ~5 lines of config); anything that
  terminates TLS and forwards headers works. Only ports 80/443 are
  published on the host firewall — the compose-published 8080/3000 bind to
  loopback or move behind the proxy network, never to the open internet.
- The gateway is the only public API surface. `FRONTEND_URL` and
  `CLERK_AUTHORIZED_PARTIES` are set to the real origin — CORS is exact,
  never `*` (see `platform/.env.example`).
- The frontend needs **two** addresses for that gateway, because it has two
  callers: `PUBLIC_API_URL` is the browser's route to it (the published
  `127.0.0.1:8080`), and `GATEWAY_URL` is the app server's own route (`http://gateway:8080`
  on the compose network — inside the container, 127.0.0.1 is the container).
  `GATEWAY_URL` is what `/auth/session/*` uses to hold the learner's refresh
  token in an `HttpOnly` cookie. Get it wrong and sign-in alone fails, with
  "the sign-in service did not answer", while every other page looks healthy.

## Deploy procedure (zero-downtime-ish)

1. Build: `docker compose build` — including `SERVICE=execution`, so the
   Go toolchain and prewarmed std cache ship **in the deployed image**.
2. Migrate: run each service's forward-only migrations **before** the code
   that depends on them starts serving.
3. Roll: `docker compose up -d`, one service at a time in dependency
   order (postgres → services → gateway → frontend).
4. Verify: every service's `/health/live` answers, the gateway's
   `/health/deep` reports `ready` with every mesh check `ok` and
   `revocations.authService` not `unreachable` (see the note below), then
   the synthetic check — sign in, open a paid IDE phase through the
   gateway, run code, confirm a signed receipt verifies (the compose e2e
   journey is the script).
5. Rollback: previous images are kept tagged per deploy;
   `docker compose up -d` against the previous tag set, then verify again.
   Migrations are forward-only, so rollback never un-runs one — a deploy
   that needs a destructive migration is two deploys (expand, then
   contract), reviewed as such.

## Secrets

`AUTH_JWT_SECRET`, `INTERNAL_API_KEY` and `POSTGRES_PASSWORD` are generated
per environment and rotated away from every example value. No secret lives
in an image layer or in `git log` — `.env` is mounted, never baked. The
first two are validated at boot and the example placeholders are *rejected*,
so copying `.env.example` and starting the stack fails with a message naming
the variable instead of coming up with a secret that is published in the
repository.

The mesh key is required at boot in **every** environment, not only
production: a service or gateway that cannot authenticate its mesh refuses to
start rather than serve internal routes that trust a bare `x-user-id` header
from any caller. The only way past that is `ALLOW_INSECURE_MESH=1`, a
development opt-in that is itself refused when `NODE_ENV=production` — so
no value of `NODE_ENV` can open the mesh, and a compose file that forgets
the key line fails loudly instead of coming up unauthenticated. An environment that has ever run with a placeholder value must
rotate both; they cannot be un-leaked.

## Pricing

One plan, one number, printed by the front door: **Pro at $29 a month, or $290 a
year** (`nexora-svelte/src/lib/content/site.ts`, `PRICING`). The platform's own
plan configuration says the same thing, and the provider's dashboard has to be
configured to match before checkout is switched on.

`BILLING_PLANS_JSON` in `.env.example` holds the plan slugs and the provider
product ids, and the product ids in it are placeholders: a deployment that
merely copied the file can read the plans and cannot check out against Dodo.
Go-live is blocked until each `pdt_...PLACEHOLDER` is replaced with the real
product id from the dashboard, and until the dashboard's price for the monthly
product is $29 and for the annual product is $290. A checkout that charges a
different number than the front door printed is the one failure this
configuration exists to prevent.

Teams ($29 per learner per month, billed yearly, five learners or more) is
invoiced rather than sold through a checkout, so it has no provider product
and is deliberately absent from `BILLING_PLANS_JSON`.

## Honestly not done yet (see TODO.md Phase 5)

- No live rehearsal: this procedure has not been run against a real host,
  including the rollback step. The first deploy is a drill with the team
  present, not a launch.
- No automated backups and no restore drill (5.3) — required before any
  learner data the team cannot afford to lose exists.
- No observability: structured logs, error reporting, health dashboards
  and alerts (5.2) do not exist; the first deploy flies on `docker logs`
  and the health endpoints. The gateway's `/health/deep` is the one that
  carries state worth alerting on. Its `status` goes `degraded` when a mesh
  member is down *or* when the auth service has stopped answering the
  per-request revocation check, and its `revocations` block says which and
  how bad: `authService` (`reachable` / `unreachable` / `unknown` — the
  last means nothing has been asked yet, which is not a fault), `degraded`
  (true while requests are still flowing on a bounded stale answer),
  `outageMs`, `clearTtlMs`, and the counters (`asked`, `refused` split by
  the half of the denylist that decided, `unanswered`, `degraded`,
  `fromCache`). Alert on `status != "ready"`, and read
  `revocations.degraded: true` as "signed-out credentials may still be
  accepted for up to `clearTtlMs`". Only `authService: "unreachable"`
  fails the check: `unknown` means no token has been presented since boot,
  and `degraded` is the same outage reported by the field above it. Polling it performs no check of its
  own, so watching costs the auth service nothing. That poller is a
  command: `npm run healthcheck` (`scripts/healthcheck.mjs`), exit `0`
  healthy, `1` the edge reports a problem, `2` it could not get a health
  report — the reason goes to stderr, so this is all a crontab needs:

      * * * * * node /srv/nexora/platform/scripts/healthcheck.mjs --quiet

  What is still missing is anything that would *page* someone. The
  command has to be wired to a monitor, and there is no alerting system
  in this stack yet (5.2) — `docker logs` and these commands are the
  whole of production visibility.

  The second command walks what a learner walks. `npm run synthetic`
  (`scripts/synthetic.mjs`) signs in with a canary account, reads its
  identity back, fetches the curriculum manifest, fetches one phase
  body and runs one program, under the same three exit statuses — `0`
  the journey answered, `1` the platform said something is wrong, `2`
  the check could not ask. Credentials come from `SYNTHETIC_EMAIL` and
  `SYNTHETIC_PASSWORD`; the account is created once with
  `node scripts/synthetic.mjs --provision` and needs no subscription:
  the paywall's own 402 counts as the entitlement layers answering,
  and an entitled account gets a 200 and exercises the content path
  too. Run it on the hour, never on the minute — each run spends one
  of the account's `EXECUTION_DAILY_QUOTA` executions (200 a day by
  default, so hourly costs 24 of them), and a per-minute cadence would
  trip the quota by morning and page for a problem the check caused
  itself:

      0 * * * * SYNTHETIC_EMAIL=canary@example.com SYNTHETIC_PASSWORD=... \
                node /srv/nexora/platform/scripts/synthetic.mjs --quiet

  When a reply fails, the `x-request-id` on it is enough to find the
  whole request: the gateway mints that id, returns it, forwards it
  downstream, and each service keeps the id it was given instead of
  minting its own — so one incident is `docker logs <service> |
  grep <id>` per service, rather than an id per process to correlate
  by hand. A value that would not be safe as a log line (wrong shape,
  wrong length) is dropped for a fresh UUID rather than written out;
  the client-chosen-header spoof path is stripped at the gateway, as
  it always was.
- Rate limiting and quotas are in-memory and single-instance (5.4) — true
  on one host by construction, and the reason the one-host decision and
  the Redis move are linked: leaving one host means moving limits to
  Redis first.
