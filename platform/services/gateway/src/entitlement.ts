/* Entitlement, resolved once, at the edge.
 *
 * A paid curriculum route must not serve a learner billing has not confirmed.
 * Asking billing on every request would put a database round-trip in the hot
 * path of every phase fetch, so the answer is cached for a short TTL. Two rules
 * make the cache safe rather than merely fast:
 *
 *   - A cached GRANT expires on its own, so a cancellation takes effect within
 *     the TTL even if no webhook ever arrives.
 *   - A cached DENIAL is dropped the moment a billing webhook is proxied (see
 *     index.ts), so a learner who subscribes is not stuck waiting out the TTL.
 *     The webhook carries no user id we recognise, so the drop is whole-cache;
 *     webhooks are rare and the next request simply re-asks.
 *
 * Single-instance by design, exactly like the rate limiter in limits.ts: put a
 * shared store here when running more than one gateway.
 *
 * The result is three states, not two. "unknown" is what a billing outage looks
 * like, and it must never be collapsed into "not entitled" — the extension has
 * to be able to tell a learner "we can't check right now" from "you haven't
 * subscribed", the same way attest.ts refuses to let a network failure read as a
 * failed check. An unknown answer is never cached: a transient outage must not
 * be remembered as a denial. */

export type Entitlement = "entitled" | "not_entitled" | "unknown";

export interface EntitlementLookup {
  /** Resolve true/false on a definite answer; throw when billing cannot answer. */
  (userId: string): Promise<boolean>;
}

export class EntitlementCache {
  private cache = new Map<string, { entitled: boolean; expires: number }>();
  private lastSweep = 0;

  constructor(
    readonly ttlMs: number,
    private readonly lookup: EntitlementLookup
  ) {}

  async get(userId: string, now = Date.now()): Promise<Entitlement> {
    const hit = this.cache.get(userId);
    if (hit && hit.expires > now) return hit.entitled ? "entitled" : "not_entitled";
    let entitled: boolean;
    try {
      entitled = await this.lookup(userId);
    } catch {
      // Billing unreachable or erroring. Cache nothing, so the next request
      // gets a fresh answer the instant billing is back.
      return "unknown";
    }
    this.cache.set(userId, { entitled, expires: now + this.ttlMs });
    this.sweep(now);
    return entitled ? "entitled" : "not_entitled";
  }

  /** Drop one user's verdict, or every verdict when no id is given. */
  invalidate(userId?: string): void {
    if (userId === undefined) this.cache.clear();
    else this.cache.delete(userId);
  }

  private sweep(now: number): void {
    // Amortized cleanup, mirroring FixedWindow: on a large map, or at most once
    // per TTL — so expired verdicts are reclaimed even while the map is small.
    if (this.cache.size < 10_000 && now - this.lastSweep < this.ttlMs) return;
    this.lastSweep = now;
    for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
  }
}

/**
 * Ask the billing service whether a user is entitled, over the mesh. The
 * gateway calls billing directly (not through its own proxy) with the identity
 * it already resolved and the mesh key, which is exactly how billing expects to
 * be reached: `requireUserId` reads x-user-id and, in production, the service
 * chassis requires x-internal-key. A non-2xx or a network failure throws, which
 * the cache turns into "unknown" rather than a denial.
 */
export function billingLookup(opts: {
  url: string;
  internalKey: string;
  timeoutMs: number;
}): EntitlementLookup {
  return async (userId: string): Promise<boolean> => {
    const headers: Record<string, string> = { "x-user-id": userId };
    if (opts.internalKey) headers["x-internal-key"] = opts.internalKey;
    const res = await fetch(`${opts.url}/subscription`, {
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`billing /subscription returned ${res.status}`);
    const body = (await res.json()) as { subscription?: { entitled?: unknown } };
    return body?.subscription?.entitled === true;
  };
}
