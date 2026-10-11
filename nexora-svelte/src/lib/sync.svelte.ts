import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { session } from "./session.svelte";
import { progress } from "./store.svelte";
import {
  draftOf,
  mergeStates,
  meaningfulWork,
  protectCompleted,
  receiptEvidenceFor,
  type MissionDraft,
  type MissionPush,
  type SyncPlan,
} from "./sync-core";
import type { DiagnosticResult, RunReceipt, RunReceiptClaim } from "./types";

/* Cloud progress sync. When a learner is signed in and the platform API is
   configured (PUBLIC_API_URL), every meaningful change is pushed to the
   progress service — drafts, attempts, hints, questions, completions, the
   diagnostic, and the profile — and server state is pulled back down, so
   progress survives new devices and cleared browsers.

   Design rules (PRD FR-007/FR-008/FR-011, §13.2 "authoritative progress
   changes validated on the server"):
   - The learner's local experience is never blocked by sync. Local state
     updates instantly; pushes trail behind it. Failures surface as a small
     status, never as lost work.
   - Completions go through POST /missions/:id/complete so the server re-
     checks the stored evidence before accepting them. The server decides every
     check it can decide for itself: a web mission's declarative rules are
     re-derived from the saved draft (hence the PUT above always lands first),
     and for a mission that runs the learner's program the call carries the
     platform's own signed run record. For those checks the pass list we send is
     ignored — it is a claim, not evidence.
   - Merge decisions live in sync-core.ts (pure, unit-tested); this file is
     only transport + scheduling. */

const BASE = ((env.PUBLIC_API_URL as string | undefined) ?? "").replace(/\/$/, "");

/** The dirty-set key for a mission's pending run records. */
const runsKey = (missionId: string) => `runs:${missionId}`;

export type SyncStatus = "local" | "syncing" | "saved" | "offline" | "error";

class ApiCallError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

class SyncEngine {
  status = $state<SyncStatus>("local");
  detail = $state<string | null>(null);
  lastSyncAt = $state<string | null>(null);

  private dirty = new Set<string>();
  /**
   * Signed run records, per mission, held in memory only.
   *
   * A receipt is a credential for one run, not learner progress: it is spent the
   * moment the completion it proves is accepted, and it describes code the
   * learner may already have edited past. Keeping it out of the synced state
   * keeps "what the learner has done" and "what we can prove" two different
   * things — which is exactly why the server asks for it explicitly.
   */
  private receipts = new Map<string, { checkId: string; receipt: RunReceipt }[]>();
  /**
   * Runs waiting to be put on the record, per mission. Held beside the
   * receipts and pushed by the same scheduler, so a dropped connection
   * delays the record instead of losing it: it is the learner's own history,
   * and losing it to a flaky network would be the one failure mode worth
   * avoiding here.
   */
  private pendingRuns = new Map<string, { checkId: string; receipt: RunReceipt }[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private rerun = false;
  private started = false;
  private unsub: (() => void) | null = null;

  get enabled(): boolean {
    return BASE.length > 0 && session.loggedIn;
  }

  /** Wire up listeners and run the first full sync (pull → merge → push). */
  start() {
    if (!browser || this.started || !this.enabled) return;
    this.started = true;
    this.unsub = progress.onChange((e) => this.markDirty(e.kind));
    window.addEventListener("online", this.onOnline);
    // Quiet periodic retry while offline/dirty; cheap no-op when clean.
    this.retryTimer = setInterval(() => {
      if (this.dirty.size > 0 && (this.status === "offline" || this.status === "error")) {
        void this.run(false);
      }
    }, 45_000);
    void this.run(true);
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
    if (browser) window.removeEventListener("online", this.onOnline);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
    this.started = false;
    this.dirty.clear();
    this.receipts.clear();
    this.pendingRuns.clear();
    this.status = "local";
    this.detail = null;
  }

  /**
   * Remember the run the learner just made, so the completion that follows can
   * prove it. Called with the mission's execution-check ids and whatever the
   * run returned; claims without a receipt are dropped (see receiptEvidenceFor).
   */
  noteRunReceipt(missionId: string, claims: RunReceiptClaim[]) {
    const kept = receiptEvidenceFor(claims);
    if (kept.length > 0) this.receipts.set(missionId, kept);
    else this.receipts.delete(missionId);
  }

  /**
   * Forget a mission's run record — used when the code changes, because the
   * record describes the program that ran, not the one now in the editor.
   */
  clearRunReceipt(missionId: string) {
    this.receipts.delete(missionId);
  }

  /**
   * Put the run the learner just made on the platform's record.
   *
   * The receipt above is a capability, spent the moment a completion is
   * accepted; this is the other half — what they ran, what it printed, and
   * when, kept where a device change cannot lose it. It is scheduled rather
   * than sent straight away for two reasons: the draft has to land first, so
   * the record can say whether the program that ran is still the code saved
   * for the mission, and a push that fails while offline is retried like any
   * other work instead of quietly disappearing.
   *
   * Nothing about this is a verdict, and nothing here blocks the learner: a
   * mission with no execution check, or local mode, records nothing at all.
   */
  recordRunHistory(missionId: string, claims: RunReceiptClaim[]) {
    if (!this.enabled) return;
    const kept = receiptEvidenceFor(claims);
    if (kept.length === 0) return;
    // Accumulated, not replaced: a learner who runs twice in the second before
    // a push made two attempts, and a transcript that kept only the last one
    // would be lying about what they did. The signature identifies an
    // execution, so re-offering one is the same entry, not a third.
    const pending = this.pendingRuns.get(missionId) ?? [];
    const bySig = new Map(pending.map((r) => [r.receipt.sig, r]));
    for (const r of kept) bySig.set(r.receipt.sig, r);
    this.pendingRuns.set(missionId, [...bySig.values()]);
    this.markDirty(runsKey(missionId));
  }

  /**
   * Push one mission's pending run records.
   *
   * Never throws: a history record is not worth surfacing to the learner as a
   * failed sync — their work is saved, their lesson is uninterrupted, and the
   * run is still in memory. A transport failure keeps it for the next attempt;
   * a refusal from the platform drops it, because retrying a rejected record
   * would only repeat the refusal.
   */
  private async pushRunHistory(missionId: string) {
    const runs = this.pendingRuns.get(missionId);
    if (!runs) return;
    try {
      const rec = progress.progressOf(missionId);
      // The draft first: `matchesSavedDraft` on the record compares the code
      // that ran against the code the server holds, which means nothing until
      // the server actually holds it.
      if (meaningfulWork(rec) && !rec.completedAt) {
        await this.pushMission({ missionId, draft: draftOf(rec), complete: false });
      }
      await this.call(`/api/progress/missions/${missionId}/runs`, {
        method: "POST",
        body: { runs },
      });
    } catch (err) {
      const refused = err instanceof ApiCallError && err.status >= 400 && err.status < 500;
      if (refused) this.pendingRuns.delete(missionId);
      else this.dirty.add(runsKey(missionId));
      return;
    }
    this.pendingRuns.delete(missionId);
  }

  /** Manual "Sync now" (profile card). Runs a full pull → merge → push. */
  syncNow() {
    if (!this.enabled) return;
    void this.run(true);
  }

  /** Account-level reset: wipe the server copy, then the local copy. */
  async resetAccount(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.call("/api/progress/state", { method: "DELETE" });
      return true;
    } catch (err) {
      this.status = err instanceof ApiCallError && err.status === 401 ? "error" : "error";
      this.detail =
        err instanceof ApiCallError && err.status === 401
          ? "Your session ended — sign in again, then reset."
          : "Could not reach the server. Local progress was still reset.";
      return false;
    }
  }

  private onOnline = () => {
    if (this.enabled && this.dirty.size > 0) void this.run(false);
  };

  private markDirty(kind: string) {
    if (!this.enabled || !this.started) return;
    this.dirty.add(kind);
    this.status = "syncing";
    this.schedule();
  }

  private schedule(ms = 1500) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, ms);
  }

  private async run(full: boolean) {
    if (!this.enabled) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    this.status = "syncing";
    try {
      if (full) await this.fullSync();
      else await this.pushDirty();
      this.status = "saved";
      this.detail = null;
      this.lastSyncAt = new Date().toISOString();
    } catch (err) {
      this.status = err instanceof TypeError ? "offline" : "error";
      this.detail =
        err instanceof ApiCallError
          ? err.status === 401
            ? "Your session ended — sign in again to keep syncing."
            : err.message
          : "Could not reach the server. Work stays saved on this device.";
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.schedule(500);
      }
    }
  }

  /** Sign-in / first sync: adopt what the server has, push what it lacks. */
  private async fullSync() {
    const fresh = await this.fetchState();
    const { merged, plan } = mergeStates(progress.state, fresh.state);
    progress.adopt(protectCompleted(merged, progress.state));
    await this.executePlan(plan);
    if (plan.missions.length > 0 || plan.profile || plan.diagnostic) {
      const after = await this.fetchState();
      progress.adopt(protectCompleted(mergeStates(progress.state, after.state).merged, progress.state));
    }
  }

  /** Steady state: push whatever the learner just changed. */
  private async pushDirty() {
    if (this.dirty.size === 0) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    let completedAny = false;
    for (const key of keys) {
      if (key === "profile") {
        if (progress.state.profile.completedAt) await this.pushProfile();
      } else if (key === "diagnostic") {
        if (progress.state.diagnostic.completedAt) {
          await this.pushDiagnostic(progress.state.diagnostic.results);
        }
      } else if (key.startsWith("runs:")) {
        await this.pushRunHistory(key.slice("runs:".length));
      } else if (key.startsWith("mission:")) {
        const id = key.slice("mission:".length);
        const rec = progress.progressOf(id);
        if (!meaningfulWork(rec)) continue;
        const push: MissionPush = { missionId: id, draft: draftOf(rec), complete: !!rec.completedAt };
        await this.pushMission(push);
        if (push.complete) completedAny = true;
      }
    }
    // Completions change XP and evidence server-side — adopt the fresh truth.
    if (completedAny) {
      const after = await this.fetchState();
      progress.adopt(protectCompleted(mergeStates(progress.state, after.state).merged, progress.state));
    }
  }

  private async executePlan(plan: SyncPlan) {
    if (plan.profile && progress.state.profile.completedAt) await this.pushProfile();
    if (plan.diagnostic) await this.pushDiagnostic(plan.diagnostic);
    for (const p of plan.missions) await this.pushMission(p);
  }

  private async fetchState(): Promise<{ state: import("./types").LearnerState }> {
    return this.call("/api/progress/state");
  }

  private async pushProfile() {
    const p = progress.state.profile;
    await this.call("/api/progress/profile", {
      method: "PUT",
      body: {
        name: p.name,
        goal: p.goal,
        experience: p.experience,
        languages: p.languages,
        tools: p.tools,
        canBuild: p.canBuild,
        hoursPerWeek: p.hoursPerWeek,
        interests: p.interests,
      },
    });
  }

  private async pushDiagnostic(results: DiagnosticResult[]) {
    await this.call("/api/progress/diagnostic", { method: "POST", body: { results } });
  }

  private async pushMission(p: MissionPush) {
    try {
      await this.call(`/api/progress/missions/${p.missionId}`, { method: "PUT", body: p.draft });
    } catch (err) {
      // 409 = already completed on the server (another device). Skip; the
      // post-sync pull adopts the canonical record.
      if (this.isApiError(err, 409)) return;
      throw err;
    }
    if (!p.complete) return;
    try {
      await this.call(`/api/progress/missions/${p.missionId}/complete`, {
        method: "POST",
        body: { runs: this.receipts.get(p.missionId) ?? [] },
      });
    } catch (err) {
      if (this.isApiError(err, 409)) return; // already completed — fine
      if (this.isApiError(err, 422)) {
        // Server-side evidence check rejected the completion: keep it dirty
        // so the next sync retries with freshly merged state.
        this.dirty.add(`mission:${p.missionId}`);
      }
      throw err;
    }
  }

  private isApiError(err: unknown, status: number): boolean {
    return err instanceof ApiCallError && err.status === status;
  }

  private async call<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    // Content-Type only rides with a body: an empty DELETE/GET with
    // application/json makes strict parsers reject the request outright.
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const token = await session.resolveToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON edge — classified below */
    }
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiCallError(res.status, e?.code ?? "request_failed", e?.message ?? `Request failed (${res.status})`);
    }
    return json as T;
  }
}

export const sync = new SyncEngine();
