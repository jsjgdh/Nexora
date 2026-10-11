import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { tutorAskSchema, type TutorAskResponse } from "@nexora/contracts";
import { ApiError, newId, parseOr400, requireUserId } from "@nexora/service-kit";
import { missionById } from "./vendor/missions.js";

const LEVEL_NAMES = ["Nudge", "Concept", "Investigation", "Worked example", "Solution review"];

async function askProvider(prompt: { system: string; user: string }): Promise<string> {
  const endpoint = process.env.NEXORA_AI_URL ?? "";
  const apiKey = process.env.NEXORA_AI_KEY ?? "";
  const model = process.env.NEXORA_AI_MODEL ?? "default";
  if (!endpoint || !apiKey) throw new Error("provider_not_configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 350,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`provider ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty provider response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function registerTutorRoutes(app: FastifyInstance, pool: Pool | null) {
  app.post("/ask", async (req) => {
    const userId = requireUserId(req);
    const body = parseOr400(tutorAskSchema, req.body);
    const mission = missionById(body.missionId);
    if (!mission) throw new ApiError(404, "not_found", "Unknown mission.");

    const started = Date.now();
    let text: string;
    let source: "ai" | "curriculum";
    try {
      text = await askProvider({
        system:
          "You are a Socratic programming tutor. Rules: never output the full corrected solution; " +
          "ask one guiding question first, then give at most one small concrete pointer. " +
          "Only discuss the failing requirements listed by the user — never claim code passes or " +
          "fails beyond what is stated. Keep replies under 120 words, formatted in simple markdown.",
        user:
          `Mission: ${mission.title} — ${mission.tagline}\n` +
          `Objectives: ${mission.objectives.join("; ")}\n` +
          `Hint level requested: ${body.hintLevel} (${LEVEL_NAMES[body.hintLevel - 1]})\n` +
          `Failing requirements: ${body.failingChecks.join("; ") || "none reported"}\n` +
          // The real compiler/runtime output, quoted for the model. This is the
          // whole point of the language layer: explain the error in front of
          // the learner, not a hypothetical one.
          (body.errorOutput
            ? `Output from the learner's last run (compiler or program, verbatim):\n` +
              "```\n" +
              body.errorOutput.slice(0, 2000) +
              "\n```\n" +
              "Explain what this output means and name the one thing to look at. Do not claim the " +
              "program now passes or fails.\n"
            : "") +
          `Learner code:\n${body.code.slice(0, 4000)}`,
      });
      source = "ai";
    } catch {
      // Provider absent or failing: authored ladder, honestly labeled.
      text =
        `**${LEVEL_NAMES[body.hintLevel - 1]} (level ${body.hintLevel} of 5).** ${mission.hintLadder[body.hintLevel - 1]}` +
        (body.failingChecks.length
          ? `\n\nCurrently failing: ${body.failingChecks.map((c) => `“${c}”`).join(", ")}.`
          : "") +
        // Without a model, the compiler's own words are still the best teacher
        // available: quote them rather than pretend nothing is known.
        (body.errorOutput
          ? `\n\nYour last run reported:\n\n\`\`\`\n${body.errorOutput.slice(0, 600)}\n\`\`\``
          : "");
      source = "curriculum";
    }
    const latencyMs = Date.now() - started;

    // Best-effort logging: a logging failure must never fail the answer.
    if (pool) {
      await pool
        .query(
          "INSERT INTO tutor_requests (id, user_id, mission_id, hint_level, source, latency_ms) VALUES ($1,$2,$3,$4,$5,$6)",
          [newId(), userId, body.missionId, body.hintLevel, source, latencyMs]
        )
        .catch((err) => app.log.warn({ err }, "tutor log insert failed"));
    }

    const out: TutorAskResponse = { text, source };
    return out;
  });
}
