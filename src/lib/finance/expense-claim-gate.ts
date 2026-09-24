/**
 * Expense-claim budget envelope, deadline, and gate evaluation.
 */
import type {
  ExpenseClaimAllocation,
  ExpenseClaimGate,
} from "../../../schemas/finance/expense-claim.js";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import {
  assertPersonDelegatableAccount,
  loadBudgetDelegation,
} from "../org/budget-delegation.js";
import {
  budgetPersonBelongsToDepartment,
  findBudgetPerson,
} from "../hr/person-directory.js";
import { loadMonthlyFinances } from "../data.js";
import { getClock } from "../runtime-context.js";
import {
  assertExpenseAccountConsistent,
  inferExpenseAccountFromReceipt,
} from "./expense-claim-category.js";
import { isAuthorizedExpenseRepresentative } from "./expense-claim-approver.js";
import {
  loadExpenseClaims,
  matchingClaimAllocationYen,
} from "./expense-claim-store.js";

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

/** Strictest gate across allocations (exported for propose module). */
export function evaluateAllocationGates(input: {
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

/** Account vs receipt keyword check for propose (exported for propose module). */
export function assertAllocationAccountConsistency(
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
