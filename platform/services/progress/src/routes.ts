import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  diagnosticSubmitSchema,
  missionCompleteSchema,
  missionDraftSchema,
  profileSchema,
  runRecordSchema,
  type CompleteResponse,
  type MissionProgressView,
  type RecommendationResponse,
  type RunHistoryResponse,
  type RunRecordResponse,
  type SummaryResponse,
} from "@nexora/contracts";
import { ApiError, parseOr400, requireUserId } from "@nexora/service-kit";
import { missionById } from "./vendor/missions.js";
import { COMPETENCIES } from "./vendor/curriculum.js";
import { DIAGNOSTIC_ITEMS } from "./vendor/diagnostic.js";
import { bump, computeFinalization, defaultMissionProgress } from "./vendor/progress-core.js";
import { diagnosticStartMissionId, recommend } from "./vendor/recommend.js";
import { CONTENT_VERSION } from "./vendor/version.js";
import { buildLearnerState, rowToProgress, type ProgressRow } from "./state.js";
import { entryPathFor, verifyRunEvidence } from "./verify-runs.js";
import { documentChecks, verifyDocumentChecks } from "./verify-document.js";
import {
  draftSha256Of,
  historyLimit,
  recordableRun,
  runRecordValues,
  runRowToView,
  type RunHistoryRow,
} from "./run-history.js";

async function loadState(pool: Pool, userId: string) {
  const [p, d, m, e] = await Promise.all([
    pool.query("SELECT * FROM profiles WHERE user_id = $1", [userId]),
    pool.query("SELECT * FROM diagnostics WHERE user_id = $1", [userId]),
    pool.query("SELECT * FROM mission_progress WHERE user_id = $1", [userId]),
    pool.query("SELECT * FROM evidence WHERE user_id = $1", [userId]),
  ]);
  return buildLearnerState({
    profile: p.rows[0] ?? null,
    diagnostic: d.rows[0]
      ? { completed_at: d.rows[0].completed_at, results: d.rows[0].results ?? [] }
      : null,
    missions: m.rows as ProgressRow[],
    evidence: e.rows,
  });
}

function toView(userId: string, r: ProgressRow): MissionProgressView {
  void userId;
  const p = rowToProgress(r);
  return {
    missionId: p.missionId,
    code: p.code,
    startedAt: p.startedAt,
    attempts: p.attempts,
    checksPassed: p.checksPassed,
    hintsUsed: p.hintsUsed,
    maxHintLevel: p.maxHintLevel,
    questionsAnswered: p.questionsAnswered,
    questionsCorrect: p.questionsCorrect,
    completedAt: p.completedAt,
    masteredAt: p.masteredAt,
    independent: p.independent,
    xpAwarded: p.xpAwarded,
    contentVersion: r.content_version,
  };
}

export function registerProgressRoutes(app: FastifyInstance, pool: Pool) {
  app.put("/profile", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(profileSchema, req.body);
    await pool.query(
      `INSERT INTO profiles (user_id, name, goal, experience, languages, tools, can_build, hours_per_week, interests, completed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         name=EXCLUDED.name, goal=EXCLUDED.goal, experience=EXCLUDED.experience,
         languages=EXCLUDED.languages, tools=EXCLUDED.tools, can_build=EXCLUDED.can_build,
         hours_per_week=EXCLUDED.hours_per_week, interests=EXCLUDED.interests,
         completed_at=now(), updated_at=now()`,
      [userId, body.name, body.goal, body.experience, body.languages, body.tools, body.canBuild, body.hoursPerWeek, body.interests]
    );
    return { ok: true };
  });

  app.post("/diagnostic", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(diagnosticSubmitSchema, req.body);
    // Correctness is RECOMPUTED server-side from submitted selections.
    // A client claiming correct:true proves nothing by itself.
    const byId = new Map(DIAGNOSTIC_ITEMS.map((d) => [d.id, d]));
    const results = body.results.map((r) => {
      const item = byId.get(r.itemId);
      if (!item) throw new ApiError(400, "bad_request", `Unknown diagnostic item ${r.itemId}.`);
      const skipped = r.selected === -1;
      return { itemId: r.itemId, selected: r.selected, skipped, correct: !skipped && r.selected === item.answer };
    });
    await pool.query(
      `INSERT INTO diagnostics (user_id, completed_at, results)
       VALUES ($1, now(), $2) ON CONFLICT (user_id) DO UPDATE SET completed_at = now(), results = $2`,
      [userId, JSON.stringify(results)]
    );
    const state = await loadState(pool, userId);
    void state;
    const startMissionId = diagnosticStartMissionId({
      ...state,
      diagnostic: { completedAt: new Date().toISOString(), results },
    });
    return { ok: true, startMissionId };
  });

  app.get("/missions/:id", async (req) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    if (!missionById(id)) throw new ApiError(404, "not_found", "Unknown mission.");
    const { rows } = await pool.query("SELECT * FROM mission_progress WHERE user_id = $1 AND mission_id = $2", [
      userId,
      id,
    ]);
    if (!rows[0]) throw new ApiError(404, "not_found", "No saved progress for this mission.");
    return { progress: toView(userId, rows[0]) };
  });

  app.put("/missions/:id", async (req) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    const mission = missionById(id);
    if (!mission) throw new ApiError(404, "not_found", "Unknown mission.");
    const body = parseOr400(missionDraftSchema, req.body);
    const existing = await pool.query("SELECT * FROM mission_progress WHERE user_id = $1 AND mission_id = $2", [
      userId,
      id,
    ]);
    const prev = existing.rows[0];
    if (prev?.completed_at) {
      throw new ApiError(409, "already_completed", "Mission already completed — it stays open for review, not rewrite.");
    }
    const questions =
      body.questionsAnswered || body.questionsCorrect
        ? {
            answered: { ...(prev?.questions?.answered ?? {}), ...(body.questionsAnswered ?? {}) },
            correct: { ...(prev?.questions?.correct ?? {}), ...(body.questionsCorrect ?? {}) },
          }
        : (prev?.questions ?? { answered: {}, correct: {} });
    await pool.query(
      `INSERT INTO mission_progress (user_id, mission_id, content_version, code, started_at, attempts, checks_passed, hints_used, max_hint_level, questions, updated_at)
       VALUES ($1,$2,$3,$4, COALESCE($5, now()), COALESCE($6,0), COALESCE($7::text[],'{}'), COALESCE($8,0), COALESCE($9,0), $10, now())
       ON CONFLICT (user_id, mission_id) DO UPDATE SET
         content_version=$3,
         code=COALESCE($4, mission_progress.code),
         attempts=COALESCE($6, mission_progress.attempts),
         checks_passed=COALESCE($7::text[], mission_progress.checks_passed),
         hints_used=COALESCE($8, mission_progress.hints_used),
         max_hint_level=GREATEST(mission_progress.max_hint_level, COALESCE($9, mission_progress.max_hint_level)),
         questions=$10, updated_at=now()`,
      [
        userId,
        id,
        CONTENT_VERSION,
        body.code ?? null,
        prev ? null : new Date(),
        body.attempts ?? null,
        body.checksPassed ?? null,
        body.hintsUsed ?? null,
        body.maxHintLevel ?? null,
        JSON.stringify(questions),
      ]
    );
    const { rows } = await pool.query("SELECT * FROM mission_progress WHERE user_id = $1 AND mission_id = $2", [
      userId,
      id,
    ]);
    return { progress: toView(userId, rows[0]) };
  });

  app.post("/missions/:id/complete", async (req, reply) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    const mission = missionById(id);
    if (!mission) throw new ApiError(404, "not_found", "Unknown mission.");
    const body = parseOr400(missionCompleteSchema, req.body ?? {});
    const { rows } = await pool.query("SELECT * FROM mission_progress WHERE user_id = $1 AND mission_id = $2", [
      userId,
      id,
    ]);
    let cur = rows[0]
      ? rowToProgress(rows[0])
      : { ...defaultMissionProgress(id, mission.starterCode), startedAt: new Date().toISOString() };
    if (cur.completedAt) throw new ApiError(409, "already_completed", "Mission already completed.");

    /*
     * This route decides every check the platform can decide for itself, from
     * the artifacts it holds — never from the pass list the client uploaded.
     *
     * Two kinds are re-derived here.
     *
     * Document checks are judged from the saved draft, by the same interpreter
     * the learner's screen runs (see verify-document.ts). The draft is the
     * artifact of record, so a page or a stylesheet cannot be marked done when
     * the stored code does not satisfy its own declarative rules.
     *
     * Execution checks are judged from the execution service's signed record of
     * the run — the difference between "the learner says they ran Go" and "this
     * platform ran their Go and saw what it printed", which is the whole claim
     * of the language layer.
     *
     * What still travels as the client's own evidence is exactly the rules that
     * need equipment only a browser has — `scripted` (a page to drive) and
     * `computed-style` (a real cascade) — plus question answers. That is a
     * known, stated limitation rather than an assumption — see TODO 2.2.
     */
    const runChecks = mission.checks.filter((c) => c.rule.kind === "runs");
    const docChecks = documentChecks(mission.checks);
    /* Everything this service decided for itself, for the response. */
    const verifiedByPlatform: string[] = [];
    let evidence = cur.checksPassed;

    if (docChecks.length > 0) {
      const verdicts = verifyDocumentChecks({ checks: docChecks, draftCode: cur.code });
      const unmet = verdicts.filter((v) => !v.passed);
      if (unmet.length > 0) {
        throw new ApiError(
          422,
          "document_unverified",
          `This mission's rules are checked against the code saved for it — not against your own report — and it does not meet: ${unmet
            .map((v) => `“${v.label}” — ${v.reason}`)
            .join(" ")}`
        );
      }
      const decided = new Set(docChecks.map((c) => c.id));
      evidence = [...evidence.filter((id) => !decided.has(id)), ...verdicts.map((v) => v.checkId)];
      verifiedByPlatform.push(...verdicts.map((v) => v.checkId));
    }

    if (runChecks.length > 0) {
      const meshKey = process.env.INTERNAL_API_KEY ?? "";
      if (!meshKey) {
        // No key means no receipts could have been issued, so nothing about the
        // run can be confirmed. Refusing is the honest answer: completing here
        // would record a skill this deployment cannot verify.
        throw new ApiError(
          503,
          "verification_unavailable",
          "This platform cannot confirm run evidence because INTERNAL_API_KEY is not set, so missions that run code cannot be completed here yet."
        );
      }
      const byCheck = new Map(body.runs.map((r) => [r.checkId, r.receipt]));
      const entryPath = entryPathFor(mission.fileName);
      const failures: string[] = [];
      const verifiedRuns: string[] = [];
      for (const c of runChecks) {
        const verdict = verifyRunEvidence({
          check: c,
          receipt: byCheck.get(c.id) ?? null,
          meshKey,
          draftCode: cur.code,
          entryPath,
        });
        if (verdict.passed) verifiedRuns.push(c.id);
        else failures.push(`“${c.label}” ${verdict.reason}`);
      }
      if (failures.length > 0) {
        throw new ApiError(
          422,
          "run_unverified",
          `The platform could not confirm this mission's run. ${failures.join(" ")}`
        );
      }
      evidence = [
        ...evidence.filter((id) => !runChecks.some((c) => c.id === id)),
        ...verifiedRuns,
      ];
      verifiedByPlatform.push(...verifiedRuns);
    }

    const required = new Set(mission.checks.map((c) => c.id));
    const passed = new Set(evidence);
    const missing = [...required].filter((c) => !passed.has(c));
    if (missing.length > 0 && mission.checks.length > 0) {
      throw new ApiError(422, "checks_open", `Requirements still open: ${missing.join(", ")}.`);
    }
    if (mission.checks.length === 0 && !(mission.questions ?? []).every((q) => cur.questionsCorrect[q.id])) {
      throw new ApiError(422, "checks_open", "Answer all questions correctly first.");
    }
    const { mastered, independent, xpGained, needsPractice } = computeFinalization(mission, cur);
    const stamp = new Date().toISOString();
    const note = `${mastered ? "Mastered" : "Completed"} “${mission.title}” (${stamp.slice(0, 10)})`;
    await pool.query("BEGIN");
    try {
      // `checks_passed` is written from `evidence`, the list this service
      // derived — not from the draft the client uploaded. Completing on
      // verified evidence and then storing the client's claim would leave the
      // ledger describing something nobody checked, which is exactly the kind
      // of gap that makes a later "proof of skill" claim unverifiable.
      await pool.query(
        `INSERT INTO mission_progress (user_id, mission_id, content_version, code, started_at, attempts, checks_passed, hints_used, max_hint_level, questions, completed_at, mastered_at, independent, xp_awarded, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         ON CONFLICT (user_id, mission_id) DO UPDATE SET
           checks_passed=$7, completed_at=$11, mastered_at=$12, independent=$13, xp_awarded=$14, updated_at=now()`,
        [
          userId, id, CONTENT_VERSION, cur.code, cur.startedAt ? new Date(cur.startedAt) : new Date(),
          cur.attempts, evidence, cur.hintsUsed, cur.maxHintLevel,
          JSON.stringify({ answered: cur.questionsAnswered, correct: cur.questionsCorrect }),
          stamp, mastered ? stamp : null, independent, xpGained,
        ]
      );
      for (const cid of mission.competencyIds) {
        const { rows: erows } = await pool.query("SELECT * FROM evidence WHERE user_id = $1 AND competency_id = $2", [
          userId,
          cid,
        ]);
        const current = erows[0]
          ? { level: erows[0].level, evidence: erows[0].evidence as string[] }
          : { level: "unseen" as const, evidence: [] as string[] };
        const next = bump(
          { [cid]: { competencyId: cid, level: current.level, evidence: current.evidence, updatedAt: stamp } },
          cid,
          mastered ? "independent" : independent ? "demonstrated" : "practiced",
          note
        )[cid];
        await pool.query(
          `INSERT INTO evidence (user_id, competency_id, level, evidence, updated_at)
           VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (user_id, competency_id) DO UPDATE SET level=$3, evidence=$4, updated_at=now()`,
          [userId, cid, next.level, JSON.stringify(next.evidence)]
        );
      }
      if (needsPractice) {
        // Practice queue lives client-side in v1; the needs-practice signal
        // is the completed-without-mastery state itself. (See verify.)
      }
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
    const total = await pool.query("SELECT COALESCE(SUM(xp_awarded),0) AS xp FROM mission_progress WHERE user_id = $1", [
      userId,
    ]);
    const out: CompleteResponse = {
      completed: true,
      mastered,
      xpGained,
      xpTotal: Number(total.rows[0].xp),
      ...(verifiedByPlatform.length > 0 ? { verifiedChecks: verifiedByPlatform } : {}),
    };
    return reply.code(200).send(out);
  });

  /*
   * Submission history: every run the platform performed, on record.
   *
   * Progress is uploaded by the learner's own device, so it is the one thing
   * that disappears with that device. A receipt was spent at completion and
   * thrown away, which meant a run that never ended in a completion left no
   * trace — and neither did the attempts leading up to one. These two routes
   * are the durable half: the facts the execution service signed, stored
   * against the mission they were run for.
   *
   * A record is not a verdict. Nothing here marks a check passed; the
   * completion path above still demands a fresh receipt of the learner's
   * current code before it will believe anything, so history can never stand
   * in for evidence. See run-history.ts for what is required to record a run,
   * and why freshness is deliberately not one of them.
   */
  app.post("/missions/:id/runs", async (req) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    const mission = missionById(id);
    if (!mission) throw new ApiError(404, "not_found", "Unknown mission.");
    const body = parseOr400(runRecordSchema, req.body);

    // Which checks a record may name. An unknown id would make the history
    // unreadable, so it is refused before anything is written rather than
    // stored as-is: a transcript is only worth keeping if it means something.
    const known = new Set(mission.checks.map((c) => c.id));
    for (const r of body.runs) {
      if (!known.has(r.checkId)) {
        throw new ApiError(400, "bad_request", `“${r.checkId}” is not a check on this mission.`);
      }
    }

    // No key means no run here can be attributed to this platform — every
    // receipt would be unverifiable, so none of them is a record of anything.
    // Refusing beats writing rows nobody can vouch for.
    const meshKey = process.env.INTERNAL_API_KEY ?? "";
    if (!meshKey) {
      throw new ApiError(
        503,
        "verification_unavailable",
        "This platform cannot record runs because INTERNAL_API_KEY is not set, so it cannot tell its own run records from anyone else's."
      );
    }

    const entryPath = entryPathFor(mission.fileName);
    // Every run is checked before any is written: a request either records what
    // it offered or records nothing, so a partial history cannot happen.
    const accepted = body.runs.map((r) => {
      const verdict = recordableRun({ receipt: r.receipt, meshKey, entryPath });
      if (!verdict.ok) {
        throw new ApiError(422, "run_unverified", `The platform did not record this run: ${verdict.reason}`);
      }
      return { checkId: r.checkId, values: runRecordValues(r.receipt, entryPath) };
    });

    // The draft this service holds right now, so a transcript can say whether
    // the program that ran is the one the learner still has saved.
    const stored = await pool.query(
      "SELECT code FROM mission_progress WHERE user_id = $1 AND mission_id = $2",
      [userId, id]
    );
    const draftSha256 = draftSha256Of(stored.rows[0] ? (stored.rows[0].code as string) : null);

    const sigs: string[] = [];
    let added = 0;
    let duplicates = 0;
    for (const run of accepted) {
      const v = run.values;
      // One row per execution. A receipt carries the platform's signature over
      // the facts, so the same run offered twice — for two checks reading one
      // program, or after a retry — collides on that signature instead of
      // writing the same facts again. Nothing but `check_ids` differs between
      // those offers, so that is all a conflict updates.
      const ins = await pool.query(
        `INSERT INTO mission_runs
           (user_id, mission_id, check_ids, language, command, entry_path, entry_sha256, draft_sha256,
            stdout, stderr, exit_code, timed_out, truncated, duration_ms, phase, diagnostics, runner,
            receipt_sig, content_version, issued_at)
         VALUES ($1,$2,$3::text[],$4,$5::text[],$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20)
         ON CONFLICT (user_id, mission_id, receipt_sig) DO NOTHING
         RETURNING id`,
        [
          userId, id, [run.checkId], v.language, v.command, v.entryPath, v.entrySha256,
          draftSha256, v.stdout, v.stderr, v.exitCode, v.timedOut, v.truncated, v.durationMs,
          v.phase, JSON.stringify(v.diagnostics), v.runner, v.receiptSig, CONTENT_VERSION,
          new Date(v.issuedAt),
        ]
      );
      if (ins.rowCount === 1) added += 1;
      else {
        duplicates += 1;
        await pool.query(
          `UPDATE mission_runs
             SET check_ids = (SELECT array_agg(DISTINCT c) FROM unnest(check_ids || $4::text[]) AS c)
           WHERE user_id = $1 AND mission_id = $2 AND receipt_sig = $3`,
          [userId, id, v.receiptSig, [run.checkId]]
        );
      }
      sigs.push(v.receiptSig);
    }

    const [rows, count] = await Promise.all([
      pool.query(
        "SELECT * FROM mission_runs WHERE user_id = $1 AND mission_id = $2 AND receipt_sig = ANY($3::text[]) ORDER BY recorded_at DESC, id DESC",
        [userId, id, sigs]
      ),
      pool.query("SELECT COUNT(*)::int AS n FROM mission_runs WHERE user_id = $1 AND mission_id = $2", [
        userId,
        id,
      ]),
    ]);
    const out: RunRecordResponse = {
      missionId: id,
      stored: added,
      duplicates,
      total: Number(count.rows[0]?.n ?? 0),
      runs: (rows.rows as RunHistoryRow[]).map(runRowToView),
    };
    return out;
  });

  // The learner's own attempt transcript for a mission, newest first. Scoped by
  // user id in the query itself: one account can never read another's runs.
  app.get("/missions/:id/runs", async (req) => {
    const userId = requireUserId(req);
    const id = (req.params as { id: string }).id;
    if (!missionById(id)) throw new ApiError(404, "not_found", "Unknown mission.");
    const limit = historyLimit((req.query as Record<string, unknown> | undefined)?.limit);
    const [rows, count] = await Promise.all([
      pool.query(
        "SELECT * FROM mission_runs WHERE user_id = $1 AND mission_id = $2 ORDER BY recorded_at DESC, id DESC LIMIT $3",
        [userId, id, limit]
      ),
      pool.query("SELECT COUNT(*)::int AS n FROM mission_runs WHERE user_id = $1 AND mission_id = $2", [
        userId,
        id,
      ]),
    ]);
    const out: RunHistoryResponse = {
      missionId: id,
      runs: (rows.rows as RunHistoryRow[]).map(runRowToView),
      total: Number(count.rows[0]?.n ?? 0),
    };
    return out;
  });

  // Full learner state: everything a device needs to restore or merge a
  // session (cloud backup). xp is derived from stored completions, and the
  // client's local-only extras (streaks, practice queue) are left to it.
  app.get("/state", async (req) => {
    const userId = requireUserId(req);
    const state = await loadState(pool, userId);
    const total = await pool.query(
      "SELECT COALESCE(SUM(xp_awarded),0) AS xp FROM mission_progress WHERE user_id = $1",
      [userId]
    );
    state.xp = Number(total.rows[0].xp);
    return { state, savedAt: new Date().toISOString() };
  });

  // Account-level reset: erase all stored progress for this user. Called by
  // the client's "reset everywhere" action after an explicit confirmation.
  // `mission_runs` is in the list because the learner's runs are their data
  // too: an erase that left the run history behind would leave transcripts of
  // work the account just asked to be forgotten.
  app.delete("/state", async (req) => {
    const userId = requireUserId(req);
    await pool.query("BEGIN");
    try {
      for (const table of ["mission_runs", "mission_progress", "evidence", "diagnostics", "profiles"]) {
        await pool.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      }
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
    return { ok: true };
  });

  app.get("/recommendations", async (req) => {
    const userId = requireUserId(req);
    const state = await loadState(pool, userId);
    const r = recommend(state);
    const out: RecommendationResponse = {
      primaryId: r.primaryId,
      refresherIds: r.refresherIds,
      reason: r.reason,
      done: r.done,
    };
    return out;
  });

  app.get("/summary", async (req) => {
    const userId = requireUserId(req);
    const [agg, ev] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(xp_awarded),0) AS xp,
                COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
                COUNT(*) FILTER (WHERE mastered_at IS NOT NULL) AS mastered
         FROM mission_progress WHERE user_id = $1`,
        [userId]
      ),
      pool.query("SELECT competency_id, level, evidence FROM evidence WHERE user_id = $1", [userId]),
    ]);
    const byId = new Map(COMPETENCIES.map((c) => [c.id, c.name]));
    const out: SummaryResponse = {
      xp: Number(agg.rows[0].xp),
      completed: Number(agg.rows[0].completed),
      mastered: Number(agg.rows[0].mastered),
      skills: ev.rows.map((r) => ({
        id: r.competency_id,
        name: byId.get(r.competency_id) ?? r.competency_id,
        level: r.level,
        evidenceCount: (r.evidence as string[]).length,
      })),
    };
    return out;
  });
}
