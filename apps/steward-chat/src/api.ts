import { setOrgBudgetSnapshot } from "./orgBudgetSnapshot";

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
  summary?: string;
  risks?: string[];
  actions?: Array<{
    priority: "p0" | "p1" | "p2";
    label: string;
    ref_id?: string;
  }>;
  confidence?: "high" | "medium" | "low";
  command_plan?: CommandPlan;
  command_run?: CommandRunResult;
  work_order_ids?: string[];
  tower_plan?: {
    plan_id: string;
    message: string;
    status: string;
    reply_preview?: string;
    assignment?: {
      work_kind?: string;
      assignee_employee_id?: string;
      due_date?: string;
      to_agent?: string;
      needs_ceo_pick?: boolean;
      candidate_employee_ids?: string[];
      judgment_only?: boolean;
    };
    work_order_ids?: string[];
  };
  [key: string]: unknown;
}

export type CommandKind = "read" | "write" | "approval";

export interface CommandCandidate {
  skill_id: string;
  label: string;
  cli_display: string;
  kind: CommandKind;
  permission: string;
  score: number;
  matched_by: string[];
}

export interface CommandPlan {
  plan_id: string;
  status:
    | "ready"
    | "needs_confirmation"
    | "needs_args"
    | "ambiguous"
    | "approval_gate"
    | "forbidden"
    | "not_found";
  skill_id?: string;
  label?: string;
  cli_display?: string;
  kind?: CommandKind;
  permission?: string;
  args?: Record<string, string | number | boolean | null>;
  missing_args?: string[];
  candidates?: CommandCandidate[];
  message?: string;
}

export interface CommandRunResult {
  ok: boolean;
  plan_id: string;
  skill_id?: string;
  output?: string;
  error?: string;
  cli_display?: string;
}

export interface CommandCatalogEntry {
  skill_id: string;
  label: string;
  description: string;
  cli_command?: string;
  kind: CommandKind;
  permission: string;
  args: Array<{ name: string; type: string; required: boolean }>;
}

export async function fetchCommands(): Promise<CommandCatalogEntry[]> {
  const res = await chatApi<{ ok: boolean; commands: CommandCatalogEntry[] }>(
    "/chat/v1/commands",
  );
  return res.commands;
}

export async function previewCommand(body: {
  message: string;
  skill_id?: string;
  args?: Record<string, string | number | boolean | null>;
}): Promise<CommandPlan> {
  const res = await chatApi<{ ok: boolean; plan: CommandPlan }>(
    "/chat/v1/commands/preview",
    { method: "POST", body: JSON.stringify(body) },
  );
  return res.plan;
}

export async function runCommand(
  planId: string,
  body?: {
    args?: Record<string, string | number | boolean | null>;
    confirmed?: boolean;
  },
): Promise<{ result: CommandRunResult; plan?: CommandPlan }> {
  const res = await chatApi<{
    ok: boolean;
    result: CommandRunResult;
    plan?: CommandPlan;
  }>(`/chat/v1/commands/${encodeURIComponent(planId)}/run`, {
    method: "POST",
    body: JSON.stringify(body ?? { confirmed: true }),
  });
  return { result: res.result, plan: res.plan };
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

export interface LlmDashboard {
  mode: "offline" | "economy" | "premium";
  budget: {
    state: string;
    spentJpy: number;
    monthlyLimitJpy: number;
    perRequestLimitJpy: number;
  };
  metrics: {
    requests: number;
    total_cost_jpy: number;
    average_cost_jpy: number;
    average_latency_ms: number;
    local_ratio: number;
    fallback_rate: number;
    quality_failure_rate: number;
    approval_pending: number;
  };
  models: Array<{
    id: string;
    provider: string;
    model: string;
    tier: number;
    local: boolean;
    enabled: boolean;
  }>;
  budgets: Array<{
    scope: string;
    id: string;
    monthly_limit_jpy: number;
    per_request_limit_jpy: number;
    warning_threshold_percent: number;
    approval_threshold_percent: number;
    hard_stop_percent: number;
  }>;
  approvals: Array<{
    request_id: string;
    task_type: string;
    model_id: string;
    estimated_cost_jpy: number;
    reason: string;
  }>;
  anomalies: Array<{ code: string; severity: string; message: string }>;
  audit: { ok: boolean; events: number; error?: string };
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
  webauthn?: {
    rp_id: string;
    credential_count: number;
    settlement_count?: number;
    registration_allowed?: boolean;
    settlement_registration_allowed?: boolean;
    additional_login_registration_allowed?: boolean;
    login_registration_requires_session?: boolean;
    login_registration_bootstrap?: boolean;
    bootstrap_token_required?: boolean;
    approve_origin?: string;
    origin?: string;
  };
  webauthn_e2e_login?: boolean;
  community_handoff?: boolean;
}

export interface AuthUser {
  operator_id: string;
  approver_id: string;
  mode: string;
  permissions?: string[];
  /** Employee seat: only the claim desk is reachable. */
  claim_only?: boolean;
}

/** Employee claim desk: own envelope and own claims only. */
export interface ClaimDeskPayload {
  ok: true;
  fiscal_year?: string;
  claims_revision: string;
  person_id: string;
  display_name: string;
  org_unit_id: string;
  allocation_yen: number;
  actual_yen: number;
  remaining_yen: number;
  categories: Array<{
    account_code: string;
    account_name: string;
    allocation_yen: number;
    actual_yen: number;
    remaining_yen: number;
  }>;
  claims: Array<{
    claim_id: string;
    status: string;
    amount_yen: number;
    account_code: string;
    account_name: string;
    recipient_name?: string;
    transaction_date?: string;
    due_on?: string;
    reject_reason?: string;
  }>;
}

export async function fetchClaimDesk(): Promise<ClaimDeskPayload> {
  return chatApi<ClaimDeskPayload>("/chat/v1/org/budget/expense-claim/desk");
}

const fetchOpts: RequestInit = { credentials: "include" };

export class ChatApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly currentRevision?: string;
  readonly expectedRevision?: string;

  constructor(
    message: string,
    opts: {
      status: number;
      code?: string;
      currentRevision?: string;
      expectedRevision?: string;
    },
  ) {
    super(message);
    this.name = "ChatApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.currentRevision = opts.currentRevision;
    this.expectedRevision = opts.expectedRevision;
  }
}

export function isBudgetRevisionConflict(
  error: unknown,
): error is ChatApiError {
  return error instanceof ChatApiError && error.code === "revision_conflict";
}

export async function chatApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...fetchOpts,
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    current_revision?: string;
    expected_revision?: string;
  };
  if (!res.ok) {
    throw new ChatApiError(body.error ?? `${path} ${res.status}`, {
      status: res.status,
      code: body.code,
      currentRevision: body.current_revision,
      expectedRevision: body.expected_revision,
    });
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

export async function logoutChat(): Promise<void> {
  await chatApi("/chat/v1/auth/logout", { method: "POST", body: "{}" });
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

export async function loginProd(
  body: Record<string, unknown>,
): Promise<AuthUser> {
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

export type AssigneeKind = "employee" | "guest" | "ai" | "unassigned";

export type ExecutiveAttentionItem = {
  id: string;
  kind: "customer" | "mail" | "scheduling" | "ceo_question" | "approval" | "wire";
  title: string;
  status: string;
  href: string;
  severity?: "p0" | "p1" | "p2";
};

export type ExecutiveGapRow = {
  id: string;
  title: string;
  actual_formatted: string;
  target_formatted: string | null;
  target_missing: boolean;
  rag: "green" | "amber" | "red" | "unknown";
  delta_pct?: number | null;
  href: string;
};

export type ExecutiveWorkItem = {
  id: string;
  root_id: string;
  title: string;
  status: string;
  assignee_kind: AssigneeKind;
  assignee_label?: string;
  agent?: string;
  due_date?: string;
  href: string;
};

export type ExecutiveHome = {
  ok: true;
  tenant: string;
  report_date: string;
  company_name: string;
  attention: ExecutiveAttentionItem[];
  attention_count: number;
  gaps: ExecutiveGapRow[];
  gap_summary: {
    green: number;
    amber: number;
    red: number;
    unknown: number;
    target_missing: number;
  };
  work: {
    employee: ExecutiveWorkItem[];
    guest: ExecutiveWorkItem[];
    ai: ExecutiveWorkItem[];
    unassigned: ExecutiveWorkItem[];
  };
  work_open_count: number;
  finance_runway_months?: number | null;
  finance_cash_balance?: number | null;
  agent_summaries?: Array<{ path: string; label: string }>;
  variance?: {
    fiscal_year: string;
    plan_total: number;
    actual_total: number;
    delta_total: number;
    href: string;
  };
};

export async function fetchExecutiveHome(): Promise<ExecutiveHome> {
  return chatApi<ExecutiveHome>("/chat/v1/executive/home");
}

export async function fetchOperatorStats(): Promise<OperatorStats> {
  const res = await chatApi<{ ok: boolean } & OperatorStats>(
    "/chat/v1/operator/stats",
  );
  return { stats: res.stats, recent: res.recent };
}

export async function fetchLlmDashboard(): Promise<LlmDashboard> {
  return chatApi<{ ok: boolean } & LlmDashboard>("/chat/v1/llm/dashboard");
}

export async function updateLlmBudget(
  budget: LlmDashboard["budgets"][number],
): Promise<void> {
  await chatApi(
    `/chat/v1/llm/budgets/${encodeURIComponent(budget.scope)}/${encodeURIComponent(budget.id)}`,
    { method: "PUT", body: JSON.stringify(budget) },
  );
}

export async function disableLlmModel(modelId: string): Promise<void> {
  await chatApi(`/chat/v1/llm/models/${encodeURIComponent(modelId)}/disable`, {
    method: "POST",
    body: "{}",
  });
}

export type LlmWorkerTier = "local" | "cloud";
export type LlmWorkerProvider = "openai-compatible" | "anthropic";

export interface LlmWorkerRow {
  id: string;
  label: string;
  tier: LlmWorkerTier;
  provider: LlmWorkerProvider;
  base_url: string;
  resolved_base_url?: string;
  model: string;
  max_inflight: number;
  enabled: boolean;
  api_key_env: string;
  supports_tools?: boolean;
  key_configured: boolean;
  healthy: boolean;
  inflight: number;
  avg_latency_ms: number;
  last_error: string | null;
  last_ok_at: string | null;
}

export interface LlmWorkersSnapshot {
  file_present: boolean;
  queue: {
    max_queue: number;
    queue_timeout_ms: number;
    cloud_overflow: {
      enabled: boolean;
      wait_threshold_ms: number;
      max_inflight: number;
    };
    queued: number;
    inflight: number;
  };
  workers: LlmWorkerRow[];
}

export async function fetchLlmWorkers(opts?: {
  probe?: boolean;
}): Promise<LlmWorkersSnapshot> {
  const q = opts?.probe ? "?probe=1" : "";
  const res = await chatApi<{ ok: boolean } & LlmWorkersSnapshot>(
    `/chat/v1/llm/workers${q}`,
  );
  return {
    file_present: res.file_present,
    queue: res.queue,
    workers: res.workers,
  };
}

export async function updateLlmWorkers(body: {
  schema: "orgos.llm.workers.v1";
  queue: {
    max_queue: number;
    queue_timeout_ms: number;
    cloud_overflow: {
      enabled: boolean;
      wait_threshold_ms: number;
      max_inflight: number;
    };
  };
  workers: Array<{
    id: string;
    label: string;
    tier: LlmWorkerTier;
    provider: LlmWorkerProvider;
    base_url: string;
    model: string;
    max_inflight: number;
    enabled: boolean;
    api_key_env: string;
  }>;
}): Promise<LlmWorkersSnapshot> {
  const res = await chatApi<{ ok: boolean } & LlmWorkersSnapshot>(
    "/chat/v1/llm/workers",
    { method: "PUT", body: JSON.stringify(body) },
  );
  return {
    file_present: res.file_present,
    queue: res.queue,
    workers: res.workers,
  };
}

export async function probeLlmWorker(
  workerId: string,
): Promise<{ worker_id: string; probe: { ok: boolean; detail: string; latency_ms: number } }> {
  return chatApi(
    `/chat/v1/llm/workers/${encodeURIComponent(workerId)}/probe`,
    { method: "POST", body: "{}" },
  );
}

export async function decideLlmRequest(
  requestId: string,
  decision: "approve" | "reject",
): Promise<void> {
  await chatApi(
    `/chat/v1/llm/requests/${encodeURIComponent(requestId)}/${decision}`,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export type BudgetDelegationScope = "company" | "department" | "person";
export type BudgetMutability = "derived" | "planned" | "allocatable";

export interface OrgBudgetCategoryRow {
  account_code: string;
  account_name: string;
  budget_delegation: BudgetDelegationScope;
  person_allocatable: boolean;
  allocation_yen: number;
  actual_yen: number;
  variance_yen: number;
}

export interface OrgBudgetReferenceCategory {
  account_code: string;
  account_name: string;
  budget_delegation: BudgetDelegationScope;
  budget_mutability: BudgetMutability;
  reference_yen?: number;
  source_path?: string;
}

export interface OrgBudgetDepartment {
  org_unit_id: string;
  org_unit_label: string;
  head_operator_id: string;
  head_label: string;
  allocation_yen: number;
  member_allocated_yen: number;
  committed_yen: number;
  available_to_delegate_yen: number;
  authority_plan_man?: number;
  baseline_yen?: number;
  adjustment_min_yen?: number;
  adjustment_max_yen?: number;
  within_adjustment_range?: boolean;
  actual_yen: number;
  variance_yen: number;
  burn_pct: number | null;
  categories: OrgBudgetCategoryRow[];
  members: Array<{
    person_id: string;
    display_name: string;
    display_source: "employees" | "workforce" | "org_chart" | "legacy";
    person_type: "employee" | "contractor" | "other";
    employee_id?: string;
    allocation_yen: number;
    committed_yen: number;
    available_yen: number;
    actual_yen: number;
    variance_yen: number;
    allocation_status: "within_budget" | "over_budget";
    categories: OrgBudgetCategoryRow[];
    purpose?: string;
  }>;
  candidate_people: Array<{
    person_id: string;
    display_name: string;
    display_source: "employees" | "workforce" | "org_chart";
    person_type: "employee" | "contractor" | "other";
  }>;
}

export interface OrgBudgetPayload {
  ok: boolean;
  initialized: boolean;
  fiscal_year?: string;
  active_fiscal_year?: string;
  available_fiscal_years?: string[];
  fy_is_active?: boolean;
  /** Last budget event id (BDE-######) or "0" — optimistic concurrency token. */
  revision?: string;
  updated_at?: string | null;
  event_count?: number;
  /** Expense-claims YAML token (decimal string). */
  claims_revision?: string;
  currency?: "JPY";
  summary?: {
    company_budget_yen: number;
    department_allocated_yen: number;
    company_unallocated_yen: number;
    company_category_allocated_yen?: number;
    company_category_unallocated_yen?: number;
  };
  planning: {
    baseline_yen?: number;
    business_plan_status: string;
    approval_id?: string;
    approved_at?: string;
    has_board_evidence: boolean;
    is_fixed: boolean;
    /** Unapproved plan → envelope increases blocked (ADR 0027). */
    increases_locked?: boolean;
    /** @deprecated Same as increases_locked (true = 増額不可). */
    adjustments_locked: boolean;
    totals_require_approval?: boolean;
    source: string;
    company_adjustment_pct: number;
    company_min_yen?: number;
    company_max_yen?: number;
    company_within_adjustment_range?: boolean;
    department_adjustment_pct: number;
    require_adjustment_reference: boolean;
    person_allocation_mode: "strict";
  };
  plan_reference: {
    fiscal_year: string;
    horizon_base_fy?: string;
    business_plan_status: string;
    business_plan_revenue_yen?: number;
    business_plan_operating_profit_yen?: number;
    business_plan_investment_yen?: number;
    revenue_plan_yen?: number;
    expense_plan_yen?: number;
    profit_plan_operating_yen?: number;
    profit_plan_sga_yen?: number;
    period_from?: string;
    period_to?: string;
    revenue_lines: Array<{
      id: string;
      name: string;
      amount_yen: number;
      property_id?: string;
      business_unit_id?: string;
    }>;
    expense_lines: Array<{
      id: string;
      name: string;
      amount_yen: number;
      property_id?: string;
      business_unit_id?: string;
    }>;
    revenue_units: Array<{
      business_unit_id: string;
      label: string;
      kind: string;
      is_corporate: boolean;
      total_yen: number;
      lines: Array<{
        id: string;
        name: string;
        amount_yen: number;
        property_id?: string;
        business_unit_id?: string;
      }>;
      line_groups?: Array<{
        group_id: "officer_compensation" | "personnel" | "other";
        label: string;
        total_yen: number;
        lines: Array<{
          id: string;
          name: string;
          amount_yen: number;
          property_id?: string;
          business_unit_id?: string;
        }>;
      }>;
      personnel_subtotal_yen?: number;
    }>;
    expense_units: Array<{
      business_unit_id: string;
      label: string;
      kind: string;
      is_corporate: boolean;
      total_yen: number;
      lines: Array<{
        id: string;
        name: string;
        amount_yen: number;
        property_id?: string;
        business_unit_id?: string;
      }>;
      line_groups?: Array<{
        group_id: "officer_compensation" | "personnel" | "other";
        label: string;
        total_yen: number;
        lines: Array<{
          id: string;
          name: string;
          amount_yen: number;
          property_id?: string;
          business_unit_id?: string;
        }>;
      }>;
      personnel_subtotal_yen?: number;
    }>;
    consistency: {
      revenue_matches_business_plan: boolean | null;
      expense_matches_profit_sga: boolean | null;
    };
  };
  outlook_reference: {
    fiscal_year: string;
    as_of_month: string;
    status: "missing" | "draft" | "published";
    currency: string;
    method: "ytd_actual_plus_remaining";
    notes?: string;
    amount_basis_notes: string;
    file_path: string;
    file_exists: boolean;
    revision: string;
    updated_at: string | null;
    event_count: number;
    plan: { revenue_yen: number; opex_yen: number; capex_yen: number };
    baselines: {
      expense_plan_opex_yen: number;
      yojitsu_plan_opex_yen: number;
      expense_plan_vs_yojitsu_opex_yen: number;
      note: string;
    };
    actual_ytd: {
      revenue_yen: number;
      opex_yen: number;
      capex_yen: number;
      depreciation_yen: number;
      depreciation_plan_fallback: boolean;
    };
    outlook: {
      revenue_yen: number;
      opex_yen: number;
      capex_yen: number;
      depreciation_yen: number;
      remaining_source: "outlook" | "plan_fallback" | "mixed" | "none";
      operating_profit_proxy_yen: number;
    };
    gaps: {
      outlook_vs_plan_opex_yen: number;
      outlook_vs_plan_revenue_yen: number;
      outlook_vs_envelope_opex_yen: number | null;
      outlook_vs_plan_capex_yen: number;
      drift_alert: boolean;
      drift_alert_pct: number;
      drift_direction: "over" | "under" | "none";
      envelope_alert: boolean;
    };
    envelope_yen: number | null;
    months: Array<{
      month: string;
      role: "actual" | "actual_missing" | "outlook" | "plan_fallback";
      revenue_yen: number;
      opex_yen: number;
      capex_yen: number;
      depreciation_yen: number;
      depreciation_source?:
        "monthly" | "yojitsu_actual" | "yojitsu_plan_fallback";
    }>;
    department_outlook: Array<{
      org_unit_id: string;
      opex_yen: number;
      revenue_yen?: number;
      notes?: string;
    }>;
    department_consistency: {
      department_opex_sum_yen: number;
      company_opex_yen: number;
      delta_yen: number;
      alert: boolean;
    };
    needs_republish: boolean;
    last_edited_by_operator_id?: string | null;
    published_at?: string | null;
    published_by_operator_id?: string | null;
  };
  /** 全社人件費レーン（参照のみ）。個人経費枠には含めない。 */
  payroll_reference?: {
    account_code: string;
    source_payroll: string;
    fiscal_year: string;
    period_from: string;
    period_to: string;
    period_source: string;
    expected_monthly_yen: number;
    officer_monthly_yen: number;
    employee_monthly_yen: number;
    officers: Array<{
      name: string;
      role?: string;
      employee_id?: string;
      monthly_yen: number;
    }>;
    employee_ids: string[];
    actual_months: number;
    empty_actual_months: number;
    actual_booked_yen: number;
    actual_expected_yen: number;
    actual_variance_yen: number;
    ok: boolean;
    notes: string[];
    months: Array<{
      month: string;
      basis: string;
      booked_yen: number;
      expected_yen: number;
      variance_yen: number;
    }>;
  };
  /** 個人スコープ人件費（person_id キー）。個人予実はこちらを使う。 */
  payroll_by_person?: Record<
    string,
    {
      person_id: string;
      employee_id?: string;
      kind: "officer" | "employee" | "none";
      display_name: string;
      role?: string;
      expected_monthly_yen: number;
      fiscal_year?: string;
      period_from?: string;
      period_to?: string;
      actual_months: number;
      empty_actual_months: number;
      actual_booked_yen: number;
      actual_expected_yen: number;
      actual_variance_yen: number;
      ok: boolean;
      account_code: string;
      months: Array<{
        month: string;
        basis: string;
        booked_yen: number;
        expected_yen: number;
        variance_yen: number;
      }>;
    }
  >;
  outlook_operators: Array<{
    operator_id: string;
    display_name: string;
    role: string;
  }>;
  actuals?: {
    actual_yen: number;
    allocated_actual_yen: number;
    unallocated_actual_yen: number;
    actual_months: number;
    actual_as_of?: string;
  };
  budget_categories?: Array<{
    account_code: string;
    account_name: string;
    budget_delegation: BudgetDelegationScope;
    budget_mutability?: BudgetMutability;
    person_allocatable: boolean;
  }>;
  reference_categories?: OrgBudgetReferenceCategory[];
  company_categories?: OrgBudgetCategoryRow[];
  sources?: Array<{
    label: string;
    path: string;
    status: "valid" | "missing";
    record_count: number;
    detail: string;
  }>;
  departments?: OrgBudgetDepartment[];
  events?: Array<{
    event_id: string;
    action: string;
    actor_operator_id: string;
    org_unit_id?: string;
    target_operator_id?: string;
    target_person_id?: string;
    account_code?: string;
    amount_yen: number;
    reference?: string;
    occurred_at: string;
  }>;
  pending_changes?: Array<{
    change_id: string;
    approval_id: string;
    kind: "company_total" | "department_total";
    amount_yen: number;
    org_unit_id?: string;
    reference?: string;
    escalation?: "within_policy" | "beyond_policy";
    board_event_id?: string;
    proposed_by_operator_id: string;
    proposed_at: string;
    status: "pending" | "applied" | "superseded";
  }>;
  expense_claims?: Array<{
    claim_id: string;
    /** Per-claim optimistic concurrency token (decimal string or number). */
    claim_revision?: number | string;
    status: string;
    gate?: string;
    person_id: string;
    org_unit_id: string;
    account_code: string;
    allocations?: Array<{
      account_code: string;
      amount_yen: number;
      org_unit_id: string;
      person_id?: string;
      line_index?: number;
      description?: string;
    }>;
    amount_yen: number;
    receipt_id: string;
    approval_id?: string;
    proposed_by: string;
    proposed_at: string;
    issuer_org_id: string;
    wire_ready: boolean;
    wire_claim_event_id?: string;
    notes?: string;
    monthly_ref?: { month: string; note?: string };
    recipient_name?: string;
    transaction_date?: string;
    deadline_status?: "on_time" | "late";
    days_after_transaction?: number;
    account_suggestion?: {
      account_code: string;
      confidence: "high";
      reasons: string[];
    };
    invoice_verification?: {
      status: "verified" | "format_only";
      verified_as_of?: string;
      source_ref?: string;
      warning?: string;
    };
    board_event_id?: string;
    co_approved_by?: string;
    reject_reason?: string;
    rejected_by?: string;
    rejected_at?: string;
    reimbursement?: {
      status: string;
      amount_yen?: number;
      requested_at?: string;
      /** Date the claimant is told the money comes back. */
      due_on?: string;
      paid_at?: string;
      paid_by?: string;
      payment_ref?: string;
      broker_evidence_ref?: string;
      bank_statement_ref?: string;
      settlement_evidence_ref?: string;
      notes?: string;
    };
  }>;
  expense_claim_approvals?: Array<{
    approval_id: string;
    subject_ref?: string;
    proposed_by: string;
    proposed_at: string;
    message?: string;
    amount?: { value: number; currency: string };
  }>;
  person_account_catalog?: Array<{
    account_code: string;
    account_name: string;
  }>;
  expense_claim_representatives?: Array<{
    id: string;
    display_name: string;
  }>;
  expense_claim_board_events?: Array<{
    event_id: string;
    title: string;
    status: string;
    kind: string;
  }>;
  expense_claim_settlement_candidates?: Record<
    string,
    Array<{
      bank_statement_id: string;
      date: string;
      amount: number;
      account_id: string;
      description: string;
      counterparty?: string;
      status: string;
    }>
  >;
  proposed_approval?: {
    approval_id: string;
    change_id: string;
    kind: "company_total" | "department_total";
    escalation?: "within_policy" | "beyond_policy";
    message: string;
  };
  viewer: {
    operator_id: string;
    role: string;
    managed_org_units: string[];
    can_set_company: boolean;
    can_allocate_department: boolean;
  };
}

export type ExpenseClaimGateResult = {
  ok: boolean;
  gate: string;
  message: string;
  remaining: {
    person_remaining_yen: number;
    dept_remaining_yen: number;
    company_remaining_yen: number;
  };
  error?: string;
};

export async function ingestExpenseClaim(body: {
  qr: string;
  person_id: string;
  org_unit_id: string;
  account_code: string;
  allocations?: Array<{
    account_code: string;
    amount_yen: number;
    org_unit_id: string;
    person_id?: string;
    line_index?: number;
    description?: string;
  }>;
  proposed_by?: string;
  fy?: string;
  expected_claims_revision: string;
}): Promise<OrgBudgetPayload & { claim?: unknown; gate?: unknown }> {
  return chatApi("/chat/v1/org/budget/expense-claim/ingest", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Employee claim desk ingest. person_id / org_unit_id are pinned server-side
 * to the session seat, so the desk never sends them.
 */
export async function ingestExpenseClaimFromDesk(body: {
  qr: string;
  account_code: string;
  expected_claims_revision: string;
}): Promise<
  ClaimDeskPayload & {
    claim?: { claim_id: string };
    gate?: { gate?: string; message?: string };
  }
> {
  return chatApi("/chat/v1/org/budget/expense-claim/ingest", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function approveExpenseClaimApi(body: {
  claim_id: string;
  approver_id?: string;
  co_approver_id?: string;
  board_event_id?: string;
  /** Pay-back date (YYYY-MM-DD); server fills the next Friday when omitted. */
  due_on?: string;
  fy?: string;
  expected_claim_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi("/chat/v1/org/budget/expense-claim/approve", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function prepareExpenseClaimTransferApi(body: {
  claim_id: string;
  source_bank_account_id: string;
  stakeholder_id: string;
  payee: string;
  fy?: string;
  expected_claim_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi("/chat/v1/org/budget/expense-claim/prepare-transfer", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reimburseExpenseClaimApi(body: {
  claim_id: string;
  paid_by?: string;
  payment_ref: string;
  bank_statement_ref?: string;
  settlement_evidence_ref?: string;
  notes?: string;
  fy?: string;
  expected_claim_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi("/chat/v1/org/budget/expense-claim/reimburse", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function rejectExpenseClaimApi(body: {
  claim_id: string;
  reason?: string;
  fy?: string;
  expected_claim_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi("/chat/v1/org/budget/expense-claim/reject", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchExpenseClaimReceipt(
  claimId: string,
): Promise<{
  ok: boolean;
  claim_id: string;
  receipt_id?: string;
  receipt_digest?: string;
  issuer?: unknown;
  transaction_date?: string;
  invoice_verification?: unknown;
  evidence_archive_ref?: string;
  receipt: {
    receipt_id: string;
    issuer: { name: string; invoice_registration_number: string; org_id: string };
    recipient_name?: string;
    transaction_date: string;
    lines: Array<{
      description: string;
      quantity?: number;
      tax_rate: number;
      reduced_tax?: boolean;
      amount_excluding_tax: number;
      tax_amount: number;
      amount_including_tax: number;
    }>;
    tax_totals: Array<{
      tax_rate: number;
      amount_excluding_tax: number;
      tax_amount: number;
      amount_including_tax: number;
    }>;
    total_amount: number;
  } | null;
  digest?: string;
  signature_ok?: boolean;
  error?: string;
}> {
  return chatApi(
    `/chat/v1/org/budget/expense-claim/${encodeURIComponent(claimId)}/receipt`,
  );
}

export type ReceiptIssueBody = {
  document_type: "qualified_invoice" | "qualified_simplified_invoice";
  transaction_date: string;
  /** Optional — server resolves from tenant corporate identity. */
  issuer_name?: string;
  /** Optional — server resolves from tenant corporate identity. */
  invoice_registration_number?: string;
  recipient_name?: string;
  lines: Array<{
    description: string;
    quantity?: number;
    tax_rate: 0 | 8 | 10;
    reduced_tax?: boolean;
    amount_excluding_tax: number;
    tax_amount: number;
    amount_including_tax: number;
  }>;
  claim_endpoint?: string;
};

export type ReceiptIssuerIdentity = {
  ok: boolean;
  issuer_name: string;
  invoice_registration_number: string;
  corporate_number: string;
  source: {
    name: "company.yaml" | "tenant.yaml";
    invoice_registration: "tax-profile" | "corporate_number";
  };
  error?: string;
};

export async function fetchReceiptIssuerApi(): Promise<ReceiptIssuerIdentity> {
  return chatApi("/chat/v1/receipts/issuer");
}

export type ReceiptIssueResponse = {
  ok: boolean;
  receipt_id: string;
  digest: string;
  total_amount: number;
  tax_totals: Array<{
    tax_rate: number;
    amount_excluding_tax: number;
    tax_amount: number;
    amount_including_tax: number;
  }>;
  lines: ReceiptIssueBody["lines"];
  qr_link: string;
  qr_svg: string;
  claim_status?: string;
  persisted: boolean;
  error?: string;
};

export type StoredReceiptRow = {
  receipt_id: string;
  document_type: string;
  transaction_date: string;
  issued_at: string;
  issuer_name: string;
  invoice_registration_number: string;
  recipient_name?: string;
  total_amount: number;
  digest: string;
  claim_status: string;
  claimed_by_org_id?: string;
  claimed_by_peer_id?: string;
  claim_approval_id?: string;
  claim_requested_at?: string;
  claimed_at?: string;
  claim_rejected_at?: string;
  claim_reject_reason?: string;
  claim_rejected_by?: string;
  lines?: ReceiptIssueBody["lines"];
  tax_totals?: ReceiptIssueResponse["tax_totals"];
};

export async function previewReceiptApi(
  body: ReceiptIssueBody,
): Promise<ReceiptIssueResponse> {
  return chatApi("/chat/v1/receipts/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function issueReceiptApi(
  body: ReceiptIssueBody,
): Promise<ReceiptIssueResponse> {
  return chatApi("/chat/v1/receipts/issue", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listReceiptsApi(status?: string): Promise<{
  ok: boolean;
  receipts: StoredReceiptRow[];
}> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return chatApi(`/chat/v1/receipts${q}`);
}

export async function fetchPendingReceiptClaims(): Promise<{
  ok: boolean;
  pending: StoredReceiptRow[];
}> {
  return chatApi("/chat/v1/receipts/pending-claims");
}

export async function approveReceiptClaimApi(body: {
  receipt_id: string;
}): Promise<{
  ok: boolean;
  receipt_id: string;
  claim_status: string;
  claimed_event_id?: string;
  error?: string;
}> {
  return chatApi("/chat/v1/receipts/approve-claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function rejectReceiptClaimApi(body: {
  receipt_id: string;
  reason: string;
}): Promise<{
  ok: boolean;
  receipt_id: string;
  claim_status: string;
  claim_reject_reason?: string;
  error?: string;
}> {
  return chatApi("/chat/v1/receipts/reject-claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function receiptPdfUrl(receiptId: string): string {
  return `/chat/v1/receipts/${encodeURIComponent(receiptId)}/pdf`;
}

export async function fetchOrgBudget(fy?: string): Promise<OrgBudgetPayload> {
  const query = fy?.trim() ? `?fy=${encodeURIComponent(fy.trim())}` : "";
  const data = await chatApi<OrgBudgetPayload>(`/chat/v1/org/budget${query}`);
  if (!fy?.trim()) setOrgBudgetSnapshot(data);
  return data;
}

export interface AnalyticsKpiRow {
  metric: {
    id: string;
    title: string;
    category: string;
    unit: string;
    owner_agent: string;
  };
  actual: {
    formatted: string;
    value: number | null;
  };
  target_value: number | null;
  rag: "green" | "amber" | "red" | "unknown";
  delta: number | null;
  delta_pct: number | null;
  prev_value: number | null;
  mom_delta: number | null;
  mom_delta_pct: number | null;
}

export type AnalyticsDataQualityOverall = number | null;

export interface AnalyticsDashboardPayload {
  view_model: {
    title: string;
    summary?: string;
    report_date: string;
    sections: Array<
      | { type: "stats"; items: Array<{ value: string; label: string; tone?: string }> }
      | { type: "bars"; title?: string; categories: string[]; series: Array<{ name: string; values: number[] }> }
      | { type: "table"; title?: string; headers: string[]; rows: unknown[][] }
    >;
  };
  kpi: {
    fiscal_year: string;
    as_of: string;
    rows: AnalyticsKpiRow[];
    summary: { green: number; amber: number; red: number; unknown: number };
  };
  data_quality_overall: AnalyticsDataQualityOverall;
}

export async function fetchAnalyticsDashboard(): Promise<AnalyticsDashboardPayload> {
  return chatApi<AnalyticsDashboardPayload>("/chat/v1/analytics/dashboard");
}

export interface LedgerWorkbenchSnapshot {
  as_of: string;
  trial_balance: {
    balanced: boolean;
    debit_total_yen: number;
    credit_total_yen: number;
    rows: Array<{ account_code: string; account_name: string; balance_yen: number }>;
  };
  balance_sheet: {
    balanced: boolean;
    total_assets_yen: number;
    total_liabilities_yen: number;
    total_equity_yen: number;
    net_income_yen: number;
  };
  cash_flow: {
    method: string;
    net_cash_change_yen: number;
    cash_begin_yen: number;
    cash_end_yen: number;
    reconciled: boolean;
    operating_total_yen: number;
    investing_total_yen: number;
    financing_total_yen: number;
  };
  prior_compare: {
    prior_as_of: string;
    assets: { current: number; prior: number; delta: number };
    liabilities: { current: number; prior: number; delta: number };
    equity: { current: number; prior: number; delta: number };
    net_income: { current: number; prior: number; delta: number };
    revenue: { current: number; prior: number; delta: number };
    net_profit: { current: number; prior: number; delta: number };
  } | null;
  profit_and_loss_lines: Array<{
    label: string;
    amount_yen: number;
    account_code?: string;
  }>;
  profit_and_loss: {
    revenue_total_yen: number;
    expense_total_yen: number;
    net_profit_yen: number;
  };
  bank_reconcile: {
    unmatched_count: number;
    unmatched: Array<{
      id: string;
      date: string;
      direction: string;
      amount: number;
    }>;
    proposals: Array<{
      bank_statement_id: string;
      ar_ap_id: string;
      amount: number;
      confidence: string;
    }>;
  };
  export_hint: string;
  export_urls: {
    journal_csv: string;
    trial_balance_csv: string;
    account_breakdown_csv: string;
    cash_flow_csv: string;
  };
  dencho_search_path: string;
  journals: Array<{
    entry_id: string;
    occurred_at: string;
    description: string;
    source_kind: string;
  }>;
  subsidiaries: Array<{
    account_code: string;
    account_name: string;
    balanced: boolean;
    control_balance_yen: number;
    lines: Array<{ counterparty_id: string; balance_yen: number }>;
  }>;
  unposted_months: string[];
  period_locks: Array<{ month: string; status: string; by: string; at: string }>;
  monthly_reconcile: {
    month: string;
    gl_active: boolean;
    balanced: boolean;
    diffs: Array<{ category: string; account_code: string; delta_yen: number }>;
  };
  tax_balances: Array<{
    account_code: string;
    label: string;
    balance_yen: number;
  }>;
  remittance_calendar: Array<{
    row_id: string;
    label: string;
    deadline: string;
    obligation: string;
    amount_estimate_jpy: number | null;
  }>;
}

export async function fetchLedgerWorkbench(
  asOf?: string,
): Promise<LedgerWorkbenchSnapshot> {
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return chatApi<LedgerWorkbenchSnapshot>(`/chat/v1/ledger/workbench${query}`);
}

export interface ElectronicLedgerSearchHit {
  entry_id: string;
  occurred_at: string;
  description: string;
  account_code: string;
  line_amount_yen: number;
  debit_yen: number;
  credit_yen: number;
  counterparty_id?: string;
}

export async function fetchLedgerDenchoSearch(input: {
  from?: string;
  to?: string;
  description?: string;
  min_amount?: number;
  max_amount?: number;
  account?: string;
  entry_id?: string;
}): Promise<{ count: number; hits: ElectronicLedgerSearchHit[] }> {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.description) params.set("description", input.description);
  if (input.min_amount != null) params.set("min_amount", String(input.min_amount));
  if (input.max_amount != null) params.set("max_amount", String(input.max_amount));
  if (input.account) params.set("account", input.account);
  if (input.entry_id) params.set("entry_id", input.entry_id);
  const query = params.toString();
  return chatApi<{ count: number; hits: ElectronicLedgerSearchHit[] }>(
    `/chat/v1/ledger/dencho/search${query ? `?${query}` : ""}`,
  );
}

export type MonthCloseChecklist = {
  month: string;
  checked_at: string;
  ready: boolean;
  checklist_complete?: boolean;
  period_locked?: boolean;
  items: Array<{
    id: string;
    label: string;
    pass: boolean;
    detail?: string;
    actions?: string[];
    scroll_target?: string;
  }>;
  integrity_errors?: string[];
  fix_hints?: string[];
  unmatched_samples?: Array<{
    bank_statement_id: string;
    amount: number;
    description?: string;
    suggested_ar_ap_id?: string;
  }>;
};

export async function fetchMonthCloseChecklist(
  month?: string,
): Promise<MonthCloseChecklist> {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await chatApi<{ ok: boolean; checklist: MonthCloseChecklist }>(
    `/chat/v1/ledger/month-close-checklist${query}`,
  );
  return res.checklist;
}

export async function fetchBankCsvTemplate(preset?: string): Promise<{
  ok: boolean;
  filename: string;
  csv_text: string;
  suggested_mapping: {
    date: string;
    amount: string;
    description: string;
    direction?: string;
    signed_amount?: string;
    withdrawal_amount?: string;
    deposit_amount?: string;
  };
  presets: Array<{ id: string; label: string }>;
  preset: string;
}> {
  const query = preset ? `?preset=${encodeURIComponent(preset)}` : "";
  return chatApi(`/chat/v1/ledger/bank-csv-template${query}`);
}

export type LedgerJournalProposal = {
  id: string;
  status: "pending" | "approved" | "rejected";
  source: string;
  created_at: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount_yen: number;
  occurred_at?: string;
  note?: string;
};

export async function fetchLedgerProposals(): Promise<{
  ok: boolean;
  pending: LedgerJournalProposal[];
  proposals: LedgerJournalProposal[];
}> {
  return chatApi("/chat/v1/ledger/proposals");
}

export async function postLedgerProposalApprove(
  proposalId: string,
): Promise<{ ok: boolean; entry_id: string }> {
  return chatApi("/chat/v1/ledger/proposals/approve", {
    method: "POST",
    body: JSON.stringify({ proposal_id: proposalId }),
  });
}

export async function postLedgerProposalReject(
  proposalId: string,
): Promise<{ ok: boolean }> {
  return chatApi("/chat/v1/ledger/proposals/reject", {
    method: "POST",
    body: JSON.stringify({ proposal_id: proposalId }),
  });
}

export async function postLedgerProposalEnqueue(input: {
  description: string;
  debit_account: string;
  credit_account: string;
  amount_yen: number;
  source?: "chat" | "ui";
}): Promise<{ ok: boolean; proposal: LedgerJournalProposal }> {
  return chatApi("/chat/v1/ledger/proposals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchProductLegalStatus(): Promise<{
  ok: boolean;
  status: "pending" | "signed";
  counsel_ready: boolean;
  document_path: string;
  detail: string;
}> {
  return chatApi("/chat/v1/product/legal-status");
}

export async function fetchDenchoSku(): Promise<{
  base: { sku: string; claim: string; included_in_ledger: boolean };
  premium: {
    sku: string;
    status: string;
    claim: string;
    included_in_ledger: boolean;
  };
}> {
  return chatApi("/chat/v1/ledger/dencho/sku");
}

export async function fetchDenchoCheck(): Promise<{
  ok: boolean;
  entry_count: number;
  issues: string[];
  append_only_ok: boolean;
  search_index_ok: boolean;
}> {
  return chatApi("/chat/v1/ledger/dencho/check");
}

export interface LedgerPlan {
  id: string;
  name: string;
  monthly_jpy: number;
  journal_limit_per_month: number | null;
  includes_bank: boolean;
  trial_days: number;
}

export interface CustomerAdminInvitePolicy {
  email_domains: string[];
  founder_migration_status: string | null;
  grace_until: string | null;
  grace_days_remaining: number | null;
  grandfather_active: boolean;
  standing_invite_blocked: boolean;
  standing_invite_block_reason: string | null;
  tenant_lifecycle: string;
  guest_invite_allowed: boolean;
  migration_warnings: string[];
}

export interface CustomerAdminSnapshot {
  subscription: {
    plan: string;
    status: string;
    trial_ends_at?: string;
    current_period_end?: string;
    stripe_customer_id?: string;
  } | null;
  plans: LedgerPlan[];
  operators: Array<{
    operator_id: string;
    display_name: string;
    role: string;
    email?: string;
    status: string;
    guest_expires_at?: string;
    guest_expired?: boolean;
  }>;
  usage: {
    journal_entries: number;
    current_month_entries: number;
    journal_limit_per_month: number | null;
    limit_exceeded: boolean;
    limit_remaining: number | null;
    plan: string | null;
  };
  billing_portal_url: string | null;
  billing_portal_mode: "live" | "stub" | null;
  invite_policy: CustomerAdminInvitePolicy;
  platform_billing_settings?: boolean;
}

export interface OrgChartChangeProposalRow {
  change_id: string;
  approval_id: string;
  intent: string;
  action: "add" | "update" | "remove";
  node_id: string;
  reason: string;
  proposed_at: string;
  proposed_by: string;
}

export interface OrgChartChangeResult {
  logical_path: string;
  before_hash: string;
  after_hash: string;
  dry_run: boolean;
}

export async function fetchOrgChartChanges(): Promise<{
  proposals: OrgChartChangeProposalRow[];
}> {
  return chatApi("/chat/v1/org/chart/change");
}

export async function postOrgChartChangePropose(input: {
  approval_id: string;
  change: unknown;
}): Promise<{ proposal: OrgChartChangeProposalRow }> {
  return chatApi("/chat/v1/org/chart/change/propose", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postOrgChartChangeValidate(
  changeId: string,
): Promise<{ result: OrgChartChangeResult }> {
  return chatApi("/chat/v1/org/chart/change/validate", {
    method: "POST",
    body: JSON.stringify({ change_id: changeId }),
  });
}

export async function postOrgChartChangeApply(
  changeId: string,
): Promise<{ result: OrgChartChangeResult }> {
  return chatApi("/chat/v1/org/chart/change/apply", {
    method: "POST",
    body: JSON.stringify({ change_id: changeId }),
  });
}

export async function fetchProductAdmin(): Promise<CustomerAdminSnapshot> {
  return chatApi<CustomerAdminSnapshot>("/chat/v1/product/admin");
}

export async function fetchProductPlans(): Promise<{ plans: LedgerPlan[] }> {
  return chatApi<{ plans: LedgerPlan[] }>("/chat/v1/product/plans");
}

export async function fetchGuestSetup(token: string): Promise<{
  ok: boolean;
  tenant_id: string;
  email: string;
  operator_id: string;
  approver_id: string;
  expires_at: string;
}> {
  return chatApi(
    `/chat/v1/product/guest-setup?token=${encodeURIComponent(token)}`,
  );
}

export async function postProductSignup(input: {
  company_name: string;
  admin_email: string;
  plan: string;
  tenant_id?: string;
}): Promise<{
  ok: boolean;
  signup_id: string;
  tenant_id: string;
  checkout_url: string;
  checkout_mode: "live" | "stub";
}> {
  return chatApi("/chat/v1/product/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchProductOpsDashboard(): Promise<{
  ok: boolean;
  generated_at: string;
  control_plane_tenant_count: number;
  ledger_product_tenant_count: number;
  tenants: Array<{
    tenant_id: string;
    company_name: string;
    plan: string | null;
    subscription_status: string | null;
    host: string | null;
    onboarding_complete: boolean;
  }>;
}> {
  return chatApi("/chat/v1/product/ops-dashboard");
}

export interface ProductStripeSettings {
  ok: boolean;
  webhook_url: string;
  webhook_path: string;
  mode: "stub" | "test" | "live";
  secret_configured: boolean;
  webhook_secret_configured: boolean;
  commercial_ready: boolean;
  live_ready: boolean;
  secret_key_hint: string | null;
  webhook_secret_hint: string | null;
  price_starter_configured: boolean;
  price_business_configured: boolean;
  price_accountant_configured: boolean;
  storage_path: string;
  next_steps?: string[];
  attestation: {
    status: string;
    mode: string;
    checked_at?: string;
  };
}

export async function fetchProductStripeSettings(): Promise<ProductStripeSettings> {
  return chatApi<ProductStripeSettings>("/chat/v1/product/stripe-settings");
}

export async function updateProductStripeSettings(input: {
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  stripe_price_starter?: string;
  stripe_price_business?: string;
  stripe_price_accountant?: string;
}): Promise<ProductStripeSettings> {
  return chatApi<ProductStripeSettings>("/chat/v1/product/stripe-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export interface ProductInitialSetupReport {
  pre_production_ready: boolean;
  commercial_score: number;
  commercial_ready: boolean;
  stripe_mode: "stub" | "test" | "live";
  stripe_configured: boolean;
  webhook_path: string;
  storage_path: string;
  steps: Array<{
    id: string;
    label: string;
    complete: boolean;
    detail?: string;
    phase: "pre_production" | "go_live";
  }>;
}

export async function fetchProductInitialSetup(): Promise<ProductInitialSetupReport> {
  return chatApi<ProductInitialSetupReport>("/chat/v1/product/initial-setup");
}

export interface OnboardingStep {
  id: string;
  label: string;
  complete: boolean;
  detail?: string;
}

export interface OnboardingReport {
  complete: boolean;
  customer_ready: boolean;
  completed_count: number;
  total_count: number;
  steps: OnboardingStep[];
  company_name?: string;
  representative?: string;
  fiscal_year_end_month?: number;
}

export async function fetchProductOnboarding(): Promise<OnboardingReport> {
  return chatApi<OnboardingReport>("/chat/v1/product/onboarding");
}

export interface TaxReadinessReport {
  etax_module: {
    module: string;
    registered: boolean;
    xml_draft: boolean;
    note: string;
  };
  ready_for_handoff: boolean;
  note: string;
}

export async function fetchProductTaxReadiness(): Promise<TaxReadinessReport> {
  return chatApi<TaxReadinessReport>("/chat/v1/product/tax-readiness");
}

export async function postProductOnboardingSetup(input: {
  company_name?: string;
  fiscal_year_end_month?: number;
  representative?: string;
}): Promise<{ ok: boolean; company_path: string }> {
  return chatApi("/chat/v1/product/onboarding/setup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CustomersNavGate {
  show_tab: boolean;
  sales_enabled: boolean;
  customer_success_enabled: boolean;
  sales_module_installed: boolean;
  customer_success_module_installed: boolean;
  sales_agent_grace: boolean;
}

export async function fetchCustomersNav(): Promise<CustomersNavGate> {
  const data = await chatApi<{ ok: boolean } & CustomersNavGate>(
    "/chat/v1/customers/nav",
  );
  return data;
}

type CustomersLocked = {
  ok: boolean;
  locked?: boolean;
  module_id?: string;
  message?: string;
  gate?: CustomersNavGate;
};

export async function fetchCustomersOutbound(): Promise<
  CustomersLocked & Record<string, unknown>
> {
  return chatApi("/chat/v1/customers/outbound");
}

export async function fetchCustomersInbound(): Promise<
  CustomersLocked & Record<string, unknown>
> {
  return chatApi("/chat/v1/customers/inbound");
}

export async function fetchCustomersAfterSales(): Promise<
  CustomersLocked & Record<string, unknown>
> {
  return chatApi("/chat/v1/customers/after-sales");
}

export async function fetchCustomersChurn(): Promise<
  CustomersLocked & Record<string, unknown>
> {
  return chatApi("/chat/v1/customers/churn");
}

export async function fetchCustomersPipeline(): Promise<
  CustomersLocked & Record<string, unknown>
> {
  return chatApi("/chat/v1/customers/pipeline");
}

export async function fetchCustomersAccounts(): Promise<
  CustomersLocked & Record<string, unknown>
> {
  return chatApi("/chat/v1/customers/accounts");
}

export async function postCustomersDealSetStage(body: {
  deal_id: string;
  stage: string;
  lost_reason?: string;
  reopen?: boolean;
}): Promise<{ ok: boolean; deal?: { id: string; stage: string } }> {
  return chatApi("/chat/v1/customers/deals/set-stage", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postCustomersDealSetNextAction(body: {
  deal_id: string;
  next_action: string;
  next_action_due?: string;
}): Promise<{
  ok: boolean;
  deal?: { id: string; next_action?: string; next_action_due?: string };
}> {
  return chatApi("/chat/v1/customers/deals/set-next-action", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postCustomersInquiryPromote(body: {
  inquiry_id: string;
  title?: string;
}): Promise<{ ok: boolean; deal_id?: string; inquiry_id?: string }> {
  return chatApi("/chat/v1/customers/inquiry/promote", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface AccountantFleetSnapshot {
  accountant_tenant_id: string;
  clients: Array<{
    tenant_id: string;
    company_name: string;
    plan?: string | null;
    host?: string | null;
  }>;
  all_product_tenants: Array<{
    tenant_id: string;
    company_name: string;
    plan: string | null;
    host: string | null;
  }>;
}

export async function fetchProductAccountantFleet(): Promise<AccountantFleetSnapshot> {
  return chatApi<AccountantFleetSnapshot>("/chat/v1/product/accountant-fleet");
}

export async function postProductOperatorInvite(input: {
  display_name: string;
  email: string;
  role?: "operator" | "readonly" | "approver";
  guest_expires_at?: string;
  send_invite_mail?: boolean;
}): Promise<{
  ok: boolean;
  operator_id: string;
  setup_url?: string;
  invite_token?: string;
  guest_expires_at?: string;
  mail_id?: string;
}> {
  return chatApi("/chat/v1/product/admin/operators", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerReverse(input: {
  entry_id: string;
  occurred_at?: string;
}): Promise<{ ok: boolean; entry_id: string }> {
  return chatApi("/chat/v1/ledger/reverse", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerPeriod(input: {
  month: string;
  action: "lock" | "unlock";
  reason?: string;
  require_checklist?: boolean;
}): Promise<{ ok: boolean; month: string; status: string }> {
  return chatApi("/chat/v1/ledger/period", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerRemittance(input: {
  period?: string;
  obligation?: "withholding" | "social_insurance" | "consumption_tax";
  from_calendar?: string;
}): Promise<{
  ok: boolean;
  entry_id: string | null;
  settled: boolean;
  period?: string;
  obligation?: string;
}> {
  return chatApi("/chat/v1/ledger/remittance", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerSource(input: {
  source: "monthly-pl" | "payroll-payment" | "onboarding-first";
  month: string;
}): Promise<{ ok: boolean; entry_ids?: string[]; entry_id?: string | null }> {
  return chatApi("/chat/v1/ledger/post", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerSettle(input: {
  kind: "ar-receipt" | "ap-payment";
  counterparty_id: string;
  amount_yen: number;
  month: string;
}): Promise<{ ok: boolean; entry_id: string }> {
  return chatApi("/chat/v1/ledger/settle", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerBankReconcile(input: {
  bank_id: string;
  ar_ap_id: string;
  amount: number;
  reason?: string;
}): Promise<{ ok: boolean; event_id: string; entry_id: string }> {
  return chatApi("/chat/v1/ledger/bank-reconcile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerBankStatementImport(input: {
  csv_text?: string;
  csv_base64?: string;
  encoding?: "utf-8" | "shift_jis" | "auto";
  write?: boolean;
  dry_run?: boolean;
  preset?: string;
  /** Omit when using preset — server applies preset mapping (preset-preferred). */
  column_mapping?: {
    date: string;
    amount: string;
    description: string;
    direction?: string;
    signed_amount?: string;
    withdrawal_amount?: string;
    deposit_amount?: string;
    category?: string;
    account_id?: string;
  };
}): Promise<{
  ok: boolean;
  added: number;
  duplicate_batch: boolean;
  batch_id: string;
  warnings: string[];
  dry_run?: boolean;
  preview_rows?: string[];
  encoding_used?: string;
}> {
  return chatApi("/chat/v1/ledger/bank-statements/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchLedgerAccounts(): Promise<{
  ok: boolean;
  accounts: Array<{ code: string; name: string; type: string }>;
}> {
  return chatApi("/chat/v1/ledger/accounts");
}

export async function postLedgerManualEntry(input: {
  description: string;
  debit_account: string;
  credit_account: string;
  amount_yen: number;
  occurred_at?: string;
}): Promise<{ ok: boolean; entry_id: string }> {
  return chatApi("/chat/v1/ledger/manual-entry", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerBankReconcileBulkExact(): Promise<{
  ok: boolean;
  applied: number;
}> {
  return chatApi("/chat/v1/ledger/bank-reconcile/bulk-exact", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchTaxReadiness(): Promise<{
  ok: boolean;
  ready_for_handoff: boolean;
  note: string;
  boundary: string;
  etax_module: { xml_draft: boolean; note: string };
}> {
  return chatApi("/chat/v1/tax/readiness");
}

export async function fetchTaxCalendar(): Promise<{
  ok: boolean;
  as_of: string;
  stats: {
    total: number;
    due_soon: number;
    overdue: number;
    open: number;
  };
  rows: Array<{
    id: string;
    tax: string;
    deadline: string;
    status: string;
    remaining_text: string;
    amount_display: string;
    next_action: string;
  }>;
}> {
  return chatApi("/chat/v1/tax/calendar");
}

export async function fetchTaxGaps(): Promise<{
  ok: boolean;
  total: number;
  open: number;
  deferred: number;
  resolved: number;
  items: Array<{
    id: string;
    severity: string;
    area: string;
    message: string;
    status: string;
  }>;
}> {
  return chatApi("/chat/v1/tax/gaps");
}

export async function fetchTaxConsumption(): Promise<{
  ok: boolean;
  status: string;
  taxable_by_sales: boolean | null;
  threshold_jpy: number;
  base_period_sales_jpy: number | null;
  invoice_registered: boolean;
  issues: Array<{ severity: string; code: string; message: string }>;
}> {
  return chatApi("/chat/v1/tax/consumption");
}

export async function postTaxPayrollCalc(input: {
  month: string;
  gross_yen: number;
  dependents?: number;
}): Promise<{
  ok: boolean;
  run: {
    month: string;
    gross_yen: number;
    withholding_yen: number;
    net_pay_yen: number;
    social_insurance: {
      employee_total_yen: number;
      employer_total_yen: number;
    };
  };
}> {
  return chatApi("/chat/v1/tax/payroll-calc", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postTaxYeaCompute(fiscalYear?: string): Promise<{
  ok: boolean;
  yea: {
    fiscal_year: string;
    status: string;
    employee_count: number;
    totals: { annual_gross_yen: number; withholding_total_yen: number };
  };
}> {
  return chatApi("/chat/v1/tax/yea/compute", {
    method: "POST",
    body: JSON.stringify({ fiscal_year: fiscalYear }),
  });
}

export interface TenantMailStatus {
  ok: boolean;
  connected: boolean;
  email?: string;
  connected_via?: string;
  expired: boolean;
  note: string;
  provider: "smtp" | "gmail_api" | "dry_run";
  from: { name: string; email: string };
  smtp?: { host: string; port: number; secure: boolean };
  platform_ready: boolean;
  platform_detail: string;
  community_connections_url: string;
  configured: boolean;
  secrets?: MailSecretsSnapshot;
}

export interface PlatformIntegrationSnapshot {
  ok: boolean;
  flags: Record<string, boolean>;
  community_env: {
    url: string;
    reachable: boolean;
    shipped: boolean;
    status_code?: number;
    detail: string;
  };
  note: string;
}

export async function fetchPlatformIntegration(): Promise<PlatformIntegrationSnapshot> {
  return chatApi("/chat/v1/platform/integration");
}

export async function putPlatformIntegrationFlag(
  flag: string,
  value: boolean,
): Promise<{ ok: boolean; flags: Record<string, boolean> }> {
  return chatApi("/chat/v1/platform/integration", {
    method: "PUT",
    body: JSON.stringify({ flag, value }),
  });
}

export interface HubStatusReport {
  ok: boolean;
  ga: {
    ok: boolean;
    ready_for_public_relay: boolean;
    checks: Array<{ id: string; pass: boolean; detail: string }>;
  };
  bind: {
    host: string;
    public_mode: boolean;
    public_host: boolean;
    tls_required: boolean;
    allowed: boolean;
    blocked_reason?: string;
  };
  tls: {
    cert_path: string;
    key_path: string;
    present: boolean;
    not_after?: string;
    expired?: boolean;
    subject?: string;
    error?: string;
  };
  metrics: { url: string; reachable: boolean; status_code?: number; detail: string };
}

export async function fetchHubStatus(): Promise<HubStatusReport> {
  return chatApi("/chat/v1/hub/status");
}

export interface EsignReadyReport {
  siva_mode: string;
  siva_base_url: string | null;
  siva_configured: boolean;
  allow_http_loopback: boolean;
  sidecar: { ok: boolean; reason?: string; ready?: boolean };
  sidecar_token_configured: boolean;
  national_complete_requires: string;
  host_hint: string;
}

export interface EsignCaseRow {
  id: string;
  title: string;
  status: string;
  provider_id: string;
  content_digest?: string;
  container_digest?: string;
  unsigned_asice_digest?: string;
  siva_mode?: string;
  siva_indication?: string;
  siva_validated_at?: string;
  siva_signatures_count?: number;
  siva_valid_signatures_count?: number;
  siva_reason?: string;
  contract_id?: string;
  approval_id?: string;
  updated_at: string;
}

export async function fetchEsignReady(): Promise<{ report: EsignReadyReport }> {
  return chatApi("/chat/v1/esign/ready");
}

export async function fetchEsignCases(): Promise<{ cases: EsignCaseRow[] }> {
  return chatApi("/chat/v1/esign/cases");
}

export async function postEsignCreate(body: {
  title: string;
  filename?: string;
  pdf_base64: string;
  contract_id?: string;
  approval_id?: string;
}): Promise<{ case: EsignCaseRow }> {
  return chatApi("/chat/v1/esign/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postEsignPrepare(caseId: string): Promise<{ case: EsignCaseRow }> {
  return chatApi("/chat/v1/esign/prepare", {
    method: "POST",
    body: JSON.stringify({ case_id: caseId }),
  });
}

export async function postEsignAttach(body: {
  case_id: string;
  asice_base64: string;
  filename?: string;
}): Promise<{ case: EsignCaseRow; pdf_digest_matches: boolean | null }> {
  return chatApi("/chat/v1/esign/attach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postEsignVerify(
  caseId: string,
): Promise<{ nationally_verified: boolean; case: EsignCaseRow }> {
  return chatApi("/chat/v1/esign/verify", {
    method: "POST",
    body: JSON.stringify({ case_id: caseId }),
  });
}

export interface MailSecretsSnapshot {
  storage_path: string;
  smtp_user_configured: boolean;
  smtp_password_configured: boolean;
  smtp_user_hint: string | null;
  imap_user_configured: boolean;
  imap_password_configured: boolean;
  imap_user_hint: string | null;
  wire_smtp_password_configured: boolean;
}

/** Write-only: secrets are stored server-side; only masked hints come back. */
export async function putMailSecrets(input: {
  ORGOS_SMTP_USER?: string;
  ORGOS_SMTP_PASSWORD?: string;
  ORGOS_IMAP_USER?: string;
  ORGOS_IMAP_PASSWORD?: string;
  ORGOS_IMAP_HOST?: string;
  ORGOS_IMAP_PORT?: string;
}): Promise<{ ok: boolean; secrets: MailSecretsSnapshot }> {
  return chatApi("/chat/v1/mail/secrets", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function fetchGmailStatus(): Promise<TenantMailStatus> {
  return chatApi("/chat/v1/mail/gmail");
}

export async function postGmailConnect(input?: { expect_email?: string }): Promise<{
  ok: boolean;
  tenant_id: string;
  expires_at: string;
  connect_url: string;
  platform_ready: boolean;
  platform_detail: string;
}> {
  return chatApi("/chat/v1/mail/gmail/connect", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function postGmailDisconnect(): Promise<TenantMailStatus & { removed: boolean }> {
  return chatApi("/chat/v1/mail/gmail/disconnect", { method: "POST", body: "{}" });
}

export async function putMailConfig(input: {
  from?: { name?: string; email?: string };
  provider?: "smtp" | "gmail_api" | "dry_run";
  smtp?: { host: string; port?: number; secure?: boolean };
}): Promise<TenantMailStatus> {
  return chatApi("/chat/v1/mail/config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function fetchContractStatus(): Promise<{
  ok: boolean;
  company_name: string;
  as_of: string;
  total: number;
  by_status: {
    draft: number;
    pending_signature: number;
    executed: number;
    terminated: number;
  };
  alerts: Array<{
    contractId: string;
    contractName: string;
    counterparty: string;
    alertType: string;
    deadline: string;
    daysRemaining: number;
  }>;
  exit_opportunities: Array<{
    contract_id: string;
    contract_name: string;
    kind: string;
    deadline: string;
    days_remaining: number;
    summary: string;
  }>;
  notes: string[];
}> {
  return chatApi("/chat/v1/contracts/status");
}

export async function fetchHospitalityOpsDue(): Promise<{
  ok: boolean;
  module_enabled: boolean;
  stay_count: number;
  due: Array<{
    id: string;
    severity: string;
    kind: string;
    title: string;
    due_on: string;
    cli_hint: string;
  }>;
}> {
  return chatApi("/chat/v1/hospitality/ops-due");
}

export async function postTaxHandoff(fiscalYear?: string): Promise<{
  ok: boolean;
  zip_path: string;
  package_dir: string;
  submission: string;
  note: string;
}> {
  return chatApi("/chat/v1/tax/handoff", {
    method: "POST",
    body: JSON.stringify({ fiscal_year: fiscalYear }),
  });
}

export async function postTaxXmlDraft(fiscalYear?: string): Promise<{
  ok: boolean;
  relative_path: string;
  submission: string;
}> {
  return chatApi("/chat/v1/tax/xml-draft", {
    method: "POST",
    body: JSON.stringify({ fiscal_year: fiscalYear }),
  });
}

export async function fetchTaxPayrollYea(): Promise<{
  ok: boolean;
  yea_status: string;
  note: string;
  ready_for_tax_handoff: boolean;
}> {
  return chatApi("/chat/v1/tax/payroll-yea");
}

export async function postTaxBonusDraft(input: {
  period: string;
  gross_yen: number;
}): Promise<{ ok: boolean; run: { run_id: string; net_yen: number } }> {
  return chatApi("/chat/v1/tax/bonus-draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postLedgerFirstDemoJournal(month: string): Promise<{
  ok: boolean;
  entry_ids?: string[];
}> {
  return chatApi("/chat/v1/ledger/post", {
    method: "POST",
    body: JSON.stringify({ source: "monthly-pl", month }),
  });
}

export type BoardColumn = "todo" | "waiting" | "active" | "attention" | "done";

export interface BoardCardDependency {
  id: string;
  title: string;
}

export interface BoardCard {
  id: string;
  rootId: string;
  title: string;
  column: BoardColumn;
  status: string;
  agent: string;
  work_kind: string | null;
  due_date?: string;
  assignee?: string;
  blocked_on?: string;
  depends_on: BoardCardDependency[];
  wave: number;
  retryable: boolean;
  cancellable: boolean;
  closed: boolean;
  finished_at?: string;
}

export interface BoardPlanSummary {
  id: string;
  title: string;
  status: "active" | "completed";
  counts: {
    total: number;
    done: number;
    attention: number;
    running: number;
  };
  cards: BoardCard[];
}

export interface OrchestrationRunNode {
  id: string;
  title: string;
  column: string;
  agent: string;
  status: string;
  work_kind: string | null;
  due_date?: string;
  assignee?: string;
  blocked_on?: string;
  depends_on: string[];
  depends_on_labels: BoardCardDependency[];
  wave: number;
  retryable: boolean;
  cancellable: boolean;
  aia?: {
    run_id: string;
    state: string;
    fail_reason?: string;
  };
}

export interface OrchestrationRunPayload {
  ok?: boolean;
  rootId: string;
  planTitle: string;
  nodeCount: number;
  waveCount: number;
  readyCount: number;
  blockedByFailureCount: number;
  retryableCount: number;
  cancellableCount: number;
  aia: {
    tier: string;
    max_concurrent: number;
    running: number;
    queued: number;
  };
  nodes: OrchestrationRunNode[];
  aia_runs: Array<{
    run_id: string;
    work_order_id?: string;
    agent_id: string;
    state: string;
    fail_reason?: string;
  }>;
  blocked_downstream: Array<{ id: string; agent: string; status: string }>;
}

export interface OrchestrationRunsListPayload {
  ok: boolean;
  plans?: BoardPlanSummary[];
  active_roots: string[];
  completed_roots?: string[];
  count: number;
}

export async function fetchOrchestrationRuns(opts?: {
  includeCompleted?: boolean;
  view?: "incomplete" | "completed" | "all";
  completedSince?: string;
}): Promise<OrchestrationRunsListPayload> {
  const params = new URLSearchParams();
  if (opts?.includeCompleted) params.set("include", "completed");
  if (opts?.view) params.set("view", opts.view);
  if (opts?.completedSince) params.set("completed_since", opts.completedSince);
  const q = params.toString();
  return chatApi<OrchestrationRunsListPayload>(`/chat/v1/orchestration/runs${q ? `?${q}` : ""}`);
}

export async function fetchOrchestrationRun(id: string): Promise<OrchestrationRunPayload> {
  return chatApi<OrchestrationRunPayload>(`/chat/v1/orchestration/runs?id=${encodeURIComponent(id)}`);
}

export async function retryOrchestrationRun(id: string): Promise<OrchestrationRunPayload & { retried: string[] }> {
  return chatApi<OrchestrationRunPayload & { retried: string[] }>(
    `/chat/v1/orchestration/runs/retry?id=${encodeURIComponent(id)}`,
    { method: "POST" },
  );
}

export async function cancelOrchestrationRun(id: string): Promise<OrchestrationRunPayload & { cancelled: string[] }> {
  return chatApi<OrchestrationRunPayload & { cancelled: string[] }>(
    `/chat/v1/orchestration/runs/cancel?id=${encodeURIComponent(id)}`,
    { method: "POST" },
  );
}

export async function completeOrchestrationRun(
  id: string,
): Promise<OrchestrationRunPayload & { id: string; status: string }> {
  return chatApi<OrchestrationRunPayload & { id: string; status: string }>(
    `/chat/v1/orchestration/runs/complete?id=${encodeURIComponent(id)}`,
    { method: "POST" },
  );
}

export async function reopenOrchestrationRun(
  id: string,
): Promise<OrchestrationRunPayload & { id: string; status: string }> {
  return chatApi<OrchestrationRunPayload & { id: string; status: string }>(
    `/chat/v1/orchestration/runs/reopen?id=${encodeURIComponent(id)}`,
    { method: "POST" },
  );
}

export async function setOrgCompanyBudget(body: {
  amount_yen: number;
  fiscal_year?: string;
  reference?: string;
  /** Required when amount is outside ±adjustment band (beyond_policy). */
  board_event_id?: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/set-company", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function setOrgCompanyCategoryBudget(body: {
  account_code: string;
  amount_yen: number;
  reference?: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/set-company-category", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function allocateOrgDepartmentBudget(body: {
  org_unit_id: string;
  amount_yen: number;
  reference?: string;
  notes?: string;
  /** Required when amount is outside ±adjustment band (beyond_policy). */
  board_event_id?: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/allocate-department", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function allocateOrgDepartmentCategoryBudget(body: {
  org_unit_id: string;
  account_code: string;
  amount_yen: number;
  reference?: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>(
    "/chat/v1/org/budget/allocate-department-category",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function allocateOrgPersonCategoryBudget(body: {
  org_unit_id: string;
  person_id: string;
  account_code: string;
  amount_yen: number;
  purpose?: string;
  reference?: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>(
    "/chat/v1/org/budget/allocate-person-category",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function allocateOrgMemberBudget(body: {
  org_unit_id: string;
  member_operator_id: string;
  amount_yen: number;
  purpose?: string;
  reference?: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/allocate-member", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function commitOrgMemberBudget(body: {
  org_unit_id: string;
  member_operator_id: string;
  amount_yen: number;
  reference: string;
  expected_revision?: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/commit-member", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function outlookInit(body: {
  fiscal_year?: string;
  as_of_month?: string;
  notes?: string;
  expected_outlook_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/outlook/init", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function outlookSetRemaining(body: {
  month: string;
  revenue_yen?: number;
  opex_yen?: number;
  capex_yen?: number;
  fiscal_year?: string;
  expected_outlook_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>(
    "/chat/v1/org/budget/outlook/set-remaining",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function outlookSetAsOf(body: {
  as_of_month: string;
  fiscal_year?: string;
  expected_outlook_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/outlook/set-as-of", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function outlookPublish(body: {
  fiscal_year?: string;
  publisher_operator_id?: string;
  expected_outlook_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/outlook/publish", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function outlookSyncYojitsu(body: {
  fiscal_year?: string;
  expected_outlook_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>("/chat/v1/org/budget/outlook/sync-yojitsu", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function outlookSetDepartment(body: {
  org_unit_id: string;
  expense_yen: number;
  revenue_yen?: number;
  fiscal_year?: string;
  expected_outlook_revision: string;
}): Promise<OrgBudgetPayload> {
  return chatApi<OrgBudgetPayload>(
    "/chat/v1/org/budget/outlook/set-department",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function outlookProposeEnvelope(body?: {
  fiscal_year?: string;
}): Promise<
  OrgBudgetPayload & {
    proposed_envelope?: {
      suggested_company_budget_yen: number;
      current_company_budget_yen: number | null;
      delta_yen: number | null;
      basis: "outlook_opex";
      cli: string;
      note: string;
    };
  }
> {
  return chatApi("/chat/v1/org/budget/outlook/propose-envelope", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function approveWire(
  approvalId: string,
  approverId?: string,
  onChallenge?: (c: SettlementChallengeResponse) => void,
): Promise<{ mode?: string; flushed?: number; settlement?: boolean; approval_id?: string }> {
  void approverId;
  return approveWithSettlementStepUp(approvalId, {
    flush: true,
    onChallenge,
  }) as Promise<{ mode?: string; flushed?: number; settlement?: boolean; approval_id?: string }>;
}

export interface SettlementChallengeResponse {
  ok: boolean;
  challenge_id: string;
  token: string;
  webauthn_challenge: string;
  rp_id: string;
  expires_at: string;
  summary: {
    approval_id: string;
    subject_type: string;
    subject_ref?: string;
    message?: string;
    amount?: { value: number; currency: string };
    tier?: string;
  };
  qr_url: string;
  qr: {
    v: 1;
    challenge_id: string;
    token: string;
    api_origin: string;
    approve_origin: string;
  };
  allow_credentials: { id: string; type: string }[];
  ceremony_kind?: "settlement";
  hints?: Array<"hybrid">;
  code?: string;
  step_up_required?: boolean;
  tier?: string;
}

export async function createSettlementChallenge(
  approvalId: string,
  coApproverId?: string,
): Promise<SettlementChallengeResponse> {
  return chatApi("/chat/v1/settlement/challenge", {
    method: "POST",
    body: JSON.stringify({
      approval_id: approvalId,
      co_approver_id: coApproverId,
    }),
  });
}

export async function pollSettlementChallengeStatus(
  challengeId: string,
  token: string,
): Promise<{ status: string; approval_id: string; completed_at?: string }> {
  return chatApi(
    `/chat/v1/settlement/challenge/${encodeURIComponent(challengeId)}?token=${encodeURIComponent(token)}&status=1`,
  );
}

export async function completeSettlementChallenge(
  challenge: SettlementChallengeResponse,
): Promise<void> {
  const { completeSettlementPasskey } = await import(
    "@ops-shared/complete-settlement-passkey"
  );
  await completeSettlementPasskey(chatApi, {
    challenge_id: challenge.challenge_id,
    token: challenge.token,
    webauthn_challenge: challenge.webauthn_challenge,
    rp_id: challenge.rp_id,
    ceremony_kind: challenge.ceremony_kind ?? "settlement",
    allow_credentials: challenge.allow_credentials,
    hints: challenge.hints,
  });
}

/** Approve with automatic settlement challenge when server returns step_up_required. */
export async function approveWithSettlementStepUp(
  approvalId: string,
  opts?: {
    reviewed?: boolean;
    flush?: boolean;
    onChallenge?: (c: SettlementChallengeResponse) => void;
    /** UI-owned hybrid ceremony (modal). Default: in-page completeSettlementChallenge. */
    runCeremony?: (c: SettlementChallengeResponse) => Promise<void>;
  },
): Promise<unknown> {
  try {
    return await chatApi(
      `/chat/v1/approvals/${encodeURIComponent(approvalId)}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          flush: opts?.flush !== false,
          reviewed: opts?.reviewed === true,
        }),
      },
    );
  } catch (err) {
    const isStepUp =
      (err instanceof ChatApiError && err.code === "step_up_required") ||
      (err instanceof Error &&
        (err.message.includes("step_up_required") ||
          err.message.includes("settlement PassKey")));
    if (!isStepUp) throw err;
    const challenge = await createSettlementChallenge(approvalId);
    opts?.onChallenge?.(challenge);
    await (opts?.runCeremony ?? completeSettlementChallenge)(challenge);
    const st = await pollSettlementChallengeStatus(
      challenge.challenge_id,
      challenge.token,
    );
    if (st.status === "completed" || st.status === "consumed") {
      return { ok: true, approval_id: st.approval_id, settlement: true };
    }
    throw new Error("Settlement PassKey completed but challenge status is unexpected");
  }
}

export interface TodayApprovalItem {
  id: string;
  scope: string;
  subject: string;
  status: string;
  proposed_at: string;
  subject_type?: string;
  message?: string;
  preview_path?: string;
}

export async function fetchApprovals(): Promise<TodayApprovalItem[]> {
  const data = await chatApi<{ approvals: TodayApprovalItem[] }>(
    "/chat/v1/approvals",
  );
  return data.approvals ?? [];
}

export async function postApprovalPropose(input: {
  subject_type: string;
  subject_ref?: string;
  message?: string;
  amount?: number;
}): Promise<{ ok: boolean; approval: { approval_id: string; status: string } }> {
  return chatApi("/chat/v1/approvals/propose", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CeoInlineField = {
  id: string;
  label: string;
  type: "yes_no" | "yes_no_unknown" | "text" | "time" | "choice";
  choices?: string[];
};

export type CeoInlineQuestion = {
  id: string;
  mail_id: string;
  scheduling_case_id?: string;
  subject: string;
  context_l1: string;
  fields: CeoInlineField[];
  status: "pending" | "answered" | "dismissed";
  asked_at: string;
};

export async function fetchCeoQuestions(): Promise<CeoInlineQuestion[]> {
  const data = await chatApi<{ ok: boolean; questions: CeoInlineQuestion[] }>(
    "/chat/v1/ceo-questions",
  );
  return data.questions ?? [];
}

export async function answerCeoQuestion(
  questionId: string,
  fields: Record<string, string>,
): Promise<CeoInlineQuestion> {
  const data = await chatApi<{ ok: boolean; question: CeoInlineQuestion }>(
    `/chat/v1/ceo-questions/${encodeURIComponent(questionId)}/answer`,
    { method: "POST", body: JSON.stringify({ fields }) },
  );
  return data.question;
}

export type SchedulingApprovalPreview = {
  approval_id: string;
  draft_id: string;
  draft_ids: string[];
  preview: string;
};

export async function fetchSchedulingApprovalPreview(
  approvalId: string,
): Promise<SchedulingApprovalPreview> {
  return chatApi<SchedulingApprovalPreview>(
    `/chat/v1/approvals/${encodeURIComponent(approvalId)}/scheduling-preview`,
  );
}

export interface TenantConfigPreview {
  ok?: boolean;
  approval_id: string;
  change_id: string;
  target: string;
  target_id: string;
  from_enabled: boolean;
  to_enabled: boolean;
  message: string;
  side_effects_plan: string[];
  diff_line: string;
  preview: string;
}

export async function fetchConfigApprovalPreview(
  approvalId: string,
): Promise<TenantConfigPreview> {
  return chatApi(
    `/chat/v1/approvals/${encodeURIComponent(approvalId)}/config-preview`,
  );
}

export async function approveConfigChange(
  approvalId: string,
): Promise<Record<string, unknown>> {
  return chatApi(
    `/chat/v1/approvals/${encodeURIComponent(approvalId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ reviewed: true, flush: true }),
    },
  );
}

export async function rejectConfigChange(
  approvalId: string,
  reason?: string,
): Promise<Record<string, unknown>> {
  return chatApi(
    `/chat/v1/approvals/${encodeURIComponent(approvalId)}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export async function flushWirePending(): Promise<{ flushed: number }> {
  return chatApi("/chat/v1/wire/flush", { method: "POST", body: "{}" });
}

export async function registerWitness(
  eventId: string,
  side: "sent" | "received",
): Promise<Record<string, unknown>> {
  return chatApi("/chat/v1/wire/witness/register", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId, side }),
  });
}

export async function verifyWitness(
  eventId: string,
): Promise<Record<string, unknown>> {
  return chatApi("/chat/v1/wire/witness/verify", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId }),
  });
}

export async function flushWitnessPending(): Promise<{ flushed: number }> {
  return chatApi("/chat/v1/wire/witness/flush", { method: "POST", body: "{}" });
}

export type LlmRouteHint = {
  mode: "auto" | "local" | "cloud";
  worker_id?: string;
};

export async function sendMessage(
  message: string,
  agentId?: "secretary" | "executive_steward",
  llmRoute?: LlmRouteHint,
): Promise<{
  ok: boolean;
  reply: string;
  runtime?: string;
  model?: string;
  structured?: OperatorStructured;
  assistant_turn_id?: string;
  faq_served?: boolean;
  local_error?: boolean;
}> {
  const res = await fetch("/chat/v1/message", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      ...(agentId ? { agent_id: agentId } : {}),
      ...(llmRoute ? { llm_route: llmRoute } : {}),
    }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `chat ${res.status}`);
  }
  return res.json() as Promise<{
    ok: boolean;
    reply: string;
    runtime?: string;
    model?: string;
    structured?: OperatorStructured;
    assistant_turn_id?: string;
    faq_served?: boolean;
    local_error?: boolean;
  }>;
}

export type ChatFeedbackRating = "good" | "bad";

export async function submitChatFeedback(opts: {
  turnId: string;
  rating: ChatFeedbackRating;
  agentId: "secretary" | "executive_steward";
}): Promise<{ ok: boolean; rating: ChatFeedbackRating }> {
  const res = await fetch("/chat/v1/feedback", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      turn_id: opts.turnId,
      rating: opts.rating,
      agent_id: opts.agentId,
    }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `feedback ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; rating: ChatFeedbackRating }>;
}

export async function buildChatFaqIndex(): Promise<{
  ok: boolean;
  indexed: number;
  entries: number;
}> {
  const res = await fetch("/chat/v1/faq/build", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `faq build ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; indexed: number; entries: number }>;
}

export type ChatHistoryMaxTurns = 5 | 10 | 20;

export type ChatThreadMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
  turn_id?: string;
  feedback?: ChatFeedbackRating;
  feedback_at?: string;
};

export async function fetchChatThread(agentId: "secretary" | "executive_steward"): Promise<{
  ok: boolean;
  thread_id: string;
  messages: ChatThreadMessage[];
  settings: { max_turns: ChatHistoryMaxTurns };
}> {
  const q = new URLSearchParams({ agent_id: agentId });
  const res = await fetch(`/chat/v1/thread?${q}`, { ...fetchOpts });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `thread ${res.status}`);
  }
  return res.json() as Promise<{
    ok: boolean;
    thread_id: string;
    messages: ChatThreadMessage[];
    settings: { max_turns: ChatHistoryMaxTurns };
  }>;
}

export type CompanyOrgMember = {
  name: string;
  title: string;
  note?: string;
  operator_id?: string;
  role?: string;
  login_id_ready: boolean;
  community_login_ready: boolean;
  login_passkey_ready: boolean;
  settlement_passkey_ready: boolean;
  rights: Array<"approve" | "wire" | "transfer" | "chat" | "all_agents">;
};

export type CompanyOrgUnitRow = {
  unit_id: string;
  unit_label: string;
  kind: "board" | "department";
  function: string;
  reports_to_label: string;
  depth: number;
  vacant: boolean;
  collegial: boolean;
  members: CompanyOrgMember[];
};

export type CompanyOrgAdvisorRow = {
  kind: "legal" | "tax" | "technical";
  status: "engaged" | "none";
  name?: string;
  firm?: string;
  note?: string;
  contract_id?: string;
};

export type CompanyOrgUserRow = CompanyOrgMember & {
  unit_label?: string;
};

export type OrgChartAgentRow = {
  id: string;
  label: string;
  tier: string;
  scope?: string;
  reports_to?: string;
};

export type OrgChartHistoryRow = {
  as_of: string;
  recorded_at?: string;
  source?: string;
  change_id?: string;
  approval_id?: string;
  notes?: string;
  current?: boolean;
};

type OrgChartShared = {
  ok: true;
  company_name: string;
  path: string;
  agents: {
    configured: boolean;
    operational: OrgChartAgentRow[];
    developer: OrgChartAgentRow[];
    task: OrgChartAgentRow[];
  };
  history: OrgChartHistoryRow[];
  viewing_as_of?: string;
  is_historical: boolean;
  advisors: CompanyOrgAdvisorRow[];
};

export type OrgChartPayload =
  | (OrgChartShared & {
      missing: true;
      message: string;
    })
  | (OrgChartShared & {
      missing: false;
      as_of: string;
      notes?: string;
      nodes: Array<{
        id: string;
        display_name: string;
        title: string;
        function: string;
        layer: "board" | "staff";
        board_role: string;
        reports_to?: string | null;
        employee_id?: string;
      }>;
      units: CompanyOrgUnitRow[];
      users: CompanyOrgUserRow[];
      tree_lines: string[];
      diagram: {
        width: number;
        height: number;
        nodes: Array<{
          id: string;
          label: string;
          sublabel?: string;
          tone?: string;
          kind?: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }>;
        edges: Array<{
          from: string;
          to: string;
          source_x: number;
          source_y: number;
          target_x: number;
          target_y: number;
          points?: Array<{ x: number; y: number }>;
          style?: "solid" | "dashed";
        }>;
      };
    });

export async function fetchOrgChart(asOf?: string): Promise<OrgChartPayload> {
  const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  const res = await fetch(`/chat/v1/org/chart${q}`, { ...fetchOpts });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `org-chart ${res.status}`);
  }
  return res.json() as Promise<OrgChartPayload>;
}

export type AgentInventoryRow = {
  id: string;
  label: string;
  scope: string;
  tier: string;
  enabled: boolean;
  required: boolean;
  owner_desk: boolean;
  locked: boolean;
  lock_reason?: "owner_desk" | "required" | "module_enabled";
  reports_to?: string;
  reports_to_label?: string;
  request_lane: "owner_to_steward" | "owner_to_secretary" | "via_steward";
  bound_modules: string[];
  pending?: { change_id: string; approval_id: string; to_enabled: boolean };
};

export type ModuleInventoryRow = {
  id: string;
  label: string;
  notes?: string;
  installed: boolean;
  enabled: boolean;
  tier: string;
  pending?: { change_id: string; approval_id: string; to_enabled: boolean };
};

export type AgentModuleInventory = {
  ok: boolean;
  can_mutate: boolean;
  can_propose: boolean;
  agents: AgentInventoryRow[];
  agents_available: AgentInventoryRow[];
  modules_installed: ModuleInventoryRow[];
  modules_catalog: ModuleInventoryRow[];
  imported?: string;
  proposed?: boolean;
  change_id?: string;
  approval_id?: string;
};

export async function fetchAgentModuleInventory(): Promise<AgentModuleInventory> {
  return chatApi<AgentModuleInventory>("/chat/v1/agent-modules");
}

export async function setAgentEnabled(
  id: string,
  enabled: boolean,
): Promise<AgentModuleInventory> {
  return chatApi<AgentModuleInventory>(
    `/chat/v1/agent-modules/agents/${encodeURIComponent(id)}/enabled`,
    { method: "POST", body: JSON.stringify({ enabled }) },
  );
}

export async function importCatalogModule(id: string): Promise<AgentModuleInventory> {
  return chatApi<AgentModuleInventory>("/chat/v1/agent-modules/modules/import", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function proposeModuleEnabled(
  id: string,
  enabled: boolean,
): Promise<AgentModuleInventory> {
  return chatApi<AgentModuleInventory>(
    `/chat/v1/agent-modules/modules/${encodeURIComponent(id)}/enabled`,
    { method: "POST", body: JSON.stringify({ enabled }) },
  );
}

export async function fetchChatSettings(): Promise<{ max_turns: ChatHistoryMaxTurns }> {
  const res = await fetch("/chat/v1/settings", { ...fetchOpts });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`settings ${res.status}`);
  const body = (await res.json()) as { ok: boolean; settings: { max_turns: ChatHistoryMaxTurns } };
  return body.settings;
}

export async function updateChatSettings(maxTurns: ChatHistoryMaxTurns): Promise<{
  max_turns: ChatHistoryMaxTurns;
  pruned_threads: number;
}> {
  const res = await fetch("/chat/v1/settings", {
    ...fetchOpts,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_turns: maxTurns }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `settings ${res.status}`);
  }
  const body = (await res.json()) as {
    ok: boolean;
    settings: { max_turns: ChatHistoryMaxTurns };
    pruned_threads: number;
  };
  return { max_turns: body.settings.max_turns, pruned_threads: body.pruned_threads };
}

export type AgentInboxScope = "executive_steward" | "secretary";

export type AgentInboxItem = {
  mission_id: string;
  agent: string;
  agent_label: string;
  subject: string;
  summary?: string;
  summary_path?: string;
  work_order_id?: string;
  work_order_status?: string;
  submitted_at?: string;
  created_at: string;
  relay_steward: string;
  unread: boolean;
};

export type AgentInboxSnapshot = {
  ok: boolean;
  generated_at: string;
  for: AgentInboxScope;
  unread_count: number;
  items: AgentInboxItem[];
  pending_orders: AgentInboxItem[];
};

export async function fetchAgentInbox(scope: AgentInboxScope): Promise<AgentInboxSnapshot> {
  const q = new URLSearchParams({ for: scope });
  const res = await fetch(`/chat/v1/agent-inbox?${q}`, { ...fetchOpts });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `agent-inbox ${res.status}`);
  }
  return res.json() as Promise<AgentInboxSnapshot>;
}

export async function fetchAgentSummary(path: string): Promise<{ path: string; markdown: string }> {
  const q = new URLSearchParams({ path });
  const res = await fetch(`/chat/v1/agent-inbox/summary?${q}`, { ...fetchOpts });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `summary ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; path: string; markdown: string };
  return { path: body.path, markdown: body.markdown };
}

export async function ackAgentInbox(
  missionId: string,
  notes?: string
): Promise<AgentInboxItem> {
  const res = await fetch("/chat/v1/agent-inbox/ack", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission_id: missionId, ...(notes ? { notes } : {}) }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `ack ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; item: AgentInboxItem };
  return body.item;
}

export type AgentInboxDelegateRequest = {
  confirmed: true;
  subject: string;
  requirements: string;
  background?: string;
  path?: string;
  priority?: "P0" | "P1" | "P2" | "P3";
  from?: AgentInboxScope;
};

export type AgentInboxDelegateResult = {
  ok: boolean;
  parent_id?: string;
  work_order_ids: string[];
  work_orders: Array<{ id: string; agent: string; status: string }>;
  agents: string[];
  snapshot?: AgentInboxSnapshot;
};

export async function delegateAgentInbox(
  req: AgentInboxDelegateRequest
): Promise<AgentInboxDelegateResult> {
  const res = await fetch("/chat/v1/agent-inbox/delegate", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `delegate ${res.status}`);
  }
  return res.json() as Promise<AgentInboxDelegateResult>;
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
  },
  opts?: {
    agentId?: "secretary" | "executive_steward";
    llmRoute?: LlmRouteHint;
  },
): Promise<void> {
  const res = await fetch("/chat/v1/message/stream", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      ...(opts?.agentId ? { agent_id: opts.agentId } : {}),
      ...(opts?.llmRoute ? { llm_route: opts.llmRoute } : {}),
    }),
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
