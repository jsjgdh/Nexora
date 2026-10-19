import { IDE_MANIFEST } from "./data/ide-manifest.js";
import { IDE_TASK_MANAGER } from "./data/ide-task-manager.js";
import { IDE_CONTENT_VERSION } from "./data/ide-version.js";

/* The IDE curriculum, served behind entitlement.
 *
 * The extension that ships to a learner holds only its free loop; the whole
 * authored document lives here and is handed back one phase at a time, to a
 * caller the gateway has already found entitled. This module owns two things
 * the routes need and nothing more:
 *   - the public roadmap (every phase by name and tier, holding no lesson body),
 *     so a signed-out learner still sees the whole course and what it costs;
 *   - the per-phase payload (the phase and exactly the activities it reaches),
 *     which is the paid content.
 *
 * The full authoring model — activity kinds, checks, judges — belongs to the
 * extension's own model.ts. The platform does not re-implement it; it validates
 * structure enough to serve the document back intact and to know which phases
 * are behind the paywall, then passes activity bodies through untouched. The
 * tier boundary is not recomputed here either: it is read from the synced
 * manifest the extension generated, so there is one place that decides what is
 * free and it is not this service. */

export type Tier = "free" | "pro";

export interface IdeManifestPhase {
  id: string;
  title: string;
  goal: string;
  level: number;
  tier: Tier;
  authored: boolean;
  activityCount: number;
}

export interface IdeManifest {
  id: string;
  title: string;
  description: string;
  version: number;
  phases: IdeManifestPhase[];
}

/** A phase as authored: metadata plus the ids of the activities it runs. */
export interface IdePhase {
  id: string;
  title: string;
  goal: string;
  level: number;
  authored: boolean;
  /** The workspace this phase runs in, when it is not the course's own project
   *  (the Go track carries `go-ledger`/`go-deps`). Passed through untouched so
   *  the extension can name the right workspace; absent for base-project phases. */
  project?: string;
  activities: string[];
}

/** One phase's worth of paid content, shaped for the extension to merge into
 *  the project it already holds: the phase, and only the activities it reaches. */
export interface IdePhasePayload {
  phase: IdePhase;
  activities: Record<string, unknown>;
}

function fail(msg: string): never {
  // Thrown at module load, so a malformed snapshot stops the service booting
  // rather than serving a half-formed roadmap to every learner.
  throw new Error(`invalid IDE curriculum snapshot: ${msg}`);
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) fail(`${field} must be a non-empty string`);
  return v as string;
}

function num(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${field} must be a number`);
  return v as number;
}

function bool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") fail(`${field} must be a boolean`);
  return v as boolean;
}

function parseManifest(raw: unknown): IdeManifest {
  if (!raw || typeof raw !== "object") fail("manifest is not an object");
  const m = raw as Record<string, unknown>;
  const phasesRaw = m.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) fail("manifest has no phases");
  const phases: IdeManifestPhase[] = phasesRaw.map((p, i) => {
    if (!p || typeof p !== "object") fail(`manifest phase ${i} is not an object`);
    const q = p as Record<string, unknown>;
    const tier = q.tier;
    if (tier !== "free" && tier !== "pro") fail(`manifest phase ${i} has tier ${String(tier)}`);
    return {
      id: str(q.id, `manifest phase ${i} id`),
      title: str(q.title, `manifest phase ${i} title`),
      goal: str(q.goal, `manifest phase ${i} goal`),
      level: num(q.level, `manifest phase ${i} level`),
      tier,
      authored: bool(q.authored, `manifest phase ${i} authored`),
      activityCount: num(q.activityCount, `manifest phase ${i} activityCount`),
    };
  });
  return {
    id: str(m.id, "manifest id"),
    title: str(m.title, "manifest title"),
    description: str(m.description, "manifest description"),
    version: num(m.version, "manifest version"),
    phases,
  };
}

interface ParsedDoc {
  id: string;
  title: string;
  description: string;
  version: number;
  phases: IdePhase[];
  activities: Record<string, unknown>;
}

function parseDoc(raw: unknown): ParsedDoc {
  if (!raw || typeof raw !== "object") fail("document is not an object");
  const d = raw as Record<string, unknown>;
  const phasesRaw = d.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) fail("document has no phases");
  const actsRaw = d.activities;
  if (!actsRaw || typeof actsRaw !== "object") fail("document has no activities map");
  const activities = actsRaw as Record<string, unknown>;
  const phases: IdePhase[] = phasesRaw.map((p, i) => {
    if (!p || typeof p !== "object") fail(`phase ${i} is not an object`);
    const q = p as Record<string, unknown>;
    const idsRaw = q.activities;
    if (!Array.isArray(idsRaw)) fail(`phase ${i} has no activity list`);
    const ids = idsRaw.map((a, j) => str(a, `phase ${i} activity ${j}`));
    const id = str(q.id, `phase ${i} id`);
    for (const a of ids) {
      if (!(a in activities)) fail(`phase ${id} references unknown activity ${a}`);
    }
    return {
      id,
      title: str(q.title, `phase ${i} title`),
      goal: str(q.goal, `phase ${i} goal`),
      level: num(q.level, `phase ${i} level`),
      authored: bool(q.authored, `phase ${i} authored`),
      ...(typeof q.project === "string" && q.project.length > 0 ? { project: q.project } : {}),
      activities: ids,
    };
  });
  return {
    id: str(d.id, "document id"),
    title: str(d.title, "document title"),
    description: str(d.description, "document description"),
    version: num(d.version, "document version"),
    phases,
    activities,
  };
}

const manifest = parseManifest(IDE_MANIFEST);
const doc = parseDoc(IDE_TASK_MANAGER);

// The roadmap and the content are synced from the same authored document, so
// they must describe the same course. If they ever disagree — a manifest
// regenerated without the document, or vice versa — the roadmap would promise
// phases the content route cannot serve, or hide ones it can. Refuse at boot.
{
  const docIds = doc.phases.map((p) => p.id);
  const manIds = manifest.phases.map((p) => p.id);
  if (docIds.join("|") !== manIds.join("|")) {
    fail(`manifest phases [${manIds.join(", ")}] do not match document phases [${docIds.join(", ")}]`);
  }
  for (const mp of manifest.phases) {
    const dp = doc.phases.find((p) => p.id === mp.id)!;
    if (dp.activities.length !== mp.activityCount) {
      fail(`manifest activityCount for ${mp.id} (${mp.activityCount}) != document (${dp.activities.length})`);
    }
  }
  if (!manifest.phases.some((p) => p.tier === "free")) {
    fail("no phase is free — the roadmap would offer nothing without an account");
  }
}

const tierById = new Map<string, Tier>(manifest.phases.map((p) => [p.id, p.tier]));
const phaseById = new Map<string, IdePhase>(doc.phases.map((p) => [p.id, p]));

export function getIdeContentVersion(): string {
  return IDE_CONTENT_VERSION;
}

/** Public roadmap: names, tiers and sizes, never a lesson body or a check. */
export function getIdeManifest(): IdeManifest {
  return structuredClone(manifest);
}

export function getIdeVersion() {
  return {
    ideVersion: IDE_CONTENT_VERSION,
    version: doc.version,
    phases: doc.phases.length,
    activities: Object.keys(doc.activities).length,
    freePhases: manifest.phases.filter((p) => p.tier === "free").length,
  };
}

export function getIdePhaseTier(id: string): Tier | null {
  return tierById.get(id) ?? null;
}

/**
 * One phase's paid payload: the phase and only the activities it reaches.
 * Returns null for an unknown id (the route 404s). Activity bodies pass
 * through untouched — the extension authored and validates them.
 */
export function getIdePhase(id: string): IdePhasePayload | null {
  const phase = phaseById.get(id);
  if (!phase) return null;
  const activities: Record<string, unknown> = {};
  for (const a of phase.activities) activities[a] = doc.activities[a];
  return { phase: structuredClone(phase), activities: structuredClone(activities) };
}

/** Used by tests and the not-entitled path to name the boundary honestly. */
export function idePhaseExists(id: string): boolean {
  return phaseById.has(id);
}
