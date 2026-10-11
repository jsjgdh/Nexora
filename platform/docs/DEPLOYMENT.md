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
  auth, curriculum, progress, execution, tutor, billing, gateway, frontend.
  Learner code runs in the `execution` service's own sandboxed runners —
  the host toolchain (`EXECUTION_RUNNER=subprocess`) or one container per
  job (`docker`) — on the learner's machine when the course runs in the
  IDE, and here only when a run is hosted.
- One reverse proxy in front, terminating TLS. Caddy is the default
  recommendation (automatic TLS, ~5 lines of config); anything that
  terminates TLS and forwards headers works. Only ports 80/443 are
  published on the host firewall — the compose-published 8080/3000 bind to
  loopback or move behind the proxy network, never to the open internet.
- The gateway is the only public API surface. `FRONTEND_URL` and
  `CLERK_AUTHORIZED_PARTIES` are set to the real origin — CORS is exact,
  never `*` (see `platform/.env.example`).

## Deploy procedure (zero-downtime-ish)

1. Build: `docker compose build` — including `SERVICE=execution`, so the
   Go toolchain and prewarmed std cache ship **in the deployed image**.
   A deploy that skips the execution build silently degrades every Go
   mission to questions-only; the build step is the guard.
2. Migrate: run each service's forward-only migrations **before** the code
   that depends on them starts serving.
3. Roll: `docker compose up -d`, one service at a time in dependency
   order (postgres → services → gateway → frontend).
4. Verify: every service's `/health/live` answers, then the synthetic
   check — sign in, open a mission, run Go code, confirm a signed receipt
   lands in progress (the compose e2e journey is the script).
5. Rollback: previous images are kept tagged per deploy;
   `docker compose up -d` against the previous tag set, then verify again.
   Migrations are forward-only, so rollback never un-runs one — a deploy
   that needs a destructive migration is two deploys (expand, then
   contract), reviewed as such.

## Secrets

`AUTH_JWT_SECRET`, `INTERNAL_API_KEY` and `POSTGRES_PASSWORD` are generated
per environment and rotated away from every example value. No secret lives
in an image layer or in `git log` — `.env` is mounted, never baked.

## Honestly not done yet (see TODO.md Phase 5)

- No live rehearsal: this procedure has not been run against a real host,
  including the rollback step. The first deploy is a drill with the team
  present, not a launch.
- No automated backups and no restore drill (5.3) — required before any
  learner data the team cannot afford to lose exists.
- No observability: structured logs, error reporting, health dashboards
  and alerts (5.2) do not exist; the first deploy flies on `docker logs`
  and the health endpoints.
- Rate limiting and quotas are in-memory and single-instance (5.4) — true
  on one host by construction, and the reason the one-host decision and
  the Redis move are linked: leaving one host means moving limits to
  Redis first.
