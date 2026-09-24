/**
 * Expense-claim propose-from-receipt path (separated from approve/post lifecycle).
 */
import {
  EXPENSE_CLAIM_BOARD_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  EXPENSE_CLAIM_RINGI_SUBJECT,
  expenseClaimSchema,
  type ExpenseClaim,
  type ExpenseClaimAllocation,
} from "../../../schemas/finance/expense-claim.js";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import { proposeOrgApproval } from "../org/approval/index.js";
import { appendInstructionAudit } from "../org/instruction-audit.js";
import { getClock } from "../runtime-context.js";
import { archiveExpenseEvidence } from "./expense-evidence.js";
import { assertExpenseClaimInvoiceCompliance } from "./expense-claim-invoice.js";
import { inferExpenseAccountFromReceipt } from "./expense-claim-category.js";
import { resolveIssuerWireReady } from "./expense-claim-wire.js";
import {
  assertExpectedClaimsRevision,
  bumpAndSaveExpenseClaims,
  claimRevision,
  loadExpenseClaims,
  nextClaimId,
  withExpenseClaimsLock,
} from "./expense-claim-store.js";
import {
  assertAllocationAccountConsistency,
  evaluateAllocationGates,
  evaluateExpenseClaimDeadline,
  type ExpenseClaimGateResult,
} from "./expense-claim-gate.js";
import {
  postExpenseClaim,
  requestWireReceiptClaimBestEffort,
} from "./expense-claim-lifecycle.js";

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
