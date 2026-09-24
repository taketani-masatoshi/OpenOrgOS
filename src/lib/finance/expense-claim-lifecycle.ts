/**
 * Expense-claim lifecycle: wire claim, approve/reject, post, reimburse.
 */
import { randomUUID } from "node:crypto";
import {
  expenseClaimSchema,
  type ExpenseClaim,
  type ExpenseClaimAllocation,
} from "../../../schemas/finance/expense-claim.js";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import { monthlyFinanceSchema } from "../../../schemas/finance/monthly-loans.js";
import type { z } from "zod";
import { expenseCategory } from "../../../schemas/finance/monthly-loans.js";
import {
  humanApproveOrgApproval,
  findOrgApproval,
  rejectOrgApproval,
} from "../org/approval/index.js";
import { assertBoardEventForBeyondPolicy } from "../org/budget-delegation.js";
import { appendInstructionAudit } from "../org/instruction-audit.js";
import { claimReceiptRemotely, ingestReceiptQrPayload } from "../receipt-qr.js";
import { getTenantId } from "../tenant.js";
import { getClock } from "../runtime-context.js";
import { loadChartOfAccounts, loadMonthlyFinance } from "../data.js";
import {
  closeEmployeeReimbursementPayable,
  loadEmployeeReimbursementPayables,
  prepareEmployeeReimbursementTransfer,
  syncEmployeeReimbursementPayable,
  verifyEmployeeReimbursementBrokerEvidence,
} from "./employee-reimbursement-payable.js";
import {
  postExpenseClaimJournal,
  reimburseExpenseClaimJournal,
} from "./expense-claim-journal.js";
import {
  loadExpenseEvidenceManifest,
  verifyExpenseEvidence,
} from "./expense-evidence.js";
import { isAuthorizedExpenseRepresentative } from "./expense-claim-approver.js";
import {
  assertExpenseClaimBankStatementRef,
  markExpenseClaimBankStatementMatched,
} from "./expense-claim-bank-match.js";
import { repairMissingApprovalForExpenseClaim } from "./expense-claim-approval-repair.js";
import { invoiceCatalogFreshnessWarnings } from "./expense-claim-invoice.js";
import { buildReceiptWireClaimPayload } from "./expense-claim-wire.js";
import {
  assertExpectedClaimRevision,
  bumpAndSaveExpenseClaims,
  bumpClaimAndSaveExpenseClaims,
  claimAllocations,
  claimRevision,
  loadExpenseClaims,
  persistClaimPatch,
  withExpenseClaimsLock,
} from "./expense-claim-store.js";
import {
  defaultReimbursementDueOn,
  type ExpenseClaimGateResult,
} from "./expense-claim-gate.js";

type ExpenseCategory = z.output<typeof expenseCategory>;

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
  const { proposeExpenseClaimFromReceipt } = await import(
    "./expense-claim-propose.js"
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
