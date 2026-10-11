import type { FastifyInstance } from "fastify";
import { ApiError } from "@nexora/service-kit";
import { CONTENT_VERSION } from "./data/version.js";
import {
  getCompetencies,
  getDiagnosticItems,
  getMission,
  getMissions,
  getStages,
  getVersion,
} from "./content.js";

export function registerCurriculumRoutes(app: FastifyInstance) {
  // Every response carries the content version (clients detect stale
  // curriculum) and GETs are edge-cacheable for five minutes.
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Content-Version", CONTENT_VERSION);
    if (req.method === "GET") reply.header("Cache-Control", "public, max-age=300");
    return payload;
  });

  app.get("/version", async () => getVersion());
  app.get("/stages", async () => ({ stages: getStages() }));

  app.get("/missions", async (req) => {
    const q = req.query as { stage?: string; type?: string };
    return { missions: getMissions(q.stage, q.type) };
  });

  app.get("/missions/:id", async (req) => {
    const m = getMission((req.params as { id: string }).id);
    if (!m) throw new ApiError(404, "not_found", "Unknown mission.");
    return { mission: m };
  });

  app.get("/diagnostic/items", async () => ({ items: getDiagnosticItems() }));
  app.get("/competencies", async () => ({ competencies: getCompetencies() }));
}
