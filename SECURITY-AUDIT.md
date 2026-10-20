# NEXORA — Security Audit

**Target:** `branchcraft/platform` (Fastify service mesh) + `branchcraft/nexora-svelte` (SvelteKit learner app)
**Method:** source-first review of the trust boundaries between browser, gateway, services, Postgres, the code runner, and the payment/auth vendors. Applied the evidence discipline of the `security-audit` skill: only source-grounded boundary violations are given a severity; hardening gaps are listed under *Missing Security Controls* instead of being inflated into findings.
**Companion audited but out of scope for findings:** `nexora-ide` (VS Code fork), `company/*.md` (planning docs).

**Not done / needs validation:** no live host testing, no dependency-CVE scan executed, no fuzzing. Where a finding depends on a deployment fact that is documented but not provable from source alone, that condition is stated inside the finding.

---

## 1. Critical Findings

### C-1. The hosted code runner is not an isolation boundary — learner code executes on the platform host and can steal the mesh key

**Severity:** Critical
**Vulnerable component:** `platform/services/execution/src/runners/subprocess.ts`, `platform/services/execution/src/index.ts`, `platform/docker-compose.yml`, `platform/docs/DEPLOYMENT.md`, `platform/services/auth/src/routes.ts`

**Attack scenario**
1. Register an account. `POST /api/auth/register` is reachable with no authentication (`/api/auth` is `auth: false` at the gateway), needs no email verification, no CAPTCHA, and no invite. The only control is a rate limit.
2. Call `POST /api/execute/execute` with `language: "go"` (or `node`/`python`) and your own source. The gateway authenticates you and the runner executes it.
3. In that program, read the parent process's environment and `DATABASE_URL`:
   ```
   /proc/1/environ        # execution service env: INTERNAL_API_KEY, DATABASE_URL, ...
   ```
   The service runs as `USER app` (see `platform/Dockerfile`) and the learner child is spawned **by that same UID**, so `/proc/1/environ` is readable. Docker `env_file` injects the `.env` values as environment variables of PID 1 — the exact values the whole mesh trusts.
4. The child also has full outbound network access (no `--network none` in this tier) and an unconfined filesystem (only its CWD is a temp dir), so it can reach `169.254.169.254` (cloud metadata), the other services, or any egress.

**Impact**
`INTERNAL_API_KEY` is simultaneously (a) the mesh bearer key every service accepts as `x-internal-key`, and (b) the seed for the run-receipt signing key (`receiptKey()` = `HMAC(INTERNAL_API_KEY, "nexora/run-receipt/v1")`). Holding it means:
- **Impersonate any user inside the mesh** — services trust the bare `x-user-id` header (`requireUserId`), so read/write any learner's profile, code, run history, and evidence.
- **Forge run receipts** for programs never run → fabricate "the platform proved I ran this" evidence for any mission, defeating the product's central integrity claim.
- **Grant yourself the paywall** by sending `x-entitled: 1` to `/api/curriculum/ide/phases/:id`.
- **Direct database access** (`DATABASE_URL`) and lateral movement from the host.
- Cross-tenant Go build-cache poisoning: `/opt/gocache` is `chown`ed to `app` and used for all learners (documented tradeoff, but now reachable from learner code).

**Evidence**
```ts
// services/execution/src/index.ts — the default when nothing is configured
const runner = (process.env.EXECUTION_RUNNER ?? "subprocess") as "subprocess" | "docker";
```
```ts
// services/execution/src/runners/subprocess.ts
// Env is scrubbed only FOR THE CHILD; nothing confines its filesystem or network.
const child = spawn(job.command[0], job.command.slice(1), {
  cwd: workdir,
  env: scrubbedEnv(job, workdir),
  stdio: ["pipe", "pipe", "pipe"],
});
```
`docker-compose.yml` mounts **no** `docker.sock` (deliberately), so the `docker` tier 503s as shipped — and `docs/DEPLOYMENT.md` nonetheless offers `EXECUTION_RUNNER=subprocess` as a production option ("the host toolchain (`EXECUTION_RUNNER=subprocess`) or one container per job (`docker`)"). In practice `subprocess` is the only tier that works out of the box, and it is the default.
```sql
-- services/auth/migrations/001_init.sql — registration is open by design
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
```
There is no email-verification step anywhere in the auth service, so step 1 is genuinely open to the internet.

**Fix**
- Make the isolated tier the only production tier. Do not allow `EXECUTION_RUNNER=subprocess` when `NODE_ENV=production`; refuse to boot instead, or gate it behind an explicit `EXECUTION_ALLOW_SUBPROCESS_I_UNDERSTAND=1`.
- Make the `docker` tier actually usable in production: run the runner on a dedicated host/worker, and give the runner's daemon socket a constrained proxy rather than the host socket. Add `--network none` (already present), keep `--read-only` for Go as well (build into a tmpfs cache instead of the container layer), and add `--user 65534 --cap-drop ALL --security-opt no-new-privileges` (partially present).
- Even for the subprocess tier, drop the child below the service UID (`setuid`/unshare) and mount `/proc` with `hidepid`, or run the runner in a PID/user namespace with no network namespace access to the mesh.
- Never let learner code run in the same container that holds mesh credentials: split "toolchain" from "secret-bearing process", or move `INTERNAL_API_KEY` to a file readable only by the service user and mount `/proc` `hidepid=2`.

**Prevention**
Treat "runs arbitrary code" as a separate trust zone with its own credentials, its own network namespace, and no ambient secrets. Add a CI check that asserts the production runner is not `subprocess`, and a runtime assertion that the runner process cannot read its parent's environ.

---

## 2. High Severity Findings

### H-1. All clients share one rate-limit bucket on the login path — unauthenticated platform-wide login denial, and no per-account brute-force lockout

**Severity:** High
**Vulnerable component:** `platform/services/auth/src/routes.ts`, `platform/packages/service-kit/src/index.ts`, `platform/services/gateway/src/proxy.ts`

**Attack scenario**
`auth/src/routes.ts` throttles logins by `req.ip` (10 per 60s). Every internal service is created with `trustProxy: true`, so `req.ip` is derived from `X-Forwarded-For` — but the gateway **strips** `x-forwarded-for` from client requests and never adds its own (`NEVER_FORWARDED` in `proxy.ts`). With no header present, `req.ip` resolves to the socket peer: the gateway container's address, identical for every request from every user.

An attacker sends 11 login requests per minute. The single shared bucket trips, and **every** legitimate user's login returns `429 Too many login attempts` for the remainder of the window — indefinitely, at negligible cost. Conversely there is no per-account throttle at all, so credential stuffing against one account is bounded only by the shared bucket, and a successful login still increments the counter (a legitimate user can lock themselves and everyone else out).

**Impact**
- Unauthenticated remote denial of the login function for the whole platform (availability).
- No meaningful per-account brute-force protection or lockout.
- Not detectable as an attack: see *Missing Security Controls* (no auth audit log or alerting).

**Evidence**
```ts
// packages/service-kit/src/index.ts
const app = Fastify({ /* ... */ trustProxy: true });
```
```ts
// services/gateway/src/proxy.ts
const NEVER_FORWARDED = new Set(["authorization","cookie","host","x-user-id",
  "x-entitled","x-internal-key","x-request-id","x-forwarded-for", /* ... */]);
```
```ts
// services/auth/src/routes.ts
function loginAllowed(ip: string): boolean { /* 10 per 60_000 ms per ip */ }
app.post("/login", async (req, reply) => {
  if (!loginAllowed(req.ip)) throw new ApiError(429, "rate_limited", "Too many login attempts. Wait a minute.");
```

**Fix**
- Key the limiter on a value the gateway deliberately forwards and the service can trust — e.g. have the gateway inject `x-client-ip` after resolving the real client (from its own `trustProxy` setting) and have services read *that*, never the raw `X-Forwarded-For`. Document it as identity-bearing, and add it to `NEVER_FORWARDED` so clients cannot set it.
- Add a **per-account** throttle and lockout keyed on the normalized email (e.g. 5 failures / 15 min, exponential backoff, then a cooldown), independent of the IP bucket.
- Do not count successful logins toward the failure budget; reset the counter on success.
- Add a bounded sweep (or TTL map) to `loginHits` so entries expire.
- Fix the same class in the gateway: `TRUST_PROXY` defaults to `0`, so an operator who puts a proxy in front but leaves the default collapses *all* clients into one bucket for the global (600/min) and per-route limiters too — the same global-DoS shape. Fail loudly at boot when a proxy is detected but `TRUST_PROXY=0`, or derive it from the socket.

**Prevention**
One rule: *rate-limit keys must come from a header the edge owns, never from client input and never from an ambiguous proxy chain.* Add a regression test that two different clients get independent buckets and that one noisy client cannot lock out another.

### H-2. Documented placeholder secrets pass production validation — forgeable tokens for any user, plus a known mesh key

**Severity:** High
**Vulnerable component:** `platform/.env.example`, `platform/services/gateway/src/config.ts`, `platform/services/auth/src/crypto.ts`, `platform/packages/service-kit/src/index.ts`, `branchcraft/README.md`

**Attack scenario**
The README's own run instructions are `cp .env.example .env`. The shipped defaults are placeholders that **satisfy every validation check**:
- `AUTH_JWT_SECRET=change-me-to-32-plus-random-characters` → 38 chars, passes `jwtSecret.length < 32` in both `gateway/config.ts` and `auth/crypto.ts`.
- `INTERNAL_API_KEY=change-me-internal-mesh-key` → non-empty, so `createService` and the gateway both consider the mesh **configured** and enforce it with a value published in the repository.
- `POSTGRES_PASSWORD=nexora` (in the `AUTH_DATABASE_URL` template).

If an operator copies the file and misses a line, the attacker knows `AUTH_JWT_SECRET` and forges an HS256 access token with `sub` set to **any** user id — the gateway derives identity solely from `sub` (`localVerifier`) and the auth service trusts it. They also know `INTERNAL_API_KEY`, which reproduces every capability in C-1 with no execution sandbox required.

**Impact**
Full account takeover of arbitrary users (including paid subjects), paywall bypass via `x-entitled`, forged run receipts, and read/write of all learner data — all from a public file in git history, with no exploit chain.

**Evidence**
```ts
// services/auth/src/crypto.ts
if (s.length < 32) throw new Error("AUTH_JWT_SECRET must be at least 32 characters");
```
```ts
// packages/service-kit/src/index.ts — a placeholder counts as "configured"
const meshKey = process.env.INTERNAL_API_KEY ?? "";
if (isProd && !meshKey) throw new Error("INTERNAL_API_KEY is required in production");
```
`.env.example` even says "Never commit real secrets", but the defaults it supplies are *accepted* secrets.

**Fix**
- Reject known placeholder values explicitly at boot: fail if the value contains `change-me`, `replace_me`, `example`, or matches a small denylist, in every environment (and always in production).
- Require real entropy, not length: e.g. require ≥32 chars **and** ≥16 distinct characters, or generate the secret on first boot and print it once.
- Make the mesh key mandatory regardless of `NODE_ENV` (see M-3), so a placeholder in a non-production env cannot silently enable a known-key mesh.
- Remove the copy-paste-equals-working path: have the README instruct `node -e "require('crypto').randomBytes(32).toString('hex')"` (already documented) and make `npm start`/compose generate `.env` if absent.
- Rotate any environment that has ever run with these values — `AUTH_JWT_SECRET` and `INTERNAL_API_KEY` cannot be "un-leaked".

**Prevention**
Add a startup self-test that logs a **fatal** error for placeholder secrets, and a CI grep that fails if a value in `.env.example` is accepted by the production validators. (The local `platform/.env` in this checkout already contains real generated secrets; it is correctly gitignored — but it will have leaked into any image build that copied the context, so audit the build context and rotate as a precaution.)

### H-3. The app's own `/api/tutor` route is an unauthenticated, unthrottled proxy to the paid LLM

**Severity:** High
**Vulnerable component:** `nexora-svelte/src/routes/api/tutor/+server.ts`

**Attack scenario**
SvelteKit exposes `POST /api/tutor` on the app origin (publicly reachable behind the documented TLS proxy). The handler authenticates nobody, rate-limits nobody, and checks no origin or CSRF token. It takes the caller's `missionId`, `code`, `failingChecks`, and `errorOutput`, interpolates them into a prompt, and calls the configured provider with the **server-side** `NEXORA_AI_KEY`. Anyone can loop it. Because `code` and `errorOutput` are fully caller-controlled and injected verbatim into the prompt, it is also a free, operator-funded, general-purpose chat endpoint (system-prompt injection for whatever the caller wants).

**Impact**
- Direct financial abuse: unauthenticated spend of the operator's AI quota, scriptable at high volume; a provider-side rate limit or ban is the blast radius, and the platform's own tutor degrades.
- Unbounded concurrency on the app server (each call holds a socket for up to 20 s), a cheap resource-exhaustion vector against the frontend.
- The same key is used by the mesh tutor service, so exhausting or having it revoked breaks legitimate learners.

**Evidence**
```ts
// src/routes/api/tutor/+server.ts — no auth, no limit, no CSRF/origin check
export const POST: RequestHandler = async ({ request }) => {
  let body: { missionId?: string; code?: string; /* ... */ };
  body = await request.json();
  const endpoint = env.NEXORA_AI_URL;
  const apiKey = env.NEXORA_AI_KEY;
  /* ... */
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, /* ... */ messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
```
Contrast with the platform path, which is `auth: true` and limited to 120/min at the gateway (`gateway/src/config.ts`) — the frontend route bypasses that entirely.

**Fix**
- Delete the route and let the app call the authenticated mesh endpoint (`/api/tutor/ask` via `PUBLIC_API_URL`), which already has auth, a gateway rate limit, and a DB audit row. This is the smallest fix and removes a duplicate code path.
- If the local/OFFLINE fallback must stay, gate the provider call: require a session, cap body size, apply a per-IP and per-session limit, verify a same-origin `Origin`/`Sec-Fetch-Site`, and enforce an in-process concurrency cap.
- Never let the app process inject the prompt: keep caller text in a delimited, escaped region and treat it as data (the mesh service already slices it — mirror that and add a size cap on this route too).

**Prevention**
One rule: *any route in the frontend app that spends money or reaches a third party must be authenticated and throttled.* Add a lint/test that fails when a `+server.ts` performs an outbound fetch with a secret without an auth guard.

---

## 3. Medium Severity Findings

### M-1. Logout does not revoke the access token; access tokens are unrevocable for their whole lifetime

**Severity:** Medium
**Vulnerable component:** `platform/services/auth/src/routes.ts` (`/logout`), `platform/services/auth/src/crypto.ts`, `platform/services/gateway/src/auth.ts`

**Attack scenario.** `POST /auth/logout` revokes only the refresh-token row; the 15-minute HS256 access token carries no `jti` and no denylist, and the gateway verifies it statelessly. An attacker holding a captured access token (e.g. via the shared-device / XSS-adjacent paths below, or a logged request) continues to act as the victim for up to 15 minutes *after* the victim logs out, and the victim has no way to cut it short — revoked refresh families do not help, because the access token is validated independently.

**Impact.** A false sense of session termination; a window in which a known-compromised session cannot be killed. Bounded to ≤15 minutes, hence Medium, not High.

**Evidence.**
```ts
app.post("/logout", async (req) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [sha256(parsed.data.refreshToken)]);
  }
  return { ok: true };   // access token untouched
});
```

**Fix.** Shorten the access-token TTL (2–5 min) and/or add a `jti` + a small revocation set checked at the gateway for the token's remaining life. On logout, revoke the presented token's `jti`. On refresh-token-reuse detection (already implemented) also revoke every access token minted from that family by tracking `jti`s per family.

**Prevention.** Write down the revocation story for access tokens in the trust model; a stateless token that cannot be revoked should be explicitly accepted as such, with a TTL chosen to make it acceptable.

### M-2. The "bounded" execution queue is unbounded in depth — no backpressure, no saturation response

**Severity:** Medium
**Vulnerable component:** `platform/services/execution/src/queue.ts`, `platform/services/execution/src/routes.ts`

**Attack scenario.** `JobQueue.run` bounds *concurrency* but not the `waiting` array; there is no maximum queue length and no `503` when saturated. With many accounts (open registration, C-1) or many concurrent calls, requests pile up awaiting a slot. Each waiting request holds a client socket and a Node promise for the full gateway timeout (35 s), and the caller is told nothing until the timeout. The comment claims "Backpressure instead of unbounded spawning (fork-bomb resistance)" — true for jobs, false for the queue.

**Impact.** Memory and socket growth under load with no admission control; a cheap amplification of the per-route limit (60/min/IP) across many IPs/accounts. A shared-service availability problem.

**Evidence.**
```ts
async run<T>(job: () => Promise<T>): Promise<T> {
  if (this.running >= this.concurrency) {
    await new Promise<void>((resolve) => this.waiting.push(resolve));   // unbounded
  }
```

**Fix.** Add a `maxDepth` (e.g. `concurrency * 4`); reject with `503 runner_saturated` and a `Retry-After` when full. Expose `queueDepth` in `/capabilities` (already returned) and alert on it. Cap concurrent connections at the gateway for this route prefix.

**Prevention.** Any queue that claims to be bounded must assert bounds on both running jobs and waiting jobs, with a test for the saturated path.

### M-3. Mesh authentication can be silently disabled, and identity inside the mesh is an unsigned header

**Severity:** Medium
**Vulnerable component:** `platform/packages/service-kit/src/index.ts`, `platform/docker-compose.yml`, `platform/services/*/src/routes.ts`

**Attack scenario.** `createService` requires `INTERNAL_API_KEY` only when `NODE_ENV === "production"`; otherwise it logs a warning and **serves every route with no authentication at all**, trusting the client-supplied `x-user-id` as the authenticated user. `docker-compose.yml` does not set `NODE_ENV` in any service's `environment:` block — it relies on it coming from `.env`. A deployment whose `.env` omits `NODE_ENV=production` (compose exports services on the compose network, and the gateway target URLs are `http://auth:8101` etc.) therefore exposes unauthenticated internal APIs that believe any `x-user-id`. Anyone who reaches the compose network — including learner code under C-1 — gets full cross-user read/write.

Separately, even in production the model is a single shared bearer key plus a bare `x-user-id` header, with no TLS or mTLS inside the mesh, so a compromise anywhere in the network yields impersonation of every user.

**Impact.** Complete tenant-isolation failure (IDOR across all users) if the environment is misconfigured; otherwise a single-key, no-mutual-auth design that widens every other finding.

**Evidence.**
```ts
const isProd = (process.env.NODE_ENV ?? "development") === "production";
const meshKey = process.env.INTERNAL_API_KEY ?? "";
if (isProd && !meshKey) throw new Error("INTERNAL_API_KEY is required in production");
/* ... */
app.addHook("onRequest", async (req) => {
  if (req.url.startsWith("/health/")) return;
  if (!meshKey) { req.log.warn("INTERNAL_API_KEY unset — mesh auth disabled (development only)"); return; }
```
```yaml
# docker-compose.yml — no NODE_ENV in any service environment block
  auth:
    environment:
      PORT: 8101
      DATABASE_URL: ${AUTH_DATABASE_URL}
```

**Fix.** Fail closed unconditionally: require `INTERNAL_API_KEY` in every environment, or require an explicit `MESH_AUTH_INSECURE=1` opt-out for local dev. Set `NODE_ENV=production` explicitly in each compose service block (not just via `.env`). Replace the bare `x-user-id` header with an assertion the gateway signs (HMAC over `user-id|freshness|entitled`, verified per service) so identity cannot be forged even by a network peer; add mTLS or per-service keys.

**Prevention.** Secret-bearing services should never have an "auth off" mode reachable by omitting configuration. Make insecure mode require a positive, ugly, explicit flag.

### M-4. Billing webhook dedupe is a TOCTOU race

**Severity:** Medium
**Vulnerable component:** `platform/services/billing/src/routes.ts` (`/webhooks/dodo`)

**Attack scenario.** Dedupe is two separate statements with no transaction or unique-claim: `SELECT 1 FROM billing_events WHERE event_id = $1`, then `processEvent(...)`, then `INSERT ... ON CONFLICT DO NOTHING`. Two concurrent deliveries of the same event (vendor retry overlapping the first attempt, or an attacker replaying within the 5-minute skew window) can both pass the `SELECT`, both apply state, and only then collide on the insert. Distinct events can also interleave out of order (`subscription.cancelled` overtaking `subscription.active`), leaving the row in a state the vendor did not intend — i.e. entitlement flapping.

**Impact.** Duplicate/out-of-order application of money events. Because the subscription upsert is last-write-wins, a stale event can both grant and revoke access incorrectly. Signature verification itself is sound (constant-time, `whsec_` handling, `business_id` and `test_mode` guards), so this is a robustness/integrity issue rather than an authentication bypass.

**Evidence.**
```ts
const seen = await pool.query("SELECT 1 FROM billing_events WHERE event_id = $1", [eventId]);
if (seen.rowCount) return { ok: true, duplicate: true };
await processEvent(pool, app.log, { type, data: event.data });
await pool.query("INSERT INTO billing_events (event_id, type, payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [...]);
```

**Fix.** Claim the event atomically before acting: `INSERT INTO billing_events (event_id, type, payload) VALUES (...) ON CONFLICT DO NOTHING RETURNING event_id` inside the same transaction as `processEvent`; if nothing was returned, it is a duplicate — skip. Persist the vendor's event ordering/timestamp and ignore an event older than the stored one.

**Prevention.** Idempotency must be a single atomic claim in the same transaction as the effect, not a read-then-write.

---

## 4. Low Severity Findings

### L-1. Reflected parser details and validation `details` in error envelopes

**Severity:** Low
**Vulnerable component:** `platform/services/gateway/src/index.ts` (error handler), `platform/packages/service-kit/src/index.ts` (`parseOr400`)

**Attack scenario:** An attacker sends malformed JSON and deliberately invalid bodies to every public endpoint and reads the returned `message` and `details`. Fastify's parser text (e.g. `"Unexpected token } in JSON at position 3"`) and the zod issue list (field paths and rule names) come straight back, so the response shape maps the internal request schemas and their per-field constraints without any guesswork. This is reconnaissance assistance, not a compromise: it needs no exploit code and grants nothing by itself.

**Impact:** Disclosure of non-secret internals — parser identity/behaviour and validation field paths — which shortens the work of finding a body that reaches deeper into a service. No confidentiality, integrity, or availability effect on its own; by the severity anchors this is *low* (disclosure of non-secret internals).

**Evidence:**
```ts
// services/gateway/src/index.ts — reflects the parser's own message to the client
return reply.code(statusCode).send({
  error: { code: "bad_request", message: typeof malformed.message === "string" ? malformed.message : "Malformed request.", requestId: req.id },
});
```
```ts
// packages/service-kit/src/index.ts — zod issues returned verbatim
throw new ApiError(400, "bad_request", "Invalid request body.", r.error.issues.slice(0, 5));
// ...and emitted to the client by the handler: details: err.details
```

**Fix:** Return a fixed `"Bad request."` message for 4xx parser failures when `NODE_ENV=production`, and set `details` only when a debug flag is on (`LOG_LEVEL=debug`). Keep the full parser text and issue list in the server log keyed by `requestId` so support can still correlate a report.

**Prevention:** Shape 4xx envelopes in one place with a production/non-production split, and add a test asserting production responses contain neither parser text nor schema field paths.

### L-2. Unhandled unique-constraint violation on registration

**Severity:** Low
**Vulnerable component:** `platform/services/auth/src/routes.ts` (`/register`)

**Attack scenario:** An attacker races the existence pre-check by firing two `POST /api/auth/register` requests for the same email concurrently (or races a victim's address). Both requests pass `SELECT id FROM users WHERE lower(email) = $1`, then the second `INSERT` violates `users_email_unique` and the unmapped Postgres error becomes a `500 internal` rather than a `409`.

I verified the obvious escalation is **not** reachable: the unique index is on `lower(email)` and the insert stores `body.email.trim().toLowerCase()`, so the race cannot create a duplicate account and cannot let the attacker attach their password to the victim's address. The only defect is the wrong response code.

**Impact:** A client-caused condition is reported as a server fault, so a legitimate user sees `Something went wrong` instead of `An account with this email already exists`. It also injects false 5xx signal into the error rate that would be used to detect genuine failures — i.e. it degrades the very telemetry an operator needs. No account takeover, no data effect.

**Evidence:**
```ts
const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
if (existing.rowCount) throw new ApiError(409, "conflict", "An account with this email already exists.");
// no catch around the insert → 23505 falls through to the generic 500 branch
const { rows } = await pool.query(
  "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, created_at", [...]);
```
```sql
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
```
The shared handler maps only `ApiError` and `statusCode` 4xx; a raw `pg` error has neither, so it becomes `500 internal`.

**Fix:** Wrap the insert in a `try/catch`, and on `error.code === "23505"` return the same `409 conflict` payload the pre-check returns. The pre-check can then stay as a fast path without being load-bearing.

**Prevention:** Map database constraint violations to domain errors at one boundary rather than treating the pre-check as the correctness mechanism, and add a concurrent-registration test asserting exactly one `201` and one `409`.

### L-3. The client discards the refresh token, so 30-day sessions silently end at 15 minutes

**Severity:** Low
**Vulnerable component:** `nexora-svelte/src/lib/session.svelte.ts` (`register`, `login`, `save`)

**Attack scenario:** This is not an attacker path, and I am deliberately not presenting it as one. `POST /auth/register` and `/auth/login` return `{ accessToken, refreshToken, expiresIn }`, but `SessionStore.save` persists only `accessToken` and nothing in the client ever calls `POST /auth/refresh`. A learner is therefore signed out after the 15-minute access token expires even though the server issued a 30-day renewable credential, and the server accumulates `refresh_tokens` rows no client can use.

**Impact:** Availability and hygiene, not a boundary violation. Two effects: sessions end silently mid-lesson (the exact failure `refreshUser` tries to avoid by not clearing on a network error, undone here by expiry), and the auth database accretes 30-day rows with no consumer. I checked the sharper version of this claim and it does **not** hold: `token_hash` stores `sha256(refreshToken)`, so a database read yields hashes, and a stolen row cannot be replayed against `/auth/refresh`. The orphan rows are clutter, not reusable credential material.

**Evidence:**
```ts
async register(email, password, name) {
  const r = await call<{ user: SessionUser; tokens: { accessToken: string } }>("/api/auth/register", {...});
  this.save(r.tokens.accessToken, r.user);   // refreshToken dropped on the floor
}
```
```ts
// the only token-refresh logic that exists client-side: clear on authoritative rejection
if (status === 401 || status === 403) this.save(null, null);
```
No caller of `/api/auth/refresh` exists anywhere in `nexora-svelte/src`, while `auth/routes.ts` implements full rotation with reuse detection and family revocation — server capability with no client.

**Fix:** Either wire the refresh flow or stop issuing refresh tokens. If wiring it, do not put the refresh token in `localStorage`: exchange it through a small server endpoint that sets a `Secure` + `HttpOnly` + `SameSite` cookie, and rotate it on every use (the server already supports rotation and reuse detection, so a stolen-and-replayed token revokes the family). Prefer that cookie form over `localStorage` for anything long-lived — it also fixes the exposure noted in Missing Security Controls #4.

**Prevention:** Add a test that a session still works past the access-token TTL, so a credential the server issues but the client ignores fails in CI rather than in a learner's session.

### L-4. `FixedWindow` never expires entries below 10 000 keys

**Severity:** Low
**Vulnerable component:** `platform/services/gateway/src/limits.ts`

**Attack scenario:** An attacker who can present many distinct limiter keys (many source addresses, once `TRUST_PROXY` is configured correctly) drives the `hits` map to its 10 000-entry pre-sweep size and keeps it there. Below that threshold `sweep()` returns immediately, so entries whose window expired hours ago are never reclaimed and the map only ever grows.

**Impact:** Bounded memory retention in the gateway — 10 000 entries of small objects, which is small in absolute terms and does not affect limit correctness, because each key carries its own `reset` and `take()` re-initialises an expired key on next use. I am recording it because an unbounded-until-threshold cleanup is a latent availability concern if the cap is ever raised or the key space is attacker-influenced, not because it is exploitable today.

**Evidence:**
```ts
private sweep(now: number) {
  // Amortized cleanup: only when the map grows unboundedly.
  if (this.hits.size < 10_000) return;   // stale keys below this size are never expired
  for (const [k, v] of this.hits) { if (v.reset <= now) this.hits.delete(k); }
}
```
`take()` only allocates a fresh entry for a key it is asked about, so keys that stop being used persist indefinitely until a sweep that may never come.

**Fix:** Sweep on a time interval (e.g. every `windowMs`) or make the map a max-size LRU, and log when the cap is reached so the pressure is visible. The same fix applies to `EntitlementCache.sweep`, which uses the identical 10 000-entry pattern.

**Prevention:** Give any in-memory limiter/cache an explicit eviction policy and a size assertion in its test, rather than an amortised cleanup that depends on the map first becoming large.

### L-5. `payment.succeeded` marks *every* pending checkout for a user as paid

**Severity:** Low
**Vulnerable component:** `platform/services/billing/src/routes.ts` (`processEvent`)

**Attack scenario:** No external trigger is needed. A learner who opens two checkouts — two tabs, or a retried checkout after a failed card — has two `pending` rows. The first `payment.succeeded` for either one sets `status = 'paid'` on **both**, so the checkout ledger records money against a session that was never paid, and the `dodo_session_id` that would have disambiguated them is stored but never read. An attacker gains nothing; this is data-integrity drift in the operator's own records.

**Impact:** Checkout/reconciliation bookkeeping becomes wrong in the multi-checkout case, which matters for finance reconciliation and support (`which session did this payment settle?`). Access and entitlement are unaffected: `GET /subscription` derives `entitled` from `billing_subscriptions`, which is written only by the `subscription.*` branch, never by `payment.succeeded`. I confirmed no entitlement path reads `billing_checkouts`.

**Evidence:**
```ts
if (family === "payment" && type === "payment.succeeded") {
  const userId = str(meta.user_id);
  if (userId) {
    await pool.query(
      "UPDATE billing_checkouts SET status = 'paid', paid_at = now() WHERE user_id = $1 AND status = 'pending'",
      [userId]                      // every pending row, not the session that paid
    );
```
`billing_checkouts.dodo_session_id` is `NOT NULL UNIQUE` and is written on checkout mint, so the precise key is available and unused.

**Fix:** Match on `dodo_session_id` when the payload carries it (`pick(data.session_id, ...)`), updating a single row and falling back to the current behaviour only for event shapes that omit it. Log a warning when the fallback is taken, so the fallback is visible rather than silent.

**Prevention:** When a record has a natural unique key for the action, use it; assert the invariant in a test with two concurrent pending checkouts and exactly one payment event.

---

## 5. Missing Security Controls

These are absent or weak controls rather than exploitable chains; they are ordered by how much they would reduce the findings above.

1. **No abuse controls at registration.** `POST /auth/register` has no email verification, no CAPTCHA/Proof-of-Work, no invite requirement, and issues a 200-runs/day execution budget immediately. This is the enabler that turns C-1 from "authenticated RCE" into "unauthenticated RCE". Add email verification before the execution budget is granted, plus a per-IP/ASN cap on account creation.
2. **No authentication audit log or alerting.** Login success/failure, token-reuse detection (`token_reused` is implemented and thrown), entitlement changes, and webhook signature failures are logged at `info`/`warn` by Fastify but are not aggregated, retained as security events, or alerted on. `docs/DEPLOYMENT.md` states plainly that observability/alerts "do not exist". An attack in progress — including H-1's lockout storm and M-4's replay — would go unnoticed.
3. **No security headers on the HTML origin.** The SvelteKit app has no `hooks.server.ts` and sets no CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`. `helmet` is registered only on the gateway/services, and with `contentSecurityPolicy: false` there too. The app is the surface that serves HTML; a CSP is the primary mitigation for the `localStorage` token exposure. (Note: I found **no XSS** — `Markdown.svelte` and `Editor.svelte` both escape `&<>` before `{@html}`, so this is defense-in-depth, which is why it is here and not in the findings.)
4. **Bearer tokens live in `localStorage`.** `TOKEN_KEY = "nexora-jwt"` and Clerk session tokens are persisted in page-accessible storage. On the same origin as the app, any future XSS or a malicious third-party script becomes full ATO. Prefer `HttpOnly`/`Secure`/`SameSite` cookies with a server-side session, or in-memory access tokens plus a cookie refresh token (see L-3).
5. **Limits are per-process and in-memory.** The gateway limiter, the entitlement cache, execution quotas, and the tutor/DB counters all reset on restart and do not coordinate across replicas; the code comments acknowledge this. `docs/DEPLOYMENT.md` links this to the single-host decision. Move to Redis before running more than one gateway.
6. **Service-to-service identity is one shared bearer key with no transport security.** No mTLS, no per-service credentials, no request signing, and identity is an unsigned `x-user-id` header (see M-3). Any container on the compose network is effectively a fully privileged client.
7. **No dependency or supply-chain gate.** Versions in the lockfile are current as reviewed (`fastify 5.12.5`, `zod 4.6.5`, `jsonwebtoken 9.0.3`, `bcryptjs 3.0.3`, `pg 8.23.1`, `@clerk/backend 3.23.2`), but nothing in CI enforces that — no `npm audit`/SCA step, no Dependabot, no provenance policy. The AI tutor's provider URL is operator-set, which correctly avoids a user-controlled SSRF, but the app-side route in H-3 is the residual.
8. **`DODO_BUSINESS_ID` defaults empty**, silently disabling the cross-merchant tenancy guard that exists specifically for a reused webhook secret; compose passes `${DODO_BUSINESS_ID:-}`. Require it when `DODO_PAYMENTS_BASE` is the live host.
9. **No backups or restore drill** for learner data and subscription state (`docs/DEPLOYMENT.md` Phase 5.3). Integrity/availability gap rather than a vulnerability, but it sets the true recovery bound for any destructive exploit.
10. **Placeholder-tolerant secret validation** (H-2) is itself a missing control: no placeholder denylist, no entropy check, no boot-time self-test.

---

## 6. Attack Surface Summary

**Entry points, in exposure order**

| Surface | Auth | Notes |
|---|---|---|
| Browser app (`nexora-svelte`, port 3000 behind TLS proxy) | none | Serves HTML + `POST /api/tutor` (H-3) + SSR routes. No CSP. |
| Gateway `POST/GET /api/*` (port 8080; only public API) | per-route | `/api/auth`, `/api/curriculum` are `auth: false`; `/api/progress`, `/api/execute`, `/api/tutor`, `/api/billing` require a token. |
| `/api/billing/webhooks/dodo` | HMAC | Public by design; verification is genuinely good (constant-time, `whsec_` derivation, skew window, `business_id`/`test_mode` guards). |
| Mesh services (`auth:8101`, `progress:8103`, `execution:8104`, `billing:8106`, …) | `x-internal-key` | Not published in compose, but reachable from any container — including learner code (C-1) — and unauthenticated outright if the key is unset (M-3). |
| `POST /api/execute/execute` | token | Executes attacker-authored code; the isolation boundary that fails (C-1). |

**What the audit found to be sound (verified, not assumed)**

- **No IDOR found.** Every `progress` route derives `user_id` from `requireUserId` (`x-user-id`) and every query filters on it; `mission_runs` reads are scoped `WHERE user_id = $1`. No route takes a *user* identifier from the path or body.
- **No SQL injection found.** All queries are parameterized; the only string-interpolated SQL is `DELETE FROM ${table}` over a hardcoded literal list in `progress/routes.ts`.
- **No path traversal / command injection in the runner input validation.** `cleanPath` rejects absolute paths, drive letters, null bytes, `.`/`..`, and duplicate/long segments; the argv validator rejects absolute args, `..`, and null bytes; `command[0]` is allowlisted per language (the residual risk is C-1's *isolation*, not the validation).
- **The paywall holds at two independent layers.** The gateway denies `402` for `paidPrefixes` before forwarding, and `curriculum` re-checks `x-entitled` (`requireEntitled`). `NEVER_FORWARDED` strips client-supplied `x-user-id`, `x-entitled`, and `x-internal-key`, so a client cannot type its way past the gate; a path-traversal attempt to reach a paid route without triggering the gateway's prefix check still hits `requireEntitled` and `402`s.
- **The run-receipt integrity design is genuinely strong**, and is exactly why the mesh key is a high-value target: HMAC over a hand-built deterministic payload, constant-time compare, 30-minute freshness, entry-path binding, file-set and fixture-hash binding to the stored draft, and the signature deliberately never returned by history reads.
- **No XSS found** in the rendering paths: `Markdown.svelte` and `Editor.svelte` escape `&`, `<`, `>` before `{@html}`, and the highlighter's inline spans only wrap already-escaped text.
- **CORS is exact-origin, no credentials**; the gateway refuses `true` for `TRUST_PROXY`; body sizes are capped at the gateway (256 KB) and per-service (zod limits); error envelopes are structured; `docker-compose` keeps Postgres unpublished and the execution container unprivileged enough not to mount `docker.sock`.

---

## 7. Recommended Remediation Roadmap

**Now (before any public exposure)**
1. **C-1** — refuse `EXECUTION_RUNNER=subprocess` in production, or run the runner as a separate unprivileged identity with no access to the service's environment; rotate `INTERNAL_API_KEY` and `AUTH_JWT_SECRET` on any environment that has ever run with the shipped defaults.
2. **H-2** — add the placeholder denylist + entropy check to both secret validators; make boot fail on a placeholder in every environment.
3. **H-3** — remove the frontend `/api/tutor` provider call (route it to the authenticated mesh endpoint) or guard it with auth + a per-IP/session limit.
4. **C-1 enabler** — put email verification (or an invite) in front of the execution budget.

**This week**
5. **H-1** — forward a gateway-owned `x-client-ip`, add a per-account login lockout, stop counting successes, and reconcile `TRUST_PROXY` with the real topology (fail loudly on the mismatch).
6. **M-3** — fail closed on a missing mesh key in every environment; set `NODE_ENV=production` explicitly in compose; move to a gateway-signed identity assertion for `x-user-id`.
7. **M-1** — short access-token TTL plus `jti` revocation on logout; wire the refresh flow into a `HttpOnly` cookie (fixes L-3 at the same time).

**Next**
8. **M-2 / M-4** — max queue depth with a `503` saturated path; atomic webhook idempotency claim.
9. **Missing controls 2 & 3** — security-event logging (login failures, token reuse, entitlement changes, webhook signature failures) with alerts, and a CSP/HSTS/`X-Frame-Options` baseline on the app origin, starting in report-only mode.
10. **Low findings** — error-envelope detail in production, 409 on duplicate registration, atomic checkout attribution.

**Before scaling past one host**
11. Redis-backed rate limits, quotas, and entitlement cache; per-service mesh credentials with mTLS; an SCA gate in CI; and the missing backup/restore drill — the last three close the gaps the deployment doc already names.

---

## 8. Overall Security Rating

**Rating: Moderate risk as shipped — critically compromised if deployed on the documented defaults.**

The engineering is unusually security-literate for the stage: the proxy header-hygiene (`NEVER_FORWARDED`), the two-layer paywall, the parameterized persistence, the load-bearing run-receipt design, the `TRUST_PROXY` refusal of `true`, the exact-origin CORS, and the honest three-state entitlement (`unknown` vs `not_entitled`) all reflect real attacker-minded thinking, and I could not find a single IDOR, SQL injection, traversal, or XSS in the reviewed paths.

What is missing is operational, and it concentrates in the one place the product cannot afford it: **the component that runs learner code is not an isolation boundary in the configuration the project documents for production.** Because the mesh key doubles as the receipt-signing key and identity inside the mesh is an unsigned header, a single open registration plus the default `subprocess` runner yields code execution, credential theft, cross-user impersonation, paywall bypass, and forgery of the platform's own skill evidence. The placeholder-tolerant secret validation makes the same outcome reachable without any exploit chain at all. Add the shared-bucket login limiter (a one-line remote lockout of the whole platform) and the unauthenticated LLM proxy, and the gap between *designed* security and *deployed* security is the whole story.

Fix C-1, H-1, H-2, and H-3 and this becomes a genuinely strong posture for a pre-launch platform; the remaining items are hardening the team is already tracking in `TODO.md` Phase 5.

---

## 9. Fix status (applied after this audit)

Code-level fixes for the findings above.

Verification for the session work (M-1 + L-3), which is what this pass added. `platform` builds clean; `npm run verify` reports **172 pass / 1 fail / 2 skipped** of 175, where the single failure is a pre-existing curriculum-drift assertion (`services/curriculum/src/data/curriculum.ts` vs the frontend source, neither file touched here — the test says to run `npm run sync:curriculum`) and both skips are environment-gated (no Docker daemon, and Go is installed so the "no runtime" case cannot apply). The app's session layer was verified end-to-end over real HTTP through the app's own dev server against a stub gateway: **30 checks** covering the cookie's attributes, the absence of the refresh token from every reply, rotation, a platform outage that must not end a session, a foreign `Origin`, and sign-out revoking server-side before clearing the cookie. The assertions added to `nexora-svelte/scripts/verify.ts` were also executed directly (**20 of them**), because that suite cannot get past its first assertion in this tree — see the note at the end. Immediate revocation (M-1) is verified at three levels: pure units for the cache and the mesh lookup (a revoked id is remembered, a clear one is never, an unreachable check is neither), the edge against stub upstreams (a revoked token is 401 `token_revoked` and never forwarded, an unreachable check is 503 and never a silent allow), and — because the two layers above can each pass while disagreeing about the endpoint, the body or the mesh key — the real gateway spawned in front of the real auth routes with only Postgres faked: register, one authenticated request, sign out with both credentials, and the same bearer refused on the very next call with the family unable to mint a replacement. The same flow is a step in the compose e2e suite, which skips when no Docker daemon is present. The memory-only change was then re-verified **in the browser** against the same stub gateway: a seeded `nexora-jwt` key was gone after a reload, signing in through the form left nothing token-shaped in `localStorage`, `document.cookie` was empty (the refresh cookie is `HttpOnly`), and a full page reload came back signed in on the strength of `POST /auth/session/refresh → 200`.

**Fixed**

| # | What changed |
|---|---|
| C-1 | `services/execution/src/index.ts` refuses `EXECUTION_RUNNER=subprocess` at boot in production, naming the variable, explaining what a learner's program could reach, and offering `EXECUTION_ALLOW_SUBPROCESS=1`; a loud startup warning in non-production; `docker-compose.yml` now states `NODE_ENV: production` on every service; `.env.example` and `docs/DEPLOYMENT.md` document the decision. New boot test asserts the refusal and the message. **Residual:** the tier itself is still not an isolation boundary — this makes running it a named decision instead of a default. Real isolation is the `docker` tier, which needs a daemon and a built runner image. |
| H-1 | The gateway forwards an `x-client-ip` it resolved itself (and strips any client copy); `service-kit` exposes `clientIp()`; the auth sign-in path keys its address budget on that and adds a per-account failure budget (10 per 15 min, cleared on success, checked before the password so it cannot be used as an oracle). Two new tests: lockout across many addresses, and one address not locking out another. |
| H-2 | `service-kit.assertSecret()` (length floor + placeholder denylist) guards `AUTH_JWT_SECRET` and `INTERNAL_API_KEY` in the gateway and the auth service; a placeholder mesh key is treated as unset; `.env.example`'s placeholders now FAIL boot with a message naming the variable. New tests for the validator, the auth signer, and gateway config. |
| H-3 | `nexora-svelte/src/routes/api/tutor/+server.ts` no longer calls the provider unless `NEXORA_AI_ALLOW_APP_ROUTE=1`, and adds an 8 KB body cap (413), a same-origin check (403), and a 20 req/min per-IP limiter (429). Verified end-to-end against a local provider sink: opt-in off → authored ladder and the provider is never contacted; opt-in on → provider reached. |
| M-2 | `JobQueue(concurrency, maxDepth)` refuses work past the bound via `QueueSaturated`; `/execute` answers 503 + `Retry-After: 5`; `Quotas.refund()` returns the daily run so backpressure costs the learner nothing. Two new tests. |
| M-3 | Compose sets `NODE_ENV: production` explicitly per service; placeholder mesh keys are rejected; the "mesh auth disabled" log is now `error`-level. **Residual:** identity inside the mesh is still a bare `x-user-id` header — a signed assertion or mTLS is a wider redesign, not applied here. |
| M-4 | The billing webhook claims the event atomically (`INSERT ... ON CONFLICT DO NOTHING RETURNING`, inside the same transaction as the effect), replacing the read-then-write TOCTOU that let concurrent duplicates both apply. |
| M-1 | Access tokens now live **five minutes** (`ACCESS_TOKEN_TTL_SECONDS`, clamped 60–900) instead of fifteen, and carry a `jti`, in `services/auth/src/crypto.ts`. Two new tests assert the default, both clamp ends (so a longer value cannot quietly restore the old window), and per-token identity. **A live token is now revoked immediately, not at the end of that window.** Sign-out presents the access token alongside the refresh token: the auth service verifies it and records its `jti` in `revoked_tokens` (`services/auth/migrations/003_revoked_tokens.sql`, written at `POST /auth/logout`), and the gateway asks about the `jti` it was given — over the mesh, `POST /internal/revocations/check` — before it trusts the token (`services/gateway/src/revocation.ts` + the gate in `index.ts`). A revoked `jti` is remembered until the token would have expired; a *clear* answer is deliberately **not** cached, because caching it would hand back the window this closes. Answering "we can't check right now" is neither a yes nor a no: the edge answers **503 `revocation_unavailable`** rather than allowing an unverified session or signing everyone out for an operational problem — with one bounded exception, added because a check in front of every authenticated request otherwise turns an auth-service blip into a product outage. A credential whose *clear* answer was confirmed within `REVOCATION_CLEAR_TTL_MS` (default 60s, clamped 0–300s) keeps working while the service cannot be reached, every such request is counted as `degraded` and the first after a quiet period is logged at `error` with the bound in force, and the window runs from the last confirmation rather than from the start of the outage — so a long outage converges back to 503 by itself, a credential nobody confirmed inside the window still fails closed, and `REVOCATION_CLEAR_TTL_MS=0` restores the strict reading. **Residual:** a sign-out during such an outage can go unseen for up to that bound, for credentials confirmed shortly before it — which is the trade being made, not a gap being missed. The app sends the token it holds to its own broker, which forwards it in the sign-out body (the gateway strips the bearer from everything it forwards, so the header route was not available). **Residual:** the access token that names *another* device's session is a different `jti` and is not revoked by that sign-out — it dies at its next renewal (the family is gone) or at its expiry, so the honest bound is "the credential you signed out with, immediately; other sessions, within minutes". Revoking those too would need the refresh family's id inside the access token — and that is what "sign out everywhere" now does instead: the auth service records a per-account cut-off (`services/auth/migrations/004_user_revocations.sql`, one row per account, written at `POST /auth/logout-all` alongside a revoke of every refresh family the account holds), the gateway sends each token's own `iat` with its check, and every credential minted before that moment is refused — including the ones on devices the learner is not holding. The app's account page offers it as a two-click control (`nexora-svelte/src/routes/auth/+page.svelte` + `session.logoutEverywhere()` + the `logout-all` broker route), because it is the one account action a learner cannot undo for the devices they cannot see. **Residual:** `iat` has one-second resolution, so a token minted in the same second as the sign-out survives (the comparison spares it deliberately — of the two mistakes available, signing the learner straight back out of the session they just created is the worse one), and Clerk sessions are unreachable by it: a Clerk token carries no `jti` the gateway can look up, so for those accounts the control is not offered and this call would be answered 401 by a service that never issued them. The per-request check also makes the auth service a dependency of every authenticated request — a deliberate availability cost, documented in `config.ts`, with the five-minute TTL as the fallback when the check cannot be answered at all. |
| L-1 | Production no longer echoes Fastify's parser message, and zod issue `details` are omitted. |
| L-2 | A duplicate-email registration race maps `23505` to the same 409 instead of a 500. |
| L-3 | The session is now brokered by the app's own server (`nexora-svelte/src/lib/server/session-broker.ts` plus `/auth/session/{login,register,refresh,logout}`): the 30-day refresh token is set in an `HttpOnly`, `SameSite=Lax` cookie scoped to `Path=/auth/session` and stripped from the reply the page receives, so no script ever holds it. The client (`lib/session.svelte.ts` over the pure `lib/session-core.ts`) keeps the access token **in memory only**, renews on a timer at 80% of its life and again on a 401, serializes renewals across tabs with the Web Locks API (two tabs refreshing together would look like token theft and revoke the family), re-establishes the session from the cookie on page load, and no longer discards the credential the server issues. **Missing Controls #4 is closed for app sessions:** nothing writes a token to storage, and the pre-change `nexora-jwt` key is deleted on first load. The consequence, stated plainly: a page begins with no token by design, so a signed-out visitor's load costs one `POST /auth/session/refresh` that the broker answers `401` itself (it never reaches the platform without a cookie), and a learner whose refresh cookie is gone sees the sign-in form rather than a shell. **Residual:** while the page is open the token is held in JS memory, so a script injection on this origin can still act as the learner for that page's lifetime — which is what the CSP in the Controls row is for. Clerk mode is unchanged: those tokens are adopted into memory by `lib/clerk.ts`, but clerk-js keeps its own storage. |
| L-4 | Time-based cleanup added to `FixedWindow` and `EntitlementCache`, keeping the existing size-based path. |
| L-5 | `payment.succeeded` attributes the payment to the checkout session it names, falling back to the coarse update only for payloads without one. |
| Controls | The app origin now sends `Content-Security-Policy` (report-only), HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` from `nexora-svelte/src/hooks.server.ts`. CSP is report-only because the WebContainer lab needs cross-origin isolation that this directive set cannot express, and enforcing it today would break that page. |

**What an operator can see, and when.** Revocation is only as useful as the ability to tell that it is working, so this pass added the three visible surfaces the design implies, each on the path that can actually observe it. The denylist is pruned on a timer in the auth service (`REVOCATION_PRUNE_INTERVAL_MS`, fifteen minutes by default, `unref()`'d so housekeeping can never hold the process open), once at boot as well, logging `{ removed }` **only when rows went** — a line every interval saying "0 rows" is how a log stops being read. The edge keeps counters (`asked`, `refused` split by which half of the denylist decided, `unanswered`, `degraded`, `fromCache`) and reports them on `REVOCATION_REPORT_MS` as one structured line with the size of the fallback store and the bound in force, silent when nothing moved; a refusal, an unanswered check, and a request allowed on a bounded stale answer are each logged **at once** the first time after a quiet period — `error` for the latter two, `warn` for a refusal — because a thief retrying a dead token would otherwise write the log on the attacker's schedule and an outage that is invisible for a minute is a minute of failed requests nobody is watching. Both timers are asserted at the source (they cannot be exercised from a request without waiting out an interval), and the counters are asserted behaviourally: a refusal served from memory is counted as such, a clear answer is not, and an outage is its own number so "the service is down" and "everyone is signing out" cannot be confused. The degradation mode added later is verified at three levels: in the units (a confirmed clear carries a request inside its bound and is reported as `degraded`, a credential nobody confirmed still fails closed, an outage is never a blanket allow, a refusal overrides a recorded clear, and `0` disables the fallback), through the real gateway spawned against an auth stub that is then taken down — the same token serves a 200, **the loud line is read out of the process's own log stream** with `degraded: 1` and the bound in it, and 400 ms on (the bound in that spawn is 300 ms) the same token gets its 503 back, with recovery immediate once the stub answers again — and in the edge's configuration, where the default, both clamp ends and the rejection of a non-numeric value are asserted. That state is published, not just logged: `/health/deep` carries a `revocations` block (`authService`, `degraded`, `outageMs`, `clearTtlMs`, the counters, `fallbackIds`, `cachedRefusals`) and rolls into `status`, because a check in front of every authenticated request means an auth-service outage degrades *this* edge — first by serving bounded stale answers, which is the failure mode nothing else in the product complains about. Reading the block performs no check of its own, so a poller is not part of the traffic it watches, and `authService: "unknown"` (nothing asked yet) is deliberately not a failure: reporting a healthy edge as degraded until the first sign-in would train an operator to ignore the field. `/health/ready` stays a plain process check on purpose — a revocation outage must not make an orchestrator restart a gateway that is still serving public traffic. The block is counts and booleans only, never a `jti` or a user id, so it cannot become an oracle for whether a *particular* credential is revoked; an attacker learns only that the check is down, which presenting one token would have told them anyway. `docs/DEPLOYMENT.md` now states what to alert on (`status != "ready"`, `revocations.authService == "unreachable"`) and what is still missing: something to *page* someone. The poller itself exists as a command — `scripts/healthcheck.mjs`, wired as `npm run healthcheck` — and its contract is deliberately three-valued rather than "not zero": **0** healthy, **1** the edge answered and reports a problem (its own `status`, a mesh member's check, or the auth service away from the revocation check), **2** the check could not obtain a health report at all (no reply, a refused connection, a reply missing the revocation block, which is also how a gateway older than this feature is caught). "The platform says it is degraded" and "I cannot ask the platform" wake different people, and the reasons go to stderr while `--quiet` keeps stdout silent in a crontab. It is exercised the way an operator runs it — spawned as a real process in the suite, asserted on exit status and on both streams — across healthy, degraded-via-auth, a named mesh member failing, a hanging endpoint hitting the command's own timeout, and a refused connection. **Residual:** the counters are in-process and cumulative, like every other limit and cache here — there is no metrics system or alerting in this deployment, which is exactly why the observable form is a log line.

**Deliberately deferred, with the reason**

- **Redis-backed limits, quotas and entitlement cache** (Missing Controls #5). Still deferred for the same reason as before: one host, per-instance state. The revocation check is the one place that now *does* leave the process on every authenticated request, and it leaves it for the auth service — the component that already owns identity — rather than for a new shared store, so there is still exactly one place to move to Redis when a second gateway appears.
- **Dependency scanning/SCA in CI, and backups/restore**: process controls rather than code.
- **Per-service mesh credentials, mTLS, and signed identity assertions** (the M-3 residual): an architectural change, not a patch.

**Deployment impact to know before rolling this out.** A stack started from `.env.example` now fails on purpose: the execution service refuses the single-process tier in production, and the placeholder secrets are rejected at boot. Set real `AUTH_JWT_SECRET` and `INTERNAL_API_KEY`, and either `EXECUTION_RUNNER=docker` or an explicit `EXECUTION_ALLOW_SUBPROCESS=1`. Any environment that has ever run with the placeholder values must rotate both secrets — they cannot be un-leaked.

**A note on the working tree.** Several of the files touched here (`gateway/config.ts`, `gateway/index.ts`, `gateway/proxy.ts`, `billing/routes.ts`, `docker-compose.yml`, `scripts/verify.mjs`, the `curriculum` files, `site sync-curriculum.mjs`) already carried uncommitted changes when this work began. Those changes were left intact; the edits above were layered on top, and `SECURITY-AUDIT.md` is a new untracked file. The session work added `nexora-svelte/src/lib/session-core.ts`, `nexora-svelte/src/lib/server/session-broker.ts`, and the four `nexora-svelte/src/routes/auth/session/*/+server.ts` endpoints.

**Why the `nexora-svelte` suite did not complete in this pass.** A curriculum expansion is in flight in this working tree and it changes the content the app's suite asserts on: `lib/missions.ts` and `lib/curriculum.ts` are modified, `missions-s.ts` … `missions-w.ts` are new and untracked, and the mission count is now 60 where `scripts/verify.ts` asserts 46. The count assertion is no longer the first casualty — the suite now runs past it and dies later, at `go-build: op ids unique`, on a duplicated block inside the untracked `lib/missions-v.ts` (`svelte-check` reports the same file: "an object literal cannot have multiple properties with the same name", at the repeated `hintLadder`). None of that is part of this work and none of it was touched: repairing it means deciding which of the pasted blocks is the intended one, which is an editorial call about content that is still being written. Three things were checked in its place, all of them against files this pass did change: in the same `svelte-check` run **no file changed here reported a single diagnostic**; the thirteen conditions the app suite would assert about sign-out-everywhere (the client method and the endpoint it names, the broker forwarding the token and refusing cross-site callers, the cookie cleared only on a confirmed reply, the answer rendered outside the signed-in branch, the Clerk helper aliased rather than shadowed, exactly one local declaration of it) were evaluated directly against the files and all thirteen hold; and the control itself was driven **in the browser** against a stub gateway — signed in through the form, the button armed by the first click and performed by the second, a real `POST /api/auth/logout-all` carrying the access token the page was holding in its body (`{ accessToken }`, decoded from the stub's log, with no Authorization header — the gateway strips bearers, which is why the body route exists), the confirmation line the learner sees ("Every session for this account is ended (2 ended just now)"), and a refresh attempt afterwards answered `401 no_session` because the cookie was cleared. Re-run the app suite once the curriculum expansion lands — the added assertions sit after the mission-content ones and will execute then.

---

## 10. Second pass: the institutional surface (2026-10-20)

**Target:** the code written in the hours after the first pass: the cohort and
licence surface, the operator's console, the course-scoped seat entitlement,
and the front door's pages for them.

**Method:** the same discipline. A finding needs a lower-trust principal, an
accepted input, the intended control, the boundary crossed, the affected
principal or resource, and a concrete result. Hardening advice is listed as
a missing control, not as a finding.

**Note on the tree:** this pass ran while another session was writing in the
same repository (a deployment plan, a backup and restore drill, an operator
console). The tree moved under the review, so the findings below are stated
against the code as it stood at the end of the pass, and the fixes are the
ones in the history that follows.

### F-1. A public route took a session credential in a request body (medium, fixed)

**Vulnerable component:** `platform/services/auth/src/admin.ts`, the
`POST /admin/check` route.

**Attack path.** The auth service's prefix is public at the edge
(`/api/auth` is `auth: false`, so no token is required to reach it). The
route read a refresh token out of the request body and answered three things:
whether the token was a live session, whether the account was an operator,
and the account's id, email and name. A refresh token is a thirty-day
credential. A caller who held one could therefore confirm that it was live,
and read the account it belonged to, without ever using it for access, and
without any credential but the token itself.

**Impact.** A credential oracle on the public surface for the longest-lived
credential in the system, and a credential travelling in a request body,
where an ingestion pipe or a debug log can keep it. The token's holder
already had the account's rights, so the harm is the oracle, the credential's
travel, and the fact that the route is a second, weaker path to the
operator question.

**Fix.** The route is deleted. Nothing in the product called it: the console
reads the identity the gateway injected after verifying the caller's own
access token, and the operator's flag is a row. The refresh token stays in
the app's HttpOnly cookie, where the broker exchanges it. The suite now
asserts the route answers 404, so it cannot come back quietly.

### F-2. The suite's port binding hung instead of failing (medium, fixed)

**Vulnerable component:** `platform/scripts/verify.mjs`, every
`await new Promise((r) => server.listen(port, host, r))`.

**Attack path.** None. This is a finding about the instrument, not the
product, and it is here because it cost a real debugging session: when the
port is already taken, the listen callback never fires, the promise never
settles, the event loop runs out of work, and every suite after that one is
cancelled with "Promise resolution is still pending but the event loop has
already resolved". A leftover process from an interrupted run is enough to
do it.

**Impact.** A red platform suite that reads as a product failure and is not
one. The reporter of this pass initially read it as a hang in the gateway
and then as a broken entitlement path, and the truth was a busy port.

**Fix.** One `listenOn(server, port)` helper that rejects with the port and
the reason, used at all six call sites.

### F-3. The entitlement verdict changed shape and three tests still asserted the old one (low, fixed)

**Component:** `platform/scripts/verify.mjs`, the gateway entitlement cache
suite.

The verdict is now `{ status, courses }`, because a seat has to name the
course it covers. Three cases still compared it with the string "entitled",
so the suite was red for a reason that was not a defect in the product.
Fixed, and a new case asserts the two shapes that matter: a seat keeps its
course, and a subscription keeps them all (`courses: null`).

### F-4. The course-scoped paywall had no test at all (medium, fixed)

**Component:** `platform/services/curriculum/src/routes.ts`,
`requireCourseCovered`.

The second floor under the paywall now refuses a paid phase whose course the
verdict does not cover, and fails closed when the verdict carries no course
at all. Neither behaviour was asserted: the only case injected
`x-entitled: 1` and no course list, which under the new rule is a refusal,
so the suite failed and the behaviour itself was untested.

**Fix.** Four cases: a seat whose course covers the phase is served, a seat
in another course is refused with the same code a learner who bought nothing
gets, a verdict with no course list covers nothing, and a subscription
(`*`) is served. The edge's header hygiene is also asserted: `x-entitled` and
`x-entitled-courses` are both in `NEVER_FORWARDED`, so a client cannot
forge a verdict or a course list.

### F-5. The cohort export did not say what it contained (low, fixed)

**Component:** `platform/services/auth/src/cohorts.ts`, the CSV export.

The export lists every verified proof a member has, from any course, because
the ledger is the member's work and not the cohort's, and the auth service
cannot map a competency to a course (the curriculum service owns that map).
The file said "one verified proof by one member" and nothing more, so a
reader could have read the file as a statement about the course being
taught. It now says what it is, in its own header.

### Checked and found sound, with the evidence

- **The operator boundary holds.** The flag is a row in `operators`; every
  admin route calls `requireOperator`, which is `requireUserId` (the
  gateway-verified identity) and then the row. The first flag is granted by
  a machine credential (`platform/scripts/operator.mjs` connects straight to
  the database and applies the migration itself), never by the console, so a
  console that could hand itself the right to exist would not be a
  boundary. The operator's actions are written to `admin_actions`.
- **The seat check is mesh-only.** `POST /internal/entitlement/seat` needs
  the mesh key, and the gateway refuses to proxy any path containing
  `/internal/`, so the public surface cannot reach it.
- **A learner cannot grant themselves a seat.** The licence is activated
  over the mesh or by the operator CLI, a new cohort is `pending`, and a
  `pending` cohort grants nothing.
- **A cohort cannot be oversubscribed.** The seat count is checked inside
  the INSERT, so two joins arriving together cannot both take the last seat.
- **One cohort's data is not another's.** The roster and the export are
  scoped to `instructor_id`, and a cohort the caller does not teach is a
  404 rather than a 403, so the route does not confirm that it exists.
- **The front door cannot hand out what the platform holds.** The site's
  console calls the platform with the learner's own access token; the
  operator's rows, accounts, proofs and cohorts all come from the platform,
  and the account home's data is the same.

### Missing controls, and residuals, with the reason

1. **The roster and the export show a member's proofs from any course.**
   The auth service cannot map a competency to a course. Closing this
   properly needs the curriculum's phase-to-competency map to be reachable
   from the auth service. Until then the file says what it contains.
2. **The site's `/admin` page shell loads for anybody.** The data is
   refused by the platform, and the route is out of the sitemap and
   disallowed in robots, but the front door imposes no gate of its own, so
   the whole boundary rests on the platform's operator table.
3. **Identity inside the mesh is still one shared bearer key and an
   unsigned `x-user-id` header.** This is the first pass's M-3 residual,
   unchanged, and it is an architectural change rather than a patch.
4. **The limits, the quotas and the entitlement cache are per-process.**
   The first pass's missing control 5, unchanged, and still the one place to
   move when a second gateway appears.
