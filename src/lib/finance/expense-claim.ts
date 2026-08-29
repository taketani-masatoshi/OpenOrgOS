import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  EXPENSE_CLAIM_BOARD_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  EXPENSE_CLAIM_RINGI_SUBJECT,
  expenseClaimSchema,
  expenseClaimsFileSchema,
  type ExpenseClaim,
  type ExpenseClaimAllocation,
  type ExpenseClaimGate,
  type ExpenseClaimsFile,
} from "../../../schemas/finance/expense-claim.js";
import {
  assertExpenseClaimInvoiceCompliance,
  invoiceCatalogFreshnessWarnings,
} from "./expense-claim-invoice.js";
import {
  assertExpenseAccountConsistent,
  inferExpenseAccountFromReceipt,
} from "./expense-claim-category.js";
import {
  closeEmployeeReimbursementPayable,
  loadEmployeeReimbursementPayables,
  prepareEmployeeReimbursementTransfer,
  syncEmployeeReimbursementPayable,
  verifyEmployeeReimbursementBrokerEvidence,
} from "./employee-reimbursement-payable.js";
import {
  loadJournalEntries,
  journalIntegrityIssues,
  postExpenseClaimJournal,
  reimburseExpenseClaimJournal,
} from "./expense-claim-journal.js";
import {
  archiveExpenseEvidence,
  loadExpenseEvidenceManifest,
  verifyExpenseEvidence,
} from "./expense-evidence.js";
import { isAuthorizedExpenseRepresentative } from "./expense-claim-approver.js";
import {
  assertExpenseClaimBankStatementRef,
  markExpenseClaimBankStatementMatched,
} from "./expense-claim-bank-match.js";
import { repairMissingApprovalForExpenseClaim } from "./expense-claim-approval-repair.js";
import { monthlyFinanceSchema } from "../../../schemas/finance/monthly-loans.js";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import {
  humanApproveOrgApproval,
  findOrgApproval,
  proposeOrgApproval,
  rejectOrgApproval,
} from "../org/approval/index.js";
import {
  assertPersonDelegatableAccount,
  assertBoardEventForBeyondPolicy,
  loadBudgetDelegation,
} from "../org/budget-delegation.js";
import {
  budgetPersonBelongsToDepartment,
  findBudgetPerson,
} from "../hr/person-directory.js";
import {
  loadChartOfAccounts,
  loadMonthlyFinance,
  loadMonthlyFinances,
} from "../data.js";
import {
  isWireReadyAdopter,
  resolveWireTrustNode,
} from "../protocol/wire-trust-registry.js";
import { loadPeersRegistry } from "../protocol/peers.js";
import { claimReceiptRemotely, ingestReceiptQrPayload } from "../receipt-qr.js";
import { getTenantId, loadTenantConfig } from "../tenant.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { requireExpectedRevisionToken } from "../cas-test-mode.js";
import { getClock } from "../runtime-context.js";
import { appendInstructionAudit } from "../org/instruction-audit.js";
import type { z } from "zod";
import { expenseCategory } from "../../../schemas/finance/monthly-loans.js";

type ExpenseCategory = z.output<typeof expenseCategory>;

const CLAIMS_REL = "finance/expense-claims.yaml";

export function expenseClaimsPath(): string {
  return join(getDataDir(), CLAIMS_REL);
}

export function loadExpenseClaims(): ExpenseClaimsFile {
  const path = expenseClaimsPath();
  if (!existsSync(path)) {
    return expenseClaimsFileSchema.parse({
      version: 1,
      claims_revision: 0,
      claims: [],
    });
  }
  return readYamlFile(path, expenseClaimsFileSchema);
}

/** Nestable exclusive section for load → assert → mutate → save. */
let expenseClaimsLockDepth = 0;

export function withExpenseClaimsLock<T>(fn: () => T): T {
  if (expenseClaimsLockDepth > 0) return fn();
  return withYamlFileLock(expenseClaimsPath(), () => {
    expenseClaimsLockDepth += 1;
    try {
      return fn();
    } finally {
      expenseClaimsLockDepth -= 1;
    }
  });
}

export function saveExpenseClaims(file: ExpenseClaimsFile): void {
  const path = expenseClaimsPath();
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  const parsed = expenseClaimsFileSchema.parse(file);
  const write = (): void => {
    writeYamlFileAtomic(path, parsed);
  };
  if (expenseClaimsLockDepth > 0) {
    write();
    return;
  }
  withYamlFileLock(path, write);
}

/** Optimistic concurrency token for HTTP `expected_claims_revision`. */
export function expenseClaimsRevision(file?: ExpenseClaimsFile | null): string {
  return String(file?.claims_revision ?? 0);
}

export class ExpenseClaimsRevisionConflictError extends Error {
  readonly code = "revision_conflict" as const;
  readonly currentRevision: string;
  readonly expectedRevision: string;

  constructor(currentRevision: string, expectedRevision: string) {
    super(
      `Expense claims revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
    this.name = "ExpenseClaimsRevisionConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export function assertExpectedClaimsRevision(
  file: ExpenseClaimsFile,
  expectedRevision?: string,
): void {
  requireExpectedRevisionToken(expectedRevision, "expected_claims_revision");
  if (expectedRevision == null || expectedRevision === "") return;
  const current = expenseClaimsRevision(file);
  if (current !== expectedRevision) {
    throw new ExpenseClaimsRevisionConflictError(current, expectedRevision);
  }
}

/** Per-claim optimistic concurrency token for HTTP `expected_claim_revision`. */
export function claimRevision(claim?: ExpenseClaim | null): string {
  return String(claim?.claim_revision ?? 0);
}

export class ExpenseClaimItemRevisionConflictError extends Error {
  readonly code = "revision_conflict" as const;
  readonly currentRevision: string;
  readonly expectedRevision: string;

  constructor(currentRevision: string, expectedRevision: string) {
    super(
      `Expense claim revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
    this.name = "ExpenseClaimItemRevisionConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export function assertExpectedClaimRevision(
  claim: ExpenseClaim,
  expectedRevision?: string,
): void {
  requireExpectedRevisionToken(expectedRevision, "expected_claim_revision");
  if (expectedRevision == null || expectedRevision === "") return;
  const current = claimRevision(claim);
  if (current !== expectedRevision) {
    throw new ExpenseClaimItemRevisionConflictError(current, expectedRevision);
  }
}

function bumpAndSaveExpenseClaims(file: ExpenseClaimsFile): void {
  file.claims_revision = (file.claims_revision ?? 0) + 1;
  saveExpenseClaims(file);
}

/** Bump per-claim + file tokens, then persist. */
function bumpClaimAndSaveExpenseClaims(
  file: ExpenseClaimsFile,
  index: number,
  claim: ExpenseClaim,
): ExpenseClaim {
  const next = expenseClaimSchema.parse({
    ...claim,
    claim_revision: (claim.claim_revision ?? 0) + 1,
  });
  file.claims[index] = next;
  bumpAndSaveExpenseClaims(file);
  return next;
}

function nextClaimId(date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const file = loadExpenseClaims();
  const prefix = `ECL-${day}-`;
  let max = 0;
  for (const claim of file.claims) {
    if (!claim.claim_id.startsWith(prefix)) continue;
    const n = Number(claim.claim_id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function claimAllocations(claim: ExpenseClaim): ExpenseClaimAllocation[] {
  return (
    claim.allocations ?? [
      {
        account_code: claim.account_code,
        amount_yen: claim.amount_yen,
        org_unit_id: claim.org_unit_id,
        person_id: claim.person_id,
      },
    ]
  ).map((allocation) => ({
    ...allocation,
    person_id: allocation.person_id ?? claim.person_id,
  }));
}

function matchingClaimAllocationYen(
  claim: ExpenseClaim,
  personId: string,
  orgUnitId: string,
  accountCode: string,
): number {
  return claimAllocations(claim)
    .filter(
      (allocation) =>
        allocation.person_id === personId &&
        allocation.org_unit_id === orgUnitId &&
        allocation.account_code === accountCode,
    )
    .reduce((sum, allocation) => sum + allocation.amount_yen, 0);
}

export type ExpenseClaimRemaining = {
  person_allocation_yen: number;
  person_committed_yen: number;
  /** Posted actuals in finance/monthly (basis: actual) for this person/account. */
  person_actual_yen: number;
  person_pending_claims_yen: number;
  person_remaining_yen: number;
  dept_allocation_yen: number;
  dept_person_allocated_yen: number;
  dept_remaining_yen: number;
  company_allocation_yen: number;
  company_dept_allocated_yen: number;
  company_remaining_yen: number;
};

function pendingClaimsYen(
  personId: string,
  orgUnitId: string,
  accountCode: string,
  excludeClaimId?: string,
): number {
  return loadExpenseClaims()
    .claims.filter(
      (c) =>
        c.claim_id !== excludeClaimId &&
        (c.status === "pending_approval" || c.status === "approved"),
    )
    .reduce(
      (sum, claim) =>
        sum +
        matchingClaimAllocationYen(claim, personId, orgUnitId, accountCode),
      0,
    );
}

/**
 * Fiscal-year actuals already posted to monthly for this person × account.
 * Prefer employee_id allocations; fall back to posted expense-claims when unlinked.
 */
function personPostedActualYen(
  personId: string,
  orgUnitId: string,
  accountCode: string,
  fiscalYear: string,
  excludeClaimId?: string,
): number {
  const person = findBudgetPerson(personId);
  const employeeId = person?.employee_id?.trim();
  const fyMatch = fiscalYear.match(/(\d{4})/);
  const fyStart = fyMatch ? Number(fyMatch[1]) : undefined;

  let fromMonthly = 0;
  if (employeeId) {
    for (const month of loadMonthlyFinances()) {
      if (month.basis !== "actual") continue;
      if (fyStart != null) {
        const [y, m] = month.month.split("-").map(Number);
        // FY ending January (MAL): FY2026 = 2026-02 .. 2027-01
        const inFy =
          (y === fyStart && (m ?? 0) >= 2) ||
          (y === fyStart + 1 && (m ?? 0) === 1);
        if (!inFy) continue;
      }
      for (const expense of month.expenses ?? []) {
        if (expense.chart_account_code !== accountCode) continue;
        for (const alloc of expense.allocations ?? []) {
          if (
            alloc.employee_id === employeeId &&
            alloc.org_unit_id === orgUnitId
          ) {
            fromMonthly += alloc.amount;
          }
        }
      }
    }
  }

  // Belt: posted claims not yet visible as employee allocations (or no employee_id).
  const fromClaims = loadExpenseClaims()
    .claims.filter(
      (c) =>
        (c.status === "posted" ||
          c.status === "pending_reimbursement" ||
          c.status === "reimbursed") &&
        c.claim_id !== excludeClaimId,
    )
    .reduce(
      (sum, claim) =>
        sum +
        matchingClaimAllocationYen(claim, personId, orgUnitId, accountCode),
      0,
    );

  // Avoid double-count when monthly already mirrors posted claims.
  return Math.max(fromMonthly, fromClaims);
}

/**
 * Envelope remaining for gate.
 * Subtracts posted actuals + pending/approved claims (not only nominal allocation).
 */
export function computeExpenseClaimRemaining(input: {
  personId: string;
  orgUnitId: string;
  accountCode: string;
  excludeClaimId?: string;
}): ExpenseClaimRemaining {
  const file = loadBudgetDelegation();
  if (!file) {
    throw new Error("Budget delegation registry is not initialized");
  }
  const department = file.departments.find(
    (d) => d.org_unit_id === input.orgUnitId,
  );
  const member = department?.member_budgets.find(
    (m) => m.person_id === input.personId,
  );
  const personCat = member?.category_budgets.find(
    (c) => c.account_code === input.accountCode,
  );
  const personAllocation = personCat?.allocation_yen ?? 0;
  // Member committed is total; attribute proportionally only when single category,
  // else treat committed as reducing general remaining (conservative: full committed
  // against this category when it is the only category, else 0 per-category).
  const personCommitted =
    member && member.category_budgets.length === 1 ? member.committed_yen : 0;
  const personActual = personPostedActualYen(
    input.personId,
    input.orgUnitId,
    input.accountCode,
    file.fiscal_year,
    input.excludeClaimId,
  );
  const pending = pendingClaimsYen(
    input.personId,
    input.orgUnitId,
    input.accountCode,
    input.excludeClaimId,
  );
  const personRemaining = Math.max(
    0,
    personAllocation - personCommitted - personActual - pending,
  );

  const deptCat = department?.category_budgets.find(
    (c) => c.account_code === input.accountCode,
  );
  const deptAllocation = deptCat?.allocation_yen ?? 0;
  const deptPersonAllocated =
    department?.member_budgets.reduce(
      (sum, m) =>
        sum +
        (m.category_budgets.find((c) => c.account_code === input.accountCode)
          ?.allocation_yen ?? 0),
      0,
    ) ?? 0;
  // Unallocated dept category pool that can cover manager-approved overages.
  const deptRemaining = Math.max(0, deptAllocation - deptPersonAllocated);

  const companyCat = file.company_category_budgets.find(
    (c) => c.account_code === input.accountCode,
  );
  const companyAllocation = companyCat?.allocation_yen ?? 0;
  const companyDeptAllocated = file.departments.reduce(
    (sum, d) =>
      sum +
      (d.category_budgets.find((c) => c.account_code === input.accountCode)
        ?.allocation_yen ?? 0),
    0,
  );
  const companyRemaining = Math.max(
    0,
    companyAllocation - companyDeptAllocated,
  );

  return {
    person_allocation_yen: personAllocation,
    person_committed_yen: personCommitted,
    person_actual_yen: personActual,
    person_pending_claims_yen: pending,
    person_remaining_yen: personRemaining,
    dept_allocation_yen: deptAllocation,
    dept_person_allocated_yen: deptPersonAllocated,
    dept_remaining_yen: deptRemaining,
    company_allocation_yen: companyAllocation,
    company_dept_allocated_yen: companyDeptAllocated,
    company_remaining_yen: companyRemaining,
  };
}

export type ExpenseClaimGateResult = {
  gate: ExpenseClaimGate;
  remaining: ExpenseClaimRemaining;
  message: string;
};

export type ExpenseClaimDeadline = {
  deadline_status: "on_time" | "late";
  days_after_transaction: number;
};

/** REG-005: submission is on time through the 30th calendar day. */
export function evaluateExpenseClaimDeadline(
  transactionDate: string | undefined,
  now = getClock().now(),
): ExpenseClaimDeadline {
  if (!transactionDate) {
    throw new Error(
      "blocked_deadline: transaction_date is required for the REG-005 30-day rule",
    );
  }
  const transaction = new Date(`${transactionDate}T00:00:00.000Z`);
  if (Number.isNaN(transaction.getTime())) {
    throw new Error("blocked_deadline: transaction_date is invalid");
  }
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const days = Math.floor(
    (today.getTime() - transaction.getTime()) / 86_400_000,
  );
  if (days < 0) {
    throw new Error(
      `blocked_deadline: transaction_date ${transactionDate} is in the future`,
    );
  }
  return {
    deadline_status: days <= 30 ? "on_time" : "late",
    days_after_transaction: days,
  };
}

/**
 * Default pay-back date shown to the claimant: the next Friday strictly after
 * `from`. Deterministic so the claimant never has to ask when money returns.
 */
export function defaultReimbursementDueOn(from = getClock().now()): string {
  const day = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const daysUntilFriday = ((5 - day.getUTCDay() + 7) % 7) || 7;
  day.setUTCDate(day.getUTCDate() + daysUntilFriday);
  return day.toISOString().slice(0, 10);
}

/**
 * Deterministic budget authority gate for personal expense claims (ADR 0032).
 */
export function evaluateExpenseClaimGate(input: {
  personId: string;
  orgUnitId: string;
  accountCode: string;
  amountYen: number;
  proposedBy?: string;
  deadline?: ExpenseClaimDeadline;
  excludeClaimId?: string;
}): ExpenseClaimGateResult {
  if (!Number.isInteger(input.amountYen) || input.amountYen <= 0) {
    throw new Error("amountYen must be a positive integer");
  }
  assertPersonDelegatableAccount(input.accountCode);
  const person = findBudgetPerson(input.personId);
  if (!person) {
    throw new Error(`Unknown person ${input.personId}`);
  }
  if (!budgetPersonBelongsToDepartment(person, input.orgUnitId)) {
    throw new Error(
      `Person ${input.personId} is not a member of ${input.orgUnitId}`,
    );
  }

  const remaining = computeExpenseClaimRemaining(input);

  // REG-004 / REG-005: over ¥100,000 uses ringi (tier B dual directors / tier C board),
  // not the department-head expense.claim.manager path. Envelope blocks still apply.
  if (input.amountYen > 100_000) {
    const shortfall = Math.max(
      0,
      input.amountYen - remaining.person_remaining_yen,
    );
    const deptCoverable =
      remaining.person_remaining_yen + remaining.dept_remaining_yen >=
      input.amountYen;
    if (!deptCoverable) {
      if (
        remaining.company_remaining_yen < shortfall &&
        remaining.company_allocation_yen > 0
      ) {
        return {
          gate: "blocked_company_envelope",
          remaining,
          message:
            "全社の当該費目枠が不足しています。先に全社費目枠の増額承認が必要です",
        };
      }
      return {
        gate: "blocked_dept_envelope",
        remaining,
        message:
          "部門の当該費目枠が不足しています。先に全社→部門の枠増額承認が必要です（ADR 0027）",
      };
    }
    if (input.amountYen > 1_000_000) {
      return {
        gate: "needs_board",
        remaining,
        message:
          `金額が100万円超のため承認済み取締役会証跡が必要です（REG-004 区分C · expense.claim.board）` +
          (input.deadline?.deadline_status === "late"
            ? ` · 提出期限超過（${input.deadline.days_after_transaction}日）`
            : ""),
      };
    }
    return {
      gate: "needs_ringi",
      remaining,
      message:
        "金額が10万円超のため代表取締役双方の稟議承認が必要です（REG-004 区分B · REG-005 第4条）" +
        (input.deadline?.deadline_status === "late"
          ? ` · 提出期限超過（${input.deadline.days_after_transaction}日、例外情報を稟議に併記）`
          : ""),
    };
  }

  if (input.deadline?.deadline_status === "late") {
    return {
      gate: "needs_late_exception",
      remaining,
      message: `REG-005 の30日提出期限を超過しています（取引日から${input.deadline.days_after_transaction}日）。代表者1名の例外承認が必要です`,
    };
  }

  const proposerIsRepresentative =
    Boolean(input.proposedBy) &&
    isAuthorizedExpenseRepresentative(input.proposedBy!);

  if (
    input.amountYen <= remaining.person_remaining_yen &&
    proposerIsRepresentative
  ) {
    return {
      gate: "allow_immediate",
      remaining,
      message: "個人費目枠内のため即時精算できます",
    };
  }

  // Shortfall that manager would cover from unallocated dept category pool
  // (or from already-allocated dept envelope capacity beyond person).
  const shortfall = input.amountYen - remaining.person_remaining_yen;
  // Dept can cover if department category allocation >= amount needed for this claim
  // when counting person remaining + unallocated dept pool, or if dept allocation
  // already includes person's allocation and shortfall fits in dept_remaining.
  const deptCoverable =
    remaining.person_remaining_yen + remaining.dept_remaining_yen >=
    input.amountYen;

  if (!deptCoverable) {
    // Can company raise dept envelope?
    if (
      remaining.company_remaining_yen < shortfall &&
      remaining.company_allocation_yen > 0
    ) {
      return {
        gate: "blocked_company_envelope",
        remaining,
        message:
          "全社の当該費目枠が不足しています。先に全社費目枠の増額承認が必要です",
      };
    }
    if (remaining.dept_allocation_yen === 0 || !deptCoverable) {
      return {
        gate: "blocked_dept_envelope",
        remaining,
        message:
          "部門の当該費目枠が不足しています。先に全社→部門の枠増額承認が必要です（ADR 0027）",
      };
    }
  }

  return {
    gate: proposerIsRepresentative ? "needs_manager" : "needs_rep_approval",
    remaining,
    message: proposerIsRepresentative
      ? "個人枠を超えるため上長承認が必要です"
      : input.amountYen > remaining.person_remaining_yen
        ? "通常の申請者による精算で個人枠も超えるため、REG-004 区分Aの代表者承認が必要です"
        : "通常の申請者による精算のため、REG-004 区分Aの代表者承認が必要です",
  };
}

const GATE_STRICTNESS: Record<ExpenseClaimGate, number> = {
  allow_immediate: 0,
  needs_manager: 1,
  needs_rep_approval: 2,
  needs_late_exception: 3,
  needs_ringi: 4,
  needs_board: 5,
  blocked_dept_envelope: 6,
  blocked_company_envelope: 7,
};

function evaluateAllocationGates(input: {
  allocations: ExpenseClaimAllocation[];
  defaultPersonId: string;
  proposedBy: string;
  deadline: ExpenseClaimDeadline;
}): ExpenseClaimGateResult {
  const results = input.allocations.map((allocation) =>
    evaluateExpenseClaimGate({
      personId: allocation.person_id ?? input.defaultPersonId,
      orgUnitId: allocation.org_unit_id,
      accountCode: allocation.account_code,
      amountYen: allocation.amount_yen,
      proposedBy: input.proposedBy,
      deadline: input.deadline,
    }),
  );
  let strictest = results.reduce((current, candidate) =>
    GATE_STRICTNESS[candidate.gate] > GATE_STRICTNESS[current.gate]
      ? candidate
      : current,
  );
  const total = input.allocations.reduce(
    (sum, allocation) => sum + allocation.amount_yen,
    0,
  );
  const totalGate: ExpenseClaimGate | undefined =
    total > 1_000_000
      ? "needs_board"
      : total > 100_000
        ? "needs_ringi"
        : undefined;
  if (
    totalGate &&
    GATE_STRICTNESS[totalGate] > GATE_STRICTNESS[strictest.gate]
  ) {
    strictest = {
      ...strictest,
      gate: totalGate,
      message:
        totalGate === "needs_board"
          ? "配賦後の申請総額が100万円超のため承認済み取締役会証跡が必要です（REG-004 区分C）"
          : "配賦後の申請総額が10万円超のため代表取締役双方の稟議承認が必要です（REG-004 区分B）",
    };
  }
  return {
    ...strictest,
    message:
      results.length === 1
        ? strictest.message
        : `配賦の最厳格ゲート: ${strictest.message}`,
  };
}

function assertAllocationAccountConsistency(
  receipt: SignedReceiptQrPayload,
  allocations: ExpenseClaimAllocation[],
): void {
  if (allocations.length === 1) {
    assertExpenseAccountConsistent(
      allocations[0]!.account_code,
      inferExpenseAccountFromReceipt(receipt),
    );
    return;
  }
  const hasDeterministicLineMapping =
    allocations.length === receipt.receipt.lines.length ||
    allocations.every((allocation) => allocation.line_index != null);
  if (!hasDeterministicLineMapping && inferExpenseAccountFromReceipt(receipt)) {
    throw new Error(
      "blocked_account_mismatch: strong receipt keywords require line_index for each split allocation",
    );
  }
  allocations.forEach((allocation, index) => {
    const lineIndex =
      allocation.line_index ??
      (allocations.length === receipt.receipt.lines.length ? index : undefined);
    if (lineIndex == null) return;
    const line = receipt.receipt.lines[lineIndex];
    if (!line) {
      throw new Error(
        `blocked_account_mismatch: allocation line_index ${lineIndex} does not exist`,
      );
    }
    const linePayload = {
      ...receipt,
      receipt: { ...receipt.receipt, lines: [line] },
    };
    assertExpenseAccountConsistent(
      allocation.account_code,
      inferExpenseAccountFromReceipt(linePayload),
    );
  });
}

/** Resolve whether an issuer org is Wire-ready (Trust Registry first; peer hint only in test). */
export function resolveIssuerWireReady(orgId: string): {
  wire_ready: boolean;
  peer_id?: string;
  corporate_number?: string;
  display_name?: string;
} {
  const resolved = resolveWireTrustNode(orgId);
  if (resolved && isWireReadyAdopter(resolved.node)) {
    return {
      wire_ready: true,
      corporate_number: resolved.node.corporate_number,
      display_name: resolved.node.display_name,
    };
  }
  const peer = loadPeersRegistry().peers.find(
    (p) =>
      p.peer_id === orgId ||
      p.org_uri === `steward://tenant/${orgId}` ||
      p.did === `did:ooo:org:${orgId}` ||
      p.display_name === orgId,
  );
  // Production: Trust Registry only. Peer delivery is a test/dev hint.
  const peerHintAllowed =
    process.env.ORGOS_PEER_WIRE_READY === "1" ||
    loadTenantConfig().lifecycle === "test";
  if (peer) {
    const ready =
      peerHintAllowed &&
      Boolean(
        peer.inbound_webhook_url ||
        peer.inbound_endpoints?.length ||
        peer.wire_email,
      );
    return {
      wire_ready: ready,
      peer_id: peer.peer_id,
      corporate_number: peer.corporate_number,
      display_name: peer.display_name,
    };
  }
  return { wire_ready: false };
}

/** Wire claim payload: receipt_id + digest only (no amount / lines). */
export function buildReceiptWireClaimPayload(input: {
  receiptId: string;
  receiptDigest: string;
  claimKey?: string;
  issuerOrgId: string;
  claimantOrgId: string;
}): {
  event_type: "steward.receipt.claim.requested";
  payload: {
    receipt_id: string;
    receipt_digest: string;
    claim_key?: string;
  };
  origin_org_id: string;
  destination_org_id: string;
} {
  const body: {
    receipt_id: string;
    receipt_digest: string;
    claim_key?: string;
  } = {
    receipt_id: input.receiptId,
    receipt_digest: input.receiptDigest,
  };
  if (input.claimKey) body.claim_key = input.claimKey;
  // Guard: never attach amount fields
  const json = JSON.stringify(body);
  if (/"amount"|"total_amount"|"amount_yen"|"lines"/.test(json)) {
    throw new Error("Wire receipt claim must not include amount or lines");
  }
  return {
    event_type: "steward.receipt.claim.requested",
    payload: body,
    origin_org_id: input.claimantOrgId,
    destination_org_id: input.issuerOrgId,
  };
}

/**
 * Best-effort Wire claim for wire_ready issuers.
 * Never throws into the expense-claim lane — failures are noted on the claim.
 */
export async function requestWireReceiptClaimBestEffort(
  claim: ExpenseClaim,
  receipt: SignedReceiptQrPayload,
  opts?: { fetchFn?: typeof fetch; claimantOrgId?: string },
): Promise<ExpenseClaim> {
  if (!claim.issuer.wire_ready) return claim;
  const claimantOrgId = opts?.claimantOrgId ?? getTenantId();
  const wire = buildReceiptWireClaimPayload({
    receiptId: receipt.receipt.receipt_id,
    receiptDigest: receipt.digest,
    claimKey: receipt.receipt.claim?.claim_key,
    issuerOrgId: receipt.receipt.issuer.org_id,
    claimantOrgId,
  });
  const eventId = randomUUID();
  let note = `wire:${wire.event_type}`;
  const expectedClaimRevision = claimRevision(claim);
  if (!receipt.receipt.claim?.endpoint) {
    note = `${note}:skipped_no_endpoint`;
    return persistClaimPatch(
      claim.claim_id,
      {
        wire_claim_event_id: eventId,
        notes: [claim.notes, note].filter(Boolean).join(" · "),
      },
      expectedClaimRevision,
    );
  }
  try {
    const remote = await claimReceiptRemotely(receipt, opts?.fetchFn);
    note =
      remote.status >= 200 && remote.status < 300
        ? `${note}:sent:${remote.status}`
        : `${note}:http_${remote.status}`;
    return persistClaimPatch(
      claim.claim_id,
      {
        wire_claim_event_id: remote.event_id,
        notes: [claim.notes, note].filter(Boolean).join(" · "),
      },
      expectedClaimRevision,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    note = `${note}:failed:${message.slice(0, 120)}`;
    return persistClaimPatch(
      claim.claim_id,
      {
        wire_claim_event_id: eventId,
        notes: [claim.notes, note].filter(Boolean).join(" · "),
      },
      expectedClaimRevision,
    );
  }
}

function persistClaimPatch(
  claimId: string,
  patch: Partial<ExpenseClaim>,
  expectedClaimRevision: string,
): ExpenseClaim {
  return withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    const index = file.claims.findIndex((c) => c.claim_id === claimId);
    if (index < 0) {
      return expenseClaimSchema.parse({
        ...patch,
        claim_id: claimId,
      } as ExpenseClaim);
    }
    const current = file.claims[index]!;
    assertExpectedClaimRevision(current, expectedClaimRevision);
    const next = expenseClaimSchema.parse({ ...current, ...patch });
    return bumpClaimAndSaveExpenseClaims(file, index, next);
  });
}

export async function ingestExpenseReceiptQr(input: {
  qrOrJson: string;
  personId: string;
  orgUnitId: string;
  accountCode: string;
  allocations?: ExpenseClaimAllocation[];
  proposedBy: string;
  autoPostImmediate?: boolean;
  fetchFn?: typeof fetch;
  expectedClaimsRevision?: string;
}): Promise<{
  claim: ExpenseClaim;
  gate: ExpenseClaimGateResult;
  receipt: SignedReceiptQrPayload;
}> {
  const { payload, snapshot_path } = await ingestReceiptQrPayload(
    input.qrOrJson,
    input.fetchFn,
  );
  return proposeExpenseClaimFromReceipt({
    receipt: payload,
    snapshotPath: snapshot_path,
    personId: input.personId,
    orgUnitId: input.orgUnitId,
    accountCode: input.accountCode,
    allocations: input.allocations,
    proposedBy: input.proposedBy,
    autoPostImmediate: input.autoPostImmediate,
    fetchFn: input.fetchFn,
    expectedClaimsRevision: input.expectedClaimsRevision,
  });
}

export async function proposeExpenseClaimFromReceipt(input: {
  receipt: SignedReceiptQrPayload;
  snapshotPath: string;
  personId: string;
  orgUnitId: string;
  accountCode: string;
  allocations?: ExpenseClaimAllocation[];
  proposedBy: string;
  autoPostImmediate?: boolean;
  fetchFn?: typeof fetch;
  expectedClaimsRevision?: string;
}): Promise<{
  claim: ExpenseClaim;
  gate: ExpenseClaimGateResult;
  receipt: SignedReceiptQrPayload;
}> {
  const amountYen = input.receipt.receipt.total_amount;
  if (amountYen <= 0) {
    throw new Error("Receipt total_amount must be positive");
  }
  const invoice = assertExpenseClaimInvoiceCompliance(input.receipt);
  const accountSuggestion = inferExpenseAccountFromReceipt(input.receipt);
  const allocations = (
    input.allocations ?? [
      {
        account_code: input.accountCode,
        amount_yen: amountYen,
        org_unit_id: input.orgUnitId,
        person_id: input.personId,
      },
    ]
  ).map((allocation) => ({
    ...allocation,
    person_id: allocation.person_id ?? input.personId,
  }));
  const allocationTotal = allocations.reduce(
    (sum, allocation) => sum + allocation.amount_yen,
    0,
  );
  if (allocationTotal !== amountYen) {
    throw new Error(
      `allocations sum ${allocationTotal} must equal receipt total ${amountYen}`,
    );
  }
  assertAllocationAccountConsistency(input.receipt, allocations);
  const deadline = evaluateExpenseClaimDeadline(
    input.receipt.receipt.transaction_date,
  );

  // Exclusive section: reload + CAS assert + append must be atomic vs other writers.
  const prepared = withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    assertExpectedClaimsRevision(file, input.expectedClaimsRevision);
    const dup = file.claims.find(
      (c) =>
        c.receipt_id === input.receipt.receipt.receipt_id &&
        c.status !== "rejected",
    );
    if (dup) {
      throw new Error(
        `Receipt ${input.receipt.receipt.receipt_id} already claimed (${dup.claim_id} · ${dup.person_id})`,
      );
    }

    const gate = evaluateAllocationGates({
      allocations,
      defaultPersonId: input.personId,
      proposedBy: input.proposedBy,
      deadline,
    });

    if (
      gate.gate === "blocked_dept_envelope" ||
      gate.gate === "blocked_company_envelope"
    ) {
      throw new Error(`${gate.gate}: ${gate.message}`);
    }

    const issuerMeta = resolveIssuerWireReady(
      input.receipt.receipt.issuer.org_id,
    );
    const now = getClock().nowIso();
    const claimId = nextClaimId(getClock().now());
    const archivedEvidence = archiveExpenseEvidence({
      claimId,
      payload: input.receipt,
    });
    let claim = expenseClaimSchema.parse({
      claim_id: claimId,
      status: gate.gate === "allow_immediate" ? "approved" : "pending_approval",
      gate: gate.gate,
      person_id: input.personId,
      org_unit_id: input.orgUnitId,
      account_code: input.accountCode,
      amount_yen: amountYen,
      allocations: input.allocations ? allocations : undefined,
      currency: "JPY",
      issuer: {
        org_id: input.receipt.receipt.issuer.org_id,
        display_name: input.receipt.receipt.issuer.name,
        peer_id: issuerMeta.peer_id,
        corporate_number: issuerMeta.corporate_number,
        invoice_registration_number: invoice.invoice_registration_number,
        wire_ready: issuerMeta.wire_ready,
      },
      receipt_id: input.receipt.receipt.receipt_id,
      receipt_digest: input.receipt.digest,
      receipt_snapshot_path: input.snapshotPath,
      recipient_name: invoice.recipient_name,
      transaction_date: input.receipt.receipt.transaction_date,
      deadline_status: deadline.deadline_status,
      days_after_transaction: deadline.days_after_transaction,
      account_suggestion: accountSuggestion,
      invoice_verification: invoice.invoice_verification,
      evidence_archive_ref: archivedEvidence.evidence_id,
      proposed_by: input.proposedBy,
      proposed_at: now,
      approved_by:
        gate.gate === "allow_immediate" ? input.proposedBy : undefined,
      approved_at: gate.gate === "allow_immediate" ? now : undefined,
    });

    if (
      gate.gate === "needs_manager" ||
      gate.gate === "needs_rep_approval" ||
      gate.gate === "needs_late_exception" ||
      gate.gate === "needs_ringi" ||
      gate.gate === "needs_board"
    ) {
      const subjectType = {
        needs_manager: EXPENSE_CLAIM_MANAGER_SUBJECT,
        needs_rep_approval: EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
        needs_late_exception: EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
        needs_ringi: EXPENSE_CLAIM_RINGI_SUBJECT,
        needs_board: EXPENSE_CLAIM_BOARD_SUBJECT,
      }[gate.gate];
      const approval = proposeOrgApproval({
        scope: "internal",
        subjectType,
        proposedBy: input.proposedBy,
        subjectRef: claim.claim_id,
        message: `${gate.message} · ${claim.claim_id} · ${claim.account_code} · ¥${claim.amount_yen}`,
        amount: { value: claim.amount_yen, currency: "JPY" },
        approvalPolicyRef: gate.gate === "needs_manager" ? undefined : "REG-004",
      });
      claim = expenseClaimSchema.parse({
        ...claim,
        approval_id: approval.approval_id,
      });
    }

    file.claims.push(claim);
    bumpAndSaveExpenseClaims(file);
    return { claim, gate };
  });

  let claim = prepared.claim;
  const gate = prepared.gate;

  appendInstructionAudit({
    actor_operator_id: input.proposedBy,
    action: "cli.mutation",
    ok: true,
    agent_id: "finance",
    detail: `expense-claim propose ${claim.claim_id} gate=${gate.gate}`,
  });

  claim = await requestWireReceiptClaimBestEffort(claim, input.receipt, {
    fetchFn: input.fetchFn,
  });

  if (gate.gate === "allow_immediate" && (input.autoPostImmediate ?? true)) {
    claim = postExpenseClaim({
      claimId: claim.claim_id,
      expectedClaimRevision: claimRevision(claim),
    });
    appendInstructionAudit({
      actor_operator_id: input.proposedBy,
      action: "cli.mutation",
      ok: true,
      agent_id: "finance",
      detail: `expense-claim immediate-post ${claim.claim_id}`,
    });
  }

  return { claim, gate, receipt: input.receipt };
}

export function approveExpenseClaim(input: {
  claimId: string;
  approverId: string;
  coApproverId?: string;
  boardEventId?: string;
  operatorId?: string;
  autoPost?: boolean;
  /** Pay-back date entered by the approver; defaults to the next Friday. */
  dueOn?: string;
  expectedClaimRevision?: string;
}): ExpenseClaim {
  return withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    const index = file.claims.findIndex((c) => c.claim_id === input.claimId);
    if (index < 0) throw new Error(`Claim not found: ${input.claimId}`);
    let claim = file.claims[index]!;
    assertExpectedClaimRevision(claim, input.expectedClaimRevision);
    if (claim.status !== "pending_approval") {
      throw new Error(`Claim ${claim.claim_id} is ${claim.status}`);
    }
    if (claim.gate === "needs_ringi" && !input.coApproverId?.trim()) {
      throw new Error(
        `Claim ${claim.claim_id} requires co-approver (REG-004 · expense.claim.ringi)`,
      );
    }
    if (claim.gate === "needs_board") {
      if (!input.boardEventId?.trim()) {
        throw new Error(
          `Claim ${claim.claim_id} requires board_event_id (REG-004 tier C)`,
        );
      }
      assertBoardEventForBeyondPolicy(input.boardEventId.trim());
    }
    const repaired = repairMissingApprovalForExpenseClaim(claim);
    claim = repaired.claim;
    file.claims[index] = claim;
    if (claim.approval_id) {
      humanApproveOrgApproval({
        approvalId: claim.approval_id,
        approverId: input.approverId,
        coApproverId: input.coApproverId,
        operatorId: input.operatorId,
        source: "chat_ui",
      });
    }
    claim = expenseClaimSchema.parse({
      ...claim,
      status: "approved",
      approved_by: input.approverId,
      approved_at: getClock().nowIso(),
      co_approved_by: input.coApproverId?.trim() || undefined,
      board_event_id: input.boardEventId?.trim() || undefined,
    });
    claim = bumpClaimAndSaveExpenseClaims(file, index, claim);
    if (input.autoPost ?? true) {
      return postExpenseClaim({
        claimId: claim.claim_id,
        dueOn: input.dueOn,
        expectedClaimRevision: claimRevision(claim),
      });
    }
    return claim;
  });
}

export function rejectExpenseClaim(input: {
  claimId: string;
  rejectorId: string;
  reason?: string;
  expectedClaimRevision?: string;
}): ExpenseClaim {
  return withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    const index = file.claims.findIndex((c) => c.claim_id === input.claimId);
    if (index < 0) throw new Error(`Claim not found: ${input.claimId}`);
    let claim = file.claims[index]!;
    assertExpectedClaimRevision(claim, input.expectedClaimRevision);
    if (claim.status !== "pending_approval" && claim.status !== "draft") {
      throw new Error(
        `Claim ${claim.claim_id} cannot be rejected (${claim.status})`,
      );
    }
    if (claim.status === "pending_approval") {
      const repaired = repairMissingApprovalForExpenseClaim(claim);
      claim = repaired.claim;
      file.claims[index] = claim;
    }
    if (claim.approval_id) {
      rejectOrgApproval({
        approvalId: claim.approval_id,
        approverId: input.rejectorId,
        reason: input.reason,
      });
    }
    claim = expenseClaimSchema.parse({
      ...claim,
      status: "rejected",
      rejected_by: input.rejectorId,
      rejected_at: new Date().toISOString(),
      reject_reason: input.reason,
    });
    return bumpClaimAndSaveExpenseClaims(file, index, claim);
  });
}

function categoryForAccount(accountCode: string): ExpenseCategory {
  const chart = loadChartOfAccounts();
  const inverse = Object.entries(chart.category_mapping.expense).find(
    ([, code]) => code === accountCode,
  );
  const cat = inverse?.[0];
  const parsed = expenseCategory.safeParse(cat);
  return parsed.success ? parsed.data : "other";
}

function defaultBusinessUnitId(orgUnitId: string): string {
  if (orgUnitId.includes("BUSINESS") || orgUnitId.includes("BIZ")) {
    return "BU-CORPORATE";
  }
  return "BU-CORPORATE";
}

/**
 * Post an approved claim into finance/monthly as basis: actual allocation.
 * Idempotent on receipt_id + person_id.
 */
export function postExpenseClaim(input: {
  claimId: string;
  /** Pay-back date; defaults to the next Friday. */
  dueOn?: string;
  expectedClaimRevision?: string;
}): ExpenseClaim {
  return withExpenseClaimsLock(() => {
  const file = loadExpenseClaims();
  const index = file.claims.findIndex((c) => c.claim_id === input.claimId);
  if (index < 0) throw new Error(`Claim not found: ${input.claimId}`);
  let claim = file.claims[index]!;
  assertExpectedClaimRevision(claim, input.expectedClaimRevision);

  const alreadyPosted = file.claims.find(
    (c) =>
      c.claim_id !== claim.claim_id &&
      c.receipt_id === claim.receipt_id &&
      (c.status === "posted" ||
        c.status === "pending_reimbursement" ||
        c.status === "reimbursed"),
  );
  if (alreadyPosted) {
    throw new Error(
      `Duplicate post refused: ${claim.receipt_id} already posted as ${alreadyPosted.claim_id}`,
    );
  }
  if (
    claim.status === "posted" ||
    claim.status === "pending_reimbursement" ||
    claim.status === "reimbursed"
  ) {
    return claim;
  }
  if (claim.status !== "approved") {
    throw new Error(`Claim ${claim.claim_id} must be approved before post`);
  }
  evaluateExpenseClaimDeadline(claim.transaction_date);

  const allocations = claimAllocations(claim);
  const postingAllocations = allocations.map((allocation) => {
    const personId = allocation.person_id ?? claim.person_id;
    const person = findBudgetPerson(personId);
    if (!person?.employee_id) {
      throw new Error(
        `Person ${personId} has no employee_id; cannot post allocation`,
      );
    }
    return { allocation, personId, employeeId: person.employee_id };
  });
  const claimant = findBudgetPerson(claim.person_id);
  if (!claimant?.employee_id) {
    throw new Error(
      `Person ${claim.person_id} has no employee_id; cannot create payable`,
    );
  }

  const month =
    claim.transaction_date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const monthPath = join(getDataDir(), "finance", "monthly", `${month}.yaml`);
  mkdirSync(join(getDataDir(), "finance", "monthly"), { recursive: true });
  const existing = loadMonthlyFinance(month);
  const monthFile = monthlyFinanceSchema.parse(
    existing ?? { month, basis: "actual", revenue: [], expenses: [] },
  );
  if (monthFile.basis !== "actual") {
    throw new Error(
      `Month ${month} basis is ${monthFile.basis}; expense claims post only to actual`,
    );
  }

  const clockMonth = getClock().now().toISOString().slice(0, 7);
  if (month > clockMonth) {
    throw new Error(
      `Month ${month} is in the future (clock ${clockMonth}); expense claims post only to the current or past actual month`,
    );
  }
  const closedHint = `${monthFile.notes ?? ""}`.toLowerCase();
  if (
    /\bclosed\b/.test(closedHint) ||
    closedHint.includes("締め済") ||
    closedHint.includes("締め済み")
  ) {
    throw new Error(
      `Month ${month} is closed; reopen or post to the current open actual month`,
    );
  }

  const noteTag = `expense-claim:${claim.claim_id}`;
  const existingMonthlyRows = monthFile.expenses.filter((expense) =>
    expense.notes?.includes(noteTag),
  );
  if (existingMonthlyRows.length > 0) {
    if (existingMonthlyRows.length !== allocations.length) {
      throw new Error(
        `Claim ${claim.claim_id} has partial monthly split rows (${existingMonthlyRows.length}/${allocations.length})`,
      );
    }
    // Idempotent: already in monthly
    const postedAt = claim.posted_at ?? getClock().nowIso();
    const journal = postExpenseClaimJournal({
      claimId: claim.claim_id,
      occurredAt: postedAt,
      allocations,
      receiptId: claim.receipt_id,
      receiptDigest: claim.receipt_digest,
      evidenceArchiveRef: claim.evidence_archive_ref,
    });
    claim = expenseClaimSchema.parse({
      ...claim,
      status: "pending_reimbursement",
      posted_at: postedAt,
      monthly_ref: { month, note: noteTag },
      reimbursement: claim.reimbursement
        ? {
            ...claim.reimbursement,
            due_on:
              claim.reimbursement.due_on ??
              input.dueOn ??
              defaultReimbursementDueOn(),
          }
        : {
            status: "pending",
            amount_yen: claim.amount_yen,
            requested_at: getClock().nowIso(),
            due_on: input.dueOn ?? defaultReimbursementDueOn(),
          },
      journal_refs: {
        ...claim.journal_refs,
        posting_entry_id: journal.entry_id,
      },
    });
    syncEmployeeReimbursementPayable({
      claimId: claim.claim_id,
      personId: claim.person_id,
      employeeId: claimant.employee_id,
      amountYen: claim.amount_yen,
      postedMonth: month,
      postedAt: claim.posted_at!,
      postingJournalEntryId: journal.entry_id,
    });
    return bumpClaimAndSaveExpenseClaims(file, index, claim);
  }

  for (const { allocation, employeeId } of postingAllocations) {
    monthFile.expenses.push({
      category: categoryForAccount(allocation.account_code),
      chart_account_code: allocation.account_code,
      amount: allocation.amount_yen,
      allocations: [
        {
          business_unit_id: defaultBusinessUnitId(allocation.org_unit_id),
          org_unit_id: allocation.org_unit_id,
          employee_id: employeeId,
          amount: allocation.amount_yen,
          notes: noteTag,
        },
      ],
      notes: `${noteTag} · receipt ${claim.receipt_id}`,
    });
  }
  withYamlFileLock(monthPath, () => {
    writeYamlFileAtomic(monthPath, monthlyFinanceSchema.parse(monthFile));
  });

  const requestedAt = getClock().nowIso();
  const journal = postExpenseClaimJournal({
    claimId: claim.claim_id,
    occurredAt: requestedAt,
    allocations,
    receiptId: claim.receipt_id,
    receiptDigest: claim.receipt_digest,
    evidenceArchiveRef: claim.evidence_archive_ref,
  });
  claim = expenseClaimSchema.parse({
    ...claim,
    status: "pending_reimbursement",
    posted_at: requestedAt,
    monthly_ref: { month, note: noteTag },
    reimbursement: {
      status: "pending",
      amount_yen: claim.amount_yen,
      requested_at: requestedAt,
      due_on: input.dueOn ?? defaultReimbursementDueOn(),
    },
    journal_refs: { posting_entry_id: journal.entry_id },
  });
  const posted = bumpClaimAndSaveExpenseClaims(file, index, claim);
  syncEmployeeReimbursementPayable({
    claimId: posted.claim_id,
    personId: posted.person_id,
    employeeId: claimant.employee_id,
    amountYen: posted.amount_yen,
    postedMonth: month,
    postedAt: requestedAt,
    postingJournalEntryId: journal.entry_id,
  });
  return posted;
  });
}

export function prepareExpenseClaimReimbursementTransfer(input: {
  claimId: string;
  sourceBankAccountId: string;
  stakeholderId: string;
  payee: string;
  preparedBy: string;
  expectedClaimRevision?: string;
}): ExpenseClaim {
  return withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    const index = file.claims.findIndex(
      (claim) => claim.claim_id === input.claimId,
    );
    if (index < 0) throw new Error(`Claim not found: ${input.claimId}`);
    const claim = file.claims[index]!;
    assertExpectedClaimRevision(claim, input.expectedClaimRevision);
    if (claim.status !== "pending_reimbursement") {
      throw new Error(
        `Claim ${claim.claim_id} must be pending_reimbursement before transfer preparation`,
      );
    }
    const payable = prepareEmployeeReimbursementTransfer(input);
    const next = expenseClaimSchema.parse({
      ...claim,
      reimbursement: {
        ...claim.reimbursement,
        status: "pending",
        amount_yen: claim.amount_yen,
        broker_evidence_ref: payable.broker_evidence!.evidence_ref,
      },
    });
    return bumpClaimAndSaveExpenseClaims(file, index, next);
  });
}

export function markExpenseClaimReimbursed(input: {
  claimId: string;
  paidBy: string;
  paymentRef: string;
  bankStatementRef?: string;
  settlementEvidenceRef?: string;
  notes?: string;
  expectedClaimRevision?: string;
}): ExpenseClaim {
  return withExpenseClaimsLock(() => {
  const file = loadExpenseClaims();
  const index = file.claims.findIndex((c) => c.claim_id === input.claimId);
  if (index < 0) throw new Error(`Claim not found: ${input.claimId}`);
  let claim = file.claims[index]!;
  assertExpectedClaimRevision(claim, input.expectedClaimRevision);
  if (claim.status !== "pending_reimbursement" && claim.status !== "posted") {
    throw new Error(
      `Claim ${claim.claim_id} must be pending_reimbursement before mark reimbursed (got ${claim.status})`,
    );
  }
  if (!input.paymentRef.trim()) {
    throw new Error("paymentRef is required");
  }
  if (!input.bankStatementRef?.trim() && !input.settlementEvidenceRef?.trim()) {
    throw new Error(
      "bankStatementRef or settlementEvidenceRef is required as external settlement evidence",
    );
  }
  const verification = verifyEmployeeReimbursementBrokerEvidence(
    claim.claim_id,
  );
  if (!verification.ok) {
    throw new Error(
      `Broker evidence verification failed: ${verification.error}`,
    );
  }
  const currentPayable = loadEmployeeReimbursementPayables().payables.find(
    (row) => row.claim_id === claim.claim_id,
  );
  const brokerEvidence = currentPayable?.broker_evidence;
  if (!brokerEvidence) {
    throw new Error(`Broker evidence missing for ${claim.claim_id}`);
  }
  if (input.bankStatementRef?.trim()) {
    assertExpenseClaimBankStatementRef({
      claimId: claim.claim_id,
      bankStatementRef: input.bankStatementRef.trim(),
      amountYen: claim.amount_yen,
      sourceBankAccountId: brokerEvidence.source_bank_account_id,
    });
  }
  const paidAt = getClock().nowIso();
  const reimbursementJournal = reimburseExpenseClaimJournal({
    claimId: claim.claim_id,
    occurredAt: paidAt,
    amountYen: claim.amount_yen,
    sourceBankAccountId: brokerEvidence.source_bank_account_id,
    evidenceRefs: [
      brokerEvidence.evidence_ref,
      input.paymentRef.trim(),
      input.bankStatementRef?.trim() ?? input.settlementEvidenceRef!.trim(),
    ],
  });
  const payable = closeEmployeeReimbursementPayable({
    claimId: claim.claim_id,
    paymentRef: input.paymentRef.trim(),
    paidAt,
    bankStatementRef: input.bankStatementRef,
    settlementEvidenceRef: input.settlementEvidenceRef,
    reimbursementJournalEntryId: reimbursementJournal.entry_id,
  });
  claim = expenseClaimSchema.parse({
    ...claim,
    status: "reimbursed",
    reimbursement: {
      status: "paid",
      amount_yen: claim.reimbursement?.amount_yen ?? claim.amount_yen,
      requested_at: claim.reimbursement?.requested_at ?? claim.posted_at,
      due_on: claim.reimbursement?.due_on,
      paid_at: paidAt,
      paid_by: input.paidBy,
      payment_ref: input.paymentRef.trim(),
      broker_evidence_ref: payable.broker_evidence!.evidence_ref,
      bank_statement_ref: input.bankStatementRef?.trim() || undefined,
      settlement_evidence_ref: input.settlementEvidenceRef?.trim() || undefined,
      notes: input.notes,
    },
    journal_refs: {
      ...claim.journal_refs,
      reimbursement_entry_id: reimbursementJournal.entry_id,
    },
  });
  claim = bumpClaimAndSaveExpenseClaims(file, index, claim);
  if (input.bankStatementRef?.trim()) {
    // After claim SSOT is saved — avoid matched snapshot if later steps failed.
    markExpenseClaimBankStatementMatched({
      claimId: claim.claim_id,
      bankStatementRef: input.bankStatementRef.trim(),
      amountYen: claim.amount_yen,
      sourceBankAccountId: brokerEvidence.source_bank_account_id,
    });
  }
  appendInstructionAudit({
    actor_operator_id: input.paidBy,
    action: "cli.mutation",
    ok: true,
    agent_id: "finance",
    detail: `expense-claim reimbursed ${claim.claim_id} ref=${input.paymentRef.trim()}`,
  });
  return claim;
  });
}

export function listExpenseClaims(filter?: {
  personId?: string;
  status?: ExpenseClaim["status"];
  orgUnitId?: string;
}): ExpenseClaim[] {
  return loadExpenseClaims().claims.filter((c) => {
    if (filter?.personId && c.person_id !== filter.personId) return false;
    if (filter?.status && c.status !== filter.status) return false;
    if (filter?.orgUnitId && c.org_unit_id !== filter.orgUnitId) return false;
    return true;
  });
}

export function findExpenseClaim(claimId: string): ExpenseClaim | undefined {
  return loadExpenseClaims().claims.find((c) => c.claim_id === claimId);
}

export type ExpenseClaimIntegrityIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

/**
 * Migrate legacy `posted` claims (pre-journal lane) to pending_reimbursement
 * with posting journal + payable. Idempotent for claims that already have journals.
 */
export function migrateLegacyPostedExpenseClaims(): {
  migrated: string[];
  skipped: string[];
} {
  const migrated: string[] = [];
  const skipped: string[] = [];
  return withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    for (let index = 0; index < file.claims.length; index++) {
      const claim = file.claims[index]!;
      if (claim.status !== "posted") continue;
      if (claim.journal_refs?.posting_entry_id) {
        skipped.push(claim.claim_id);
        continue;
      }
      const allocations = claimAllocations(claim);
      const postedAt = claim.posted_at ?? claim.approved_at ?? claim.proposed_at;
      const month = claim.monthly_ref?.month;
      if (!month) {
        throw new Error(
          `Cannot migrate ${claim.claim_id}: monthly_ref.month missing`,
        );
      }
      const person = findBudgetPerson(claim.person_id);
      if (!person?.employee_id) {
        throw new Error(
          `Cannot migrate ${claim.claim_id}: person ${claim.person_id} has no employee_id`,
        );
      }
      const journal = postExpenseClaimJournal({
        claimId: claim.claim_id,
        occurredAt: postedAt,
        allocations,
        receiptId: claim.receipt_id,
        receiptDigest: claim.receipt_digest,
        evidenceArchiveRef: claim.evidence_archive_ref,
      });
      syncEmployeeReimbursementPayable({
        claimId: claim.claim_id,
        personId: claim.person_id,
        employeeId: person.employee_id,
        amountYen: claim.amount_yen,
        postedMonth: month,
        postedAt,
        postingJournalEntryId: journal.entry_id,
      });
      const next = expenseClaimSchema.parse({
        ...claim,
        status: "pending_reimbursement",
        reimbursement: claim.reimbursement ?? {
          status: "pending",
          amount_yen: claim.amount_yen,
          requested_at: postedAt,
        },
        journal_refs: {
          ...claim.journal_refs,
          posting_entry_id: journal.entry_id,
        },
        claim_revision: (claim.claim_revision ?? 0) + 1,
      });
      file.claims[index] = next;
      migrated.push(claim.claim_id);
    }
    if (migrated.length > 0) {
      bumpAndSaveExpenseClaims(file);
    }
    return { migrated, skipped };
  });
}

/** Cross-checks for `data/finance/expense-claims.yaml` (ADR 0032). */
export function validateExpenseClaimsIntegrity(): ExpenseClaimIntegrityIssue[] {
  const filePath = "data/finance/expense-claims.yaml";
  const absolute = expenseClaimsPath();
  if (!existsSync(absolute)) return [];
  const issues: ExpenseClaimIntegrityIssue[] = [];
  let file: ExpenseClaimsFile;
  try {
    file = loadExpenseClaims();
  } catch (error) {
    issues.push({
      level: "error",
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return issues;
  }
  for (const warning of invoiceCatalogFreshnessWarnings()) {
    issues.push({
      level: "warning",
      file: "data/finance/invoice-registration-catalog.yaml",
      message: warning,
    });
  }
  for (const issue of journalIntegrityIssues()) {
    issues.push({
      level: "error",
      file: "data/finance/journal-entries.yaml",
      message: issue,
    });
  }
  let journals = [] as ReturnType<typeof loadJournalEntries>["entries"];
  let payables = [] as ReturnType<
    typeof loadEmployeeReimbursementPayables
  >["payables"];
  let evidence = [] as ReturnType<
    typeof loadExpenseEvidenceManifest
  >["evidence"];
  try {
    journals = loadJournalEntries().entries;
    payables = loadEmployeeReimbursementPayables().payables;
    evidence = loadExpenseEvidenceManifest().evidence;
  } catch (error) {
    issues.push({
      level: "error",
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  for (const result of verifyExpenseEvidence()) {
    if (!result.ok) {
      issues.push({
        level: "error",
        file: "data/finance/expense-evidence-manifest.yaml",
        message: `${result.evidence_id}: ${result.error}`,
      });
    }
  }

  const seen = new Map<string, string>();
  for (const claim of file.claims) {
    const dupKey = claim.receipt_id;
    if (claim.status !== "rejected") {
      const prior = seen.get(dupKey);
      if (prior) {
        issues.push({
          level: "error",
          file: filePath,
          message: `${claim.claim_id}: duplicate receipt_id with ${prior}`,
        });
      } else {
        seen.set(dupKey, claim.claim_id);
      }
    }

    for (const allocation of claimAllocations(claim)) {
      try {
        assertPersonDelegatableAccount(allocation.account_code);
      } catch (error) {
        issues.push({
          level: "error",
          file: filePath,
          message: `${claim.claim_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    const archived = evidence.find((row) => row.claim_id === claim.claim_id);
    if (claim.evidence_archive_ref && !archived) {
      issues.push({
        level: "error",
        file: "data/finance/expense-evidence-manifest.yaml",
        message: `${claim.claim_id}: expense evidence archive missing`,
      });
    } else if (
      archived &&
      claim.evidence_archive_ref &&
      archived.evidence_id !== claim.evidence_archive_ref
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: evidence archive reference mismatch`,
      });
    }

    if (
      claim.receipt_snapshot_path &&
      !existsSync(join(getDataDir(), claim.receipt_snapshot_path))
    ) {
      issues.push({
        level: "warning",
        file: filePath,
        message: claim.evidence_archive_ref
          ? `${claim.claim_id}: receipt_snapshot_path missing (evidence archive present)`
          : `${claim.claim_id}: receipt_snapshot_path missing (${claim.receipt_snapshot_path})`,
      });
    }

    if (
      (claim.status === "pending_reimbursement" ||
        claim.status === "reimbursed") &&
      !claim.journal_refs?.posting_entry_id
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: ${claim.status} requires journal_refs.posting_entry_id`,
      });
    } else if (
      claim.status === "posted" &&
      !claim.journal_refs?.posting_entry_id
    ) {
      issues.push({
        level: "warning",
        file: filePath,
        message: `${claim.claim_id}: posted without journal_refs (legacy; migrate to pending_reimbursement + journal)`,
      });
    }

    if (
      claim.status === "reimbursed" &&
      !claim.journal_refs?.reimbursement_entry_id
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: reimbursed requires journal_refs.reimbursement_entry_id`,
      });
    }

    if (
      (claim.status === "posted" ||
        claim.status === "pending_reimbursement" ||
        claim.status === "reimbursed") &&
      claim.monthly_ref?.month
    ) {
      const monthly = loadMonthlyFinance(claim.monthly_ref.month);
      const noteTag = `expense-claim:${claim.claim_id}`;
      const rows =
        monthly?.expenses.filter((expense) =>
          expense.notes?.includes(noteTag),
        ) ?? [];
      const allocations = claimAllocations(claim);
      if (rows.length !== allocations.length) {
        issues.push({
          level: "error",
          file: `data/finance/monthly/${claim.monthly_ref.month}.yaml`,
          message: `${claim.claim_id}: monthly rows ${rows.length} != allocations ${allocations.length}`,
        });
      } else {
        const monthlyTotal = rows.reduce((sum, row) => sum + row.amount, 0);
        if (monthlyTotal !== claim.amount_yen) {
          issues.push({
            level: "error",
            file: `data/finance/monthly/${claim.monthly_ref.month}.yaml`,
            message: `${claim.claim_id}: monthly total ${monthlyTotal} != claim ${claim.amount_yen}`,
          });
        }
        for (const allocation of allocations) {
          const matched = rows.some(
            (row) =>
              row.chart_account_code === allocation.account_code &&
              row.amount === allocation.amount_yen,
          );
          if (!matched) {
            issues.push({
              level: "error",
              file: `data/finance/monthly/${claim.monthly_ref.month}.yaml`,
              message: `${claim.claim_id}: missing monthly row for ${allocation.account_code}/${allocation.amount_yen}`,
            });
          }
        }
      }
    }

    if (claim.journal_refs?.posting_entry_id) {
      const payable = payables.find((row) => row.claim_id === claim.claim_id);
      const postingId = claim.journal_refs?.posting_entry_id;
      const posting = journals.find((row) => row.entry_id === postingId);
      if (!payable) {
        issues.push({
          level: "error",
          file: "data/finance/employee-reimbursement-payables.yaml",
          message: `${claim.claim_id}: reimbursement payable missing`,
        });
      } else if (
        payable.amount_yen !== claim.amount_yen ||
        payable.person_id !== claim.person_id
      ) {
        issues.push({
          level: "error",
          file: "data/finance/employee-reimbursement-payables.yaml",
          message: `${claim.claim_id}: payable amount/person does not match claim`,
        });
      }
      if (!posting || posting.event !== "expense_claim_posted") {
        issues.push({
          level: "error",
          file: "data/finance/journal-entries.yaml",
          message: `${claim.claim_id}: posting journal link missing`,
        });
      } else {
        if (!payable?.journal_entry_ids.includes(posting.entry_id)) {
          issues.push({
            level: "error",
            file: "data/finance/employee-reimbursement-payables.yaml",
            message: `${claim.claim_id}: payable does not link posting journal`,
          });
        }
        const postedDebit = posting.lines.reduce(
          (sum, line) => sum + line.debit_yen,
          0,
        );
        if (postedDebit !== claim.amount_yen) {
          issues.push({
            level: "error",
            file: "data/finance/journal-entries.yaml",
            message: `${claim.claim_id}: posting journal amount does not match claim`,
          });
        }
      }
      if (claim.journal_refs.reimbursement_entry_id) {
        const reimbursementId = claim.journal_refs?.reimbursement_entry_id;
        const reimbursement = journals.find(
          (row) => row.entry_id === reimbursementId,
        );
        if (
          !reimbursement ||
          reimbursement.event !== "expense_claim_reimbursed" ||
          !payable?.journal_entry_ids.includes(reimbursement.entry_id)
        ) {
          issues.push({
            level: "error",
            file: "data/finance/journal-entries.yaml",
            message: `${claim.claim_id}: reimbursement journal link missing`,
          });
        } else if (
          reimbursement.lines.reduce((sum, line) => sum + line.debit_yen, 0) !==
          claim.amount_yen
        ) {
          issues.push({
            level: "error",
            file: "data/finance/journal-entries.yaml",
            message: `${claim.claim_id}: reimbursement journal amount does not match claim`,
          });
        }
      }
    }

    if (claim.status === "pending_approval" && !claim.approval_id) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: pending_approval without approval_id`,
      });
    }
    if (
      claim.status === "pending_approval" &&
      claim.approval_id &&
      !findOrgApproval(claim.approval_id)
    ) {
      issues.push({
        level: "warning",
        file: filePath,
        message: `${claim.claim_id}: approval_id ${claim.approval_id} missing from pending-approvals (orphan; auto-repair on approve)`,
      });
    }

    if (!claim.transaction_date) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: transaction_date is required`,
      });
    }

    if (
      (claim.status === "posted" ||
        claim.status === "pending_reimbursement" ||
        claim.status === "reimbursed") &&
      !claim.monthly_ref?.month
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: ${claim.status} without monthly_ref`,
      });
    }

    if (
      claim.status === "pending_reimbursement" &&
      claim.reimbursement?.status !== "pending"
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: pending_reimbursement requires reimbursement.status=pending`,
      });
    }

    if (
      claim.status === "reimbursed" &&
      claim.reimbursement?.status !== "paid"
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${claim.claim_id}: reimbursed requires reimbursement.status=paid`,
      });
    }

    if (claim.issuer.wire_ready === false && claim.wire_claim_event_id) {
      issues.push({
        level: "warning",
        file: filePath,
        message: `${claim.claim_id}: wire_claim_event_id set but issuer not wire_ready`,
      });
    }
  }
  return issues;
}
