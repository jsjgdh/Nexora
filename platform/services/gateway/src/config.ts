import { assertSecret, resolveMeshKey } from "@nexora/service-kit";

/* Gateway configuration: pure env parsing, injectable for tests. */
export interface RouteLimit {
  windowMs: number;
  max: number;
}

export interface RouteConfig {
  prefix: string;
  target: string;
  auth: boolean;
  timeoutMs: number;
  limit: RouteLimit;
  /** Exact paths exempt from auth (e.g. third-party webhooks, verified downstream). */
  publicPaths?: string[];
  /** Path prefixes whose content is behind the paywall. On these the gateway
      resolves entitlement via billing before forwarding, denies 402 without it,
      and injects x-entitled so the service has a second floor to stand on. */
  paidPrefixes?: string[];
}

export type AuthMode = "local" | "clerk";

export interface GatewayConfig {
  port: number;
  frontendUrl: string;
  authMode: AuthMode;
  jwtSecret: string;
  clerkSecretKey: string;
  clerkJwtKey: string;
  /**
   * Where the Clerk Backend API (and its `/jwks` signing keys) live. Empty means
   * "use Clerk's hosted default", which is right for the common case but makes
   * two production shapes impossible: a self-hosted or sovereign Clerk behind a
   * private issuer, and any offline or CI verification — the JWKS fetch has no
   * address to reach. Set, it names the issuer the operator actually runs, and
   * it is the same address the JWKS proof test points at to exercise the HTTP
   * key path without a network.
   */
  clerkApiUrl: string;
  clerkAuthorizedParties: string[];
  internalKey: string;
  /**
   * The Fastify/proxy-addr trust value. `false` when nothing fronts us;
   * otherwise a predicate that trusts the first N addresses from the socket.
   */
  trustProxy: boolean | ((addr: string, index: number) => boolean);
  globalLimit: RouteLimit;
  routes: RouteConfig[];
  /** Billing service base URL, used to resolve entitlement directly (the
      gateway calls billing over the mesh rather than through its own proxy). */
  billingUrl: string;
  /** How long a resolved entitlement is trusted before re-asking billing. */
  entitlementTtlMs: number;
  /** Auth service base URL, used to ask whether a token has been revoked (the
      same service the /api/auth route proxies to, read once for the same reason
      billingUrl is). */
  authUrl: string;
  /** How long to wait for that answer before treating it as unavailable. */
  revocationTimeoutMs: number;
  /**
   * How long a *confirmed clear* answer about a credential may still be acted on
   * when the auth service cannot be reached — the degradation bound.
   *
   * The check sits in front of every authenticated request, so without this an
   * auth-service blip (a restart, a deploy, a crowded connection pool) turns into
   * "every request in the product fails with 503", which is a bigger incident than
   * the one being defended against. With it, a credential whose check was
   * confirmed clear within this window keeps working through the outage, and the
   * edge logs an error the first time and counts every such request as `degraded`.
   *
   * What it costs: a sign-out that happens *during* the outage can be missed for up
   * to this long, for credentials already confirmed shortly before it. Three things
   * bound that — the window starts at the last confirmation, not at the start of
   * the outage, so a long outage stops degrading on its own; a credential nobody
   * confirmed inside the window is still 503 (an outage is never a blanket allow);
   * and a refusal we have already seen always wins over a recorded clear.
   *
   * 0 is allowed and disables the fallback: every unanswerable check is a 503, and
   * the product goes down with the auth service. Default 60s — long enough to ride
   * out a restart, short enough to be a detail rather than a policy. Never more
   * than 300s: past the default access-token lifetime the fallback buys nothing,
   * because the credentials it would cover have expired on their own (and the
   * token ceiling itself is 900s, see ACCESS_TOKEN_TTL_SECONDS).
   */
  revocationClearTtlMs: number;
}

function str(env: Record<string, string | undefined>, name: string, fallback = ""): string {
  return env[name] ?? fallback;
}

function num(env: Record<string, string | undefined>, name: string, fallback: number): number {
  if (env[name] === undefined) return fallback;
  const v = Number(env[name]);
  if (!Number.isFinite(v)) throw new Error(`Invalid ${name}: must be a number`);
  return v;
}

/**
 * How many reverse-proxy hops to trust in front of the gateway.
 *
 * This is a security setting, not a nicety. `X-Forwarded-For` is written by
 * the client, and `req.ip` becomes the first entry the proxy layer chooses to
 * trust — so trusting everything let any caller pick their own `req.ip` and
 * walk around the anonymous and global rate limits with a fresh header per
 * request. The old hardcoded `trustProxy: true` meant exactly that.
 *
 * Default 0 (trust nothing): the socket address is the client, which is
 * correct when the gateway IS the public surface. An operator who puts a
 * reverse proxy in front (the documented TLS setup) sets `TRUST_PROXY=1`; a
 * literal `true` is refused so nobody re-opens the hole by reflex.
 */
export type TrustProxySetting = boolean | ((addr: string, index: number) => boolean);

export function parseTrustProxy(env: Record<string, string | undefined>): TrustProxySetting {
  const raw = str(env, "TRUST_PROXY", "0").trim();
  if (raw === "" || raw === "0" || raw === "false") return false;
  if (raw === "true") {
    throw new Error('Invalid TRUST_PROXY: give a hop count (e.g. 1), not "true" — trusting every hop lets a client forge X-Forwarded-For');
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error("Invalid TRUST_PROXY: must be a non-negative integer");
  }
  // Fastify 5 types `trustProxy` without a number, so express "trust N hops" as
  // the predicate proxy-addr itself would build: index is counted from the
  // socket outward, so trusting the first N addresses is `i < hops`.
  return hops === 0 ? false : (_addr, i) => i < hops;
}

/** First set variable wins (GATEWAY_PORT overrides generic PORT). */
function firstNum(env: Record<string, string | undefined>, names: string[], fallback: number): number {
  for (const n of names) {
    if (env[n] !== undefined) return num(env, n, fallback);
  }
  return fallback;
}

function url(env: Record<string, string | undefined>, name: string, fallback: string): string {
  const v = str(env, name, fallback).replace(/\/$/, "");
  if (!/^https?:\/\//.test(v)) throw new Error(`Invalid ${name}: must be an http(s) URL`);
  return v;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  const mode = str(env, "AUTH_MODE", "local");
  if (mode !== "local" && mode !== "clerk") {
    throw new Error(`AUTH_MODE must be "local" or "clerk", got ${mode}`);
  }
  const frontendUrl = url(env, "FRONTEND_URL", "http://localhost:3000").replace(/\/$/, "");
  const jwtSecret = str(env, "AUTH_JWT_SECRET");
  // Only meaningful in local mode, where this secret both signs and verifies.
  // Anyone holding it can mint an access token for any `sub`, i.e. become any
  // user, so a placeholder here is an impersonation primitive rather than a
  // weak password — hence a content check, not just a length check.
  if (mode === "local") assertSecret("AUTH_JWT_SECRET", jwtSecret);
  // PEM keys in env files often carry literal \n escapes — restore them.
  const clerkJwtKey = str(env, "CLERK_JWT_KEY").replace(/\\n/g, "\n");
  const clerkSecretKey = str(env, "CLERK_SECRET_KEY");
  if (mode === "clerk" && !clerkSecretKey && !clerkJwtKey) {
    throw new Error("Clerk mode needs CLERK_SECRET_KEY or CLERK_JWT_KEY");
  }
  // Default empty = Clerk's hosted API. A set value must be a real http(s) URL
  // with no trailing slash, because the SDK appends `/{apiVersion}/jwks` to it.
  const clerkApiUrl = str(env, "CLERK_API_URL", "").replace(/\/$/, "");
  if (clerkApiUrl !== "" && !/^https?:\/\//.test(clerkApiUrl)) {
    throw new Error(`Invalid CLERK_API_URL: must be an http(s) URL`);
  }
  const parties = str(env, "CLERK_AUTHORIZED_PARTIES")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // The mesh key, or a refusal to boot. The gateway cannot proxy to services it
  // cannot authenticate to, so a gateway running without a key is not a degraded
  // mode — it is the misconfiguration that used to disable the entire identity
  // model while everything still answered 200. `resolveMeshKey` is the same pure
  // rule the service chassis applies, so the two cannot drift, and it fails
  // closed in every environment rather than on `NODE_ENV`. A placeholder is
  // rejected by it too: a key published in the repo authenticates nothing, and
  // this value also seeds the run-receipt signing key.
  const { key: internalKey } = resolveMeshKey(env);
  // Read once: the billing route target and the entitlement lookup are the same
  // service, and two reads of BILLING_URL could disagree.
  const billingUrl = url(env, "BILLING_URL", "http://localhost:8106");
  // Same treatment for auth: its route target and the revocation check are one
  // service, and a check that asked a different host than login would be a
  // denylist reader that is always one deploy behind.
  const authUrl = url(env, "AUTH_URL", "http://localhost:8101");
  return {
    port: firstNum(env, ["GATEWAY_PORT", "PORT"], 8080),
    frontendUrl,
    authMode: mode,
    jwtSecret,
    clerkSecretKey,
    clerkJwtKey,
    clerkApiUrl,
    clerkAuthorizedParties: parties.length > 0 ? parties : [frontendUrl],
    internalKey,
    trustProxy: parseTrustProxy(env),
    globalLimit: { windowMs: 60_000, max: num(env, "GATEWAY_GLOBAL_LIMIT", 600) },
    billingUrl,
    entitlementTtlMs: num(env, "ENTITLEMENT_CACHE_TTL_MS", 30_000),
    authUrl,
    // Short: this sits in the path of every authenticated request, and the honest
    // failure is a 503 ("we can't confirm your session") rather than a stall. The
    // answer is a primary-key lookup on the same host's mesh.
    revocationTimeoutMs: num(env, "REVOCATION_TIMEOUT_MS", 2_000),
    // Clamped rather than merely read: this is a security bound, and an operator
    // who sets 10 minutes by mistake would be trading the revocation guarantee for
    // availability they did not mean to buy. A negative value is not a way to get
    // "trust anything" either — it becomes 0, which is the strict mode.
    revocationClearTtlMs: Math.min(Math.max(num(env, "REVOCATION_CLEAR_TTL_MS", 60_000), 0), 300_000),
    routes: [
      {
        prefix: "/api/auth",
        target: authUrl,
        auth: false,
        timeoutMs: 10_000,
        limit: { windowMs: 60_000, max: 120 },
      },
      {
        prefix: "/api/proofs",
        target: authUrl,
        auth: true,
        timeoutMs: 10_000,
        limit: { windowMs: 60_000, max: 120 },
        // The verified ledger lives in the auth service beside the users it
        // belongs to. Both directions require the learner's own JWT: syncing
        // someone else's proof, or reading it, is 401 by construction.
      },
      {
        prefix: "/api/curriculum",
        target: url(env, "CURRICULUM_URL", "http://localhost:8102"),
        auth: false,
        timeoutMs: 10_000,
        limit: { windowMs: 60_000, max: 600 },
        // The public roadmap (/ide/manifest, /ide/version) stays open so a
        // signed-out learner sees the whole course; only phase bodies are paid.
        // The browser-classroom endpoints are gone with the classroom — this
        // prefix now serves the IDE curriculum only.
        paidPrefixes: ["/api/curriculum/ide/phases"],
      },
      {
        prefix: "/api/execute",
        target: url(env, "EXECUTION_URL", "http://localhost:8104"),
        auth: true,
        timeoutMs: 35_000,
        limit: { windowMs: 60_000, max: 60 },
        // Receipt verification is the third-party surface: a stranger with a
        // receipt link holds no JWT but must still get an answer. The key
        // endpoint rides the same rule: the public key is public.
        publicPaths: ["/api/execute/verify", "/api/execute/verify-key"],
      },
      {
        prefix: "/api/billing",
        target: billingUrl,
        auth: true,
        timeoutMs: 20_000,
        limit: { windowMs: 60_000, max: 120 },
        // Dodo calls us; it holds no JWT. Authenticity comes from the
        // Standard-Webhooks HMAC the billing service verifies itself.
        publicPaths: ["/api/billing/webhooks/dodo"],
      },
    ],
  };
}
