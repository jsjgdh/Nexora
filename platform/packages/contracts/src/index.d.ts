import { z } from "zod";
export interface ErrorEnvelope {
    error: {
        code: string;
        message: string;
        requestId: string;
        details?: unknown;
    };
}
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginRequest = z.infer<typeof loginSchema>;
export declare const refreshSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
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
export declare const profileSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
    goal: z.ZodDefault<z.ZodString>;
    experience: z.ZodDefault<z.ZodString>;
    languages: z.ZodDefault<z.ZodArray<z.ZodString>>;
    tools: z.ZodDefault<z.ZodArray<z.ZodString>>;
    canBuild: z.ZodDefault<z.ZodString>;
    hoursPerWeek: z.ZodDefault<z.ZodString>;
    interests: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ProfileInput = z.infer<typeof profileSchema>;
export declare const diagnosticResultSchema: z.ZodObject<{
    itemId: z.ZodString;
    selected: z.ZodNumber;
    correct: z.ZodBoolean;
    skipped: z.ZodBoolean;
}, z.core.$strip>;
export declare const diagnosticSubmitSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        itemId: z.ZodString;
        selected: z.ZodNumber;
        correct: z.ZodBoolean;
        skipped: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DiagnosticSubmit = z.infer<typeof diagnosticSubmitSchema>;
export declare const missionDraftSchema: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    checksPassed: z.ZodOptional<z.ZodArray<z.ZodString>>;
    attempts: z.ZodOptional<z.ZodNumber>;
    hintsUsed: z.ZodOptional<z.ZodNumber>;
    maxHintLevel: z.ZodOptional<z.ZodNumber>;
    questionsAnswered: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    questionsCorrect: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodBoolean>>;
}, z.core.$strip>;
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
    skills: {
        id: string;
        name: string;
        level: string;
        evidenceCount: number;
    }[];
}
export declare const executeFileSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
}, z.core.$strip>;
export declare const executeLimitsSchema: z.ZodObject<{
    timeoutMs: z.ZodDefault<z.ZodNumber>;
    memoryMb: z.ZodDefault<z.ZodNumber>;
    outputKb: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const executeSchema: z.ZodObject<{
    language: z.ZodEnum<{
        node: "node";
        python: "python";
    }>;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        content: z.ZodString;
    }, z.core.$strip>>;
    command: z.ZodOptional<z.ZodArray<z.ZodString>>;
    stdin: z.ZodDefault<z.ZodString>;
    limits: z.ZodDefault<z.ZodObject<{
        timeoutMs: z.ZodDefault<z.ZodNumber>;
        memoryMb: z.ZodDefault<z.ZodNumber>;
        outputKb: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
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
export declare const tutorAskSchema: z.ZodObject<{
    missionId: z.ZodString;
    code: z.ZodDefault<z.ZodString>;
    failingChecks: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hintLevel: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type TutorAskRequest = z.infer<typeof tutorAskSchema>;
export interface TutorAskResponse {
    text: string;
    source: "ai" | "curriculum";
}
//# sourceMappingURL=index.d.ts.map