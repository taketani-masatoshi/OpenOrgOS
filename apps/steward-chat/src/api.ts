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

export async function fetchLlmWorkers(): Promise<LlmWorkersSnapshot> {
  const res = await chatApi<{ ok: boolean } & LlmWorkersSnapshot>(
    "/chat/v1/llm/workers",
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

export async function approveExpenseClaimApi(body: {
  claim_id: string;
  approver_id?: string;
  co_approver_id?: string;
  board_event_id?: string;
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
  return chatApi<OrgBudgetPayload>(`/chat/v1/org/budget${query}`);
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
    allow_credentials: challenge.allow_credentials,
    hints: ["hybrid"],
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

export async function sendMessage(
  message: string,
  agentId?: "secretary" | "executive_steward"
): Promise<{
  ok: boolean;
  reply: string;
  runtime?: string;
  model?: string;
  structured?: OperatorStructured;
}> {
  const res = await fetch("/chat/v1/message", {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...(agentId ? { agent_id: agentId } : {}) }),
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
  }>;
}

export type ChatHistoryMaxTurns = 5 | 10 | 20;

export type ChatThreadMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
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

export type OrgChartPayload =
  | {
      ok: true;
      missing: true;
      company_name: string;
      path: string;
      message: string;
    }
  | {
      ok: true;
      missing: false;
      company_name: string;
      as_of: string;
      notes?: string;
      path: string;
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
    };

export async function fetchOrgChart(): Promise<OrgChartPayload> {
  const res = await fetch("/chat/v1/org/chart", { ...fetchOpts });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `org-chart ${res.status}`);
  }
  return res.json() as Promise<OrgChartPayload>;
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
