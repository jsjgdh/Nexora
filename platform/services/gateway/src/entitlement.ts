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
 * be remembered as a denial.
 *
 * Two questions are asked now, not one:
 *
 *   1. Does billing have a subscription for this learner? A subscription
 *      covers every course, which is what `courses: null` means.
 *   2. Does the auth service say this learner holds a seat in an active
 *      cohort, and in which course? A seat covers exactly the course the
 *      institution bought, and nothing else.
 *
 * Either answer grants entitlement. A failure in either is "unknown", never a
 * denial. The cohort check adds a second lookup, not a second cache: one
 * verdict, one TTL, one cache, because two caches with two rules is how a
 * learner ends up with two answers.
 */

export type Entitlement = "entitled" | "not_entitled" | "unknown";

/**
 * The courses a verdict covers.
 *
 * `null` means every course, which is what a subscription means. A list means
 * exactly those courses, which is what a seat in one institution's class
 * means. The distinction is the whole point of the cohort check: a seat opens
 * the course it was bought for and not the other four.
 */
export type CoveredCourses = string[] | null;

export interface EntitlementAnswer {
  status: Entitlement;
  /** The courses this verdict covers. Null means every course. */
  courses: CoveredCourses;
}

export interface EntitlementLookup {
  /** Resolve a verdict; throw when the service cannot answer at all. */
  (userId: string): Promise<EntitlementAnswer>;
}

export class EntitlementCache {
  private cache = new Map<string, { answer: EntitlementAnswer; expires: number }>();
  private lastSweep = 0;

  constructor(
    readonly ttlMs: number,
    private readonly lookup: EntitlementLookup
  ) {}

  async get(userId: string, now = Date.now()): Promise<EntitlementAnswer> {
    const hit = this.cache.get(userId);
    if (hit && hit.expires > now) return hit.answer;
    let answer: EntitlementAnswer;
    try {
      answer = await this.lookup(userId);
    } catch {
      // Billing unreachable or erroring. Cache nothing, so the next request
      // gets a fresh answer the instant billing is back.
      return { status: "unknown", courses: null };
    }
    // An unknown verdict is not cached either: an outage must not be remembered
    // as a denial, and a transient failure must not outlive the failure.
    if (answer.status === "unknown") return answer;
    this.cache.set(userId, { answer, expires: now + this.ttlMs });
    this.sweep(now);
    return answer;
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
 *
 * A subscription covers every course, so this lookup answers a plain boolean:
 * the course list belongs to the seat check, which is the only thing that is
 * scoped.
 */
export function billingLookup(opts: {
  url: string;
  internalKey: string;
  timeoutMs: number;
}): (userId: string) => Promise<boolean> {
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

/** What the seat check answers: a seat, and the courses it covers. */
export interface SeatAnswer {
  entitled: boolean;
  courses: string[];
}

/**
 * Ask the auth service whether this learner holds a seat in an active cohort.
 *
 * The same mesh the revocation check uses: the gateway calls the auth service
 * directly with the mesh key, and the service's chassis refuses the call
 * without it. The subject is in the body because the gateway has already
 * resolved the identity from the learner's own token, and the body is not a
 * client input: a caller cannot reach this route at all.
 *
 * A non-2xx or a network failure throws, and the caller turns that into
 * "unknown" rather than a denial. A 200 that says nothing useful is read as
 * "no seat", because a verdict that cannot be understood must not grant
 * anything.
 */
export function seatLookup(opts: {
  url: string;
  internalKey: string;
  timeoutMs: number;
}): (userId: string) => Promise<SeatAnswer> {
  return async (userId: string): Promise<SeatAnswer> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.internalKey) headers["x-internal-key"] = opts.internalKey;
    const res = await fetch(`${opts.url}/internal/entitlement/seat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`auth /internal/entitlement/seat returned ${res.status}`);
    const body = (await res.json()) as { entitled?: unknown; courses?: unknown };
    const courses = Array.isArray(body?.courses)
      ? body.courses.filter((c): c is string => typeof c === "string")
      : [];
    // Fail closed: a seat is a seat only when the service says so AND says
    // which course it covers. A verdict with no course covers nothing.
    return { entitled: body?.entitled === true && courses.length > 0, courses };
  };
}

/**
 * The two questions, answered together.
 *
 * Either one grants entitlement: a subscription opens everything, a seat opens
 * the course it was bought for. The order matters only in which courses the
 * answer carries — a subscription carries them all.
 *
 * When neither says yes, the answer depends on whether either could answer at
 * all. A failure is "unknown", never "not_entitled": the extension has to be
 * able to tell a learner "we cannot check right now" from "you have not bought
 * it", and a billing or auth outage must not be remembered as a denial.
 */
export function combinedEntitlementLookup(opts: {
  subscription: (userId: string) => Promise<boolean>;
  seat: (userId: string) => Promise<SeatAnswer>;
}): EntitlementLookup {
  return async (userId: string): Promise<EntitlementAnswer> => {
    const [subscription, seat] = await Promise.allSettled([
      opts.subscription(userId),
      opts.seat(userId),
    ]);

    // A subscription covers every course. That is `courses: null`.
    if (subscription.status === "fulfilled" && subscription.value === true) {
      return { status: "entitled", courses: null };
    }
    // A seat covers exactly the courses the cohort was bought for.
    if (seat.status === "fulfilled" && seat.value.entitled) {
      return { status: "entitled", courses: seat.value.courses };
    }
    // Neither says yes. If either could not answer, the verdict is unknown.
    if (subscription.status === "rejected" || seat.status === "rejected") {
      return { status: "unknown", courses: null };
    }
    return { status: "not_entitled", courses: null };
  };
}
