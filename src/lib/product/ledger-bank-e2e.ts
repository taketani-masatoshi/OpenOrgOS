/**
 * Deterministic bank import → propose → approve → GL path for pilots / tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { importBankStatementCsvText } from "../finance/bank-statement-import-service.js";
import {
  applyApprovedBankReconciliation,
  listBankReconciliationWorkbench,
} from "../finance/bank-reconcile-apply.js";
import { getDataDir } from "../utils.js";
import { ensureLedgerDemoChartOfAccounts } from "./ledger-coa-ensure.js";

const SAMPLE_AMOUNT = 120_000;
const SAMPLE_DATE = "2026-06-15";
const AR_ID = "AR-E2E-001";
const BANK_ID = "BANK-E2E-001";

export function writePilotBankReconcileFixtures(): {
  ar_ap_path: string;
  csv_rows: number;
} {
  ensureLedgerDemoChartOfAccounts();
  const financeDir = join(getDataDir(), "finance");
  mkdirSync(financeDir, { recursive: true });

  const arAp = {
    as_of: "2026-06-30",
    currency: "JPY",
    entries: [
      {
        id: AR_ID,
        kind: "ar",
        amount: SAMPLE_AMOUNT,
        category: "rent",
        booked_date: SAMPLE_DATE,
        due_date: "2026-07-15",
        counterparty: "E2E Customer",
        description: "E2E receivable for bank reconcile",
        account_id: "BANK-001",
        chart_account_id: "4100",
        invoice_id: "INV-E2E-001",
        status: "open",
        source: "ar-ap",
      },
    ],
  };
  const arApPath = join(financeDir, "ar-ap-ledger.yaml");
  writeFileSync(arApPath, YAML.stringify(arAp), "utf-8");

  const csv = [
    "date,direction,amount,category,description,account_id,reference,counterparty",
    `${SAMPLE_DATE},inflow,${SAMPLE_AMOUNT},rent,E2E June rent,BANK-001,${AR_ID},E2E Customer`,
  ].join("\n");

  const imported = importBankStatementCsvText({
    csvText: csv,
    write: true,
  });

  return { ar_ap_path: "data/finance/ar-ap-ledger.yaml", csv_rows: imported.added };
}

export function runBankImportReconcileE2E(input?: {
  authorizedBy?: string;
}): {
  imported: number;
  proposals: number;
  applied: { event_id: string; entry_id: string } | null;
  workbench_unmatched_after: number;
} {
  const fixtures = writePilotBankReconcileFixtures();
  const before = listBankReconciliationWorkbench();
  const exactOrCandidate = before.proposals.find(
    (row) =>
      row.ar_ap_id === AR_ID ||
      row.amount === SAMPLE_AMOUNT,
  );

  let applied: { event_id: string; entry_id: string } | null = null;
  if (exactOrCandidate) {
    applied = applyApprovedBankReconciliation({
      bankId: exactOrCandidate.bank_statement_id,
      arApId: exactOrCandidate.ar_ap_id,
      amount: exactOrCandidate.amount,
      reason: "accounting-e2e-approve",
      authorizedBy: input?.authorizedBy ?? "OP-E2E",
      effectiveDate: SAMPLE_DATE,
    });
  } else {
    // Fallback: approve known IDs if import assigned BANK-E2E-* ids
    const bankHit = before.unmatched.find(
      (row) => row.amount === SAMPLE_AMOUNT && row.direction === "inflow",
    );
    if (bankHit) {
      applied = applyApprovedBankReconciliation({
        bankId: bankHit.id,
        arApId: AR_ID,
        amount: SAMPLE_AMOUNT,
        reason: "accounting-e2e-approve-fallback",
        authorizedBy: input?.authorizedBy ?? "OP-E2E",
        effectiveDate: SAMPLE_DATE,
      });
    }
  }

  const after = listBankReconciliationWorkbench();
  return {
    imported: fixtures.csv_rows,
    proposals: before.proposals.length,
    applied,
    workbench_unmatched_after: after.unmatched_count,
  };
}

export const BANK_E2E_CONSTANTS = {
  SAMPLE_AMOUNT,
  SAMPLE_DATE,
  AR_ID,
  BANK_ID,
};
