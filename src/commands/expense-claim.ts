import { readFileSync } from "node:fs";
import {
  approveExpenseClaim,
  claimRevision,
  evaluateExpenseClaimGate,
  expenseClaimsRevision,
  findExpenseClaim,
  ingestExpenseReceiptQr,
  listExpenseClaims,
  loadExpenseClaims,
  markExpenseClaimReimbursed,
  prepareExpenseClaimReimbursementTransfer,
  rejectExpenseClaim,
} from "../lib/finance/expense-claim.js";
import {
  requireCliHumanApproval,
  requireCliOperator,
  auditCliMutation,
} from "../lib/console-auth/cli-operator.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function runExpenseClaimList(opts: {
  status?: string;
  json?: boolean;
}): void {
  const claims = listExpenseClaims(
    opts.status ? { status: opts.status as never } : undefined,
  );
  if (opts.json) {
    printJson({ revision: expenseClaimsRevision(), claims });
    return;
  }
  console.log(`# 経費精算一覧 (revision ${expenseClaimsRevision()})\n`);
  for (const claim of claims) {
    console.log(
      `${claim.claim_id} · ${claim.status} · ${claim.amount_yen.toLocaleString()}円 · ${claim.proposed_at}`,
    );
  }
}

export function runExpenseClaimShow(opts: {
  claimId: string;
  json?: boolean;
}): void {
  const claim = findExpenseClaim(opts.claimId);
  if (!claim) {
    console.error(`Claim not found: ${opts.claimId}`);
    process.exit(1);
  }
  if (opts.json) {
    printJson({ claim, revision: claimRevision(claim) });
    return;
  }
  console.log(`# ${claim.claim_id}\n`);
  console.log(`status: ${claim.status}`);
  console.log(`amount: ${claim.amount_yen.toLocaleString()} JPY`);
  console.log(`gate: ${claim.gate}`);
  console.log(`revision: ${claimRevision(claim)}`);
}

export async function runExpenseClaimIngest(opts: {
  qr?: string;
  file?: string;
  personId: string;
  orgUnitId: string;
  accountCode: string;
  proposedBy?: string;
  operatorId?: string;
  expectedRevision?: string;
  json?: boolean;
}): Promise<void> {
  const auth = requireCliOperator({
    operatorId: opts.operatorId,
    permission: "chat:ask",
    command: "expense-claim ingest",
  });
  const qrOrJson =
    opts.qr ??
    (opts.file ? readFileSync(opts.file, "utf-8").trim() : undefined);
  if (!qrOrJson) {
    console.error("Provide --qr or --file");
    process.exit(1);
  }
  const expectedClaimsRevision =
    opts.expectedRevision ?? expenseClaimsRevision();
  const result = await ingestExpenseReceiptQr({
    qrOrJson,
    personId: opts.personId,
    orgUnitId: opts.orgUnitId,
    accountCode: opts.accountCode,
    proposedBy: opts.proposedBy ?? auth.record.operator_id,
    expectedClaimsRevision,
  });
  auditCliMutation(
    "expense-claim ingest",
    `${result.claim.claim_id} ${result.gate.gate}`,
  );
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`✓ ${result.claim.claim_id} · gate=${result.gate.gate}`);
}

export function runExpenseClaimGate(opts: {
  claimId: string;
  json?: boolean;
}): void {
  const claim = findExpenseClaim(opts.claimId);
  if (!claim) {
    console.error(`Claim not found: ${opts.claimId}`);
    process.exit(1);
  }
  const gate = evaluateExpenseClaimGate({
    personId: claim.person_id,
    orgUnitId: claim.org_unit_id,
    accountCode: claim.account_code,
    amountYen: claim.amount_yen,
    proposedBy: claim.proposed_by,
    excludeClaimId: claim.claim_id,
  });
  if (opts.json) {
    printJson(gate);
    return;
  }
  console.log(`gate: ${gate.gate}`);
  console.log(gate.message);
}

export function runExpenseClaimApprove(opts: {
  claimId: string;
  operatorId?: string;
  coApproverId?: string;
  boardEventId?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliHumanApproval("expense-claim approve");
  const operatorId = opts.operatorId ?? auth.record.operator_id;
  if (operatorId !== auth.record.operator_id) {
    throw new Error("Cannot approve on behalf of another operator via CLI");
  }
  const claim = approveExpenseClaim({
    claimId: opts.claimId,
    approverId: auth.record.operator_id,
    coApproverId: opts.coApproverId,
    boardEventId: opts.boardEventId,
    operatorId: auth.record.operator_id,
    expectedClaimRevision: opts.expectedRevision,
  });
  auditCliMutation("expense-claim approve", claim.claim_id);
  if (opts.json) {
    printJson({ claim, revision: claimRevision(claim) });
    return;
  }
  console.log(`✓ approved ${claim.claim_id} · status=${claim.status}`);
}

export function runExpenseClaimReject(opts: {
  claimId: string;
  operatorId?: string;
  reason?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliHumanApproval("expense-claim reject");
  const operatorId = opts.operatorId ?? auth.record.operator_id;
  if (operatorId !== auth.record.operator_id) {
    throw new Error("Cannot reject on behalf of another operator via CLI");
  }
  const claim = rejectExpenseClaim({
    claimId: opts.claimId,
    rejectorId: auth.record.operator_id,
    reason: opts.reason,
    expectedClaimRevision: opts.expectedRevision,
  });
  auditCliMutation("expense-claim reject", claim.claim_id);
  if (opts.json) {
    printJson({ claim, revision: claimRevision(claim) });
    return;
  }
  console.log(`✓ rejected ${claim.claim_id}`);
}

export function runExpenseClaimPrepareTransfer(opts: {
  claimId: string;
  sourceBankAccountId: string;
  stakeholderId: string;
  payee: string;
  operatorId?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliOperator({
    operatorId: opts.operatorId,
    permission: "broker:transfer",
    command: "expense-claim prepare-transfer",
  });
  const claim = prepareExpenseClaimReimbursementTransfer({
    claimId: opts.claimId,
    sourceBankAccountId: opts.sourceBankAccountId,
    stakeholderId: opts.stakeholderId,
    payee: opts.payee,
    preparedBy: auth.record.operator_id,
    expectedClaimRevision: opts.expectedRevision,
  });
  auditCliMutation("expense-claim prepare-transfer", claim.claim_id);
  if (opts.json) {
    printJson({ claim, revision: claimRevision(claim) });
    return;
  }
  console.log(`✓ transfer prepared for ${claim.claim_id}`);
}

export function runExpenseClaimReimburse(opts: {
  claimId: string;
  paymentRef: string;
  bankStatementRef?: string;
  operatorId?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliFinanceReimburse(opts.operatorId);
  const claim = markExpenseClaimReimbursed({
    claimId: opts.claimId,
    paidBy: auth.record.operator_id,
    paymentRef: opts.paymentRef,
    bankStatementRef: opts.bankStatementRef,
    expectedClaimRevision: opts.expectedRevision,
  });
  auditCliMutation("expense-claim reimburse", claim.claim_id);
  if (opts.json) {
    printJson({ claim, revision: claimRevision(claim) });
    return;
  }
  console.log(`✓ reimbursed ${claim.claim_id}`);
}

function requireCliFinanceReimburse(operatorId?: string) {
  return requireCliOperator({
    operatorId,
    permission: "finance:reconcile",
    command: "expense-claim reimburse",
  });
}

export function runExpenseClaimRevision(opts: { json?: boolean }): void {
  const file = loadExpenseClaims();
  const revision = expenseClaimsRevision(file);
  if (opts.json) {
    printJson({ revision, count: file.claims.length });
    return;
  }
  console.log(revision);
}
