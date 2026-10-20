/* Fixed-window rate limiter (per key). Single-instance by design;
   put a shared counter (Redis) here when running >1 gateway. */

export class FixedWindow {
  private hits = new Map<string, { count: number; reset: number }>();
  private lastSweep = 0;
  private refused = 0;

  constructor(
    readonly windowMs: number,
    readonly max: number
  ) {}

  /** True when the hit is allowed (and counted). */
  take(key: string, now = Date.now()): boolean {
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      this.sweep(now);
      return true;
    }
    cur.count += 1;
    const allowed = cur.count <= this.max;
    if (!allowed) this.refused += 1;
    return allowed;
  }

  retryAfterMs(key: string, now = Date.now()): number {
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) return 0;
    return Math.max(0, cur.reset - now);
  }

  /** How many hits this limiter has turned away. */
  get refusals(): number {
    return this.refused;
  }

  /** How many keys are being counted right now. */
  get size(): number {
    return this.hits.size;
  }

  private sweep(now: number) {
    // Time-based rather than "only when the map grows large": an expired entry
    // costs memory until it is dropped, and the old size threshold meant a map
    // of up to 9 999 dead keys was never cleaned at all. Sweeping no more often
    // than once per window keeps the map proportional to live traffic and keeps
    // the cost amortised.
    if (this.hits.size < 10_000 && now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [k, v] of this.hits) {
      if (v.reset <= now) this.hits.delete(k);
    }
  }
}

/**
 * The edge's whole-platform request budget.
 *
 * A per-address cap cannot see a flood that arrives from many addresses at
 * once, which is the shape a distributed flood has. This is the cap for that:
 * one budget for every request the gateway answers, and when it is spent the
 * gateway stops accepting work instead of queueing it. It is a breaker, not a
 * queue: the answer is a refusal with a retry hint, never a request held open
 * until something upstream gives up.
 *
 * `max` of 0 disables it.
 */
export class EdgeBudget {
  private windowStart = 0;
  private used = 0;
  private refused = 0;

  constructor(
    readonly windowMs: number,
    readonly max: number
  ) {}

  /** True when the request is allowed (and counted). */
  take(now = Date.now()): boolean {
    if (this.max <= 0) return true;
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.used = 0;
    }
    this.used += 1;
    if (this.used <= this.max) return true;
    this.refused += 1;
    return false;
  }

  /** How long until the budget is whole again. */
  retryAfterMs(now = Date.now()): number {
    if (this.max <= 0) return 0;
    return Math.max(0, this.windowStart + this.windowMs - now);
  }

  get refusals(): number {
    return this.refused;
  }

  get usedNow(): number {
    return this.used;
  }
}
