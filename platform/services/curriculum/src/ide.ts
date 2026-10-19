import { IDE_COURSES, IDE_DEFAULT_COURSE } from "./data/ide-courses.js";
import { IDE_CONTENT_VERSION } from "./data/ide-version.js";

/* The IDE curriculum, served behind entitlement.
 *
 * The extension that ships to a learner holds only its free loop; the whole
 * authored document lives here and is handed back one phase at a time, to a
 * caller the gateway has already found entitled. This module owns three things
 * the routes need and nothing more:
 *   - the public roadmap of a course (every phase by name and tier, holding no
 *     lesson body), so a signed-out learner still sees the whole course and
 *     what it costs;
 *   - the per-phase payload (the phase and exactly the activities it reaches),
 *     which is the paid content;
 *   - the shape of the whole catalogue, so a client can ask for a course by id
 *     and the front door can count every phase the IDE carries.
 *
 * The course list is DATA, not code: it arrives in the synced snapshot, from
 * the IDE's own catalogue. A course added in the IDE is served here without a
 * line of platform code changing, and a course removed in the IDE stops being
 * served without one.
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
  /** The course's role: the main line, or a short course that gates nothing.
   *  Read from the synced manifest, so the roadmap says what the IDE says. */
  role?: "main" | "side";
  phases: IdeManifestPhase[];
}

/** One course as the catalogue holds it. */
export interface IdeCourse {
  id: string;
  title: string;
  description: string;
  version: number;
  role: "main" | "side";
  manifest: IdeManifest;
  phases: IdePhase[];
  activities: Record<string, unknown>;
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
 * the project it already holds: the phase, and only the activities it reaches. */
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
    ...(m.role === "main" || m.role === "side" ? { role: m.role } : {}),
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

/* Every course in the snapshot, parsed and checked against its own roadmap.
 *
 * The roadmap and the content are synced from the same authored document, so
 * they must describe the same course. If they ever disagree — a manifest
 * regenerated without the document, or vice versa — the roadmap would promise
 * phases the content route cannot serve, or hide ones it can. Refuse at boot.
 *
 * The free tier is a per-course fact, and a course may have none: the two Go
 * courses are paid from their first phase, so every one of their phases is
 * served behind entitlement and their roadmap names all of them. The rule that
 * survives is the catalogue-wide one: at least one phase somewhere is free,
 * because a platform that serves no free phase offers a stranger nothing. */
const courses = new Map<string, IdeCourse>();
for (const [id, entry] of Object.entries(IDE_COURSES)) {
  const manifest = parseManifest(entry.manifest);
  const doc = parseDoc(entry.document);
  if (manifest.id !== id || doc.id !== id) {
    fail(`course ${id}: the snapshot names it ${manifest.id}/${doc.id}`);
  }
  const docIds = doc.phases.map((p) => p.id);
  const manIds = manifest.phases.map((p) => p.id);
  if (docIds.join("|") !== manIds.join("|")) {
    fail(`course ${id}: manifest phases [${manIds.join(", ")}] do not match document phases [${docIds.join(", ")}]`);
  }
  for (const mp of manifest.phases) {
    const dp = doc.phases.find((p) => p.id === mp.id)!;
    if (dp.activities.length !== mp.activityCount) {
      fail(`course ${id}: manifest activityCount for ${mp.id} (${mp.activityCount}) != document (${dp.activities.length})`);
    }
  }
  courses.set(id, {
    id,
    title: manifest.title,
    description: manifest.description,
    version: manifest.version,
    role: manifest.role ?? "main",
    manifest,
    phases: doc.phases,
    activities: doc.activities,
  });
}
if (courses.size === 0) fail("the snapshot holds no course");
if (!courses.has(IDE_DEFAULT_COURSE)) {
  fail(`the catalogue default course ${IDE_DEFAULT_COURSE} is not in the snapshot`);
}
{
  const free = [...courses.values()].some((course) => course.manifest.phases.some((p) => p.tier === "free"));
  if (!free) {
    fail("no phase is free in any course — the roadmap would offer nothing without an account");
  }
  // A phase id names one phase in the whole catalogue: the extension keys
  // progress by activity id and the journey by phase id, so two courses
  // sharing a phase id would share a learner's record. Refuse at boot rather
  // than serve one phase under two names.
  const seen = new Map<string, string>();
  for (const course of courses.values()) {
    for (const phase of course.phases) {
      const other = seen.get(phase.id);
      if (other) fail(`phase id ${phase.id} is in both ${other} and ${course.id}`);
      seen.set(phase.id, course.id);
    }
  }
}

const tierById = new Map<string, Tier>();
for (const course of courses.values()) {
  for (const phase of course.manifest.phases) { tierById.set(phase.id, phase.tier); }
}
const phaseById = new Map<string, { course: IdeCourse; phase: IdePhase }>();
for (const course of courses.values()) {
  for (const phase of course.phases) { phaseById.set(phase.id, { course, phase }); }
}

export function getIdeContentVersion(): string {
  return IDE_CONTENT_VERSION;
}

/** The course a fresh install opens, as the IDE's catalogue says. */
export function getDefaultIdeCourse(): string {
  return IDE_DEFAULT_COURSE;
}

/** Every course the IDE carries, in the catalogue's order. */
export function getIdeCourses(): { id: string; title: string; description: string; version: number; role: "main" | "side"; phases: number; freePhases: number }[] {
  return [...courses.values()].map((course) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    version: course.version,
    role: course.role,
    phases: course.manifest.phases.length,
    freePhases: course.manifest.phases.filter((p) => p.tier === "free").length,
  }));
}

/** Public roadmap: names, tiers and sizes, never a lesson body or a check. */
export function getIdeManifest(courseId: string = IDE_DEFAULT_COURSE): IdeManifest | null {
  const course = courses.get(courseId);
  if (!course) return null;
  return structuredClone(course.manifest);
}

export function getIdeVersion() {
  const all = [...courses.values()];
  return {
    ideVersion: IDE_CONTENT_VERSION,
    version: all[0]?.version ?? 0,
    courses: all.length,
    phases: all.reduce((sum, course) => sum + course.manifest.phases.length, 0),
    activities: all.reduce((sum, course) => sum + Object.keys(course.activities).length, 0),
    freePhases: all.reduce((sum, course) => sum + course.manifest.phases.filter((p) => p.tier === "free").length, 0),
    defaultCourse: IDE_DEFAULT_COURSE,
  };
}

export function getIdePhaseTier(id: string): Tier | null {
  return tierById.get(id) ?? null;
}

/**
 * One phase's paid payload: the phase and only the activities it reaches.
 * Returns null for an unknown id (the route 404s). Activity bodies pass
 * through untouched — the extension authored and validates them.
 *
 * `courseId` narrows the search when a caller names the course it wants. It is
 * optional because a phase id is unique across the catalogue, and the IDE asks
 * for a phase by id alone.
 */
export function getIdePhase(id: string, courseId?: string): IdePhasePayload | null {
  const found = phaseById.get(id);
  if (!found) return null;
  if (courseId !== undefined && found.course.id !== courseId) return null;
  const activities: Record<string, unknown> = {};
  for (const a of found.phase.activities) activities[a] = found.course.activities[a];
  return { phase: structuredClone(found.phase), activities: structuredClone(activities) };
}

/** The course a phase belongs to, or null when no phase has that id. */
export function getIdePhaseCourse(id: string): string | null {
  return phaseById.get(id)?.course.id ?? null;
}

/** Used by tests and the not-entitled path to name the boundary honestly. */
export function idePhaseExists(id: string): boolean {
  return phaseById.has(id);
}
