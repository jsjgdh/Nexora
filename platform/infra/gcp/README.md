# NEXORA on Google Cloud — the deployment runbook

The mesh runs on **Cloud Run**, the front door runs on **Vercel**, and the two
meet at one HTTPS load balancer in front of the gateway. This file is the order
of operations, and what has to be true before each step.

**As of 2026-10-20 this plan is the production decision**
([DEPLOYMENT.md](../../docs/DEPLOYMENT.md) changed accordingly); the
compose stack in that document is the fallback, kept building unchanged.
Being the decision does not make it rehearsed — the first deploy is
still a drill, rollback included, and that is stated rather than
assumed at every step below.

The plan lives in [`plan.json`](plan.json) and is **data**: `plan.ts` checks it
against the source tree, `deploy.ts` applies it. Run the check before you run
anything else:

```sh
npm run build --workspace=@nexora/gcp-plan
node infra/gcp/dist/plan-check.js
```

It refuses, with a named reason, when the plan and the code have drifted: a
service that exists and is not deployed, an environment variable the service
reads and the plan does not supply, a peer URL that points at nothing, a second
public service, a secret written down in the plan, a dependency cycle. Those
checks are the reason the plan is a file rather than a script: a script that
calls `gcloud` can only be verified by running it against a real project with
real credentials.

The rest of the folder is one concern each, and each is a pure module the
suite can read without a cloud account:

| Module | What it owns |
|---|---|
| `plan.ts` | the plan, and the checks that keep it honest |
| `image.ts` | where the image lives, what its tag has to be, and what is running now |
| `iam.ts` | the two accounts and the roles each one holds |
| `secrets.ts` | the secret VALUES, which are read from the environment and never written down |
| `rollback.ts` | reading what is running, and putting it back |
| `deploy.ts` | the thin thing that hands the plan to `gcloud` |

`scripts/verify-gcp.mjs` in the platform is the gate that says all of it is
real: the plan matches the code, the deploy refuses an image it could not roll
back to, every command that creates something checks whether it is already
there, and the pipeline asks the plan for the image address instead of
carrying its own copy.

---

## The shape

```
                    Vercel                     Cloud Run
                 nexora.dev          api.nexora.dev
                      │                     │
                      │  browser ──────────►│
                      │                     ▼
                      │            ┌──────────────────┐
                      │            │  nexora-gateway  │  ← the only public service
                      │            └────────┬─────────┘
                      │                     │  mesh (INTERNAL_API_KEY)
                      │     ┌───────────────┼───────────────┬──────────────┐
                      │     ▼               ▼               ▼              ▼
                      │  nexora-auth  nexora-curriculum nexora-execution nexora-billing
                      │     │                                               │
                      │     └──────────────► billing ◄─────────────────────┘
                      │                                                     │
                      ▼                                                     ▼
              Cloud SQL ── authdb, billingdb                        Dodo Payments
```

- **One public surface.** The gateway is the only service with an external
  ingress. The other four are `internal`, which on Cloud Run means reachable
  only by other Cloud Run services — not by the internet.
- **The mesh key is the boundary.** Every internal call carries
  `INTERNAL_API_KEY`. A service that cannot authenticate its mesh refuses to
  start, in every environment.
- **Two databases, one instance.** `authdb` belongs to `auth`, `billingdb` to
  `billing`. Neither can read the other's tables without asking.
- **The receipt key lives in two services** — `auth` and `execution` — because
  both mint receipts, and in nowhere else.

## Before you start

| Thing | Why | Where |
|---|---|---|
| A GCP project | everything lives in it | `plan.json` → `project` |
| Billing enabled on it | Cloud Run and Cloud SQL are not free | GCP console |
| A domain on Cloudflare | the load balancer needs a cert for it | `plan.json` → `loadBalancer.domain` |
| `gcloud` authenticated | every command below | `gcloud auth login` |
| Docker, building locally | the image is built here and pushed | `docker build` |
| A billing account | the budget alert belongs to one, not to a project | `plan.json` → `observability.budget.billingAccountEnv` |
| The eight secret values | the services mount them, and a secret with no version cannot be mounted | the environment of the deploy, see §2 |

Two facts about the current product that decide the order:

- **`nexora.dev` is parked.** The legal pages answer HTTP 200 with a redirect
  stub and no statement, and `SECURITY.md` still carries a placeholder contact.
  Nothing may be published until both are real. This is checked by
  `build/nexora/legal-verify.ts --publishable` in the IDE repository.
- **The platform's deploy procedure has never been run against a real host.**
  The first deploy is a drill, with the rollback step performed on purpose.

---

## The order of operations

### 1. Provision the database, and turn the backups on

```sh
node infra/gcp/dist/deploy.js --print     # shows the commands without running them
```

The instance, the two databases, the automated backups, the deletion
protection and the Secret Manager entries are created first, because
everything else needs them to exist.

- Cloud SQL is created **without a public IP** (`--no-assign-ip`). The services
  reach it through the **Cloud SQL Auth Proxy** sidecar, which Cloud Run
  supports natively. That is the difference between a database that is only
  reachable from inside Google and one that is on the internet.
- The **automated backups are part of the same step**, not a later
  remembrance: a daily window at 03:00, seven days of file retention, seven
  days of transaction logs and point-in-time recovery, so a mistake is
  recoverable from any minute in the week and not only from the last dump.
  The instance also gets **deletion protection**, because a database that one
  command can delete is one command away from gone.
- The `nexora` role's password is generated and stored in Secret Manager as
  `nexora-db-password`. It is never written into a file, an image, or the plan.

The engine-level restore drill is the one that is still owed, and it is
written down rather than assumed: restore the latest automated backup into a
NEW instance and run the platform's own drill against it
(`npm run drill -- --url=…`). The drill proves the rows come back; the engine
backup proves the engine can be restored. They are different mechanisms and
the runbook must not confuse them. See
[OPERATIONS.md](../../docs/OPERATIONS.md) for the whole contract.

### 2. Generate the secrets

| Secret | How |
|---|---|
| `nexora-internal-api-key` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `nexora-auth-jwt-secret` | same |
| `nexora-db-password` | same |
| `nexora-receipt-ed25519-key` | `node -e "console.log(require('node:crypto').generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))"` — one line, newlines as `\n` |
| `nexora-resend-api-key` | from Resend |
| `nexora-dodo-api-key` | from Dodo Payments |
| `nexora-dodo-webhook-secret` | from Dodo → Developer → Webhooks |

**The receipt key is the one that matters most.** Its public half is published
at `GET /api/execute/verify-key` so a stranger can re-derive a verdict without
asking the platform. A leaked one would let a caller mint receipts. It lives
in the environment of `auth` and `execution` and nowhere else — never in the
image, never in the repository, never in a log.

**How a value reaches the deploy.** The plan names the secret; the VALUE is
read from the environment of the process that runs the deploy, and the
variable is named after the secret with one rule: `nexora-internal-api-key`
becomes `NEXORA_SECRET_INTERNAL_API_KEY`. The GitHub repository secret is
called that too, so there is one list rather than three, and the suite checks
that the plan, the deploy and the workflow agree on it.

A secret with no value **stops the deploy**. A service mounted on a secret
with no version points at nothing, and it fails to start with a message about
the secret rather than about the missing version.

### 3. Build and push the image

One image, five services, selected by `--build-arg SERVICE=`. **The address
comes from the plan**, and the tag is the commit:

```sh
# the plan knows the registry; ask it
IMAGE="$(node infra/gcp/dist/image.js --tag="$(git rev-parse HEAD)")"
echo "$IMAGE"   # us-central1-docker.pkg.dev/nexora-prod/nexora/mesh:<sha>

docker build --build-arg SERVICE=gateway -t "$IMAGE" .
gcloud auth configure-docker "$(node infra/gcp/dist/image.js --host)"
docker push "$IMAGE"
```

**The deployed tag names one build.** The moving `:latest` tag is pushed as
well, for a person looking at the registry, and the deploy **refuses** it: by
the time a rollback runs, a moving tag points at the image that broke. The
deploy also refuses an image from any registry the plan does not name, and it
refuses before it has touched anything — a wrong image costs nothing that way.

The image carries the Go toolchain and a prewarmed standard-library cache, so
the execution image is the big one. The others share the same layers.

### 4. Deploy, in two passes

```sh
node infra/gcp/dist/deploy.js --apply
```

The deploy is two passes because a Cloud Run URL carries a hash that does not
exist until the service does:

1. The services that depend on nobody are deployed first.
2. Their URLs are read back from the API.
3. The services that depend on others are deployed with those URLs filled in.

So the first run of a fresh project leaves the gateway pointing at nothing it
can reach, and the second run completes it. **Run it twice** on a new project,
or run it once and re-run the dependents.

**The deploy can be repeated.** Every command that creates something first
asks whether it is already there, so the second run of the same plan does not
fail on the first resource that already exists. A deploy that only works once
is not a deploy.

**The accounts come first.** Two service accounts, and they are not the same
one: `nexora-deploy` creates the platform, and `nexora-runtime` is what the
services run as. The roles each one holds are in the plan, with the reason
each one is there, and the plan check refuses a runtime account that has been
given `roles/run.admin` — a service that can deploy is a service that can
replace another service.

**The secrets come before the services.** A secret is created, then a VERSION
is added with the value, and only then can a service mount it.

**The scaling settings are part of the deploy**, because a plan that states
them and a deploy that does not apply them are two different plans. Each
service carries its own minimum, maximum, CPU threshold and concurrency, and a
sentence saying why it scales that way:

| Service | Min | Max | Why |
|---|---|---|---|
| `curriculum` | 0 | 4 | The roadmap and the phase bodies are read from disk and change rarely, so it scales to zero between lessons and costs nothing while idle |
| `billing` | 1 | 4 | A scale-to-zero here would put a cold start in front of a checkout — the one moment a learner is deciding whether to pay |
| `auth` | 2 | 6 | Every authenticated request checks the revocation list, so it stays warm; two instances so a deploy is not an outage |
| `execution` | 1 | 4 | Its queue and its daily quota counters live in the process, so it must never scale to zero |
| `gateway` | 2 | 6 | The only public surface. The second instance waits for a shared rate-limit store — see OPERATIONS.md §1 |

**The execution service must keep at least one instance**, and it is the one
service whose "down" means "learners' hosted runs are refused" rather than
"requests queue for a second".

### 5. The load balancer

The gateway is deployed with `--ingress internal-and-cloud-load-balancing`, so
it is reachable from a load balancer and from other Cloud Run services, and not
from the internet. In front of it:

- a **Serverless NEG** pointing at the gateway,
- an **external HTTPS Application Load Balancer** on `api.nexora.dev`,
- a **Google-managed certificate** for that name.

`TRUST_PROXY=1` is set in the plan, because the load balancer writes
`X-Forwarded-For` and the gateway's rate limits key on the client IP. Without
it, a client could choose its own rate-limit bucket. It is refused as a
blanket `true` — the value is a hop count, not a boolean.

### 6. The front door on Vercel

The site is a SvelteKit app; Vercel builds it with `@sveltejs/adapter-vercel`,
which `svelte.config.js` selects when the build environment sets `VERCEL`. The
same source still builds as a standalone `node build` for the compose stack and
for any self-hosted deployment, because the adapter is chosen by the
environment rather than by a branch.

| Variable | Which | Value |
|---|---|---|
| `PUBLIC_API_URL` | public, inlined at build | `https://api.nexora.dev` |
| `GATEWAY_URL` | private, runtime | `https://api.nexora.dev` |
| `PUBLIC_SITE_URL` | public | `https://nexora.dev` |
| `RESEND_API_KEY` | private | the Resend key |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | public | only if `AUTH_MODE=clerk` |

`GATEWAY_URL` and `PUBLIC_API_URL` are both the gateway's address, and they
are separate variables on purpose: the browser's route to the gateway and the
app server's own route are different callers, and the server-side one is what
holds the refresh token in an HttpOnly cookie. Getting it wrong fails sign-in
alone, with "the sign-in service did not answer", while every other page looks
healthy.

**The region matters.** Vercel and Cloud Run are in different providers, so
every API call crosses the network twice. Put the Cloud Run region as close as
possible to the Vercel region (`iad1` in the plan's `vercel.json`), and prefer
a region near the learners. The front door and the gateway are on opposite
sides of that distance, which is the price of splitting them.

### 7. Point the IDE at it

Three settings, all empty by default — the free course works with all three
empty, which is the honest default for a product that has not shipped.

| Setting | What it is |
|---|---|
| `nexora.platformUrl` | the gateway, for sign-in and the paid phases |
| `nexora.siteUrl` | the site the sign-in browser opens — the IDE never sees a password |
| `nexora.attestationUrl` | `<gateway>/api/execute/attest`, for the "verified" tier |

---

## What to verify after the deploy

In order, because each one tells you which step failed:

1. **Every service answers `/health/live`.**
   `curl https://nexora-auth-<hash>.run.app/health/live` — but the internal
   services are not reachable from outside. Check them from the gateway:
   `curl https://api.nexora.dev/health/deep`, which probes every mesh member
   and reports each one.
2. **`/health/deep` says `ready`**, every mesh check is `ok`, and
   `revocations.authService` is not `unreachable`. `unknown` means no token
   has been presented since boot, which is not a fault. `degraded` means
   requests are still flowing on a bounded stale answer.
3. **The synthetic journey**: sign in, open a paid phase, run code, and confirm
   a signed receipt verifies at `/api/execute/verify`. The compose e2e journey
   is the script for the first three; the last one is a URL a stranger can
   check.
4. **The receipts verify offline** — the front door's `/verify` re-derives a
   verdict in the browser against the published key. If that fails, the
   `RECEIPT_ED25519_KEY` is not the one whose public half is published.
5. **The monitor is installed**, so a fault pages rather than being noticed
   the next morning:

   ```sh
   * * * * * cd /srv/nexora/platform && npm run monitor -- --quiet
   ```

   It reports a fault that begins and a fault that ends, and stays quiet in
   between. `MONITOR_TO` is where the message goes; `RESEND_API_KEY` and
   `RESEND_FROM` are the provider the platform already has.

6. **The periodic board runs where it can read.** `npm run healthcheck`
   and `npm run synthetic` need only the public endpoint
   (`--url=https://api.nexora.dev`); `npm run metrics` and
   `npm run alerts` read Postgres directly, and this plan's Cloud SQL
   has no public IP — run them from a host holding a Cloud SQL Auth
   Proxy connection (the plan's sidecars serve the services; an ops
   host runs its own). Neither invents a number it cannot read:
   `alerts` prints skips for URLs it was not given and breaches on one
   that will not answer, `metrics` exits `2`. The request ids in their
   output grep Cloud Logging (`gcloud logging read
   'jsonPayload.requestId="<id>"'`), not `docker logs`.

## Rollback

Every service keeps the previous image, and a rollback is a redeploy of the
previous tag:

```sh
# what is running right now, read from the API rather than remembered
node infra/gcp/dist/image.js --current

# put every service back on it
node infra/gcp/dist/deploy.js --rollback --image="<that address>"
```

**The address is read, not remembered.** A remembered image is a guess, and a
rollback made from a guess is a second outage. The rollback also refuses the
moving tag, for the same reason the deploy does.

Migrations are forward-only, so a rollback never un-runs one. A change that
needs a destructive migration is two deploys — expand, then contract —
reviewed as such.

## What the pipeline does

`deploy-platform.yml` is the part that can be repeated, and it does this in
order:

1. **Compiles the plan** and **checks it against the code**, before an image
   is built. A plan that has drifted is a deploy that will fail later, and
   failing here costs a minute.
2. **Names the image**, by asking the plan where it goes. The workflow does not
   carry its own copy of the address, and the suite fails if it starts to.
3. **Builds the image** and **pushes it** to the plan's registry, with the
   commit as the tag and the moving tag alongside it.
4. **Reads what is running**, from the Cloud Run API, so the rollback is a
   fact.
5. **Applies the plan**, in two passes.
6. **Verifies itself, from outside**: the health check and the learner
   journey against the DEPLOYED platform.
7. **Rolls back** if the verification failed, onto the image it read in step 4.

The compose target does the same seven steps against one host, with the image
in GHCR and the previous image in a file on the host.

## What is not done yet, and is not a plan's job to hide

- **No live rehearsal.** The deploy procedure has not been run against a real
  project, including the rollback step. The first deploy is a drill, with the
  team present.
- **The restore drill has not been performed against a real database.** The
  command exists and is proven against a real Postgres in CI; what is owed is
  running it against a restored engine backup on a real instance.
- **No alerting is wired.** The monitor exists, and the cron line is in this
  file; installing it is an operator step.
- **The gateway's rate limits are per-instance**, so the second instance in
  the table above is a placeholder until a shared store exists — see
  [OPERATIONS.md](../../docs/OPERATIONS.md) §1.
- **The `docker` runner is refused in production** unless
  `EXECUTION_RUNNER=docker` is set, which the plan does. On Cloud Run there is
  no Docker daemon, so the general hosted-run path (`/execute`, a learner's
  whole workspace) does not work there — the attested path does, because it
  judges the platform's own canonical suite against a small submitted file.
  That path needs a runner that submits a job to a per-job container; see
  `runners/` in the execution service.
