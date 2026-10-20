import { env } from "$env/dynamic/public";
import { session } from "$lib/session.svelte";

/* The operator's console, talking to the platform.
 *
 * The console is a client-driven surface, like the account home: the access
 * token is in memory and never in storage, and every call carries it. The
 * operator's identity is never sent from here. The platform reads it from
 * the token the gateway verified, so a client cannot say who it is.
 *
 * A 401 is answered by asking the session for a fresh token once, the same
 * way the rest of the app does it, because an expired credential must not
 * read as a failure of the console. */

const BASE = ((env.PUBLIC_API_URL as string | undefined) ?? "").replace(/\/$/, "");

export const adminApiConfigured = BASE.length > 0;

export interface AdminError extends Error {
  status?: number;
  code?: string;
}

async function call<T>(
  path: string,
  opts: { method?: string; body?: unknown; retry?: boolean } = {}
): Promise<T> {
  if (!adminApiConfigured) throw new Error("The platform is not connected in this build.");
  const send = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    headers.authorization = `Bearer ${token}`;
    return fetch(`${BASE}/api/auth/admin${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  };
  const token = await session.resolveToken();
  if (!token) throw Object.assign(new Error("No session."), { code: "no_session" });
  let res = await send(token);
  if (res.status === 401 && opts.retry !== false) {
    const renewed = await session.refresh();
    if (renewed && renewed !== token) res = await send(renewed);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* a non-JSON edge: the status is still the answer */
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    const failure = new Error(err?.message ?? `Request failed (${res.status})`) as AdminError;
    failure.status = res.status;
    failure.code = err?.code ?? "request_failed";
    throw failure;
  }
  return json as T;
}

export interface AdminAccountRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string | null;
  provider: string;
  emailVerified: boolean;
  sessions: number;
  proofs: number;
  requests: number;
}

export interface AdminAccountDetail {
  account: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string | null;
    provider: string;
    emailVerified: boolean;
  };
  sessions: { id: string; createdAt: string | null; expiresAt: string | null; active: boolean }[];
  proofs: { competencyId: string; level: string; kind: string; issuedAt: string | null }[];
  consents: {
    document: string;
    version: string;
    purpose: string;
    basis: string;
    acceptedAt: string | null;
    withdrawnAt: string | null;
  }[];
  requests: {
    id: string;
    kind: string;
    status: string;
    detail: string;
    createdAt: string | null;
    dueAt: string | null;
    resolvedAt: string | null;
    resolution: string | null;
  }[];
  cohorts: { id: string; name: string; courseId: string; term: string; status: string }[];
}

export interface AdminOverview {
  operator: { id: string; email: string | null; name: string | null };
  counts: {
    accounts: number;
    activeSessions: number;
    proofs: number;
    operators: number;
    openRightsRequests: number;
    pendingErasures: number;
    pendingProcessorDeletions: number;
  };
  configuration: {
    authMode: "local" | "clerk";
    mailConfigured: boolean;
    meshKeyPresent: boolean;
    cohortsAvailable: boolean;
  };
  recentActions: { id: string; action: string; target: string | null; detail: string | null; createdAt: string | null }[];
}

export interface AdminRights {
  requests: {
    id: string;
    kind: string;
    status: string;
    detail: string;
    email: string | null;
    createdAt: string | null;
    dueAt: string | null;
    resolvedAt: string | null;
    resolution: string | null;
  }[];
  erasures: { id: string; completedAt: string | null; reason: string | null }[];
  processorDeletions: { id: string; provider: string; email: string | null; completedAt: string | null; note: string | null }[];
}

export interface AdminOperator {
  id: string;
  email: string;
  name: string | null;
  role: string;
  grantedAt: string | null;
  grantedBy: string | null;
}

export interface AdminAction {
  id: string;
  operatorId: string;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string | null;
}

export const adminApi = {
  overview: () => call<AdminOverview>("/overview"),
  accounts: (q: string) => call<{ accounts: AdminAccountRow[] }>(`/accounts?q=${encodeURIComponent(q)}`),
  account: (id: string) => call<AdminAccountDetail>(`/accounts/${encodeURIComponent(id)}`),
  endSessions: (id: string) =>
    call<{ ok: boolean; sessions: number }>(`/accounts/${encodeURIComponent(id)}/sessions/revoke`, {
      method: "POST",
    }),
  rights: () => call<AdminRights>("/rights"),
  operators: () => call<{ operators: AdminOperator[] }>("/operators"),
  grant: (email: string) =>
    call<{ operator: AdminOperator }>("/operators", { method: "POST", body: { email } }),
  revoke: (email: string) =>
    call<{ ok: boolean; removed: number }>("/operators/revoke", { method: "POST", body: { email } }),
  actions: () => call<{ actions: AdminAction[] }>("/actions"),
};
