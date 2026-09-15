/**
 * Year-end reclass: 仮受/仮払 → 未払消費税 (idempotent JE-CT-YE-{year}).
 * Does not file e-Tax. Exempt / zero net is a no-op.
 */
import { journalEntrySchema } from "../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts } from "../data.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import { loadBlueReturnSetup } from "./sole-proprietor-clarify.js";
import {
  consumptionTaxNetPayableYen,
  consumptionYearEndEntryId,
  isConsumptionTaxableStatus,
} from "./sole-prop-year-end.js";

export function postConsumptionTaxYearEndReclass(input: {
  calendarYear: number;
  authorizedBy?: string;
}): {
  posted: boolean;
  skipped: string;
  entry_id: string;
  net_payable_yen: number;
} {
  const year = input.calendarYear;
  const entry_id = consumptionYearEndEntryId(year);
  const setup = loadBlueReturnSetup();
  if (!isConsumptionTaxableStatus(setup?.consumption?.status)) {
    return {
      posted: false,
      skipped: "exempt-or-untaxable",
      entry_id,
      net_payable_yen: 0,
    };
  }

  const existing = new Set(loadJournalEntries().entries.map((e) => e.entry_id));
  if (existing.has(entry_id)) {
    const vat = consumptionTaxNetPayableYen(year);
    return {
      posted: false,
      skipped: "already-posted",
      entry_id,
      net_payable_yen: vat.net_payable_yen,
    };
  }

  const vat = consumptionTaxNetPayableYen(year);
  if (Math.abs(vat.net_payable_yen) <= 1 && vat.output_yen === 0 && vat.input_yen === 0) {
    return {
      posted: false,
      skipped: "zero-balance",
      entry_id,
      net_payable_yen: 0,
    };
  }

  const coa = loadChartOfAccounts();
  if (!coa.accounts.some((a) => a.code === vat.unpaid_code)) {
    throw new Error(
      `year-end-reclass には CoA ${vat.unpaid_code} 未払消費税が必要です（journal_source_accounts.consumption_tax_unpaid）`,
    );
  }

  const output = vat.output_yen;
  const inputYen = vat.input_yen;
  const net = vat.net_payable_yen;
  const lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category: "out_of_scope";
  }> = [];

  if (output > 0) {
    lines.push({
      account_code: vat.output_code,
      debit_yen: output,
      credit_yen: 0,
      tax_category: "out_of_scope",
    });
  }
  if (inputYen > 0) {
    lines.push({
      account_code: vat.input_code,
      debit_yen: 0,
      credit_yen: inputYen,
      tax_category: "out_of_scope",
    });
  }
  if (net > 0) {
    lines.push({
      account_code: vat.unpaid_code,
      debit_yen: 0,
      credit_yen: net,
      tax_category: "out_of_scope",
    });
  } else if (net < 0) {
    lines.push({
      account_code: vat.unpaid_code,
      debit_yen: -net,
      credit_yen: 0,
      tax_category: "out_of_scope",
    });
  }

  if (lines.length === 0) {
    return {
      posted: false,
      skipped: "zero-balance",
      entry_id,
      net_payable_yen: net,
    };
  }

  const authorizedBy = input.authorizedBy ?? "tax-consumption-year-end";
  appendJournalEntry(
    journalEntrySchema.parse({
      entry_id,
      occurred_at: `${year}-12-31T05:00:00.000Z`,
      description: `消費税期末振替 ${year}年分（仮受/仮払 → 未払）`,
      source: {
        kind: "manual",
        authorized_by: authorizedBy,
      },
      evidence_refs: [`consumption-year-end:${year}`],
      lines,
    }),
    { postedBy: authorizedBy },
  );

  return {
    posted: true,
    skipped: "",
    entry_id,
    net_payable_yen: net,
  };
}
