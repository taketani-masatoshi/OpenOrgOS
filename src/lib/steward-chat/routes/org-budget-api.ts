import type { IncomingMessage, ServerResponse } from "node:http";
import type { BudgetDelegationScope } from "../../../../schemas/finance/chart-of-accounts.js";
import type { OperatorRecord } from "../../../../schemas/org/operator.js";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { resolveOperatorFromSessionUser } from "../../console-auth/operator-rbac.js";
import {
  requireAnyBudgetSurfacePermission,
  requireBudgetSurfacePermission,
  resolveBudgetActor,
} from "../../console-auth/surface-guard.js";
import {
  ClaimPersonMismatchError,
  isClaimOnlySeat,
  resolveClaimOrgUnitId,
  resolveIngestPersonId,
  resolveOperatorClaimPersonId,
} from "../../org/operator-claim-person.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { parseBudgetMutationBody } from "../../org/budget-api-input.js";
import {
  allocateDepartmentCategoryBudget,
  allocateMemberBudget,
  allocatePersonCategoryBudget,
  budgetDelegationRevision,
  BudgetRevisionConflictError,
  budgetDelegationScopeForAccount,
  budgetDelegationSummary,
  budgetAdjustmentRange,
  commitMemberBudget,
  formatBudgetDelegationError,
  initializeCompanyBudget,
  listAvailableBudgetFiscalYears,
  listBudgetCategoryCatalog,
  loadBudgetDelegation,
  normalizeBudgetFiscalYear,
  proposeCompanyBudgetTotal,
  proposeDepartmentBudgetTotal,
  resolveActiveBudgetFiscalYear,
  setCompanyCategoryBudget,
  isPlanIncreasesLocked,
  resolveBudgetPlanGovernance,
} from "../../org/budget-delegation.js";
import type { BudgetMutability } from "../../../../schemas/finance/chart-of-accounts.js";
import { resolveBusinessPlanBudgetReference } from "../../org/business-plan-budget-reference.js";
import {
  initMidYearOutlook,
  OutlookRevisionConflictError,
  proposeEnvelopeFromOutlook,
  publishMidYearOutlook,
  resolveMidYearOutlook,
  setDepartmentOutlook,
  setOutlookAsOf,
  setOutlookRemainingTotals,
  syncOutlookFromYojitsu,
} from "../../org/plan-outlook.js";
import { loadOrgAuthority } from "../../org/org-authority.js";
import { loadOrgChart } from "../../org/org-chart.js";
import {
  listActiveOperators,
  listOutlookPublishCandidates,
} from "../../org/operators.js";
import { appendChatAudit } from "../audit.js";
import {
  loadChartOfAccounts,
  loadMonthlyFinances,
  loadYojitsuFyPlan,
} from "../../data.js";
import {
  buildPayrollMonthlyReconcile,
  buildPayrollPersonReconcile,
} from "../../finance/payroll-monthly-reconcile.js";
import {
  groupByOrgUnit,
  rollupMonthlyExpenseAllocations,
} from "../../finance/cost-allocation-rollup.js";
import {
  budgetPersonBelongsToDepartment,
  loadBudgetPeople,
} from "../../hr/person-directory.js";
import {
  approveExpenseClaim,
  evaluateExpenseClaimGate,
  expenseClaimsRevision,
  ExpenseClaimItemRevisionConflictError,
  ExpenseClaimsRevisionConflictError,
  findExpenseClaim,
  ingestExpenseReceiptQr,
  listExpenseClaims,
  loadExpenseClaims,
  markExpenseClaimReimbursed,
  prepareExpenseClaimReimbursementTransfer,
  rejectExpenseClaim,
} from "../../finance/expense-claim.js";
import { loadReceiptSnapshot } from "../../receipt-qr.js";
import { listExpenseClaimRepresentatives } from "../../finance/expense-claim-approver.js";
import { listExpenseClaimSettlementCandidates } from "../../finance/expense-claim-bank-match.js";
import { listCompanyEvents } from "../../company-events.js";
import {
  EXPENSE_CLAIM_BOARD_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  EXPENSE_CLAIM_RINGI_SUBJECT,
  expenseClaimAllocationSchema,
} from "../../../../schemas/finance/expense-claim.js";
import { listOrgApprovals } from "../../org/approval/index.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBudgetJson(req: IncomingMessage): Promise<unknown> {
  return readJsonLimited(req, 64 * 1024);
}

function parseExpectedClaimsRevision(
  body: Record<string, unknown>,
): string | null {
  const raw = body.expected_claims_revision;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  return value;
}

function parseExpectedClaimRevision(
  body: Record<string, unknown>,
): string | null {
  const raw = body.expected_claim_revision;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  return value;
}

function isClaimsRevisionConflict(
  error: unknown,
): error is
  | ExpenseClaimsRevisionConflictError
  | ExpenseClaimItemRevisionConflictError {
  return (
    error instanceof ExpenseClaimsRevisionConflictError ||
    error instanceof ExpenseClaimItemRevisionConflictError
  );
}

function jsonRevisionConflict(
  res: ServerResponse,
  error: {
    message: string;
    currentRevision: string;
    expectedRevision: string;
  },
): void {
  json(res, 409, {
    ok: false,
    error: error.message,
    code: "revision_conflict",
    current_revision: error.currentRevision,
    expected_revision: error.expectedRevision,
  });
}

function relativePath(pathname: string): string | null {
  for (const prefix of ["/chat/v1/org/budget", "/api/v1/org/budget"]) {
    if (pathname === prefix) return "/";
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return null;
}

function actorFromUser(user: WireConsoleUser): OperatorRecord {
  return resolveBudgetActor(user);
}

function statusForBudgetError(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("revision conflict")) return 409;
  if (
    lower.includes("requires") ||
    lower.includes("only the member") ||
    lower.includes("not a member") ||
    lower.includes("unknown active") ||
    lower.includes("権限") ||
    (lower.includes("person ") && lower.includes(" is not in "))
  ) {
    return 403;
  }
  if (message.includes("自己承認")) return 422;
  return 422;
}

function auditMutation(
  user: WireConsoleUser,
  pathname: string,
  detail: string,
  ok: boolean,
): void {
  appendChatAudit({
    action: "message",
    operator_id: user.operator_id,
    approver_id: user.approver_id,
    ok,
    path: pathname,
    detail,
  });
}

function orgUnitLabel(orgUnitId: string): string {
  const chart = loadOrgChart();
  const node = chart?.nodes.find((row) => row.id === orgUnitId);
  return node?.display_name ?? orgUnitId;
}

function operatorLabel(operatorId: string): string {
  const op = listActiveOperators().find(
    (row) => row.operator_id === operatorId,
  );
  return op?.display_name ?? operatorId;
}

type BudgetCategoryRow = {
  account_code: string;
  account_name: string;
  budget_delegation: BudgetDelegationScope;
  person_allocatable: boolean;
  allocation_yen: number;
  actual_yen: number;
  variance_yen: number;
};

export function buildOrgBudgetPayload(
  user: WireConsoleUser,
  opts?: { fiscalYear?: string },
): {
  ok: true;
  initialized: boolean;
  fiscal_year?: string;
  active_fiscal_year: string;
  available_fiscal_years: string[];
  fy_is_active: boolean;
  currency?: "JPY";
  /** Optimistic concurrency token (last BDE event id, or "0"). */
  revision: string;
  updated_at: string | null;
  event_count: number;
  /** Expense-claims YAML optimistic concurrency token (decimal string). */
  claims_revision: string;
  summary?: ReturnType<typeof budgetDelegationSummary>;
  planning: {
    baseline_yen?: number;
    business_plan_status: string;
    approval_id?: string;
    approved_at?: string;
    has_board_evidence: boolean;
    is_fixed: boolean;
    /**
     * ADR 0027: true when business plan is unapproved — envelope *increases* blocked.
     * Within-envelope reallocation remains allowed.
     */
    increases_locked: boolean;
    /** @deprecated Alias of increases_locked (true = 増額不可). */
    adjustments_locked: boolean;
    totals_require_approval: boolean;
    source: string;
    company_adjustment_pct: number;
    company_min_yen?: number;
    company_max_yen?: number;
    company_within_adjustment_range?: boolean;
    department_adjustment_pct: number;
    require_adjustment_reference: boolean;
    person_allocation_mode: "strict";
  };
  /** Read-only revenue / expense budgets from current business plan FY. */
  plan_reference: ReturnType<typeof resolveBusinessPlanBudgetReference>;
  /** Mid-year outlook (ADR 0029) — does not mutate plan or envelope. */
  outlook_reference: ReturnType<typeof resolveMidYearOutlook>;
  /**
   * Payroll / compensation lane (read-only). Not part of personal expense envelopes.
   * SSOT: data/finance/payroll.yaml · books: monthly category payroll.
   */
  payroll_reference: {
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
  /**
   * Person-scoped payroll (by person_id → employee_id).
   * Personal wallet uses this; company totals stay in payroll_reference.
   */
  payroll_by_person: Record<
    string,
    {
      person_id: string;
      employee_id?: string;
      kind: "officer" | "employee" | "none";
      display_name: string;
      role?: string;
      expected_monthly_yen: number;
      fiscal_year: string;
      period_from: string;
      period_to: string;
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
  /**
   * Outlook confirm/publish candidates (publisher ≠ editor).
   * CEO / approver / chat:approve only — not secretary/agent operators.
   */
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
  /** Allocatable CoA accounts only — editor dropdown source. */
  budget_categories?: Array<{
    account_code: string;
    account_name: string;
    budget_delegation: BudgetDelegationScope;
    budget_mutability: BudgetMutability;
    person_allocatable: boolean;
  }>;
  /** Derived / planned CoA accounts — read-only reference from expense-plan SSOT. */
  reference_categories?: Array<{
    account_code: string;
    account_name: string;
    budget_delegation: BudgetDelegationScope;
    budget_mutability: BudgetMutability;
    reference_yen?: number;
    source_path?: string;
  }>;
  company_categories?: BudgetCategoryRow[];
  sources?: Array<{
    label: string;
    path: string;
    status: "valid" | "missing";
    record_count: number;
    detail: string;
  }>;
  departments?: Array<{
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
    categories: BudgetCategoryRow[];
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
      categories: BudgetCategoryRow[];
      purpose?: string;
    }>;
    candidate_people: Array<{
      person_id: string;
      display_name: string;
      display_source: "employees" | "workforce" | "org_chart";
      person_type: "employee" | "contractor" | "other";
    }>;
  }>;
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
    proposed_by_operator_id: string;
    proposed_at: string;
    status: "pending" | "applied" | "superseded";
  }>;
  proposed_approval?: {
    approval_id: string;
    change_id: string;
    kind: "company_total" | "department_total";
    escalation?: "within_policy" | "beyond_policy";
    message: string;
  };
  expense_claims?: Array<{
    claim_id: string;
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
    co_approved_by?: string;
    reimbursement?: {
      status: string;
      amount_yen?: number;
      requested_at?: string;
      due_on?: string;
      paid_at?: string;
      paid_by?: string;
      payment_ref?: string;
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
  viewer: {
    operator_id: string;
    role: OperatorRecord["role"];
    managed_org_units: string[];
    can_set_company: boolean;
    can_allocate_department: boolean;
  };
} {
  const actor = actorFromUser(user);
  const authority = loadOrgAuthority();
  const managed = (authority?.units ?? [])
    .filter((unit) => unit.head_operator_id === actor.operator_id)
    .map((unit) => unit.org_unit_id);
  const isCeo = actor.role === "ceo";
  const isDeptHead = managed.length > 0;
  const viewer = {
    operator_id: actor.operator_id,
    role: actor.role,
    managed_org_units: managed,
    can_set_company: isCeo,
    can_allocate_department: isCeo || isDeptHead,
  };

  const activeFiscalYear = resolveActiveBudgetFiscalYear();
  const fy = opts?.fiscalYear?.trim()
    ? normalizeBudgetFiscalYear(opts.fiscalYear)
    : activeFiscalYear;
  const availableFiscalYears = listAvailableBudgetFiscalYears();
  const fyMeta = {
    fiscal_year: fy,
    active_fiscal_year: activeFiscalYear,
    available_fiscal_years: availableFiscalYears,
    fy_is_active: fy === activeFiscalYear,
  };

  const file = loadBudgetDelegation({ fiscalYear: fy });
  const planGovernance = resolveBudgetPlanGovernance(fy);
  const planReference = resolveBusinessPlanBudgetReference(fy);
  const outlookReference = resolveMidYearOutlook({
    fiscalYear: fy,
  });
  const outlookOperators = listOutlookPublishCandidates();
  const policy = file?.adjustment_policy ?? {
    company_max_adjustment_pct: 20,
    department_max_adjustment_pct: 20,
    require_adjustment_reference: true,
    person_allocation_mode: "strict" as const,
  };
  const companyRange =
    planGovernance.baseline_yen != null
      ? budgetAdjustmentRange(
          planGovernance.baseline_yen,
          policy.company_max_adjustment_pct,
        )
      : undefined;
  const planning = {
    baseline_yen: planGovernance.baseline_yen,
    business_plan_status: planGovernance.business_plan_status,
    approval_id: planGovernance.approval_id,
    approved_at: planGovernance.approved_at,
    has_board_evidence: planGovernance.has_board_evidence,
    is_fixed: planGovernance.is_fixed,
    increases_locked: isPlanIncreasesLocked(
      planGovernance.business_plan_status,
    ),
    adjustments_locked: isPlanIncreasesLocked(
      planGovernance.business_plan_status,
    ),
    totals_require_approval: true,
    source: planGovernance.source,
    company_adjustment_pct: policy.company_max_adjustment_pct,
    company_min_yen: companyRange?.min_yen,
    company_max_yen: companyRange?.max_yen,
    company_within_adjustment_range:
      companyRange == null || file == null
        ? undefined
        : file.company_budget_yen >= companyRange.min_yen &&
          file.company_budget_yen <= companyRange.max_yen,
    department_adjustment_pct: policy.department_max_adjustment_pct,
    require_adjustment_reference: policy.require_adjustment_reference,
    person_allocation_mode: policy.person_allocation_mode,
  };
  const payrollFy = fy ?? activeFiscalYear;
  const payrollReconcile = buildPayrollMonthlyReconcile({
    basis: "actual",
    fiscalYear: payrollFy,
  });
  const payroll_reference = {
    account_code: payrollReconcile.account_code,
    source_payroll: payrollReconcile.source_payroll,
    fiscal_year: payrollReconcile.fiscal_year,
    period_from: payrollReconcile.period_from,
    period_to: payrollReconcile.period_to,
    period_source: payrollReconcile.period_source,
    expected_monthly_yen: payrollReconcile.expected_monthly_yen,
    officer_monthly_yen: payrollReconcile.officer_monthly_yen,
    employee_monthly_yen: payrollReconcile.employee_monthly_yen,
    officers: payrollReconcile.officers,
    employee_ids: payrollReconcile.employee_ids,
    actual_months: payrollReconcile.actual_months,
    empty_actual_months: payrollReconcile.empty_actual_months,
    actual_booked_yen: payrollReconcile.actual_booked_yen,
    actual_expected_yen: payrollReconcile.actual_expected_yen,
    actual_variance_yen: payrollReconcile.actual_variance_yen,
    ok: payrollReconcile.ok,
    notes: payrollReconcile.notes,
    months: payrollReconcile.months.map((row) => ({
      month: row.month,
      basis: row.basis,
      booked_yen: row.booked_yen,
      expected_yen: row.expected_yen,
      variance_yen: row.variance_yen,
    })),
  };
  const budgetPeopleEarly = loadBudgetPeople();
  const payroll_by_person: Record<
    string,
    {
      person_id: string;
      employee_id?: string;
      kind: "officer" | "employee" | "none";
      display_name: string;
      role?: string;
      expected_monthly_yen: number;
      fiscal_year: string;
      period_from: string;
      period_to: string;
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
  > = {};
  for (const person of budgetPeopleEarly) {
    if (!person.employee_id) {
      payroll_by_person[person.person_id] = {
        person_id: person.person_id,
        kind: "none",
        display_name: person.display_name,
        expected_monthly_yen: 0,
        fiscal_year: payroll_reference.fiscal_year,
        period_from: payroll_reference.period_from,
        period_to: payroll_reference.period_to,
        actual_months: 0,
        empty_actual_months: 0,
        actual_booked_yen: 0,
        actual_expected_yen: 0,
        actual_variance_yen: 0,
        ok: true,
        account_code: payroll_reference.account_code,
        months: [],
      };
      continue;
    }
    const slice = buildPayrollPersonReconcile({
      employeeId: person.employee_id,
      basis: "actual",
      displayName: person.display_name,
      fiscalYear: payrollFy,
    });
    payroll_by_person[person.person_id] = {
      person_id: person.person_id,
      employee_id: person.employee_id,
      kind: slice.kind,
      display_name: slice.display_name,
      role: slice.role,
      expected_monthly_yen: slice.expected_monthly_yen,
      fiscal_year: slice.fiscal_year,
      period_from: slice.period_from,
      period_to: slice.period_to,
      actual_months: slice.actual_months,
      empty_actual_months: slice.empty_actual_months,
      actual_booked_yen: slice.actual_booked_yen,
      actual_expected_yen: slice.actual_expected_yen,
      actual_variance_yen: slice.actual_variance_yen,
      ok: slice.ok,
      account_code: slice.account_code,
      months: slice.months.map((row) => ({
        month: row.month,
        basis: row.basis,
        booked_yen: row.booked_yen,
        expected_yen: row.expected_yen,
        variance_yen: row.variance_yen,
      })),
    };
  }
  if (!file) {
    const emptyRev = budgetDelegationRevision(null);
    return {
      ok: true,
      initialized: false,
      ...fyMeta,
      revision: emptyRev.revision,
      updated_at: emptyRev.updated_at,
      event_count: emptyRev.event_count,
      claims_revision: expenseClaimsRevision(loadExpenseClaims()),
      planning,
      plan_reference: planReference,
      outlook_reference: outlookReference,
      payroll_reference,
      payroll_by_person,
      outlook_operators: outlookOperators,
      viewer,
    };
  }

  const summary = budgetDelegationSummary(file);
  const yojitsu = loadYojitsuFyPlan(file.fiscal_year);
  const fiscalMonths = new Set(yojitsu?.months.map((month) => month.month));
  const fiscalYearNumber = file.fiscal_year.match(/\d{4}/)?.[0];
  const monthly = loadMonthlyFinances();
  const actualMonths = monthly.filter(
    (month) =>
      month.basis === "actual" &&
      (fiscalMonths.size > 0
        ? fiscalMonths.has(month.month)
        : fiscalYearNumber
          ? month.month.startsWith(`${fiscalYearNumber}-`)
          : true),
  );
  const actualRows = rollupMonthlyExpenseAllocations(actualMonths);
  const actualByOrg = new Map(
    groupByOrgUnit(actualRows).map((row) => [
      row.org_unit_id,
      row.actual_amount,
    ]),
  );
  const allocatedActualYen = [...actualByOrg.entries()]
    .filter(([orgUnitId]) => orgUnitId !== "UNALLOCATED")
    .reduce((sum, [, amount]) => sum + amount, 0);
  const unallocatedActualYen = actualByOrg.get("UNALLOCATED") ?? 0;
  const chartOfAccounts = loadChartOfAccounts();
  const expenseAccounts = chartOfAccounts.accounts.filter(
    (account) => account.type === "expense",
  );
  const expenseAccountCodes = new Set(
    expenseAccounts.map((account) => account.code),
  );
  const categoryCatalog = listBudgetCategoryCatalog(file.fiscal_year);
  const allocatableAccountCodes = new Set(
    categoryCatalog
      .filter((entry) => entry.ui_editable)
      .map((entry) => entry.account_code),
  );
  /** Personal envelope actuals exclude payroll / company-planned accounts. */
  const personEnvelopeAccountCodes = new Set(
    expenseAccounts
      .filter(
        (account) => (account.budget_delegation ?? "department") === "person",
      )
      .map((account) => account.code),
  );
  const accountName = new Map(
    expenseAccounts.map((account) => [account.code, account.name]),
  );
  const companyActualByAccount = new Map<string, number>();
  const departmentActualByAccount = new Map<string, number>();
  const employeeActualByAccount = new Map<string, number>();
  const addActual = (map: Map<string, number>, key: string, amount: number) => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };
  for (const month of actualMonths) {
    for (const expense of month.expenses) {
      const accountCode =
        expense.chart_account_code ??
        chartOfAccounts.category_mapping.expense[expense.category];
      if (!accountCode || !expenseAccountCodes.has(accountCode)) continue;
      const amount = Math.abs(expense.amount);
      addActual(companyActualByAccount, accountCode, amount);
      for (const allocation of expense.allocations ?? []) {
        addActual(
          departmentActualByAccount,
          `${allocation.org_unit_id}|${accountCode}`,
          allocation.amount,
        );
        if (allocation.employee_id) {
          addActual(
            employeeActualByAccount,
            `${allocation.org_unit_id}|${allocation.employee_id}|${accountCode}`,
            allocation.amount,
          );
        }
      }
    }
  }
  const categoryRows = (
    budgets: Array<{ account_code: string; allocation_yen: number }>,
    actualFor: (accountCode: string) => number,
  ): BudgetCategoryRow[] =>
    budgets.map((category) => {
      const actualYen = actualFor(category.account_code);
      const scope = budgetDelegationScopeForAccount(category.account_code);
      return {
        account_code: category.account_code,
        account_name:
          accountName.get(category.account_code) ?? category.account_code,
        budget_delegation: scope,
        person_allocatable: scope === "person",
        allocation_yen: category.allocation_yen,
        actual_yen: actualYen,
        variance_yen: category.allocation_yen - actualYen,
      };
    });
  const people = budgetPeopleEarly;
  const operators = listActiveOperators();
  const departments = file.departments.map((department) => {
    const rollup = summary.departments.find(
      (row) => row.org_unit_id === department.org_unit_id,
    )!;
    const authorityUnit = authority?.units.find(
      (unit) => unit.org_unit_id === department.org_unit_id,
    );
    const members = department.member_budgets.map((member) => {
      const personId = member.person_id ?? member.operator_id!;
      const person = people.find((row) => row.person_id === personId);
      const legacyOperator = member.operator_id
        ? operators.find(
            (operator) => operator.operator_id === member.operator_id,
          )
        : undefined;
      const personActual = person?.employee_id
        ? [...employeeActualByAccount.entries()]
            .filter(([key]) => {
              const prefix = `${department.org_unit_id}|${person.employee_id}|`;
              if (!key.startsWith(prefix)) return false;
              const accountCode = key.slice(prefix.length);
              return personEnvelopeAccountCodes.has(accountCode);
            })
            .reduce((sum, [, amount]) => sum + amount, 0)
        : 0;
      return {
        person_id: personId,
        display_name:
          person?.display_name ?? legacyOperator?.display_name ?? personId,
        display_source: person?.source ?? ("legacy" as const),
        person_type: person?.person_type ?? ("other" as const),
        employee_id: person?.employee_id,
        allocation_yen: member.allocation_yen,
        committed_yen: member.committed_yen,
        available_yen: member.allocation_yen - member.committed_yen,
        actual_yen: personActual,
        variance_yen: member.allocation_yen - personActual,
        allocation_status:
          personActual > member.allocation_yen
            ? ("over_budget" as const)
            : ("within_budget" as const),
        categories: categoryRows(member.category_budgets, (accountCode) =>
          person?.employee_id
            ? (employeeActualByAccount.get(
                `${department.org_unit_id}|${person.employee_id}|${accountCode}`,
              ) ?? 0)
            : 0,
        ),
        purpose: member.purpose,
      };
    });
    const candidate_people = people
      .filter(
        (person) =>
          isCeo ||
          budgetPersonBelongsToDepartment(person, department.org_unit_id),
      )
      .map((person) => ({
        person_id: person.person_id,
        display_name: person.display_name,
        display_source: person.source,
        person_type: person.person_type,
      }));
    const baselineYen =
      authorityUnit?.budget_plan_man != null
        ? Math.round(authorityUnit.budget_plan_man * 10_000)
        : undefined;
    const departmentRange =
      baselineYen != null
        ? budgetAdjustmentRange(
            baselineYen,
            policy.department_max_adjustment_pct,
          )
        : undefined;
    return {
      org_unit_id: department.org_unit_id,
      org_unit_label: orgUnitLabel(department.org_unit_id),
      head_operator_id: department.head_operator_id,
      head_label: operatorLabel(department.head_operator_id),
      allocation_yen: rollup.allocation_yen,
      member_allocated_yen: rollup.member_allocated_yen,
      committed_yen: rollup.committed_yen,
      available_to_delegate_yen: rollup.available_to_delegate_yen,
      authority_plan_man: authorityUnit?.budget_plan_man,
      baseline_yen: baselineYen,
      adjustment_min_yen: departmentRange?.min_yen,
      adjustment_max_yen: departmentRange?.max_yen,
      within_adjustment_range:
        departmentRange == null
          ? undefined
          : department.allocation_yen >= departmentRange.min_yen &&
            department.allocation_yen <= departmentRange.max_yen,
      actual_yen: actualByOrg.get(department.org_unit_id) ?? 0,
      variance_yen:
        rollup.allocation_yen - (actualByOrg.get(department.org_unit_id) ?? 0),
      burn_pct:
        rollup.allocation_yen > 0
          ? Math.round(
              ((actualByOrg.get(department.org_unit_id) ?? 0) /
                rollup.allocation_yen) *
                1000,
            ) / 10
          : null,
      categories: categoryRows(
        department.category_budgets.filter((row) =>
          allocatableAccountCodes.has(row.account_code),
        ),
        (accountCode) =>
          departmentActualByAccount.get(
            `${department.org_unit_id}|${accountCode}`,
          ) ?? 0,
      ),
      members,
      candidate_people,
    };
  });

  const rev = budgetDelegationRevision(file);
  return {
    ok: true,
    initialized: true,
    ...fyMeta,
    fiscal_year: file.fiscal_year,
    currency: file.currency,
    revision: rev.revision,
    updated_at: rev.updated_at,
    event_count: rev.event_count,
    claims_revision: expenseClaimsRevision(loadExpenseClaims()),
    summary,
    planning,
    plan_reference: planReference,
    outlook_reference: outlookReference,
    payroll_reference,
    payroll_by_person,
    outlook_operators: outlookOperators,
    actuals: {
      actual_yen: allocatedActualYen + unallocatedActualYen,
      allocated_actual_yen: allocatedActualYen,
      unallocated_actual_yen: unallocatedActualYen,
      actual_months: actualMonths.length,
      actual_as_of: actualMonths.at(-1)?.month,
    },
    budget_categories: categoryCatalog
      .filter((entry) => entry.ui_editable)
      .map((entry) => ({
        account_code: entry.account_code,
        account_name: entry.account_name,
        budget_delegation: entry.budget_delegation,
        budget_mutability: entry.budget_mutability,
        person_allocatable: entry.person_allocatable,
      })),
    reference_categories: categoryCatalog
      .filter((entry) => !entry.ui_editable)
      .map((entry) => ({
        account_code: entry.account_code,
        account_name: entry.account_name,
        budget_delegation: entry.budget_delegation,
        budget_mutability: entry.budget_mutability,
        reference_yen: entry.reference_yen,
        source_path: entry.source_path,
      })),
    company_categories: categoryRows(
      file.company_category_budgets.filter((row) =>
        allocatableAccountCodes.has(row.account_code),
      ),
      (accountCode) => companyActualByAccount.get(accountCode) ?? 0,
    ),
    sources: [
      {
        label: "事業計画",
        path: "data/plans/business-plan.yaml",
        status:
          planReference.business_plan_status !== "missing"
            ? "valid"
            : "missing",
        record_count: planReference.business_plan_revenue_yen != null ? 1 : 0,
        detail: `売上計画 ${planReference.business_plan_revenue_yen ?? "—"} · 状態 ${planReference.business_plan_status}`,
      },
      {
        label: "売上予算（revenue-plan）",
        path: "data/plans/revenue-plan.yaml",
        status: planReference.revenue_plan_yen != null ? "valid" : "missing",
        record_count: planReference.revenue_lines.length,
        detail:
          planReference.revenue_plan_yen != null
            ? `合計 ${planReference.revenue_plan_yen}円 · ${planReference.period_from ?? "?"}〜${planReference.period_to ?? "?"}`
            : "当該FYなし",
      },
      {
        label: "経費予算（expense-plan）",
        path: "data/plans/expense-plan.yaml",
        status: planReference.expense_plan_yen != null ? "valid" : "missing",
        record_count: planReference.expense_lines.length,
        detail:
          planReference.expense_plan_yen != null
            ? `合計 ${planReference.expense_plan_yen}円（階層予算の基準）`
            : "当該FYなし",
      },
      {
        label: "階層予算台帳",
        path: `data/org/budget-delegations-${file.fiscal_year.toLowerCase()}.yaml`,
        status: "valid",
        record_count: file.events.length,
        detail: `${file.departments.length}部門 · ${file.fiscal_year}`,
      },
      {
        label: "部門権限・予算概観",
        path: "data/org/org-authority.yaml",
        status: authority ? "valid" : "missing",
        record_count: authority?.units.length ?? 0,
        detail: "部門責任者と予算権限",
      },
      {
        label: "月次会計実績",
        path: "data/finance/monthly/*.yaml",
        status: actualMonths.length > 0 ? "valid" : "missing",
        record_count: actualMonths.length,
        detail: actualMonths.length
          ? `確定 ${actualMonths[0]!.month}〜${actualMonths.at(-1)!.month}`
          : "確定実績なし",
      },
      {
        label: "年度予実計画",
        path: `data/plans/yojitsu-${file.fiscal_year.toLowerCase()}.yaml`,
        status: yojitsu ? "valid" : "missing",
        record_count: yojitsu?.months.length ?? 0,
        detail: yojitsu ? `${yojitsu.months.length}か月` : "正本未検出",
      },
    ],
    departments,
    events: file.events.slice(-20).reverse(),
    pending_changes: (file.pending_changes ?? [])
      .filter((change) => change.status === "pending")
      .map((change) => ({
        change_id: change.change_id,
        approval_id: change.approval_id,
        kind: change.kind,
        amount_yen: change.amount_yen,
        org_unit_id: change.org_unit_id,
        reference: change.reference,
        escalation: change.escalation ?? "within_policy",
        proposed_by_operator_id: change.proposed_by_operator_id,
        proposed_at: change.proposed_at,
        status: change.status,
      })),
    expense_claims: listExpenseClaims().map((claim) => ({
      claim_id: claim.claim_id,
      claim_revision: claim.claim_revision ?? 0,
      status: claim.status,
      gate: claim.gate,
      person_id: claim.person_id,
      org_unit_id: claim.org_unit_id,
      account_code: claim.account_code,
      allocations: claim.allocations,
      amount_yen: claim.amount_yen,
      receipt_id: claim.receipt_id,
      approval_id: claim.approval_id,
      proposed_by: claim.proposed_by,
      proposed_at: claim.proposed_at,
      issuer_org_id: claim.issuer.org_id,
      wire_ready: claim.issuer.wire_ready,
      wire_claim_event_id: claim.wire_claim_event_id,
      notes: claim.notes,
      monthly_ref: claim.monthly_ref,
      recipient_name: claim.recipient_name,
      transaction_date: claim.transaction_date,
      deadline_status: claim.deadline_status,
      days_after_transaction: claim.days_after_transaction,
      account_suggestion: claim.account_suggestion,
      invoice_verification: claim.invoice_verification,
      board_event_id: claim.board_event_id,
      co_approved_by: claim.co_approved_by,
      reject_reason: claim.reject_reason,
      rejected_by: claim.rejected_by,
      rejected_at: claim.rejected_at,
      reimbursement: claim.reimbursement,
    })),
    expense_claim_approvals: listOrgApprovals({
      scope: "internal",
      status: "pending_approval",
    })
      .filter(
        (a) =>
          a.subject_type === EXPENSE_CLAIM_MANAGER_SUBJECT ||
          a.subject_type === EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT ||
          a.subject_type === EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT ||
          a.subject_type === EXPENSE_CLAIM_BOARD_SUBJECT ||
          a.subject_type === EXPENSE_CLAIM_RINGI_SUBJECT,
      )
      .map((a) => ({
        approval_id: a.approval_id,
        subject_ref: a.subject_ref,
        proposed_by: a.proposed_by,
        proposed_at: a.proposed_at,
        message: a.message,
        amount: a.amount,
      })),
    person_account_catalog: categoryCatalog
      .filter((entry) => entry.person_allocatable)
      .map((entry) => ({
        account_code: entry.account_code,
        account_name: entry.account_name,
      })),
    expense_claim_representatives: listExpenseClaimRepresentatives(),
    expense_claim_board_events: listCompanyEvents({ includeVoided: false })
      .filter(
        (event) =>
          ["meeting", "governance"].includes(event.kind) &&
          (event.status === "closed" || event.status === "archived"),
      )
      .slice(0, 40)
      .map((event) => ({
        event_id: event.id,
        title: event.title,
        status: event.status,
        kind: event.kind,
      })),
    expense_claim_settlement_candidates: Object.fromEntries(
      listExpenseClaims()
        .filter(
          (claim) =>
            claim.status === "pending_reimbursement" ||
            claim.status === "posted",
        )
        .map((claim) => [
          claim.claim_id,
          listExpenseClaimSettlementCandidates(claim.claim_id),
        ]),
    ),
    viewer,
  };
}

/**
 * Employee claim desk: the viewer's own envelope and own claims only.
 * A projection of the console payload — no company or peer figures.
 */
export function buildClaimDeskPayload(
  user: WireConsoleUser,
  opts?: { fiscalYear?: string },
):
  | {
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
  | { ok: false; error: string; code: "no_envelope" } {
  const actor = resolveBudgetActor(user);
  const personId = resolveOperatorClaimPersonId(actor);
  const payload = buildOrgBudgetPayload(user, opts);
  if (!personId) {
    return {
      ok: false,
      error: "operator has no personal envelope",
      code: "no_envelope",
    };
  }
  const departments = payload.departments ?? [];
  let member: (typeof departments)[number]["members"][number] | undefined;
  let orgUnitId = "";
  for (const department of departments) {
    const hit = department.members.find((row) => row.person_id === personId);
    if (hit) {
      member = hit;
      orgUnitId = department.org_unit_id;
      break;
    }
  }
  if (!member) {
    return {
      ok: false,
      error: "operator has no personal envelope",
      code: "no_envelope",
    };
  }
  // Employees see words, not account codes.
  const accountName = (code: string): string =>
    member.categories.find((row) => row.account_code === code)?.account_name ??
    payload.person_account_catalog?.find((row) => row.account_code === code)
      ?.account_name ??
    "";
  return {
    ok: true,
    fiscal_year: payload.fiscal_year,
    claims_revision: payload.claims_revision,
    person_id: personId,
    display_name: member.display_name,
    org_unit_id: orgUnitId,
    allocation_yen: member.allocation_yen,
    actual_yen: member.actual_yen,
    remaining_yen: member.allocation_yen - member.actual_yen,
    categories: member.categories.map((category) => ({
      account_code: category.account_code,
      account_name: category.account_name,
      allocation_yen: category.allocation_yen,
      actual_yen: category.actual_yen,
      remaining_yen: category.allocation_yen - category.actual_yen,
    })),
    claims: listExpenseClaims()
      .filter((claim) => claim.person_id === personId)
      .map((claim) => ({
        claim_id: claim.claim_id,
        status: claim.status,
        amount_yen: claim.amount_yen,
        account_code: claim.account_code,
        account_name: accountName(claim.account_code),
        recipient_name: claim.recipient_name,
        transaction_date: claim.transaction_date,
        due_on: claim.reimbursement?.due_on,
        reject_reason: claim.reject_reason,
      })),
  };
}

function proposedBudgetApprovalMessage(opts: {
  approvalId: string;
  kind: "company_total" | "department_total";
  escalation: "within_policy" | "beyond_policy";
}): string {
  const target = opts.kind === "company_total" ? "全社予算枠" : "部門予算枠";
  if (opts.escalation === "beyond_policy") {
    return (
      `${target}の変更を承認申請しました（${opts.approvalId}）。` +
      `計画基準の調整幅を超えるため、所管取締役の承認または取締役会付議が必要です。`
    );
  }
  return (
    `${target}の変更を上位役職者へ承認申請しました（${opts.approvalId}）。` +
    `承認後に反映されます。`
  );
}

export async function handleOrgBudgetApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  const path = relativePath(pathname);
  if (path === null) return false;

  if (path === "/" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:read", res)) return true;
    try {
      const fyParam = new URL(req.url ?? "/", "http://local").searchParams.get(
        "fy",
      );
      json(
        res,
        200,
        buildOrgBudgetPayload(user, {
          fiscalYear: fyParam || undefined,
        }),
      );
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/gate" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readBudgetJson(req)) as Record<string, unknown>;
      const result = evaluateExpenseClaimGate({
        personId: String(body.person_id ?? ""),
        orgUnitId: String(body.org_unit_id ?? ""),
        accountCode: String(body.account_code ?? ""),
        amountYen: Number(body.amount_yen),
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, statusForBudgetError(formatBudgetDelegationError(error)), {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/desk" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "expense:claim", res)) return true;
    try {
      const fyParam = new URL(req.url ?? "/", "http://local").searchParams.get(
        "fy",
      );
      const desk = buildClaimDeskPayload(user, {
        fiscalYear: fyParam ?? undefined,
      });
      json(res, desk.ok ? 200 : 404, desk);
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/ingest" && method === "POST") {
    if (
      !requireAnyBudgetSurfacePermission(
        user,
        ["chat:ask", "expense:claim"],
        res,
      )
    ) {
      return true;
    }
    try {
      const body = (await readJsonLimited(req, 256 * 1024)) as Record<
        string,
        unknown
      >;
      const expectedClaimsRevision = parseExpectedClaimsRevision(body);
      if (expectedClaimsRevision == null) {
        json(res, 422, {
          ok: false,
          error: "expected_claims_revision is required",
          code: "expected_claims_revision_required",
        });
        return true;
      }
      const actor = actorFromUser(user);
      const forceWireFail =
        body.force_wire_fail === true &&
        process.env.ORGOS_ALLOW_TEST_HOOKS === "1";
      const personId = resolveIngestPersonId(
        actor,
        String(body.person_id ?? ""),
      );
      const orgUnitId =
        String(body.org_unit_id ?? "").trim() ||
        resolveClaimOrgUnitId(
          personId,
          typeof body.fy === "string" ? body.fy : undefined,
        ) ||
        "";
      const result = await ingestExpenseReceiptQr({
        qrOrJson: String(body.qr ?? body.payload ?? ""),
        personId,
        orgUnitId,
        accountCode: String(body.account_code ?? ""),
        allocations: Array.isArray(body.allocations)
          ? body.allocations.map((allocation) =>
              expenseClaimAllocationSchema.parse(allocation),
            )
          : undefined,
        proposedBy: String(body.proposed_by ?? actor.operator_id),
        expectedClaimsRevision,
        fetchFn: forceWireFail
          ? (async () => {
              throw new Error("forced_wire_fail");
            }) as typeof fetch
          : undefined,
      });
      auditMutation(
        user,
        pathname,
        `expense-claim ingest ${result.claim.claim_id} ${result.gate.gate}`,
        true,
      );
      const fiscalYear = typeof body.fy === "string" ? body.fy : undefined;
      json(res, 200, {
        ...(isClaimOnlySeat(actor)
          ? buildClaimDeskPayload(user, { fiscalYear })
          : buildOrgBudgetPayload(user, { fiscalYear })),
        claim: result.claim,
        gate: result.gate,
      });
    } catch (error) {
      if (isClaimsRevisionConflict(error)) {
        auditMutation(user, pathname, error.message, false);
        jsonRevisionConflict(res, error);
        return true;
      }
      if (error instanceof ClaimPersonMismatchError) {
        auditMutation(user, pathname, error.message, false);
        json(res, 403, { ok: false, error: error.message, code: error.code });
        return true;
      }
      json(res, statusForBudgetError(formatBudgetDelegationError(error)), {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/approve" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:approve", res)) return true;
    try {
      const body = (await readBudgetJson(req)) as Record<string, unknown>;
      const expectedClaimRevision = parseExpectedClaimRevision(body);
      if (expectedClaimRevision == null) {
        json(res, 422, {
          ok: false,
          error: "expected_claim_revision is required",
          code: "expected_claim_revision_required",
        });
        return true;
      }
      const actor = actorFromUser(user);
      const claim = approveExpenseClaim({
        claimId: String(body.claim_id ?? ""),
        approverId: actor.display_name,
        coApproverId:
          typeof body.co_approver_id === "string" && body.co_approver_id.trim()
            ? body.co_approver_id.trim()
            : undefined,
        boardEventId:
          typeof body.board_event_id === "string" && body.board_event_id.trim()
            ? body.board_event_id.trim()
            : undefined,
        operatorId: actor.operator_id,
        dueOn:
          typeof body.due_on === "string" && body.due_on.trim()
            ? body.due_on.trim()
            : undefined,
        expectedClaimRevision,
      });
      auditMutation(
        user,
        pathname,
        `expense-claim approve ${claim.claim_id}`,
        true,
      );
      json(res, 200, {
        ...buildOrgBudgetPayload(user, {
          fiscalYear: typeof body.fy === "string" ? body.fy : undefined,
        }),
        claim,
      });
    } catch (error) {
      if (isClaimsRevisionConflict(error)) {
        auditMutation(user, pathname, error.message, false);
        jsonRevisionConflict(res, error);
        return true;
      }
      json(res, statusForBudgetError(formatBudgetDelegationError(error)), {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  const expenseReceiptMatch = path.match(
    /^\/expense-claim\/([^/]+)\/receipt$/,
  );
  if (expenseReceiptMatch && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:read", res)) return true;
    try {
      const claimId = decodeURIComponent(expenseReceiptMatch[1]!);
      const claim = findExpenseClaim(claimId);
      if (!claim) {
        json(res, 404, { ok: false, error: "claim_not_found" });
        return true;
      }
      const snapshot = claim.receipt_snapshot_path
        ? loadReceiptSnapshot(claim.receipt_snapshot_path)
        : undefined;
      json(res, 200, {
        ok: true,
        claim_id: claim.claim_id,
        receipt_id: claim.receipt_id,
        receipt_digest: claim.receipt_digest,
        receipt_snapshot_path: claim.receipt_snapshot_path,
        issuer: claim.issuer,
        transaction_date: claim.transaction_date,
        invoice_verification: claim.invoice_verification,
        evidence_archive_ref: claim.evidence_archive_ref,
        receipt: snapshot?.receipt ?? null,
        digest: snapshot?.digest ?? claim.receipt_digest,
        signature_ok: Boolean(snapshot),
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/reject" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:approve", res)) return true;
    try {
      const body = (await readBudgetJson(req)) as Record<string, unknown>;
      const expectedClaimRevision = parseExpectedClaimRevision(body);
      if (expectedClaimRevision == null) {
        json(res, 422, {
          ok: false,
          error: "expected_claim_revision is required",
          code: "expected_claim_revision_required",
        });
        return true;
      }
      const actor = actorFromUser(user);
      const claim = rejectExpenseClaim({
        claimId: String(body.claim_id ?? ""),
        rejectorId: actor.display_name,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        expectedClaimRevision,
      });
      auditMutation(
        user,
        pathname,
        `expense-claim reject ${claim.claim_id}`,
        true,
      );
      json(res, 200, {
        ...buildOrgBudgetPayload(user, {
          fiscalYear: typeof body.fy === "string" ? body.fy : undefined,
        }),
        claim,
      });
    } catch (error) {
      if (isClaimsRevisionConflict(error)) {
        auditMutation(user, pathname, error.message, false);
        jsonRevisionConflict(res, error);
        return true;
      }
      json(res, statusForBudgetError(formatBudgetDelegationError(error)), {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/prepare-transfer" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readBudgetJson(req)) as Record<string, unknown>;
      const expectedClaimRevision = parseExpectedClaimRevision(body);
      if (expectedClaimRevision == null) {
        json(res, 422, {
          ok: false,
          error: "expected_claim_revision is required",
          code: "expected_claim_revision_required",
        });
        return true;
      }
      const actor = actorFromUser(user);
      const claim = prepareExpenseClaimReimbursementTransfer({
        claimId: String(body.claim_id ?? ""),
        sourceBankAccountId: String(body.source_bank_account_id ?? ""),
        stakeholderId: String(body.stakeholder_id ?? ""),
        payee: String(body.payee ?? ""),
        preparedBy: actor.operator_id,
        expectedClaimRevision,
      });
      auditMutation(
        user,
        pathname,
        `expense-claim prepare-transfer ${claim.claim_id}`,
        true,
      );
      json(res, 200, {
        ...buildOrgBudgetPayload(user, {
          fiscalYear: typeof body.fy === "string" ? body.fy : undefined,
        }),
        claim,
      });
    } catch (error) {
      if (isClaimsRevisionConflict(error)) {
        auditMutation(user, pathname, error.message, false);
        jsonRevisionConflict(res, error);
        return true;
      }
      json(res, statusForBudgetError(formatBudgetDelegationError(error)), {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  if (path === "/expense-claim/reimburse" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readBudgetJson(req)) as Record<string, unknown>;
      const expectedClaimRevision = parseExpectedClaimRevision(body);
      if (expectedClaimRevision == null) {
        json(res, 422, {
          ok: false,
          error: "expected_claim_revision is required",
          code: "expected_claim_revision_required",
        });
        return true;
      }
      const actor = actorFromUser(user);
      const claim = markExpenseClaimReimbursed({
        claimId: String(body.claim_id ?? ""),
        paidBy: String(body.paid_by ?? actor.display_name),
        paymentRef: String(body.payment_ref ?? ""),
        bankStatementRef:
          typeof body.bank_statement_ref === "string"
            ? body.bank_statement_ref
            : undefined,
        settlementEvidenceRef:
          typeof body.settlement_evidence_ref === "string"
            ? body.settlement_evidence_ref
            : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        expectedClaimRevision,
      });
      auditMutation(
        user,
        pathname,
        `expense-claim reimburse ${claim.claim_id}`,
        true,
      );
      json(res, 200, {
        ...buildOrgBudgetPayload(user, {
          fiscalYear: typeof body.fy === "string" ? body.fy : undefined,
        }),
        claim,
      });
    } catch (error) {
      if (isClaimsRevisionConflict(error)) {
        auditMutation(user, pathname, error.message, false);
        jsonRevisionConflict(res, error);
        return true;
      }
      json(res, statusForBudgetError(formatBudgetDelegationError(error)), {
        ok: false,
        error: formatBudgetDelegationError(error),
      });
    }
    return true;
  }

  const mutationPaths = new Set([
    "/set-company",
    "/set-company-category",
    "/allocate-department",
    "/allocate-department-category",
    "/allocate-member",
    "/allocate-person-category",
    "/commit-member",
    "/outlook/init",
    "/outlook/set-remaining",
    "/outlook/set-as-of",
    "/outlook/publish",
    "/outlook/sync-yojitsu",
    "/outlook/set-department",
    "/outlook/propose-envelope",
  ]);
  /** Envelope YAML mutations — expected_revision required (HTTP and CLI). */
  const envelopeRevisionRequired = new Set([
    "/set-company",
    "/set-company-category",
    "/allocate-department",
    "/allocate-department-category",
    "/allocate-member",
    "/allocate-person-category",
    "/commit-member",
  ]);
  if (!mutationPaths.has(path) || method !== "POST") {
    json(res, 404, { ok: false, error: "not found" });
    return true;
  }

  try {
    const actor = actorFromUser(user);
    const body = parseBudgetMutationBody(await readBudgetJson(req));
    if (envelopeRevisionRequired.has(path)) {
      if (body.expected_revision == null || body.expected_revision === "") {
        json(res, 422, {
          ok: false,
          error: "expected_revision is required",
          code: "expected_revision_required",
        });
        return true;
      }
    }
    if (
      path.startsWith("/outlook/") &&
      // propose-envelope is a read-only suggestion — no revision bump, no token.
      path !== "/outlook/propose-envelope"
    ) {
      if (
        body.expected_outlook_revision == null ||
        body.expected_outlook_revision === ""
      ) {
        json(res, 422, {
          ok: false,
          error: "expected_outlook_revision is required",
          code: "expected_outlook_revision_required",
        });
        return true;
      }
    }
    const payloadOpts = {
      fiscalYear: body.fiscal_year?.trim() || undefined,
    };
    /** Narrow optional body.amount_yen for mutations that require a yen amount. */
    const requireAmountYen = (): number | null => {
      const value = body.amount_yen;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        json(res, 422, { ok: false, error: "amount_yen is required" });
        return null;
      }
      return value;
    };

    if (path.startsWith("/outlook/")) {
      if (path === "/outlook/propose-envelope") {
        if (!requireBudgetSurfacePermission(user, "chat:read", res))
          return true;
        const proposed = proposeEnvelopeFromOutlook({
          fiscalYear: body.fiscal_year,
          actorOperatorId: actor.operator_id,
        });
        auditMutation(
          user,
          pathname,
          `outlook propose-envelope ${proposed.suggested_company_budget_yen}`,
          true,
        );
        json(res, 200, {
          ...buildOrgBudgetPayload(user, payloadOpts),
          proposed_envelope: proposed,
        });
        return true;
      }
      if (path === "/outlook/publish") {
        if (!requireBudgetSurfacePermission(user, "chat:approve", res)) {
          return true;
        }
        const publisherId = body.publisher_operator_id?.trim();
        if (publisherId) {
          const allowed = listOutlookPublishCandidates().some(
            (op) => op.operator_id === publisherId,
          );
          if (!allowed) {
            json(res, 422, {
              ok: false,
              error:
                "承認者は CEO / 部門長（approver）のみです。秘書・エージェントは指定できません。",
            });
            return true;
          }
        }
        publishMidYearOutlook({
          fiscalYear: body.fiscal_year,
          actorOperatorId: actor.operator_id,
          publisherOperatorId: publisherId,
          expectedOutlookRevision: body.expected_outlook_revision,
        });
        auditMutation(
          user,
          pathname,
          `outlook publish publisher=${publisherId ?? actor.operator_id}`,
          true,
        );
        json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
        return true;
      }
      if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
      if (path === "/outlook/init") {
        initMidYearOutlook({
          fiscalYear: body.fiscal_year,
          asOfMonth: body.as_of_month,
          actorOperatorId: actor.operator_id,
          notes: body.notes,
          expectedOutlookRevision: body.expected_outlook_revision,
        });
        auditMutation(user, pathname, "outlook init", true);
        json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
        return true;
      }
      if (path === "/outlook/set-remaining") {
        const month = body.month?.trim();
        if (!month) {
          json(res, 422, { ok: false, error: "month is required" });
          return true;
        }
        setOutlookRemainingTotals({
          fiscalYear: body.fiscal_year,
          month,
          revenueYen: Number(body.revenue_yen ?? 0),
          opexYen: Number(body.opex_yen ?? body.expense_yen ?? 0),
          capexYen: body.capex_yen != null ? Number(body.capex_yen) : undefined,
          actorOperatorId: actor.operator_id,
          expectedOutlookRevision: body.expected_outlook_revision,
        });
        auditMutation(user, pathname, `outlook set-remaining ${month}`, true);
        json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
        return true;
      }
      if (path === "/outlook/set-as-of") {
        const asOf = body.as_of_month?.trim();
        if (!asOf) {
          json(res, 422, { ok: false, error: "as_of_month is required" });
          return true;
        }
        setOutlookAsOf({
          fiscalYear: body.fiscal_year,
          asOfMonth: asOf,
          actorOperatorId: actor.operator_id,
          expectedOutlookRevision: body.expected_outlook_revision,
        });
        auditMutation(user, pathname, `outlook set-as-of ${asOf}`, true);
        json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
        return true;
      }
      if (path === "/outlook/sync-yojitsu") {
        syncOutlookFromYojitsu({
          fiscalYear: body.fiscal_year,
          actorOperatorId: actor.operator_id,
          expectedOutlookRevision: body.expected_outlook_revision,
        });
        auditMutation(user, pathname, "outlook sync-yojitsu", true);
        json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
        return true;
      }
      if (path === "/outlook/set-department") {
        const orgUnitId = body.org_unit_id?.trim();
        if (!orgUnitId) {
          json(res, 422, { ok: false, error: "org_unit_id is required" });
          return true;
        }
        setDepartmentOutlook({
          fiscalYear: body.fiscal_year,
          orgUnitId,
          opexYen: Number(body.opex_yen ?? body.expense_yen ?? 0),
          revenueYen:
            body.revenue_yen != null ? Number(body.revenue_yen) : undefined,
          actorOperatorId: actor.operator_id,
          expectedOutlookRevision: body.expected_outlook_revision,
        });
        auditMutation(
          user,
          pathname,
          `outlook set-department ${orgUnitId}`,
          true,
        );
        json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
        return true;
      }
      json(res, 404, { ok: false, error: "not found" });
      return true;
    }

    if (path === "/set-company") {
      if (!requireBudgetSurfacePermission(user, "chat:approve", res))
        return true;
      if (actor.role !== "ceo") {
        json(res, 403, {
          ok: false,
          error: "Company budget changes require CEO",
        });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      if (loadBudgetDelegation()) {
        const proposed = proposeCompanyBudgetTotal({
          amountYen,
          actor,
          reference: body.reference,
          boardEventId: body.board_event_id,
          expectedRevision: body.expected_revision,
        });
        auditMutation(
          user,
          pathname,
          `org budget propose-company-total ${proposed.approval_id} ${amountYen}`,
          true,
        );
        json(res, 200, {
          ...buildOrgBudgetPayload(user, payloadOpts),
          proposed_approval: {
            approval_id: proposed.approval_id,
            change_id: proposed.change.change_id,
            kind: "company_total" as const,
            escalation: proposed.change.escalation ?? "within_policy",
            message: proposedBudgetApprovalMessage({
              approvalId: proposed.approval_id,
              kind: "company_total",
              escalation: proposed.change.escalation ?? "within_policy",
            }),
          },
        });
        return true;
      }
      initializeCompanyBudget({
        fiscalYear: body.fiscal_year?.trim() || resolveActiveBudgetFiscalYear(),
        amountYen,
        actor,
      });
      auditMutation(
        user,
        pathname,
        `org budget set-company ${amountYen}`,
        true,
      );
      json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
      return true;
    }

    if (path === "/set-company-category") {
      if (!requireBudgetSurfacePermission(user, "chat:approve", res))
        return true;
      const accountCode = body.account_code?.trim();
      if (!accountCode) {
        json(res, 422, { ok: false, error: "account_code is required" });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      setCompanyCategoryBudget({
        accountCode,
        amountYen,
        actor,
        reference: body.reference,
        expectedRevision: body.expected_revision,
      });
      auditMutation(
        user,
        pathname,
        `org budget set-company-category ${accountCode} ${amountYen}`,
        true,
      );
      json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
      return true;
    }

    if (path === "/allocate-department") {
      if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
      const orgUnitId = body.org_unit_id?.trim();
      if (!orgUnitId) {
        json(res, 422, { ok: false, error: "org_unit_id is required" });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      const proposed = proposeDepartmentBudgetTotal({
        orgUnitId,
        amountYen,
        actor,
        reference: body.reference,
        notes: body.notes,
        boardEventId: body.board_event_id,
        expectedRevision: body.expected_revision,
      });
      auditMutation(
        user,
        pathname,
        `org budget propose-department-total ${orgUnitId} ${proposed.approval_id} ${amountYen}`,
        true,
      );
      json(res, 200, {
        ...buildOrgBudgetPayload(user, payloadOpts),
        proposed_approval: {
          approval_id: proposed.approval_id,
          change_id: proposed.change.change_id,
          kind: "department_total" as const,
          escalation: proposed.change.escalation ?? "within_policy",
          message: proposedBudgetApprovalMessage({
            approvalId: proposed.approval_id,
            kind: "department_total",
            escalation: proposed.change.escalation ?? "within_policy",
          }),
        },
      });
      return true;
    }

    if (path === "/allocate-department-category") {
      if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
      const orgUnitId = body.org_unit_id?.trim();
      const accountCode = body.account_code?.trim();
      if (!orgUnitId || !accountCode) {
        json(res, 422, {
          ok: false,
          error: "org_unit_id and account_code are required",
        });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      allocateDepartmentCategoryBudget({
        orgUnitId,
        accountCode,
        amountYen,
        actor,
        reference: body.reference,
        expectedRevision: body.expected_revision,
      });
      auditMutation(
        user,
        pathname,
        `org budget allocate-department-category ${orgUnitId} ${accountCode} ${amountYen}`,
        true,
      );
      json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
      return true;
    }

    if (path === "/allocate-person-category") {
      if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
      const orgUnitId = body.org_unit_id?.trim();
      const personId = body.person_id?.trim();
      const accountCode = body.account_code?.trim();
      if (!orgUnitId || !personId || !accountCode) {
        json(res, 422, {
          ok: false,
          error: "org_unit_id, person_id, and account_code are required",
        });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      allocatePersonCategoryBudget({
        orgUnitId,
        personId,
        accountCode,
        amountYen,
        actor,
        purpose: body.purpose,
        reference: body.reference,
        expectedRevision: body.expected_revision,
      });
      auditMutation(
        user,
        pathname,
        `org budget allocate-person-category ${personId} ${accountCode} ${amountYen}`,
        true,
      );
      json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
      return true;
    }

    if (path === "/allocate-member") {
      if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
      const orgUnitId = body.org_unit_id?.trim();
      const memberOperatorId = body.member_operator_id?.trim();
      if (!orgUnitId || !memberOperatorId) {
        json(res, 422, {
          ok: false,
          error: "org_unit_id and member_operator_id are required",
        });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      allocateMemberBudget({
        orgUnitId,
        memberOperatorId,
        amountYen,
        actor,
        purpose: body.purpose,
        reference: body.reference,
        expectedRevision: body.expected_revision,
      });
      auditMutation(
        user,
        pathname,
        `org budget allocate-member ${memberOperatorId} ${amountYen}`,
        true,
      );
      json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
      return true;
    }

    if (path === "/commit-member") {
      if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
      const orgUnitId = body.org_unit_id?.trim();
      const memberOperatorId = body.member_operator_id?.trim();
      const reference = body.reference?.trim();
      if (!orgUnitId || !memberOperatorId || !reference) {
        json(res, 422, {
          ok: false,
          error: "org_unit_id, member_operator_id, and reference are required",
        });
        return true;
      }
      const amountYen = requireAmountYen();
      if (amountYen == null) return true;
      commitMemberBudget({
        orgUnitId,
        memberOperatorId,
        amountYen,
        actor,
        reference,
        expectedRevision: body.expected_revision,
      });
      auditMutation(
        user,
        pathname,
        `org budget commit-member ${memberOperatorId} ${amountYen}`,
        true,
      );
      json(res, 200, buildOrgBudgetPayload(user, payloadOpts));
      return true;
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      json(res, 413, { ok: false, error: error.message });
      return true;
    }
    if (error instanceof InvalidJsonError) {
      json(res, 400, { ok: false, error: error.message });
      return true;
    }
    if (
      error instanceof BudgetRevisionConflictError ||
      error instanceof OutlookRevisionConflictError ||
      isClaimsRevisionConflict(error)
    ) {
      auditMutation(user, pathname, error.message, false);
      jsonRevisionConflict(res, error);
      return true;
    }
    const message = formatBudgetDelegationError(error);
    auditMutation(user, pathname, message, false);
    json(res, statusForBudgetError(message), { ok: false, error: message });
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
