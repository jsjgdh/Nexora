/* The curriculum's own record of itself: provenance and rubric.
 *
 * The portfolio reads two things about a piece of work: who wrote it, and what
 * the evidence for it actually rests on. Until now the platform carried
 * neither, so a reader had to take the word "verified" on trust. These are the
 * tests for the two records that now exist:
 *
 *   - the provenance of a phase: the author, the reviewer (nobody today, and
 *     the record says so instead of implying a review that never happened),
 *     where it came from, and the licence it ships under (unresolved today,
 *     and the record says that too);
 *
 *   - the rubric of a phase: which of its activities the server recomputes by
 *     running the work, which rest on the learner's own account, and which
 *     are reading that makes no claim. The classification is fail-closed: an
 *     activity with checks but no command to run them is not attested,
 *     because nothing would recompute it.
 *
 * The module under test is the service's own build output, the way the rest
 * of the platform's suites import it. The service is started here with the
 * real chassis, so the routes are exercised the way the gateway reaches them. */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "@nexora/service-kit";
import { registerCurriculumRoutes } from "../services/curriculum/dist/routes.js";
import { activityBasis } from "../services/curriculum/dist/provenance.js";
import { getCurriculumProvenance, getIdeCourses, getIdeManifest } from "../services/curriculum/dist/ide.js";
import { IDE_COURSES } from "../services/curriculum/dist/data/ide-courses.js";

/* The chassis refuses to boot without a mesh key, so the suite gives it a
   real one rather than switching the check off. */
process.env.INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY ?? "test-mesh-key-0123456789abcdef0123456789";
const MESH_KEY = process.env.INTERNAL_API_KEY;

let app;

before(async () => {
  app = await createService("curriculum");
  registerCurriculumRoutes(app);
  await app.ready();
});

after(async () => {
  await app?.close();
});

const asMesh = () => ({ "x-internal-key": MESH_KEY });

describe("the curriculum's provenance", () => {
  it("names an author, a source and a licence for every course", () => {
    const catalogue = getCurriculumProvenance();
    assert.ok(catalogue.courses.length >= 1, "the catalogue holds no course");
    for (const course of catalogue.courses) {
      assert.ok(course.provenance.author.length > 0, `${course.id} names no author`);
      assert.ok(course.provenance.source.length > 0, `${course.id} names no source`);
      assert.ok(course.provenance.licence.length > 0, `${course.id} names no licence`);
    }
  });

  it("records that no second reader has reviewed the curriculum, because none has", () => {
    const catalogue = getCurriculumProvenance();
    for (const course of catalogue.courses) {
      for (const phase of course.phases) {
        assert.equal(
          phase.provenance.reviewer,
          null,
          `${phase.provenance.phaseId} claims a reviewer it does not have`
        );
        assert.equal(phase.provenance.reviewedOn, null);
      }
    }
  });

  it("carries a rubric for every phase of every course", () => {
    const catalogue = getCurriculumProvenance();
    const phases = catalogue.courses.flatMap((c) => c.phases);
    assert.ok(phases.length > 0, "the catalogue holds no phase");
    for (const phase of phases) {
      assert.equal(phase.rubric.phaseId, phase.provenance.phaseId);
      assert.equal(phase.rubric.courseId, phase.provenance.courseId);
      const total =
        phase.rubric.attested.length +
        phase.rubric.clientReported.length +
        phase.rubric.material.length;
      assert.ok(total > 0, `${phase.rubric.phaseId} has no rubric entries at all`);
      assert.ok(
        phase.rubric.statement.length > 0,
        `${phase.rubric.phaseId} has no plain statement`
      );
    }
  });
});

describe("the rubric's classification is derived, not asserted", () => {
  it("calls an activity attested only when the platform can re-derive it", () => {
    assert.equal(
      activityBasis({
        kind: "challenge",
        checks: [{ id: "a", tests: ["a"] }],
        testCommand: "node --test",
      }),
      "attested"
    );
    // Checks with no command: nothing would recompute them, so the platform
    // must not claim them.
    assert.equal(activityBasis({ kind: "challenge", checks: [{ id: "a" }] }), "client-reported");
    // A command with no checks: nothing to hold or fail.
    assert.equal(activityBasis({ kind: "challenge", testCommand: "node --test" }), "client-reported");
    // The catalogues the platform judges from: an incident, and a design.
    assert.equal(activityBasis({ kind: "incident", incidentId: "incident-race-hang" }), "attested");
    assert.equal(activityBasis({ kind: "design", designId: "design-state-persistence" }), "attested");
  });

  it("calls reading material and answers the learner's own account", () => {
    assert.equal(activityBasis({ kind: "lesson" }), "material");
    assert.equal(activityBasis({ kind: "prose" }), "material");
    assert.equal(activityBasis({ kind: "example" }), "material");
    assert.equal(activityBasis({ kind: "keypoints" }), "material");
    assert.equal(activityBasis({ kind: "question" }), "client-reported");
    assert.equal(activityBasis({ kind: "retrieval" }), "client-reported");
    assert.equal(activityBasis({ kind: "quickcheck" }), "client-reported");
    assert.equal(activityBasis({ kind: "task" }), "client-reported");
  });

  it("classifies every activity of every phase exactly once", () => {
    const catalogue = getCurriculumProvenance();
    for (const course of catalogue.courses) {
      for (const phase of course.phases) {
        const classified = [
          ...phase.rubric.attested,
          ...phase.rubric.clientReported,
          ...phase.rubric.material,
        ];
        const ids = [...classified].sort();
        assert.equal(
          new Set(ids).size,
          ids.length,
          `${phase.rubric.phaseId} classifies an activity twice`
        );
        const activities = Object.keys(IDE_COURSES[course.id].document.activities);
        for (const id of ids) {
          assert.ok(activities.includes(id), `${course.id} classifies ${id}, which is not in the document`);
        }
      }
    }
  });

  it("never calls an activity attested that the authored document does not support", () => {
    /* Every activity the rubric calls attested must really carry the checks
       and the command, or name one of the platform's own catalogues. */
    const catalogue = getCurriculumProvenance();
    for (const course of catalogue.courses) {
      for (const phase of course.phases) {
        for (const id of phase.rubric.attested) {
          const activity = activityById(course.id, id);
          assert.ok(activity, `${course.id} attests ${id}, which is not in the document`);
          const runnable = Array.isArray(activity.checks) && activity.checks.length > 0 &&
            typeof activity.testCommand === "string" && activity.testCommand.trim().length > 0;
          const fromCatalogue =
            (typeof activity.incidentId === "string" && activity.incidentId.length > 0) ||
            (typeof activity.designId === "string" && activity.designId.length > 0);
          assert.ok(
            runnable || fromCatalogue,
            `${course.id} attests ${id}, which nothing in the document lets the platform recompute`
          );
        }
      }
    }
  });

  it("says plainly where a phase rests on the learner's word alone", () => {
    /* The take-home phase is the one the platform cannot re-derive: its
       challenge carries checks but no command for the server to run, so its
       evidence is the learner's own account. The rubric has to say that
       rather than let the phase look verified. */
    const catalogue = getCurriculumProvenance();
    const unverified = catalogue.courses.flatMap((c) => c.phases).filter((p) => p.rubric.attested.length === 0);
    assert.ok(unverified.length > 0, "no phase rests on the learner's word, which is not true");
    for (const phase of unverified) {
      assert.ok(
        phase.rubric.statement.includes("Nothing in this phase is checked by the server."),
        `${phase.rubric.phaseId} does not say that nothing in it is checked`
      );
    }
  });
});

/* The synced document, read from the service's own data, so the assertion is
   against what is shipped rather than against a copy in this file. */
function activityById(courseId, activityId) {
  const entry = IDE_COURSES[courseId];
  return entry?.document?.activities?.[activityId];
}

describe("the provenance over HTTP", () => {
  it("serves the catalogue of courses with their provenance and rubric", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ide/provenance",
      headers: asMesh(),
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.courses.length >= 1);
    assert.ok(typeof body.contentVersion === "string" && body.contentVersion.length > 0);
    const course = body.courses[0];
    assert.ok(course.provenance.author.length > 0);
    assert.ok(Array.isArray(course.phases));
    for (const phase of course.phases) {
      assert.ok(phase.provenance.source.length > 0);
      assert.ok(phase.rubric.statement.length > 0);
    }
  });

  it("gives away no lesson body on that route", async () => {
    const res = await app.inject({ method: "GET", url: "/ide/provenance", headers: asMesh() });
    const text = res.body;
    assert.equal(text.includes("testCommand"), false, "the provenance route leaked a test command");
    assert.equal(text.includes("misconceptions"), false, "the provenance route leaked lesson content");
    assert.equal(text.includes("resources"), false, "the provenance route leaked lesson content");
  });

  it("carries the provenance and the rubric in a phase's own payload", async () => {
    const course = getIdeCourses()[0];
    const manifest = getIdeManifest(course.id);
    const phaseId = manifest.phases[0].id;
    const res = await app.inject({
      method: "GET",
      url: `/ide/phases/${phaseId}`,
      headers: {
        "x-user-id": "u-learner",
        "x-internal-key": MESH_KEY,
        "x-entitled": "1",
        "x-entitled-courses": "*",
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.provenance.phaseId, phaseId);
    assert.equal(body.rubric.phaseId, phaseId);
    assert.equal(body.provenance.reviewer, null);
    assert.ok(body.rubric.statement.length > 0);
  });

  it("keeps the public roadmap a roadmap", async () => {
    const course = getIdeCourses()[0];
    const res = await app.inject({
      method: "GET",
      url: `/ide/manifest?course=${course.id}`,
      headers: asMesh(),
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.manifest.phases.length > 0);
    for (const phase of body.manifest.phases) {
      assert.equal(phase.checks, undefined, "the roadmap leaked checks");
      assert.equal(phase.provenance, undefined, "the roadmap carried provenance");
    }
  });
});
