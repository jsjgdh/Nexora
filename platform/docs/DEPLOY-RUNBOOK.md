# NEXORA deploy runbook

The procedure for putting a release on the VPS, checking it, and taking it
back off. Every command is one an operator can run in order.

The deployment is one host with `docker compose`. The shape is decided in
[DEPLOYMENT.md](DEPLOYMENT.md); the posture is in
[docker-compose.production.yml](../docker-compose.production.yml); the edge is
in [caddy/Caddyfile](../caddy/Caddyfile); the variables are in
[ENVIRONMENT.md](ENVIRONMENT.md).

**What this runbook has and has not been through.** The compose path was
rehearsed on 2026-10-23 on a machine with a Docker daemon: six images built,
seven containers rolled healthy, the synthetic journey passed, the backup and
the restore drill ran against the real Postgres container, a second release was
rolled and then rolled back with `--no-build`, and the Caddyfile validated
under Caddy 2.10. Six defects were found and fixed doing it; the image did not
build at all before the first of them. The same day, the owner decided the
platform hosts no learner code, so the runner tier is no longer a deployment
question (`EXECUTION_HOSTED_RUNS=off`, finding 6). What is still unexercised is
TLS, DNS and Caddy itself in front of the stack, and the rollback of a bad
migration. Section 3 has the record, item by item.

---

## 0. The host, before anything else

This is the one-time setup. Nothing in it changes on a deploy.

### 0.1 The host

One machine, running Linux, with Docker Engine and the Compose plugin. The
sizing is in [COST-MODEL.md](COST-MODEL.md); the short version is 4 vCPU, 8 GB
of RAM and 80 GB of disk, which is the smallest plan that holds Postgres and
the six containers with the memory caps the compose override sets.

```bash
docker --version
docker compose version     # 2.24.4 or later: the override uses !override
```

### 0.2 The repository

```bash
sudo mkdir -p /srv/nexora
sudo chown "$USER" /srv/nexora
git clone <the repository> /srv/nexora/branchcraft
cd /srv/nexora/branchcraft
```

Every deploy is a checkout of a specific commit. The release id is the short
SHA of that commit, and it is what the images are tagged with.

### 0.3 The environment file

`platform/.env` is the only place the secrets live. It is gitignored and it
is never baked into an image.

```bash
cd /srv/nexora/branchcraft/platform
cp .env.example .env
chmod 600 .env
```

Then edit it. The values that must be changed before anything starts:

| Variable | What it must be |
|---|---|
| `AUTH_JWT_SECRET` | 32 or more random characters. The example value is refused at boot. |
| `INTERNAL_API_KEY` | 32 or more random characters. The example value is refused at boot. |
| `POSTGRES_PASSWORD` | something else. The example value is `nexora`. |
| `AUTH_DATABASE_URL` | the same host, with the new password: `postgres://nexora:<password>@postgres:5432/authdb` |
| `BILLING_DATABASE_URL` | the same, with `billingdb`. |
| `FRONTEND_URL` | the site's exact origin, for example `https://nexora.dev`. Not the API host. |
| `TRUST_PROXY` | `1`. Exactly one proxy (Caddy) is in front of the gateway. With `0` every request is keyed on the docker bridge address and the whole platform shares one rate-limit bucket. |
| `PUBLIC_SITE_URL` | the site's exact origin. The auth service builds the links in its mail against it, and compose passes it to the site image as a build argument, because `/sitemap.xml` and `/robots.txt` are prerendered and bake it. |
| `PUBLIC_API_URL` | the browser's route to the gateway: `https://api.<domain>`, the API host. Compose passes it into the site container as a runtime value. It is **not** the same as `GATEWAY_URL` (the container's own route over the compose network), and setting it to a loopback address makes every visitor's browser call its own machine. |
| `EXECUTION_HOSTED_RUNS` | `off`. This deployment runs no learner code: the course runs in the IDE, on the learner's machine. The execution service answers `/execute` and `/attest` with 503 `hosted_runs_disabled` and keeps serving the design/debugging-lab attestations and the receipt check, which execute nothing. |
| `EXECUTION_RUNNER` | inert while hosted runs are off. If they are ever switched on, `docker` is the only tier fit for a host that serves the public API; `subprocess` is refused at boot in production unless `EXECUTION_ALLOW_SUBPROCESS=1` is also set, which is only for a single-tenant host that does not answer the public. |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`ENVIRONMENT.md` has the full list, and section 8 of it has the rotation
procedure for a `.env` that has travelled between machines.

### 0.4 The site's environment file

`nexora-svelte/.env` is the site's own file, and it is only read when the site
is built or run **outside** compose (`npm run dev`, `npm run build` on the
host). The compose build takes `PUBLIC_SITE_URL` and the other `PUBLIC_*`
values from `platform/.env` as build arguments, and the container takes
`PUBLIC_API_URL` and `GATEWAY_URL` from its service environment —
`.dockerignore` keeps this file out of the image on purpose, because it can
hold the site's server-side keys. Write it anyway, for the host-side builds:

```bash
cd /srv/nexora/branchcraft/nexora-svelte
cat > .env <<EOF
PUBLIC_API_URL=https://api.nexora.dev
GATEWAY_URL=http://gateway:8080
PUBLIC_SITE_URL=https://nexora.dev
EOF
chmod 600 .env
```

`PUBLIC_API_URL` is the browser's route to the gateway, so it is the API
host. `GATEWAY_URL` is the app server's own route, over the compose network.
The two are different addresses and they have to be set to the right ones:
a wrong `GATEWAY_URL` looks like sign-in failing with "the sign-in service
did not answer" while every other page looks healthy.

**The `PUBLIC_` values are needed where the build runs, not only where the
server runs.** `/sitemap.xml`, `/robots.txt` and the mission pages are
prerendered, so they bake the value that was present at build time. Set them
in the environment before `docker compose build`, not after.

### 0.5 DNS

Two A records, or two CNAMEs, pointing at the host's public address:

```
nexora.dev        ->  the host
api.nexora.dev    ->  the host
```

Caddy obtains the certificate for both with the HTTP-01 challenge, so port 80
has to reach the host.

### 0.6 The firewall

Open: 22, 80, 443. Nothing else. The compose override binds the gateway and
the frontend to `127.0.0.1`, and Postgres to nothing at all, so the only
route into the platform is Caddy.

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 0.7 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Caddy 2.10.0 or later, for the `request_body` directive.

The environment Caddy reads, in its own file, because Caddy does not read a
`.env` file:

```bash
sudo install -d -m 0755 /etc/caddy
sudo tee /etc/caddy/nexora.env >/dev/null <<EOF
API_HOST=api.nexora.dev
SITE_HOST=nexora.dev
FRONTEND_URL=https://nexora.dev
ACME_EMAIL=ops@example.com
EOF
sudo chmod 0600 /etc/caddy/nexora.env
```

`FRONTEND_URL` here must be the same value as `FRONTEND_URL` in
`platform/.env`. The gateway and the edge both enforce it, and they have to
enforce the same one.

The Caddyfile:

```bash
sudo cp /srv/nexora/branchcraft/platform/caddy/Caddyfile /etc/caddy/Caddyfile
```

The systemd unit, so Caddy reads the environment file:

```bash
sudo tee /etc/systemd/system/caddy.service.d/nexora.conf >/dev/null <<'EOF'
[Service]
EnvironmentFile=/etc/caddy/nexora.env
EOF
sudo systemctl daemon-reload
```

Check the configuration before letting it near the host:

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

That command parses the Caddyfile and prints the JSON it would load. It does
not make a request. The check for a missing variable is in the file itself:

```bash
grep -c IS_NOT_SET /etc/caddy/Caddyfile    # 2, and both are the documented defaults
```

---

## 1. The deploy

Six steps, in this order. The order is the point: the backup is taken before
the migration, and the migration is applied before the code that depends on it
serves a request.

Set the release id first. Everything downstream of it is named after it.

```bash
cd /srv/nexora/branchcraft
git fetch --all
git checkout <the commit or tag to deploy>
export NEXORA_RELEASE=$(git rev-parse --short HEAD)
echo "deploying $NEXORA_RELEASE"
```

### Step 1: build the images

```bash
cd /srv/nexora/branchcraft
export NEXORA_RELEASE=$(git rev-parse --short HEAD)
docker compose -f platform/docker-compose.yml -f platform/docker-compose.production.yml build
```

This builds six images: the five platform services (the build argument
`SERVICE` selects the entrypoint) and the SvelteKit frontend. The execution
image is the one that carries the Go toolchain and the prewarmed standard
library cache, so it is the slow one.

`SERVICE=execution` is what the compose file passes for the execution
service. If that image is not rebuilt, a learner's first Go program pays for
a cold standard-library compile.

**`VERCEL` must not be set in the build environment.** The site's
`svelte.config.js` reads it to choose the adapter, and a build with it set
produces Vercel's own output instead of the standalone `build/` directory the
container runs. On the VPS it is unset; if the build runs in a Vercel
environment, the site is being built for Vercel and not for this host.

Check what was built before rolling it:

```bash
docker image ls "nexora/*" | grep "$NEXORA_RELEASE"
```

### Step 2: take a backup

```bash
cd /srv/nexora/branchcraft/platform
docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm backup
```

That runs the platform's own backup command against both databases and writes
the dumps into the `backups` named volume. It prints one line per database
with the table count and the row count.

The dumps are only useful if they are off the host. Copy them out on the
operator's own schedule, and do not skip it because the volume is still
there: a backup that only exists on the machine it protects is not a backup.

```bash
docker run --rm -v nexora_backups:/backups -v "$PWD":/out alpine \
  tar czf /out/nexora-backups-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /backups .
```

(The volume name carries the compose project prefix. Read the real one with
`docker volume ls`.)

Then the drill, which is the half of "we have backups" that is almost never
done. It reads every table, writes the rows out, puts them back into a
scratch schema, compares what came back with what went out, and drops the
scratch schema:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm drill
```

It exits 0 when the rows came back the same. It exits 1 when they did not,
and 2 when it could not run. A drill that has not been run is a hypothesis.

### Step 3: apply the forward-only migrations

The platform has no separate migration command. The auth service and the
billing service each apply their own migrations at boot, inside a
transaction, before they listen: `migrate()` in `service-kit` reads
`schema_migrations`, applies the `*.sql` files that are not listed there, in
file-name order, one transaction each. A migration that has been applied is
never un-applied.

The way to apply them ahead of the roll is to start the new service first and
let it do it:

```bash
cd /srv/nexora/branchcraft/platform
export NEXORA_RELEASE=$(git rev-parse --short HEAD)
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d auth billing
```

Wait for them to be healthy, and then look at what was applied:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps auth billing
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T postgres \
  psql -U nexora -d authdb -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
```

The auth service logs one line when it applies anything:

```
{"level":30,"service":"auth","applied":["012_progress"],"msg":"migrations applied"}
```

**This step is only safe if the migration is an expand.** The old code is
still running against the new schema while the new code is rolled, so a
migration that renames a column, drops one, or changes a type breaks the old
code, and the rollback does not bring the schema back. A destructive change is
two deploys: expand, then contract, with the contract in a later release once
the expand has been live.

### Step 4: roll

```bash
cd /srv/nexora/branchcraft/platform
export NEXORA_RELEASE=$(git rev-parse --short HEAD)
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Compose recreates every container whose image changed, and it does so in
dependency order, because the compose file's `depends_on` conditions are
`service_healthy`. Postgres, then the four services, then the gateway, then
the frontend. Each service waits for the one it depends on to be healthy.

There is no way to roll one service and leave the rest alone, and that is on
purpose: a half-rolled stack is a stack where the gateway is talking to a
service with a different contract.

### Step 5: verify

Five checks, in this order. The first three are cheap and the last two are
the ones that catch a deployment that boots green and cannot serve a lesson.

**5a. Every container is up and healthy.**

```bash
cd /srv/nexora/branchcraft/platform
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
```

Every line should say `healthy`. A service that is `running` but not
`healthy` is a service whose health check is failing, and that is the thing
to look at.

**5b. The edge answers.**

```bash
curl -fsS http://127.0.0.1:8080/health/live
curl -fsS http://127.0.0.1:8080/health/deep
```

`/health/deep` must report `"status":"ready"`, every entry in `checks` must
be `"ok":true`, and `revocations.authService` must not be `unreachable`.
`unknown` is not a fault: it means no token has been presented since boot, so
nothing has been asked yet.

**5c. The health command, which is the one a cron will run.**

```bash
cd /srv/nexora/branchcraft/platform
npm run healthcheck
```

Exit 0 healthy, 1 the edge says something is wrong, 2 the check could not
ask. A crontab wants the exit status, not the prose.

**5d. The synthetic check, which is the journey a learner walks.**

```bash
cd /srv/nexora/branchcraft/platform
SYNTHETIC_EMAIL=canary@example.com SYNTHETIC_PASSWORD='<the password>' npm run synthetic
```

It signs in, reads the identity back, fetches the curriculum manifest, fetches
one phase body, and then asks the execution service what its posture is. A
deployment that hosts runs (`EXECUTION_HOSTED_RUNS=on`) gets a program run and
checked against its marker; the production default (`off`) records
`run (skipped — this deployment hosts no learner code)` and still exits 0,
because a platform that runs no code is the product, not a fault. The exit
statuses are 0, 1 and 2, the same as the health check's — and the skip is 0
by construction, while a deployment that *claims* hosted runs and cannot run
them is still 1.

The canary account is created once:

```bash
cd /srv/nexora/branchcraft/platform
SYNTHETIC_EMAIL=canary@example.com SYNTHETIC_PASSWORD='<the password>' \
  node scripts/synthetic.mjs --provision
```

It needs no subscription. The paywall's own 402 counts as the entitlement
layers answering, and an entitled account gets a 200 and exercises the content
path too.

**5e. The site, through the edge, over TLS.**

```bash
curl -fsSI https://api.nexora.dev/health/live
curl -fsSI https://nexora.dev/
```

And the CORS set, which is worth checking on every deploy because a
misconfigured origin looks like a broken site rather than a broken edge:

```bash
curl -sI -H "Origin: https://nexora.dev" https://api.nexora.dev/api/curriculum/ide/manifest \
  | grep -i "access-control"
```

There must be exactly one `Access-Control-Allow-Origin` and it must be
`https://nexora.dev`. Two of them is a browser error. The response must also
carry `Access-Control-Expose-Headers` naming `X-Request-Id`,
`X-Execution-Daily-Remaining` and `Retry-After`, because a browser hides a
header from the page unless the page is told it may read it.

And the security headers, on both hosts:

```bash
curl -sI https://api.nexora.dev/health/live | grep -i "strict-transport\|content-security\|x-content-type\|x-frame"
curl -sI https://nexora.dev/ | grep -i "strict-transport\|content-security\|x-content-type\|x-frame"
```

The API host carries the edge's own policy. The site carries the one the site
builds: SvelteKit's `kit.csp` configuration, enforced, with a hash on a
prerendered page and a nonce on a page rendered at request time. There must
be exactly one `Content-Security-Policy` header on each, because two
policies intersect and the stricter one wins.

**5f. The logs.**

```bash
cd /srv/nexora/branchcraft/platform
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail=50 gateway auth
```

A `migrations applied` line with an empty `applied` array means nothing was
applied, which is correct on a redeploy of the same code.

### Step 6: the edge

If the Caddyfile changed, reload it. The certificate is obtained and renewed
by Caddy itself.

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl -fsSI https://api.nexora.dev/health/live
```

---

## 2. Rolling back

Two different failures, two different paths. The first is a bad image. The
second is a bad migration, and it is the harder one.

### 2.1 A bad image

The images are tagged with the release id, so the previous one is still on the
host and rolling back is a change of one variable.

```bash
cd /srv/nexora/branchcraft/platform
export NEXORA_RELEASE=<the previous release id>
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-build
```

`--no-build` matters. Without it, compose would rebuild the image for the
previous tag from the current source, which is not the previous image at all.

Then verify again, steps 5a to 5f. The rollback is not finished until the
checks have been run again.

Two things to know before you need this:

- The previous image has to still be on the host. `docker image prune` removes
  the untagged and the unused images, and a previous release is unused. Do not
  prune between a deploy and the point where the deploy is known good.
- If the previous release id is not on the host, the rollback is a rebuild
  from the previous commit, which is a different thing:
  ```bash
  cd /srv/nexora/branchcraft
  git checkout <the previous commit>
  export NEXORA_RELEASE=$(git rev-parse --short HEAD)
  docker compose -f platform/docker-compose.yml -f platform/docker-compose.production.yml build
  docker compose -f platform/docker-compose.yml -f platform/docker-compose.production.yml up -d
  ```

### 2.2 A bad migration

**A migration is not rolled back.** The platform's migrations are forward-only:
`migrate()` applies what has not been applied and never un-applies anything.
That is a deliberate decision, and it means the question "how do I undo the
migration" has no direct answer. There are three paths, and which one applies
depends on what the migration did.

**Path A: the migration is an expand and the new code is what is broken.**
Roll the image back to 2.1. The schema stays expanded, the old code keeps
working against it, and nothing is lost. This is the common case, and it is
the case the expand/contract discipline exists for.

**Path B: the migration is destructive or the data is wrong.** The schema, or
the data, has to be put back from the backup taken in step 2. The restore
truncates each table and puts the rows back, so the database is back to the
state the backup was taken at:

```bash
cd /srv/nexora/branchcraft/platform
export NEXORA_RELEASE=<the release to roll back to>
docker run --rm \
  -v nexora_backups:/backups \
  --network nexora_default \
  -e AUTH_DATABASE_URL \
  --entrypoint sh nexora/gateway:<the release id> -c \
  'node scripts/backup.mjs --restore=/backups/<the dump file> --url="$AUTH_DATABASE_URL"'
```

The same command against `BILLING_DATABASE_URL` for the billing database.
The volume name and the network name carry the compose project prefix; read
the real ones with `docker volume ls` and `docker network ls`.

**Everything written between the backup and the restore is lost.** The backup
in step 2 is the boundary, and the window between it and the restore is the
exposure. That window is the reason the backup is taken immediately before
the roll and not on a nightly schedule.

After a restore, the schema is the one the migrations left in place, so a
restore into a database whose schema has moved on is a restore into the wrong
shape. The platform's own answer to that is "migrate, then load": restore
into a database at the schema the backup was taken at, and let the service's
migrations bring it forward.

**Path C: the migration can be corrected forward.** Write a new migration that
undoes the effect of the bad one, and deploy it. This is the right answer
when the damage is known and the correction is expressible as SQL. It is
also the only path that does not involve losing data.

### 2.3 A bad deploy of anything else

If the site is wrong, roll the frontend alone. It has no database and no
migration, so it is the easiest thing to put back:

```bash
cd /srv/nexora/branchcraft/platform
export NEXORA_RELEASE=<the previous release id>
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-build frontend
```

---

## 3. The rehearsal record

### 3.1 Rehearsal of 2026-10-23: the compose path, for real

Windows 11, Docker Desktop 29.8.2 (overlayfs), Compose v5.5.1, Node 22.19.
The tree was a `git archive` export of `5563e22` into a scratch directory, so
the working tree and its `.env` were not touched, and `.env` files were written
fresh: generated `AUTH_JWT_SECRET` / `INTERNAL_API_KEY` / `POSTGRES_PASSWORD`,
`AUTH_MODE=local`, `TRUST_PROXY=0` (no Caddy in this loop), and
`EXECUTION_RUNNER=subprocess` with `EXECUTION_ALLOW_SUBPROCESS=1` — the
`docker` tier needs the socket this file deliberately does not mount (see
§3.2, finding 6). The stack ran under its own compose project
(`nexa-rehearsal`) so it created its own volumes; an existing `platform_pgdata`
volume from earlier work carries a different password, and reusing the default
project name made auth fail with `28P01` for exactly that reason.

| Step | Command | Result |
|---|---|---|
| 1 | `compose build` | **failed first** (finding 1), then six images tagged `5563e22` |
| 4 | `up -d` | seven containers, health-ordered, every one `healthy` |
| 5b | `/health/live`, `/health/deep` | `ready`, 6/6 mesh checks ok; `revocations` `unknown` at boot, `reachable` after a token |
| 5c | `npm run healthcheck` | exit 0, "reports ready (6/6 mesh checks ok)" |
| 5d | `synthetic --provision`, then `synthetic` | exit 0: sign-in, identity, manifest (`task-manager`, 18 phases), phase (402 entitlement), run (exit 0 in 27ms). After the local-only decision the same stack records the skip instead and still exits 0 |
| — | Go through `/api/execute/execute` | **failed first** (finding 5), then `hello from go`, exit 0 in 189ms — the prewarmed `/opt/gocache` volume works |
| 2 | `compose run --rm backup` | **failed first** (finding 2), then 27 tables / 22 rows (auth), 4 tables / 1 row (billing) |
| 2 | `compose run --rm drill` | passed: 27 tables read, restored into a scratch schema and compared |
| 4 | second release `deadbee1` built and rolled | 7/7 healthy on the new tag |
| 2.1 | rollback: `NEXORA_RELEASE=5563e22 up -d --no-build` | 7/7 healthy on the old tag; synthetic passed again; the canary account and the dumps survived |
| 6 | `caddy validate` (caddy:2.10, documented env) | `Valid configuration` (this Docker image was not the host install, and no request went through it) |
| 5e | CORS at the gateway | exact origin echoed, foreign origin gets no `Access-Control-Allow-Origin`, `X-Request-Id` + `X-Execution-Daily-Remaining` exposed |
| — | broker sign-in on the site | same-origin 200 with an HttpOnly refresh cookie, foreign Origin 403 |

**On the plain-http 403.** The site's session broker compares `Origin` against
`url.origin`, and adapter-node assumes `https` unless `PROTOCOL_HEADER` is set.
So over loopback http a *correct* Origin still gets 403, and the value that
passes is `https://<host>`. Behind the TLS proxy the browser's Origin is
`https://<host>` and the guard matches. This is the guard working; do not
loosen it to make a loopback test pass.

### 3.2 The six findings

1. **The platform image did not build.** `RUN npm run build` used the root
   script, which also builds `@nexora/gcp-plan` under `infra/` — a workspace the
   Dockerfile does not copy. `No workspaces found`, no image at all. Fixed: the
   Dockerfile builds the seven workspaces it ships, by name.
2. **The backup could not write its own volume.** `EACCES` on
   `/backups/backup-…json.gz`: the job runs as `app`, and a fresh named volume
   is root-owned. Fixed in the image (`/backups` created and owned by `app`, so
   Docker's first-use copy gives the volume that ownership).
3. **The site image could not bake its public origin.** `.dockerignore`
   excludes `.env`, and the Dockerfile took no build arguments, so
   `/sitemap.xml` and `/robots.txt` (both prerendered) could only ever embed the
   local-mode fallback. A production image would advertise `localhost:5173`.
   Fixed: four `PUBLIC_*` build args, passed by compose from the platform's
   `.env` (they are public by definition).
4. **`PUBLIC_API_URL` was hardcoded to `http://127.0.0.1:8080`** in the
   frontend service. In a deployment every visitor's browser would call its own
   machine. Fixed: read from `.env` with the loopback value as the default;
   same for `GATEWAY_URL`.
5. **Every Go run failed** with `fork/exec /tmp/go-build…/main: permission
   denied` while the build itself succeeded. Docker mounts a tmpfs `noexec` by
   default, and `go run` compiles to a binary and executes it. Node programs
   passed, which is why the synthetic check was green before this was found.
   Fixed: `exec` on the execution service's `/tmp` (the docker runner already
   passes it for Go; the compose file did not).
6. **Hosted runs had no tier on this stack — resolved the same day: there is
   none.** `DEPLOYMENT.md` said `EXECUTION_RUNNER=docker`; the compose file
   deliberately does not mount `/var/run/docker.sock`, and the `go-runner`
   image is not built by compose either, so every timed run answered 503 while
   `subprocess` was refused at boot in production for a documented reason. The
   owner's decision is that the platform hosts no learner code at all: the
   course runs in the IDE, on the learner's machine.

   `EXECUTION_HOSTED_RUNS` now carries that posture. It is `off` by default in
   production and `on` in development (so the runner suites keep proving the
   runner), `/execute` and `/attest` answer 503 `hosted_runs_disabled` with one
   sentence, `/capabilities` reports `hostedRuns:false` and probes no
   toolchain, and the routes that run no code — the design and debugging-lab
   attestations, and the public receipt check — are untouched. Verified on this
   stack by redeploying the execution image with `NODE_ENV=production` and
   nothing set: the service logged `hosted runs are off`, `/execute` answered
   503, `/attest/design` still answered (400 for an empty body, which is it
   parsing rather than refusing), and `npm run synthetic` printed
   `run (skipped — this deployment hosts no learner code)` and exited 0.

Also carried over from the 2026-10-20 record and now fixed: `npm run backup --
--list` printed `undefined` for the time and both counts (it read
`entry.takenAt`/`entry.tables`/`entry.rows`, while the manifest is one level
down and holds per-table counts). `formatDumpLine` now builds the line from the
manifest, a dump with an unreadable manifest says so, and `verify-backup.mjs`
asserts the line contains no `undefined`.

### 3.3 What this rehearsal still did not cover

- **TLS, ACME, DNS, Caddy running.** The Caddyfile validated; no request went
  through it and no certificate was issued. Host networking, the systemd unit
  and the firewall were not exercised on this machine.
- **The `docker` execution tier** — finding 6.
- **A bad migration's rollback.** No migration was applied to a database that
  already held the previous release's rows, and no restore-from-dump into a
  live database was performed (the drill uses a scratch schema).
- **Capacity, key rotation, erasure, sign-out.** All four remain open, as §4
  says.
- **The host, not the containers.** Read-only roots, dropped capabilities,
  tmpfs and the health-ordered roll were exercised; the target OS, disk layout,
  cron and Caddy install were not.

**Rehearsal of 2026-10-20, on the machine this runbook was written on.**
Windows, Node 22.19. The Docker CLI was present and there was no Docker
daemon, no VPS, no DNS and no Caddy.

### 3.4 What the 2026-10-20 rehearsal walked, and what it showed

| Step | Command | Result |
|---|---|---|
| 5b | `curl -fsS http://127.0.0.1:8080/health/live` | passed. `{"status":"ok","service":"gateway"}` |
| 5b | `curl -fsS http://127.0.0.1:8080/health/deep` | passed. `"status":"ready"`, every mesh check ok, `revocations.authService` `unknown` (no token presented since boot, which is not a fault). |
| 5c | `npm run healthcheck` | passed, exit 0. "reports ready (6/6 mesh checks ok, revocation check unknown)". |
| 5d | `node scripts/synthetic.mjs --email=... --password=...` | passed, exit 0. "journey ok: sign-in, identity, manifest, phase (paywall refused 402 entitlement_required), run (exit 0 in 58ms via subprocess, 199 runs left today)". |
| 2 (backup) | `node scripts/backup.mjs --url=... --dir=... --keep-days=14` | passed, exit 0. "21 table(s), 204 row(s)". |
| 2 (drill) | `node scripts/backup-drill.mjs --url=...` | passed, exit 0. "drill passed: 21 table(s) read, restored and compared", every table reported ok with its row count. |

These were run against the **local development stack** (`npm run dev:stack`),
which starts the same five services and the same migrations on the same
ports, with PGlite standing in for Postgres. The service code, the routes,
the migration runner, the health endpoints, the health command, the synthetic
check, the backup command and the drill are the same code that the compose
stack runs. The database is not the same database, and no container was
involved.

### 3.5 Two findings from the 2026-10-20 rehearsal

**The synthetic check's inline environment assignment did not reach the
process.** The first attempt, with `SYNTHETIC_EMAIL` and `SYNTHETIC_PASSWORD`
set in the same command line before the command, failed with a 400 on both
register and sign-in, and the account could not be created. The same command
with the two values passed as `--email` and `--password` passed. The cause was
not established, because the failure was in how the shell handed the
environment over, not in the platform. The operational lesson is in the
crontab line: put the credentials in the crontab's own environment, and use
the flags for a one-off run.

**`npm run backup -- --list` prints undefined.** The listing prints
`undefined` for the timestamp, the table count and the row count, because it
reads `takenAt`, `tables` and `rows` from the top level of the entry while
the manifest holds them one level down, and because `tables` and `rows` are
objects of per-table counts rather than numbers. The dumps themselves are
correct: the manifest inside each dump carries `version`, `takenAt`, and the
per-table counts. Read the manifest from the dump rather than from the
listing:

```bash
node -e "const fs=require('fs'),z=require('zlib');const f=fs.readdirSync('DIR').filter(x=>x.endsWith('.json.gz')).sort().pop();console.log(JSON.stringify(JSON.parse(z.gunzipSync(fs.readFileSync('DIR/'+f))).manifest),null,2))"
```

### 3.6 What could not be rehearsed then, and why

These are gaps. They are not passes.

| Step | Why it could not be rehearsed |
|---|---|
| 1 (build) | No Docker daemon on the machine. The Docker CLI is installed and `docker info` fails with "failed to connect to the docker API". No image was built, so the `SERVICE` build argument, the Go prewarm in the execution image and the frontend's prerender were not exercised. |
| 1 (build) | The `PUBLIC_` build-time baking was not exercised, so the claim that the prerendered pages bake the build-time value is taken from the site's own `.env.example` and the `svelte.config.js`, not from an observation. |
| 2 (backup) on the real stack | The backup was rehearsed against PGlite, not against the Postgres container. The compose `backup` service runs the same script over the compose network, but the volume mount and the network attachment were not exercised. |
| 3 (migrations) | The migration runner was exercised (the local stack applied `012_progress` at boot and recorded it in `schema_migrations`), but the compose ordering was not, and no migration was exercised against a database that already had the previous release's rows in it. |
| 4 (roll) | No Docker daemon. Container recreation, the `depends_on` health ordering, the read-only root filesystems, the dropped capabilities, the tmpfs mounts, the `!override` port bindings and the log rotation were not exercised. |
| 5a (`compose ps`) | No Docker daemon. No container has been reported healthy by a compose health check in this rehearsal. |
| 5e (the edge) | No Caddy binary, no certificate, no DNS. The Caddyfile was not parsed by Caddy and no request was made through it. The security headers, the CORS set and the `request_body` limit are written from the Caddyfile reference and were not observed. |
| The rollback paths | Nothing was rolled back, because nothing was deployed. The image rollback, the restore-from-backup path and the forward-fix path are all unexercised. |
| The compose files | The override was checked by parsing it and comparing it with the base file, not by running `docker compose config` on it. |

### 3.7 What the first real deploy should do

The first deploy on the real host is the rehearsal of the parts that could
not be rehearsed here. Do it with the people who will be on call, with the
backup and the drill in front of you, and with a written note of what was
different from this document. Then do it a second time, with the rollback
walked on purpose, before any paying learner is on the platform.

---

## 4. The drills that are still open

From [OPERATIONS.md](OPERATIONS.md) section 6. None of these has been
performed, and this runbook does not change that.

| Drill | Proves | How often | Performed? |
|---|---|---|---|
| Restore drill against the real Postgres | a backup can be restored and the rows are there | monthly, and after any migration | no. Rehearsed against PGlite on 2026-10-20, never against the container. |
| Deploy rehearsal, including the rollback | the whole path works | before every first release | no. The steps that could be walked on a machine with no Docker were walked; the rest was not. |
| Key rotation | rotating a secret does not take the product down | before the first one is needed | no. The procedure is in ENVIRONMENT.md section 8.4. |
| Capacity | the edge survives the traffic it is told to expect | before the first paying learner | no. There is no load test. |
| Erasure | a deletion request reaches every copy, and the backup ages out | before the first learner asks | no. See DATA-RETENTION.md. |
| Sign-out | a signed-out credential stops working, and the degraded window is understood | with the security review | no. |

---

## 5. The crontab

The lines below are what the deployment runs on a schedule. They are written
out so the operator can install them, and installing them is still the
operator's job.

```cron
# The health check, every minute, silent when healthy. Exit 1 is the edge
# saying something is wrong; exit 2 is the check not being able to ask.
* * * * * cd /srv/nexora/branchcraft/platform && node scripts/healthcheck.mjs --quiet

# The synthetic check, on the hour and never on the minute. With hosted runs
# off it spends no execution quota at all; if someone sets
# EXECUTION_HOSTED_RUNS=on, every run spends one of the canary's 200 a day, so
# hourly costs 24 of them and a per-minute cadence would exhaust the quota by
# morning and page for a problem the check caused itself.
0 * * * * cd /srv/nexora/branchcraft/platform && SYNTHETIC_EMAIL=canary@example.com SYNTHETIC_PASSWORD='<the password>' node scripts/synthetic.mjs --quiet

# The monitor, which runs both of the above and speaks when the state
# CHANGES. It needs MONITOR_TO and the Resend key, and it remembers what it
# last reported in MONITOR_STATE.
* * * * * cd /srv/nexora/branchcraft/platform && MONITOR_TO=ops@example.com node scripts/monitor.mjs --quiet

# The backup, once a day, off the minute. It is a job, not a service, and it
# runs on the compose network so the database's port never has to be published.
17 3 * * * cd /srv/nexora/branchcraft/platform && docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm backup

# The metrics, once an hour, archived as one object per run.
56 * * * * cd /srv/nexora/branchcraft/platform && node scripts/metrics.mjs --json >> /var/log/nexora/metrics.jsonl

# The alerts, every ten minutes. It reads disk, the database connections and
# the execution queue depth, and it exits 1 on a breach.
*/10 * * * * cd /srv/nexora/branchcraft/platform && node scripts/alerts.mjs
```

Two of these need a directory that does not exist by default:

```bash
sudo mkdir -p /var/log/nexora
```

`mkdir -p /srv/nexora` for the compose working directory, owned by the
operator the cron runs as.

The crontab's environment is the crontab's environment, not the shell's. The
credentials have to be in the crontab line itself, as above, or in a file the
line sources. They are secrets, so the file needs to be mode 0600 and owned
by the operator the cron runs as.
