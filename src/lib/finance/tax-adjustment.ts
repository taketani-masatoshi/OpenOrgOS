/**
 * Corporate tax worksheet on NTA annex rows (令六・四・一以後終了事業年度分).
 * Does not post journals, switch opening balances, or file a return.
 *
 * Worked-example pins live in schedule4-pin.ts / schedule1-pin.ts.
 * Shared forms and OfficialAnnexLine types live in corporate-tax-annex.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { taxAdjustmentsFileSchema } from "../../../schemas/finance/tax-adjustments.js";
import { loadFixedAssets, loadTaxProfile } from "../data.js";
import { getDataDir } from "../utils.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";
import { buildGlProfitLossSummary } from "./gl-report-basis.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { equityChangeAmounts } from "./ledger/balance-sheet.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { assertJpTaxProfile } from "./indirect-tax/port.js";
import {
  FORM_BETSU_4,
  RESERVED_EXPLICIT_ROWS,
  ROW_DEPRECIATION_EXCESS,
  ROW_ENTERTAINMENT_EXCESS,
  ROW_TAXABLE_INCOME,
  type OfficialAnnexLine,
  type TaxAdjustmentKind,
  type TaxAdjustmentWorksheetLine,
} from "./corporate-tax-annex.js";
import {
  schedule4Amounts,
} from "./schedule4-pin.js";
import {
  emptyNationalTax,
  explicitRowAllowed,
  nationalCorporateTax,
  reducedBracketYen,
  reducedRateApplies,
  type CorporateTaxProfile,
} from "./tax-adjustment-national.js";
import {
  officialAnnexLines,
  type RetainedRollforward,
} from "./tax-adjustment-annex-build.js";

export {
  CORPORATE_TAX_FORM_EDITION,
  REIWA6_SCHEDULE4_EXAMPLE_INCOME_YEN,
  ARAMASHI_EXAMPLE_INCOME_YEN,
  ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN,
  ARAMASHI_EXAMPLE_LOCAL_BASE_YEN,
  ARAMASHI_EXAMPLE_LOCAL_TAX_YEN,
  type OfficialAnnexForm,
  type OfficialAnnexColumn,
  type OfficialAnnexLine,
  type TaxAdjustmentKind,
  type TaxAdjustmentWorksheetLine,
} from "./corporate-tax-annex.js";

export {
  schedule4AgriculturalReserveExample,
  scoreSchedule4WorkedExample,
  diffSchedule4OfficialExample,
  schedule4StatutoryMet,
} from "./schedule4-pin.js";

export {
  localCorporateTaxBaseYen,
  localCorporateTaxAmountYen,
  localCorporateTaxYen,
  schedule1NationalLocalExample,
  diffSchedule1NationalLocalExample,
  scoreNationalLocalWorkedExample,
  corporateNationalLocalStatutoryMet,
} from "./schedule1-pin.js";

const AUTO_IDS = new Set(["depreciation_excess", "entertainment_excess"]);

export type TaxAdjustmentWorksheet = {
  fiscal_year: string;
  as_of: string;
  can_compute: boolean;
  starting_profit_yen: number | null;
  lines: TaxAdjustmentWorksheetLine[];
  additions_yen: number | null;
  subtractions_yen: number | null;
  taxable_income_yen: number | null;
  corporate_tax_yen: number | null;
  retained_rollforward: RetainedRollforward | null;
  official_lines: OfficialAnnexLine[];
  official_pending: string[];
  errors: string[];
};

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function accountBalance(code: string, asOf: string): number {
  return (
    buildTrialBalance({ asOf }).rows.find((row) => row.account_code === code)?.balance_yen ?? 0
  );
}

function uncomputed(fiscalYear: string, asOf: string, errors: string[]): TaxAdjustmentWorksheet {
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    can_compute: false,
    starting_profit_yen: null,
    lines: [],
    additions_yen: null,
    subtractions_yen: null,
    taxable_income_yen: null,
    corporate_tax_yen: null,
    retained_rollforward: null,
    official_lines: [],
    official_pending: [],
    errors,
  };
}

export function evaluateTaxAdjustment(fiscalYear: string): TaxAdjustmentWorksheet {
  assertJpTaxProfile();
  if (!/^FY\d{4}$/.test(fiscalYear)) {
    throw new Error("fiscal year FY#### is required");
  }
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  const start = fiscalYearStartDate(fiscalYear, endMonth);
  const errors: string[] = [];
  const trial = buildTrialBalance({ asOf });
  if (!trial.balanced) {
    errors.push("trial-balance");
  }

  const retained = resolveJournalSourceAccounts().retained_earnings;
  const transfer = loadJournalEntries().entries.find(
    (entry) => entry.entry_id === `JE-CLOSE-${fiscalYear}-PL-TRANSFER`
  );
  const starting = transfer
    ? (transfer.lines.find((line) => line.account_code === retained)?.credit_yen ?? 0) -
      (transfer.lines.find((line) => line.account_code === retained)?.debit_yen ?? 0)
    : buildGlProfitLossSummary({ fiscalYear, asOf }).net_profit;

  const lines: TaxAdjustmentWorksheetLine[] = [];
  let depreciationExcess = 0;
  for (const asset of loadFixedAssets().assets) {
    const book = loadJournalEntries().entries.reduce((sum, entry) => {
      if (entry.source?.kind !== "depreciation" || entry.source.asset_id !== asset.id) return sum;
      const date = entry.occurred_at.slice(0, 10);
      if (date < start || date > asOf) return sum;
      return (
        sum +
        entry.lines
          .filter((line) => line.debit_yen > 0)
          .reduce((inner, line) => inner + line.debit_yen, 0)
      );
    }, 0);
    if (book <= 0) continue;
    if (asset.tax_depreciation_yen == null) {
      errors.push(`tax_depreciation_yen missing ${asset.id}`);
      continue;
    }
    const excess = book - asset.tax_depreciation_yen;
    if (excess > 0) {
      depreciationExcess += excess;
      lines.push({
        id: "depreciation_excess",
        kind: "add",
        amount_yen: excess,
        source: "auto",
        label: asset.id,
        asset_id: asset.id,
      });
    }
  }
  if (
    depreciationExcess > 0 &&
    !lines.some((line) => line.id === "depreciation_excess" && !line.asset_id)
  ) {
    lines.unshift({
      id: "depreciation_excess",
      kind: "add",
      amount_yen: depreciationExcess,
      source: "auto",
      label: "償却超過",
      form: FORM_BETSU_4,
      row: ROW_DEPRECIATION_EXCESS,
    });
  }

  const profile = loadTaxProfile() as {
    fiscal_year?: ProfileFiscalYear;
    corporate_tax?: CorporateTaxProfile;
  };
  const entertainmentCode = profile.corporate_tax?.entertainment_account_code;
  const cap = profile.corporate_tax?.entertainment_cap_yen;
  const entertainmentBalance = entertainmentCode
    ? accountBalance(entertainmentCode, asOf) - accountBalance(entertainmentCode, dayBefore(start))
    : 0;
  let entertainmentExcess = 0;
  if (entertainmentBalance > 0 && (entertainmentCode == null || cap == null)) {
    errors.push("entertainment cap missing");
  } else if (entertainmentCode && cap != null) {
    entertainmentExcess = Math.max(0, entertainmentBalance - cap);
    lines.push({
      id: "entertainment_excess",
      kind: "add",
      amount_yen: entertainmentExcess,
      source: "auto",
      label: "交際費超過",
      ...(entertainmentExcess > 0 ? { form: FORM_BETSU_4, row: ROW_ENTERTAINMENT_EXCESS } : {}),
    });
  }

  const path = join(getDataDir(), "finance", "tax-adjustments.yaml");
  let unmappedExplicit = false;
  if (existsSync(path)) {
    const parsed = taxAdjustmentsFileSchema.safeParse(YAML.parse(readFileSync(path, "utf-8")));
    if (!parsed.success) {
      errors.push("tax-adjustments invalid");
    } else if (parsed.data.fiscal_year !== fiscalYear) {
      errors.push("tax-adjustments fiscal year mismatch");
    } else {
      for (const line of parsed.data.lines) {
        if (AUTO_IDS.has(line.id)) {
          errors.push(`explicit id collides ${line.id}`);
          continue;
        }
        if (line.amount_yen < 0) {
          errors.push(`explicit amount negative ${line.id}`);
          continue;
        }
        if (line.form_row && RESERVED_EXPLICIT_ROWS.has(line.form_row)) {
          errors.push(`explicit row reserved ${line.id}`);
          continue;
        }
        const allowed = explicitRowAllowed(line.kind, line.form_row);
        if (!allowed) unmappedExplicit = true;
        lines.push({
          id: line.id,
          kind: line.kind,
          amount_yen: line.amount_yen,
          source: "explicit",
          label: line.label,
          ...(allowed && line.form_row ? { form: FORM_BETSU_4, row: line.form_row } : {}),
        });
      }
    }
  }

  if (errors.length > 0) {
    return uncomputed(fiscalYear, asOf, errors);
  }

  const equity = equityChangeAmounts({ asOf, fiscalYear });
  const retainedRow = equity.components.find((row) => row.equity_class === "retained");
  if (!retainedRow?.balanced) {
    errors.push("betsu-5 retained mismatch");
  }
  if (errors.length > 0) {
    return uncomputed(fiscalYear, asOf, errors);
  }

  const additions = lines
    .filter((line) => line.kind === "add" && !line.asset_id && (line.source === "auto" || line.row))
    .reduce((sum, line) => sum + line.amount_yen, 0);
  const subtractions = lines
    .filter((line) => line.kind === "subtract" && line.row)
    .reduce((sum, line) => sum + line.amount_yen, 0);
  const totalsReady = !unmappedExplicit;
  const mappedExplicit = lines.filter((line) => line.source === "explicit" && line.row);
  const schedule4 = totalsReady
    ? schedule4Amounts({
        starting,
        depreciationExcess,
        entertainmentExcess,
        mappedExplicit,
      })
    : null;
  const taxableIncome = schedule4?.get(ROW_TAXABLE_INCOME) ?? null;
  const retainedRollforward = {
    opening_yen: retainedRow!.opening_yen,
    net_income_yen: retainedRow!.net_income_yen,
    dividend_yen: retainedRow!.dividend_yen,
    capital_yen: retainedRow!.capital_yen,
    closing_yen: retainedRow!.closing_yen,
  };
  const corporate = profile.corporate_tax ?? {};
  const excluded = corporate.reduced_rate_excluded === true;
  const tax =
    taxableIncome == null
      ? emptyNationalTax()
      : nationalCorporateTax(
          taxableIncome,
          excluded ? null : reducedRateApplies(corporate),
          reducedBracketYen(profile.fiscal_year, start, asOf),
          excluded
        );
  const officialPending: string[] = [];
  if (!totalsReady) officialPending.push("unmapped_explicit_line");
  if (retainedRollforward.capital_yen !== 0) officialPending.push("capital_unmapped");
  if (taxableIncome != null && tax.corporate_tax_yen == null) {
    officialPending.push(excluded ? "reduced_rate_excluded" : "corporate_tax_unresolved");
  }
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    can_compute: true,
    starting_profit_yen: starting,
    lines,
    additions_yen: additions,
    subtractions_yen: subtractions,
    taxable_income_yen: taxableIncome,
    corporate_tax_yen: tax.corporate_tax_yen,
    retained_rollforward: retainedRollforward,
    official_lines: officialAnnexLines({
      starting,
      depreciationExcess,
      entertainmentExcess,
      mappedExplicit,
      totalsReady,
      schedule4,
      retained: retainedRollforward,
      tax,
    }),
    official_pending: officialPending,
    errors: [],
  };
}
