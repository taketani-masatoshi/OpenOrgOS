/**
 * Statutory readiness without e-Tax filing (ADR 0052 Phase 5).
 * Assessment · remittance · payroll payable — not XML / 申告送信.
 */
import { loadJournalEntries } from "./expense-claim-journal.js";
import { runConsumptionTaxCheck } from "./consumption-tax.js";
import { remittanceIntegrityIssues } from "./remittance-integrity.js";

export type StatutoryReadinessIssue = {
  level: "error" | "warning";
  domain: "consumption_tax" | "payroll" | "remittance";
  message: string;
};

const CONSUMPTION_TAX_ERROR_CODES = new Set([
  "journal_tax_category",
  "tax_profile_missing",
]);

/** Consumption tax assessment gaps (e-Tax export is out of scope). */
export function consumptionTaxReadinessIssues(): StatutoryReadinessIssue[] {
  const issues: StatutoryReadinessIssue[] = [];
  try {
    const check = runConsumptionTaxCheck();
    for (const row of check.issues) {
      if (row.code === "ok" || row.severity === "info") continue;
      issues.push({
        level:
          row.severity === "blocking" ||
          CONSUMPTION_TAX_ERROR_CODES.has(row.code)
            ? "error"
            : "warning",
        domain: "consumption_tax",
        message: `${row.code}: ${row.message}`,
      });
    }
  } catch {
    /* tax profile optional */
  }
  return issues;
}

/** Accrual posted without net payroll payment for elapsed periods. */
export function payrollAccrualPaymentReadinessIssues(input?: {
  asOf?: string;
}): StatutoryReadinessIssue[] {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const issues: StatutoryReadinessIssue[] = [];
  const entries = loadJournalEntries().entries;
  for (const entry of entries) {
    const match = entry.entry_id.match(/^JE-PAYROLL-(\d{4}-\d{2})$/);
    if (!match) continue;
    const period = match[1]!;
    if (`${period}-28` > asOf) continue;
    const paid = entries.some((row) => row.entry_id === `JE-PAYROLL-PAY-${period}`);
    if (!paid) {
      issues.push({
        level: "warning",
        domain: "payroll",
        message: `payroll accrual posted for ${period} but no JE-PAYROLL-PAY-${period}`,
      });
    }
  }
  return issues;
}

export function statutoryFilingReadinessIssues(input?: {
  asOf?: string;
}): StatutoryReadinessIssue[] {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const issues: StatutoryReadinessIssue[] = [
    ...consumptionTaxReadinessIssues(),
    ...payrollAccrualPaymentReadinessIssues({ asOf }),
  ];

  for (const remit of remittanceIntegrityIssues({ asOf })) {
    const domain: StatutoryReadinessIssue["domain"] =
      remit.message.includes("consumption_tax")
        ? "remittance"
        : remit.message.includes("withholding") ||
            remit.message.includes("social_insurance")
          ? "payroll"
          : "remittance";
    issues.push({
      level: remit.level,
      domain,
      message: remit.message,
    });
  }

  return issues;
}
