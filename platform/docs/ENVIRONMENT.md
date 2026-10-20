# NEXORA environment variables

The inventory of every environment variable the platform and the site read, where
each one is read, whether it is required, what happens when it is absent, and
whether it is a secret.

It was derived from the code, not from memory. The scan was:

```bash
# every process.env read, and every $env/dynamic read in the site
node -e "const fs=require('fs'),path=require('path'); ..."
```

concretely, a walk of `platform/services`, `platform/packages`, `platform/scripts`,
`platform/infra`, `nexora-svelte/src` and `nexora-svelte/scripts` for
`process.env.NAME`, `process.env["NAME"]`, `env.NAME` and `publicEnv.NAME`,
excluding `node_modules`, `dist`, `.svelte-kit`, `build` and the curriculum's
`data/` directory (which is course content, not configuration). The variables
read through a helper (`required("X")`, `optional("X", ...)`) were collected
separately, and so were the ones read by name from an `env` object rather than
from `process.env` directly.

**Every variable named below was found in that scan.** A variable is not listed
because a document mentions it. Where a document and the code disagree, the
code wins and the disagreement is recorded in the last section.

**What this file does not cover.** It does not describe the GCP plan under
`platform/infra/gcp`, which configures the same services differently. It does
not describe the local development stack (`npm run dev:stack`), which writes
`platform/.env.local` and the site's `.env` for you. And it does not certify
any value: it says what the code does with a value, not whether a given
deployment has set one correctly.

---

## 1. The chassis: every service, and the gateway

These are read by `platform/packages/service-kit/src/index.ts` (the shared
chassis) or by `platform/services/gateway/src/config.ts`.

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `INTERNAL_API_KEY` | every service, the gateway | **required, everywhere** | The service refuses to start. The error names the variable and prints the command that generates one. The mesh is not disabled, degraded or defaulted: without a key every internal route trusts a bare `x-user-id` header from any caller, so the platform stops rather than serve that. | **yes** |
| `ALLOW_INSECURE_MESH` | every service, the gateway | optional, development only | The mesh is authenticated, which is what production wants. Set to `1` it runs the mesh with no key, and the service logs an error on every request saying so. It is refused outright when `NODE_ENV=production`, so no value of `NODE_ENV` opens the mesh. | no (it is a switch) |
| `NODE_ENV` | every service, the gateway, the site | optional; the compose files set it to `production` on every service | The service treats itself as not-production, and error responses carry the zod issue detail that names the failed fields. It does not change the mesh rule, which fails closed in every environment. | no |
| `LOG_LEVEL` | every service, the gateway | optional, default `info` | Default log verbosity. Nothing else reads it. | no |
| `FATAL_WEBHOOK_URL` | every service | optional | The structured fatal line in the service's own log is the whole report, and `docker logs <service>` is where it is read. Set, the same report is POSTed as one small JSON body to that URL, bounded at two seconds, and the process dies whether or not the report arrives. | **yes** (it is a URL that carries a credential in it) |
| `AUTH_MODE` | the gateway, the auth service | optional, default `local` | `local`: the built-in JWT service, zero configuration. `clerk`: Clerk session tokens are verified against the JWKS. Any other value is refused at boot by the gateway. | no |
| `AUTH_JWT_SECRET` | the gateway, the auth service | **required** when `AUTH_MODE=local` | The gateway refuses to start, naming the variable. The check is a length floor of 32 characters and a denylist of the documented placeholders, so the copy-paste value from `.env.example` is refused too. Anyone holding this value can mint an access token for any user. | **yes** |
| `CLERK_SECRET_KEY` | the gateway | required when `AUTH_MODE=clerk`, unless `CLERK_JWT_KEY` is set | The gateway refuses to start with "Clerk mode needs CLERK_SECRET_KEY or CLERK_JWT_KEY". | **yes** |
| `CLERK_JWT_KEY` | the gateway | optional, an alternative to `CLERK_SECRET_KEY` | A pinned PEM public key instead of a hosted JWKS fetch. Literal `\n` in the value is restored to a newline. It is a public key, so it is not a secret, but it is still configuration. | no |
| `CLERK_API_URL` | the gateway | optional, default empty | Empty means Clerk's hosted API and its hosted JWKS. A set value must be an http(s) URL with no trailing slash, because the SDK appends `/{apiVersion}/jwks` to it. | no |
| `CLERK_AUTHORIZED_PARTIES` | the gateway | optional, defaults to `[FRONTEND_URL]` | The allowed origins for a Clerk token. Empty means the one origin in `FRONTEND_URL`, which is the correct default for a single-origin deployment. | no |
| `TRUST_PROXY` | the gateway | optional, default `0` | The number of reverse-proxy hops to trust in front of the gateway, for the client address the rate limits key on. `0` means the socket address is the client, which is right when the gateway is the public surface. A literal `true` is refused on purpose: it lets any caller write its own `X-Forwarded-For` and choose its own rate-limit bucket. | no |
| `GATEWAY_PORT` | the gateway, the operator commands | optional, default `8080` | The port the gateway listens on. `PORT` is the fallback when this is unset. The compose file sets `PORT` on the service, and the operator commands read `GATEWAY_PORT` to find the edge on the host. | no |
| `PORT` | the gateway, the auth, curriculum, execution and billing services | optional per service; the compose file sets it on every one | Each service's own listen port. The defaults are the ones in `LOCAL.md`: gateway 8080, auth 8101, curriculum 8102, execution 8104, billing 8106. | no |
| `GATEWAY_GLOBAL_LIMIT` | the gateway | optional, default `600` | The edge-wide rate limit, per minute, per client address. It is in memory and per instance, which is why the platform is single-instance by construction. | no |
| `GATEWAY_LIMIT_WINDOW_MS` | the gateway | optional, default `60000` | The window every gateway rate limit is counted in. It is the shared window, so the per-route, per-anonymous and edge-budget limits all count in the same period. | no |
| `GATEWAY_ANON_LIMIT` | the gateway | optional, default `60` | How many requests an unauthenticated caller may make per window. | no |
| `GATEWAY_EDGE_LIMIT` | the gateway | optional, default `20000` | The edge's own budget per window: the total number of requests the gateway will accept, authenticated or not, before it starts refusing. | no |
| `GATEWAY_BREAKER_FAILURES` | the gateway | optional, default `3` | How many consecutive upstream failures open the gateway's circuit breaker. The value is floored at 1, so a value of 0 or less does not disable the breaker; it turns it into a one-failure breaker. | no |
| `GATEWAY_BREAKER_COOLDOWN_MS` | the gateway | optional, default `15000` | How long the breaker stays open before the gateway tries an upstream again. A value of 0 is allowed and means the breaker re-closes on the next request. | no |
| `ENTITLEMENT_CACHE_TTL_MS` | the gateway | optional, default `30000` | How long a resolved subscription verdict is trusted before billing is asked again. | no |
| `REVOCATION_TIMEOUT_MS` | the gateway | optional, default `2000` | How long the edge waits for the auth service to answer a revocation check before treating it as unavailable. A timeout is a 503, not a silent allow. | no |
| `REVOCATION_CLEAR_TTL_MS` | the gateway | optional, default `60000`, clamped to 0..300000 | How long a confirmed clear answer may still be acted on when the auth service cannot be reached. `0` disables the fallback and every unanswerable check becomes a 503. A value above 300000 is clamped down, and a negative one becomes 0. | no |
| `REVOCATION_REPORT_MS` | the gateway | optional, default `60000` | How often the edge reports its revocation counters as one structured line. The first refusal, unanswered check or degraded allow after a quiet period is logged immediately regardless. | no |
| `AUTH_URL` | the gateway, the auth service | optional, default `http://localhost:8101` | The auth service's address: the gateway's route target and the address the revocation check asks. The compose file sets it to `http://auth:8101`. | no |
| `CURRICULUM_URL` | the gateway | optional, default `http://localhost:8102` | The curriculum service's address. The compose file sets it to `http://curriculum:8102`. | no |
| `EXECUTION_URL` | the gateway | optional, default `http://localhost:8104` | The execution service's address. The compose file sets it to `http://execution:8104`. | no |
| `BILLING_URL` | the gateway, the auth service | optional, default `http://localhost:8106` | The billing service's address: the gateway's route target, the entitlement lookup, and the address the auth service asks to sever a learner's transaction record. The compose file sets it to `http://billing:8106`. | no |
| `FRONTEND_URL` | the gateway | optional, default `http://localhost:3000` | The one origin the gateway answers CORS for. It is compared exactly. A request from any other origin gets no `Access-Control-Allow-Origin` header, and an `OPTIONS` preflight from any other origin is answered 403. | no |

**Two of these have no default and no safe fallback, and both stop the service
rather than degrade it:** `INTERNAL_API_KEY` and `AUTH_JWT_SECRET`. Everything
else in the table degrades to a documented default.

---

## 2. The auth service

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `DATABASE_URL` | the auth service | **required** | The service throws "Missing required env DATABASE_URL" and does not start. The compose file sets it to `AUTH_DATABASE_URL`. | **yes** (it carries the database password) |
| `BCRYPT_ROUNDS` | the auth service | optional, default `12` | The default cost factor. A value outside 4..15, or one that is not a number, falls back to 12. | no |
| `ACCESS_TOKEN_TTL_SECONDS` | the auth service | optional, default `300` | The access-token lifetime, clamped to 60..900. This window is the whole revocation story for an access token, because the token is stateless and nothing can invalidate one early. | no |
| `RESEND_API_KEY` | the auth service, the site, the monitor command | optional | No mail is sent. The request is still answered, the token is still stored, and one structured line says the mail was skipped and why. A deployment with no mail provider does not turn a password reset into an error. | **yes** |
| `RESEND_FROM` | the auth service, the monitor command | optional | No mail is sent, and the log says this variable is missing. The format is `"NEXORA <hello@nexora.dev>"`. The domain has to be verified in the provider's dashboard first. | no |
| `PUBLIC_SITE_URL` | the auth service, the site | optional, and required for the auth service to send a mail | The auth service cannot build the link the mail carries, so it skips the mail rather than sending a token to a host that is not this product. The site falls back to `http://localhost:5173`, which is correct locally and wrong for anything public. The same value configures both halves. | no |
| `PASSWORD_RESET_PATH` | the auth service | optional, default `/auth/password-reset/confirm` | The default path stands. A value that is not a path, or that carries its own query, is ignored. The origin of a mail that carries a live token is always `PUBLIC_SITE_URL`, whatever this says. | no |
| `VERIFY_EMAIL_PATH` | the auth service | optional, default `/auth/verify-email/confirm` | The default path stands. Same rule as the reset path. | no |
| `REVOCATION_PRUNE_INTERVAL_MS` | the auth service | optional, default `900000` (15 minutes) | The denylist, the deletion cut-offs and the retention schedule are swept on this interval, and once at boot as well. A value that is not positive means the sweep never runs, and the service says so in a warning at boot. | no |
| `NEXORA_REQUIRE_CONSENT` | the auth service | optional; on by default when `NODE_ENV=production` | A registration with no recorded terms acceptance, privacy acceptance and age affirmation is refused with a 400 naming each missing one. Set to `0` the refusal is off, and the account is created with no consent rows. | no |
| `OPERATOR_LEGAL_NAME` | the auth service, the billing service | optional | The export and the erasure receipt name the controller as the literal placeholder `[[ operator legal name — set before publishing ]]`. That string reaches a learner's data file, so it is a publication defect, not a cosmetic one. | no |

### 2.1 The LTI surface, on the auth service

The LTI 1.3 launch surface is served by the auth service, and it has its own
six variables. They are optional, and the surface is off until an institution
is registered.

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `LTI_BASE_URL` | the auth service | optional, default `http://localhost:8080` | The base URL the learning management system is told about, and the root the launch and complete URLs are built from. The default is the local gateway, which is wrong for a deployment. | no |
| `LTI_COMPLETE_URL` | the auth service | optional, default `${LTI_BASE_URL}/lti/complete` | The default stands. It is where the browser goes once a launch has been verified, so a wrong value sends the learner somewhere that is not the product. | no |
| `LTI_TOOL_KEY` | the auth service | optional | The private key the platform signs its LTI tool requests with. Without it the platform has no tool key, and the requests it would sign are not signed. It is a PKCS#8 PEM; literal `\n` is restored to a newline. | **yes** |
| `LTI_TOOL_KEY_ID` | the auth service | optional, default `tool-1` | The published key id, so a rotation does not orphan the key the platform registered with the institution. | no |
| `LTI_STATEMENT_ED25519_KEY` | the auth service | optional | The key the grade statements are signed with. Without it the statements carry no signature, and the institution cannot verify them. A PKCS#8 PEM; literal `\n` is restored to a newline. | **yes** |
| `LTI_STATEMENT_KEY_ID` | the auth service | optional, default `statement-ed1` | The published name of the statement key, so a rotation does not orphan the statements already signed. | no |

### 2.2 The test-only variables

These are read by the platform's own test suites and by nothing that runs in
a deployment. They are listed so that nobody sets them in a production
environment expecting them to do something.

| Variable | Read by | What it does |
|---|---|---|
| `NEXORA_E2E_ENV` | `scripts/verify.e2e.mjs` | Names the environment the end-to-end suite runs against. A test switch, not a deployment setting. |
| `SECRET_FOR_TEST` | `scripts/verify.mjs` | A secret the suite uses to exercise the secret-validation paths. A test fixture, not a deployment setting. |
| `npm_execpath` | `scripts/dev-stack.mjs` | The path npm was launched from, which the local stack reads to find its own toolchain. It is set by npm itself. |

---

## 3. The curriculum service

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `PORT` | the curriculum service | optional, default `8102` | The service listens on 8102. | no |

The curriculum service has no database and no other configuration. It serves a
synced snapshot from disk, and the snapshot is validated when the module loads,
so a malformed sync stops the service at boot rather than serving bad content.

---

## 4. The execution service

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `EXECUTION_RUNNER` | the execution service | optional in development, **a decision** in production | `subprocess` is refused at boot in production unless `EXECUTION_ALLOW_SUBPROCESS=1` is also set, because that tier runs learner code as a child of the process that holds `INTERNAL_API_KEY` and `DATABASE_URL`, in the same filesystem, network and process namespace. `docker` runs one container per job. A value that is neither is refused at boot. | no |
| `EXECUTION_ALLOW_SUBPROCESS` | the execution service | optional | The subprocess tier stays refused in production. Setting it to `1` is an explicit acceptance of the risk, and only for a host that does not also serve the public API. | no |
| `EXECUTION_CONCURRENCY` | the execution service | optional, default `2` | The number of jobs the in-process queue runs at once. It is in memory and not durable, so a restart loses the queued jobs. | no |
| `EXECUTION_DAILY_QUOTA` | the execution service | optional, default `200` | The number of executions one account may spend in a day. The synthetic check spends one per run, so the hourly cadence costs 24 of 200. | no |
| `EXECUTION_GO_CACHE` | the execution service | optional, path to a shared Go build cache | Every job gets a private cache: correct, and slower, because modern Go ships no precompiled standard library. The compose file sets it to `/opt/gocache`, which the image prewarms. The tradeoff is deliberate and documented in `.env.example`: cache keys are content-addressed, so a shared cache lets one learner's compilation be reused by another's. | no |
| `RECEIPT_ED25519_KEY` | the execution service | optional | Receipts carry the HMAC alone and offline verification is unavailable. The key endpoint answers 503 rather than faking a key. The value is a PKCS#8 PEM; the operator holds the private half and the execution service holds it alone. | **yes** |
| `RECEIPT_KEY_ID` | the execution service | optional, default `ed1` | The published key id, so a rotation does not orphan old receipts. | no |
| `RECEIPT_ED25519_PUBLIC_KEY` | the auth service | optional | The auth service verifies receipts when they are synced and never mints one, so it needs only the public half. Without it, synced receipts cannot be verified. The value is not secret, since it is published at `/api/execute/verify-key`, but it is configured in one place so a rotation is one write. | no (it is a public key) |

---

## 5. The billing service

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `DATABASE_URL` | the billing service | **required** | The service throws "Missing required env DATABASE_URL" and does not start. The compose file sets it to `BILLING_DATABASE_URL`. | **yes** |
| `BILLING_PLANS_JSON` | the billing service | optional | No plans are loaded, so there is nothing to read and nothing to check out against. The value is a JSON object of `slug -> { product_id, name }`; a product id that is not a string is refused at boot. | no |
| `DODO_PAYMENTS_BASE` | the billing service | optional, default `https://test.dodopayments.com` | The sandbox. Pointing it at `https://live.dodopayments.com` is what turns on the test-mode guard, which then refuses a sandbox payment as entitlement. | no |
| `DODO_PAYMENTS_API_KEY` | the billing service | optional | Checkout answers 503 with a clear message, and the plan and subscription reads still work. | **yes** |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | the billing service | optional | Inbound webhooks cannot be verified, so they are refused. The value must start with `whsec_`, and the HMAC key is the base64-decoded remainder, per Standard Webhooks. | **yes** |
| `DODO_BUSINESS_ID` | the billing service | optional | The tenancy guard is off. With it off, a correctly signed event from a different merchant is honoured rather than ignored, which is the failure it exists to prevent. | no |
| `OPERATOR_LEGAL_NAME` | the billing service | optional | The same placeholder string reaches the billing surface. | no |

---

## 6. The site (`nexora-svelte`)

The site reads its environment in two ways, and the difference matters. A
`PUBLIC_` variable is read through `$env/dynamic/public` and is therefore
**baked into the client bundle at build time**: it reaches the browser, and a
secret must never be one. A server-side variable is read through
`$env/dynamic/private` or `process.env` and stays on the server.

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `PUBLIC_API_URL` | the site, the browser | **required for anything but local mode** | The site runs in local mode: progress, drafts and evidence live in the browser, and the pages say so. It is the browser's route to the gateway, so it must be the address a browser can reach, not the address the app server can reach. | no (it is public) |
| `GATEWAY_URL` | the site server | optional; the site's `.env.example` says to set it for compose | The site falls back to `PUBLIC_API_URL`. That fallback is right for `vite dev` and wrong for a container, because inside the container `127.0.0.1` is the container itself. A wrong value here looks like sign-in failing with "the sign-in service did not answer" while every other page looks healthy. | no (it is server-side) |
| `PUBLIC_SITE_URL` | the site, the auth service | optional, but a public deployment must set it | The site falls back to `http://localhost:5173` for every generated URL: `/sitemap.xml`, `/robots.txt`, each page's canonical link, the URL on the social card, and the link the mail carries. It must be set **where the build runs**, not only where the server runs, because those pages are prerendered and bake the build-time value. | no (it is public) |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | the site, the browser | optional | The site keeps the local email and password forms, or shows the not-connected plate. A Clerk publishable key (`pk_test_` / `pk_live_`) is safe to bake into the client. The secret key must never be a `PUBLIC_` variable. | no (it is public by design) |
| `PUBLIC_IDE_DOWNLOAD_URL` | the site, the browser | optional | The download page says the desktop build is not published yet and points at the browser curriculum, rather than rendering a dead link. | no (it is public) |
| `RESEND_API_KEY` | the site server | optional | No mail is sent from the site. The send is skipped and one structured line says so, and the app keeps working. | **yes** |
| `VERCEL` | the site's build | optional, and it must be **unset** for a compose deployment | Vercel sets it in its own build environment, and nothing else does. The site's `svelte.config.js` reads it to choose the adapter: set, it builds the Vercel output; unset, it builds the standalone `build/` directory that the container runs with `node build`. A build with it set produces an image the compose stack cannot start. | no |

The site also builds and serves its own Content-Security-Policy, through
SvelteKit's `kit.csp` configuration. It is a hash on a prerendered page and a
nonce on a page rendered at request time, and it is enforced rather than
report-only. The edge does not set a second one, because two policies
intersect and the stricter wins.

The site does **not** read `RESEND_FROM`: the from address is a constant in
`src/lib/mail.ts` (`NEXORA <nexora@nexora.dev>`). The auth service's
`RESEND_FROM` is the one that can be changed.

---

## 7. The operator commands

These are run on the host, not inside a container, and they are the ones a
crontab uses. They read their own variables rather than the services'.

| Variable | Read by | Required | If absent | Secret |
|---|---|---|---|---|
| `HEALTHCHECK_URL` | `npm run healthcheck` | optional, default `http://127.0.0.1:${GATEWAY_PORT or 8080}` | The default. The command asks the gateway's `/health/deep` and exits 0 healthy, 1 the edge reports a problem, 2 the check could not ask. | no |
| `SYNTHETIC_URL` | `npm run synthetic` | optional, same default | The default. The command walks the journey a learner walks and uses the same three exit statuses. | no |
| `SYNTHETIC_EMAIL` | `npm run synthetic`, `npm run alerts` | **required** for the synthetic check | The check cannot ask, and exits 2. The account is created once with `node scripts/synthetic.mjs --provision`. | no |
| `SYNTHETIC_PASSWORD` | `npm run synthetic`, `npm run alerts` | **required** for the synthetic check | The check cannot ask, and exits 2. It is a credential for a real account, so it belongs in the environment and not in a flag, where it is visible in the process list. | **yes** |
| `SYNTHETIC_PHASE` | `npm run synthetic` | optional, default the first phase the manifest lists | The default. | no |
| `MONITOR_TO` | `npm run monitor` | **required** for the monitor to alert | The monitor runs both checks, reports nothing, and prints "MONITOR_TO is not set, so nobody was told". | no |
| `MONITOR_STATE` | `npm run monitor` | optional, default `.monitor-state.json` next to the script | The default. The file records what the last run reported, so the monitor only speaks when the state changes. It must be writable, or every run looks like the first one. | no |
| `RESEND_API_KEY`, `RESEND_FROM` | `npm run monitor` | required for the monitor to send | The monitor reports the failure and exits 2. | `RESEND_API_KEY` is **yes** |
| `AUTH_DATABASE_URL` | `npm run metrics`, `npm run alerts`, `npm run operator` | optional for each; `metrics` needs it to report | `metrics` exits 2, it does not print zeros. `alerts` prints a "not configured" skip, because a deployment mid-setup is not a breach. | **yes** |
| `BILLING_DATABASE_URL` | `npm run metrics`, `npm run alerts` | optional | As above. The subscription numbers are missing without it. | **yes** |
| `DATABASE_URL` | `npm run operator` | optional | The operator command's own database. | **yes** |
| `BACKUP_URL` | `npm run backup` | **required**, unless `--url` is passed | The command prints its usage and exits 2. | **yes** |
| `BACKUP_DIR` | `npm run backup` | **required**, unless `--dir` is passed | The command prints its usage and exits 2. The compose `backup` service sets it to `/backups`, which is a named volume. | no |
| `DRILL_URL` | `npm run drill` | **required**, unless `--url` is passed | The command exits 2. | **yes** |
| `INTERNAL_API_KEY` | `npm run operator`, `npm run cohort:activate` | required for the operator and cohort commands | The command cannot authenticate to the mesh, so it exits 2. | **yes** |

---

## 8. The check: rotated away from every example

The question this section answers is narrow and factual: does a real secret
appear in `.env.example`, in an image's build arguments, or anywhere in the
repository's history? It was checked on 2026-10-20 against the working tree and
against all 33 commits in `git rev-list --all`.

### 8.1 `.env.example`

`platform/.env.example` and `nexora-svelte/.env.example` hold no real secret.
What they hold:

- `AUTH_JWT_SECRET=change-me-to-32-plus-random-characters` and
  `INTERNAL_API_KEY=change-me-internal-mesh-key`. Both are placeholders, and
  both are **refused at boot in every environment**, not only in production.
  `assertSecret` in the chassis rejects a value under 32 characters and a value
  matching `change[ _-]?me`, `changeme`, `replace[ _-]?me` or `placeholder`;
  `resolveMeshKey` applies the same rule to the mesh key. A deployment that
  copied the example therefore fails with a message naming the variable, rather
  than coming up with a secret that is published in the repository.
- `POSTGRES_PASSWORD=nexora`, which is the literal example password. It is
  not a secret in the sense of a production credential, and it is not the
  password of anything, but it is also not a value to ship: the compose file
  requires `POSTGRES_PASSWORD` to be set (`${POSTGRES_PASSWORD:?set
  POSTGRES_PASSWORD}`), and the example's value satisfies that check. **Change
  it.**
- `RESEND_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `DODO_PAYMENTS_API_KEY`
  and `DODO_PAYMENTS_WEBHOOK_SECRET` are present but empty. An empty value is
  not a secret, and the code treats an empty provider key as "not configured",
  which skips the mail or the checkout rather than failing.
- `BILLING_PLANS_JSON` holds `pdt_29_monthly_PLACEHOLDER` and
  `pdt_290_annual_PLACEHOLDER`. These are fake product ids, present so the
  configuration shape is real and testable. They cannot be checked out against
  the provider, and they must never be published to a customer.
- `RECEIPT_ED25519_KEY` and `RECEIPT_ED25519_PUBLIC_KEY` are commented out, and
  the comments show the command that generates them.

### 8.2 Image build arguments

`platform/Dockerfile` declares exactly one build argument, `SERVICE`, which
selects the entrypoint. `nexora-svelte/Dockerfile` declares none. No secret is
passed as a build argument, and no secret is baked into an image layer: the
compose files mount `.env` at run time with `env_file`, and the images set only
`NODE_ENV`, `SERVICE`, `PORT` and `HOST`.

The base images the two Dockerfiles build `FROM` are `node:22-alpine`, which is
a moving minor tag rather than a digest. The digest for the image that tag
resolved to on 2026-10-20 is `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`.
Pinning the Dockerfiles to that digest is a change to files this work did not
touch, so it is recorded here as an open item rather than done. See
`docker-compose.production.yml` for the same note about the `postgres` image,
which is pinned there.

### 8.3 The repository's history

Every revision in `git rev-list --all` was searched with `git grep`. The
searches and their results:

| Search | Result |
|---|---|
| `git log --all --name-only -- '*.env' '*.env.local'` | no output. No `.env` or `.env.local` file has ever been tracked. |
| Provider key shapes: `re_[A-Za-z0-9]{16,}`, `pk_live_...`, `sk_live_...`, `whsec_[A-Za-z0-9+/=]{20,}` | no matches in any revision. |
| Assignments of the secret variables: `^(AUTH_JWT_SECRET\|INTERNAL_API_KEY\|POSTGRES_PASSWORD\|RESEND_API_KEY\|DODO_PAYMENTS_API_KEY\|DODO_PAYMENTS_WEBHOOK_SECRET\|CLERK_SECRET_KEY\|RECEIPT_ED25519_KEY)=` | no matches in any revision. |
| Database URLs carrying a password: `postgres(ql)?://[^:]+:[^@]+@` | no matches in any revision. |
| Private key material: `BEGIN (PRIVATE KEY\|ED25519\|ENCRYPTED PRIVATE KEY)` | no matches in any revision. |
| Sixty-four hex characters assigned to anything: `=[0-9a-f]{64}` | no matches in any revision. |
| Provider product ids: `pdt_[A-Za-z0-9_]+` | no matches in any revision. |

`.gitignore` lists `.env` and `.env.local`, and `platform/.local/`, so the
working-tree files that do hold generated secrets are outside the tracked set.
Those working-tree files are `platform/.env`, `platform/.env.local` and
`nexora-svelte/.env`. They hold real 64-character hex values for
`AUTH_JWT_SECRET` and `INTERNAL_API_KEY` on this machine. They are not in the
history and they are not in the images.

**Conclusion: no real secret has ever been committed to this repository, and
none is present in any example or build argument.** There is nothing to rotate
away from the history.

### 8.4 The one case that does need a rotation

There is a case the history check does not cover, and it is the likely one in
practice. A VPS is provisioned by copying a directory, and a directory copied
from a developer's machine carries that machine's `.env` with it, generated
secrets included. A secret that has been on a laptop, in a screen share, or in
a backup of a laptop is a secret that has to be replaced, whether or not it was
ever in git.

The rotation step, in order, for a deployment whose `.env` may have travelled:

1. Generate replacements on the target host, not on the machine the old values
   came from:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   One value for `AUTH_JWT_SECRET`, one for `INTERNAL_API_KEY`, and one for
   `POSTGRES_PASSWORD`.
2. Write them into `platform/.env` on the target host, and set
   `AUTH_DATABASE_URL` and `BILLING_DATABASE_URL` to carry the new database
   password in them. Both URLs carry the password, so both change.
3. Change the database's own password to match:
   ```bash
   docker compose exec -T postgres psql -U nexora -d authdb \
     -c "ALTER USER nexora WITH PASSWORD '<new>';"
   ```
4. Roll: `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d`.
   Every service reads the mesh key at boot, so all of them restart.
5. Expect the two consequences, both of them by design. Rotating
   `INTERNAL_API_KEY` invalidates every HMAC run receipt, because the receipt
   key is derived from it; the Ed25519 half, if configured, is unaffected.
   Rotating `AUTH_JWT_SECRET` invalidates every access token, so learners are
   signed out; the refresh families still work, so a silent re-sign-in follows.
6. If the old values were ever in git rather than only on a disk, removing them
   from the history is not enough on its own. Rotate first, then rewrite the
   history, and treat the old values as burned from the moment they are
   replaced.

---

## 9. Named in an example, read by no code

Four variables appear in an example file and are read by nothing. They are
listed here because an operator reading `.env.example` will set them and expect
them to do something.

| Variable | Named in | Read by | What it does |
|---|---|---|---|
| `EXECUTION_DEFAULT_TIMEOUT_MS` | `platform/.env.example` | `platform/scripts/dev-stack.mjs` only | It configures the local development stack. The execution service does not read it, so setting it in a deployment changes nothing. |
| `NEXORA_AI_URL`, `NEXORA_AI_KEY`, `NEXORA_AI_MODEL`, `NEXORA_AI_ALLOW_APP_ROUTE` | `nexora-svelte/.env.example` | nothing | The AI tutor route described in that example is not in the code in this repository. The site's tutor path goes through the platform's own `/api/tutor/ask` behind the gateway, and no variable in the list switches it on. |
| `PROGRESS_URL`, `TUTOR_URL`, `PROGRESS_DATABASE_URL`, `TUTOR_DATABASE_URL` | `platform/.env` (the untracked working-tree file) | nothing | There is no progress service and no tutor service in the compose file. The compose file's services are postgres, auth, curriculum, execution, billing, gateway, frontend, and the two job profiles `backup` and `drill`. |

---

## 10. Where each one is set

For the production deployment, this is the whole list of places a value comes
from. The compose files pass `.env` to every service with `env_file`, and the
production override changes no `environment` block.

| Source | What it carries |
|---|---|
| `platform/.env` (mounted, never baked) | every secret and every environment-specific value: `AUTH_JWT_SECRET`, `INTERNAL_API_KEY`, `POSTGRES_PASSWORD`, `AUTH_DATABASE_URL`, `BILLING_DATABASE_URL`, the provider keys, `FRONTEND_URL`, `TRUST_PROXY`, the service URLs, the execution settings, `PUBLIC_SITE_URL`, `FATAL_WEBHOOK_URL`. |
| `platform/docker-compose.yml`, per service | `NODE_ENV=production` and `PORT`, set on the service rather than left to `.env`. `DATABASE_URL` for the two services that have a database. `EXECUTION_GO_CACHE=/opt/gocache` for the execution service. `DODO_BUSINESS_ID` for the billing service. `PUBLIC_API_URL` and `GATEWAY_URL` for the frontend. |
| `platform/docker-compose.production.yml` | the production posture: loopback bindings, resource limits, the read-only root filesystem, the dropped capabilities, the log rotation. It adds no variables. |
| `nexora-svelte/.env` (mounted into the frontend container) | `PUBLIC_API_URL`, `GATEWAY_URL`, `PUBLIC_SITE_URL`, and `PUBLIC_CLERK_PUBLISHABLE_KEY` if Clerk sign-in is offered. The `PUBLIC_` values are also needed **at build time**, because the prerendered pages bake them. |
| The Caddy process's own environment | `FRONTEND_URL`, read by the Caddyfile as `{$FRONTEND_URL}` for the exact-origin CORS set. It must be exported in the Caddy service's environment, not only in `.env`, because Caddy does not read `.env` files. |
