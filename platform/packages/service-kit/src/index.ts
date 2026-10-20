import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";

export { createPool, migrate, newId, sha256 } from "./db.js";
export {
  RECEIPT_MAX_AGE_MS,
  codeSha256,
  receiptEdPublicKey,
  receiptFresh,
  receiptKey,
  signReceipt,
  signReceiptEd,
  verifyReceiptEd,
  verifyReceiptSignature,
} from "./receipt.js";

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

/* ---------- secret hygiene ----------
 *
 * A value that passes a length check while being public knowledge is worse than
 * no check at all: the deployment *looks* configured, and anyone who has read
 * the repository can forge everything that value protects. `.env.example` ships
 * placeholders, and the documented way to start is to copy it, so a placeholder
 * that validates is a placeholder that ships. The gateway's JWT secret and the
 * mesh key are both validated here, so the rule lives once.
 *
 * Deliberately a denylist of the documented placeholders plus a length floor,
 * not an entropy score: these secrets are generated as hex (`randomBytes(32)`),
 * and a hex string has at most 16 distinct characters — any "distinct character"
 * heuristic would reject the very values the docs tell operators to generate. */
const PLACEHOLDER_SECRET = /(change[ _-]?me|changeme|replace[ _-]?me|placeholder)/i;

export function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_SECRET.test(value);
}

/**
 * Validate a secret at boot, throwing with the fix rather than accepting it.
 *
 * The message is written for whoever is reading a failed deploy: it names the
 * variable, says what is wrong, and prints the command that generates a real
 * one — because "invalid secret" with no next step is how a placeholder survives
 * into production.
 */
export function assertSecret(name: string, value: string, minLength = 32): string {
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  if (isPlaceholderSecret(value)) {
    throw new Error(
      `${name} is still a placeholder value — generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return value;
}

/* ---------- mesh authentication ----------
 *
 * Every internal route trusts a bare `x-user-id` header once mesh auth is off,
 * so "off" must never be the state you reach by *forgetting* something. The
 * rule used to read `NODE_ENV`: production required a key, and anything else
 * quietly ran without one. That made a mis-set or absent `NODE_ENV` — a bare VM,
 * a debug `ports:` line, a service started by hand — the whole of the
 * authentication model, on a product whose only claim is that a learner cannot
 * forge a verdict.
 *
 * The decision is therefore made once, in one pure function both the service
 * chassis and the gateway call, and it fails closed in *every* environment: a
 * real key, or an explicit `ALLOW_INSECURE_MESH=1` for local development, which
 * is refused outright in production. `NODE_ENV` is no longer part of the answer
 * — only of the refusal.
 */

/** The explicit, development-only opt-in that runs the mesh without a key. */
export const INSECURE_MESH_ENV = "ALLOW_INSECURE_MESH";

/**
 * Decide the mesh key at boot, or refuse to start.
 *
 * Pure, so the chassis and the gateway cannot disagree about when the platform
 * is safe to serve — the defect this replaces was two copies of the rule that
 * drifted. Either a real key comes back to authenticate with, or `insecure: true`
 * says the caller explicitly accepted keyless internal routes.
 */
export function resolveMeshKey(
  env: Record<string, string | undefined> = process.env
): { key: string; insecure: boolean } {
  const configured = env.INTERNAL_API_KEY ?? "";
  // A placeholder is not a key. Treat it exactly like an unset one, so copying
  // .env.example cannot switch the mesh on with a value that is in the repo.
  const key = configured && !isPlaceholderSecret(configured) ? configured : "";
  if (key) return { key, insecure: false };

  const isProd = (env.NODE_ENV ?? "development") === "production";
  if (env[INSECURE_MESH_ENV] === "1") {
    if (isProd) {
      throw new Error(
        `${INSECURE_MESH_ENV}=1 is refused in production: without a mesh key every internal ` +
          "route trusts a bare x-user-id header from any caller. Set INTERNAL_API_KEY."
      );
    }
    return { key: "", insecure: true };
  }

  throw new Error(
    (configured
      ? "INTERNAL_API_KEY is a placeholder value — a key published in the repository authenticates nothing. "
      : "INTERNAL_API_KEY is required: without it every internal route trusts a bare x-user-id header from any caller. ") +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — ` +
      `or, for local development only, set ${INSECURE_MESH_ENV}=1 to run the mesh without authentication.`
  );
}

/* ---------- client address ---------- */

/**
 * The client IP the *gateway* resolved, as a header the gateway owns.
 *
 * Internal services run with `trustProxy` enabled, so `req.ip` in a service is
 * derived from the request's `X-Forwarded-For` — and the gateway strips any
 * client-supplied one and substitutes its own view of the caller. A limiter
 * keyed on `req.ip` inside a service therefore keys on whatever arrived, which
 * for gateway traffic is the gateway itself: one bucket shared by every client
 * on the platform, trippable by any single caller. Services that must key on an
 * address read this instead, and fall back to `req.ip` only when the gateway is
 * not in front (direct dev access).
 */
export const CLIENT_IP_HEADER = "x-client-ip";

export function clientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): string {
  const v = req.headers[CLIENT_IP_HEADER];
  const id = Array.isArray(v) ? v[0] : v;
  const trimmed = id?.trim();
  return trimmed || req.ip || "unknown";
}

/* ---------- request id ---------- */

/**
 * The id the edge already chose, and this service should keep.
 *
 * The gateway mints one trace id per request, returns it to the client as
 * `x-request-id`, and forwards it here. Adopting it is the difference between
 * one greppable id and two: without it the client quotes the gateway's id, the
 * gateway logs the gateway's id, and the service logs an id only it has ever
 * seen — so "somewhere greppable" (TODO 5.2) is quietly false the moment a
 * request crosses more than one process, which is every request there is.
 *
 * The value is still input. It arrives over the wire, a log line is a file,
 * and an id with a newline in it is two lines — so anything that is not a
 * plain token (length floor and ceiling, no whitespace) is answered with a
 * freshly minted id rather than written out. The gateway strips any
 * client-supplied copy before this sees it; the shape check is what is left
 * for callers the gateway does not front, and for defence in depth behind it.
 */
export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_SHAPE = /^[A-Za-z0-9._-]{8,128}$/;

export function traceIdFromHeader(value: unknown): string | null {
  const id = Array.isArray(value) ? value[0] : value;
  return typeof id === "string" && REQUEST_ID_SHAPE.test(id) ? id : null;
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
  // Fail closed, in every environment, before anything is registered: a service
  // that cannot authenticate its mesh must not start serving. See resolveMeshKey.
  const mesh = resolveMeshKey();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: name },
    },
    // The edge's id when it sent one we are willing to log, a fresh one
    // otherwise: see traceIdFromHeader for why both halves exist.
    genReqId: (req) => traceIdFromHeader(req.headers[REQUEST_ID_HEADER]) ?? randomUUID(),
    trustProxy: true,
  });

  // Named here so start()'s process-level reporter can say which service is
  // dying: threading the name through the start() signature would mean
  // touching every entry point, for a value the chassis already holds.
  (app as unknown as { serviceName: string }).serviceName = name;

  await app.register(helmet, { contentSecurityPolicy: false });

  // Mesh authentication: only the gateway (holder of the key) may call
  // internal routes. Health probes stay public for orchestrators.
  app.addHook("onRequest", async (req) => {
    if (req.url.startsWith("/health/")) return;
    if (!mesh.insecure) {
      if (req.headers["x-internal-key"] !== mesh.key) {
        throw new ApiError(403, "forbidden", "Mesh authentication failed.");
      }
      return;
    }
    // Reachable only behind the explicit opt-in resolveMeshKey demands, so this
    // is never a quiet degradation: every request says out loud that identity is
    // unauthenticated and names the switch that allowed it.
    req.log.error(
      `${INSECURE_MESH_ENV}=1 — mesh auth is OFF and every internal route trusts x-user-id ` +
        "from any caller who can reach the port (development only; never set this in production)"
    );
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

  // The one thing NODE_ENV decides here, and it is not a security decision:
  // zod issue detail names the failed fields rule by rule, which is useful while
  // developing and free reconnaissance in production. The mesh above does not
  // consult it — see resolveMeshKey for why that mattered.
  const isProd = (process.env.NODE_ENV ?? "development") === "production";

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({
        error: {
          code: err.code,
          message: err.message,
          requestId: req.id,
          // A zod issue list names the failed fields and rules, i.e. it maps the
          // request schema one field at a time. Useful while developing, free
          // reconnaissance against production, so it does not ship there.
          ...(isProd ? {} : { details: err.details }),
        },
      });
    }
    const e = err as Partial<{ statusCode: number; message: string }>;
    if (typeof e.statusCode === "number" && e.statusCode < 500) {
      return reply.code(e.statusCode).send({
        error: { code: "bad_request", message: e.message ?? "Bad request.", requestId: req.id },
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

  /* Error reporting, the process-wide half (TODO 5.2).
   *
   * Fastify answers a request that throws; this is everything else — a
   * rejection in a timer, a callback that blew up, the failures outside any
   * request that Node otherwise prints as an unstructured stack and turns
   * into an exit code nobody can grep. Here the line is one structured
   * fatal with the service name and the error object, matching every other
   * log this service writes, and the exit is decided rather than defaulted.
   *
   * Attached in start() and never in createService() on purpose: this suite
   * (and dev) create services in-process by the dozen, and process-level
   * handlers belong to the real process, not to each instance — attaching
   * there would put a crash-the-suite listener behind every test's factory.
   *
   * FATAL_WEBHOOK_URL is the "reporting" half: set, the fatal is also POSTed
   * as one small JSON body (service, event, message, stack) to whatever the
   * operator points it at — any endpoint that accepts JSON, so a single-VPS
   * deploy gets error reporting without adopting a vendor. Unset, the log
   * line is the report, and `docker logs` is where it is read. Either way the
   * bound is short: a dying process never waits on a reporting endpoint. */
  const serviceName = (app as unknown as { serviceName?: string }).serviceName ?? "service";
  const report = (event: string, err: unknown): void => {
    app.log.fatal({ err, event }, `${event}: the process cannot continue`);
    const die = (): void => {
      try {
        (app.log as { flush?: () => void }).flush?.();
      } catch {
        /* a logger that will not flush is not worth a second failure */
      }
      process.exit(1);
    };
    const hook = process.env.FATAL_WEBHOOK_URL;
    if (!hook) return die();
    fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: serviceName,
        event,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? (err.stack ?? "").slice(0, 2000) : "",
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(2_000),
    })
      .catch(() => undefined)
      .finally(() => die());
    // …and a ceiling under the bound, in case fetch itself misbehaves.
    setTimeout(die, 2_500).unref();
  };
  process.on("uncaughtException", (err) => report("uncaughtException", err));
  // With a listener present Node no longer applies its default of printing
  // and crashing — the report is the crash now, so it decides the exit too.
  // Same verdict either way: a rejection nobody awaited means the state
  // after it cannot be trusted, and the line says so before the code says 1.
  process.on("unhandledRejection", (reason) => report("unhandledRejection", reason));

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
