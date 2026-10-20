# NEXORA production deployment — decided 2026-10-11, changed 2026-10-20

**Decision (2026-10-20): the GCP plan — Cloud Run for the five mesh
services, Vercel for the front door, Cloud SQL for the data — with one
VPS + `docker compose` kept as the fallback shape.** The runbook that
executes this decision is [infra/gcp/README.md](../infra/gcp/README.md),
with `plan.json` as its machine-readable form; this document keeps the
decision, the rules both shapes share, and the compose path unchanged.

Why it changed, in one paragraph: the 2026-10-11 decision below was
answered rather than overruled. Its first concern — a managed platform
would re-platform the thing that makes this product what it is, the
sandbox that runs learner code and signs what it observed — was met
afterwards by a plan that keeps the container model (one image, five
Cloud Run services, the runner intact wherever a Docker daemon exists)
and states its own gap plainly: no daemon there, so hosted `/execute`
runs work on the compose path until `runners/` exists in the execution
service. Its second concern — five managed services for scale nobody
has — still holds, and the bill is OPERATIONS.md §5. What changed is
who carries the machine: two people shipping a product should not also
carry kernel patches, TLS renewals, disk failure and intrusion noise,
and a managed plane is exactly the trade of money for attention. The
old revisit rule survives in spirit — capacity moves are decided with
numbers, and the scaling table in the runbook *is* those numbers. And
neither shape has ever been rehearsed: the first deploy is still a
drill, rollback included, whichever shape runs it.

The 2026-10-11 decision, kept for the record:

> **Decision: one VPS + `docker compose`.** Not a managed platform.
>
> Why, in one paragraph: the stack is already a compose file with
> production-shaped properties (per-service healthchecks, `restart:
> unless-stopped`, memory/CPU caps, Postgres unpublished, one gateway
> everything flows through). A managed platform would re-platform the
> thing that makes this product what it is — the sandbox that runs
> learner code and signs what it observed, so a completion can be
> re-judged instead of trusted — plus five databases, for scale we do
> not have. One host we control keeps the isolation story inspectable
> and the bill legible. Revisit when one host stops being enough
> (sustained CPU saturation on `execution`, or Postgres past comfortable
> single-volume size); that revisit is a capacity decision with numbers,
> not a fashion one.

## What the managed plane buys, and what it does not

The 2026-10-11 decision was a VPS. It was changed on 2026-10-20 because
the cost of a VPS is not the server — it is everything the server carries
with it, none of which is the product's actual work:

**The machine itself.** Kernel and package patching. Unattended upgrades
that are somebody's job. SSH hardening. A firewall. The intrusion noise —
the fail2ban class of thing, where a host on the internet is a host that is
being probed all day. Disk space, and the disk's own failure rate. The
Docker daemon itself, which is software you now maintain on every host,
not a thing the platform gives you.

**The data.** Postgres on your box means the backups are your backups, the
restore drills are your drills, and a disk failure is your problem rather
than a provider's disk having a bad afternoon. On Cloud SQL the engine
takes its own backups and its own point-in-time recovery, and the drill
below is a command rather than a promise.

**The edge.** TLS certificates are renewed for you (Caddy on a VPS, a
Google-managed certificate on the load balancer). A bare VPS gets very
little DDoS protection. The reverse proxy is configuration somebody
maintains.

**The 3am pager.** You are it. Everything the platform cannot do for
itself — a restart, a certificate, a disk — is a person, and the people
shipping this product have better uses for a night than a Postgres that
will not start.

What the managed plane does NOT buy, and this is the honest half:

- **The isolation story is unchanged.** The sandbox that runs learner code
  and signs what it observed is the same in both shapes. The plan keeps the
  container model — one image, five Cloud Run services, the runner intact
  wherever a Docker daemon exists — and states its own gap: there is no
  daemon on Cloud Run, so hosted `/execute` runs work on the compose path
  until `runners/` gains a runner that submits a job.
- **The bill is not free.** It is a different bill, with a different
  shape. The numbers are in OPERATIONS.md §5.
- **The first deploy is still a drill.** Neither shape has ever been
  rehearsed against a real host, and the rehearsal is where the plan
  becomes true.

## What production is

**On the GCP plan:** five Cloud Run services from one image (the gateway
the only public ingress; the other four internal, reachable only across
the mesh), one HTTPS load balancer on `api.nexora.dev`, Cloud SQL
without a public IP — authdb and billingdb, automated 03:00 backups
with point-in-time recovery and deletion protection — and Vercel in
front of the SvelteKit site. The order of operations, the scaling
table, the secrets table and the post-deploy verification live in
[infra/gcp/README.md](../infra/gcp/README.md); `plan.json` is that
shape as data, and `plan-check` refuses it drifting from this tree.

**On the compose path (the fallback):** the shape everything in this
repository was first built and tested against, still building with no
flags (the frontend's adapter is chosen by the environment), and what
the bullets below describe.

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

## The pipeline

Three workflows, and what each is for. The runbook below says what a deploy
is; these are the parts that do it, and that can be repeated.

### `verify.yml` — the gate

Runs on every push, pull request and nightly: the site's type check,
assertions, accessibility scan and UX sweep; the platform's build and suite;
and a nightly compose end-to-end that boots the whole mesh. **A release tag
runs it too**, and the deploy workflows wait for THAT run — so a tag cannot
ship a tree the suite has not passed.

### `deploy-platform.yml` — the mesh, to Google Cloud or to the fallback host

One workflow, two targets, because the fallback is a *target* and not a
second product: the same image, rolled the same way, verified the same way,
rolled back the same way.

- **gcp** (the decision of record): the plan is applied — the Cloud SQL
  instance with its backups and deletion protection, the Secret Manager
  entries, the five Cloud Run services (in two passes, because a Cloud Run URL
  carries a hash that does not exist until the service does), and the load
  balancer. The plan is `infra/gcp/plan.json` as data; `plan-check` refuses it
  drifting from this tree.
- **compose** (the fallback): the image is copied to one host and rolled with
  `docker compose pull && up -d`.

Then it **verifies itself, from outside**: `npm run healthcheck` and
`npm run synthetic` against the DEPLOYED platform. Those are the same
commands the operator runs, not a second set written for CI. And if either
failed, the previous image is rolled back — so a red deploy ends with the
platform on the last known-good image, and a human is paged by the fact that
the run failed at all.

It does not re-run the suite: it runs *after* `verify` has passed on that
exact commit, so there is exactly one gate and it cannot drift.

### `deploy-frontend.yml` — the site, to Vercel

The same gates the `verify` workflow runs, in the same order, and then the
deploy, and then a check that the site answers on the origin a learner will
use. The deploy is the last step, not the only one: with Vercel's own git
integration the site deploys whatever Vercel can build, and the gates become
advice. In a workflow, a red suite means the site is not deployed at all.

**One deploy path, not two.** A repository with a git integration AND this
workflow can deploy twice, from two places, to the same URL, and the second
one wins silently. If the Vercel project is connected to the repository,
disconnect it or turn this workflow's deploy off.

### A release

```sh
# in both repositories, with the SAME tag name — the platform's tag and the
# site's tag are separate objects, and the name is what links them
git tag platform-v0.1.0 && git push origin platform-v0.1.0
```

The tag runs `verify`; a green `verify` on that tag rolls the mesh and
deploys the site; a red one does neither, and says which suite failed.

### What the deploys need

| Secret | Used by | Why |
|---|---|---|
| `GITHUB_TOKEN` (the workflow's own) | the mesh | to push the image to GHCR |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | the site | to deploy |
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` | the mesh, compose target only | the fallback host, and a way in |
| `SYNTHETIC_EMAIL`, `SYNTHETIC_PASSWORD` | the mesh's post-deploy check | the canary account the journey check signs in with |

| Variable | Used by | Why |
|---|---|---|
| `HEALTHCHECK_URL` | the mesh's post-deploy check | the deployed edge |
| `SYNTHETIC_URL` | the mesh's post-deploy check | the deployed gateway |
| `SITE_URL` | the site's post-deploy check | the origin a learner will use |
| `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT` | the mesh, gcp target | Workload Identity Federation: a short-lived token, and no key in the repository and no key in a secret |

The Vercel project's own environment holds the site's runtime variables:
`PUBLIC_API_URL` (the browser's route to the gateway), `GATEWAY_URL` (the app
server's own route), `PUBLIC_SITE_URL` and `RESEND_API_KEY`. The two gateway
addresses are separate on purpose — inside a container `127.0.0.1` is the
container rather than the host, and getting it wrong fails sign-in alone,
with "the sign-in service did not answer", while every other page looks
healthy.

## Deploy procedure — compose (the fallback; the GCP runbook's order of operations is [infra/gcp/README.md](../infra/gcp/README.md))

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

On the GCP plan these are Secret Manager entries created by the deploy
(`nexora-internal-api-key`, `nexora-auth-jwt-secret`,
`nexora-db-password`, the receipt key, and the provider keys — the
runbook's secrets table), and the rules above travel with them: nothing
secret in an image, an image tag, the plan file (`plan-check` refuses
one written there) or a log — and placeholders still refused at boot,
because that check lives in the code and runs in every environment.

## Pricing

(The *product's* prices are below; the *infrastructure's* bill — Cloud
Run + Cloud SQL + Vercel against the one-VPS alternative — is
OPERATIONS.md §5.)

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

- No live rehearsal: neither shape has been run against a real project,
  including the rollback step. The first deploy is a drill with the team
  present, not a launch.
- Backups exist as commands and have never been proven against the
  engine (5.3): `npm run backup` dumps every table with a manifest and
  `npm run drill` restores them into a scratch schema (a silently lost
  row fails it), and the GCP plan configures automated 03:00 backups
  with point-in-time recovery — but the engine-level drill (restore the
  latest backup into a NEW instance, run `npm run drill -- --url=…`
  against it) is still owed, and is required before any learner data
  the team cannot afford to lose exists.
- No dashboards and no paging (5.2): the machinery exists — structured
  request-id logs across the mesh, fatal error reporting with an optional
  webhook, and the four commands below (health, synthetic, metrics,
  alerts) — but nothing yet turns any of them into a page, and no
  dashboard renders the numbers. The first deploy flies on `docker logs`,
  these commands, and whatever the operator wires them to. The gateway's
  `/health/deep` is the one that carries state worth alerting on. Its `status` goes `degraded` when a mesh
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

  What pages someone is `npm run monitor` (OPERATIONS.md §3): it runs
  both checks and emails on a state change — a fault that begins, and a
  fault that ends — through Resend. What is still missing is installing
  that cron, and anything beyond one host's crontab: no on-call
  rotation, and nothing outside this stack watching it. The GCP plan
  carries a 60-second uptime check on `/health/live` and budget alerts
  (`infra/gcp/plan.json`), but those watch reachability and spend, not
  what these commands judge.

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

  The third command reports the numbers the dashboards would be made of.
  `npm run metrics` (`scripts/metrics.mjs`) reads the two databases the
  platform already has — signups, live sessions, the proofs ledger,
  subscriptions, and the signup→first-attested-evidence funnel — as
  prose, or one object with `--json`, and prints the three numbers the
  platform genuinely cannot count (a first *local* run, execution
  failures by language, sync errors) as named gaps rather than as
  zeros. Exit `0` when the numbers were printed and `2` when the report
  could not be produced (auth database unset or silent); it reports and
  does not judge, so it has no `1`. A cron that archives one object per
  run gives the operator a series to read without a TSDB in the stack
  (`mkdir -p /var/log/nexora` first):

      56 * * * * cd /srv/nexora/platform && node scripts/metrics.mjs --json >> /var/log/nexora/metrics.jsonl

  The fourth command is a judge: `npm run alerts` (`scripts/alerts.mjs`)
  reads disk (statfs, counted as what a process can actually fill to),
  Postgres connections in use against `max_connections` on each
  configured database, and the execution queue depth through the
  gateway's own `/api/execute/capabilities` using the canary
  credentials. Exit `1` on a breach, `0` when every check it could ask
  is under threshold (skips are printed, never dropped), and `2` when
  nothing at all could be asked — an alarm that is blind must not look
  like an alarm that is calm. An unset database URL is a skip, because a
  deployment mid-setup is not a breach; a configured URL that will not
  answer is a breach, because a dead box does not get to pass its own
  alarm:

      */10 * * * * cd /srv/nexora/platform && node scripts/alerts.mjs

  Thresholds are flags (`--disk-warn=90`, `--db-warn=90`,
  `--queue-warn=5`); error-rate alerting is deliberately absent — the
  platform records no request outcomes to count, so a threshold on
  errors would be a number invented rather than read (the metrics
  report names the same gap). Like the healthcheck, `alerts` exits to a
  mailer or a monitor; the wiring is still the operator's.

  Fatal errors have a channel of their own. Every service writes one
  structured fatal line (`level` 60, service name, event, error) and
  exits `1` on an exception or rejection no request owns — and with
  `FATAL_WEBHOOK_URL` set in the environment, the same report is POSTed
  as JSON `{service, event, message, stack, at}` to any endpoint that
  takes JSON. The send is bounded at two seconds and the process dies
  whether or not it arrives: a report never keeps a crash alive. The web
  app reports in the same shape (`handleError` in `hooks.server.ts`: one
  JSON line on stderr with the URL, the message, a bounded stack), and
  answers the browser with the generic message — the API's own 500
  posture: detail goes to the log, not to a stranger.

  These commands belong to both shapes — the GCP plan above and the
  compose fallback — and the GCP plan's three differences are worth
  reading before 3am rather than during it:

  - **Logs do not live in `docker logs`.** Cloud Run writes stdout and
    stderr to Cloud Logging, and the plan sets 30 days of retention, so
    the request-id recipe above becomes
    `gcloud logging read 'jsonPayload.requestId="<id>"'` from any host
    with `gcloud`; the web app's `handleError` lines land in Vercel's
    runtime logs for the front door — a different console from the
    API's, and the reason the line carries `service: "web"`.
  - **`healthcheck` and `synthetic` only need the public endpoint:**
    `npm run healthcheck -- --url=https://api.nexora.dev` (or
    `HEALTHCHECK_URL=…`), same for synthetic. The monitor's cron runs
    from any host that has this repository and the environment set —
    the GCP runbook installs it exactly that way.
  - **`metrics` and `alerts` read the databases directly, and the
    plan's Cloud SQL has no public IP.** They must run where the Cloud
    SQL Auth Proxy reaches Postgres — the plan's sidecars serve the
    services, so an ops host runs its own proxy. Neither invents a
    number when the database is out of reach: `alerts` prints
    `not configured` skips for URLs it was not given (a configured URL
    that will not answer is a breach), and `metrics` refuses with exit
    2. A board that cannot read says so; it does not render green.
- Rate limiting and quotas are in-memory and single-instance (5.4) — true
  on one host by construction, and the reason the one-host decision and
  the Redis move are linked: leaving one host means moving limits to
  Redis first.
