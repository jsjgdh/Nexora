/* Fixed-window rate limiter (per key). Single-instance by design;
   put a shared counter (Redis) here when running >1 gateway. */

export class FixedWindow {
  private hits = new Map<string, { count: number; reset: number }>();

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
    return cur.count <= this.max;
  }

  retryAfterMs(key: string, now = Date.now()): number {
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) return 0;
    return Math.max(0, cur.reset - now);
  }

  private sweep(now: number) {
    // Amortized cleanup: only when the map grows unboundedly.
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) {
      if (v.reset <= now) this.hits.delete(k);
    }
  }
}
