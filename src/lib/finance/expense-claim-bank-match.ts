import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  expenseClaimsFileSchema,
  type ExpenseClaim,
} from "../../../schemas/finance/expense-claim.js";
import {
  bankStatementEntrySchema,
  bankStatementFileSchema,
  type BankStatementEntry,
  type BankStatementFile,
} from "../../../schemas/jp-bank-corporate.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";

export type ExpenseClaimSettlementCandidate = {
  bank_statement_id: string;
  date: string;
  amount: number;
  account_id: string;
  description: string;
  counterparty?: string;
  status: BankStatementEntry["status"];
};

function bankStatementsPath(): string {
  return join(getDataDir(), "finance", "bank-statements.yaml");
}

function loadClaims(): ExpenseClaim[] {
  const path = join(getDataDir(), "finance", "expense-claims.yaml");
  if (!existsSync(path)) return [];
  return readYamlFile(path, expenseClaimsFileSchema).claims;
}

export function loadBankStatementsFile(): BankStatementFile {
  const path = bankStatementsPath();
  if (!existsSync(path)) {
    return bankStatementFileSchema.parse({ currency: "JPY", entries: [] });
  }
  return readYamlFile(path, bankStatementFileSchema);
}

/** Outflow candidates whose amount matches the claim and are not already linked. */
export function listExpenseClaimSettlementCandidates(
  claimId: string,
): ExpenseClaimSettlementCandidate[] {
  const claims = loadClaims();
  const claim = claims.find((row) => row.claim_id === claimId);
  if (!claim) return [];
  const used = new Set(
    claims
      .filter(
        (row) =>
          row.claim_id !== claimId &&
          Boolean(row.reimbursement?.bank_statement_ref),
      )
      .map((row) => row.reimbursement!.bank_statement_ref!),
  );
  return loadBankStatementsFile()
    .entries.filter(
      (entry) =>
        entry.direction === "outflow" &&
        entry.amount === claim.amount_yen &&
        entry.status !== "matched" &&
        !used.has(entry.id),
    )
    .map((entry) => ({
      bank_statement_id: entry.id,
      date: entry.date,
      amount: entry.amount,
      account_id: entry.account_id,
      description: entry.description,
      counterparty: entry.counterparty,
      status: entry.status,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function assertExpenseClaimBankStatementRef(input: {
  claimId: string;
  bankStatementRef: string;
  amountYen: number;
  sourceBankAccountId?: string;
}): BankStatementEntry {
  const file = loadBankStatementsFile();
  const entry = file.entries.find(
    (row) => row.id === input.bankStatementRef.trim(),
  );
  if (!entry) {
    throw new Error(
      `bank_statement_ref ${input.bankStatementRef} not found in data/finance/bank-statements.yaml`,
    );
  }
  if (entry.direction !== "outflow") {
    throw new Error(
      `bank_statement_ref ${entry.id} must be an outflow for reimbursement`,
    );
  }
  if (entry.amount !== input.amountYen) {
    throw new Error(
      `bank_statement_ref ${entry.id} amount ${entry.amount} does not match claim ${input.amountYen}`,
    );
  }
  if (
    input.sourceBankAccountId &&
    entry.account_id !== input.sourceBankAccountId
  ) {
    throw new Error(
      `bank_statement_ref ${entry.id} account ${entry.account_id} does not match source ${input.sourceBankAccountId}`,
    );
  }
  const linkedElsewhere = loadClaims().some(
    (row) =>
      row.claim_id !== input.claimId &&
      row.reimbursement?.bank_statement_ref === entry.id,
  );
  if (linkedElsewhere) {
    throw new Error(
      `bank_statement_ref ${entry.id} is already linked to another expense claim`,
    );
  }
  return entry;
}

/**
 * Mark a bank statement row matched after expense-claim reimbursement.
 * Compatibility snapshot only — JP AR/AP reconciliation-events remain separate.
 */
export function markExpenseClaimBankStatementMatched(input: {
  claimId: string;
  bankStatementRef: string;
  amountYen: number;
  sourceBankAccountId?: string;
}): BankStatementEntry {
  const path = bankStatementsPath();
  const file = loadBankStatementsFile();
  const index = file.entries.findIndex(
    (row) => row.id === input.bankStatementRef.trim(),
  );
  if (index < 0) {
    throw new Error(
      `bank_statement_ref ${input.bankStatementRef} not found in data/finance/bank-statements.yaml`,
    );
  }
  const current = file.entries[index]!;
  if (current.status === "matched" && current.reference === input.claimId) {
    return current;
  }
  if (current.status === "matched" && current.reference !== input.claimId) {
    throw new Error(
      `bank_statement_ref ${current.id} is already matched to ${current.reference ?? "another entry"}`,
    );
  }
  // Re-validate against live file before mutating.
  assertExpenseClaimBankStatementRef(input);
  const next = bankStatementEntrySchema.parse({
    ...current,
    status: "matched",
    reference: input.claimId,
    chart_account_id: current.chart_account_id ?? "2200",
  });
  file.entries[index] = next;
  writeYamlFile(path, file);
  return next;
}

/** Test/demo helper: ensure an unmatched outflow exists for a claim amount. */
export function ensureExpenseClaimBankStatementCandidate(input: {
  claimId: string;
  amountYen: number;
  accountId?: string;
  date?: string;
}): string {
  // Avoid embedding raw claim_id (ECL-…) so UI text matchers do not false-hit option labels.
  const id = `BANK-REIMB-${input.claimId.replace(/^ECL-/, "")}`;
  const path = bankStatementsPath();
  const file = loadBankStatementsFile();
  const existing = file.entries.find((row) => row.id === id);
  if (existing) {
    if (existing.amount !== input.amountYen) {
      throw new Error(
        `Existing bank statement ${id} amount ${existing.amount} != ${input.amountYen}`,
      );
    }
    return id;
  }
  file.entries.push(
    bankStatementEntrySchema.parse({
      id,
      date: input.date ?? "2026-07-24",
      direction: "outflow",
      amount: input.amountYen,
      category: "reimbursement",
      description: `Employee reimbursement ${input.claimId}`,
      account_id: input.accountId ?? "BANK-001",
      chart_account_id: "2200",
      reference: input.claimId,
      counterparty: "Employee reimbursement",
      status: "unmatched",
      source: "import",
    }),
  );
  writeYamlFile(path, file);
  return id;
}
