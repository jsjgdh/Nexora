import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  deviceApproveSchema,
  devicePollSchema,
  loginSchema,
  linkSchema,
  logoutAllSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  revocationCheckSchema,
  type PublicUser,
} from "@nexora/contracts";
import {
  credentialStatus,
  revokeAccountBefore,
  revokeCredential,
} from "./revocation-store.js";
import { ApiError, clientIp, newId, parseOr400, requireUserId, sha256 } from "@nexora/service-kit";
import { randomBytes } from "node:crypto";
import {
  accessTokenClaims,
  accessTokenTtlSeconds,
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

const addressHits = new Map<string, { count: number; reset: number }>();
const accountFailures = new Map<string, { count: number; reset: number }>();

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

async function issuePair(pool: Pool, userId: string) {
  const access = signAccessToken(userId);
  const refresh = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 3600_000);
  await pool.query(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [newId(), userId, sha256(refresh), expiresAt]
  );
  return {
    accessToken: access.token,
    refreshToken: refresh,
    expiresIn: access.expiresIn,
  };
}

export function registerAuthRoutes(app: FastifyInstance, pool: Pool) {
  app.post("/register", async (req, reply) => {
    const body = parseOr400(registerSchema, req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
    if (existing.rowCount) throw new ApiError(409, "conflict", "An account with this email already exists.");
    const id = newId();
    const passwordHash = await hashPassword(body.password);
    let created: { rows: { id: string; email: string; name: string | null; created_at: Date }[] };
    try {
      created = await pool.query(
        "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, created_at",
        [id, email, body.name?.trim() || null, passwordHash]
      );
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
    // Same response for unknown email, passwordless (Clerk-managed) account,
    // vs wrong password: no user enumeration, no oracle on provider.
    if (!user || !user.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
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
    const tokens = await issuePair(pool, row.user_id);
    const newRow = await pool.query("SELECT id FROM refresh_tokens WHERE token_hash = $1", [
      sha256(tokens.refreshToken),
    ]);
    await pool.query("UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2", [
      newRow.rows[0].id,
      row.id,
    ]);
    return { tokens };
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
    const tokens = await issuePair(pool, row.approved_user_id);
    await pool.query("UPDATE device_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL", [row.id]);
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
        "An account with this email already exists. Sign in with your password instead — your progress is safe either way."
      );
    }
    const { rows } = await pool.query(
      "INSERT INTO users (id, email, name, password_hash, provider) VALUES ($1, $2, $3, NULL, 'clerk') RETURNING id, email, name, created_at",
      [userId, email, body.name?.trim() || null]
    );
    return reply.code(201).send({ user: toPublic(rows[0]), linked: true });
  });
}
