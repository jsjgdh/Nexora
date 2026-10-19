import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  INVALID_TOKEN_CODE,
  emailRequestSchema,
  passwordPolicyMessage,
  type PublicUser,
} from "@nexora/contracts";
import { ApiError, clientIp, newId, parseOr400, sha256 } from "@nexora/service-kit";
import { randomBytes } from "node:crypto";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./crypto.js";
import { revokeAccountBefore } from "./revocation-store.js";
import { mailLog, sendMail, siteBaseUrl, siteUrl } from "./mail.js";
import { toPublic, type UserRow } from "./public-user.js";

/* The two identity flows the platform did not have: a forgotten password and
 * an unverified address.
 *
 * A learner who forgot their password was locked out permanently, with no
 * mail and no way back in. That is the gap this module closes, and the shape
 * of the answer is the whole design:
 *
 *   POST /password-reset/request   { email }            -> 202 { ok: true }
 *   POST /password-reset/confirm   { token, newPassword } -> 200 { ok: true }
 *   POST /verify-email/request     { email }            -> 202 { ok: true }
 *   POST /verify-email/confirm     { token }            -> 200 { user, verified: true }
 *
 * The request routes never say whether an account exists. Not in the status,
 * not in the body, and not in how long the answer takes. The rules that make
 * that true, each one a decision:
 *
 *   1. One answer for every case: an existing account, a Clerk-managed
 *      account, an address nobody has heard of, an address that is already
 *      confirmed. All of them get 202 with the same body.
 *   2. The same work before the answer, so the answer does not arrive faster
 *      for an address that has no account. A bcrypt comparison runs either
 *      way, exactly as it does on the sign-in path, whose identical body was
 *      an oracle until the compare was made unconditional.
 *   3. The rate limits are keyed on values that do not depend on the
 *      account: the client address, and the address string itself. The
 *      per-address budget is counted for an address with no account exactly
 *      as it is for one with an account, so the two cannot be told apart by
 *      how quickly they are refused either.
 *   4. A token that cannot be spent gets one answer: unknown, expired,
 *      already used and malformed are four facts and the client is told the
 *      same thing about all four.
 *
 * What is NOT here, and why: the rights and consents ledger. A password
 * change is not a consent (there is no document, no version and no basis a
 * learner can withdraw) and it is not a data-subject request (there is no
 * statutory clock and no answer owed). Writing either would put a fact the
 * ledger does not mean into it, and a ledger that means two things is a
 * ledger nobody can read. The record of a password change is the one the
 * platform already keeps for exactly this: the refresh tokens it revoked and
 * the account cut-off it wrote, plus a line in the service log.
 */

/** How long a reset link is good for. Long enough to find a mail, short enough to expire. */
const PASSWORD_RESET_TTL_MS = 60 * 60_000;

/** How long a confirmation link is good for. A day is a day to find a mail in. */
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;

/**
 * The budgets on the request routes.
 *
 * Two of them, and they defend different things. The address budget stops
 * one host spraying many addresses; the account budget stops many hosts
 * working one address, which no address budget can see. The account budget is
 * keyed on the address STRING and is counted for every request, whether or
 * not an account exists, so its verdict never depends on the account: a
 * budget that only existed for real accounts would be an oracle, because the
 * answer it gives would differ.
 */
const REQUEST_ADDRESS_WINDOW_MS = 15 * 60_000;
const REQUEST_ADDRESS_MAX = 10;
const REQUEST_ACCOUNT_WINDOW_MS = 15 * 60_000;
const REQUEST_ACCOUNT_MAX = 5;

/**
 * The budget on the confirmation routes.
 *
 * A token is 256 bits of randomness, so guessing one is not a thing anybody
 * can do; this budget is not about the token. It is about the cost of the
 * work a confirmation does (a bcrypt hash) and about a flood of junk
 * confirmations turning this service into a password-hashing machine. It is
 * keyed on the client address only, so it never depends on whether the token
 * was any good.
 */
const CONFIRM_WINDOW_MS = 15 * 60_000;
const CONFIRM_MAX = 30;

/** One message for every refusal by a budget, so no budget is a louder one. */
const RATE_LIMITED_MESSAGE = "Too many requests. Try again in a few minutes.";

/**
 * A secret nobody holds, compared against a hash nobody can use.
 *
 * The comparison is the point, not the result: it costs one bcrypt operation
 * at the deployment's own cost factor, and it runs on every request whether
 * or not an account exists. The value is not a secret and does not need to
 * be: it is compared against a hash of a random value, so it can never
 * authenticate anybody.
 */
const TIMING_EQUALISER = "nexora-identity-flow-timing-equaliser";

/**
 * One fixed window of requests, counted per key.
 *
 * In memory and per instance, like every other limit in this codebase; the
 * documented move to a shared store is what makes this true across replicas.
 * Per app instance rather than per module, so a process that mounts a second
 * app (the test suite does) does not inherit the first app's budget.
 */
class Window {
  private readonly hits = new Map<string, { count: number; reset: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  /**
   * Count one hit against `key` and say whether the budget still has room.
   *
   * The hit is counted whatever the answer is, and the answer is the only
   * thing the caller acts on.
   */
  take(key: string): boolean {
    const now = Date.now();
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      this.sweep(now);
      return true;
    }
    cur.count += 1;
    return cur.count <= this.max;
  }

  /** Amortised cleanup, as in the sign-in limiter: only walk a large map. */
  private sweep(now: number): void {
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) {
      if (v.reset <= now) this.hits.delete(k);
    }
  }
}

/**
 * The token, read leniently.
 *
 * A token that is missing, of the wrong type or empty is a MALFORMED token,
 * and a malformed token gets the same answer as an unknown, an expired and an
 * already-used one. So the token is read here and refused in one place,
 * rather than a parser answering first and telling a prober which of the
 * four cases it was.
 */
function readToken(body: unknown): string {
  const raw = (body ?? {}) as { token?: unknown };
  return typeof raw.token === "string" ? raw.token : "";
}

/** The new password, read as a string. A body without one is a bad request. */
function readPassword(body: unknown): string {
  const raw = (body ?? {}) as { newPassword?: unknown };
  if (typeof raw.newPassword !== "string") {
    throw new ApiError(400, "bad_request", "Invalid request body.");
  }
  return raw.newPassword;
}

/** The one answer a token that cannot be spent gets. */
function invalidToken(message: string): ApiError {
  return new ApiError(400, INVALID_TOKEN_CODE, message);
}

/** How long a link is good for, in words. One source, so the mail cannot lie. */
function expiryWords(ms: number): string {
  if (ms <= 60 * 60_000) return "one hour";
  if (ms <= 24 * 60 * 60_000) return "one day";
  return `${Math.round(ms / (24 * 60 * 60_000))} days`;
}

interface RequestFlow {
  purpose: "password_reset" | "email_verification";
  ttlMs: number;
  /** The site route the link points at. */
  sitePath: string;
  /**
   * The environment variable that can move the link to a different route.
   *
   * The site and this service are two halves of one product, and a path that
   * only one half knows is a broken link on the day somebody renames a page.
   * The override is a PATH, not a URL: the origin is always PUBLIC_SITE_URL,
   * so a mail can never point at a host that is not this product. An override
   * that is not a path (or that carries its own query) is ignored, and the
   * default stands.
   */
  pathEnv: string;
  /**
   * Whether this account can be given a token of this kind at all.
   *
   * A password reset needs a local password to reset: a Clerk-managed
   * account has no password here, and minting one would create a second way
   * into an identity the provider owns. An already-confirmed address needs
   * no confirmation: asking again is a no-op that still answers 202.
   */
  eligible: (user: UserRow & { password_hash?: string | null }) => boolean;
  /** The message, built from the link. */
  message: (to: string, link: string) => { subject: string; text: string; html: string };
}

const PASSWORD_RESET_FLOW: RequestFlow = {
  purpose: "password_reset",
  ttlMs: PASSWORD_RESET_TTL_MS,
  sitePath: "/auth/password-reset/confirm",
  pathEnv: "PASSWORD_RESET_PATH",
  eligible: (user) => typeof user.password_hash === "string" && user.password_hash.length > 0,
  message: (_to, link) => ({
    subject: "NEXORA: reset your password",
    text: [
      "Someone asked to reset the password on your NEXORA account.",
      "",
      "Open this link to choose a new password:",
      "",
      `  ${link}`,
      "",
      `The link works for ${expiryWords(PASSWORD_RESET_TTL_MS)}. After that, ask for a new one.`,
      "",
      "If you did not ask for this, ignore this message. Nothing has changed, and nobody can see your password.",
    ].join("\n"),
    html: [
      "<p>Someone asked to reset the password on your NEXORA account.</p>",
      "<p>Open this link to choose a new password:</p>",
      `<p><a href="${link}">${link}</a></p>`,
      `<p>The link works for ${expiryWords(PASSWORD_RESET_TTL_MS)}. After that, ask for a new one.</p>`,
      "<p>If you did not ask for this, ignore this message. Nothing has changed, and nobody can see your password.</p>",
    ].join(""),
  }),
};

const VERIFY_EMAIL_FLOW: RequestFlow = {
  purpose: "email_verification",
  ttlMs: EMAIL_VERIFICATION_TTL_MS,
  sitePath: "/auth/verify-email/confirm",
  pathEnv: "VERIFY_EMAIL_PATH",
  eligible: (user) => !user.email_verified_at,
  message: (_to, link) => ({
    subject: "NEXORA: confirm your email address",
    text: [
      "Confirm your email address for your NEXORA account.",
      "",
      "Open this link to confirm it:",
      "",
      `  ${link}`,
      "",
      `The link works for ${expiryWords(EMAIL_VERIFICATION_TTL_MS)}. After that, ask for a new one.`,
      "",
      "If you did not ask for this, ignore this message. Nothing has changed.",
    ].join("\n"),
    html: [
      "<p>Confirm your email address for your NEXORA account.</p>",
      "<p>Open this link to confirm it:</p>",
      `<p><a href="${link}">${link}</a></p>`,
      `<p>The link works for ${expiryWords(EMAIL_VERIFICATION_TTL_MS)}. After that, ask for a new one.</p>`,
      "<p>If you did not ask for this, ignore this message. Nothing has changed.</p>",
    ].join(""),
  }),
};

/**
 * The route a flow's link points at: the configured override when there is a
 * usable one, the default otherwise.
 *
 * A path is the only thing that may be overridden. An absolute URL is
 * refused, because the origin of a mail that carries a live token must be
 * this product and nothing else, and a value that already carries a query
 * would produce a link with two `?` in it.
 */
function linkPath(flow: RequestFlow): string {
  const raw = (process.env[flow.pathEnv] ?? "").trim();
  if (!raw.startsWith("/") || raw.includes("?") || raw.includes("#")) return flow.sitePath;
  return raw;
}

export function registerIdentityRoutes(app: FastifyInstance, pool: Pool): void {
  /* The budgets. One set per flow, so a burst of password resets does not
   * spend the budget of an address verification and the other way round. */
  const resetAddress = new Window(REQUEST_ADDRESS_WINDOW_MS, REQUEST_ADDRESS_MAX);
  const resetAccount = new Window(REQUEST_ACCOUNT_WINDOW_MS, REQUEST_ACCOUNT_MAX);
  const verifyAddress = new Window(REQUEST_ADDRESS_WINDOW_MS, REQUEST_ADDRESS_MAX);
  const verifyAccount = new Window(REQUEST_ACCOUNT_WINDOW_MS, REQUEST_ACCOUNT_MAX);
  const confirmations = new Window(CONFIRM_WINDOW_MS, CONFIRM_MAX);

  /**
   * The request route, for both flows.
   *
   * The answer is 202 with `{ ok: true }` in every case, and the only way to
   * get anything else is to be refused by a budget, which is refused in the
   * same words whoever it is aimed at.
   */
  async function handleRequest(
    flow: RequestFlow,
    addressBudget: Window,
    accountBudget: Window,
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> {
    const body = parseOr400(emailRequestSchema, req.body);
    const email = body.email.trim().toLowerCase();

    /* Both budgets are counted BEFORE the lookup, and the account budget is
     * counted for every request whatever the address turns out to be. That is
     * the whole no-enumeration property of the rate limit: a budget that only
     * existed for real accounts would refuse exactly the addresses that have
     * one, and the refusal is the answer. */
    const addressOk = addressBudget.take(clientIp(req));
    const accountOk = accountBudget.take(email);
    if (!addressOk || !accountOk) {
      throw new ApiError(429, "rate_limited", RATE_LIMITED_MESSAGE);
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = $1", [email]);
    const user = (rows[0] as (UserRow & { password_hash?: string | null }) | undefined) ?? null;

    /* The same work either way.
     *
     * One bcrypt comparison against a hash nobody can use, on every request,
     * exactly as the sign-in path does it. The sign-in route learned this the
     * hard way: an identical body that arrived in a fraction of the time was
     * an oracle for precisely what the body was hiding. */
    await verifyPassword(TIMING_EQUALISER, dummyPasswordHash());

    /* Without the site's origin there is no link to send, so there is no
     * token to store: a stored token nobody can be sent is a live credential
     * with no way to reach it. The answer is the same 202 as every other
     * case, and the reason is logged. */
    const base = siteBaseUrl();
    if (!base) {
      mailLog({
        event: "mail.skipped",
        reason: "PUBLIC_SITE_URL is not configured, so the link could not be built",
        to: user?.email ?? email,
        subject: flow.purpose === "password_reset" ? "NEXORA: reset your password" : "NEXORA: confirm your email address",
      });
      return reply.code(202).send({ ok: true });
    }

    if (user && flow.eligible(user)) {
      const token = randomBytes(32).toString("hex");
      const id = newId();
      await pool.query(
        "INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)",
        [id, user.id, flow.purpose, sha256(token), new Date(Date.now() + flow.ttlMs)]
      );
      /* Only the newest link works.
       *
       * The older unused tokens of the same purpose are spent, so a link that
       * has been sitting in an inbox for a week cannot be used after the
       * learner has asked for a new one. The new token is excluded from the
       * sweep, and the sweep runs after the insert, so two requests arriving
       * together cannot leave two live links behind. */
      await pool.query(
        "UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND id <> $3",
        [user.id, flow.purpose, id]
      );
      const link = siteUrl(`${linkPath(flow)}?token=${encodeURIComponent(token)}`);
      const message = flow.message(user.email, link);
      /* The mail is not awaited.
       *
       * Two reasons, and the second is the important one. The first is that a
       * provider that is slow must not hold up a request whose answer does
       * not depend on the mail. The second is that awaiting it would make the
       * answer arrive measurably later for an address that HAS an account
       * than for one that has not, which is exactly the timing oracle this
       * route must not have. */
      void sendMail({
        to: user.email,
        ...message,
        devToken: { purpose: flow.purpose, token, url: link },
      }).catch(() => undefined);
      req.log.info({ userId: user.id, purpose: flow.purpose }, "identity token issued");
    }

    return reply.code(202).send({ ok: true });
  }

  app.post("/password-reset/request", async (req, reply) => {
    return handleRequest(PASSWORD_RESET_FLOW, resetAddress, resetAccount, req, reply);
  });

  app.post("/verify-email/request", async (req, reply) => {
    return handleRequest(VERIFY_EMAIL_FLOW, verifyAddress, verifyAccount, req, reply);
  });

  /* Spending a password-reset token.
   *
   * The order of the work is the order of what costs something:
   *
   *   1. the budget, because a refusal should cost nothing at all;
   *   2. the token, because a bad token must not cost a bcrypt hash (that
   *      would let anybody who can reach the route spend the service's CPU);
   *   3. the password policy, because a policy failure must not cost a hash
   *      either, and because the learner is told WHICH rule they broke;
   *   4. the hash, and only then the write.
   */
  app.post("/password-reset/confirm", async (req) => {
    if (!confirmations.take(clientIp(req))) {
      throw new ApiError(429, "rate_limited", RATE_LIMITED_MESSAGE);
    }
    const token = readToken(req.body);
    const newPassword = readPassword(req.body);
    const refusal = invalidToken("That reset link is not valid any more. Ask for a new one.");
    if (!token) throw refusal;

    const { rows } = await pool.query(
      "SELECT * FROM auth_tokens WHERE token_hash = $1 AND purpose = 'password_reset'",
      [sha256(token)]
    );
    const row = rows[0] as { id: string; user_id: string; used_at: Date | null; expires_at: Date } | undefined;
    // Unknown, expired and already used are the same answer. So is a token
    // of the other kind: the query names the purpose, so a confirmation
    // token simply is not found here.
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) throw refusal;

    const policy = passwordPolicyMessage(newPassword);
    if (policy) {
      // The same policy the registration path applies, said in words rather
      // than as "Invalid request body".
      throw new ApiError(400, "weak_password", policy);
    }

    const passwordHash = await hashPassword(newPassword);
    const at = new Date();

    /* The change, in ONE statement.
     *
     * Three writes that must all happen or none of them: the token is
     * spent, the password is set, and every session the account holds is
     * ended. A password change that set the password but left the old
     * sessions alive would be a password change that did not lock anybody
     * out, which is the one thing a learner who forgot their password is
     * actually asking for.
     *
     * The claim of the token is inside the statement and guarded
     * (`used_at IS NULL`), so of any number of confirmations arriving
     * together exactly one wins it and the others are told the token is no
     * longer good. The two statements that follow it in the same WITH are
     * executed exactly once each whatever the final SELECT reads, which is
     * what PostgreSQL guarantees for data-modifying CTEs.
     *
     * The account cut-off is written after this statement, through the one
     * mechanism the platform already has for it (revocation-store.ts), so the
     * access token in the learner's hand dies with the session instead of
     * living out its lifetime. */
    const changed = await pool.query(
      "WITH claimed AS (" +
        "UPDATE auth_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING user_id" +
        "), new_password AS (" +
        "UPDATE users SET password_hash = $2 WHERE id = (SELECT user_id FROM claimed)" +
        "), sessions AS (" +
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = (SELECT user_id FROM claimed) AND revoked_at IS NULL" +
        ") SELECT (SELECT count(*) FROM claimed)::int AS claimed",
      [row.id, passwordHash]
    );
    if (Number(changed.rows[0]?.claimed ?? 0) === 0) throw refusal;

    await revokeAccountBefore(pool, row.user_id, at);
    req.log.info(
      { userId: row.user_id },
      "password changed: every session of this account was ended"
    );
    return { ok: true };
  });

  /* Spending a confirmation token.
   *
   * The same shape as the reset, with one difference that is not a detail:
   * confirming an address does not end anybody's session. It changes what
   * the platform knows about an address, and nothing about who may use the
   * account, so there is nothing to revoke. */
  app.post("/verify-email/confirm", async (req) => {
    if (!confirmations.take(clientIp(req))) {
      throw new ApiError(429, "rate_limited", RATE_LIMITED_MESSAGE);
    }
    const token = readToken(req.body);
    const refusal = invalidToken("That confirmation link is not valid any more. Ask for a new one.");
    if (!token) throw refusal;

    const { rows } = await pool.query(
      "SELECT * FROM auth_tokens WHERE token_hash = $1 AND purpose = 'email_verification'",
      [sha256(token)]
    );
    const row = rows[0] as { id: string; user_id: string; used_at: Date | null; expires_at: Date } | undefined;
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) throw refusal;

    /* Spend the token and mark the address, in one statement, so a
     * confirmation that is answered twice cannot mark the address twice and
     * cannot leave the token live after the answer was given.
     *
     * COALESCE keeps the FIRST confirmation time: a second confirmation of
     * an address that is already confirmed does not move the fact about when
     * it was confirmed. */
    const claimed = await pool.query(
      "WITH claimed AS (" +
        "UPDATE auth_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING user_id" +
        "), marked AS (" +
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = (SELECT user_id FROM claimed)" +
        ") SELECT (SELECT count(*) FROM claimed)::int AS claimed",
      [row.id]
    );
    if (Number(claimed.rows[0]?.claimed ?? 0) === 0) throw refusal;

    const { rows: users } = await pool.query("SELECT * FROM users WHERE id = $1", [row.user_id]);
    const user = users[0] as UserRow | undefined;
    if (!user) throw refusal;

    req.log.info({ userId: user.id }, "email address confirmed");
    const publicUser: PublicUser = toPublic(user);
    return { user: { ...publicUser, emailVerified: true }, verified: true };
  });
}
