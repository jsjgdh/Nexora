import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import {
  attestSubmissionSchema,
  designAttestSubmissionSchema,
  designReceiptPayload,
  designReceiptSchema,
  executeSchema,
  runReceiptPayload,
  runReceiptSchema,
  type AttestVerdict,
  type DesignAttestVerdict,
} from "@nexora/contracts";
import type { ExecuteResponse } from "@nexora/contracts";
import {
  ApiError,
  parseOr400,
  receiptFresh,
  requireUserId,
  verifyReceiptEd,
  verifyReceiptSignature,
} from "@nexora/service-kit";
import { cleanPath, validateJob, DEFAULT_TIMEOUT_BY_LANGUAGE } from "./validate.js";
import type { ValidatedJob } from "./validate.js";
import { judgeAttestChecks, parseTap, resolveAttestArgv } from "./attest.js";
import {
  canonicalGraphHash,
  judgeDesignChecks,
  type DesignGraph,
  type StructuralCheck,
} from "./designAttest.js";
import { runSubprocess } from "./runners/subprocess.js";
import { EXEC_IMAGES, dockerAvailable, runDocker } from "./runners/docker.js";
import { JobQueue, QueueSaturated } from "./queue.js";
import { Quotas } from "./quotas.js";
import { goPhase, parseGoDiagnostics, trimGoStderr } from "./go-diagnostics.js";
import { mintDesignReceipt, mintReceipt, receiptPublicKey, receiptSigningKey } from "./receipt.js";

export interface ExecutionDeps {
  queue: JobQueue;
  quotas: Quotas;
  /**
   * Canonical IDE test suites by registry key (`task-manager/test/cart.test.mjs`
   * → contents; keys are project-qualified because two projects can own one
   * relative path with different suites). The learner owns their workspace
   * including its test files, so a submitted test is a claim; only a suite
   * from this registry may decide a verdict. Empty when the fixture sync has
   * not run — with nothing registered every attestation answers 503
   * `attestation_unavailable`, never a pass. In production the registry loads
   * from the synced module (`src/data/attest-fixtures.ts`, via
   * `npm run sync:fixtures`); absent or malformed entries degrade to that
   * same 503.
   */
  attestFixtures?: ReadonlyMap<string, string>;
  /**
   * Canonical design challenges by id (`url-shortener` → its authored revision
   * plus its structural checks). The learner draws the graph; only the
   * platform's own copy of a challenge's checks may decide a design verdict —
   * a client-sent check is a claim, not proof. Empty when the
   * design-challenge sync has not run: with nothing registered every design
   * attestation answers 503 `attestation_unavailable`, never a pass and never
   * a fail. In production the registry loads from the synced module
   * (`src/data/design-challenges.ts`, via `npm run sync:design`); absent or
   * malformed entries degrade to that same 503. A submission naming a revision
   * the registry no longer holds answers
   * 409 `version_mismatch` for the same reason: a graph drawn against checks
   * this platform no longer judges must not earn a verdict from different
   * ones. The rubric half is never here: these are the deterministic
   * structural checks only.
   */
  attestChallenges?: ReadonlyMap<string, { version: number; checks: StructuralCheck[] }>;
  /**
   * How this deployment isolates a run it is asked to perform: a subprocess on
   * this host (single-tenant, the toolchain is baked into this image) or a
   * container per job (multi-tenant, needs a daemon). It is the only choice
   * left to make — the service always runs the code itself.
   */
  runner: "subprocess" | "docker";
}

/** How to probe each language's availability under the subprocess runner. */
const HOST_PROBES: Record<string, [string, string[]]> = {
  node: ["node", ["--version"]],
  python: ["python3", ["--version"]],
  go: ["go", ["version"]],
};

function hasBinary(bin: string, args: string[] = ["--version"]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 5000 }, (err) => resolve(!err));
  });
}

export function registerExecutionRoutes(app: FastifyInstance, deps: ExecutionDeps) {
  /* Third-party receipt check (B-24).
   *
   * A receipt carries two signatures over the same bytes: the HMAC, which
   * only this platform can recompute, and — when the operator configured a
   * receipt key — Ed25519, which anyone holding the published key can check.
   * This endpoint takes a posted receipt, tries the HMAC first (mesh-issued,
   * always present) and then the published key, checks freshness, and returns
   * the decoded facts plus which signature verified. No auth: it is the public
   * "open a link and re-derive the verdict" surface. It never mints, never
   * forwards identity, and never exposes a private key. Rate-limited at the
   * edge via the gateway's publicPaths entry. */
  app.post("/verify", async (req) => {
    const raw = (req.body as { receipt?: unknown })?.receipt ?? req.body;
    /* Two receipt kinds share this public surface: a code run and a design
     * verdict. Discriminate on facts.kind. A design receipt re-derives over the
     * design payload and projects which structural checks held; anything else
     * keeps the code-run path below, untouched. Same two-signature order —
     * Ed25519 first because it is the stronger, offline-verifiable claim, the
     * HMAC as the fallback that keeps pre-migration receipts verifying. */
    const design = designReceiptSchema.safeParse(raw);
    if (design.success) {
      const dPayload = designReceiptPayload(design.data.facts, design.data.issuedAt);
      let dVerified: "hmac" | "ed25519" | null = null;
      if (design.data.sigEd) {
        try {
          const { publicKey } = receiptPublicKey();
          if (verifyReceiptEd(dPayload, design.data.sigEd, publicKey)) dVerified = "ed25519";
        } catch {
          // No receipt key configured: the Ed25519 half cannot verify here,
          // and the HMAC below still gets its chance.
        }
      }
      const dKey = receiptSigningKey();
      if (!dVerified && dKey && verifyReceiptSignature(dPayload, design.data.sig, dKey)) dVerified = "hmac";
      if (!dVerified) {
        return { valid: false, fresh: false, kind: "design", reason: "This receipt was not issued by this platform." };
      }
      const dFresh = receiptFresh(design.data.issuedAt);
      return {
        valid: true,
        fresh: dFresh,
        kind: "design",
        verifiedBy: dVerified,
        offlineVerifiable: dVerified === "ed25519",
        issuedAt: design.data.issuedAt,
        challengeId: design.data.facts.challengeId,
        graphSha256: design.data.facts.graphSha256,
        checks: design.data.facts.checks,
        runner: design.data.facts.runner,
        reason: dFresh
          ? dVerified === "ed25519"
            ? "A design verdict issued by this platform and re-derivable offline against the published key."
            : "A design verdict issued by this platform and within the 30-minute freshness window."
          : "A design verdict issued by this platform but older than 30 minutes — ask for a fresh judgment.",
      };
    }
    const body = parseOr400(runReceiptSchema, raw);
    const payload = runReceiptPayload(body.facts, body.issuedAt);
    // Ed25519 first: it is the stronger claim (anyone can re-derive it), so a
    // receipt carrying both reports the offline-verifiable one. The HMAC is
    // the fallback that keeps pre-migration receipts verifying.
    let verifiedBy: "hmac" | "ed25519" | null = null;
    if (body.sigEd) {
      try {
        const { publicKey } = receiptPublicKey();
        if (verifyReceiptEd(payload, body.sigEd, publicKey)) verifiedBy = "ed25519";
      } catch {
        // No receipt key configured: an Ed25519 signature cannot verify here,
        // and the HMAC below still gets its chance. Falls through to invalid.
      }
    }
    const signingKey = receiptSigningKey();
    if (!verifiedBy && signingKey && verifyReceiptSignature(payload, body.sig, signingKey)) {
      verifiedBy = "hmac";
    }
    if (!verifiedBy) {
      return { valid: false, fresh: false, reason: "This receipt was not issued by this platform." };
    }
    const fresh = receiptFresh(body.issuedAt);
    return {
      valid: true,
      fresh,
      verifiedBy,
      offlineVerifiable: verifiedBy === "ed25519",
      issuedAt: body.issuedAt,
      language: body.facts.language,
      exitCode: body.facts.exitCode,
      timedOut: body.facts.timedOut,
      files: body.facts.files,
      runner: body.facts.runner,
      reason: fresh
        ? verifiedBy === "ed25519"
          ? "Issued by this platform and re-derivable offline against the published key."
          : "Issued by this platform and within the 30-minute freshness window."
        : "Issued by this platform but older than 30 minutes — ask for a fresh run.",
    };
  });

  /* The published receipt key (B-24, the offline half).
   *
   * Anyone — a stranger with a receipt, the IDE checking without a session —
   * fetches this and verifies `sigEd` locally, no account and no request to
   * the platform required. It answers only the public half; 503 when the
   * operator never configured a key, because an unavailable key is a fact,
   * not a verdict. Public through the gateway. */
  app.get("/verify-key", async () => {
    try {
      const { keyId, publicKey } = receiptPublicKey();
      return { algorithm: "Ed25519", keyId, publicKey };
    } catch {
      throw new ApiError(503, "verification_unavailable", "This platform publishes no receipt key.");
    }
  });

  /* IDE attestation: re-run and re-judge (B-24, second half).
   *
   * The extension submits a finished run — its check→test mapping, its source
   * files, its test command. The platform answers with a verdict it computed
   * itself, which is the only thing that may upgrade a record from `local` to
   * `attested`. Authed (a bearer the gateway verified), never public: this
   * spends sandbox time and daily quota like any other run.
   *
   * Three fail-closed rules, all deliberate:
   * - the command must be `node --test` over registered suites, or 400;
   * - every named suite must be a canonical fixture from the platform's own
   *   registry — a learner-supplied twin is rejected, an unregistered suite is
   *   503 `attestation_unavailable` (until `npm run sync:fixtures` registers
   *   it), and neither is ever a pass or a fail;
   * - a requested check with no definition in this submission fails, because a
   *   verdict about a check nobody described is not a verdict.
   * `localTap` is accepted and ignored: it is the learner's own report about
   * their machine, and evidence here is only what this service observed. */
  app.post("/attest", async (req, reply) => {
    const userId = requireUserId(req);
    const denied = deps.quotas.check(userId);
    if (denied) throw new ApiError(429, "quota_reached", denied);
    const body = parseOr400(attestSubmissionSchema, req.body);
    const argvTail = resolveAttestArgv(body.command);
    const testPaths = argvTail.slice(2);
    const fixtures = deps.attestFixtures ?? new Map<string, string>();
    // Registry keys are project-qualified (`go-ledger/test/merge.test.mjs`)
    // because two projects can own one relative path with different suites.
    // Absent means `task-manager`, mirroring the curriculum's own default —
    // and a wrong guess still fails closed, because the canonical suite's TAP
    // will not contain the requested test names.
    const project = body.project ?? "task-manager";
    const keyFor = (t: string) => (t.startsWith("acceptance/") ? t : `${project}/${t}`);
    for (const t of testPaths) {
      if (!fixtures.has(keyFor(t))) {
        throw new ApiError(
          503,
          "attestation_unavailable",
          `No canonical suite is registered for ${t} (project ${project}) yet, so this run cannot be independently re-judged. It still counts — as practiced.`
        );
      }
    }
    const seen = new Set<string>();
    const sources: { path: string; content: string }[] = [];
    for (const f of body.files) {
      const path = cleanPath(f.path);
      if (fixtures.has(keyFor(path))) {
        throw new ApiError(
          400,
          "bad_request",
          `Submitted file shadows the canonical suite ${path}: remove it; the platform runs its own copy.`
        );
      }
      if (seen.has(path)) throw new ApiError(400, "bad_request", `Duplicate file path: ${path}`);
      seen.add(path);
      const bytes = Buffer.byteLength(f.content, "utf8");
      if (bytes > 256_000) throw new ApiError(400, "bad_request", `File too large: ${path}`);
      sources.push({ path, content: f.content });
    }
    const job: ValidatedJob = {
      language: "node",
      files: [...testPaths.map((p) => ({ path: p, content: fixtures.get(keyFor(p)) as string })), ...sources],
      command: ["node", ...argvTail],
      stdin: "",
      timeoutMs: 20_000,
      memoryMb: 128,
      outputKb: 64,
    };
    const release = deps.quotas.acquire(userId);
    try {
      const run = (): Promise<ExecuteResponse> =>
        deps.runner === "docker" ? runDocker(job) : runSubprocess(job);
      const result = await deps.queue.run(run).catch((err: unknown) => {
        if (err instanceof QueueSaturated) {
          deps.quotas.refund(userId);
          reply.header("Retry-After", "5");
          throw new ApiError(503, "runner_saturated", "The runner is busy right now. Try again in a moment.");
        }
        throw err;
      });
      const judged = judgeAttestChecks(
        body.checks.map((c) => ({ id: c.id, tests: c.tests })),
        parseTap(`${result.stdout}\n${result.stderr}`)
      );
      const byId = new Map(judged.map((j) => [j.checkId, j]));
      const checks = body.checkIds.map(
        (id) =>
          byId.get(id) ?? {
            checkId: id,
            passed: false,
            reason: "This check was requested but not described by the submission.",
          }
      );
      const passed = checks.filter((c) => c.passed).length;
      const out: AttestVerdict = {
        provenance: "attested",
        outcome:
          passed === checks.length
            ? "Every requested check was re-judged server-side and passed."
            : `Re-judged server-side: ${passed} of ${checks.length} requested checks passed.`,
        checks,
      };
      // The handoff object: the canonical run's own receipt, so the verdict
      // the IDE stores is proof a stranger can re-derive — not just a claim
      // the platform once made over this connection. Absent when this
      // deployment holds no signing key; the verdict is still attested, but
      // there is nothing to hand over.
      const receiptKey = receiptSigningKey();
      if (receiptKey) {
        out.receipt = mintReceipt(job, result, receiptKey, new Date(), userId);
      }
      return reply.code(200).send(out);
    } finally {
      release();
    }
  });

  /* IDE design attestation: re-derive the structural verdict (B-24, design half).
   *
   * The extension submits a finished Studio graph and the challenge it answers.
   * The platform judges that graph against its OWN registered canonical checks
   * for the challenge — the client sends no checks that are trusted here — and
   * answers with a verdict it computed itself. This is the only route by which a
   * design record's provenance may leave `local`. No sandbox and no subprocess:
   * a structural verdict is pure computation, so nothing learner-supplied ever
   * runs, which keeps this strictly safer than code attestation.
   *
   * Fail-closed, mirroring `/attest`:
   * - an unregistered challenge is 503 `attestation_unavailable`, never a pass
   *   and never a fail;
   * - only the deterministic structural floor is judged — never the rubric and
   *   never a model score, which is the whole of D-025's "explicitly not in v2".
   * Authed (a bearer the gateway verified), quota-gated like `/attest`. */
  app.post("/attest/design", async (req, reply) => {
    const userId = requireUserId(req);
    const denied = deps.quotas.check(userId);
    if (denied) throw new ApiError(429, "quota_reached", denied);
    const body = parseOr400(designAttestSubmissionSchema, req.body);
    const registry = deps.attestChallenges ?? new Map<string, { version: number; checks: StructuralCheck[] }>();
    const canonical = registry.get(body.challengeId);
    if (!canonical || canonical.checks.length === 0) {
      throw new ApiError(
        503,
        "attestation_unavailable",
        `No canonical checks are registered for ${body.challengeId} yet, so this design cannot be independently re-judged. It still counts — as practiced.`
      );
    }
    // The revision the learner's IDE holds must be the revision judged here. A
    // graph drawn against older checks is not a worse graph, but judging it
    // against newer checks would fail work the learner never saw — so the
    // platform refuses with the mismatch stated, and the design keeps counting
    // as practiced. An IDE too old to name a revision is still judged: nothing
    // is refused for a field it never sent.
    if (body.challengeVersion !== undefined && body.challengeVersion !== canonical.version) {
      throw new ApiError(
        409,
        "version_mismatch",
        `This design names revision ${body.challengeVersion} of ${body.challengeId}, but this platform judges revision ${canonical.version}. Update the IDE and re-submit — it still counts as practiced.`
      );
    }
    // Re-shape the wire graph into the engine's own structural view, dropping
    // everything a check cannot read. The client's checks are never consulted:
    // `canonical` is the only thing that decides, which is the point of
    // re-judging — a learner cannot attest a graph by describing their own rules.
    const graph: DesignGraph = {
      nodes: body.graph.nodes.map((n) => ({ id: n.id, type: n.type, props: n.props })),
      edges: body.graph.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
    };
    // Reserve a daily run up front so concurrent requests cannot collectively
    // overspend the allowance, exactly as `/attest`; release in the finally. A
    // design verdict holds the concurrency slot only for as long as the pure
    // judge runs — no queue, because nothing executes.
    const release = deps.quotas.acquire(userId);
    try {
      const checks = judgeDesignChecks(graph, canonical.checks);
      const passed = checks.filter((c) => c.passed).length;
      const out: DesignAttestVerdict = {
        provenance: "attested",
        outcome:
          passed === checks.length
            ? "Every structural check the platform holds for this challenge was re-derived over your graph and passed."
            : `Re-derived server-side: ${passed} of ${checks.length} structural checks passed.`,
        checks,
        // The authored revision actually judged — the platform's own, not the
        // submission's claim. A stranger reading this verdict knows exactly
        // which check set decided it.
        challengeVersion: canonical.version,
      };
      // The handoff object: a receipt over the re-derived verdict, bound to the
      // canonical hash of the graph, so a stranger can re-open it without a live
      // platform. Absent when this deployment holds no signing key — the verdict
      // is still attested (its authority is the re-judging), but there is nothing
      // to hand over, and none is faked.
      const receiptKey = receiptSigningKey();
      if (receiptKey) {
        out.receipt = mintDesignReceipt(body.challengeId, canonicalGraphHash(graph), checks, receiptKey, new Date(), userId);
      }
      return reply.code(200).send(out);
    } finally {
      release();
    }
  });

  app.get("/capabilities", async (req) => {
    const userId = requireUserId(req);
    const quota = {
      dailyQuota: deps.quotas.dailyQuota,
      dailyRemaining: deps.quotas.remaining(userId),
    };
    // The docker tier's runtimes come from its images, so probing host binaries
    // there would report languages the service can serve as unavailable.
    const languages =
      deps.runner === "docker"
        ? Object.keys(EXEC_IMAGES)
        : (
            await Promise.all(
              Object.entries(HOST_PROBES).map(async ([lang, [bin, args]]) =>
                (await hasBinary(bin, args)) ? lang : null
              )
            )
          ).filter((l): l is string => l !== null);

    return {
      ...quota,
      runner: deps.runner,
      languages,
      concurrency: deps.queue.concurrency,
      defaultTimeoutMs: 8000,
      defaultTimeoutByLanguage: DEFAULT_TIMEOUT_BY_LANGUAGE,
      queueDepth: deps.queue.depth,
      reachable: true,
    };
  });

  app.post("/execute", async (req, reply) => {
    const userId = requireUserId(req);
    const denied = deps.quotas.check(userId);
    reply.header("X-Execution-Daily-Remaining", String(deps.quotas.remaining(userId)));
    if (denied) throw new ApiError(429, "quota_reached", denied);
    const body = parseOr400(executeSchema, req.body);
    const job = validateJob(body);

    // Availability is reported honestly per language, with the fix in the
    // message: a missing toolchain must never look like a learner's mistake.
    // The docker tier's toolchains come from its images, so only the
    // subprocess tier is probed on this host.
    if (deps.runner === "subprocess") {
      const probe = HOST_PROBES[job.language];
      if (probe && !(await hasBinary(probe[0], probe[1]))) {
        const install = job.language === "go" ? "the Go toolchain" : job.language;
        throw new ApiError(
          503,
          "language_unavailable",
          `${job.language} is not installed on this runner (missing ${install}).`
        );
      }
    }

    // Validate/probe above may await, so recheck immediately before reserving
    // a run. Without this second check, concurrent requests can all pass the
    // earlier daily-limit check and collectively overspend the allowance.
    const stillAllowed = deps.quotas.check(userId);
    if (stillAllowed) {
      reply.header("X-Execution-Daily-Remaining", String(deps.quotas.remaining(userId)));
      throw new ApiError(429, "quota_reached", stillAllowed);
    }
    const release = deps.quotas.acquire(userId);
    reply.header("X-Execution-Daily-Remaining", String(deps.quotas.remaining(userId)));
    try {
      const run = (): Promise<ExecuteResponse> =>
        deps.runner === "docker" ? runDocker(job) : runSubprocess(job);
      // Saturated: refuse now with a retry hint rather than hold the request
      // open until the gateway's 35s timeout, which reads to a learner as a
      // broken platform instead of a busy one. Nothing ran, so nothing is
      // charged: the concurrency slot is released by the outer finally and the
      // daily run reserved above is refunded here — a learner must not spend
      // their allowance on our backpressure.
      const result = await deps.queue.run(run).catch((err: unknown) => {
        if (err instanceof QueueSaturated) {
          deps.quotas.refund(userId);
          reply.header("Retry-After", "5");
          throw new ApiError(503, "runner_saturated", "The runner is busy right now. Try again in a moment.");
        }
        throw err;
      });

      // Go: attach the structured reading of stderr before it leaves the
      // service, so every client shows the same file/line and the same phase.
      if (job.language === "go") {
        const diagnostics = parseGoDiagnostics(result.stderr);
        result.diagnostics = diagnostics;
        result.phase = goPhase(diagnostics);
        result.stderr = trimGoStderr(result.stderr, diagnostics);
      }

      // Signed last, over the facts exactly as the client receives them — the
      // trimmed stderr and the structured diagnostics included. A receipt that
      // described something other than the response would be worse than none.
      const signingKey = receiptSigningKey();
      if (signingKey) result.receipt = mintReceipt(job, result, signingKey, new Date(), userId);

      return reply.code(200).send(result);
    } finally {
      release();
    }
  });
}
