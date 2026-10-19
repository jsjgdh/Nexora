import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  deviceApproveSchema,
  devicePollSchema,
  designReceiptPayload,
  designReceiptSchema,
  incidentReceiptPayload,
  incidentReceiptSchema,
  loginSchema,
  linkSchema,
  logoutAllSchema,
  logoutSchema,
  proofSubmitSchema,
  refreshSchema,
  registerSchema,
  revocationCheckSchema,
  runReceiptPayload,
  type PublicUser,
} from "@nexora/contracts";
import {
  credentialStatus,
  revokeAccountBefore,
  revokeCredential,
} from "./revocation-store.js";
import { assertDeclarationsAllowed, registerRightsRoutes, signupStatement } from "./rights.js";
import { ApiError, clientIp, newId, parseOr400, requireUserId, receiptEdPublicKey, sha256, verifyReceiptEd, verifyReceiptSignature } from "@nexora/service-kit";
import { randomBytes } from "node:crypto";
import {
  accessTokenClaims,
  accessTokenTtlSeconds,
  dummyPasswordHash,
  hashPassword,
  newRefreshToken,
  signAccessToken,
  verifyPassword,
} from "./crypto.js";

const REFRESH_DAYS = 30;

/* Two independent throttles on sign-in, because they defend different things.
 *
 * The address budget stops one host from spraying many accounts. It is keyed on
 * the address the GATEWAY resolved (see clientIp), never on req.ip: this service
 * runs with trustProxy enabled and the gateway strips any client-supplied
 * X-Forwarded-For, so req.ip here is the gateway's own address for every request
 * — one bucket shared by every learner on the platform. That was both a
 * brute-force blind spot (no real per-client cap) and a remote lockout for
 * everyone: eleven requests a minute denied sign-in to the whole site.
 *
 * The account budget stops many hosts from working one account, which no address
 * budget can see at all. Only failures count and a success clears it, so a
 * learner mistyping their own password is never the one accumulating the count.
 *
 * In-memory and per-instance, like every other limit in this codebase; the
 * documented move to a shared store is what makes this true across replicas.
 */
const ADDRESS_WINDOW_MS = 60_000;
const ADDRESS_MAX = 10;
const ACCOUNT_WINDOW_MS = 15 * 60_000;
const ACCOUNT_MAX_FAILURES = 10;

/* A budget on account creation, which is the one auth endpoint whose cost lands
 * on this service's CPU before anything is decided: every call runs a bcrypt hash
 * at the deployment's cost factor. The gateway's 120/min/IP is not a bound on that
 * — 120 hashes a minute from one address is enough to saturate a small box, and a
 * botnet multiplies it. Registration is also the rarest thing a real learner does,
 * so the budget can be generous and still invisible to them. Counted before the
 * hash runs, because the work is the thing being defended. */
const REGISTER_WINDOW_MS = 60 * 60_000;
const REGISTER_MAX = 10;

const addressHits = new Map<string, { count: number; reset: number }>();
const accountFailures = new Map<string, { count: number; reset: number }>();
const registerHits = new Map<string, { count: number; reset: number }>();

/** Amortised cleanup, as in the gateway's limiter: only walk a large map. */
function sweep(map: Map<string, { count: number; reset: number }>, now: number): void {
  if (map.size < 10_000) return;
  for (const [k, v] of map) {
    if (v.reset <= now) map.delete(k);
  }
}

/** Count one hit against `key`'s window and return the running total. */
function bumpWindow(
  map: Map<string, { count: number; reset: number }>,
  key: string,
  windowMs: number,
  now: number
): number {
  const cur = map.get(key);
  if (!cur || cur.reset <= now) {
    map.set(key, { count: 1, reset: now + windowMs });
    sweep(map, now);
    return 1;
  }
  cur.count += 1;
  return cur.count;
}

/** Address budget (edge hygiene; the gateway enforces its own too). */
function addressAllowed(ip: string): boolean {
  return bumpWindow(addressHits, ip, ADDRESS_WINDOW_MS, Date.now()) <= ADDRESS_MAX;
}

/** True while this account still has failures left in its window. */
function accountAllowed(email: string): boolean {
  const cur = accountFailures.get(email);
  if (!cur || cur.reset <= Date.now()) return true;
  return cur.count < ACCOUNT_MAX_FAILURES;
}

function accountFailed(email: string): void {
  bumpWindow(accountFailures, email, ACCOUNT_WINDOW_MS, Date.now());
}

function accountCleared(email: string): void {
  accountFailures.delete(email);
}

/** Device-code lifetime: long enough to type a code, short enough to abandon. */
const DEVICE_CODE_TTL_MS = 15 * 60_000;

/** Characters a learner can read off one screen and type into another. */
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 8 unambiguous characters, e.g. "KQ7M-XR42". The dash is display-only. */
function randomUserCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_ALPHABET[(bytes[i] ?? 0) % USER_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function toPublic(row: { id: string; email: string; name: string | null; created_at: Date }): PublicUser {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at.toISOString() };
}

/* Project one stored or incoming proof to the shape the profile reads: which
 * competency, at what level, of which kind, issued when. `kind` is read off
 * the receipt's own facts, never trusted from a client field — there is none. */
function toProof(
  competencyId: string,
  level: string,
  receipt: { facts: unknown; issuedAt: string },
  issuedAt: Date | string
): { competencyId: string; level: string; kind: string; issuedAt: string } {
  const facts = receipt.facts as { kind?: unknown } | null;
  return {
    competencyId,
    level,
    kind: facts?.kind === "design" ? "design" : "run",
    issuedAt: new Date(issuedAt).toISOString(),
  };
}

async function issuePair(pool: Pool, userId: string, refreshId = newId()) {
  const access = signAccessToken(userId);
  const refresh = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 3600_000);
  await pool.query(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    // The id is a parameter because rotation has to name the replacement *before*
    // it writes anything: the claim on the old row carries this id, so the two
    // rows cannot end up disagreeing about which replaced which.
    [refreshId, userId, sha256(refresh), expiresAt]
  );
  return {
    accessToken: access.token,
    refreshToken: refresh,
    expiresIn: access.expiresIn,
  };
}

export function registerAuthRoutes(app: FastifyInstance, pool: Pool) {
  /* Lawful-basis records, erasure, export and the rights ledger. Registered from
     here so one call site mounts the whole identity surface, and so a deployment
     cannot end up with accounts it has no way to give back. */
  registerRightsRoutes(app, pool);

  app.post("/register", async (req, reply) => {
    // Before parseOr400 and long before hashPassword: the point of the budget is
    // that the expensive part does not run once it is spent.
    if (bumpWindow(registerHits, clientIp(req), REGISTER_WINDOW_MS, Date.now()) > REGISTER_MAX) {
      throw new ApiError(429, "rate_limited", "Too many accounts created from this address. Try again later.");
    }
    const body = parseOr400(registerSchema, req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
    if (existing.rowCount) throw new ApiError(409, "conflict", "An account with this email already exists.");
    const id = newId();
    /* The notice check runs before the hash and before any SQL. This is where the
     * audit's F-05 ("no lawful-basis or consent architecture") and F-13 ("no age
     * gate") are actually closed for sign-up: an account in a production
     * deployment cannot be created by someone who has not affirmed that they were
     * shown the terms and the privacy notice, and that they are old enough (or
     * have a guardian's permission) to hold one. The refusal costs no bcrypt work
     * and leaves nothing to roll back. */
    assertDeclarationsAllowed(body);
    const passwordHash = await hashPassword(body.password);
    /* Account and acceptance record, in ONE statement: see signupStatement for why
     * this is a data-modifying CTE rather than an explicit transaction. The
     * property that matters is "no account exists without its record of what the
     * learner was shown", and a single statement makes that the database's
     * guarantee instead of something the code has to remember. */
    let created: { rows: { id: string; email: string; name: string | null; created_at: Date }[] };
    try {
      const stmt = signupStatement(body, {
        id,
        email,
        name: body.name?.trim() || null,
        passwordHash,
      });
      created = await pool.query(stmt.sql, stmt.params);
    } catch (err) {
      // The SELECT above is a fast path, not the correctness mechanism: two
      // registrations for one address racing each other both pass it, and the
      // unique index on lower(email) is what actually decides. Report that as
      // the 409 it is instead of letting a 23505 surface as a 500.
      if ((err as { code?: string }).code === "23505") {
        throw new ApiError(409, "conflict", "An account with this email already exists.");
      }
      throw err;
    }
    const tokens = await issuePair(pool, id);
    return reply.code(201).send({ user: toPublic(created.rows[0]), tokens });
  });

  app.post("/login", async (req, reply) => {
    if (!addressAllowed(clientIp(req))) {
      throw new ApiError(429, "rate_limited", "Too many login attempts. Wait a minute.");
    }
    const body = parseOr400(loginSchema, req.body);
    const email = body.email.trim().toLowerCase();
    // Checked before the password so a locked account cannot be used as an
    // oracle for whether a guessed password was correct.
    if (!accountAllowed(email)) {
      throw new ApiError(
        429,
        "rate_limited",
        "Too many failed sign-in attempts for this account. Try again in a few minutes."
      );
    }
    const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = $1", [email]);
    const user = rows[0];
    // Same response for unknown email, passwordless (Clerk-managed) account, vs
    // wrong password — and, since B-28, the same *work* too. Short-circuiting the
    // compare for the first two made those answers arrive in a fraction of the
    // time, which is an oracle for precisely what the identical body is hiding:
    // whether the account exists, and whether it is Clerk-managed. An absent hash
    // is answered with a real hash of a secret nobody holds, so the compare runs
    // either way and the only thing that differs is the answer.
    const hash = user?.password_hash ?? dummyPasswordHash();
    const matches = await verifyPassword(body.password, hash);
    if (!user || !user.password_hash || !matches) {
      accountFailed(email);
      throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
    }
    accountCleared(email);
    const tokens = await issuePair(pool, user.id);
    return { user: toPublic(user), tokens };
  });

  app.post("/refresh", async (req, reply) => {
    const body = parseOr400(refreshSchema, req.body);
    const { rows } = await pool.query("SELECT * FROM refresh_tokens WHERE token_hash = $1", [
      sha256(body.refreshToken),
    ]);
    const row = rows[0];
    if (!row) throw new ApiError(401, "invalid_grant", "Refresh token is invalid.");
    if (row.revoked_at) {
      if (row.replaced_by) {
        // Reuse of a rotated token: possible theft — revoke the whole family.
        await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
          row.user_id,
        ]);
        throw new ApiError(401, "token_reused", "Refresh token was already used. All sessions revoked — please log in again.");
      }
      throw new ApiError(401, "invalid_grant", "Refresh token is invalid.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new ApiError(401, "expired", "Refresh token has expired. Please log in again.");
    }
    /* Rotation claims the old row in ONE statement, and the guard is inside it.
     *
     * The shape this replaces read the row, checked `revoked_at`, minted a pair and
     * only then revoked — so two refreshes arriving together both passed the check
     * before either write landed, and one session ended up with two live refresh
     * tokens. That is exactly the state rotation exists to make impossible, and it
     * defeated the reuse detection that is supposed to catch a stolen token.
     *
     * `WHERE id = $2 AND revoked_at IS NULL` makes the database the arbiter: of any
     * number of concurrent refreshes with one token, exactly one sees a row count
     * of 1 and proceeds. The replacement id is decided first, so the old row names
     * the row that actually replaced it.
     *
     * The order is deliberate — mint, then claim — because it is what makes the
     * loser's theft response complete. A lost claim proves the winner's claim
     * committed, and the winner's claim happens *after* its insert, so by the time
     * the loser revokes the family, the winner's replacement row is already there to
     * be revoked. Claiming first and minting second would leave a millisecond-wide
     * window in which "reuse detected, family revoked" had already run and the fresh
     * row appeared afterwards, uncancelled.
     *
     * A crash between the two statements leaves an unreachable orphan row (nobody
     * holds its plaintext) and the old token still valid — never two live tokens for
     * one chain. */
    const nextId = newId();
    const issued = await issuePair(pool, row.user_id, nextId);
    const claim = await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2 AND revoked_at IS NULL",
      [nextId, row.id]
    );
    if ((claim.rowCount ?? 0) === 0) {
      const after = await pool.query("SELECT * FROM refresh_tokens WHERE token_hash = $1", [
        sha256(body.refreshToken),
      ]);
      const current = after.rows[0];
      if (current?.revoked_at && current.replaced_by) {
        // Reuse of a rotated token: possible theft. Revoke the family — which
        // provably includes the row minted above, either as the winner's
        // replacement or as this request's own orphan.
        await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
          current.user_id,
        ]);
        throw new ApiError(401, "token_reused", "Refresh token was already used. All sessions revoked — please log in again.");
      }
      // Not theft — the row was revoked by a sign-out, or expired in the moment
      // between the read and the claim. The pair minted above is not owed to this
      // request, so it goes away rather than becoming a session nobody asked for.
      await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [nextId]);
      throw new ApiError(401, "invalid_grant", "Refresh token is invalid.");
    }
    return { tokens: issued };
  });

  /* Sign-out ends the session, not just its ability to renew.
   *
   * Two credentials go into one request, and both matter:
   *
   *   refreshToken  the family this session renews with. Revoking it is what
   *                 stops a new access token being minted, and it is the half the
   *                 browser never holds (the app's broker keeps it in an HttpOnly
   *                 cookie), so this is the only party that can end it.
   *   accessToken   the half already in the learner's hands — and the one a
   *                 script on the page, a proxy log, or a stolen laptop could
   *                 have taken. Its `jti` is recorded in `revoked_tokens`, and the
   *                 gateway asks about that id before trusting the token, so the
   *                 credential stops working with this request instead of at the
   *                 end of its TTL.
   *
   * The access token arrives in the body rather than as an Authorization header:
   * the gateway strips the bearer from everything it forwards (services trust
   * `x-user-id`, never a client token), and that hygiene is worth more than the
   * header convention here. The token is verified before its `jti` is recorded —
   * an unverified copy would otherwise let anyone revoke anyone's session.
   *
   * Idempotent: always 200, even for unknown or unparseable input (no oracle on
   * whether a token existed), and a token we cannot read is simply nothing to
   * revoke. */
  app.post("/logout", async (req) => {
    const parsed = logoutSchema.safeParse(req.body ?? {});
    if (parsed.success && parsed.data.refreshToken) {
      await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [
        sha256(parsed.data.refreshToken),
      ]);
    }
    const presented = parsed.success ? parsed.data.accessToken : undefined;
    const claims = presented ? accessTokenClaims(presented) : null;
    if (claims?.jti) {
      // A token with no `exp` cannot be pruned, so it is kept for the shortest
      // window we can justify rather than forever: the TTL in force is a bound on
      // how long any token this service mints can live.
      await revokeCredential(pool, {
        jti: claims.jti,
        userId: claims.userId,
        expiresAtMs: claims.expiresAtMs ?? Date.now() + accessTokenTtlSeconds() * 1000,
      });
      // One line per sign-out, and no line per check: revocations are rare and are
      // the event someone investigating an account wants on the record, while the
      // check runs on every authenticated request and is already in the access log.
      req.log.info({ userId: claims.userId, jti: claims.jti }, "access token revoked");
    }
    return { ok: true };
  });

  /* Sign out of every device at once.
   *
   * Three writes, because "everywhere" is three different things:
   *
   *   1. every refresh token the account holds is revoked, so no device can mint a
   *      new access token — this is what makes the end of the session sooner than
   *      an access-token lifetime;
   *   2. a cut-off is recorded, so every access token issued before this moment is
   *      refused by the gateway's check (see revocation-store.ts, and 004's note on
   *      why that is a timestamp rather than a list);
   *   3. the presented token's own `jti` is revoked too. Redundant given the
   *      cut-off, and deliberately so: it is the one credential we can name
   *      exactly, and belt-and-braces here costs one row.
   *
   * The subject comes from the verified token, never from the body — otherwise any
   * learner could sign any other account out of everything by typing its id. The
   * caller must hold a session to end sessions, which is also why the app's broker
   * presents the bearer it is holding. */
  app.post("/logout-all", async (req) => {
    const body = parseOr400(logoutAllSchema, req.body);
    const claims = accessTokenClaims(body.accessToken);
    if (!claims) throw new ApiError(401, "unauthorized", "Valid access token required.");

    const at = new Date();
    const sessions = await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [claims.userId]
    );
    await revokeAccountBefore(pool, claims.userId, at);
    if (claims.jti) {
      await revokeCredential(pool, {
        jti: claims.jti,
        userId: claims.userId,
        expiresAtMs: claims.expiresAtMs ?? at.getTime() + accessTokenTtlSeconds() * 1000,
      });
    }
    // Worth a line every time: this is the loudest thing a learner can ask for,
    // and "why was my other device signed out" has an answer in the log.
    req.log.info(
      { userId: claims.userId, sessions: sessions.rowCount ?? 0 },
      "account signed out everywhere"
    );
    return { ok: true, sessions: sessions.rowCount ?? 0 };
  });

  /* The denylist, read by the gateway on every authenticated request.
   *
   * This is the shared check the edge consults: one primary-key lookup, and the
   * only new hop a request pays is this one. It is deliberately not the gateway's
   * own table — identity lives in this service, which already owns users and
   * refresh tokens, and a second reader of that schema is how two revocations
   * stories start to disagree. Reached over the mesh only (the chassis requires
   * `x-internal-key` for every non-health route), so it is not a public oracle for
   * whether an arbitrary id exists. */
  app.post("/internal/revocations/check", async (req) => {
    const body = parseOr400(revocationCheckSchema, req.body);
    const verdict = await credentialStatus(pool, body);
    // The reason rides back for the edge's log line only; the message a client
    // sees is the same either way, so a caller cannot learn how a session ended.
    return verdict.reason
      ? { revoked: verdict.revoked, reason: verdict.reason }
      : { revoked: verdict.revoked };
  });

  app.get("/me", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query("SELECT id, email, name, created_at FROM users WHERE id = $1", [userId]);
    if (!rows[0]) throw new ApiError(404, "not_found", "Account not found.");
    return { user: toPublic(rows[0]) };
  });

  /* IDE device authorization: the GitHub-style browser sign-in.
   *
   * Three endpoints, each with exactly one credential in play:
   *
   *   POST /device/start   (anonymous) issues a device secret + a short user
   *     code. The user code is 8 unambiguous characters (no 0/O, 1/I) because
   *     a learner types it once, by hand, while looking at two screens.
   *   POST /device/poll    (device secret) returns pending until approved,
   *     then issues a token pair for the approving user and consumes the code
   *     so a second poll cannot mint a second session.
   *   POST /device/approve (learner session) binds a user code to the caller.
   *     A wrong code is the same 404 as an unknown one: the codes are short,
   *     so success must not be distinguishable from failure by status.
   *
   * Expiry is 15 minutes everywhere, enforced by comparison rather than a
   * sweeper: an expired row is dead whether or not anything deleted it. */
  app.post("/device/start", async () => {
    const deviceCode = randomBytes(32).toString("hex");
    const userCode = randomUserCode();
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);
    await pool.query(
      "INSERT INTO device_codes (id, device_code_hash, user_code, expires_at) VALUES ($1, $2, $3, $4)",
      [newId(), sha256(deviceCode), userCode, expiresAt]
    );
    return {
      deviceCode,
      userCode,
      verificationUri: "/auth/ide",
      expiresIn: Math.floor(DEVICE_CODE_TTL_MS / 1000),
    };
  });

  app.post("/device/poll", async (req) => {
    const body = parseOr400(devicePollSchema, req.body);
    const { rows } = await pool.query("SELECT * FROM device_codes WHERE device_code_hash = $1", [
      sha256(body.deviceCode),
    ]);
    const row = rows[0];
    // Unknown secret, expired, or already consumed: all three are "not
    // approved", never an oracle on which of them happened.
    if (!row || new Date(row.expires_at).getTime() < Date.now() || row.consumed_at) {
      return { status: "pending" as const };
    }
    if (!row.approved_user_id) {
      return { status: "pending" as const };
    }
    const { rows: users } = await pool.query("SELECT id, email, name, created_at FROM users WHERE id = $1", [
      row.approved_user_id,
    ]);
    if (!users[0]) {
      return { status: "pending" as const };
    }
    // Claim the code BEFORE minting the pair. The order matters: two
    // concurrent polls of one code — a retried poll on a flaky network, or a
    // thief holding the device secret — both passed the read above, and both
    // were handed a session, because the guarded UPDATE that claims the code
    // matched no row for the second poll and its result was never read. The
    // claim is the mutex: exactly one poll can win it, and the loser is told
    // "pending", which is the same answer an unapproved code gets.
    const claimed = await pool.query(
      "UPDATE device_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id",
      [row.id]
    );
    if (!claimed.rows[0]) {
      return { status: "pending" as const };
    }
    const tokens = await issuePair(pool, row.approved_user_id);
    return { status: "approved" as const, user: toPublic(users[0]), tokens };
  });

  app.post("/device/approve", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(deviceApproveSchema, req.body);
    // The dash is display-only: accept the code with or without it, in any case.
    const code = body.userCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normalized = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    const { rows } = await pool.query("SELECT * FROM device_codes WHERE user_code = $1", [normalized]);
    const row = rows[0];
    if (!row || new Date(row.expires_at).getTime() < Date.now() || row.consumed_at || row.approved_user_id) {
      // Used, expired, consumed, or unknown: one answer for all four, so a
      // prober cannot enumerate live codes by status.
      throw new ApiError(404, "not_found", "That code is not valid. Check the IDE and try again.");
    }
    await pool.query("UPDATE device_codes SET approved_user_id = $1, approved_at = now() WHERE id = $2", [
      userId,
      row.id,
    ]);
    return { ok: true };
  });

  app.post("/link", async (req, reply) => {
    // Clerk-mode provisioning (see contracts linkSchema): the gateway
    // verified the Clerk session token, so x-user-id is the authenticated
    // Clerk subject. First sight creates the profile row (passwordless,
    // provider 'clerk'); later calls are idempotent and change nothing, so
    // a replayed link can never rewrite someone's email. A taken email 409s
    // instead of merging two identities — the learner signs in with their
    // password and keeps the older account.
    const userId = requireUserId(req);
    const body = parseOr400(linkSchema, req.body);
    const email = body.email.trim().toLowerCase();
    const byId = await pool.query("SELECT id, email, name, created_at FROM users WHERE id = $1", [userId]);
    if (byId.rows[0]) return { user: toPublic(byId.rows[0]), linked: false };
    const clash = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
    if (clash.rowCount) {
      throw new ApiError(
        409,
        "conflict",
        "An account with this email already exists. Sign in with your password instead — nothing is lost either way."
      );
    }
    const { rows } = await pool.query(
      "INSERT INTO users (id, email, name, password_hash, provider) VALUES ($1, $2, $3, NULL, 'clerk') RETURNING id, email, name, created_at",
      [userId, email, body.name?.trim() || null]
    );
    return reply.code(201).send({ user: toPublic(rows[0]), linked: true });
  });

  /* Verified proof ledger: what the learner's IDE proved, synced for display.
   *
   * Only receipts this platform's own signatures verify are stored — the route
   * recomputes the signed payload for the receipt's kind and checks it before
   * anything is INSERTed, Ed25519 first (the offline-verifiable claim) with
   * the HMAC as fallback, exactly as /verify orders them. A forged, tampered,
   * or foreign receipt is 401, never a row. Freshness is deliberately NOT
   * required: a row is history, not a live verdict, and an old receipt is
   * still proof of old work — trust comes from re-deriving at /verify, never
   * from presence here.
   *
   * One row per competency per learner, newest proof wins: a re-sync carrying
   * an older issued_at than the stored row is ignored rather than applied, and
   * syncing the same receipt twice (reinstall, second machine) is one row.
   * The same bytes under a different account 409s without naming the owner. */
  app.post("/proofs", async (req, reply) => {
    const userId = requireUserId(req);
    const body = parseOr400(proofSubmitSchema, req.body);
    /* Three receipt kinds share this surface: a code run, a design verdict and
     * a debugging-lab verdict. The payload each one is signed over is built by
     * its own kind, so the bytes verified here are exactly the bytes that were
     * signed — a receipt of one kind can never be re-typed as another. */
    const design = designReceiptSchema.safeParse(body.receipt);
    const incident = incidentReceiptSchema.safeParse(body.receipt);
    const payload = design.success
      ? designReceiptPayload(design.data.facts, design.data.issuedAt)
      : incident.success
        ? incidentReceiptPayload(incident.data.facts, incident.data.issuedAt)
        : runReceiptPayload(
            (body.receipt as { facts: Parameters<typeof runReceiptPayload>[0]; issuedAt: string }).facts,
            body.receipt.issuedAt
          );
    let verified: "hmac" | "ed25519" | null = null;
    if (body.receipt.sigEd) {
      try {
        const edKey = process.env.RECEIPT_ED25519_KEY;
        if (edKey && verifyReceiptEd(payload, body.receipt.sigEd, receiptEdPublicKey(edKey))) verified = "ed25519";
      } catch {
        // No receipt key configured, or a key that cannot verify: the Ed25519
        // half is unavailable here, and the HMAC below still gets its chance.
      }
    }
    const meshKey = process.env.INTERNAL_API_KEY;
    if (!verified && meshKey && verifyReceiptSignature(payload, body.receipt.sig, meshKey)) verified = "hmac";
    if (!verified) {
      throw new ApiError(401, "invalid_proof", "This receipt was not issued by this platform, so there is nothing to sync.");
    }
    const sha = sha256(payload);
    const dup = await pool.query("SELECT user_id, issued_at FROM proofs WHERE payload_sha256 = $1", [sha]);
    if (dup.rows[0] && dup.rows[0].user_id !== userId) {
      throw new ApiError(409, "already_synced", "This receipt is already synced.");
    }
    const current = await pool.query("SELECT competency_id, level, issued_at FROM proofs WHERE user_id = $1 AND competency_id = $2", [
      userId,
      body.competencyId,
    ]);
    if (current.rows[0] && new Date(current.rows[0].issued_at).getTime() >= Date.parse(body.receipt.issuedAt)) {
      return {
        stored: false,
        proof: toProof(current.rows[0].competency_id, current.rows[0].level, body.receipt, current.rows[0].issued_at),
      };
    }
    if (dup.rows[0]) {
      return { stored: false, proof: toProof(body.competencyId, body.level, body.receipt, dup.rows[0].issued_at) };
    }
    const saved = await pool.query(
      "INSERT INTO proofs (user_id, competency_id, level, receipt, payload_sha256, issued_at) VALUES ($1, $2, $3, $4, $5, $6) " +
        "ON CONFLICT (user_id, competency_id) DO UPDATE SET level = EXCLUDED.level, receipt = EXCLUDED.receipt, payload_sha256 = EXCLUDED.payload_sha256, issued_at = EXCLUDED.issued_at " +
        "RETURNING competency_id, level, issued_at",
      [userId, body.competencyId, body.level, JSON.stringify(body.receipt), sha, body.receipt.issuedAt]
    );
    return reply.code(201).send({
      stored: true,
      proof: toProof(saved.rows[0].competency_id, saved.rows[0].level, body.receipt, saved.rows[0].issued_at),
    });
  });

  app.get("/proofs", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query(
      "SELECT competency_id, level, CASE WHEN receipt->'facts'->>'kind' = 'design' THEN 'design' WHEN receipt->'facts'->>'kind' = 'incident' THEN 'incident' ELSE 'run' END AS kind, issued_at FROM proofs WHERE user_id = $1 ORDER BY issued_at DESC",
      [userId]
    );
    return {
      proofs: rows.map((r: { competency_id: string; level: string; kind: string; issued_at: Date }) => ({
        competencyId: r.competency_id,
        level: r.level,
        kind: r.kind,
        issuedAt: new Date(r.issued_at).toISOString(),
      })),
    };
  });
}
