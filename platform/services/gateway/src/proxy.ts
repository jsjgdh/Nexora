import type { RouteConfig } from "./config.js";

/* Reverse proxy core: route matching, header hygiene, forwarding, and
   upstream-failure mapping. JSON-only edge (all platform APIs speak JSON). */

export const MAX_BODY_BYTES = 256_000;
const MAX_RESPONSE_BYTES = 4_000_000;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

/**
 * Headers a client must never be able to set on the request we hand downstream.
 *
 * The identity headers are the load-bearing ones: every service reads
 * `x-user-id` as the authenticated user with no further check, so forwarding a
 * client-supplied copy is an impersonation primitive the moment any public or
 * optional-auth route calls `requireUserId`. `x-entitled` is the same kind of
 * trust: the gateway sets it only after billing confirms a subscription, and a
 * paid curriculum route serves on it, so a client that could send it could
 * unlock the paywall by typing a header. `x-internal-key` would forge mesh
 * auth, and the `x-forwarded-*` family would let a caller lie about their IP to
 * services that also trust the proxy layer. Overwriting a header after the loop
 * only helps when the value we overwrite with is truthy — on an anonymous
 * request there is no user id to overwrite with, which is exactly the case that
 * leaked. Strip, then inject. */
const NEVER_FORWARDED = new Set([
  "authorization",
  "cookie",
  "host",
  "x-user-id",
  "x-entitled",
  "x-internal-key",
  "x-request-id",
  // The client address is ours to resolve, never theirs to assert: a service
  // keys its own limiter on x-client-ip, so a client-chosen value would let one
  // caller walk around a service's throttle by inventing a new address.
  "x-client-ip",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
  "forwarded",
]);

/**
 * The path the upstream service is asked for.
 *
 * The gateway strips the matched prefix, because upstream services own their
 * root paths (/register, not /api/auth/register). An alias is the case where
 * the two differ: the caller says /api/proofs and the auth service owns
 * /proofs, so the alias is translated rather than stripped. Without this the
 * alias was forwarded as "/" and answered 404, which reads like a missing
 * route rather than a mistranslated one.
 */
export function upstreamPathFor(route: RouteConfig, path: string): string {
  const remainder = path.length === route.prefix.length ? "" : path.slice(route.prefix.length);
  if (route.upstreamPrefix) return `${route.upstreamPrefix}${remainder}`;
  return remainder === "" ? "/" : remainder;
}

export function matchRoute(path: string, routes: RouteConfig[]): RouteConfig | null {
  let best: RouteConfig | null = null;
  for (const r of routes) {
    if ((path === r.prefix || path.startsWith(r.prefix + "/")) && (!best || r.prefix.length > best.prefix.length)) {
      best = r;
    }
  }
  return best;
}

/** Outbound headers: strip hop-by-hop + client identity, inject mesh auth,
    user id (post-JWT), and request tracing. The client's Bearer token is
    deliberately NOT forwarded — downstream trusts x-user-id from us.
    `entitled` is injected only on a paid route the entitlement gate cleared;
    like x-user-id it is a verdict downstream trusts, never a client input.
    `clientIp` is the address WE resolved (our own trustProxy-aware req.ip),
    because a service that must rate-limit a caller cannot use its own req.ip:
    every request through this proxy arrives from here, so that would be one
    shared bucket for the whole internet. */
export function buildForwardHeaders(
  incoming: Record<string, string | string[] | undefined>,
  opts: {
    userId: string | null;
    internalKey: string;
    requestId: string;
    entitled?: boolean;
    clientIp?: string;
  }
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (NEVER_FORWARDED.has(key)) continue;
    if (typeof v === "string" && v) out[key] = v;
    else if (Array.isArray(v) && v[0]) out[key] = v[0];
  }
  out["content-type"] = "application/json";
  out["x-request-id"] = opts.requestId;
  if (opts.clientIp) out["x-client-ip"] = opts.clientIp;
  if (opts.userId) out["x-user-id"] = opts.userId;
  if (opts.entitled) out["x-entitled"] = "1";
  if (opts.internalKey) out["x-internal-key"] = opts.internalKey;
  return out;
}

export interface ProxyResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export async function forward(opts: {
  target: string;
  path: string;
  query: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
  timeoutMs: number;
}): Promise<ProxyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(opts.target + opts.path + opts.query, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      const err = new Error("upstream response too large") as Error & { status?: number; code?: string };
      err.status = 502;
      err.code = "bad_gateway";
      throw err;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (HOP_BY_HOP.has(key) || key === "content-length" || key === "content-encoding") return;
      headers[key] = v;
    });
    return { status: res.status, headers, body: buf };
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      const e = new Error("Upstream timed out.") as Error & { status?: number; code?: string };
      e.status = 504;
      e.code = "upstream_timeout";
      throw e;
    }
    if (err instanceof Error && "status" in err && typeof (err as { status?: unknown }).status === "number") {
      throw err;
    }
    const e = new Error("Upstream unavailable.") as Error & { status?: number; code?: string };
    e.status = 502;
    e.code = "bad_gateway";
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
