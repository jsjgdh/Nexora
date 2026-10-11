import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { missionById } from "$lib/missions";

/* Provider-agnostic tutor service (PRD §13.1).
   - Assembles context from the mission, the learner's code, and the
     failing checks — never invents test results.
   - If NEXORA_AI_URL + NEXORA_AI_KEY are configured, forwards to an
     OpenAI-compatible chat endpoint; otherwise falls back to the authored
     hint ladder so the product works fully offline. */

const LEVEL_NAMES = ["Nudge", "Concept", "Investigation", "Worked example", "Solution review"];

export const POST: RequestHandler = async ({ request }) => {
  let body: {
    missionId?: string;
    code?: string;
    failingChecks?: string[];
    errorOutput?: string;
    hintLevel?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ text: "Invalid request.", source: "error" }, { status: 400 });
  }

  const mission = body.missionId ? missionById(body.missionId) : undefined;
  if (!mission) {
    return json({ text: "Unknown mission.", source: "error" }, { status: 404 });
  }
  const level = Math.min(Math.max(body.hintLevel ?? 1, 1), 5);
  const ladderText = mission.hintLadder[level - 1];

  const endpoint = env.NEXORA_AI_URL;
  const apiKey = env.NEXORA_AI_KEY;
  const model = env.NEXORA_AI_MODEL ?? "default";

  if (!endpoint || !apiKey) {
    return json({
      text:
        `**${LEVEL_NAMES[level - 1]} (level ${level} of 5).** ${ladderText}` +
        (body.failingChecks?.length
          ? `\n\nCurrently failing: ${body.failingChecks.map((c) => `“${c}”`).join(", ")}.`
          : "") +
        // No model configured: quote the compiler rather than pretend we saw
        // nothing. The learner's error is the most useful thing in the room.
        (body.errorOutput
          ? `\n\nYour last run reported:\n\n\`\`\`\n${body.errorOutput.slice(0, 600)}\n\`\`\``
          : ""),
      source: "curriculum",
    });
  }

  const code = (body.code ?? "").slice(0, 4000);
  const system =
    "You are a Socratic programming tutor for beginners learning to write and debug code. " +
    "Rules: never output the full corrected solution; ask one guiding question first, then give at most one small concrete pointer. " +
    "Only discuss the failing requirements listed by the user — never claim code passes or fails beyond what is stated. " +
    "Keep replies under 120 words, formatted in simple markdown.";
  const user =
    `Mission: ${mission.title} — ${mission.tagline}\n` +
    `Objectives: ${mission.objectives.join("; ")}\n` +
    `Hint level requested: ${level} (${LEVEL_NAMES[level - 1]})\n` +
    `Failing requirements: ${(body.failingChecks ?? []).join("; ") || "none reported"}\n` +
    (body.errorOutput
      ? `Output from the learner's last run (compiler or program, verbatim):\n` +
        "```\n" +
        body.errorOutput.slice(0, 2000) +
        "\n```\n" +
        "Explain what this output means and name the one thing to look at. Do not claim the " +
        "program now passes or fails.\n"
      : "") +
    `Learner code:\n${code}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 350,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`provider ${res.status}`);
    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty provider response");
    return json({ text, source: "ai" });
  } catch {
    // Provider failure must never block learning — fall back to authored hints.
    return json({
      text: `**${LEVEL_NAMES[level - 1]} (level ${level} of 5).** ${ladderText}`,
      source: "curriculum",
    });
  }
};
