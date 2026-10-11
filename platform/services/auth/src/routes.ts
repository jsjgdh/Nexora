import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  loginSchema,
  linkSchema,
  refreshSchema,
  registerSchema,
  type PublicUser,
} from "@nexora/contracts";
import { ApiError, newId, parseOr400, requireUserId, sha256 } from "@nexora/service-kit";
import { hashPassword, newRefreshToken, signAccessToken, verifyPassword } from "./crypto.js";

const REFRESH_DAYS = 30;

/** Per-IP login throttle (edge hygiene; the gateway enforces its own too). */
const loginHits = new Map<string, { count: number; reset: number }>();
function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const cur = loginHits.get(ip);
  if (!cur || cur.reset < now) {
    loginHits.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  cur.count += 1;
  return cur.count <= 10;
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
    const { rows } = await pool.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, created_at",
      [id, email, body.name?.trim() || null, passwordHash]
    );
    const tokens = await issuePair(pool, id);
    return reply.code(201).send({ user: toPublic(rows[0]), tokens });
  });

  app.post("/login", async (req, reply) => {
    if (!loginAllowed(req.ip)) throw new ApiError(429, "rate_limited", "Too many login attempts. Wait a minute.");
    const body = parseOr400(loginSchema, req.body);
    const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = $1", [
      body.email.trim().toLowerCase(),
    ]);
    const user = rows[0];
    // Same response for unknown email, passwordless (Clerk-managed) account,
    // vs wrong password: no user enumeration, no oracle on provider.
    if (!user || !user.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
    }
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

  app.post("/logout", async (req) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) {
      await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [
        sha256(parsed.data.refreshToken),
      ]);
    }
    // Idempotent: always 200, even for unknown tokens (no oracle).
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await pool.query("SELECT id, email, name, created_at FROM users WHERE id = $1", [userId]);
    if (!rows[0]) throw new ApiError(404, "not_found", "Account not found.");
    return { user: toPublic(rows[0]) };
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
