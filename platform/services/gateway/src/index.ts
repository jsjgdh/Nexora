import Fastify from "fastify";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import { ApiError } from "@nexora/service-kit";
import { loadConfig } from "./config.js";
import { bearerUserId, clerkVerifier, localVerifier, type TokenVerifier } from "./auth.js";
import { FixedWindow } from "./limits.js";
import { MAX_BODY_BYTES, forward, matchRoute, buildForwardHeaders } from "./proxy.js";

/* Public edge: CORS, JWT authentication, rate limits, request tracing, and
   reverse proxying to the mesh. Internal services are never exposed
   directly — every byte from a client passes through here. */

const config = loadConfig();
const verifier: TokenVerifier =
  config.authMode === "clerk"
    ? clerkVerifier({
        secretKey: config.clerkSecretKey || undefined,
        jwtKey: config.clerkJwtKey || undefined,
        authorizedParties: config.clerkAuthorizedParties,
      })
    : localVerifier(config.jwtSecret);
const globalLimiter = new FixedWindow(config.globalLimit.windowMs, config.globalLimit.max);
const routeLimiters = new Map(config.routes.map((r) => [r.prefix, new FixedWindow(r.limit.windowMs, r.limit.max)]));

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
  return { status: allOk ? "ready" : "degraded", checks };
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
    const publicPath = route.publicPaths?.includes(path) ?? false;
    if (route.auth && !publicPath) {
      userId = await bearerUserId(req.headers.authorization, verifier);
      if (!userId) throw new ApiError(401, "unauthorized", "Valid access token required.");
    } else if (!publicPath && req.headers.authorization) {
      // Optional-auth routes (e.g. /api/auth/me): a presented token is still
      // verified and forwarded as identity, so account-scoped handlers work
      // on public prefixes. A bad token is rejected — never silently dropped.
      userId = await bearerUserId(req.headers.authorization, verifier);
      if (!userId) throw new ApiError(401, "unauthorized", "Invalid access token.");
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
    // Strip the matched prefix: upstream services own their root paths
    // (/register, not /api/auth/register).
    const upstreamPath = path.length === route.prefix.length ? "/" : path.slice(route.prefix.length);
    const headers = buildForwardHeaders(req.headers as Record<string, string | string[] | undefined>, {
      userId,
      internalKey: config.internalKey,
      requestId: req.id,
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
        message:
          typeof malformed.message === "string" ? malformed.message : "Malformed request.",
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
