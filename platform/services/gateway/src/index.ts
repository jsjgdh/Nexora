import Fastify from "fastify";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import { ApiError } from "@nexora/service-kit";
import { loadConfig, type RouteConfig } from "./config.js";
import { bearerIdentity, clerkVerifier, localVerifier, type TokenVerifier } from "./auth.js";
import { FixedWindow } from "./limits.js";
import { MAX_BODY_BYTES, forward, matchRoute, buildForwardHeaders, upstreamPathFor } from "./proxy.js";
import {
  EntitlementCache,
  billingLookup,
  combinedEntitlementLookup,
  seatLookup,
  type EntitlementAnswer,
} from "./entitlement.js";
import { RevocationCache, revocationLookup } from "./revocation.js";

/* Public edge: CORS, JWT authentication, rate limits, request tracing, and
   reverse proxying to the mesh. Internal services are never exposed
   directly — every byte from a client passes through here. */

const config = loadConfig();
const isProd = (process.env.NODE_ENV ?? "development") === "production";
const verifier: TokenVerifier =
  config.authMode === "clerk"
    ? clerkVerifier({
        secretKey: config.clerkSecretKey || undefined,
        jwtKey: config.clerkJwtKey || undefined,
        apiUrl: config.clerkApiUrl || undefined,
        authorizedParties: config.clerkAuthorizedParties,
      })
    : localVerifier(config.jwtSecret);
const globalLimiter = new FixedWindow(config.globalLimit.windowMs, config.globalLimit.max);
const routeLimiters = new Map(config.routes.map((r) => [r.prefix, new FixedWindow(r.limit.windowMs, r.limit.max)]));

/* Entitlement for paid curriculum routes.
 *
 * Two questions, and they are cached differently because they change
 * differently.
 *
 * The subscription is cached for the TTL and dropped the moment a billing
 * webhook says otherwise, so a cancellation bites within the TTL and a new
 * subscription bites at once.
 *
 * The seat is NOT cached. A seat changes when an operator confirms a licence,
 * and there is no webhook for that: the operator is a person with a CLI, and
 * the classroom's paid course opening is the moment they are waiting for. So
 * the seat is asked on every paid request, which is one indexed query on the
 * identity service's own database. The earlier shape cached the combined
 * answer, and a student whose licence was confirmed had to wait out the TTL
 * before the course opened, with nothing on screen to say why.
 *
 * Either answer grants entitlement, and a failure in either is "unknown",
 * never a denial. See entitlement.ts. */
const subscriptionEntitlement = new EntitlementCache(
  config.entitlementTtlMs,
  async (userId) => {
    const entitled = await billingLookup({
      url: config.billingUrl,
      internalKey: config.internalKey,
      timeoutMs: 5_000,
    })(userId);
    return { status: entitled ? "entitled" : "not_entitled", courses: null };
  }
);
const entitlement = {
  async get(userId: string, now = Date.now()): Promise<EntitlementAnswer> {
    return combinedEntitlementLookup({
      subscription: async (id: string) => (await subscriptionEntitlement.get(id, now)).status,
      seat: seatLookup({ url: config.authUrl, internalKey: config.internalKey, timeoutMs: 5_000 }),
    })(userId);
  },
  /** Drop one user's subscription verdict, or every verdict when no id is given. */
  invalidate(userId?: string): void {
    subscriptionEntitlement.invalidate(userId);
  },
};

// Revocation: sign-out must end the token in hand, not just the family it renews
// with, so every request presenting a token that carries an id asks the auth
// service whether that id was revoked. One lookup per request, and revoked ids are
// remembered until they expire. See revocation.ts for why a clear answer never
// replaces a lookup, and why an unreachable check is neither a yes nor a no — with
// one bounded exception (`revocationClearTtlMs`) so that a blip in the auth service
// does not take every authenticated request down with it.
const revocation = new RevocationCache(
  revocationLookup({ url: config.authUrl, internalKey: config.internalKey, timeoutMs: config.revocationTimeoutMs }),
  config.revocationClearTtlMs
);

/* What the edge says about revocations, and how often.
 *
 * Three events matter operationally and none can be a line per request: a token
 * refused (a thief retrying one would write the log on the attacker's schedule), a
 * check that could not be answered (every authenticated request fails, so the line
 * is the same one thousands of times), and a request allowed on a stale answer
 * while the service is down — the last is the one nothing else complains about,
 * because the requests succeed. All three therefore go through a counter, reported
 * on a timer as one structured line — and the *first* after a quiet period is
 * logged at once, because an outage that is invisible for a minute is a minute of
 * requests nobody is watching, whether they failed or quietly degraded.
 */
const REVOCATION_REPORT_MS = Number(process.env.REVOCATION_REPORT_MS ?? 60_000);
let reported = { refused: 0, unanswered: 0, degraded: 0 };
let lastRevocationReport = Date.now();

function revocationNotice(
  verdict: "revoked" | "unknown" | "degraded",
  reason: "credential" | "account" | null,
  url: string
): void {
  const now = Date.now();
  const firstSinceReport = now - lastRevocationReport >= REVOCATION_REPORT_MS;
  lastRevocationReport = now;
  const stats = revocation.stats();
  const failed = stats.unanswered;
  if (verdict === "unknown" && (firstSinceReport || failed === 1)) {
    app.log.error(
      { unanswered: failed, url },
      "revocation check could not be answered — authenticated requests are being refused"
    );
    return;
  }
  // The degraded allow is the quieter half of an outage and the half an operator
  // most needs to see: requests are succeeding, so nothing else complains — the
  // only record that a sign-out could go unseen for a moment is this line.
  if (verdict === "degraded" && (firstSinceReport || stats.degraded === 1)) {
    app.log.error(
      {
        degraded: stats.degraded,
        unanswered: stats.unanswered,
        clearTtlMs: config.revocationClearTtlMs,
        url,
      },
      "revocation check could not be answered — serving a bounded stale answer, so a sign-out in this window may not be seen yet"
    );
    return;
  }
  if (verdict === "revoked" && firstSinceReport) {
    app.log.warn(
      { reason, refused: { ...stats.refused }, fromCache: stats.fromCache, url },
      "revoked access token refused"
    );
  }
}

if (Number.isFinite(REVOCATION_REPORT_MS) && REVOCATION_REPORT_MS > 0) {
  const timer = setInterval(() => {
    const stats = revocation.stats();
    const refused = stats.refused.credential + stats.refused.account;
    const delta = {
      refused: refused - reported.refused,
      unanswered: stats.unanswered - reported.unanswered,
      degraded: stats.degraded - reported.degraded,
    };
    reported = { refused, unanswered: stats.unanswered, degraded: stats.degraded };
    // Silence when nothing moved: a line per minute saying "no revocations" is how
    // a log stops being read, and an operator who wants the totals has the line
    // below whenever anything changes.
    if (delta.refused === 0 && delta.unanswered === 0 && delta.degraded === 0) return;
    const level = delta.unanswered > 0 || delta.degraded > 0 ? "error" : "info";
    app.log[level](
      {
        ...delta,
        totals: { asked: stats.asked, fromCache: stats.fromCache, refused: stats.refused },
        cachedIds: revocation.size,
        // How many credentials are currently rideable through an outage: the size
        // of the exposure, in the same line as how often it was used.
        fallbackIds: revocation.clearSize,
        clearTtlMs: config.revocationClearTtlMs,
        windowMs: REVOCATION_REPORT_MS,
      },
      "revocation activity"
    );
  }, REVOCATION_REPORT_MS);
  // Housekeeping must never hold the process open, exactly as in the auth
  // service's prune.
  timer.unref();
}

/** True when `path` is at or under one of the route's paid prefixes. */
function isPaidPath(route: RouteConfig, path: string): boolean {
  return (route.paidPrefixes ?? []).some((p) => path === p || path.startsWith(p + "/"));
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info", base: { service: "gateway" } },
  genReqId: () => randomUUID(),
  // Configured hop count, never blanket `true`: req.ip is the rate-limit key
  // and a client-written X-Forwarded-For must not be able to choose it.
  trustProxy: config.trustProxy,
});

await app.register(helmet, { contentSecurityPolicy: false });

// Strict CORS: exact configured origin only, no credentials (JWT travels in
// the Authorization header, never cookies — nothing to steal via CSRF).
app.addHook("onRequest", async (req, reply) => {
  const origin = req.headers.origin;
  if (origin === config.frontendUrl) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Expose-Headers", "X-Execution-Daily-Remaining, X-Request-Id");
    reply.header("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    if (origin === config.frontendUrl) {
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
      reply.header("Access-Control-Max-Age", "600");
    }
    return reply.code(origin === config.frontendUrl ? 204 : 403).send();
  }
});

app.get("/health/live", async () => ({ status: "ok", service: "gateway" }));
app.get("/health/ready", async () => ({ status: "ready", service: "gateway" }));
/* The one endpoint this deployment has for "is it healthy, and why not".
 *
 * It carries the revocation state as well as the mesh checks, because that state is
 * the difference between an incident an operator can see from a monitor and one they
 * can only see by reading logs they do not have: the check sits in front of every
 * authenticated request, so an auth service that has stopped answering degrades
 * *this* edge — first by serving bounded stale answers, then by refusing requests
 * outright — long before anything downstream looks unhealthy. (This is the shape
 * TODO 5.2 asks for; until a real metrics system exists, the health endpoints are
 * the dashboard.)
 *
 * `authService: "unknown"` is not a failure: it means no token has been presented
 * since boot, so nothing has been asked yet. `/health/ready` deliberately stays a
 * plain process check — a revocation outage must not make an orchestrator restart a
 * gateway that is still serving public traffic, which is the opposite of help.
 */
app.get("/health/deep", async () => {
  const checks = await Promise.all(
    config.routes.map(async (r) => {
      try {
        const res = await fetch(r.target + "/health/ready", { signal: AbortSignal.timeout(3000) });
        return { service: r.prefix, ok: res.ok };
      } catch {
        return { service: r.prefix, ok: false };
      }
    })
  );
  const allOk = checks.every((c) => c.ok);
  const revocations = revocation.health();
  const revocationsOk = revocations.authService !== "unreachable";
  return { status: allOk && revocationsOk ? "ready" : "degraded", checks, revocations };
});

app.route({
  method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  url: "/api/*",
  handler: async (req, reply) => {
    const path = (req.params as { "*": string })["*"] ? `/api/${(req.params as { "*": string })["*"]}` : "/api";
    const route = matchRoute(path, config.routes);
    if (!route) {
      throw new ApiError(404, "not_found", `No route for ${path}.`);
    }

    /* The mesh's internal routes are not proxied.
     *
     * The gateway injects the mesh key on everything it forwards, so a route
     * under /internal/ would otherwise be reachable by any client that can
     * reach the public surface — and the key it would carry is the real one.
     * The internal routes are the mesh's: the seat check and the revocation
     * check are asked directly, over the mesh, by this edge. A path that names
     * one is not a route the public surface has. */
    if (path.includes("/internal/")) {
      throw new ApiError(404, "not_found", `No route for ${path}.`);
    }

    if (!globalLimiter.take(`g:${req.ip}`)) {
      reply.header("Retry-After", "60");
      throw new ApiError(429, "rate_limited", "Too many requests.");
    }
    const limiter = routeLimiters.get(route.prefix)!;
    if (!limiter.take(`r:${route.prefix}:${req.ip}`)) {
      const waitS = Math.ceil(limiter.retryAfterMs(`r:${route.prefix}:${req.ip}`) / 1000);
      reply.header("Retry-After", String(waitS));
      throw new ApiError(429, "rate_limited", "Too many requests for this endpoint.");
    }

    let userId: string | null = null;
    let identity: Awaited<ReturnType<typeof bearerIdentity>> = null;
    const publicPath = route.publicPaths?.includes(path) ?? false;
    if (route.auth && !publicPath) {
      identity = await bearerIdentity(req.headers.authorization, verifier);
      if (!identity) throw new ApiError(401, "unauthorized", "Valid access token required.");
      userId = identity.userId;
    } else if (!publicPath && req.headers.authorization) {
      // Optional-auth routes (e.g. /api/auth/me): a presented token is still
      // verified and forwarded as identity, so account-scoped handlers work
      // on public prefixes. A bad token is rejected — never silently dropped.
      identity = await bearerIdentity(req.headers.authorization, verifier);
      if (!identity) throw new ApiError(401, "unauthorized", "Invalid access token.");
      userId = identity.userId;
    }

    /* Sign-out has to end the credential, not just the session's ability to
       renew: without this the token a learner was holding kept working until it
       expired, which is exactly the window a thief needs. A token that names
       itself (`jti`) is checked against the auth service's denylist; Clerk tokens
       carry no id we can look up, so Clerk's own revocation stands for them and
       nothing is invented here. Three answers, and the third is not a verdict:
       revoked → 401, clear → continue, unreachable → 503 rather than a silent
       allow. "Unreachable" has one bounded exception — a credential confirmed clear
       within `revocationClearTtlMs` continues, and the request says so in the log
       (`degraded`) — because refusing every request for as long as the auth service
       is away is an outage of a different, larger kind, and a credential nobody
       confirmed inside the window still gets the 503.

       The sign-out route itself is exempt, and only it: its whole job is to revoke
       credentials, so refusing it a token that is *already* revoked would turn a
       request that must stay idempotent (and oracle-free) into a 401 the client can
       do nothing with — signing out twice is not an error. Nothing is weakened by
       that: a revoked bearer can influence nothing at /auth/logout beyond rows that
       are already dead, and the route forwards no identity it did not verify. */
    const isSignOutPath = route.prefix === "/api/auth" && path === "/api/auth/logout";
    if (identity?.jti && !isSignOutPath) {
      const { verdict, reason, degraded } = await revocation.status({
        jti: identity.jti,
        userId: identity.userId,
        issuedAtMs: identity.issuedAtMs,
        expiresAtMs: identity.expiresAtMs,
      });
      if (verdict === "revoked") {
        // A refusal is a security event worth a line, and the reason says which
        // half did it: one credential signed out, or the whole account. Rate
        // limited below, because a thief retrying a dead token would otherwise
        // write the log themselves.
        revocationNotice(verdict, reason, req.url);
        throw new ApiError(401, "token_revoked", "This session was signed out. Sign in again.");
      }
      if (verdict === "unknown") {
        revocationNotice(verdict, null, req.url);
        throw new ApiError(
          503,
          "revocation_unavailable",
          "We can't confirm your session right now. Try again shortly."
        );
      }
      // Clear — and if it only stands because the last *confirmed* answer is still
      // inside its bound, the request proceeds but the outage is logged: a
      // degraded allow is the one path where the platform answers without having
      // heard from the service, so silence here would hide it completely.
      if (degraded) revocationNotice("degraded", null, req.url);
    }

    /* Paid curriculum: a token is mandatory — the optional-auth branch above
       leaves userId null when none is presented, which is fine for a public
       prefix but not for content behind the paywall — and entitlement must be
       confirmed before a byte is forwarded. Two questions are asked now, and
       either one grants: does billing have a subscription for this learner,
       and does the auth service say this learner holds a seat in an active
       cohort (and in which course). Four distinct answers so the extension
       can tell "sign in" (401) from "subscribe" (402) from "we can't check
       right now" (503) from "that course is not on your licence" (402, from
       the service that owns the phase-to-course map); none of them may read
       as a failed check. */
    const paidPath = isPaidPath(route, path);
    let entitled = false;
    let entitledCourses: string[] | null = null;
    if (paidPath) {
      if (!userId) throw new ApiError(401, "unauthorized", "Sign in to access the paid curriculum.");
      const answer = await entitlement.get(userId);
      if (answer.status === "unknown") {
        throw new ApiError(503, "entitlement_unavailable", "We can't confirm your subscription right now. Try again shortly.");
      }
      if (answer.status !== "entitled") {
        throw new ApiError(402, "entitlement_required", "This content is part of the paid curriculum. Subscribe to unlock it.");
      }
      entitled = true;
      // A subscription covers every course (null); a seat covers the course the
      // institution bought. The service that owns the phase-to-course map
      // decides whether the phase asked for is one of them.
      entitledCourses = answer.courses;
    }

    let body: Buffer | null = null;
    if (req.body !== undefined) {
      const raw = JSON.stringify(req.body);
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
        throw new ApiError(413, "too_large", "Request body too large.");
      }
      body = Buffer.from(raw, "utf8");
    }

    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const upstreamPath = upstreamPathFor(route, path);
    const headers = buildForwardHeaders(req.headers as Record<string, string | string[] | undefined>, {
      userId,
      internalKey: config.internalKey,
      requestId: req.id,
      entitled,
      entitledCourses,
      // req.ip here is our own view of the caller (trustProxy-aware, and the
      // client's X-Forwarded-For was stripped above), so downstream limiters
      // can key on a real client instead of on this proxy's address.
      clientIp: req.ip,
    });
    // Body-less requests (GET/DELETE) must not claim a JSON body — strict
    // parsers downstream reject an empty payload with content-type set.
    if (body === null) delete headers["content-type"];

    try {
      const upstream = await forward({
        target: route.target,
        path: upstreamPath,
        query: qs,
        method: req.method,
        headers,
        body,
        timeoutMs: route.timeoutMs,
      });
      // A billing webhook just changed subscription state. It carries no user id
      // we recognise (Dodo's, not ours), so drop every cached verdict; the next
      // paid request re-asks billing and sees the new state at once instead of
      // after the TTL. Only on success — a rejected webhook changed nothing.
      if (upstream.status < 300 && route.prefix === "/api/billing" && path === "/api/billing/webhooks/dodo") {
        entitlement.invalidate();
      }
      for (const [k, v] of Object.entries(upstream.headers)) reply.header(k, v);
      reply.header("X-Request-Id", req.id);
      return reply.code(upstream.status).send(upstream.body);
    } catch (err: unknown) {
      const status =
        err instanceof Error && "status" in err && typeof (err as { status?: unknown }).status === "number"
          ? (err as { status: number }).status
          : 502;
      const code =
        err instanceof Error && "code" in err && typeof (err as { code?: unknown }).code === "string"
          ? (err as { code: string }).code
          : "bad_gateway";
      req.log.warn({ err, route: route.prefix }, "upstream failure");
      return reply.code(status).send({
        error: {
          code,
          message: status === 504 ? "Upstream timed out." : "Upstream unavailable.",
          requestId: req.id,
        },
      });
    }
  },
});

app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({
    error: { code: "not_found", message: `No route ${req.method} ${req.url}.`, requestId: req.id },
  });
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ApiError) {
    return reply.code(err.status).send({
      error: { code: err.code, message: err.message, requestId: req.id },
    });
  }
  /*
   * Fastify's own client-side failures carry a 4xx `statusCode`: an empty body
   * with a JSON content type, malformed JSON, an unsupported media type, a body
   * over the limit. Those are the request's fault, not ours — a 500 would tell
   * the client the platform broke when it did not, and would file requests we
   * answered correctly under the error rate. It is also the honest answer for a
   * naive client (or a probe) that sends `content-type: application/json` with
   * nothing in it, which is a shape that reaches this edge in practice.
   */
  const malformed = err as { statusCode?: unknown; message?: unknown };
  const statusCode = malformed.statusCode;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    req.log.warn({ err }, "rejected malformed request");
    return reply.code(statusCode).send({
      error: {
        code: "bad_request",
        // The parser's own message ("Unexpected token } in JSON at position 3")
        // tells a prober exactly which parser and where it stopped, and it is
        // never something a client can act on. Development keeps it; production
        // says only that the request was malformed.
        message:
          !isProd && typeof malformed.message === "string"
            ? malformed.message
            : "Malformed request.",
        requestId: req.id,
      },
    });
  }
  req.log.error({ err }, "unhandled gateway error");
  return reply.code(500).send({
    error: { code: "internal", message: "Something went wrong.", requestId: req.id },
  });
});

const port = config.port;
await app.listen({ port, host: "0.0.0.0" });
const stop = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
