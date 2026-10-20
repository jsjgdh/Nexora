# NEXORA — production operations

What has to be true for a deployment to stay up, stay honest, and stay within
its bill — and what is still a hole in it.

This is the companion to [DEPLOYMENT.md](DEPLOYMENT.md), which says **how** to
deploy. This says **what you then have to run, watch, back up, and rehearse**,
and it is written against the code in this repository rather than against a
general idea of operations. Every knob named here is a knob that exists.

Read the two columns in every section together. The left is what the code
does; the right is what is still missing. A gap that is written down as a gap
is a task. A gap that is described as "handled" is a lie that ships.

---

## 1. Scaling

### What the code does

Every service is a stateless Node process behind the gateway, with one
exception: the execution service keeps a **bounded in-memory job queue**
(`EXECUTION_CONCURRENCY`, default 2) and a **daily quota**
(`EXECUTION_DAILY_QUOTA`, default 200). Neither is shared, and neither is
durable.

| Service | Scales on | State | Ceiling |
|---|---|---|---|
| `gateway` | request rate | none | the instance's own memory and CPU |
| `auth` | request rate | Postgres | Postgres connections |
| `curriculum` | request rate | a synced snapshot on disk | none |
| `billing` | request rate | Postgres | Postgres connections |
| `execution` | **its own queue** | in-memory | `EXECUTION_CONCURRENCY` per instance |

### The thing that decides whether you can scale out at all

**The rate limiter and the entitlement cache are per-instance.** The gateway
holds a sliding window in memory (`GATEWAY_GLOBAL_LIMIT`, 600 a minute across
the whole edge) and an entitlement cache with a TTL
(`ENTITLEMENT_CACHE_TTL_MS`). Both are correct on one instance and *wrong* on
two: with two instances a learner can spend the limit twice, and a seat
entitlement can be read stale from one instance while the other has already
refused it.

So the honest order is:

1. **One instance** until the traffic justifies another. The rate limit is
   then the real limit, which is what it says it is.
2. **Move the limits and the cache to a shared store** (Redis is the obvious
   one) *before* the second instance, not after. The TODO's own note says the
   same thing: *"leaving one host means moving limits to Redis first."*
3. Only then scale the gateway horizontally.

Scaling *down* is free and instant — a stateless service with no minimum
instance count goes to zero and costs nothing. Scaling *down* the execution
service is **not** free in the same way: its queue and its quota counters live
in the process, so a scale-to-zero loses the jobs that were queued and resets
the count of the day's executions. **The execution service must keep at least
one instance**, and it is the one service whose "down" means "learners' hosted
runs are refused" rather than "requests queue for a second".

The `auth` and `billing` services are the ones that scale *badly*, because
every instance opens its own Postgres connections. A Postgres instance has a
connection limit, and Cloud SQL has one too: the ceiling is not CPU, it is
connections. Before adding a second instance of either, put a pooler in front
(Cloud SQL's Auth Proxy is one) and set the per-instance pool size so that
`instances × poolSize` stays under the server's limit.

### What is missing

- No shared store for the rate limits or the entitlement cache, so the gateway
  is single-instance by construction and the plan says so nowhere.
- No autoscale policy in the deployment artefacts, because the artefacts do
  not exist yet in this repository.
- No load test. "It scales" is currently a hypothesis with no experiment behind
  it.

---

## 2. The database, and what happens to it

### What the code does

One Postgres host, one database per service that owns data (`authdb`,
`billingdb`), migrations applied forward-only at boot by `migrate()` in
`service-kit`. A migration that has been applied is never un-applied: the
deploy procedure rolls back by redeploying the previous image, and a
destructive change is two deploys — expand, then contract.

The platform refuses to serve without a real `INTERNAL_API_KEY` in every
environment, and the example placeholders are rejected at boot, so a
deployment that copied `.env.example` fails with a message naming the
variable instead of coming up unauthenticated.

### Backups

**A backup nobody has restored is a hypothesis.** So the thing that is actually
run is a **restore drill**, and this repository now has one:

```sh
npm run drill -- --url=postgres://nexora:nexora@127.0.0.1:5432/authdb
```

It reads every table, writes the rows out, restores them into a scratch
schema, compares what came back with what went out, and drops the scratch
schema. Its exit statuses match the other operational commands: `0` the drill
passed, `1` what came back is not what went out, `2` the drill could not run.
It is proven against a real Postgres in `scripts/verify-drill.mjs`, including
the case where the restore silently loses a row — a drill that cannot fail is a
rubber stamp.

The backup itself is a command too, and it is deliberately not `pg_dump`:

```sh
npm run backup -- --url=postgres://nexora:nexora@127.0.0.1:5432/authdb \
                    --dir=/srv/nexora/backups --keep-days=14
```

It writes a gzipped document holding every table and every row, plus a
**manifest** saying which database it came from, when, and how many rows each
table had. The manifest is what makes a backup checkable: a file whose manifest
says zero rows for a table that has rows is a backup that failed quietly.

Two reasons it is not `pg_dump`: the binary has to exist on the machine taking
the backup, and on this deployment the database is in a container while the
tool would be in another; and the schema is already in the repository, in the
migrations, so a dump that also carried the schema would be a **second copy of
the truth** — and two copies of the truth drift. The schema comes from
`migrate()`; the data comes from the dump. A restore into a fresh database is
"migrate, then load", and there is exactly one schema in the platform.

**How it is scheduled.** The backup is a job, not a service. The compose stack
carries it behind a profile, so `docker compose up -d` does not start it:

```sh
# one crontab line, on the host, at 03:17 — never on the minute
17 3 * * * cd /srv/nexora/platform && docker compose run --rm backup
```

It runs on the compose network, so the database's port is never published —
not even to loopback. The dumps land in a named volume, which the operator
copies off the host on their own schedule; a backup that only exists on the
machine it protects is not a backup.

The drill is the same shape and the same discipline: a job, on demand, against
a database the operator names:

```sh
docker compose run --rm drill
```

What the drill proves: the rows can be read, serialised and written back, the
schema the application depends on is present, and a restore lands the same
rows. What it does **not** prove: that a physical backup taken by the database
engine can be restored. That is a different mechanism (Cloud SQL's automated
backups, `pg_basebackup`, a disk snapshot) and a different drill, and the two
must not be confused.

The engine-level drill, once there is a real database to drill:

```sh
# Cloud SQL: restore the latest automated backup into a NEW instance, then:
npm run drill -- --url=postgres://nexora:<password>@<new-instance>/authdb
```

**A restore drill is only a drill if it is performed on purpose, on a
schedule, and the result is written down.** `company/legal/RETENTION-DELETION.md`
§9 records the drills that have not been performed, and this is one of them.

### Retention, and what a backup means for it

`company/legal/RETENTION-DELETION.md` is explicit that it is a *written
schedule*, not a reflection of running behaviour, and that "nothing is
enforced in code today except one security housekeeping timer" (the revocation
prune in the auth service).

That is the honest state, and it has a consequence for backups that is easy to
miss: **a backup is a copy of the database as it was.** A deletion cannot reach
into a sealed archive. The copy goes when the backup it lives in ages out, and
it is not used for anything in the meantime — which is what the schedule says,
and it is why "we delete on request" and "we keep seven days of backups" are
compatible rather than in tension. A learner whose data was deleted has it
deleted *from the live database immediately*; the backup ages out on its own
schedule. Say that in the privacy notice, because it is the sentence a reader
is entitled to.

### What is missing

- No automated backup is configured in this repository. Cloud SQL's
  automated backups (a daily window, seven days of file retention, seven days
  of transaction logs, point-in-time recovery) have to be turned on in the
  project; nothing here does it.
- No restore drill has been performed against a real database.
- No backup of anything else. There is no object store, no queue and no
  cache to back up today, which is a consequence of the one-host design and
  not an accident.
- No deletion-protection or a second copy. A database that is deleted by
  mistake is gone, and the drill cannot help with a database that no longer
  exists.

---

## 3. Watching it, and being told

### What the code does

Four commands, written so that a monitor can be pointed at them; three
carry three exit statuses, and the fourth refuses to judge:

| Command | Asks | `0` | `1` | `2` |
|---|---|---|---|---|
| `npm run healthcheck` | the gateway's `/health/deep` | healthy | the edge says something is wrong | the check could not ask |
| `npm run synthetic` | the journey a learner walks | the journey answered | the platform said something is wrong | the check could not ask |
| `npm run alerts` | disk, database connections, queue depth | every check it could ask is under threshold | a breach | nothing at all could be checked |
| `npm run metrics` | what the platform records — and what it cannot | the numbers were printed | — it reports, it does not judge | the report could not be produced |

The two-value split between `1` and `2` is the point: "the platform says it is
degraded" and "I cannot ask the platform" wake different people, and a monitor
that cannot tell them apart is a monitor that gets muted.

**And now something tells a human.** `npm run monitor` runs both checks and
speaks when the state CHANGES:

```sh
* * * * * cd /srv/nexora/platform && npm run monitor -- --quiet
```

It sends through Resend, which the platform already has an account with for
password resets — no new provider and no new bill. It reports a fault that
**begins**, and a fault that **ends**, and stays quiet in between: an outage
that lasts an hour is one message, not sixty, and a monitor that only
complains is a monitor people mute. The recovery message matters as much as
the alarm.

Its own exit status is the contract with the cron: `0` healthy, `1` a check
failed, `2` the monitor could not run or could not report. `scripts/
verify-monitor.mjs` pins the behaviour that matters — that a fault already
known is not reported again, and that a recovery is.

`/health/deep` carries the thing that is invisible from outside: when the
auth service stops answering the per-request revocation check, authenticated
requests keep **succeeding** on a bounded stale answer
(`REVOCATION_CLEAR_TTL_MS`, 60 seconds by default), so nothing a learner sees
looks broken while a signed-out credential may still be accepted for a moment.
The endpoint reports `revocations.authService` as `reachable` / `unreachable` /
`unknown`, plus `degraded`, `outageMs`, `clearTtlMs` and the counters. Only
`unreachable` is a fault; `unknown` means no token has been presented since
boot.

### The synthetic check's one sharp edge

`npm run synthetic` signs in with a canary account and **runs one program** —
which spends one of that account's `EXECUTION_DAILY_QUOTA` executions. The
default quota is 200 a day, so **hourly costs 24 of them**; per-minute
(1,440) would exhaust the quota by morning and then page for a reason that is
not a fault at all. The cadence is therefore part of the configuration, not a
detail: the crontab entry is `0 * * * *`, and the check itself says so when it
sees the quota refuse it.

### What is missing

- Nothing pages *yet*. The monitor above exists and is wired to both
  checks; its cron line is written down here and in the GCP runbook, and
  nobody has installed it. Until that line runs on something that reads
  its mail, production visibility is a cron entry on nobody's list.
- **No dashboards.** The data layer now prints what exists —
  `npm run metrics`: signups, live sessions, the signup→first-attested-
  evidence funnel, subscriptions — and names the three numbers nothing
  records (a first *local* run, execution failures by language, sync
  errors) as gaps instead of zeros. Nothing renders it and nothing
  archives it: the dashboard is still unwritten, and the plan's 30 days
  are days of *logs*, not of numbers.
- **No structured log sink on compose.** `docker logs` and these four
  commands are the whole of it there. The GCP plan sends stdout and
  stderr to Cloud Logging with 30 days of retention — a sink with a
  policy — so this gap is compose's, and the plan closes it.
- **No alert on the thing that actually matters:** the attestation path going
  unavailable. A deployment whose execution service has lost its key answers
  `attestation_unavailable` and the labs stay *practiced* rather than failing —
  honest, and invisible to a learner.

---

## 4. Secrets, and rotating them

| Secret | Where it lives | Rotating it |
|---|---|---|
| `INTERNAL_API_KEY` | every service | it authenticates the mesh **and** seeds the receipt HMAC, so rotating it invalidates every HMAC receipt. The Ed25519 half survives. Rotate the two separately, and expect the first to be visible |
| `AUTH_JWT_SECRET` | auth, gateway | invalidates every access token. Learners are signed out; the refresh family still works |
| `RECEIPT_ED25519_KEY` | execution only | old receipts keep verifying (they carry the key id) but the published half must change too, or a stranger cannot check the new ones |
| `RECEIPT_ED25519_PUBLIC_KEY` | auth only | the public half. The service that **stores** evidence holds this and not the private key, so it can verify a receipt and never mint one |
| `RESEND_API_KEY`, `DODO_*` | auth, billing | provider-side; a rotation is a dashboard change and a redeploy |
| `POSTGRES_PASSWORD` | auth, billing | the DATABASE_URL changes in two services, and the sessions the old password had open keep working until they reconnect |

Two rules the code already enforces and the runbook should not forget: a
placeholder secret is **refused at boot** in every environment, and
`ALLOW_INSECURE_MESH=1` is refused when `NODE_ENV=production`, so no value of
`NODE_ENV` opens the mesh. An environment that has ever run with a placeholder
value must rotate both mesh keys; they cannot be un-leaked.

---

## 5. The bill

| Thing | Scales with | The lever |
|---|---|---|
| Cloud Run | requests and CPU-seconds | `--min-instances 0` is free when idle; `--min-instances 1` costs a warm instance forever |
| Cloud SQL | storage and connections | the tier, and the number of instances |
| The load balancer | traffic | mostly flat |
| Resend | emails | the verification and reset flows only |
| Dodo Payments | subscriptions | a percentage, and the plan's price must match the site |
| Cloudflare R2 | storage and egress | egress is free, which is why it is the CDN |

The number that surprises people is **Cloud SQL**, because it is provisioned
rather than consumed: a `db-custom-2-4096` instance costs the same whether it
serves one learner or a thousand. Start with the smallest tier that holds the
data and the connections, and resize it deliberately.

The other surprise is the **execution service**: a Go compile is CPU-seconds,
and Cloud Run bills CPU-seconds. The prewarmed standard-library cache in the
runner image is what keeps a learner's first program from costing a full
compile — it is worth more on the bill than it looks.

---

## 6. The drills

Each of these is a thing that has to be *performed*, not a thing that has to
be written. None has been performed yet, and the honest way to say that is in
the runbook's dry-run checklist rather than in a document nobody reads.

| Drill | Proves | How often | Performed? |
|---|---|---|---|
| Row restore drill | the platform's restore path puts the data back | monthly, and after any migration | **no** |
| Engine restore drill | the DATABASE can be restored, not just the rows | quarterly, and after any engine change | **no** |
| Deploy rehearsal | the whole path works, rollback included | before every first release | **no** |
| Key rotation | rotating a secret does not take the product down | before the first one is needed | **no** |
| Capacity | the edge survives the traffic it is told to expect | before the first paying learner | **no** |
| Erasure | a deletion request reaches every copy, and the backup ages out | before the first learner asks | **no** |
| Sign-out | a signed-out credential stops working, and the degraded window is understood | with the security review | **no** |

The ones marked **no** are not criticisms of the deployment; they are the
honest state of a product that has not been deployed. The point of writing
them down is that "we have backups" is not one of them.

---

## 7. Restoring the database, which is the drill that matters

A backup nobody has restored is a hypothesis, and there are TWO hypotheses
here, not one:

- **the rows** — that the platform's own restore path puts the data back.
  `npm run drill` proves this, in a scratch schema, against a real database.
- **the database** — that the ENGINE's backup can be restored at all. A
  Cloud SQL automated backup, a `pg_basebackup`, a disk snapshot: a different
  mechanism, and it can fail in ways the row restore cannot see. The backup
  was never taken. The backup is corrupt. The backup belongs to a different
  instance. The credentials in it do not match what the application uses.

So the engine drill is its own command, because it is its own proof:

```sh
npm run drill:engine -- --instance=nexora-postgres --project=nexora-prod --yes
```

It takes the **newest** automated backup, restores it into a **new**
instance, waits for it to be ready, runs the row drill against the restored
copy, and removes the scratch instance. It refuses to run without `--yes`,
because it creates a real instance and spends real money for as long as that
instance is alive.

**This is the drill that closes the "no restore drill has been performed"
line in §6, and it has not been performed.** What has been done is that it
is now a command with a test on what it does (newest backup, new instance,
removed afterwards, pointed at a database the plan creates) rather than a
paragraph in a runbook.

On the compose path the equivalent is a `pg_dump` of each database into the
backups volume, and a restore into a scratch database. The row drill is the
same command either way; only the source of the copy differs.

---

## 8. What this document does not claim

- It does not claim the platform has run in production. It has not.
- It does not claim the numbers in §1 and §5 are measured. They are the
  defaults in the code, and the first deploy is where they stop being
  defaults.
- It does not claim the retention schedule is enforced.
  `company/legal/RETENTION-DELETION.md` says so itself, and that document is
  the authority, not this one.
- It does not describe a Google Cloud deployment step by step — that is
  [infra/gcp/README.md](../infra/gcp/README.md)'s job, written after
  this document. The deployment *decision* is now that plan, with one
  host plus `docker compose` as the fallback
  ([DEPLOYMENT.md](DEPLOYMENT.md)), and this document is written to
  hold for both shapes — a single host is where the in-memory limits,
  the single Postgres and the in-process queue are all *correct* rather
  than all *broken at once*, which is exactly why the plan pins
  `execution` to a minimum of one instance and blocks the gateway's
  second on a shared store. Moving to a managed platform does not remove
  the obligations in this document; it moves the backups and the
  autoscaling settings into a different vendor's console, and it makes
  the shared-store work in §1 unavoidable rather than optional.
