import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import { ZodError } from "zod";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { requireExpectedRevisionToken } from "../cas-test-mode.js";
import {
  budgetDelegationFileSchema,
  type BudgetDelegationEvent,
  type BudgetDelegationFile,
  type BudgetPendingChange,
  type DepartmentBudget,
} from "../../../schemas/org/budget-delegation.js";
import type {
  BudgetDelegationScope,
  BudgetMutability,
} from "../../../schemas/finance/chart-of-accounts.js";
import type { OperatorRecord } from "../../../schemas/org/operator.js";
import {
  loadBusinessPlan,
  loadChartOfAccounts,
  loadExpensePlan,
} from "../data.js";
import {
  budgetPersonBelongsToDepartment,
  findBudgetPerson,
} from "../hr/person-directory.js";
import { tenantDataPath } from "../tenant.js";
import { findCompanyEventById } from "../company-events.js";
import { findOrgApproval, proposeOrgApproval } from "./approval/index.js";
import { appendInstructionAudit } from "./instruction-audit.js";
import { findOperatorById } from "./operators.js";
import {
  loadOrgAuthority,
  orgAuthorityYamlPath,
} from "./org-authority.js";

export const BUDGET_COMPANY_TOTAL_SUBJECT = "budget.company_total";
export const BUDGET_DEPARTMENT_TOTAL_SUBJECT = "budget.department_total";

export function isBudgetTotalApprovalSubject(subjectType: string): boolean {
  return (
    subjectType === BUDGET_COMPANY_TOTAL_SUBJECT ||
    subjectType === BUDGET_DEPARTMENT_TOTAL_SUBJECT
  );
}

const DEFAULT_ADJUSTMENT_POLICY = {
  company_max_adjustment_pct: 20,
  department_max_adjustment_pct: 20,
  require_adjustment_reference: true,
  person_allocation_mode: "strict" as const,
  variance_alert_pct: 20,
};

export type BudgetPlanGovernance = {
  fiscal_year: string;
  baseline_yen?: number;
  business_plan_status:
    "missing" | "draft" | "pending_approval" | "approved" | "superseded";
  approval_id?: string;
  approved_at?: string;
  has_board_evidence: boolean;
  is_fixed: boolean;
  source: "data/plans/expense-plan.yaml";
};

export function resolveBudgetPlanGovernance(
  fiscalYear: string,
): BudgetPlanGovernance {
  let baselineYen: number | undefined;
  let status: BudgetPlanGovernance["business_plan_status"] = "missing";
  let approvalId: string | undefined;
  let approvedAt: string | undefined;
  let hasBoardEvidence = false;
  try {
    const expenseYear = loadExpensePlan().years.find(
      (year) => year.fiscal_year === fiscalYear,
    );
    if (expenseYear) baselineYen = Math.abs(expenseYear.total);
  } catch {
    /* optional until a plan exists */
  }
  try {
    const year = loadBusinessPlan().years.find(
      (row) => row.fiscal_year === fiscalYear || `FY${row.year}` === fiscalYear,
    );
    if (year) {
      status = year.status;
      approvalId = year.approval_id;
      approvedAt = year.approved_at;
      hasBoardEvidence = /(?:^|\s)board_event_id=\S+/.test(year.notes ?? "");
    }
  } catch {
    /* optional until a plan exists */
  }
  return {
    fiscal_year: fiscalYear,
    baseline_yen: baselineYen,
    business_plan_status: status,
    approval_id: approvalId,
    approved_at: approvedAt,
    has_board_evidence: hasBoardEvidence,
    is_fixed: status === "approved",
    source: "data/plans/expense-plan.yaml",
  };
}

/** True when envelope increases are locked (plan draft/pending/missing). */
export function isPlanIncreasesLocked(
  status: BudgetPlanGovernance["business_plan_status"],
): boolean {
  return (
    status === "draft" ||
    status === "pending_approval" ||
    status === "missing"
  );
}

/**
 * ADR 0027: unapproved business plan blocks envelope *increases* only.
 * Within-envelope reallocation remains allowed.
 */
export function assertPlanAllowsEnvelopeIncrease(fiscalYear: string): void {
  const plan = resolveBudgetPlanGovernance(fiscalYear);
  if (!isPlanIncreasesLocked(plan.business_plan_status)) return;
  throw new Error(
    `事業計画が未承認（${plan.business_plan_status}）のため執行枠の増額はできません。` +
      `先に事業計画を承認してください（枠内の費目・個人再配分は可能です）。`,
  );
}

/** Validate closed/archived board (meeting|governance) event for beyond_policy. */
export function assertBoardEventForBeyondPolicy(boardEventId: string): void {
  const event = findCompanyEventById(boardEventId);
  if (!event) {
    throw new Error(
      `取締役会イベント ${boardEventId} が見つかりません。beyond_policy 変更には closed/archived の meeting|governance イベントが必要です。`,
    );
  }
  if (!["meeting", "governance"].includes(event.kind)) {
    throw new Error(
      `イベント ${boardEventId} の kind は meeting または governance である必要があります（現在: ${event.kind}）。`,
    );
  }
  if (!["closed", "archived"].includes(event.status)) {
    throw new Error(
      `イベント ${boardEventId} は closed または archived である必要があります（現在: ${event.status}）。`,
    );
  }
}

export function budgetAdjustmentRange(
  baselineYen: number,
  percent: number,
): { min_yen: number; max_yen: number } {
  return {
    min_yen: Math.max(0, Math.round(baselineYen * (1 - percent / 100))),
    max_yen: Math.round(baselineYen * (1 + percent / 100)),
  };
}

export function budgetDelegationPath(): string {
  return tenantDataPath("org", "budget-delegations.yaml");
}

/** Alias for the active (current) budget-delegations.yaml path. */
export function budgetDelegationActivePath(): string {
  return budgetDelegationPath();
}

/** Normalize to `FY{YYYY}`. Accepts `FY2026` / `F2026` / `fy2026`. */
export function normalizeBudgetFiscalYear(fy: string): string {
  const trimmed = fy.trim();
  const match = trimmed.match(/^FY?(\d{4})$/i);
  if (!match) {
    throw new Error(
      `Invalid fiscal year "${fy}". Expected FY2026 (or F2026 / fy2026).`,
    );
  }
  return `FY${match[1]}`;
}

/** Per-FY archive/working file: `org/budget-delegations-fy{yyyy}.yaml`. */
export function budgetDelegationPathForFiscalYear(fy: string): string {
  const normalized = normalizeBudgetFiscalYear(fy);
  const id = normalized.toLowerCase();
  return tenantDataPath("org", `budget-delegations-${id}.yaml`);
}

/**
 * Active FY: active file → org-authority → business-plan horizon → FY2026.
 * Reads the active file directly (does not call loadBudgetDelegation) to avoid recursion.
 */
export function resolveActiveBudgetFiscalYear(): string {
  const activePath = budgetDelegationActivePath();
  if (existsSync(activePath)) {
    try {
      const raw = YAML.parse(readFileSync(activePath, "utf-8")) as {
        fiscal_year?: unknown;
      };
      const fy =
        typeof raw?.fiscal_year === "string" ? raw.fiscal_year.trim() : "";
      if (fy) return normalizeBudgetFiscalYear(fy);
    } catch {
      /* fall through */
    }
  }
  try {
    const authority = loadOrgAuthority();
    if (authority?.fiscal_year?.trim()) {
      try {
        return normalizeBudgetFiscalYear(authority.fiscal_year);
      } catch {
        /* fall through */
      }
    }
  } catch {
    /* optional / invalid */
  }
  try {
    const horizon = loadBusinessPlan().horizon_base_fy?.trim();
    if (horizon) return normalizeBudgetFiscalYear(horizon);
  } catch {
    /* optional */
  }
  return "FY2026";
}

/** If active exists and the FY-specific mirror is missing, copy active → fy file. */
export function ensureBudgetDelegationFyMirror(): void {
  const activePath = budgetDelegationActivePath();
  if (!existsSync(activePath)) return;
  let fy: string;
  try {
    const raw = YAML.parse(readFileSync(activePath, "utf-8")) as {
      fiscal_year?: unknown;
    };
    fy = normalizeBudgetFiscalYear(String(raw?.fiscal_year ?? ""));
  } catch {
    return;
  }
  const fyPath = budgetDelegationPathForFiscalYear(fy);
  if (existsSync(fyPath)) return;
  copyFileSync(activePath, fyPath);
}

/** Scan fy files + active FY + business-plan years; unique sorted `FY{YYYY}`. */
export function listAvailableBudgetFiscalYears(): string[] {
  const years = new Set<string>();
  const orgDir = tenantDataPath("org");
  if (existsSync(orgDir)) {
    for (const name of readdirSync(orgDir)) {
      const match = name.match(/^budget-delegations-(fy\d{4})\.yaml$/i);
      if (!match) continue;
      try {
        years.add(normalizeBudgetFiscalYear(match[1]!));
      } catch {
        /* skip */
      }
    }
  }
  const activePath = budgetDelegationActivePath();
  if (existsSync(activePath)) {
    try {
      const raw = YAML.parse(readFileSync(activePath, "utf-8")) as {
        fiscal_year?: unknown;
      };
      if (typeof raw?.fiscal_year === "string" && raw.fiscal_year.trim()) {
        years.add(normalizeBudgetFiscalYear(raw.fiscal_year));
      }
    } catch {
      /* skip */
    }
  }
  try {
    for (const year of loadBusinessPlan().years ?? []) {
      if (!year.fiscal_year?.trim()) continue;
      try {
        years.add(normalizeBudgetFiscalYear(year.fiscal_year));
      } catch {
        /* skip */
      }
    }
  } catch {
    /* optional */
  }
  return [...years].sort();
}

function parseBudgetDelegationFile(path: string): BudgetDelegationFile {
  return budgetDelegationFileSchema.parse(
    YAML.parse(readFileSync(path, "utf-8")),
  );
}

/**
 * Load budget delegation.
 * - no fy: active path (after ensure mirror)
 * - with fy: fy path if exists; else active when fiscal_year matches; else null
 */
export function loadBudgetDelegation(opts?: {
  fiscalYear?: string;
}): BudgetDelegationFile | null {
  if (!opts?.fiscalYear) {
    ensureBudgetDelegationFyMirror();
    const path = budgetDelegationActivePath();
    if (!existsSync(path)) return null;
    return parseBudgetDelegationFile(path);
  }
  const fy = normalizeBudgetFiscalYear(opts.fiscalYear);
  const fyPath = budgetDelegationPathForFiscalYear(fy);
  if (existsSync(fyPath)) return parseBudgetDelegationFile(fyPath);
  const activePath = budgetDelegationActivePath();
  if (!existsSync(activePath)) return null;
  const active = parseBudgetDelegationFile(activePath);
  if (normalizeBudgetFiscalYear(active.fiscal_year) === fy) return active;
  return null;
}

function yenJa(amountYen: number): string {
  return `${amountYen.toLocaleString("ja-JP")}円`;
}

/** Turn Zod / Error into a short user-facing Japanese message. */
export function formatBudgetDelegationError(error: unknown): string {
  if (error instanceof ZodError) {
    const first = error.issues.find((issue) => issue.message.trim());
    if (first?.message) return first.message;
    return "予算データの検証に失敗しました。";
  }
  if (error instanceof Error) {
    const text = error.message.trim();
    if (text.startsWith("[") && text.includes('"message"')) {
      try {
        const parsed = JSON.parse(text) as Array<{ message?: string }>;
        const message = parsed.find((row) => row.message)?.message;
        if (message) return message;
      } catch {
        /* keep original */
      }
    }
    return text;
  }
  return String(error);
}

/** Last append-only event id — used as optimistic concurrency token. */
export function budgetDelegationRevision(
  file: BudgetDelegationFile | null | undefined,
): {
  revision: string;
  updated_at: string | null;
  event_count: number;
} {
  if (!file?.events?.length) {
    return { revision: "0", updated_at: null, event_count: 0 };
  }
  const last = file.events[file.events.length - 1]!;
  return {
    revision: last.event_id,
    updated_at: last.occurred_at,
    event_count: file.events.length,
  };
}

export class BudgetRevisionConflictError extends Error {
  readonly code = "revision_conflict" as const;
  readonly currentRevision: string;
  readonly expectedRevision: string;

  constructor(currentRevision: string, expectedRevision: string) {
    super(
      `Budget revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
    this.name = "BudgetRevisionConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

function assertExpectedRevision(
  file: BudgetDelegationFile,
  expectedRevision: string | undefined,
): void {
  requireExpectedRevisionToken(expectedRevision, "expected_revision");
  if (expectedRevision == null || expectedRevision === "") return;
  const { revision } = budgetDelegationRevision(file);
  if (revision !== expectedRevision) {
    throw new BudgetRevisionConflictError(revision, expectedRevision);
  }
}

/** Nestable exclusive section for envelope load → assert → mutate → save. */
let budgetDelegationLockDepth = 0;

/**
 * Acquire exclusive locks on multiple YAML paths in sorted order (deadlock-safe).
 * Elevates nestable budgetDelegationLockDepth while `fn` runs.
 */
function withBudgetDelegationPathsLocked<T>(
  paths: string[],
  fn: () => T,
): T {
  const unique = [...new Set(paths.filter(Boolean))].sort();
  if (unique.length === 0) return fn();
  if (budgetDelegationLockDepth > 0) {
    // Nested: outer section already holds at least one lock. Do not re-lock
    // different paths here (would risk lock-order inversion). Callers that
    // need multi-path must acquire them at the outermost section.
    return fn();
  }
  const run = (index: number): T => {
    if (index >= unique.length) {
      budgetDelegationLockDepth += 1;
      try {
        return fn();
      } finally {
        budgetDelegationLockDepth -= 1;
      }
    }
    return withYamlFileLock(unique[index]!, () => run(index + 1));
  };
  return run(0);
}

/**
 * Exclusive critical section for a fiscal-year budget file.
 * Nestable: inner calls reuse the outer lock (same pattern as outlook/claims).
 */
export function withBudgetDelegationLock<T>(
  fiscalYear: string | undefined,
  fn: () => T,
): T {
  const fy = normalizeBudgetFiscalYear(
    fiscalYear ?? resolveActiveBudgetFiscalYear(),
  );
  const path = budgetDelegationPathForFiscalYear(fy);
  return withBudgetDelegationPathsLocked([path], fn);
}

/**
 * Rollover / multi-FY critical section: lock from + to FY mirrors and active
 * in a stable sort order so concurrent writers cannot race the active pointer.
 */
export function withBudgetDelegationRolloverLock<T>(
  fromFiscalYear: string,
  toFiscalYear: string,
  fn: () => T,
): T {
  const from = normalizeBudgetFiscalYear(fromFiscalYear);
  const to = normalizeBudgetFiscalYear(toFiscalYear);
  return withBudgetDelegationPathsLocked(
    [
      budgetDelegationPathForFiscalYear(from),
      budgetDelegationPathForFiscalYear(to),
      budgetDelegationActivePath(),
    ],
    fn,
  );
}

/**
 * Always write the FY-specific path. Also write active when this file is the
 * active FY, or when the active file is missing.
 */
export function saveBudgetDelegation(file: BudgetDelegationFile): string {
  try {
    const parsed = budgetDelegationFileSchema.parse(file);
    const fy = normalizeBudgetFiscalYear(parsed.fiscal_year);
    const fyPath = budgetDelegationPathForFiscalYear(fy);
    const write = (): string => {
      mkdirSync(dirname(fyPath), { recursive: true });
      writeYamlFileAtomic(fyPath, parsed);
      const activePath = budgetDelegationActivePath();
      const activeMissing = !existsSync(activePath);
      if (activeMissing || fy === resolveActiveBudgetFiscalYear()) {
        writeYamlFileAtomic(activePath, parsed);
      }
      return fyPath;
    };
    if (budgetDelegationLockDepth > 0) {
      return write();
    }
    return withYamlFileLock(fyPath, write);
  } catch (error) {
    throw new Error(formatBudgetDelegationError(error));
  }
}

/**
 * Archive `from` (ensure fy mirror), create zeroed `to` file, point active at `to`,
 * and update org-authority.fiscal_year when present.
 */
export function rolloverBudgetFiscalYear(input: {
  toFiscalYear: string;
  fromFiscalYear?: string;
  actorOperatorId: string;
  notes?: string;
}): {
  from: string;
  to: string;
  active_path: string;
  archived_path: string;
  created_path: string;
} {
  const to = normalizeBudgetFiscalYear(input.toFiscalYear);
  const from = normalizeBudgetFiscalYear(
    input.fromFiscalYear ?? resolveActiveBudgetFiscalYear(),
  );
  if (from === to) {
    throw new Error(`from and to fiscal years are the same (${to})`);
  }
  ensureBudgetDelegationFyMirror();
  // Lock from + to + active in sorted order (see withBudgetDelegationRolloverLock).
  return withBudgetDelegationRolloverLock(from, to, () => {
    const fromFile = loadBudgetDelegation({ fiscalYear: from });
    if (!fromFile) {
      throw new Error(`No budget delegation for ${from}`);
    }
    const archivedPath = budgetDelegationPathForFiscalYear(from);
    if (!existsSync(archivedPath)) {
      writeYamlFileAtomic(archivedPath, fromFile);
    }
    const createdPath = budgetDelegationPathForFiscalYear(to);
    if (existsSync(createdPath)) {
      throw new Error(
        `Budget delegation for ${to} already exists at ${createdPath}`,
      );
    }

    let companyBudgetYen = 0;
    try {
      const expenseYear = loadExpensePlan().years.find(
        (year) => year.fiscal_year === to,
      );
      if (expenseYear) companyBudgetYen = Math.abs(expenseYear.total);
    } catch {
      /* optional — leave 0 */
    }

    const reference = input.notes?.trim()
      ? `fy-rollover-from-${from}; ${input.notes.trim()}`
      : `fy-rollover-from-${from}`;

    const newFile: BudgetDelegationFile = {
      version: 1,
      fiscal_year: to,
      currency: "JPY",
      company_budget_yen: companyBudgetYen,
      company_budget_approved_by_operator_id: input.actorOperatorId,
      adjustment_policy: fromFile.adjustment_policy,
      company_category_budgets: [],
      departments: fromFile.departments.map((department) => ({
        ...department,
        allocation_yen: 0,
        direct_committed_yen: 0,
        category_budgets: [],
        member_budgets: department.member_budgets.map((member) => ({
          ...member,
          allocation_yen: 0,
          committed_yen: 0,
          category_budgets: [],
        })),
      })),
      pending_changes: [],
      events: [
        {
          event_id: "BDE-000001",
          action: "company_budget_set",
          actor_operator_id: input.actorOperatorId,
          amount_yen: companyBudgetYen,
          reference,
          occurred_at: new Date().toISOString(),
        },
      ],
    };
    const parsed = budgetDelegationFileSchema.parse(newFile);
    writeYamlFileAtomic(createdPath, parsed);

    const authPath = orgAuthorityYamlPath();
    if (existsSync(authPath)) {
      try {
        const authority = loadOrgAuthority();
        if (authority && typeof authority.fiscal_year === "string") {
          writeYamlFileAtomic(authPath, { ...authority, fiscal_year: to });
        }
      } catch {
        /* leave authority unchanged when unreadable */
      }
    }

    const activePath = budgetDelegationActivePath();
    writeYamlFileAtomic(activePath, parsed);

    audit(input.actorOperatorId, `budget fy rollover ${from} → ${to}`);

    return {
      from,
      to,
      active_path: activePath,
      archived_path: archivedPath,
      created_path: createdPath,
    };
  });
}

function categoryTotalYen(
  categories: Array<{ account_code: string; allocation_yen: number }>,
  exceptAccountCode?: string,
): number {
  return categories.reduce(
    (sum, row) =>
      row.account_code === exceptAccountCode ? sum : sum + row.allocation_yen,
    0,
  );
}

function assertCategoryFitWithinLimit(opts: {
  label: string;
  limitYen: number;
  categories: Array<{ account_code: string; allocation_yen: number }>;
  accountCode: string;
  nextAmountYen: number;
}): void {
  const otherYen = categoryTotalYen(opts.categories, opts.accountCode);
  const nextTotalYen = otherYen + opts.nextAmountYen;
  if (nextTotalYen <= opts.limitYen) return;
  const roomYen = Math.max(0, opts.limitYen - otherYen);
  const overYen = nextTotalYen - opts.limitYen;
  throw new Error(
    `${opts.label}の費目合計が枠を超えます。` +
      `枠 ${yenJa(opts.limitYen)} · 他費目合計 ${yenJa(otherYen)} · ` +
      `この費目に設定できる上限 ${yenJa(roomYen)} · 超過 ${yenJa(overYen)}。` +
      `費目の増減は総額を変えず配分を動かします。増やす分は他の費目を減らすか、先に総額枠を増やしてください。`,
  );
}

function requireCeo(actor: OperatorRecord): void {
  if (actor.role !== "ceo") {
    throw new Error("Company and department budget allocation requires CEO");
  }
}

function requireDeptHeadOrCeo(
  actor: OperatorRecord,
  orgUnitId: string,
): string {
  const headOperatorId = departmentHead(orgUnitId);
  const isCeo = actor.role === "ceo";
  const isHead = actor.operator_id === headOperatorId;
  if (!isCeo && !isHead) {
    throw new Error(
      `部門 ${orgUnitId} の費目配分は部門責任者（${headOperatorId}）またはCEOが行えます。`,
    );
  }
  return headOperatorId;
}

function positiveYen(amountYen: number): void {
  if (!Number.isInteger(amountYen) || amountYen <= 0) {
    throw new Error("amount must be a positive integer in JPY");
  }
}

function nonnegativeIntegerYen(amountYen: number): void {
  if (!Number.isInteger(amountYen) || amountYen < 0) {
    throw new Error("amount must be a non-negative integer in JPY");
  }
}

function requireExpenseAccount(accountCode: string): void {
  const account = loadChartOfAccounts().accounts.find(
    (row) => row.code === accountCode,
  );
  if (!account || account.type !== "expense") {
    throw new Error(`Unknown expense account ${accountCode}`);
  }
}

export function budgetDelegationScopeForAccount(
  accountCode: string,
): BudgetDelegationScope {
  requireExpenseAccount(accountCode);
  const account = loadChartOfAccounts().accounts.find(
    (row) => row.code === accountCode,
  )!;
  return account.budget_delegation ?? "department";
}

export function budgetMutabilityForAccount(
  accountCode: string,
): BudgetMutability {
  requireExpenseAccount(accountCode);
  const account = loadChartOfAccounts().accounts.find(
    (row) => row.code === accountCode,
  )!;
  if (account.budget_mutability) return account.budget_mutability;
  const scope = account.budget_delegation ?? "department";
  return scope === "company" ? "planned" : "allocatable";
}

/** Envelopes editable in budget-delegations UI (not derived/planned SSOT). */
export function isBudgetCategoryAllocatable(accountCode: string): boolean {
  return budgetMutabilityForAccount(accountCode) === "allocatable";
}

export function assertAllocatableBudgetAccount(accountCode: string): void {
  const mutability = budgetMutabilityForAccount(accountCode);
  if (mutability !== "allocatable") {
    throw new Error(
      `Account ${accountCode} is ${mutability} (SSOT outside budget-delegations) and cannot be edited in the allocation UI`,
    );
  }
}

/** Person-level allocation is allowed only for CoA budget_delegation: person. */
export function assertPersonDelegatableAccount(accountCode: string): void {
  const scope = budgetDelegationScopeForAccount(accountCode);
  if (scope !== "person") {
    throw new Error(
      `Account ${accountCode} is ${scope}-scoped (company decision / department envelope) and cannot be allocated to persons`,
    );
  }
  assertAllocatableBudgetAccount(accountCode);
}

export type BudgetCategoryCatalogEntry = {
  account_code: string;
  account_name: string;
  budget_delegation: BudgetDelegationScope;
  budget_mutability: BudgetMutability;
  person_allocatable: boolean;
  /** Editable via budget-delegations (allocatable only). */
  ui_editable: boolean;
  /** Planned / derived amount from expense-plan (or linked SSOT), when known. */
  reference_yen?: number;
  source_path?: string;
};

function referenceYenFromExpensePlan(
  account: {
    code: string;
    name: string;
    line_id?: string;
    data_source?: string;
  },
  fiscalYear: string,
): number | undefined {
  let year: ReturnType<typeof loadExpensePlan>["years"][number] | undefined;
  try {
    year = loadExpensePlan().years.find(
      (row) => row.fiscal_year === fiscalYear,
    );
  } catch {
    return undefined;
  }
  if (!year) return undefined;
  const lines = year.lines;
  const sum = (predicate: (line: (typeof lines)[number]) => boolean) => {
    const matched = lines.filter(predicate);
    if (matched.length === 0) return undefined;
    return matched.reduce((total, line) => total + line.amount, 0);
  };

  if (account.line_id) {
    const byLineId = sum((line) => line.id === account.line_id);
    if (byLineId != null) return byLineId;
  }

  const dataSource = account.data_source ?? "";
  if (
    dataSource.includes("fixed-assets") ||
    account.code === "5100" ||
    account.name.includes("減価償却")
  ) {
    return sum(
      (line) =>
        line.id === "depreciation" ||
        line.id.includes("depreciation") ||
        line.name.includes("減価償却"),
    );
  }
  if (
    dataSource.includes("payroll") ||
    account.code === "5300" ||
    account.name.includes("役員報酬")
  ) {
    return sum(
      (line) =>
        line.id === "officer_compensation" ||
        line.id.includes("officer") ||
        line.name.includes("役員報酬"),
    );
  }
  if (
    dataSource.includes("loans") ||
    account.code === "5500" ||
    account.name.includes("支払利息")
  ) {
    return (
      sum(
        (line) =>
          line.id.includes("interest") || line.name.includes("支払利息"),
      ) ?? 0
    );
  }
  if (account.code === "5800" || account.name.includes("保険料")) {
    return (
      sum(
        (line) => line.id.includes("insurance") || line.name.includes("保険"),
      ) ?? 0
    );
  }
  return undefined;
}

/**
 * CoA-driven catalog for budget UI.
 * Allocatable accounts drive editor dropdowns; derived/planned are reference-only.
 */
export function listBudgetCategoryCatalog(
  fiscalYear: string,
): BudgetCategoryCatalogEntry[] {
  return loadChartOfAccounts()
    .accounts.filter((account) => account.type === "expense")
    .map((account) => {
      const scope = account.budget_delegation ?? "department";
      const mutability = account.budget_mutability
        ? account.budget_mutability
        : scope === "company"
          ? ("planned" as const)
          : ("allocatable" as const);
      const uiEditable = mutability === "allocatable";
      return {
        account_code: account.code,
        account_name: account.name,
        budget_delegation: scope,
        budget_mutability: mutability,
        person_allocatable: scope === "person" && uiEditable,
        ui_editable: uiEditable,
        reference_yen: uiEditable
          ? undefined
          : referenceYenFromExpensePlan(account, fiscalYear),
        source_path: account.data_source,
      };
    });
}

function setCategoryAmount(
  categories: Array<{ account_code: string; allocation_yen: number }>,
  accountCode: string,
  amountYen: number,
): void {
  const existing = categories.find((row) => row.account_code === accountCode);
  if (amountYen === 0) {
    if (existing) categories.splice(categories.indexOf(existing), 1);
    return;
  }
  if (existing) existing.allocation_yen = amountYen;
  else
    categories.push({ account_code: accountCode, allocation_yen: amountYen });
  categories.sort((a, b) => a.account_code.localeCompare(b.account_code));
}

function humanPerson(personId: string) {
  const person = findBudgetPerson(personId);
  if (!person) {
    throw new Error(`Unknown human person ${personId}`);
  }
  return person;
}

function adjustmentPolicy(file: BudgetDelegationFile) {
  return file.adjustment_policy ?? DEFAULT_ADJUSTMENT_POLICY;
}

function requireAdjustmentReference(
  file: BudgetDelegationFile,
  reference: string | undefined,
  governed: boolean,
): void {
  if (
    governed &&
    adjustmentPolicy(file).require_adjustment_reference &&
    !reference?.trim()
  ) {
    throw new Error("変更理由（決裁参照）が必要です。");
  }
}

export type BudgetAdjustmentBand = {
  percent: number;
  min_yen: number;
  max_yen: number;
  within_policy: boolean;
};

/** Classify amount vs plan baseline band. Outside band escalates; it does not hard-block proposals. */
export function resolveBudgetAdjustmentBand(
  amountYen: number,
  baselineYen: number | undefined,
  percent: number,
): BudgetAdjustmentBand | null {
  if (baselineYen == null || baselineYen <= 0) return null;
  const range = budgetAdjustmentRange(baselineYen, percent);
  return {
    percent,
    min_yen: range.min_yen,
    max_yen: range.max_yen,
    within_policy: amountYen >= range.min_yen && amountYen <= range.max_yen,
  };
}

function escalationFromBand(
  band: BudgetAdjustmentBand | null,
): BudgetPendingChange["escalation"] {
  return band && !band.within_policy ? "beyond_policy" : "within_policy";
}

function requireWithinPolicyForDirectApply(
  band: BudgetAdjustmentBand | null,
  scopeLabel: string,
): void {
  if (!band || band.within_policy) return;
  throw new Error(
    `${scopeLabel}が計画基準の調整幅（±${band.percent}% · ${band.min_yen.toLocaleString("ja-JP")}〜${band.max_yen.toLocaleString("ja-JP")}円）を超えています。` +
      `超過変更は即時反映せず、上位役職者への承認申請（所管取締役／必要に応じ取締役会付議）として提出してください。`,
  );
}

function approvalMessageForTotalChange(opts: {
  kind: "company_total" | "department_total";
  orgUnitId?: string;
  previousYen: number;
  nextYen: number;
  reference?: string;
  escalation: BudgetPendingChange["escalation"];
  band: BudgetAdjustmentBand | null;
}): string {
  const head =
    opts.kind === "company_total"
      ? `全社予算枠の変更承認 · ${opts.previousYen.toLocaleString("ja-JP")} → ${opts.nextYen.toLocaleString("ja-JP")}円`
      : `部門予算枠の変更承認 · ${opts.orgUnitId} · ${opts.previousYen.toLocaleString("ja-JP")} → ${opts.nextYen.toLocaleString("ja-JP")}円`;
  const bandNote =
    opts.escalation === "beyond_policy" && opts.band
      ? ` · 調整幅（±${opts.band.percent}%）超過のため所管取締役承認または取締役会付議`
      : " · 上位役職者の承認後に反映";
  const ref = opts.reference ? ` · ${opts.reference}` : "";
  return `${head}${bandNote}${ref}`;
}

/** Plan governance for range checks — does not block allocation while draft. */
function planGovernanceForBudgetChange(
  file: BudgetDelegationFile,
): BudgetPlanGovernance {
  return resolveBudgetPlanGovernance(file.fiscal_year);
}

function nextChangeId(file: BudgetDelegationFile): string {
  const max = (file.pending_changes ?? []).reduce((current, change) => {
    const numeric = Number(change.change_id.slice(4));
    return Number.isFinite(numeric) ? Math.max(current, numeric) : current;
  }, 0);
  return `BDC-${String(max + 1).padStart(6, "0")}`;
}

function supersedePending(
  file: BudgetDelegationFile,
  kind: BudgetPendingChange["kind"],
  orgUnitId?: string,
): void {
  for (const change of file.pending_changes ?? []) {
    if (change.status !== "pending") continue;
    if (change.kind !== kind) continue;
    if (kind === "department_total" && change.org_unit_id !== orgUnitId) {
      continue;
    }
    change.status = "superseded";
  }
}

function departmentHead(orgUnitId: string): string {
  const authority = loadOrgAuthority();
  const unit = authority?.units.find((row) => row.org_unit_id === orgUnitId);
  if (!unit?.head_operator_id) {
    throw new Error(`No department head registered for ${orgUnitId}`);
  }
  return unit.head_operator_id;
}

function nextEventId(file: BudgetDelegationFile): string {
  const max = file.events.reduce((current, event) => {
    const numeric = Number(event.event_id.slice(4));
    return Number.isFinite(numeric) ? Math.max(current, numeric) : current;
  }, 0);
  return `BDE-${String(max + 1).padStart(6, "0")}`;
}

function appendEvent(
  file: BudgetDelegationFile,
  event: Omit<BudgetDelegationEvent, "event_id" | "occurred_at">,
): void {
  file.events.push({
    ...event,
    event_id: nextEventId(file),
    occurred_at: new Date().toISOString(),
  });
}

function audit(actor: string, detail: string): void {
  appendInstructionAudit({
    actor_operator_id: actor,
    action: "cli.mutation",
    ok: true,
    detail,
  });
}

export function initializeCompanyBudget(input: {
  fiscalYear: string;
  amountYen: number;
  actor: OperatorRecord;
}): BudgetDelegationFile {
  requireCeo(input.actor);
  positiveYen(input.amountYen);
  const fiscalYear = normalizeBudgetFiscalYear(input.fiscalYear);
  return withBudgetDelegationLock(fiscalYear, () => {
    if (loadBudgetDelegation({ fiscalYear })) {
      throw new Error("Budget delegation registry already exists");
    }
    const file: BudgetDelegationFile = {
      version: 1,
      fiscal_year: fiscalYear,
      currency: "JPY",
      company_budget_yen: input.amountYen,
      company_budget_approved_by_operator_id: input.actor.operator_id,
      adjustment_policy: DEFAULT_ADJUSTMENT_POLICY,
      company_category_budgets: [],
      departments: [],
      pending_changes: [],
      events: [],
    };
    const plan = resolveBudgetPlanGovernance(fiscalYear);
    if (plan.baseline_yen != null && input.amountYen !== plan.baseline_yen) {
      throw new Error(
        "Initial company budget must equal the expense-plan baseline",
      );
    }
    appendEvent(file, {
      action: "company_budget_set",
      actor_operator_id: input.actor.operator_id,
      amount_yen: input.amountYen,
    });
    saveBudgetDelegation(file);
    audit(
      input.actor.operator_id,
      `company budget initialized ${input.amountYen}`,
    );
    return file;
  });
}

function validateCompanyTotalAmount(
  file: BudgetDelegationFile,
  amountYen: number,
  reference?: string,
): { plan: BudgetPlanGovernance; band: BudgetAdjustmentBand | null } {
  positiveYen(amountYen);
  const plan = planGovernanceForBudgetChange(file);
  requireAdjustmentReference(
    file,
    reference,
    plan.baseline_yen != null && amountYen !== file.company_budget_yen,
  );
  const band = resolveBudgetAdjustmentBand(
    amountYen,
    plan.baseline_yen,
    adjustmentPolicy(file).company_max_adjustment_pct,
  );
  const allocated = file.departments.reduce(
    (sum, department) => sum + department.allocation_yen,
    0,
  );
  if (amountYen < allocated) {
    throw new Error(
      `全社予算枠を部門分配済（${allocated.toLocaleString("ja-JP")}円）より小さくできません。`,
    );
  }
  return { plan, band };
}

/**
 * @deprecated Prefer proposeCompanyBudgetTotal + approve + apply.
 * Direct apply remains only for within_policy non-increase paths used by legacy CLI.
 */
export function setCompanyBudget(input: {
  amountYen: number;
  actor: OperatorRecord;
  reference?: string;
  expectedRevision?: string;
}): BudgetDelegationFile {
  requireCeo(input.actor);
  return withBudgetDelegationLock(undefined, () => {
    const file = requireBudgetFile();
    assertExpectedRevision(file, input.expectedRevision);
    if (input.amountYen > file.company_budget_yen) {
      assertPlanAllowsEnvelopeIncrease(file.fiscal_year);
    }
    const { band } = validateCompanyTotalAmount(
      file,
      input.amountYen,
      input.reference,
    );
    requireWithinPolicyForDirectApply(band, "全社予算枠");
    file.company_budget_yen = input.amountYen;
    file.company_budget_approved_by_operator_id = input.actor.operator_id;
    appendEvent(file, {
      action: "company_budget_set",
      actor_operator_id: input.actor.operator_id,
      amount_yen: input.amountYen,
      reference: input.reference,
    });
    saveBudgetDelegation(file);
    audit(input.actor.operator_id, `company budget set ${input.amountYen}`);
    return file;
  });
}

/** Propose company total change for 上長 (internal) approval — does not apply yet. */
export function proposeCompanyBudgetTotal(input: {
  amountYen: number;
  actor: OperatorRecord;
  reference?: string;
  /** Required when escalation is beyond_policy (ADR 0027). */
  boardEventId?: string;
  expectedRevision?: string;
}): {
  file: BudgetDelegationFile;
  change: BudgetPendingChange;
  approval_id: string;
} {
  requireCeo(input.actor);
  return withBudgetDelegationLock(undefined, () => {
    const file = requireBudgetFile();
    assertExpectedRevision(file, input.expectedRevision);
    if (input.amountYen > file.company_budget_yen) {
      assertPlanAllowsEnvelopeIncrease(file.fiscal_year);
    }
    const { band } = validateCompanyTotalAmount(
      file,
      input.amountYen,
      input.reference,
    );
    if (input.amountYen === file.company_budget_yen) {
      throw new Error("全社予算枠に変更がありません。");
    }
    const escalation = escalationFromBand(band);
    if (escalation === "beyond_policy") {
      if (!input.boardEventId?.trim()) {
        throw new Error(
          "調整幅を超える全社予算変更（beyond_policy）には board_event_id が必要です。",
        );
      }
      assertBoardEventForBeyondPolicy(input.boardEventId.trim());
    }
    supersedePending(file, "company_total");
    const changeId = nextChangeId(file);
    const previousYen = file.company_budget_yen;
    const deltaYen = Math.abs(input.amountYen - previousYen);
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: BUDGET_COMPANY_TOTAL_SUBJECT,
      subjectRef: changeId,
      proposedBy: input.actor.operator_id,
      // REG-004 tiers on change magnitude (not absolute envelope).
      amount: { value: deltaYen, currency: "JPY" },
      message: approvalMessageForTotalChange({
        kind: "company_total",
        previousYen,
        nextYen: input.amountYen,
        reference: input.reference,
        escalation,
        band,
      }),
    });
    const change: BudgetPendingChange = {
      change_id: changeId,
      approval_id: approval.approval_id,
      kind: "company_total",
      amount_yen: input.amountYen,
      reference: input.reference,
      escalation,
      board_event_id:
        escalation === "beyond_policy"
          ? input.boardEventId!.trim()
          : input.boardEventId?.trim(),
      proposed_by_operator_id: input.actor.operator_id,
      proposed_at: new Date().toISOString(),
      status: "pending",
    };
    file.pending_changes = [...(file.pending_changes ?? []), change];
    saveBudgetDelegation(file);
    audit(
      input.actor.operator_id,
      `company budget total proposed ${approval.approval_id} ${input.amountYen} ${escalation}`,
    );
    return { file, change, approval_id: approval.approval_id };
  });
}

export function setCompanyCategoryBudget(input: {
  accountCode: string;
  amountYen: number;
  actor: OperatorRecord;
  reference?: string;
  expectedRevision?: string;
}): BudgetDelegationFile {
  requireCeo(input.actor);
  nonnegativeIntegerYen(input.amountYen);
  requireExpenseAccount(input.accountCode);
  assertAllocatableBudgetAccount(input.accountCode);
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  const reserved = file.departments.reduce(
    (sum, department) =>
      sum +
      (department.category_budgets.find(
        (row) => row.account_code === input.accountCode,
      )?.allocation_yen ?? 0),
    0,
  );
  if (input.amountYen < reserved) {
    throw new Error(
      `この費目は部門への配分合計（${yenJa(reserved)}）を下回れません。` +
        `先に部門側の費目を減らしてください。`,
    );
  }
  assertCategoryFitWithinLimit({
    label: "全社",
    limitYen: file.company_budget_yen,
    categories: file.company_category_budgets,
    accountCode: input.accountCode,
    nextAmountYen: input.amountYen,
  });
  // Category path must never raise company_budget_yen — guide to total propose.
  const nextCategoryTotal =
    categoryTotalYen(file.company_category_budgets, input.accountCode) +
    input.amountYen;
  if (nextCategoryTotal > file.company_budget_yen) {
    throw new Error(
      `全社費目の合計が全社予算枠を超えます。会社総額の引き上げは費目画面ではできません。` +
        `先に全社予算枠の変更を申請（propose）してください。`,
    );
  }
  setCategoryAmount(
    file.company_category_budgets,
    input.accountCode,
    input.amountYen,
  );
  appendEvent(file, {
    action: "company_category_set",
    actor_operator_id: input.actor.operator_id,
    account_code: input.accountCode,
    amount_yen: input.amountYen,
    reference: input.reference,
  });
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `company budget category ${input.accountCode} ${input.amountYen}`,
  );
  return file;
  });
}

function validateDepartmentTotalAmount(
  file: BudgetDelegationFile,
  orgUnitId: string,
  amountYen: number,
  reference?: string,
): {
  plan: BudgetPlanGovernance;
  headOperatorId: string;
  existing?: DepartmentBudget;
  band: BudgetAdjustmentBand | null;
} {
  positiveYen(amountYen);
  const plan = planGovernanceForBudgetChange(file);
  const authority = loadOrgAuthority();
  const baselineMan = authority?.units.find(
    (unit) => unit.org_unit_id === orgUnitId,
  )?.budget_plan_man;
  const baselineYen =
    plan.baseline_yen != null && baselineMan != null
      ? Math.round(baselineMan * 10_000)
      : undefined;
  const existing = file.departments.find(
    (department) => department.org_unit_id === orgUnitId,
  );
  requireAdjustmentReference(
    file,
    reference,
    baselineYen != null && amountYen !== existing?.allocation_yen,
  );
  const band = resolveBudgetAdjustmentBand(
    amountYen,
    baselineYen,
    adjustmentPolicy(file).department_max_adjustment_pct,
  );
  const headOperatorId = departmentHead(orgUnitId);
  if (!findOperatorById(headOperatorId)) {
    throw new Error(`部門長 ${headOperatorId} が見つかりません。`);
  }
  const otherTotal = file.departments
    .filter((department) => department.org_unit_id !== orgUnitId)
    .reduce((sum, department) => sum + department.allocation_yen, 0);
  if (otherTotal + amountYen > file.company_budget_yen) {
    throw new Error(
      `部門分配の合計が全社予算枠を超えます。先に全社予算枠の増額を上位役職者へ申請するか、他部門の分配を減らしてください。`,
    );
  }
  if (existing) {
    const reserved =
      existing.direct_committed_yen +
      existing.member_budgets.reduce(
        (sum, member) => sum + member.allocation_yen,
        0,
      );
    if (amountYen < reserved) {
      throw new Error(
        `部門予算枠を個人分配・執行済の合計（${reserved.toLocaleString("ja-JP")}円）より小さくできません。`,
      );
    }
  }
  return { plan, headOperatorId, existing, band };
}

function applyDepartmentTotalToFile(
  file: BudgetDelegationFile,
  input: {
    orgUnitId: string;
    amountYen: number;
    actorOperatorId: string;
    approvedByOperatorId: string;
    headOperatorId: string;
    reference?: string;
    notes?: string;
  },
): DepartmentBudget {
  const existing = file.departments.find(
    (department) => department.org_unit_id === input.orgUnitId,
  );
  if (existing) {
    existing.allocation_yen = input.amountYen;
    existing.head_operator_id = input.headOperatorId;
    existing.allocated_by_operator_id = input.actorOperatorId;
    existing.approved_by_operator_id = input.approvedByOperatorId;
    existing.notes = input.notes ?? existing.notes;
  } else {
    file.departments.push({
      org_unit_id: input.orgUnitId,
      head_operator_id: input.headOperatorId,
      allocation_yen: input.amountYen,
      direct_committed_yen: 0,
      category_budgets: [],
      allocated_by_operator_id: input.actorOperatorId,
      approved_by_operator_id: input.approvedByOperatorId,
      member_budgets: [],
      notes: input.notes,
    });
  }
  appendEvent(file, {
    action: "department_allocated",
    actor_operator_id: input.actorOperatorId,
    org_unit_id: input.orgUnitId,
    target_operator_id: input.headOperatorId,
    amount_yen: input.amountYen,
    reference: input.reference,
  });
  return file.departments.find(
    (department) => department.org_unit_id === input.orgUnitId,
  )!;
}

/**
 * @deprecated Prefer proposeDepartmentBudgetTotal + approve + apply for total changes.
 * Direct apply remains for within_policy paths (e.g. initial allocation tests / legacy CLI).
 */
export function allocateDepartmentBudget(input: {
  orgUnitId: string;
  amountYen: number;
  actor: OperatorRecord;
  reference?: string;
  notes?: string;
  expectedRevision?: string;
}): DepartmentBudget {
  requireCeo(input.actor);
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  const existing = file.departments.find(
    (department) => department.org_unit_id === input.orgUnitId,
  );
  const previous = existing?.allocation_yen ?? 0;
  if (input.amountYen > previous) {
    assertPlanAllowsEnvelopeIncrease(file.fiscal_year);
  }
  const { headOperatorId, band } = validateDepartmentTotalAmount(
    file,
    input.orgUnitId,
    input.amountYen,
    input.reference,
  );
  requireWithinPolicyForDirectApply(band, `部門 ${input.orgUnitId} の予算枠`);
  const department = applyDepartmentTotalToFile(file, {
    orgUnitId: input.orgUnitId,
    amountYen: input.amountYen,
    actorOperatorId: input.actor.operator_id,
    approvedByOperatorId: input.actor.operator_id,
    headOperatorId,
    reference: input.reference,
    notes: input.notes,
  });
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `department budget ${input.orgUnitId} ${input.amountYen}`,
  );
  return department;
  });
}

/** Propose department total change for 上長 approval — does not apply yet. */
export function proposeDepartmentBudgetTotal(input: {
  orgUnitId: string;
  amountYen: number;
  actor: OperatorRecord;
  reference?: string;
  notes?: string;
  /** Required when escalation is beyond_policy (ADR 0027). */
  boardEventId?: string;
  expectedRevision?: string;
}): {
  file: BudgetDelegationFile;
  change: BudgetPendingChange;
  approval_id: string;
} {
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  const { headOperatorId, existing, band } = validateDepartmentTotalAmount(
    file,
    input.orgUnitId,
    input.amountYen,
    input.reference,
  );
  const isCeo = input.actor.role === "ceo";
  const isHead = input.actor.operator_id === headOperatorId;
  if (!isCeo && !isHead) {
    throw new Error(
      "部門予算枠の変更は部門責任者またはCEOが申請できます。",
    );
  }
  if (existing && input.amountYen === existing.allocation_yen) {
    throw new Error("部門予算枠に変更がありません。");
  }
  const previous = existing?.allocation_yen ?? 0;
  if (input.amountYen > previous) {
    assertPlanAllowsEnvelopeIncrease(file.fiscal_year);
  }
  const escalation = escalationFromBand(band);
  if (escalation === "beyond_policy") {
    if (!input.boardEventId?.trim()) {
      throw new Error(
        "調整幅を超える部門予算変更（beyond_policy）には board_event_id が必要です。",
      );
    }
    assertBoardEventForBeyondPolicy(input.boardEventId.trim());
  }
  supersedePending(file, "department_total", input.orgUnitId);
  const changeId = nextChangeId(file);
  const deltaYen = Math.abs(input.amountYen - previous);
  const approval = proposeOrgApproval({
    scope: "internal",
    subjectType: BUDGET_DEPARTMENT_TOTAL_SUBJECT,
    subjectRef: changeId,
    proposedBy: input.actor.operator_id,
    // REG-004 tiers on change magnitude (not absolute envelope).
    amount: { value: deltaYen, currency: "JPY" },
    message: approvalMessageForTotalChange({
      kind: "department_total",
      orgUnitId: input.orgUnitId,
      previousYen: previous,
      nextYen: input.amountYen,
      reference: input.reference,
      escalation,
      band,
    }),
  });
  const change: BudgetPendingChange = {
    change_id: changeId,
    approval_id: approval.approval_id,
    kind: "department_total",
    amount_yen: input.amountYen,
    org_unit_id: input.orgUnitId,
    reference: input.reference,
    notes: input.notes,
    escalation,
    board_event_id:
      escalation === "beyond_policy"
        ? input.boardEventId!.trim()
        : input.boardEventId?.trim(),
    proposed_by_operator_id: input.actor.operator_id,
    proposed_at: new Date().toISOString(),
    status: "pending",
  };
  file.pending_changes = [...(file.pending_changes ?? []), change];
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `department budget total proposed ${input.orgUnitId} ${approval.approval_id} ${input.amountYen} ${escalation}`,
  );
  return { file, change, approval_id: approval.approval_id };
  });
}

/** Apply a pending total change after internal approval is granted. */
export function applyApprovedBudgetTotalChange(opts: {
  approvalId: string;
  appliedByOperatorId: string;
  /** When set, must match current envelope revision under the lock. */
  expectedRevision?: string;
}): BudgetDelegationFile {
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, opts.expectedRevision);
  const change = (file.pending_changes ?? []).find(
    (row) => row.approval_id === opts.approvalId && row.status === "pending",
  );
  if (!change) {
    throw new Error(
      `No pending budget total change for approval ${opts.approvalId}`,
    );
  }
  const approval = findOrgApproval(opts.approvalId);
  if (!approval || approval.status !== "approved") {
    throw new Error(
      `Approval ${opts.approvalId} must be approved before budget apply`,
    );
  }
  if (!isBudgetTotalApprovalSubject(approval.subject_type)) {
    throw new Error(
      `Approval ${opts.approvalId} is not a budget total subject`,
    );
  }
  if (change.escalation === "beyond_policy") {
    if (!change.board_event_id?.trim()) {
      throw new Error(
        `Pending change ${change.change_id} is beyond_policy but missing board_event_id`,
      );
    }
    assertBoardEventForBeyondPolicy(change.board_event_id);
  }
  if (change.kind === "company_total") {
    if (change.amount_yen > file.company_budget_yen) {
      assertPlanAllowsEnvelopeIncrease(file.fiscal_year);
    }
    validateCompanyTotalAmount(file, change.amount_yen, change.reference);
    file.company_budget_yen = change.amount_yen;
    file.company_budget_approved_by_operator_id = opts.appliedByOperatorId;
    appendEvent(file, {
      action: "company_budget_set",
      actor_operator_id: change.proposed_by_operator_id,
      amount_yen: change.amount_yen,
      reference: change.reference,
    });
  } else {
    if (!change.org_unit_id) {
      throw new Error(`Pending change ${change.change_id} missing org_unit_id`);
    }
    const existingDept = file.departments.find(
      (department) => department.org_unit_id === change.org_unit_id,
    );
    if (change.amount_yen > (existingDept?.allocation_yen ?? 0)) {
      assertPlanAllowsEnvelopeIncrease(file.fiscal_year);
    }
    const { headOperatorId } = validateDepartmentTotalAmount(
      file,
      change.org_unit_id,
      change.amount_yen,
      change.reference,
    );
    applyDepartmentTotalToFile(file, {
      orgUnitId: change.org_unit_id,
      amountYen: change.amount_yen,
      actorOperatorId: change.proposed_by_operator_id,
      approvedByOperatorId: opts.appliedByOperatorId,
      headOperatorId,
      reference: change.reference,
      notes: change.notes,
    });
  }
  change.status = "applied";
  saveBudgetDelegation(file);
  audit(
    opts.appliedByOperatorId,
    `budget total applied ${change.change_id} via ${opts.approvalId}`,
  );
  return file;
  });
}

export function allocateDepartmentCategoryBudget(input: {
  orgUnitId: string;
  accountCode: string;
  amountYen: number;
  actor: OperatorRecord;
  reference?: string;
  expectedRevision?: string;
}): DepartmentBudget {
  nonnegativeIntegerYen(input.amountYen);
  requireExpenseAccount(input.accountCode);
  assertAllocatableBudgetAccount(input.accountCode);
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  requireDeptHeadOrCeo(input.actor, input.orgUnitId);
  const department = requireDepartment(file, input.orgUnitId);
  const companyLimit = file.company_category_budgets.find(
    (row) => row.account_code === input.accountCode,
  );
  if (!companyLimit) {
    throw new Error(`Company category ${input.accountCode} is not allocated`);
  }
  const otherDepartments = file.departments
    .filter((row) => row.org_unit_id !== input.orgUnitId)
    .reduce(
      (sum, row) =>
        sum +
        (row.category_budgets.find(
          (category) => category.account_code === input.accountCode,
        )?.allocation_yen ?? 0),
      0,
    );
  if (otherDepartments + input.amountYen > companyLimit.allocation_yen) {
    const room = Math.max(0, companyLimit.allocation_yen - otherDepartments);
    throw new Error(
      `部門の費目配分が全社の同費目枠を超えます。` +
        `全社のこの費目枠 ${yenJa(companyLimit.allocation_yen)} · ` +
        `他部門合計 ${yenJa(otherDepartments)} · この部門の上限 ${yenJa(room)}。` +
        `増やす分は他部門の同費目を減らすか、先に全社の費目枠を増やしてください。`,
    );
  }
  assertCategoryFitWithinLimit({
    label: "部門",
    limitYen: department.allocation_yen,
    categories: department.category_budgets,
    accountCode: input.accountCode,
    nextAmountYen: input.amountYen,
  });
  const reserved = department.member_budgets.reduce(
    (sum, member) =>
      sum +
      (member.category_budgets.find(
        (row) => row.account_code === input.accountCode,
      )?.allocation_yen ?? 0),
    0,
  );
  if (input.amountYen < reserved) {
    throw new Error(
      `この費目は個人への配分合計（${yenJa(reserved)}）を下回れません。` +
        `先に個人側の費目を減らしてください。`,
    );
  }
  setCategoryAmount(
    department.category_budgets,
    input.accountCode,
    input.amountYen,
  );
  appendEvent(file, {
    action: "department_category_set",
    actor_operator_id: input.actor.operator_id,
    org_unit_id: input.orgUnitId,
    account_code: input.accountCode,
    amount_yen: input.amountYen,
    reference: input.reference,
  });
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `department budget category ${input.orgUnitId} ${input.accountCode} ${input.amountYen}`,
  );
  return department;
  });
}

export function allocatePersonCategoryBudget(input: {
  orgUnitId: string;
  personId: string;
  accountCode: string;
  amountYen: number;
  actor: OperatorRecord;
  purpose?: string;
  reference?: string;
  /** When set, must match current last event_id (or "0" if none). */
  expectedRevision?: string;
}): DepartmentBudget {
  nonnegativeIntegerYen(input.amountYen);
  requireExpenseAccount(input.accountCode);
  assertPersonDelegatableAccount(input.accountCode);
  const person = humanPerson(input.personId);
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  const department = requireDepartment(file, input.orgUnitId);
  const isCeo = input.actor.role === "ceo";
  const isHead = input.actor.operator_id === department.head_operator_id;
  if (!isCeo && !isHead) {
    throw new Error("Person budget allocation requires department head or CEO");
  }
  if (!isCeo && !budgetPersonBelongsToDepartment(person, input.orgUnitId)) {
    throw new Error(`Person ${input.personId} is not in ${input.orgUnitId}`);
  }
  const departmentLimit = department.category_budgets.find(
    (row) => row.account_code === input.accountCode,
  );
  if (!departmentLimit) {
    throw new Error(
      `Department category ${input.accountCode} is not allocated`,
    );
  }
  let member = department.member_budgets.find(
    (row) => row.person_id === input.personId,
  );
  const otherPeopleForCategory = department.member_budgets
    .filter((row) => row.person_id !== input.personId)
    .reduce(
      (sum, row) =>
        sum +
        (row.category_budgets.find(
          (category) => category.account_code === input.accountCode,
        )?.allocation_yen ?? 0),
      0,
    );
  if (
    otherPeopleForCategory + input.amountYen >
    departmentLimit.allocation_yen
  ) {
    throw new Error("Person allocations exceed department category");
  }
  const otherMembersTotal = department.member_budgets
    .filter((row) => row.person_id !== input.personId)
    .reduce((sum, row) => sum + row.allocation_yen, 0);
  const otherPersonCategories = member
    ? member.category_budgets
        .filter((row) => row.account_code !== input.accountCode)
        .reduce((sum, row) => sum + row.allocation_yen, 0)
    : 0;
  const nextPersonTotal = otherPersonCategories + input.amountYen;
  if (
    otherMembersTotal + nextPersonTotal + department.direct_committed_yen >
    department.allocation_yen
  ) {
    throw new Error("Person allocations would exceed department budget");
  }
  if (member && nextPersonTotal < member.committed_yen) {
    throw new Error(
      `Person allocation cannot be below committed amount (${member.committed_yen})`,
    );
  }
  if (!member) {
    member = {
      person_id: input.personId,
      allocation_yen: 0,
      committed_yen: 0,
      category_budgets: [],
      allocated_by_operator_id: input.actor.operator_id,
      purpose: input.purpose,
    };
    department.member_budgets.push(member);
  }
  setCategoryAmount(
    member.category_budgets,
    input.accountCode,
    input.amountYen,
  );
  member.allocation_yen = member.category_budgets.reduce(
    (sum, row) => sum + row.allocation_yen,
    0,
  );
  member.allocated_by_operator_id = input.actor.operator_id;
  member.purpose = input.purpose ?? member.purpose;
  if (member.allocation_yen === 0 && member.committed_yen === 0) {
    department.member_budgets.splice(
      department.member_budgets.indexOf(member),
      1,
    );
  }
  appendEvent(file, {
    action: "person_category_set",
    actor_operator_id: input.actor.operator_id,
    org_unit_id: input.orgUnitId,
    target_person_id: input.personId,
    account_code: input.accountCode,
    amount_yen: input.amountYen,
    reference: input.reference,
  });
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `person budget category ${input.personId} ${input.accountCode} ${input.amountYen}`,
  );
  return department;
  });
}

export function allocateMemberBudget(input: {
  orgUnitId: string;
  memberOperatorId: string;
  amountYen: number;
  actor: OperatorRecord;
  purpose?: string;
  reference?: string;
  expectedRevision?: string;
}): DepartmentBudget {
  positiveYen(input.amountYen);
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  const department = requireDepartment(file, input.orgUnitId);
  if (
    input.actor.role !== "ceo" &&
    input.actor.operator_id !== department.head_operator_id
  ) {
    throw new Error("Member budget allocation requires department head or CEO");
  }
  const memberOperator = findOperatorById(input.memberOperatorId);
  if (!memberOperator) {
    throw new Error(`Unknown active member operator ${input.memberOperatorId}`);
  }
  if (
    memberOperator.org_unit_id &&
    memberOperator.org_unit_id !== input.orgUnitId
  ) {
    throw new Error(
      `Operator ${input.memberOperatorId} is not a member of ${input.orgUnitId}`,
    );
  }
  const existing = department.member_budgets.find(
    (member) => member.operator_id === input.memberOperatorId,
  );
  const otherTotal = department.member_budgets
    .filter((member) => member.operator_id !== input.memberOperatorId)
    .reduce((sum, member) => sum + member.allocation_yen, 0);
  if (
    otherTotal + input.amountYen + department.direct_committed_yen >
    department.allocation_yen
  ) {
    throw new Error("Member allocations would exceed department budget");
  }
  if (existing) {
    if (input.amountYen < existing.committed_yen) {
      throw new Error(
        `Member allocation cannot be below committed amount (${existing.committed_yen})`,
      );
    }
    existing.allocation_yen = input.amountYen;
    existing.allocated_by_operator_id = input.actor.operator_id;
    existing.purpose = input.purpose ?? existing.purpose;
  } else {
    department.member_budgets.push({
      operator_id: input.memberOperatorId,
      allocation_yen: input.amountYen,
      committed_yen: 0,
      category_budgets: [],
      allocated_by_operator_id: input.actor.operator_id,
      purpose: input.purpose,
    });
  }
  appendEvent(file, {
    action: "member_allocated",
    actor_operator_id: input.actor.operator_id,
    org_unit_id: input.orgUnitId,
    target_operator_id: input.memberOperatorId,
    amount_yen: input.amountYen,
    reference: input.reference,
  });
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `member budget ${input.memberOperatorId} ${input.amountYen}`,
  );
  return department;
  });
}

export function commitMemberBudget(input: {
  orgUnitId: string;
  memberOperatorId: string;
  amountYen: number;
  actor: OperatorRecord;
  reference: string;
  expectedRevision?: string;
}): DepartmentBudget {
  positiveYen(input.amountYen);
  if (!input.reference.trim()) {
    throw new Error("commitment reference is required");
  }
  return withBudgetDelegationLock(undefined, () => {
  const file = requireBudgetFile();
  assertExpectedRevision(file, input.expectedRevision);
  const department = requireDepartment(file, input.orgUnitId);
  if (
    input.actor.role !== "ceo" &&
    input.actor.operator_id !== department.head_operator_id &&
    input.actor.operator_id !== input.memberOperatorId
  ) {
    throw new Error(
      "Only the member, department head, or CEO may commit budget",
    );
  }
  const member = department.member_budgets.find(
    (row) => row.operator_id === input.memberOperatorId,
  );
  if (!member) {
    throw new Error(`No member budget for ${input.memberOperatorId}`);
  }
  if (member.committed_yen + input.amountYen > member.allocation_yen) {
    throw new Error("Commitment would exceed member budget");
  }
  member.committed_yen += input.amountYen;
  appendEvent(file, {
    action: "member_committed",
    actor_operator_id: input.actor.operator_id,
    org_unit_id: input.orgUnitId,
    target_operator_id: input.memberOperatorId,
    amount_yen: input.amountYen,
    reference: input.reference,
  });
  saveBudgetDelegation(file);
  audit(
    input.actor.operator_id,
    `member commitment ${input.memberOperatorId} ${input.amountYen}`,
  );
  return department;
  });
}

export function budgetDelegationSummary(file = requireBudgetFile()): {
  company_budget_yen: number;
  department_allocated_yen: number;
  company_unallocated_yen: number;
  company_category_allocated_yen: number;
  company_category_unallocated_yen: number;
  departments: Array<{
    org_unit_id: string;
    head_operator_id: string;
    allocation_yen: number;
    member_allocated_yen: number;
    committed_yen: number;
    available_to_delegate_yen: number;
  }>;
} {
  const departments = file.departments.map((department) => {
    const memberAllocated = department.member_budgets.reduce(
      (sum, member) => sum + member.allocation_yen,
      0,
    );
    const memberCommitted = department.member_budgets.reduce(
      (sum, member) => sum + member.committed_yen,
      0,
    );
    return {
      org_unit_id: department.org_unit_id,
      head_operator_id: department.head_operator_id,
      allocation_yen: department.allocation_yen,
      member_allocated_yen: memberAllocated,
      committed_yen: department.direct_committed_yen + memberCommitted,
      available_to_delegate_yen:
        department.allocation_yen -
        department.direct_committed_yen -
        memberAllocated,
    };
  });
  const departmentAllocated = departments.reduce(
    (sum, department) => sum + department.allocation_yen,
    0,
  );
  const companyCategoryAllocated = categoryTotalYen(
    file.company_category_budgets,
  );
  return {
    company_budget_yen: file.company_budget_yen,
    department_allocated_yen: departmentAllocated,
    company_unallocated_yen: file.company_budget_yen - departmentAllocated,
    company_category_allocated_yen: companyCategoryAllocated,
    company_category_unallocated_yen:
      file.company_budget_yen - companyCategoryAllocated,
    departments,
  };
}

function requireBudgetFile(): BudgetDelegationFile {
  const file = loadBudgetDelegation();
  if (!file) {
    throw new Error(
      "Budget delegation registry is not initialized; run org budget init",
    );
  }
  return file;
}

function requireDepartment(
  file: BudgetDelegationFile,
  orgUnitId: string,
): DepartmentBudget {
  const department = file.departments.find(
    (row) => row.org_unit_id === orgUnitId,
  );
  if (!department) {
    throw new Error(`No department budget for ${orgUnitId}`);
  }
  return department;
}
