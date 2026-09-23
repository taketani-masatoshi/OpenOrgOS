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
  CAPITAL_REDUCED_RATE_CEILING_YEN,
  EXPLICIT_ADD_ROWS,
  EXPLICIT_SUBTRACT_ROWS,
  FORM_BETSU_1,
  FORM_BETSU_1_LEAF,
  FORM_BETSU_4,
  FORM_BETSU_5_1,
  FULL_YEAR_MONTHS,
  HUNDRED_YEN,
  LEAF_LOCAL_BASE_LABEL,
  LEAF_LOCAL_TAX_LABEL,
  LEAF_REDUCED_BASE_LABEL,
  LEAF_REDUCED_TAX_LABEL,
  LEAF_RESIDUAL_BASE_LABEL,
  LEAF_RESIDUAL_TAX_LABEL,
  BETSU1_LOCAL_BASE_LABEL,
  BETSU1_LOCAL_TAX_LABEL,
  REDUCED_BRACKET_YEN,
  REDUCED_RATE_BPS,
  RESERVED_EXPLICIT_ROWS,
  ROW_CARRYOVER_EARNINGS,
  ROW_CORPORATE_TAX,
  ROW_CURRENT_PROFIT,
  ROW_DEPRECIATION_EXCESS,
  ROW_ENTERTAINMENT_EXCESS,
  ROW_LEAF_LOCAL_BASE,
  ROW_LEAF_LOCAL_TAX,
  ROW_LOCAL_CORPORATE_TAX,
  ROW_LOCAL_TAX_BASE,
  ROW_REDUCED_BASE,
  ROW_REDUCED_TAX,
  ROW_RESIDUAL_BASE,
  ROW_RESIDUAL_TAX,
  ROW_RETAINED_TOTAL,
  ROW_RETURN_INCOME,
  ROW_TAXABLE_INCOME,
  SCHEDULE_4_LINES,
  SME_CATEGORY,
  STANDARD_RATE_BPS,
  THOUSAND_YEN,
  truncateYen,
  type OfficialAnnexColumn,
  type OfficialAnnexLine,
  type TaxAdjustmentKind,
  type TaxAdjustmentWorksheetLine,
} from "./corporate-tax-annex.js";
import {
  betsu4,
  schedule4Amount,
  schedule4Amounts,
} from "./schedule4-pin.js";
import {
  localCorporateTaxAmountYen,
  localCorporateTaxBaseYen,
} from "./schedule1-pin.js";

function betsu5(
  row: string,
  col: OfficialAnnexColumn,
  label: string,
  amountYen: number,
): OfficialAnnexLine {
  return { form: FORM_BETSU_5_1, row, col, label, amount_yen: amountYen };
}

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

type RetainedRollforward = {
  opening_yen: number;
  net_income_yen: number;
  dividend_yen: number;
  capital_yen: number;
  closing_yen: number;
};

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

type CorporateTaxProfile = {
  entertainment_account_code?: string;
  entertainment_cap_yen?: number;
  capital_stock?: number | "TBD";
  category?: string;
  reduced_rate_excluded?: boolean;
};

type ProfileFiscalYear = {
  period_from?: string;
  period_to?: string;
};

type NationalCorporateTax = {
  corporate_tax_yen: number | null;
  reduced_rate: boolean | null;
  reduced_base_yen: number | null;
  reduced_tax_yen: number | null;
  residual_base_yen: number | null;
  residual_tax_yen: number | null;
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

function taxAtRate(baseYen: number, rateBps: number): number {
  return Math.floor((baseYen * rateBps) / 10_000);
}

function calendarMonths(fromIso: string, toIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) return null;
  if (toIso < fromIso) return null;
  const [startYear, startMonth, startDay] = fromIso.split("-").map(Number);
  const [endYear, endMonth, endDay] = toIso.split("-").map(Number);
  if (
    startYear == null ||
    startMonth == null ||
    startDay == null ||
    endYear == null ||
    endMonth == null ||
    endDay == null
  ) {
    return null;
  }
  let months = (endYear - startYear) * 12 + (endMonth - startMonth);
  if (endDay >= startDay) months += 1;
  if (months < 1) return null;
  return Math.min(months, FULL_YEAR_MONTHS);
}

function reducedBracketYen(
  fiscalYear: ProfileFiscalYear | undefined,
  companyStart: string,
  companyEnd: string
): number {
  const declared =
    fiscalYear?.period_from && fiscalYear.period_to
      ? calendarMonths(fiscalYear.period_from, fiscalYear.period_to)
      : null;
  const months = declared ?? calendarMonths(companyStart, companyEnd) ?? FULL_YEAR_MONTHS;
  return Math.floor((REDUCED_BRACKET_YEN * months) / FULL_YEAR_MONTHS);
}

function explicitRowAllowed(kind: TaxAdjustmentKind, formRow: string | undefined): boolean {
  if (!formRow) return false;
  if (kind === "add") return EXPLICIT_ADD_ROWS.has(formRow);
  return EXPLICIT_SUBTRACT_ROWS.has(formRow);
}

function emptyNationalTax(): NationalCorporateTax {
  return {
    corporate_tax_yen: null,
    reduced_rate: null,
    reduced_base_yen: null,
    reduced_tax_yen: null,
    residual_base_yen: null,
    residual_tax_yen: null,
  };
}

function reducedRateApplies(profile: CorporateTaxProfile): boolean | null {
  if (profile.reduced_rate_excluded) return null;
  if (typeof profile.capital_stock === "number") {
    return profile.capital_stock <= CAPITAL_REDUCED_RATE_CEILING_YEN;
  }
  if (profile.category === SME_CATEGORY) return true;
  return null;
}

function nationalCorporateTax(
  taxableIncomeYen: number,
  reducedRate: boolean | null,
  bracketYen: number,
  excluded: boolean
): NationalCorporateTax {
  const base = truncateYen(Math.max(0, taxableIncomeYen), THOUSAND_YEN);
  if (base === 0) {
    return {
      corporate_tax_yen: 0,
      reduced_rate: reducedRate,
      reduced_base_yen: 0,
      reduced_tax_yen: 0,
      residual_base_yen: 0,
      residual_tax_yen: 0,
    };
  }
  if (excluded || reducedRate == null) return emptyNationalTax();
  const reducedBase = reducedRate ? Math.min(base, bracketYen) : 0;
  const residualBase = base - reducedBase;
  const reducedRateBps = reducedRate ? REDUCED_RATE_BPS : STANDARD_RATE_BPS;
  let reducedTax = reducedRate ? taxAtRate(reducedBase, reducedRateBps) : 0;
  let residualTax = taxAtRate(residualBase, STANDARD_RATE_BPS);
  const corporateTax = truncateYen(reducedTax + residualTax, HUNDRED_YEN);
  const discarded = reducedTax + residualTax - corporateTax;
  if (discarded > 0 && residualTax >= discarded) residualTax -= discarded;
  else if (discarded > 0) {
    reducedTax -= discarded - residualTax;
    residualTax = 0;
  }
  return {
    corporate_tax_yen: corporateTax,
    reduced_rate: reducedRate,
    reduced_base_yen: reducedBase,
    reduced_tax_yen: reducedTax,
    residual_base_yen: residualBase,
    residual_tax_yen: residualTax,
  };
}
function officialAnnexLines(input: {
  starting: number;
  depreciationExcess: number;
  entertainmentExcess: number;
  mappedExplicit: TaxAdjustmentWorksheetLine[];
  totalsReady: boolean;
  schedule4: Map<string, number> | null;
  retained: RetainedRollforward;
  tax: NationalCorporateTax;
}): OfficialAnnexLine[] {
  const rows: OfficialAnnexLine[] = [];
  if (input.schedule4) {
    for (const line of SCHEDULE_4_LINES) {
      rows.push(betsu4(line.row, line.label, schedule4Amount(input.schedule4, line.row)));
    }
  } else {
    rows.push(betsu4(ROW_CURRENT_PROFIT, "当期利益又は当期欠損の額", input.starting));
    if (input.depreciationExcess > 0) {
      rows.push(betsu4(ROW_DEPRECIATION_EXCESS, "減価償却の償却超過額", input.depreciationExcess));
    }
    if (input.entertainmentExcess > 0) {
      rows.push(
        betsu4(ROW_ENTERTAINMENT_EXCESS, "交際費等の損金不算入額", input.entertainmentExcess)
      );
    }
    for (const line of input.mappedExplicit) {
      if (!line.row) continue;
      rows.push(betsu4(line.row, line.label, line.amount_yen));
    }
  }
  if (input.retained.capital_yen === 0) {
    const opening = input.retained.opening_yen;
    const decrease = input.retained.dividend_yen;
    const increase = input.retained.net_income_yen;
    const closing = opening - decrease + increase;
    rows.push(
      betsu5(ROW_CARRYOVER_EARNINGS, "1", "繰越損益金・期首現在利益積立金額", opening),
      betsu5(ROW_CARRYOVER_EARNINGS, "2", "繰越損益金・当期の減", decrease),
      betsu5(ROW_CARRYOVER_EARNINGS, "3", "繰越損益金・当期の増", increase),
      betsu5(ROW_CARRYOVER_EARNINGS, "4", "繰越損益金・差引翌期首現在利益積立金額", closing),
      betsu5(ROW_RETAINED_TOTAL, "1", "差引合計額・期首現在利益積立金額", opening),
      betsu5(ROW_RETAINED_TOTAL, "2", "差引合計額・当期の減", decrease),
      betsu5(ROW_RETAINED_TOTAL, "3", "差引合計額・当期の増", increase),
      betsu5(ROW_RETAINED_TOTAL, "4", "差引合計額・差引翌期首現在利益積立金額", closing)
    );
  }
  if (!input.totalsReady || input.tax.corporate_tax_yen == null || input.schedule4 == null)
    return rows;
  const income = schedule4Amount(input.schedule4, ROW_TAXABLE_INCOME);
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_RETURN_INCOME,
    label: "所得金額又は欠損金額",
    amount_yen: income,
  });
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_CORPORATE_TAX,
    label: "所得の金額に対する法人税額",
    amount_yen: input.tax.corporate_tax_yen,
  });
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_LOCAL_TAX_BASE,
    label: BETSU1_LOCAL_BASE_LABEL,
    amount_yen: input.tax.corporate_tax_yen,
  });
  const localAmount = localCorporateTaxAmountYen(input.tax.corporate_tax_yen);
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_LOCAL_CORPORATE_TAX,
    label: BETSU1_LOCAL_TAX_LABEL,
    amount_yen: localAmount,
  });
  if (
    input.tax.reduced_rate === true &&
    input.tax.reduced_base_yen != null &&
    input.tax.reduced_base_yen > 0 &&
    input.tax.reduced_tax_yen != null &&
    input.tax.residual_base_yen != null &&
    input.tax.residual_tax_yen != null
  ) {
    rows.push(
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_REDUCED_BASE,
        label: LEAF_REDUCED_BASE_LABEL,
        amount_yen: input.tax.reduced_base_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_REDUCED_TAX,
        label: LEAF_REDUCED_TAX_LABEL,
        amount_yen: input.tax.reduced_tax_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_RESIDUAL_BASE,
        label: LEAF_RESIDUAL_BASE_LABEL,
        amount_yen: input.tax.residual_base_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_RESIDUAL_TAX,
        label: LEAF_RESIDUAL_TAX_LABEL,
        amount_yen: input.tax.residual_tax_yen,
      }
    );
  }
  rows.push(
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_LEAF_LOCAL_BASE,
      label: LEAF_LOCAL_BASE_LABEL,
      amount_yen: localCorporateTaxBaseYen(input.tax.corporate_tax_yen),
    },
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_LEAF_LOCAL_TAX,
      label: LEAF_LOCAL_TAX_LABEL,
      amount_yen: localAmount,
    }
  );
  return rows;
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
