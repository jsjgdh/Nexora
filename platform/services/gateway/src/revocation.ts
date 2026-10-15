/* Immediate revocation: the shared check the edge consults before it trusts a
 * token.
 *
 * A locally verified token is trusted on its signature alone, and that is what
 * keeps the gateway stateless — but it also meant a token kept working for the
 * rest of its lifetime after the learner signed out. This module is the answer to
 * that: the auth service records a token's `jti` when its session ends, and every
 * authenticated request asks about the `jti` it was given.
 *
 * Two properties are load-bearing, and both come from the same fact — a `jti` is
 * never un-revoked:
 *
 *   - A REVOKED answer is cached, and worth caching. It cannot become false, so
 *     remembering it costs one bounded map entry and saves a lookup on every
 *     later request from a thief reusing the same token. The entry is dropped
 *     when the token would have expired, which is the only point at which the
 *     answer stops mattering.
 *   - A CLEAR answer never replaces a lookup. Caching it in the request path would
 *     reintroduce exactly the window this exists to remove: sign out, and the next
 *     request would sail through on yesterday's answer. Every authenticated
 *     request still asks, and a confirmed clear is only *recorded* — as the
 *     bounded fallback described at the end of this note. The cost is one lookup
 *     per authenticated request, which is the price of the guarantee and is stated
 *     as such in config.ts and the audit.
 *
 * The third state is not two. When the check cannot be reached the gateway must
 * not read that as "still valid" (that is the hole, quietly reopened) nor as
 * "revoked" (that would sign every learner out for an operational problem). It is
 * reported as unknown and the edge answers 503, exactly as the entitlement check
 * does for a billing outage.
 *
 * …but a 503 for every request is an outage of its own, and a check that is briefly
 * unavailable must not read as "the product is down". So there is exactly one
 * bounded exception: a credential whose *clear* answer was confirmed within
 * `clearTtlMs` keeps working while the service cannot be reached, and comes back as
 * `degraded` rather than `clear` so the edge logs it and an operator can see every
 * request that rode through the window. Three properties keep that from reopening
 * the hole this module exists to close:
 *
 *   - the fallback is never consulted while the service answers. Every request
 *     asks; a confirmed clear is *recorded* for later, never used to skip a check,
 *     so the guarantee above is unchanged in the ordinary case.
 *   - it is reported, never assumed. A credential nobody confirmed inside the bound
 *     is still `unknown`, so an outage is not a blanket allow — a token the
 *     platform has not seen during the window fails closed.
 *   - it expires. An entry stops being usable `clearTtlMs` after its confirmation,
 *     so a long outage converges back to 503 on its own and the most a
 *     stolen-but-signed-out credential gains is bounded by that TTL.
 */

export type RevocationVerdict = "revoked" | "clear" | "unknown";

/** Which half of the denylist refused a token. For logs, never for a client. */
export type RevocationReason = "credential" | "account";

export interface RevocationAnswer {
  revoked: boolean;
  reason?: RevocationReason;
}

/**
 * The facts a check needs. `jti` identifies the credential; the other two are what
 * an account-wide sign-out is judged on (see revocation-store.ts in the auth
 * service), and they are read from the token the gateway just verified — never
 * from anything a client sent.
 */
export interface RevocationSubject {
  jti: string;
  userId: string | null;
  issuedAtMs: number | null;
  /**
   * The token's expiry, used for one thing only: bounding how long a refusal is
   * remembered locally. The service does not need it (its own row carries the
   * expiry it prunes by), so it is not sent on the wire.
   */
  expiresAtMs: number | null;
}

/** Resolve an answer on a definite one; throw when the answer cannot be had. */
export interface RevocationLookup {
  (subject: RevocationSubject): Promise<RevocationAnswer>;
}

export interface RevocationCounters {
  /** Requests that needed an answer and got a definite one from the service. */
  asked: number;
  /** Requests refused, and by which half of the denylist. */
  refused: { credential: number; account: number };
  /** Requests the service could not answer for, i.e. 503s at the edge. */
  unanswered: number;
  /**
   * Requests allowed on a bounded stale answer while the service was unreachable.
   *
   * Its own number, not folded into `asked`: these are the requests that would
   * have been 503s without the fallback, so the counter is the size of the
   * degradation — and the only way an operator can see what the window cost.
   */
  degraded: number;
  /** Refusals served from the cache, so an operator can see the cache working. */
  fromCache: number;
}

export interface RevocationHealth {
  /**
   * What the most recent check did: "unknown" until one has been attempted.
   *
   * `unknown` is deliberately not `unreachable`: a freshly booted gateway that has
   * not seen a token yet has nothing wrong with it, and reporting a healthy edge as
   * degraded until the first sign-in would train an operator to ignore the field.
   */
  authService: "reachable" | "unreachable" | "unknown";
  /**
   * True while an outage is *being ridden*: the last check failed and the newest
   * confirmed clear answer is still inside its bound, so authenticated requests are
   * flowing on the fallback rather than being refused. Once it goes false during an
   * outage, requests are failing closed again.
   */
  degraded: boolean;
  /** How long the auth service has been unreachable (ms); null when it is not. */
  outageMs: number | null;
  /** The bound in force, so an alert can say how long an exposure can last. */
  clearTtlMs: number;
  /** Counters since the process started. Cumulative: difference them for a rate. */
  counters: RevocationCounters;
  /** Credentials currently rideable through an outage — the exposure, by size. */
  fallbackIds: number;
  /** Refused credentials remembered here (bounded by token lifetime, pruned). */
  cachedRefusals: number;
}

export interface RevocationVerdicts {
  verdict: RevocationVerdict;
  reason: RevocationReason | null;
  /**
   * True when this answer came from the bounded fallback rather than from the
   * service: the caller may proceed, and has to log it (see the class note).
   */
  degraded: boolean;
}

export class RevocationCache {
  /** jti → when it stops mattering (epoch ms). Only ever holds revoked ids. */
  private revoked = new Map<string, number>();
  /**
   * jti → when the last confirmed clear answer stops being usable as a fallback.
   *
   * Not a cache in the request path: while the service answers, this is only ever
   * written, never read (see the module note). It exists so that an outage can be
   * ridden out for credentials we checked a moment ago.
   */
  private clears = new Map<string, number>();
  private lastSweep = 0;
  /**
   * What the last attempt did, and since when, for the health snapshot.
   *
   * Deliberately tiny state: it describes the *service*, not the cache, so it is
   * never invalidated by a sweep and a monitor can read it without touching either
   * map.
   */
  private lastAnsweredAt: number | null = null;
  private lastAttemptFailed: boolean | null = null;
  private outageStartedAt: number | null = null;
  /** Entries are bounded by token lifetime, but a bound is still a bound. */
  private static readonly MAX_ENTRIES = 10_000;
  /**
   * Counters, not a metrics client.
   *
   * This deployment has no metrics system and no alerting (the audit says so
   * plainly), so the observable form of these numbers is a structured log line:
   * the edge reports them on a timer, and only when something happened since the
   * last report. Cumulative and in-process, like every other limit and cache here
   * — they are about this instance, which is the only one there is.
   */
  private counters: RevocationCounters = {
    asked: 0,
    refused: { credential: 0, account: 0 },
    unanswered: 0,
    degraded: 0,
    fromCache: 0,
  };

  /**
   * `clearTtlMs` is how long a confirmed clear answer may be trusted when the
   * service cannot answer. 0 disables the fallback entirely, which is the strict
   * reading of "an unconfirmed session fails closed".
   */
  constructor(
    private readonly lookup: RevocationLookup,
    private readonly clearTtlMs: number
  ) {}

  async status(subject: RevocationSubject, now = Date.now()): Promise<RevocationVerdicts> {
    const known = this.revoked.get(subject.jti);
    if (known !== undefined && known > now) {
      this.counters.fromCache += 1;
      this.counters.refused.credential += 1;
      return { verdict: "revoked", reason: "credential", degraded: false };
    }
    let answer: RevocationAnswer;
    try {
      answer = await this.lookup(subject);
    } catch {
      // Unreachable or erroring. Nothing about the *failure* is cached — it says
      // nothing about this token. The one thing that may be used here is the last
      // confirmed clear answer, and only while it is still inside its bound: a
      // credential the platform has not confirmed since before the outage was
      // never checked, so it stays unknown and the edge still answers 503.
      //
      // The attempt is recorded before either answer, because both answers are the
      // outage: the difference between "the check is answered" and "we are on
      // borrowed time" is the thing a monitor alerts on, and the degraded path is
      // the case where nothing else in the product complains.
      this.lastAttemptFailed = true;
      if (this.outageStartedAt === null) this.outageStartedAt = now;
      this.sweep(now);
      const trusted = this.clears.get(subject.jti);
      if (trusted !== undefined && trusted > now) {
        this.counters.degraded += 1;
        return { verdict: "clear", reason: null, degraded: true };
      }
      this.counters.unanswered += 1;
      return { verdict: "unknown", reason: null, degraded: false };
    }
    this.lastAnsweredAt = now;
    this.lastAttemptFailed = false;
    this.outageStartedAt = null;
    this.counters.asked += 1;
    if (!answer.revoked) {
      if (this.clearTtlMs > 0) {
        this.clears.set(subject.jti, now + this.clearTtlMs);
        this.sweep(now);
      }
      return { verdict: "clear", reason: null, degraded: false };
    }
    const reason = answer.reason === "account" ? "account" : "credential";
    // Only the per-credential half is cached: it is a fact about this token that
    // can never become false, and it lives exactly as long as the token could.
    // An account cut-off is deliberately *not* cached — it is a moving boundary
    // that a later sign-in has to be able to move past.
    if (reason === "credential") {
      const until = subject.expiresAtMs ?? now + DEFAULT_HOLD_MS;
      this.revoked.set(subject.jti, until);
      // A refusal now overrides any earlier clear: the fallback must never be able
      // to serve an answer the service has since contradicted.
      this.clears.delete(subject.jti);
      this.sweep(now);
    }
    this.counters.refused[reason] += 1;
    return { verdict: "revoked", reason, degraded: false };
  }

  /** Snapshot of the counters since the process started. */
  stats(): RevocationCounters {
    return {
      asked: this.counters.asked,
      refused: { ...this.counters.refused },
      unanswered: this.counters.unanswered,
      degraded: this.counters.degraded,
      fromCache: this.counters.fromCache,
    };
  }

  /** Forget everything. For tests and for an operator who knows better. */
  clear(): void {
    this.revoked.clear();
    this.clears.clear();
  }

  get size(): number {
    return this.revoked.size;
  }

  /** How many credentials are currently rideable through an outage. */
  get clearSize(): number {
    return this.clears.size;
  }

  /**
   * The state of the check itself, for the edge's health endpoint.
   *
   * Counts and booleans only — no `jti`, no user id, nothing per-learner — because
   * this is served by a public health route. That is a considered choice: the block
   * tells an operator that the auth service is away, and it tells an attacker who
   * already holds a token nothing they could not learn by presenting it once (a 503
   * answers the question immediately). What it must never do is become an oracle for
   * *whether a specific credential is revoked*, which is why nothing that names one
   * appears here.
   */
  health(now = Date.now()): RevocationHealth {
    const answeredRecently =
      this.lastAnsweredAt !== null && now - this.lastAnsweredAt <= this.clearTtlMs;
    return {
      authService:
        this.lastAttemptFailed === null ? "unknown" : this.lastAttemptFailed ? "unreachable" : "reachable",
      degraded: this.lastAttemptFailed === true && this.clearTtlMs > 0 && answeredRecently,
      outageMs: this.outageStartedAt === null ? null : Math.max(0, now - this.outageStartedAt),
      clearTtlMs: this.clearTtlMs,
      counters: this.stats(),
      fallbackIds: this.clears.size,
      cachedRefusals: this.revoked.size,
    };
  }

  private sweep(now: number): void {
    // Amortised, like FixedWindow and EntitlementCache: on a large map, or at most
    // once a minute — so expired ids are reclaimed even while the map is small.
    if (this.revoked.size < 1_000 && this.clears.size < 1_000 && now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [jti, until] of this.revoked) if (until <= now) this.revoked.delete(jti);
    for (const [jti, until] of this.clears) if (until <= now) this.clears.delete(jti);
    // Dropping a live entry is safe: an uncached jti is asked about again, so the
    // worst case is one extra lookup, never a token that survives its revocation
    // (and for the fallback, one more request that fails closed rather than one
    // that is wrongly allowed).
    this.cap(this.revoked);
    this.cap(this.clears);
  }

  private cap(map: Map<string, number>): void {
    if (map.size <= RevocationCache.MAX_ENTRIES) return;
    const over = map.size - RevocationCache.MAX_ENTRIES;
    let dropped = 0;
    for (const jti of map.keys()) {
      map.delete(jti);
      if (++dropped >= over) break;
    }
  }
}

/** How long a revoked id is remembered when its token states no expiry: the
 *  longest any access token can be minted to live (see ACCESS_TOKEN_TTL_SECONDS). */
const DEFAULT_HOLD_MS = 15 * 60 * 1000;

/**
 * Ask the auth service whether a `jti` has been revoked, over the mesh.
 *
 * Direct service call (not through the gateway's own proxy), carrying the mesh
 * key — the same shape as the entitlement lookup in entitlement.ts, and the same
 * reason: internal endpoints are only reachable with that key. A non-2xx or a
 * transport failure throws, which the cache reports as unknown rather than as a
 * verdict. An unparseable body throws too: "we could not read the answer" is not
 * "not revoked".
 */
export function revocationLookup(opts: {
  url: string;
  internalKey: string;
  timeoutMs: number;
}): RevocationLookup {
  return async (subject: RevocationSubject): Promise<RevocationAnswer> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.internalKey) headers["x-internal-key"] = opts.internalKey;
    const res = await fetch(`${opts.url}/internal/revocations/check`, {
      method: "POST",
      headers,
      // The subject travels with the credential: without the user id and the
      // token's own issue time the service can only see the per-credential half of
      // the denylist, and an account-wide sign-out would look like a no-op.
      // (The expiry stays here — it bounds this cache and nothing else.)
      body: JSON.stringify({
        jti: subject.jti,
        ...(subject.userId ? { userId: subject.userId } : {}),
        ...(subject.issuedAtMs !== null ? { issuedAtMs: subject.issuedAtMs } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`auth revocation check returned ${res.status}`);
    const body = (await res.json()) as { revoked?: unknown; reason?: unknown };
    if (typeof body?.revoked !== "boolean") throw new Error("auth revocation check returned no verdict");
    const reason = body.reason === "account" || body.reason === "credential" ? body.reason : undefined;
    return reason ? { revoked: body.revoked, reason } : { revoked: body.revoked };
  };
}
