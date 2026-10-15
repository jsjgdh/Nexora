import type { FastifyInstance } from "fastify";
import { ApiError, requireUserId } from "@nexora/service-kit";
import { IDE_CONTENT_VERSION } from "./data/ide-version.js";
import { getIdeManifest, getIdePhase, getIdeVersion } from "./ide.js";

/* The curriculum service serves the IDE curriculum only: a public roadmap
   (names and tiers, no lesson bodies) and paid phase payloads behind
   entitlement. The browser-classroom endpoints (stages, missions, diagnostic
   items, competencies) are deleted with the classroom — one way to learn, the
   desktop IDE — and this file fails closed on any request for them by not
   defining them. */

/** The gateway's entitlement verdict, injected only after billing confirms an
    active subscription. It is in the gateway's NEVER_FORWARDED set, so a client
    cannot send it; its absence on a paid route means the request was not blessed
    by the entitlement gate. */
const ENTITLED_HEADER = "x-entitled";

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
  app.get("/ide/version", async () => getIdeVersion());
  app.get("/ide/manifest", async () => ({ manifest: getIdeManifest() }));

  /* Paid: one phase and exactly the activities it reaches. Two floors, both
     required, in this order:
       - x-user-id (401 without): the gateway injects it after verifying the
         learner's token. Missing means the request never came through auth.
       - x-entitled (402 without): the gateway injects it only after billing
         confirms an active subscription. Missing means signed in, not subscribed.
     The gateway denies a non-entitled caller before it reaches here, so the
     x-entitled floor is defense in depth: a paid payload cannot leave this
     service on a request the entitlement gate did not bless, even one forged
     inside the mesh. The two codes are distinct on purpose — the extension has
     to tell "sign in" from "subscribe" without parsing prose. */
  app.get("/ide/phases/:id", async (req) => {
    requireUserId(req);
    requireEntitled(req);
    const id = (req.params as { id: string }).id;
    const payload = getIdePhase(id);
    if (!payload) throw new ApiError(404, "not_found", `Unknown phase ${id}.`);
    return payload;
  });
}
