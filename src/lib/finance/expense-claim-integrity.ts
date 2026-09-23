/**
 * Expense-claim migrate + cross-file integrity checks (ADR 0032).
 * Keeps the claim lifecycle module focused on propose / approve / post / reimburse.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  expenseClaimSchema,
  type ExpenseClaim,
} from "../../../schemas/finance/expense-claim.js";
import { invoiceCatalogFreshnessWarnings } from "./expense-claim-invoice.js";
import {
  loadEmployeeReimbursementPayables,
  syncEmployeeReimbursementPayable,
} from "./employee-reimbursement-payable.js";
import {
  loadJournalEntries,
  journalIntegrityIssues,
  postExpenseClaimJournal,
} from "./expense-claim-journal.js";
import {
  loadExpenseEvidenceManifest,
  verifyExpenseEvidence,
} from "./expense-evidence.js";
import { findOrgApproval } from "../org/approval/index.js";
import { assertPersonDelegatableAccount } from "../org/budget-delegation.js";
import { findBudgetPerson } from "../hr/person-directory.js";
import { loadMonthlyFinance } from "../data.js";
import { getDataDir } from "../utils.js";
import {
  bumpAndSaveExpenseClaims,
  claimAllocations,
  expenseClaimsPath,
  loadExpenseClaims,
  withExpenseClaimsLock,
} from "./expense-claim.js";

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
  let file: ReturnType<typeof loadExpenseClaims>;
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
    pushClaimIntegrityIssues(issues, claim, {
      filePath,
      journals,
      payables,
      evidence,
      seen,
    });
  }
  return issues;
}

function pushClaimIntegrityIssues(
  issues: ExpenseClaimIntegrityIssue[],
  claim: ExpenseClaim,
  ctx: {
    filePath: string;
    journals: ReturnType<typeof loadJournalEntries>["entries"];
    payables: ReturnType<typeof loadEmployeeReimbursementPayables>["payables"];
    evidence: ReturnType<typeof loadExpenseEvidenceManifest>["evidence"];
    seen: Map<string, string>;
  },
): void {
  const { filePath, journals, payables, evidence, seen } = ctx;
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
