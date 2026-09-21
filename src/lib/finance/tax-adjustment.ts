/**
 * Corporate tax worksheet on NTA annex rows (令六・四・一以後終了事業年度分).
 * Does not post journals, switch opening balances, or file a return.
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

const AUTO_IDS = new Set(["depreciation_excess", "entertainment_excess"]);

/** 国税庁 別表四・別表五（一）・別表一次葉。令六・四・一以後終了事業年度分。 */
export const CORPORATE_TAX_FORM_EDITION = "reiwa6-apr1-end";

const FORM_BETSU_4 = "別表四";
const FORM_BETSU_5_1 = "別表五（一）";
const FORM_BETSU_1 = "別表一";
const FORM_BETSU_1_LEAF = "別表一次葉";
const ROW_CURRENT_PROFIT = "1";
const ROW_DEPRECIATION_EXCESS = "6";
const ROW_ENTERTAINMENT_EXCESS = "8";
const ROW_ADDITION_SUBTOTAL = "11";
const ROW_SUBTRACTION_SUBTOTAL = "22";
const ROW_PROVISIONAL_TOTAL = "23";
const ROW_TAXABLE_INCOME = "52";
/** 別表五（一）「繰越損益金（損は赤）」。令七様式でも同じ行。 */
const ROW_CARRYOVER_EARNINGS = "25";
const ROW_RETURN_INCOME = "1";
const ROW_CORPORATE_TAX = "2";
const ROW_REDUCED_BASE = "74";
const ROW_REDUCED_TAX = "77";
const ROW_RESIDUAL_BASE = "76";
const ROW_RESIDUAL_TAX = "79";
const CAPITAL_REDUCED_RATE_CEILING_YEN = 100_000_000;
const REDUCED_BRACKET_YEN = 8_000_000;
const REDUCED_RATE_BPS = 1_500;
const STANDARD_RATE_BPS = 2_320;
const THOUSAND_YEN = 1_000;
const HUNDRED_YEN = 100;
const SME_CATEGORY = "中小法人";

export type OfficialAnnexForm =
  typeof FORM_BETSU_4 | typeof FORM_BETSU_5_1 | typeof FORM_BETSU_1 | typeof FORM_BETSU_1_LEAF;

export type OfficialAnnexColumn = "1" | "2" | "3" | "4";

export type OfficialAnnexLine = {
  form: OfficialAnnexForm;
  row: string;
  col?: OfficialAnnexColumn;
  label: string;
  amount_yen: number;
};

export type TaxAdjustmentKind = "add" | "subtract";

export type TaxAdjustmentWorksheetLine = {
  id: string;
  kind: TaxAdjustmentKind;
  amount_yen: number;
  source: "auto" | "explicit";
  label: string;
  asset_id?: string;
  form?: typeof FORM_BETSU_4;
  row?: string;
};

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
  errors: string[];
};

type CorporateTaxProfile = {
  entertainment_account_code?: string;
  entertainment_cap_yen?: number;
  capital_stock?: number | "TBD";
  category?: string;
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
    errors,
  };
}

function truncateYen(amount: number, unit: number): number {
  return Math.floor(amount / unit) * unit;
}

function taxAtRate(baseYen: number, rateBps: number): number {
  return Math.floor((baseYen * rateBps) / 10_000);
}

function reducedRateApplies(profile: CorporateTaxProfile): boolean | null {
  if (typeof profile.capital_stock === "number") {
    return profile.capital_stock <= CAPITAL_REDUCED_RATE_CEILING_YEN;
  }
  if (profile.category === SME_CATEGORY) return true;
  return null;
}

function nationalCorporateTax(
  taxableIncomeYen: number,
  reducedRate: boolean | null
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
  if (reducedRate == null) {
    return {
      corporate_tax_yen: null,
      reduced_rate: null,
      reduced_base_yen: null,
      reduced_tax_yen: null,
      residual_base_yen: null,
      residual_tax_yen: null,
    };
  }
  if (!reducedRate) {
    const residualTax = truncateYen(taxAtRate(base, STANDARD_RATE_BPS), HUNDRED_YEN);
    return {
      corporate_tax_yen: residualTax,
      reduced_rate: false,
      reduced_base_yen: 0,
      reduced_tax_yen: 0,
      residual_base_yen: base,
      residual_tax_yen: residualTax,
    };
  }
  const reducedBase = Math.min(base, REDUCED_BRACKET_YEN);
  const residualBase = base - reducedBase;
  const reducedTax = taxAtRate(reducedBase, REDUCED_RATE_BPS);
  const residualTax = taxAtRate(residualBase, STANDARD_RATE_BPS);
  return {
    corporate_tax_yen: truncateYen(reducedTax + residualTax, HUNDRED_YEN),
    reduced_rate: true,
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
  additions: number;
  subtractions: number;
  taxableIncome: number;
  retained: RetainedRollforward;
  tax: NationalCorporateTax;
}): OfficialAnnexLine[] {
  const rows: OfficialAnnexLine[] = [
    {
      form: FORM_BETSU_4,
      row: ROW_CURRENT_PROFIT,
      label: "当期利益又は当期欠損の額",
      amount_yen: input.starting,
    },
  ];
  if (input.depreciationExcess > 0) {
    rows.push({
      form: FORM_BETSU_4,
      row: ROW_DEPRECIATION_EXCESS,
      label: "減価償却の償却超過額",
      amount_yen: input.depreciationExcess,
    });
  }
  if (input.entertainmentExcess > 0) {
    rows.push({
      form: FORM_BETSU_4,
      row: ROW_ENTERTAINMENT_EXCESS,
      label: "交際費等の損金不算入額",
      amount_yen: input.entertainmentExcess,
    });
  }
  const provisional = input.starting + input.additions - input.subtractions;
  rows.push(
    {
      form: FORM_BETSU_4,
      row: ROW_ADDITION_SUBTOTAL,
      label: "加算小計",
      amount_yen: input.additions,
    },
    {
      form: FORM_BETSU_4,
      row: ROW_SUBTRACTION_SUBTOTAL,
      label: "減算小計",
      amount_yen: input.subtractions,
    },
    { form: FORM_BETSU_4, row: ROW_PROVISIONAL_TOTAL, label: "仮計", amount_yen: provisional },
    {
      form: FORM_BETSU_4,
      row: ROW_TAXABLE_INCOME,
      label: "所得金額又は欠損金額",
      amount_yen: input.taxableIncome,
    }
  );
  const carryoverClosing =
    input.retained.opening_yen - input.retained.dividend_yen + input.retained.net_income_yen;
  rows.push(
    {
      form: FORM_BETSU_5_1,
      row: ROW_CARRYOVER_EARNINGS,
      col: "1",
      label: "繰越損益金・期首現在利益積立金額",
      amount_yen: input.retained.opening_yen,
    },
    {
      form: FORM_BETSU_5_1,
      row: ROW_CARRYOVER_EARNINGS,
      col: "2",
      label: "繰越損益金・当期の減",
      amount_yen: input.retained.dividend_yen,
    },
    {
      form: FORM_BETSU_5_1,
      row: ROW_CARRYOVER_EARNINGS,
      col: "3",
      label: "繰越損益金・当期の増",
      amount_yen: input.retained.net_income_yen,
    },
    {
      form: FORM_BETSU_5_1,
      row: ROW_CARRYOVER_EARNINGS,
      col: "4",
      label: "繰越損益金・差引翌期首現在利益積立金額",
      amount_yen: carryoverClosing,
    }
  );
  rows.push({
    form: FORM_BETSU_1,
    row: ROW_RETURN_INCOME,
    label: "所得金額又は欠損金額",
    amount_yen: input.taxableIncome,
  });
  if (input.tax.corporate_tax_yen != null) {
    rows.push({
      form: FORM_BETSU_1,
      row: ROW_CORPORATE_TAX,
      label: "所得の金額に対する法人税額",
      amount_yen: input.tax.corporate_tax_yen,
    });
  }
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
        label: "年800万円以下の金額",
        amount_yen: input.tax.reduced_base_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_REDUCED_TAX,
        label: "15%相当額",
        amount_yen: input.tax.reduced_tax_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_RESIDUAL_BASE,
        label: "その他の所得金額",
        amount_yen: input.tax.residual_base_yen,
      },
      {
        form: FORM_BETSU_1_LEAF,
        row: ROW_RESIDUAL_TAX,
        label: "23.2%相当額",
        amount_yen: input.tax.residual_tax_yen,
      }
    );
  }
  return rows;
}

export function evaluateTaxAdjustment(fiscalYear: string): TaxAdjustmentWorksheet {
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

  const profile = loadTaxProfile() as { corporate_tax?: CorporateTaxProfile };
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
        lines.push({
          id: line.id,
          kind: line.kind,
          amount_yen: line.amount_yen,
          source: "explicit",
          label: line.label,
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
    .filter((line) => line.kind === "add" && !line.asset_id)
    .reduce((sum, line) => sum + line.amount_yen, 0);
  const subtractions = lines
    .filter((line) => line.kind === "subtract")
    .reduce((sum, line) => sum + line.amount_yen, 0);
  const taxableIncome = starting + additions - subtractions;
  const retainedRollforward = {
    opening_yen: retainedRow!.opening_yen,
    net_income_yen: retainedRow!.net_income_yen,
    dividend_yen: retainedRow!.dividend_yen,
    capital_yen: retainedRow!.capital_yen,
    closing_yen: retainedRow!.closing_yen,
  };
  const tax = nationalCorporateTax(taxableIncome, reducedRateApplies(profile.corporate_tax ?? {}));
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
      additions,
      subtractions,
      taxableIncome,
      retained: retainedRollforward,
      tax,
    }),
    errors: [],
  };
}
