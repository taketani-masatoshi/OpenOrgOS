export interface TodayContext {
  tenant: string;
  report_date: string;
  company_name: string;
  decisions: Array<{ id: string; title: string; due_date?: string }>;
  approvals: Array<{ id: string; scope: string; subject: string }>;
  wire_pending_count: number;
  wire_pending: Array<{
    id: string;
    subject: string;
    counterparty: string;
    preview: string;
    status_label: string;
    can_approve?: boolean;
    approval_id?: string;
  }>;
  wire_delivery_pending_count: number;
  wire_delivery: Array<{
    peer_id: string;
    event_id: string;
    attempts: number;
    last_error?: string;
    created_at: string;
  }>;
  witness_pending: Array<{
    id: string;
    subject: string;
    preview: string;
    event_id?: string;
    wire_event_id?: string;
    can_witness?: boolean;
  }>;
  witness_pending_count: number;
  inbox_pending: Array<{ id: string; title: string }>;
  escalate_pending_count: number;
  kpis: Array<{ label: string; value: string }>;
}

export interface OperatorStructured {
  summary: string;
  risks: string[];
  actions: Array<{ priority: "p0" | "p1" | "p2"; label: string; ref_id?: string }>;
  confidence: "high" | "medium" | "low";
}

export interface OperatorTelemetry {
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tool_rounds: number;
  tool_calls: number;
  estimated_cost_usd?: number;
}

export interface OperatorStats {
  stats: {
    count: number;
    ok_count: number;
    latency_p50_ms: number;
    latency_p95_ms: number;
    total_tokens: number;
    total_tool_calls: number;
    estimated_cost_usd?: number;
  };
  recent: Array<{
    at: string;
    model: string;
    latency_ms: number;
    total_tokens: number;
    tool_calls: number;
    ok: boolean;
    estimated_cost_usd?: number;
  }>;
}

export interface HealthInfo {
  ok: boolean;
  service?: string;
  wire_spa?: boolean;
  chat_spa?: boolean;
}

export interface AuthConfig {
  ok: boolean;
  mode: "dev" | "prod";
  dev_login_allowed: boolean;
  prod_adapter?: "oidc" | "webauthn" | "legacy_token";
  legacy_token_allowed?: boolean;
  oidc?: { issuer: string; audience: string; client_id: string };
  webauthn?: { rp_id: string; credential_count: number; registration_allowed?: boolean };
  webauthn_e2e_login?: boolean;
}

export interface AuthUser {
  operator_id: string;
  approver_id: string;
  mode: string;
  permissions?: string[];
}

const fetchOpts: RequestInit = { credentials: "include" };

export async function chatApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...fetchOpts,
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `${path} ${res.status}`);
  }
  return body as T;
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch("/health", fetchOpts);
  if (!res.ok) return { ok: false };
  return res.json() as Promise<HealthInfo>;
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  return chatApi<AuthConfig>("/chat/v1/auth/config");
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/chat/v1/auth/me", fetchOpts);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`auth me ${res.status}`);
  const body = (await res.json()) as { user: AuthUser };
  return body.user;
}

export async function loginDev(body: {
  passkey: string;
  operator_id?: string;
  approver_id?: string;
}): Promise<AuthUser> {
  const res = await chatApi<{ user: AuthUser }>("/chat/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.user;
}

export async function loginProd(body: Record<string, unknown>): Promise<AuthUser> {
  const res = await chatApi<{ user: AuthUser }>("/chat/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.user;
}

export async function fetchToday(): Promise<TodayContext> {
  const res = await fetch("/chat/v1/today", fetchOpts);
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`today ${res.status}`);
  return res.json() as Promise<TodayContext>;
}

export async function fetchOperatorStats(): Promise<OperatorStats> {
  const res = await chatApi<{ ok: boolean } & OperatorStats>("/chat/v1/operator/stats");
  return { stats: res.stats, recent: res.recent };
}

export async function approveWire(
  approvalId: string,
  approverId?: string
): Promise<{ mode?: string; flushed?: number }> {
  return chatApi(`/chat/v1/approvals/${encodeURIComponent(approvalId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ approver_id: approverId, flush: true }),
  });
}

export async function flushWirePending(): Promise<{ flushed: number }> {
  return chatApi("/chat/v1/wire/flush", { method: "POST", body: "{}" });
}

export async function registerWitness(
  eventId: string,
  side: "sent" | "received"
): Promise<Record<string, unknown>> {
  return chatApi("/chat/v1/wire/witness/register", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId, side }),
  });
}

export async function verifyWitness(eventId: string): Promise<Record<string, unknown>> {
  return chatApi("/chat/v1/wire/witness/verify", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId }),
  });
}

export async function flushWitnessPending(): Promise<{ flushed: number }> {
  return chatApi("/chat/v1/wire/witness/flush", { method: "POST", body: "{}" });
}

export async function sendMessage(message: string): Promise<{
  ok: boolean;
  reply: string;
  runtime?: string;
}> {
  const res = await fetch("/chat/v1/message", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json() as Promise<{ ok: boolean; reply: string; runtime?: string }>;
}

export async function sendMessageStream(
  message: string,
  handlers: {
    onDelta: (content: string) => void;
    onDone: (payload: {
      ok: boolean;
      reply: string;
      runtime?: string;
      structured?: OperatorStructured;
      telemetry?: OperatorTelemetry;
    }) => void;
    onError: (error: string) => void;
  }
): Promise<void> {
  const res = await fetch("/chat/v1/message/stream", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`chat stream ${res.status}`);
  if (!res.body) throw new Error("empty stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = JSON.parse(trimmed.slice(5).trim()) as {
          type: string;
          content?: string;
          reply?: string;
          ok?: boolean;
          runtime?: string;
          structured?: OperatorStructured;
          telemetry?: OperatorTelemetry;
          error?: string;
        };
        if (payload.type === "delta" && payload.content) {
          handlers.onDelta(payload.content);
        } else if (payload.type === "done") {
          handlers.onDone({
            ok: payload.ok ?? true,
            reply: payload.reply ?? "",
            runtime: payload.runtime,
            structured: payload.structured,
            telemetry: payload.telemetry,
          });
        } else if (payload.type === "error") {
          handlers.onError(payload.error ?? "stream error");
        }
      }
    }
  }
}
