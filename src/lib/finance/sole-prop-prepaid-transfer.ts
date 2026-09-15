/**
 * Year-end transfer: prepaid (1180) → expense for sole-prop blue return.
 * Intake posts Dr 1180 (business) at payment; this recognizes expense at year-end.
 */
import { loadChartOfAccounts } from "../data.js";
import { journalEntrySchema } from "../../../schemas/finance/journal-entry.js";
import type { BlueReturnExpenseIntake } from "../../../schemas/finance/blue-return-expense-intake.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import { loadBlueReturnExpenseIntakes } from "./sole-proprietor-clarify.js";

function businessGrossYen(intake: BlueReturnExpenseIntake): number {
  const pct =
    intake.business_use === "business_only" ? 100 : (intake.business_pct ?? 100);
  return Math.round((intake.amount_yen * pct) / 100);
}

function splitTaxInclusive(grossYen: number): { base: number; tax: number } {
  const base = Math.round(grossYen / 1.1);
  return { base, tax: grossYen - base };
}

/**
 * Post year-end prepaid → expense transfers (idempotent JE-PRE-{intake_id}-{year}).
 */
export function postPrepaidYearTransfers(input: {
  calendarYear: number;
  authorizedBy?: string;
}): { posted: string[]; skipped: string[] } {
  const coa = loadChartOfAccounts();
  if (!coa.accounts.some((a) => a.code === "1180")) {
    throw new Error(
      "prepaid transfer-year には CoA 1180 前払費用が必要です（seed chart-of-accounts を更新）",
    );
  }

  const authorizedBy = input.authorizedBy ?? "sole-prop-prepaid";
  const existing = new Set(loadJournalEntries().entries.map((e) => e.entry_id));
  const posted: string[] = [];
  const skipped: string[] = [];
  const year = input.calendarYear;

  const intakes = loadBlueReturnExpenseIntakes().intakes.filter((i) => {
    if (i.timing !== "prepaid") return false;
    if (i.status !== "complete") return false;
    const occurredOn = i.occurred_on;
    if (!occurredOn || occurredOn.slice(0, 4) !== String(year)) return false;
    return true;
  });

  for (const intake of intakes) {
    const entryId = `JE-PRE-${intake.intake_id}-${year}`;
    if (existing.has(entryId)) {
      skipped.push(entryId);
      continue;
    }
    const business = businessGrossYen(intake);
    if (business <= 0) {
      skipped.push(`${intake.intake_id}:zero-business`);
      continue;
    }
    const expenseCode = intake.account_code?.trim();
    if (!expenseCode) {
      throw new Error(
        `prepaid transfer ${intake.intake_id}: account_code（費用科目）が必須です`,
      );
    }

    const taxInclusive = intake.tax_inclusive !== false;
    const lines: Array<{
      account_code: string;
      debit_yen: number;
      credit_yen: number;
      tax_category?: "taxable_10" | "out_of_scope";
    }> = [];

    if (taxInclusive) {
      const { base, tax } = splitTaxInclusive(business);
      lines.push({
        account_code: expenseCode,
        debit_yen: base,
        credit_yen: 0,
        tax_category: "taxable_10",
      });
      if (tax > 0) {
        lines.push({
          account_code: "2170",
          debit_yen: tax,
          credit_yen: 0,
          tax_category: "out_of_scope",
        });
      }
    } else {
      lines.push({
        account_code: expenseCode,
        debit_yen: business,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    lines.push({
      account_code: "1180",
      debit_yen: 0,
      credit_yen: business,
      tax_category: "out_of_scope",
    });

    appendJournalEntry(
      journalEntrySchema.parse({
        entry_id: entryId,
        occurred_at: `${year}-12-31T04:00:00.000Z`,
        description: `前払費用振替 ${intake.intake_id} ${year}年分`,
        source: {
          kind: "manual",
          authorized_by: authorizedBy,
        },
        evidence_refs: [
          `intake:${intake.intake_id}`,
          `prepaid-transfer:${year}`,
        ],
        lines,
      }),
      { postedBy: authorizedBy },
    );
    posted.push(entryId);
  }

  return { posted, skipped };
}
