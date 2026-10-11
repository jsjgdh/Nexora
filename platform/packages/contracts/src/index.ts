import { z } from "zod";

/* Shared API contracts: request schemas (validated at every edge) and
   response shapes. Single source of truth for gateway ↔ services ↔ clients. */

export interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

/* ---------- auth ---------- */

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(80).optional(),
});
export type RegisterRequest = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export type RefreshRequest = z.infer<typeof refreshSchema>;

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/* ---------- curriculum ---------- */

export interface StageSummary {
  id: string;
  num: number;
  title: string;
  goal: string;
  description: string;
  missionIds: string[];
}

export interface MissionSummary {
  id: string;
  stageId: string;
  title: string;
  tagline: string;
  type: string;
  difficulty: number;
  estMinutes: number;
  objectives: string[];
  prereqIds: string[];
  competencyIds: string[];
  isBoss: boolean;
  needsScript: boolean;
}

export interface CurriculumVersion {
  version: string;
  stages: number;
  missions: number;
  diagnosticItems: number;
}

export interface DiagnosticItemPublic {
  id: string;
  competencyId: string;
  skill: string;
  prompt: string;
  code?: string;
  options: string[];
  explanation: string;
}

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
export type ProfileInput = z.infer<typeof profileSchema>;

export const diagnosticResultSchema = z.object({
  itemId: z.string().min(1).max(80),
  selected: z.number().int().min(-1).max(20),
  correct: z.boolean(),
  skipped: z.boolean(),
});
export const diagnosticSubmitSchema = z.object({
  results: diagnosticResultSchema.array().min(1).max(50),
});
export type DiagnosticSubmit = z.infer<typeof diagnosticSubmitSchema>;

export const missionDraftSchema = z.object({
  code: z.string().max(256_000).optional(),
  checksPassed: z.array(z.string().max(80)).max(64).optional(),
  attempts: z.number().int().min(0).max(10_000).optional(),
  hintsUsed: z.number().int().min(0).max(10_000).optional(),
  maxHintLevel: z.number().int().min(0).max(5).optional(),
  questionsAnswered: z.record(z.string(), z.number().int()).optional(),
  questionsCorrect: z.record(z.string(), z.boolean()).optional(),
});
export type MissionDraftInput = z.infer<typeof missionDraftSchema>;

export interface MissionProgressView {
  missionId: string;
  code: string;
  startedAt: string | null;
  attempts: number;
  checksPassed: string[];
  hintsUsed: number;
  maxHintLevel: number;
  questionsAnswered: Record<string, number>;
  questionsCorrect: Record<string, boolean>;
  completedAt: string | null;
  masteredAt: string | null;
  independent: boolean;
  xpAwarded: number;
  contentVersion: string;
}

export interface CompleteResponse {
  completed: boolean;
  mastered: boolean;
  xpGained: number;
  xpTotal: number;
}

export interface RecommendationResponse {
  primaryId: string | null;
  refresherIds: string[];
  reason: string;
  done: boolean;
}

export interface SummaryResponse {
  xp: number;
  completed: number;
  mastered: number;
  skills: { id: string; name: string; level: string; evidenceCount: number }[];
}

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
export type ExecuteRequest = z.infer<typeof executeSchema>;

export interface ExecuteResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  runner: string;
}

export interface ExecutionCapabilities {
  runner: string;
  languages: string[];
  concurrency: number;
  defaultTimeoutMs: number;
}

/* ---------- tutor ---------- */

export const tutorAskSchema = z.object({
  missionId: z.string().min(1).max(80),
  code: z.string().max(32_000).default(""),
  failingChecks: z.array(z.string().max(300)).max(32).default([]),
  hintLevel: z.number().int().min(1).max(5).default(1),
});
export type TutorAskRequest = z.infer<typeof tutorAskSchema>;

export interface TutorAskResponse {
  text: string;
  source: "ai" | "curriculum";
}
