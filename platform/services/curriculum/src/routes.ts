import type { FastifyInstance } from "fastify";
import { ApiError, requireUserId } from "@nexora/service-kit";
import { IDE_CONTENT_VERSION } from "./data/ide-version.js";
import { getIdeManifest, getIdePhase, getIdePhaseCourse, getIdeVersion, getIdeCourses, getDefaultIdeCourse, getCurriculumProvenance } from "./ide.js";

/* The curriculum service serves the IDE curriculum only: a public roadmap
   (names and tiers, no lesson bodies) and paid phase payloads behind
   entitlement. The browser-classroom endpoints (stages, missions, diagnostic
   items, competencies) are deleted with the classroom — one way to learn, the
   desktop IDE — and this file fails closed on any request for them by not
   defining them. */

/** The gateway's entitlement verdict, injected only after billing confirms an
    active subscription, or after the auth service says this learner holds a
    seat in an active cohort. It is in the gateway's NEVER_FORWARDED set, so a
    client cannot send it; its absence on a paid route means the request was
    not blessed by the entitlement gate. */
const ENTITLED_HEADER = "x-entitled";

/** The courses the verdict covers: a comma-separated list, or `*` for every
    course (which is what a subscription means). A seat covers the one course
    the institution bought, and this service, which owns the phase-to-course
    map, is the only place that can say whether the phase asked for is one of
    them. It is in the gateway's NEVER_FORWARDED set too: a client that could
    send it could widen a seat into a whole curriculum. */
const ENTITLED_COURSES_HEADER = "x-entitled-courses";

function requireEntitled(req: { headers: Record<string, string | string[] | undefined> }): void {
  const v = req.headers[ENTITLED_HEADER];
  const val = Array.isArray(v) ? v[0] : v;
  if (val !== "1") {
    throw new ApiError(
      402,
      "entitlement_required",
      "This phase is part of the paid curriculum. Subscribe to unlock it."
    );
  }
}

/**
 * The course check, and the second floor under the paywall.
 *
 * A learner with a seat holds it in ONE course: the one the institution bought
 * for one class. The verdict carries the courses it covers, and a phase whose
 * course is not among them is refused with the same 402 a learner who has
 * bought nothing gets. The code and the status are the same on purpose — the
 * extension tells "subscribe" from "sign in" by the code, and there is no
 * third answer for a seat that covers a different course.
 *
 * Fail closed: a verdict with no course list covers nothing, so a request that
 * somehow arrives without one is refused rather than served.
 */
function requireCourseCovered(
  req: { headers: Record<string, string | string[] | undefined> },
  courseId: string
): void {
  const raw = req.headers[ENTITLED_COURSES_HEADER];
  const list = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  // `*` is a subscription: every course.
  if (list === "*") return;
  const covered = list
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!courseId || !covered.includes(courseId)) {
    throw new ApiError(
      402,
      "entitlement_required",
      "This phase is in a course your licence does not cover. It is part of the paid curriculum."
    );
  }
}

export function registerCurriculumRoutes(app: FastifyInstance) {
  // Every response carries the IDE content version (clients detect a stale
  // roadmap). GETs are edge-cacheable for five minutes — except paid phase
  // payloads, which must never sit in a shared cache where a non-entitled
  // caller could be served someone else's unlocked content.
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Ide-Content-Version", IDE_CONTENT_VERSION);
    if (req.method === "GET") {
      const paid = req.url.startsWith("/ide/phases/");
      reply.header("Cache-Control", paid ? "private, no-store" : "public, max-age=300");
    }
    return payload;
  });

  /* ---- The IDE curriculum: a public roadmap, paid phase bodies ---- */

  // Public: a signed-out learner still sees the whole road and what it costs to
  // walk, rather than a one-item course that hides the rest. Names and tiers
  // only — getIdeManifest holds no lesson body, no check and no brief.
  //
  // The course is a query parameter, because the IDE carries five courses and
  // each one has its own road. Without it the call answers for the course a
  // fresh install opens, which is what every existing client asked for, so the
  // old call still works and still means the same thing.
  app.get("/ide/version", async () => getIdeVersion());
  app.get("/ide/courses", async () => ({ courses: getIdeCourses(), defaultCourse: getDefaultIdeCourse() }));
  /* The provenance and the rubric of every phase: who wrote it, who read it,
     where it came from, and which of its activities the server recomputes
     against the learner's own account. No lesson body and no check, so it
     sits beside the public roadmap. A portfolio reads it next to a proof, and
     a reader sees the gap where there is no second reader rather than an
     implied review that never happened. */
  app.get("/ide/provenance", async () => getCurriculumProvenance());
  app.get("/ide/manifest", async (req) => {
    const query = req.query as { course?: string } | undefined;
    const courseId = query?.course;
    if (courseId !== undefined && courseId.length === 0) {
      throw new ApiError(400, "bad_request", "Give the course a name: ?course=<id>.");
    }
    const manifest = getIdeManifest(courseId);
    if (!manifest) {
      throw new ApiError(404, "not_found", `Unknown course ${courseId}.`);
    }
    return { manifest, course: manifest.id };
  });

  /* Paid: one phase and exactly the activities it reaches. Three floors, all
     required, in this order:
       - x-user-id (401 without): the gateway injects it after verifying the
         learner's token. Missing means the request never came through auth.
       - x-entitled (402 without): the gateway injects it only after billing
         confirms an active subscription, or after the auth service says this
         learner holds a seat in an active cohort. Missing means signed in, not
         subscribed.
       - x-entitled-courses (402 without): the courses that verdict covers. A
         seat covers one course, and a phase of another course is not this
         learner's to open.
     The gateway denies a non-entitled caller before it reaches here, so the
     x-entitled floor is defense in depth: a paid payload cannot leave this
     service on a request the entitlement gate did not bless, even one forged
     inside the mesh. The two codes are distinct on purpose — the extension has
     to tell "sign in" from "subscribe" without parsing prose. */
  app.get("/ide/phases/:id", async (req) => {
    requireUserId(req);
    requireEntitled(req);
    const id = (req.params as { id: string }).id;
    // The course is optional: a phase id is unique across the catalogue, and
    // the IDE asks for a phase by id alone. A caller that names the course
    // gets that course's phase, and a phase that is not in it is a phase that
    // is not there.
    const query = req.query as { course?: string } | undefined;
    const payload = getIdePhase(id, query?.course);
    if (!payload) throw new ApiError(404, "not_found", `Unknown phase ${id}.`);
    // And now the course check: this service owns the phase-to-course map, so
    // this is the only place that can say whether the phase asked for is one
    // the verdict covers.
    requireCourseCovered(req, getIdePhaseCourse(id) ?? "");
    return payload;
  });
}
