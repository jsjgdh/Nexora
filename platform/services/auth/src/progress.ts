import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { ApiError, newId, requireUserId } from "@nexora/service-kit";

/* The learner's own work: the drafts they are writing, the attempts they made,
   the phases they finished, their streak and where they were placed.
 *
 * The IDE holds this while a learner is signed out. The platform holds it
 * once they are signed in, for three reasons: a second device syncs into the
 * account rather than into a laptop, a guest's local work migrates into the
 * account when the learner signs in, and the platform can answer "what has
   this learner done" without asking their machine.
 *
 * Three rules hold everywhere in this file:
 *
 *   - the identity is the header the edge verified, never the body. A caller
 *     that names another account in a payload is refused, not obeyed.
 *   - every query is scoped by that identity. One learner's drafts, attempts
 *     and completions are not another's, and there is no route that reads or
 *     writes work without a user id.
 *   - a repeat is a repeat. Saving the same draft twice is one row, sending
 *     the same attempt twice is one row, and completing a phase twice is the
 *     second answer 409 already_completed rather than a second row.
 *
 * The request shapes are checked here rather than in @nexora/contracts, which
 * is outside the reach of this change. The bounds are the ones the contract
 * package uses for an id: 1 to 120 characters, and a body that fits in a
 * request. */

const MAX_ID = 120;
const MAX_LABEL = 40;
const MAX_JSON_BYTES = 64_000;
const MAX_ITEMS = 500;

/* ---------- shape checks ---------- */

function bad(message: string): never {
  throw new ApiError(400, "bad_request", message);
}

function text(value: unknown, field: string, max = MAX_ID): string {
  if (typeof value !== "string") bad(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) bad(`${field} must not be empty.`);
  if (trimmed.length > max) bad(`${field} is longer than ${max} characters.`);
  return trimmed;
}

function optionalText(value: unknown, field: string, max = MAX_ID): string | null {
  if (value === undefined || value === null) return null;
  return text(value, field, max);
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    bad(`${field} must be an object.`);
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    bad(`${field} must be a value that can be stored.`);
  }
  if (encoded === undefined) bad(`${field} must be a value that can be stored.`);
  if (Buffer.byteLength(encoded, "utf8") > MAX_JSON_BYTES) bad(`${field} is too large.`);
  return value as Record<string, unknown>;
}

function instant(value: unknown, field: string): string {
  const raw = text(value, field, MAX_LABEL);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) bad(`${field} must be an ISO 8601 timestamp.`);
  return new Date(parsed).toISOString();
}

function optionalInstant(value: unknown, field: string, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  return instant(value, field);
}

function day(value: unknown, field: string): string {
  const raw = text(value, field, MAX_LABEL);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) bad(`${field} must be a day, as YYYY-MM-DD.`);
  return raw;
}

function items(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) bad(`${field} must be an array.`);
  if (value.length > MAX_ITEMS) bad(`${field} holds more than ${MAX_ITEMS} items.`);
  return value;
}

/* ---------- wire shapes ---------- */

interface DraftInput {
  phaseId: string;
  content: Record<string, unknown>;
  updatedAt: string;
}

interface AttemptInput {
  id: string;
  phaseId: string;
  kind: string;
  outcome: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface CompletionInput {
  phaseId: string;
  completedAt: string;
}

function readDraft(value: unknown, field: string): DraftInput {
  const raw = jsonObject(value, field);
  return {
    phaseId: text(raw.phaseId, `${field}.phaseId`),
    content: jsonObject(raw.content, `${field}.content`),
    updatedAt: optionalInstant(raw.updatedAt, `${field}.updatedAt`, new Date().toISOString()),
  };
}

function readAttempt(value: unknown, field: string): AttemptInput {
  const raw = jsonObject(value, field);
  return {
    id: raw.id === undefined || raw.id === null ? newId() : text(raw.id, `${field}.id`),
    phaseId: text(raw.phaseId, `${field}.phaseId`),
    kind: optionalText(raw.kind, `${field}.kind`, MAX_LABEL) ?? "run",
    outcome: optionalText(raw.outcome, `${field}.outcome`, MAX_LABEL) ?? "unknown",
    payload: raw.payload === undefined || raw.payload === null ? {} : jsonObject(raw.payload, `${field}.payload`),
    createdAt: optionalInstant(raw.createdAt, `${field}.createdAt`, new Date().toISOString()),
  };
}

function readCompletion(value: unknown, field: string): CompletionInput {
  const raw = jsonObject(value, field);
  return {
    phaseId: text(raw.phaseId, `${field}.phaseId`),
    completedAt: optionalInstant(raw.completedAt, `${field}.completedAt`, new Date().toISOString()),
  };
}

/* ---------- the streak ----------
 *
 * A streak is the number of consecutive days a learner was active and the day
 * it is measured from. The platform counts it from what the learner did here,
 * because a streak the client reports is a number the client could have
 * made up. A migration carries the guest device's own count, and the two are
 * merged by the rule in migrateGuestWork below.
 */
async function touchStreak(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    "INSERT INTO progress_state (user_id, streak_days, last_active_on, updated_at) " +
      "VALUES ($1, 1, CURRENT_DATE, now()) " +
      "ON CONFLICT (user_id) DO UPDATE SET " +
      "  streak_days = CASE " +
      "    WHEN progress_state.last_active_on = CURRENT_DATE THEN progress_state.streak_days " +
      "    WHEN progress_state.last_active_on = CURRENT_DATE - 1 THEN progress_state.streak_days + 1 " +
      "    ELSE 1 END, " +
      "  last_active_on = CURRENT_DATE, " +
      "  updated_at = now()",
    [userId]
  );
}

export function registerProgressRoutes(app: FastifyInstance, pool: Pool): void {
  /* The learner's own record, and nothing else's. One query per kind, each
     scoped by the verified identity, so the answer cannot include another
     account's work even by accident. */
  app.get("/progress", async (req) => {
    const userId = requireUserId(req);
    const [drafts, attempts, completions, state] = await Promise.all([
      pool.query(
        "SELECT phase_id, content, updated_at, created_at FROM progress_drafts " +
          "WHERE user_id = $1 ORDER BY updated_at DESC",
        [userId]
      ),
      pool.query(
        "SELECT id, phase_id, kind, outcome, payload, created_at FROM progress_attempts " +
          "WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      ),
      pool.query(
        "SELECT phase_id, completed_at, source FROM progress_completions " +
          "WHERE user_id = $1 ORDER BY completed_at DESC",
        [userId]
      ),
      pool.query(
        "SELECT streak_days, last_active_on::text AS last_active_on, placement FROM progress_state " +
          "WHERE user_id = $1",
        [userId]
      ),
    ]);
    const row = state.rows[0];
    return {
      userId,
      drafts: drafts.rows.map((d) => ({
        phaseId: d.phase_id,
        content: d.content,
        updatedAt: new Date(d.updated_at).toISOString(),
        createdAt: new Date(d.created_at).toISOString(),
      })),
      attempts: attempts.rows.map((a) => ({
        id: a.id,
        phaseId: a.phase_id,
        kind: a.kind,
        outcome: a.outcome,
        payload: a.payload,
        createdAt: new Date(a.created_at).toISOString(),
      })),
      completions: completions.rows.map((c) => ({
        phaseId: c.phase_id,
        completedAt: new Date(c.completed_at).toISOString(),
        source: c.source,
      })),
      streak: {
        days: row ? Number(row.streak_days) : 0,
        lastActiveOn: row?.last_active_on ?? null,
      },
      placement: row?.placement ?? null,
    };
  });

  /* Saving a draft. The newest draft wins, and the comparison is inside the
     write, so two devices saving at the same moment cannot both win: the
     older one is refused by the database rather than by a read that another
     write could slip between.

     Saving the same draft twice is one row and the same answer twice. A draft
     older than the stored one is not applied, and the answer says so, so a
     client that replayed an old copy can tell that its copy is stale. */
  app.put("/progress/drafts/:phaseId", async (req, reply) => {
    const userId = requireUserId(req);
    const phaseId = text((req.params as { phaseId?: string }).phaseId, "phaseId");
    const body = jsonObject(req.body, "body");
    const content = jsonObject(body.content, "content");
    const updatedAt = optionalInstant(body.updatedAt, "updatedAt", new Date().toISOString());
    const { rows } = await pool.query(
      "INSERT INTO progress_drafts (user_id, phase_id, content, updated_at, created_at) " +
        "VALUES ($1, $2, $3::jsonb, $4, now()) " +
        "ON CONFLICT (user_id, phase_id) DO UPDATE SET " +
        "  content = EXCLUDED.content, updated_at = EXCLUDED.updated_at " +
        "WHERE progress_drafts.updated_at <= EXCLUDED.updated_at " +
        "RETURNING phase_id, content, updated_at, created_at",
      [userId, phaseId, JSON.stringify(content), updatedAt]
    );
    if (rows.length > 0) {
      return reply.code(200).send({
        applied: true,
        draft: {
          phaseId: rows[0].phase_id,
          content: rows[0].content,
          updatedAt: new Date(rows[0].updated_at).toISOString(),
          createdAt: new Date(rows[0].created_at).toISOString(),
        },
      });
    }
    // The stored draft is newer, so it stands and this copy is stale.
    const current = await pool.query(
      "SELECT phase_id, content, updated_at, created_at FROM progress_drafts " +
        "WHERE user_id = $1 AND phase_id = $2",
      [userId, phaseId]
    );
    return reply.code(200).send({
      applied: false,
      draft: {
        phaseId: current.rows[0].phase_id,
        content: current.rows[0].content,
        updatedAt: new Date(current.rows[0].updated_at).toISOString(),
        createdAt: new Date(current.rows[0].created_at).toISOString(),
      },
    });
  });

  /* An attempt: one run of one phase. The client mints the id, so a retry
     after a dropped connection is the same attempt rather than a second one.
     An id that already belongs to another account is refused, because that
     would be one account writing under another account's key. */
  app.post("/progress/attempts", async (req, reply) => {
    const userId = requireUserId(req);
    const body = jsonObject(req.body, "body");
    const attempt = readAttempt(body, "attempt");
    const { rows } = await pool.query(
      "INSERT INTO progress_attempts (id, user_id, phase_id, kind, outcome, payload, created_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) " +
        "ON CONFLICT (id) DO NOTHING " +
        "RETURNING id, phase_id, kind, outcome, payload, created_at",
      [
        attempt.id,
        userId,
        attempt.phaseId,
        attempt.kind,
        attempt.outcome,
        JSON.stringify(attempt.payload),
        attempt.createdAt,
      ]
    );
    if (rows.length === 0) {
      const owner = await pool.query("SELECT user_id FROM progress_attempts WHERE id = $1", [attempt.id]);
      if (owner.rows[0] && owner.rows[0].user_id !== userId) {
        throw new ApiError(
          409,
          "conflict",
          "That attempt id belongs to another account. Mint a new id for this attempt."
        );
      }
      const existing = await pool.query(
        "SELECT id, phase_id, kind, outcome, payload, created_at FROM progress_attempts " +
          "WHERE id = $1 AND user_id = $2",
        [attempt.id, userId]
      );
      return reply.code(200).send({
        applied: false,
        attempt: {
          id: existing.rows[0].id,
          phaseId: existing.rows[0].phase_id,
          kind: existing.rows[0].kind,
          outcome: existing.rows[0].outcome,
          payload: existing.rows[0].payload,
          createdAt: new Date(existing.rows[0].created_at).toISOString(),
        },
      });
    }
    await touchStreak(pool, userId);
    return reply.code(201).send({
      applied: true,
      attempt: {
        id: rows[0].id,
        phaseId: rows[0].phase_id,
        kind: rows[0].kind,
        outcome: rows[0].outcome,
        payload: rows[0].payload,
        createdAt: new Date(rows[0].created_at).toISOString(),
      },
    });
  });

  /* Completing a phase. A phase is finished once: the second answer is 409
     already_completed, not a second row. The reason a client repeats the call
     is a dropped connection, and the answer tells it the phase is done
     without pretending the second call did anything. */
  app.post("/progress/complete", async (req, reply) => {
    const userId = requireUserId(req);
    const body = jsonObject(req.body, "body");
    const phaseId = text(body.phaseId, "phaseId");
    const completedAt = optionalInstant(body.completedAt, "completedAt", new Date().toISOString());
    const { rows } = await pool.query(
      "INSERT INTO progress_completions (user_id, phase_id, completed_at, source) " +
        "VALUES ($1, $2, $3, 'server') " +
        "ON CONFLICT (user_id, phase_id) DO NOTHING " +
        "RETURNING phase_id, completed_at, source",
      [userId, phaseId, completedAt]
    );
    if (rows.length === 0) {
      throw new ApiError(409, "already_completed", "This phase is already completed.");
    }
    await touchStreak(pool, userId);
    return reply.code(201).send({
      completion: {
        phaseId: rows[0].phase_id,
        completedAt: new Date(rows[0].completed_at).toISOString(),
        source: rows[0].source,
      },
    });
  });

  /* A guest's local work moving into the account they just signed in to.
   *
   * The rules, and why each one:
   *
   *   - completions: the server's wins. The platform's own record of a
   *     finished phase outranks a copy from a device, so a learner who
   *     finished a phase on their laptop and then on the platform keeps the
   *     platform's row.
   *   - drafts: the newest wins, by the moment the draft was written. Two
   *     devices editing the same phase is ordinary, and the later edit is the
   *     one the learner meant.
   *   - attempts: the union, keyed by the id the guest device minted, so a
   *     repeated migration adds nothing.
   *   - streak: the longer of the two, measured from the later day. Signing
   *     in never shortens a streak, and the day it is measured from is the
   *     day the learner was last active.
   *   - placement: the account's if it has one, the guest's otherwise.
   *
   * All of it happens in one transaction, so a migration either lands whole or
   * not at all. A refused migration changes nothing, which is what lets the
   * caller keep its local copy: the work is still there to send again, and
   * the answer says which item was refused. */
  app.post("/progress/migrate", async (req, reply) => {
    const userId = requireUserId(req);
    const body = jsonObject(req.body, "body");
    const drafts = items(body.drafts, "drafts").map((d, i) => readDraft(d, `drafts[${i}]`));
    const attempts = items(body.attempts, "attempts").map((a, i) => readAttempt(a, `attempts[${i}]`));
    const completions = items(body.completions, "completions").map((c, i) =>
      readCompletion(c, `completions[${i}]`)
    );
    const streakInput =
      body.streak === undefined || body.streak === null
        ? null
        : (() => {
            const raw = jsonObject(body.streak, "streak");
            const days = raw.days;
            if (typeof days !== "number" || !Number.isInteger(days) || days < 0) {
              bad("streak.days must be a whole number of days.");
            }
            return {
              days,
              lastActiveOn: raw.lastActiveOn === undefined || raw.lastActiveOn === null
                ? null
                : day(raw.lastActiveOn, "streak.lastActiveOn"),
            };
          })();
    const placementInput =
      body.placement === undefined || body.placement === null
        ? null
        : jsonObject(body.placement, "placement");

    const client = await pool.connect();
    const draftOutcomes: { phaseId: string; outcome: string }[] = [];
    const attemptOutcomes: { id: string; outcome: string }[] = [];
    const completionOutcomes: { phaseId: string; outcome: string }[] = [];
    let streakOutcome = "none";
    let placementOutcome = "none";
    try {
      await client.query("BEGIN");
      for (const draft of drafts) {
        const res = await client.query(
          "INSERT INTO progress_drafts (user_id, phase_id, content, updated_at, created_at) " +
            "VALUES ($1, $2, $3::jsonb, $4, now()) " +
            "ON CONFLICT (user_id, phase_id) DO UPDATE SET " +
            "  content = EXCLUDED.content, updated_at = EXCLUDED.updated_at " +
            "WHERE progress_drafts.updated_at <= EXCLUDED.updated_at " +
            "RETURNING phase_id",
          [userId, draft.phaseId, JSON.stringify(draft.content), draft.updatedAt]
        );
        draftOutcomes.push({
          phaseId: draft.phaseId,
          outcome: res.rowCount ? "migrated" : "server",
        });
      }
      for (const attempt of attempts) {
        const res = await client.query(
          "INSERT INTO progress_attempts (id, user_id, phase_id, kind, outcome, payload, created_at) " +
            "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) " +
            "ON CONFLICT (id) DO NOTHING " +
            "RETURNING id",
          [
            attempt.id,
            userId,
            attempt.phaseId,
            attempt.kind,
            attempt.outcome,
            JSON.stringify(attempt.payload),
            attempt.createdAt,
          ]
        );
        if (res.rowCount) {
          attemptOutcomes.push({ id: attempt.id, outcome: "migrated" });
          continue;
        }
        const owner = await client.query("SELECT user_id FROM progress_attempts WHERE id = $1", [attempt.id]);
        if (owner.rows[0] && owner.rows[0].user_id !== userId) {
          throw new ApiError(
            409,
            "conflict",
            "One of the attempts in this migration belongs to another account. Nothing was changed; " +
              "remove that attempt and send the rest again."
          );
        }
        attemptOutcomes.push({ id: attempt.id, outcome: "server" });
      }
      for (const completion of completions) {
        const res = await client.query(
          "INSERT INTO progress_completions (user_id, phase_id, completed_at, source) " +
            "VALUES ($1, $2, $3, 'guest') " +
            "ON CONFLICT (user_id, phase_id) DO NOTHING " +
            "RETURNING phase_id",
          [userId, completion.phaseId, completion.completedAt]
        );
        completionOutcomes.push({
          phaseId: completion.phaseId,
          outcome: res.rowCount ? "migrated" : "server",
        });
      }
      if (streakInput) {
        const res = await client.query(
          "INSERT INTO progress_state (user_id, streak_days, last_active_on, updated_at) " +
            "VALUES ($1, $2, $3, now()) " +
            "ON CONFLICT (user_id) DO UPDATE SET " +
            "  streak_days = GREATEST(progress_state.streak_days, EXCLUDED.streak_days), " +
            "  last_active_on = GREATEST(progress_state.last_active_on, EXCLUDED.last_active_on), " +
            "  updated_at = now() " +
            "RETURNING streak_days, last_active_on::text AS last_active_on",
          [userId, streakInput.days, streakInput.lastActiveOn]
        );
        const before = res.rows[0];
        streakOutcome =
          before && Number(before.streak_days) >= streakInput.days ? "server" : "migrated";
      }
      if (placementInput) {
        await client.query(
          "INSERT INTO progress_state (user_id, placement, updated_at) " +
            "VALUES ($1, $2::jsonb, now()) " +
            "ON CONFLICT (user_id) DO UPDATE SET " +
            "  placement = COALESCE(progress_state.placement, EXCLUDED.placement), " +
            "  updated_at = now()",
          [userId, JSON.stringify(placementInput)]
        );
        const current = await client.query(
          "SELECT placement FROM progress_state WHERE user_id = $1",
          [userId]
        );
        placementOutcome =
          current.rows[0]?.placement && JSON.stringify(current.rows[0].placement) === JSON.stringify(placementInput)
            ? "migrated"
            : "server";
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return reply.code(200).send({
      migrated: {
        drafts: draftOutcomes,
        attempts: attemptOutcomes,
        completions: completionOutcomes,
        streak: streakOutcome,
        placement: placementOutcome,
      },
    });
  });
}
