/* The gateway's circuit breaker, one per dependency.

   A dependency that is down must not turn into a slow answer. Every request
   the gateway forwards has a timeout, so a dead dependency costs the caller
   the whole timeout before the gateway admits it is dead, and a burst of
   requests costs it that many times over. The breaker replaces that with a
   fast, honest refusal: after a few failures in a row the dependency is
   treated as down, requests for it are refused without being forwarded, and
   one probe is let through after a cooldown to find out whether it came
   back.

   The state machine is the standard one, and it fails closed: while the
   breaker is open the answer is a refusal, never a guess that the dependency
   might be fine. */

export type BreakerState = "closed" | "open" | "half-open";

interface DependencyState {
  /** Failures in a row, while closed. */
  consecutiveFailures: number;
  state: BreakerState;
  /** When the breaker opened. */
  openedAt: number;
  /** When the breaker last failed, for the operator's view. */
  lastFailureAt: number;
}

export interface BreakerSnapshot {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
}

export class DependencyBreaker {
  private readonly deps = new Map<string, DependencyState>();

  constructor(
    /** Failures in a row before the breaker opens. */
    readonly failuresToOpen: number,
    /** How long the breaker stays open before one probe is let through. */
    readonly cooldownMs: number
  ) {}

  /**
   * True when the dependency may be called.
   *
   * A half-open breaker lets exactly one request through: the probe. While
   * that probe is in flight every other request is refused, because the
   * point of the probe is to find out whether the dependency is back, not to
   * let a queue of them through to find out at the same time.
   */
  allow(key: string, now = Date.now()): boolean {
    const st = this.deps.get(key);
    if (!st) return true;
    if (st.state === "closed") return true;
    if (st.state === "half-open") return false;
    // Open: the cooldown decides whether a probe is due.
    if (now - st.openedAt < this.cooldownMs) return false;
    st.state = "half-open";
    return true;
  }

  /** The dependency answered. The breaker closes, and the failure count resets. */
  success(key: string, now = Date.now()): void {
    const st = this.deps.get(key);
    if (!st) return;
    st.state = "closed";
    st.consecutiveFailures = 0;
    st.openedAt = 0;
    void now;
  }

  /** The dependency did not answer. */
  failure(key: string, now = Date.now()): void {
    const st = this.deps.get(key) ?? {
      consecutiveFailures: 0,
      state: "closed" as BreakerState,
      openedAt: 0,
      lastFailureAt: 0,
    };
    this.deps.set(key, st);
    st.lastFailureAt = now;
    if (st.state === "half-open") {
      // The probe failed: the dependency is still down.
      st.state = "open";
      st.openedAt = now;
      st.consecutiveFailures = this.failuresToOpen;
      return;
    }
    st.consecutiveFailures += 1;
    if (st.consecutiveFailures >= this.failuresToOpen) {
      st.state = "open";
      st.openedAt = now;
    }
  }

  state(key: string): BreakerState {
    return this.deps.get(key)?.state ?? "closed";
  }

  snapshot(key: string): BreakerSnapshot {
    const st = this.deps.get(key);
    if (!st) {
      return { state: "closed", consecutiveFailures: 0, openedAt: null, lastFailureAt: null };
    }
    return {
      state: st.state,
      consecutiveFailures: st.consecutiveFailures,
      openedAt: st.openedAt || null,
      lastFailureAt: st.lastFailureAt || null,
    };
  }

  /** Every dependency the breaker has an opinion about. */
  snapshotAll(): Record<string, BreakerSnapshot> {
    const out: Record<string, BreakerSnapshot> = {};
    for (const key of this.deps.keys()) out[key] = this.snapshot(key);
    return out;
  }
}
