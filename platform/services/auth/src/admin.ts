import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { ApiError, newId, requireUserId } from "@nexora/service-kit";
import { revokeAccountBefore } from "./revocation-store.js";

/* The operator's console, on the platform side.
 *
 * An operator is the person who runs the studio. What they do is look at
 * accounts, answer the data-subject requests, end a session that should not
 * be alive, and grant the operator flag to somebody who has earned it.
 *
 * The boundary is the flag, and the flag is a row. Every route here:
 *
 *   - takes the caller's identity from the header the gateway injects after
 *     it verified the caller's token, never from the body, so a client
 *     cannot say who it is;
 *   - refuses an account without the flag, and says so plainly;
 *   - writes down what was done, to whom, and by whom.
 *
 * The routes live under the auth service's own prefix (`/api/auth/admin/*`
 * at the edge) rather than behind a new gateway route, for one reason: the
 * gateway already strips the client-supplied identity headers and injects
 * the verified one, so the service is the only place that decides who the
 * caller is. A new public prefix would be a new thing to get wrong.
 *
 * What this module does NOT do is erase an account. Erasure is a
 * deliberate act with a receipt, the learner can ask for it themselves, and
 * the operator's tooling does it when the operator must. The panel shows the
 * record of what has been erased and what has not.
 */

const PAGE_SIZE = 50;

/** True when the operator holds the flag. */
async function isOperator(pool: Pool, userId: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM operators WHERE user_id = $1", [userId]);
  return rows.length > 0;
}

/**
 * The caller's id, and the proof that the caller may act.
 *
 * `requireUserId` is the 401: the gateway injects the header only after it
 * has verified a token, so a missing header is a request that never came
 * from a signed-in learner. The 403 after it is the operator check, and it
 * is a different code on purpose: "you are not signed in" and "you are
 * signed in and you are not one of us" are different facts, and an operator
 * console is not a secret place.
 */
async function requireOperator(pool: Pool, req: FastifyRequest): Promise<string> {
  const userId = requireUserId(req);
  if (!(await isOperator(pool, userId))) {
    throw new ApiError(403, "not_an_operator", "This account is not an operator.");
  }
  return userId;
}

/** Write the operator's log. */
async function record(
  pool: Pool,
  operatorId: string,
  action: string,
  target: string | null,
  detail: string | null
): Promise<void> {
  await pool.query(
    "INSERT INTO admin_actions (id, operator_id, action, target, detail) VALUES ($1, $2, $3, $4, $5)",
    [newId(), operatorId, action, target, detail]
  );
}

/**
 * Whether a table exists in this service's database.
 *
 * The console reads what the identity service holds. Two of the tables it
 * reads can live elsewhere in a given build: the cohorts are a separate
 * piece of work, and the verified ledger may be moved to a service of its
 * own. A table that is not here is not an error: it means this build keeps
 * that record somewhere else, and the console says which, rather than
 * answering with a number it does not have.
 */
async function hasTable(pool: Pool, name: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${name}`]);
  return rows[0]?.present === true;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function registerAdminRoutes(app: FastifyInstance, pool: Pool): void {
  /* There is deliberately no "is this session an operator's" route here.
   *
   * There was one: it took a refresh token in the request body and answered
   * whether the token was a live session, and whose it was. The auth service's
   * prefix is public at the edge, so that made a credential oracle for
   * anybody who could reach it. A stolen thirty-day token could be confirmed
   * and the account's name and address read back, without the token ever
   * being used for access, and the credential travelled in a body where a log
   * line or an ingestion pipe can keep it.
   *
   * The console does not need it. Every route below reads the identity the
   * gateway injected after it verified the caller's own access token, and the
   * operator's flag is a row. The refresh token stays in the app's HttpOnly
   * cookie, where it belongs, and the app's own broker exchanges it. */
  /* The first screen: the numbers an operator looks at before anything else,
     and the configuration they need to read them correctly. The
     configuration is a set of booleans and names, never a secret: an
     operator needs to know that the mail provider is not configured, and
     never needs to see the key. */
  app.get("/admin/overview", async (req) => {
    const operatorId = await requireOperator(pool, req);
    const [counts, operator, actions, cohorts, proofsHere] = await Promise.all([
      pool.query(
        "SELECT " +
          "(SELECT count(*) FROM users) AS accounts, " +
          "(SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL) AS verified, " +
          "(SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > now()) AS sessions, " +
          "(SELECT count(*) FROM operators) AS operators, " +
          "(SELECT count(*) FROM rights_requests WHERE resolved_at IS NULL) AS open_requests, " +
          "(SELECT count(*) FROM erasures WHERE completed_at IS NULL) AS pending_erasures, " +
          "(SELECT count(*) FROM processor_deletions WHERE completed_at IS NULL) AS pending_processor_deletions"
      ),
      pool.query("SELECT id, email, name FROM users WHERE id = $1", [operatorId]),
      pool.query(
        "SELECT id, action, target, detail, created_at FROM admin_actions ORDER BY created_at DESC LIMIT 10"
      ),
      hasTable(pool, "cohorts"),
      hasTable(pool, "proofs"),
    ]);
    const row = counts.rows[0] ?? {};
    const proofs = proofsHere ? await pool.query("SELECT count(*) FROM proofs") : { rows: [{ count: 0 }] };
    return {
      operator: {
        id: operatorId,
        email: operator.rows[0]?.email ?? null,
        name: operator.rows[0]?.name ?? null,
      },
      counts: {
        accounts: Number(row.accounts ?? 0),
        verifiedAddresses: Number(row.verified ?? 0),
        activeSessions: Number(row.sessions ?? 0),
        proofs: Number(proofs.rows[0]?.count ?? 0),
        operators: Number(row.operators ?? 0),
        openRightsRequests: Number(row.open_requests ?? 0),
        pendingErasures: Number(row.pending_erasures ?? 0),
        pendingProcessorDeletions: Number(row.pending_processor_deletions ?? 0),
      },
      configuration: {
        authMode: process.env.AUTH_MODE === "clerk" ? "clerk" : "local",
        mailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
        meshKeyPresent: Boolean(process.env.INTERNAL_API_KEY),
        cohortsAvailable: cohorts,
        proofsAvailable: proofsHere,
      },
      recentActions: actions.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        action: r.action,
        target: r.target,
        detail: r.detail,
        createdAt: iso(r.created_at),
      })),
    };
  });

  /* The account list, searched by email or by id.
   *
   * A search over the accounts is the operator's first move in nearly every
   * case, and the result carries the counts that answer the questions: how
   * many live sessions, how much verified work, and how many open requests.
   * The counts are counts on purpose: an operator reading a roster does not
   * need the contents of every proof, and the detail is one click away. */
  app.get("/admin/accounts", async (req) => {
    await requireOperator(pool, req);
    const query = (req.query as { q?: string }) ?? {};
    const q = (query.q ?? "").trim();
    const pattern = `%${q.toLowerCase()}%`;
    const { rows } = await pool.query(
      "SELECT u.id, u.email, u.name, u.created_at, u.provider, u.email_verified_at, " +
        "(SELECT count(*) FROM refresh_tokens t WHERE t.user_id = u.id AND t.revoked_at IS NULL AND t.expires_at > now()) AS sessions, " +
        "(SELECT count(*) FROM proofs p WHERE p.user_id = u.id) AS proofs, " +
        "(SELECT count(*) FROM rights_requests r WHERE r.user_id = u.id AND r.resolved_at IS NULL) AS requests " +
        "FROM users u " +
        "WHERE ($1 = '%%' OR lower(u.email) LIKE $1 OR lower(u.id) LIKE $1) " +
        "ORDER BY u.created_at DESC LIMIT $2",
      [pattern, PAGE_SIZE]
    );
    return {
      accounts: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        createdAt: iso(r.created_at),
        provider: r.provider ?? "local",
        emailVerified: Boolean(r.email_verified_at),
        sessions: Number(r.sessions ?? 0),
        proofs: Number(r.proofs ?? 0),
        requests: Number(r.requests ?? 0),
      })),
    };
  });

  /* One account, in full: the sessions, the verified work, the documents it
     accepted and when, and the requests it has filed. This is the screen
     an operator opens when somebody writes to them about a learner. */
  app.get("/admin/accounts/:id", async (req) => {
    await requireOperator(pool, req);
    const id = (req.params as { id: string }).id;
    const proofsHere = await hasTable(pool, "proofs");
    const [account, sessions, proofs, consents, requests, cohorts] = await Promise.all([
      pool.query(
        "SELECT id, email, name, created_at, provider, email_verified_at FROM users WHERE id = $1",
        [id]
      ),
      pool.query(
        "SELECT id, created_at, expires_at, revoked_at FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC",
        [id]
      ),
      proofsHere
        ? pool.query(
            "SELECT competency_id, level, CASE WHEN receipt->'facts'->>'kind' = 'design' THEN 'design' ELSE 'run' END AS kind, issued_at FROM proofs WHERE user_id = $1 ORDER BY issued_at DESC",
            [id]
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      pool.query(
        "SELECT document, version, purpose, basis, accepted_at, withdrawn_at FROM consents WHERE user_id = $1 ORDER BY accepted_at",
        [id]
      ),
      pool.query(
        "SELECT id, kind, status, detail, created_at, due_at, resolved_at, resolution FROM rights_requests WHERE user_id = $1 ORDER BY created_at DESC",
        [id]
      ),
      hasTable(pool, "cohorts").then((present): Promise<{ rows: Record<string, unknown>[] }> =>
        present
          ? pool.query(
              "SELECT c.id, c.name, c.course_id, c.term, c.status FROM cohorts c JOIN cohort_members m ON m.cohort_id = c.id WHERE m.user_id = $1",
              [id]
            )
          : Promise.resolve({ rows: [] })
      ),
    ]);
    const user = account.rows[0];
    if (!user) throw new ApiError(404, "not_found", "No account with that id.");
    return {
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: iso(user.created_at),
        provider: user.provider ?? "local",
        emailVerified: Boolean(user.email_verified_at),
      },
      sessions: sessions.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        createdAt: iso(r.created_at),
        expiresAt: iso(r.expires_at),
        active: r.revoked_at === null && new Date(String(r.expires_at)).getTime() > Date.now(),
      })),
      proofs: proofs.rows.map((r: Record<string, unknown>) => ({
        competencyId: r.competency_id,
        level: r.level,
        kind: r.kind,
        issuedAt: iso(r.issued_at),
      })),
      consents: consents.rows.map((r: Record<string, unknown>) => ({
        document: r.document,
        version: r.version,
        purpose: r.purpose,
        basis: r.basis,
        acceptedAt: iso(r.accepted_at),
        withdrawnAt: iso(r.withdrawn_at),
      })),
      requests: requests.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        detail: r.detail,
        createdAt: iso(r.created_at),
        dueAt: iso(r.due_at),
        resolvedAt: iso(r.resolved_at),
        resolution: r.resolution,
      })),
      cohorts: cohorts.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        courseId: r.course_id,
        term: r.term,
        status: r.status,
      })),
      proofsAvailable: proofsHere,
    };
  });

  /* End every session an account holds.
   *
   * The one destructive thing an operator does from the panel, and it is the
   * same thing a learner does for themselves with "sign out everywhere": the
   * refresh tokens are revoked and a cut-off is written, so the access token
   * in the learner's hand dies with the session instead of living out its
   * lifetime. The work the learner has done is untouched: a receipt is a
   * record of work, and ending a session does not unprove anything. */
  app.post("/admin/accounts/:id/sessions/revoke", async (req) => {
    const operatorId = await requireOperator(pool, req);
    const id = (req.params as { id: string }).id;
    const at = new Date();
    const sessions = await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [id]
    );
    await revokeAccountBefore(pool, id, at);
    await record(pool, operatorId, "sessions.revoked", id, `${sessions.rowCount ?? 0} sessions ended`);
    req.log.info({ operatorId, target: id, ended: sessions.rowCount ?? 0 }, "operator ended every session of an account");
    return { ok: true, sessions: sessions.rowCount ?? 0 };
  });

  /* The data-subject ledger, across every account.
   *
   * The requests that have a clock on them are the reason this panel
     exists: a request with a due date that nobody answered is a breach
     with a date on it. The erasures and the processor handoffs are here for
     the same reason: an unactioned row is visible instead of being a claim
     in a document. */
  app.get("/admin/rights", async (req) => {
    await requireOperator(pool, req);
    const [requests, erasures, processors] = await Promise.all([
      pool.query(
        "SELECT r.id, r.kind, r.status, r.detail, r.created_at, r.due_at, r.resolved_at, r.resolution, u.email " +
          "FROM rights_requests r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.resolved_at NULLS FIRST, r.due_at"
      ),
      pool.query("SELECT id, completed_at, reason FROM erasures ORDER BY completed_at NULLS FIRST"),
      pool.query(
        "SELECT id, provider, user_email, completed_at, note FROM processor_deletions ORDER BY completed_at NULLS FIRST"
      ),
    ]);
    return {
      requests: requests.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        detail: r.detail,
        email: r.email ?? null,
        createdAt: iso(r.created_at),
        dueAt: iso(r.due_at),
        resolvedAt: iso(r.resolved_at),
        resolution: r.resolution,
      })),
      erasures: erasures.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        completedAt: iso(r.completed_at),
        reason: r.reason,
      })),
      processorDeletions: processors.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        provider: r.provider,
        email: r.user_email,
        completedAt: iso(r.completed_at),
        note: r.note,
      })),
    };
  });

  /* The operators. */
  app.get("/admin/operators", async (req) => {
    await requireOperator(pool, req);
    const { rows } = await pool.query(
      "SELECT o.user_id, o.role, o.granted_at, o.granted_by, u.email, u.name FROM operators o JOIN users u ON u.id = o.user_id ORDER BY o.granted_at"
    );
    return {
      operators: rows.map((r: Record<string, unknown>) => ({
        id: r.user_id,
        email: r.email,
        name: r.name,
        role: r.role,
        grantedAt: iso(r.granted_at),
        grantedBy: r.granted_by,
      })),
    };
  });

  /* Grant the operator flag. The giver is the caller, never the body. */
  app.post("/admin/operators", async (req, reply) => {
    const operatorId = await requireOperator(pool, req);
    const body = (req.body ?? {}) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) throw new ApiError(400, "bad_request", "Give the address of the account.");
    const { rows } = await pool.query("SELECT id, email, name FROM users WHERE lower(email) = $1", [email]);
    const target = rows[0];
    if (!target) throw new ApiError(404, "not_found", "No account with that address.");
    await pool.query(
      "INSERT INTO operators (user_id, role, granted_by) VALUES ($1, 'operator', $2) ON CONFLICT (user_id) DO NOTHING",
      [target.id, operatorId]
    );
    await record(pool, operatorId, "operator.granted", target.id, email);
    req.log.info({ operatorId, target: target.id }, "operator granted the operator flag");
    return reply.code(201).send({ operator: { id: target.id, email: target.email, name: target.name, role: "operator" } });
  });

  /* Take the operator flag away. The operator doing it cannot take their own
     away, because a console that can lock itself out is a console with no
     way back in short of the tooling on the machine. */
  app.post("/admin/operators/revoke", async (req) => {
    const operatorId = await requireOperator(pool, req);
    const body = (req.body ?? {}) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) throw new ApiError(400, "bad_request", "Give the address of the account.");
    if (email === ((await pool.query("SELECT email FROM users WHERE id = $1", [operatorId])).rows[0]?.email ?? "").toLowerCase()) {
      throw new ApiError(400, "bad_request", "An operator cannot take their own flag away. The tooling can do that.");
    }
    const removed = await pool.query(
      "DELETE FROM operators WHERE user_id IN (SELECT id FROM users WHERE lower(email) = $1)",
      [email]
    );
    await record(pool, operatorId, "operator.revoked", email, `${removed.rowCount ?? 0} removed`);
    req.log.info({ operatorId, email }, "operator took the operator flag away");
    return { ok: true, removed: removed.rowCount ?? 0 };
  });

  /* The operator's own log, for the record. */
  app.get("/admin/actions", async (req) => {
    await requireOperator(pool, req);
    const { rows } = await pool.query(
      "SELECT id, operator_id, action, target, detail, created_at FROM admin_actions ORDER BY created_at DESC LIMIT 200"
    );
    return {
      actions: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        operatorId: r.operator_id,
        action: r.action,
        target: r.target,
        detail: r.detail,
        createdAt: iso(r.created_at),
      })),
    };
  });
}
