import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  employeeReimbursementPayableSchema,
  employeeReimbursementPayablesFileSchema,
  type EmployeeReimbursementPayable,
  type EmployeeReimbursementPayablesFile,
} from "../../../schemas/finance/employee-reimbursement-payable.js";
import {
  buildTransferInstruction,
  writeTransferInstructionFile,
} from "../broker.js";
import { getClock } from "../runtime-context.js";
import { getDataDir, readYamlFile, ROOT_DIR, writeYamlFile } from "../utils.js";

const PAYABLES_REL = "finance/employee-reimbursement-payables.yaml";

export function employeeReimbursementPayablesPath(): string {
  return join(getDataDir(), PAYABLES_REL);
}

export function loadEmployeeReimbursementPayables(): EmployeeReimbursementPayablesFile {
  const path = employeeReimbursementPayablesPath();
  if (!existsSync(path)) {
    return employeeReimbursementPayablesFileSchema.parse({
      version: 1,
      payables: [],
    });
  }
  return readYamlFile(path, employeeReimbursementPayablesFileSchema);
}

export function saveEmployeeReimbursementPayables(
  file: EmployeeReimbursementPayablesFile,
): void {
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(
    employeeReimbursementPayablesPath(),
    employeeReimbursementPayablesFileSchema.parse(file),
  );
}

export function syncEmployeeReimbursementPayable(input: {
  claimId: string;
  personId: string;
  employeeId: string;
  amountYen: number;
  postedMonth: string;
  postedAt: string;
  postingJournalEntryId: string;
}): EmployeeReimbursementPayable {
  const file = loadEmployeeReimbursementPayables();
  const existing = file.payables.find((row) => row.claim_id === input.claimId);
  if (existing) return existing;
  const due = new Date(input.postedAt);
  due.setUTCDate(due.getUTCDate() + 7);
  const payable = employeeReimbursementPayableSchema.parse({
    claim_id: input.claimId,
    person_id: input.personId,
    employee_id: input.employeeId,
    amount_yen: input.amountYen,
    status: "pending",
    due_date: due.toISOString().slice(0, 10),
    posted_month: input.postedMonth,
    journal_entry_ids: [input.postingJournalEntryId],
  });
  file.payables.push(payable);
  file.as_of = getClock().nowIso().slice(0, 10);
  saveEmployeeReimbursementPayables(file);
  return payable;
}

export function prepareEmployeeReimbursementTransfer(input: {
  claimId: string;
  sourceBankAccountId: string;
  stakeholderId: string;
  payee: string;
  preparedBy: string;
}): EmployeeReimbursementPayable {
  if (
    !input.sourceBankAccountId.trim() ||
    !input.stakeholderId.trim() ||
    !input.payee.trim() ||
    !input.preparedBy.trim()
  ) {
    throw new Error(
      "source bank account id, stakeholder id, payee, and preparedBy are required",
    );
  }
  const file = loadEmployeeReimbursementPayables();
  const index = file.payables.findIndex(
    (row) => row.claim_id === input.claimId,
  );
  if (index < 0) {
    throw new Error(`Reimbursement payable not found: ${input.claimId}`);
  }
  const payable = file.payables[index]!;
  if (payable.status !== "pending") {
    throw new Error(
      `Reimbursement payable ${input.claimId} is ${payable.status}`,
    );
  }
  const instruction = buildTransferInstruction({
    from: input.sourceBankAccountId,
    amount: payable.amount_yen,
    payee: input.payee,
    stakeholderId: input.stakeholderId,
    reference: input.claimId,
    dryRun: true,
    agent: "finance",
  });
  const path = writeTransferInstructionFile(
    instruction,
    `expense-reimbursement-${input.claimId}.md`,
  );
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const preparedAt = getClock().nowIso();
  const evidenceRef = `BROKER-${input.claimId}`;
  const next = employeeReimbursementPayableSchema.parse({
    ...payable,
    broker_evidence: {
      evidence_ref: evidenceRef,
      instruction_path: relative(ROOT_DIR, path),
      sha256,
      prepared_at: preparedAt,
      prepared_by: input.preparedBy,
      source_bank_account_id: input.sourceBankAccountId,
      stakeholder_id: input.stakeholderId,
      payee: input.payee,
    },
  });
  file.payables[index] = next;
  file.as_of = preparedAt.slice(0, 10);
  saveEmployeeReimbursementPayables(file);
  return next;
}

export type BrokerEvidenceVerification = {
  ok: boolean;
  claim_id: string;
  evidence_ref?: string;
  instruction_path?: string;
  error?: string;
};

/** Read-only re-verification of the persisted redacted broker instruction. */
export function verifyEmployeeReimbursementBrokerEvidence(
  claimId: string,
): BrokerEvidenceVerification {
  const payable = loadEmployeeReimbursementPayables().payables.find(
    (row) => row.claim_id === claimId,
  );
  if (!payable) {
    return { ok: false, claim_id: claimId, error: "payable not found" };
  }
  const evidence = payable.broker_evidence;
  if (!evidence) {
    return { ok: false, claim_id: claimId, error: "broker evidence missing" };
  }
  const instructionPath = resolve(ROOT_DIR, evidence.instruction_path);
  if (!existsSync(instructionPath)) {
    return {
      ok: false,
      claim_id: claimId,
      evidence_ref: evidence.evidence_ref,
      instruction_path: evidence.instruction_path,
      error: "broker instruction file missing",
    };
  }
  const content = readFileSync(instructionPath);
  const actualDigest = createHash("sha256").update(content).digest("hex");
  if (actualDigest !== evidence.sha256) {
    return {
      ok: false,
      claim_id: claimId,
      evidence_ref: evidence.evidence_ref,
      instruction_path: evidence.instruction_path,
      error: `broker instruction sha256 mismatch (expected ${evidence.sha256}, got ${actualDigest})`,
    };
  }
  const markdown = content.toString("utf8");
  const sourceMatch = markdown.match(/^\| 出金口座 \| (.+) \|$/m);
  const amountMatch = markdown.match(/^\| 金額 \| (.+) \|$/m);
  const payeeMatch = markdown.match(/^\| 振込先 \| (.+) \|$/m);
  const referenceMatch = markdown.match(/^\| 摘要 \| (.+) \|$/m);
  const parsedAmount = Number((amountMatch?.[1] ?? "").replace(/[^\d]/g, ""));
  if (
    !sourceMatch?.[1]?.startsWith(`${evidence.source_bank_account_id} `) ||
    parsedAmount !== payable.amount_yen ||
    payeeMatch?.[1] !== evidence.payee ||
    referenceMatch?.[1] !== claimId ||
    !evidence.stakeholder_id.trim()
  ) {
    return {
      ok: false,
      claim_id: claimId,
      evidence_ref: evidence.evidence_ref,
      instruction_path: evidence.instruction_path,
      error:
        "broker instruction content does not match claim, amount, source account, or payee/stakeholder evidence",
    };
  }
  return {
    ok: true,
    claim_id: claimId,
    evidence_ref: evidence.evidence_ref,
    instruction_path: evidence.instruction_path,
  };
}

export function closeEmployeeReimbursementPayable(input: {
  claimId: string;
  paymentRef: string;
  paidAt: string;
  bankStatementRef?: string;
  settlementEvidenceRef?: string;
  reimbursementJournalEntryId: string;
}): EmployeeReimbursementPayable {
  const file = loadEmployeeReimbursementPayables();
  const index = file.payables.findIndex(
    (row) => row.claim_id === input.claimId,
  );
  if (index < 0) {
    throw new Error(`Reimbursement payable not found: ${input.claimId}`);
  }
  const payable = file.payables[index]!;
  if (!payable.broker_evidence) {
    throw new Error(
      `Reimbursement payable ${input.claimId} requires prepared broker evidence before payment`,
    );
  }
  const verification = verifyEmployeeReimbursementBrokerEvidence(input.claimId);
  if (!verification.ok) {
    throw new Error(
      `Reimbursement payable ${input.claimId} broker evidence verification failed: ${verification.error}`,
    );
  }
  if (!input.bankStatementRef?.trim() && !input.settlementEvidenceRef?.trim()) {
    throw new Error(
      "bankStatementRef or settlementEvidenceRef is required as external settlement evidence",
    );
  }
  const next = employeeReimbursementPayableSchema.parse({
    ...payable,
    status: "paid",
    payment_ref: input.paymentRef,
    bank_statement_ref: input.bankStatementRef?.trim() || undefined,
    settlement_evidence_ref: input.settlementEvidenceRef?.trim() || undefined,
    paid_at: input.paidAt,
    journal_entry_ids: [
      ...payable.journal_entry_ids,
      input.reimbursementJournalEntryId,
    ].filter((value, index, values) => values.indexOf(value) === index),
  });
  file.payables[index] = next;
  file.as_of = input.paidAt.slice(0, 10);
  saveEmployeeReimbursementPayables(file);
  return next;
}
