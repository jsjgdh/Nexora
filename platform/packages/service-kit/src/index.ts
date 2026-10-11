import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";

/* Shared service chassis: logging, request ids, security headers, health
   probes, error envelopes, mesh authentication, graceful shutdown. Every
   service gets identical production posture from one call. */

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

export function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Parse with zod or throw a 400 ApiError (no stack traces leak out). */
export function parseOr400<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new ApiError(400, "bad_request", "Invalid request body.", r.error.issues.slice(0, 5));
  }
  return r.data;
}

/** User id forwarded by the gateway after JWT verification. Services must
    never trust client-supplied identity — only this header. */
export function requireUserId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const v = req.headers["x-user-id"];
  const id = Array.isArray(v) ? v[0] : v;
  if (!id) throw new ApiError(401, "unauthorized", "Missing authenticated user.");
  return id;
}

export interface ServiceOptions {
  /** Return false (or throw) when dependencies are unavailable. */
  readyCheck?: () => Promise<boolean>;
}

export async function createService(name: string, opts: ServiceOptions = {}): Promise<FastifyInstance> {
  const isProd = (process.env.NODE_ENV ?? "development") === "production";
  const meshKey = process.env.INTERNAL_API_KEY ?? "";

  if (isProd && !meshKey) {
    // Fail closed: internal endpoints must never serve without mesh auth.
    throw new Error("INTERNAL_API_KEY is required in production");
  }

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: name },
    },
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // Mesh authentication: only the gateway (holder of the key) may call
  // internal routes. Health probes stay public for orchestrators.
  app.addHook("onRequest", async (req) => {
    if (req.url.startsWith("/health/")) return;
    if (!meshKey) {
      req.log.warn("INTERNAL_API_KEY unset — mesh auth disabled (development only)");
      return;
    }
    if (req.headers["x-internal-key"] !== meshKey) {
      throw new ApiError(403, "forbidden", "Mesh authentication failed.");
    }
  });

  app.get("/health/live", async () => ({ status: "ok", service: name }));
  app.get("/health/ready", async (_req, reply) => {
    try {
      const ready = opts.readyCheck ? await opts.readyCheck() : true;
      if (!ready) return reply.code(503).send({ status: "not-ready", service: name });
      return { status: "ready", service: name };
    } catch (err) {
      reqLog(app, err);
      return reply.code(503).send({ status: "not-ready", service: name });
    }
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: "not_found", message: `No route ${req.method} ${req.url}.`, requestId: req.id },
    });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({
        error: { code: err.code, message: err.message, requestId: req.id, details: err.details },
      });
    }
    if (typeof err?.statusCode === "number" && err.statusCode < 500) {
      return reply.code(err.statusCode).send({
        error: { code: "bad_request", message: err.message ?? "Bad request.", requestId: req.id },
      });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({
      error: { code: "internal", message: "Something went wrong.", requestId: req.id },
    });
  });

  return app;
}

function reqLog(app: FastifyInstance, err: unknown) {
  app.log.warn({ err }, "readiness check failed");
}

/** Listen + graceful shutdown (drains before exit for rolling deploys). */
export async function start(app: FastifyInstance, port: number): Promise<void> {
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
}
