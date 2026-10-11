import { z } from "zod";
/* ---------- auth ---------- */
export const registerSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(10).max(200),
    name: z.string().min(1).max(80).optional(),
});
export const loginSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
});
export const refreshSchema = z.object({
    refreshToken: z.string().min(32).max(512),
});
/* ---------- progress ---------- */
export const profileSchema = z.object({
    name: z.string().max(80).default(""),
    goal: z.string().max(40).default(""),
    experience: z.string().max(40).default(""),
    languages: z.array(z.string().max(40)).max(30).default([]),
    tools: z.array(z.string().max(40)).max(30).default([]),
    canBuild: z.string().max(500).default(""),
    hoursPerWeek: z.string().max(40).default(""),
    interests: z.array(z.string().max(60)).max(30).default([]),
});
export const diagnosticResultSchema = z.object({
    itemId: z.string().min(1).max(80),
    selected: z.number().int().min(-1).max(20),
    correct: z.boolean(),
    skipped: z.boolean(),
});
export const diagnosticSubmitSchema = z.object({
    results: diagnosticResultSchema.array().min(1).max(50),
});
export const missionDraftSchema = z.object({
    code: z.string().max(256_000).optional(),
    checksPassed: z.array(z.string().max(80)).max(64).optional(),
    attempts: z.number().int().min(0).max(10_000).optional(),
    hintsUsed: z.number().int().min(0).max(10_000).optional(),
    maxHintLevel: z.number().int().min(0).max(5).optional(),
    questionsAnswered: z.record(z.string(), z.number().int()).optional(),
    questionsCorrect: z.record(z.string(), z.boolean()).optional(),
});
/* ---------- execution ---------- */
export const executeFileSchema = z.object({
    path: z.string().min(1).max(200),
    content: z.string().max(256_000),
});
export const executeLimitsSchema = z.object({
    timeoutMs: z.number().int().min(100).max(30_000).default(8000),
    memoryMb: z.number().int().min(16).max(1024).default(128),
    outputKb: z.number().int().min(1).max(1024).default(64),
});
export const executeSchema = z.object({
    language: z.enum(["node", "python"]),
    files: executeFileSchema.array().min(1).max(32),
    command: z.array(z.string().max(200)).min(1).max(8).optional(),
    stdin: z.string().max(64_000).default(""),
    limits: executeLimitsSchema.default({}),
});
/* ---------- tutor ---------- */
export const tutorAskSchema = z.object({
    missionId: z.string().min(1).max(80),
    code: z.string().max(32_000).default(""),
    failingChecks: z.array(z.string().max(300)).max(32).default([]),
    hintLevel: z.number().int().min(1).max(5).default(1),
});
//# sourceMappingURL=index.js.map