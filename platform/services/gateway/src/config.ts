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
}

export type AuthMode = "local" | "clerk";

export interface GatewayConfig {
  port: number;
  frontendUrl: string;
  authMode: AuthMode;
  jwtSecret: string;
  clerkSecretKey: string;
  clerkJwtKey: string;
  clerkAuthorizedParties: string[];
  internalKey: string;
  /**
   * The Fastify/proxy-addr trust value. `false` when nothing fronts us;
   * otherwise a predicate that trusts the first N addresses from the socket.
   */
  trustProxy: boolean | ((addr: string, index: number) => boolean);
  globalLimit: RouteLimit;
  routes: RouteConfig[];
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
  if (mode === "local" && jwtSecret.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be at least 32 characters");
  }
  // PEM keys in env files often carry literal \n escapes — restore them.
  const clerkJwtKey = str(env, "CLERK_JWT_KEY").replace(/\\n/g, "\n");
  const clerkSecretKey = str(env, "CLERK_SECRET_KEY");
  if (mode === "clerk" && !clerkSecretKey && !clerkJwtKey) {
    throw new Error("Clerk mode needs CLERK_SECRET_KEY or CLERK_JWT_KEY");
  }
  const parties = str(env, "CLERK_AUTHORIZED_PARTIES")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const internalKey = str(env, "INTERNAL_API_KEY");
  if ((env.NODE_ENV ?? "development") === "production" && !internalKey) {
    throw new Error("INTERNAL_API_KEY is required in production");
  }
  return {
    port: firstNum(env, ["GATEWAY_PORT", "PORT"], 8080),
    frontendUrl,
    authMode: mode,
    jwtSecret,
    clerkSecretKey,
    clerkJwtKey,
    clerkAuthorizedParties: parties.length > 0 ? parties : [frontendUrl],
    internalKey,
    trustProxy: parseTrustProxy(env),
    globalLimit: { windowMs: 60_000, max: num(env, "GATEWAY_GLOBAL_LIMIT", 600) },
    routes: [
      {
        prefix: "/api/auth",
        target: url(env, "AUTH_URL", "http://localhost:8101"),
        auth: false,
        timeoutMs: 10_000,
        limit: { windowMs: 60_000, max: 120 },
      },
      {
        prefix: "/api/curriculum",
        target: url(env, "CURRICULUM_URL", "http://localhost:8102"),
        auth: false,
        timeoutMs: 10_000,
        limit: { windowMs: 60_000, max: 600 },
      },
      {
        prefix: "/api/progress",
        target: url(env, "PROGRESS_URL", "http://localhost:8103"),
        auth: true,
        timeoutMs: 10_000,
        limit: { windowMs: 60_000, max: 600 },
      },
      {
        prefix: "/api/execute",
        target: url(env, "EXECUTION_URL", "http://localhost:8104"),
        auth: true,
        timeoutMs: 35_000,
        limit: { windowMs: 60_000, max: 60 },
      },
      {
        prefix: "/api/tutor",
        target: url(env, "TUTOR_URL", "http://localhost:8105"),
        auth: true,
        timeoutMs: 30_000,
        limit: { windowMs: 60_000, max: 120 },
      },
      {
        prefix: "/api/billing",
        target: url(env, "BILLING_URL", "http://localhost:8106"),
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
