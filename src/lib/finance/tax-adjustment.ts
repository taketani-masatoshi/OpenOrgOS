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
import { assertJpTaxProfile } from "./indirect-tax/port.js";

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
const ROW_TAXABLE_INCOME = "52";
/** 別表五（一）「繰越損益金（損は赤）」。令七様式でも同じ行。 */
const ROW_CARRYOVER_EARNINGS = "25";
const ROW_RETURN_INCOME = "1";
const ROW_CORPORATE_TAX = "2";
/**
 * 別表一・地方法人税計算欄。令六・四・一。
 * https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2024/pdf/r01-01.pdf
 * https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2024/pdf/01-01-j.pdf
 */
const ROW_LOCAL_TAX_BASE = "28";
const ROW_LOCAL_CORPORATE_TAX = "31";
/** 別表一次葉。令六・四・一。年800万円以下・15%・その他・23.2%。 */
const ROW_REDUCED_BASE = "45";
const ROW_REDUCED_TAX = "48";
const ROW_RESIDUAL_BASE = "47";
const ROW_RESIDUAL_TAX = "50";
/** 別表一次葉・地方法人税額の計算。行51←別表一「28」、行53＝(51)×10.3%。 */
const ROW_LEAF_LOCAL_BASE = "51";
const ROW_LEAF_LOCAL_TAX = "53";
const LEAF_REDUCED_BASE_LABEL = "(1)のうち中小法人等の年800万円相当額以下の金額";
const LEAF_REDUCED_TAX_LABEL = "(45)の15％又は19％相当額";
const LEAF_RESIDUAL_BASE_LABEL = "その他の所得金額";
const LEAF_RESIDUAL_TAX_LABEL = "(47)の19％又は23.2％相当額";
const LEAF_LOCAL_BASE_LABEL = "所得の金額に対する法人税額";
const LEAF_LOCAL_TAX_LABEL = "(51)の10.3％相当額";
const BETSU1_LOCAL_BASE_LABEL = "所得の金額に対する法人税額";
const BETSU1_LOCAL_TAX_LABEL = "地方法人税額";

/**
 * 別表四の区分。国税庁 令六・四・一以後終了事業年度分（itiran2024/pdf/04.pdf）。
 * 行10・行21は記載の仕方の加算・減算の空欄。
 */
const SCHEDULE_4_LINES: readonly { row: string; label: string }[] = [
  { row: "1", label: "当期利益又は当期欠損の額" },
  { row: "2", label: "損金経理をした法人税及び地方法人税（附帯税を除く。）" },
  { row: "3", label: "損金経理をした道府県民税及び市町村民税" },
  { row: "4", label: "損金経理をした納税充当金" },
  {
    row: "5",
    label: "損金経理をした附帯税（利子税を除く。）、加算金、延滞金（延納分を除く。）及び過怠税",
  },
  { row: "6", label: "減価償却の償却超過額" },
  { row: "7", label: "役員給与の損金不算入額" },
  { row: "8", label: "交際費等の損金不算入額" },
  { row: "9", label: "通算法人に係る加算額" },
  { row: "10", label: "加算の空欄" },
  { row: "11", label: "小計" },
  { row: "12", label: "減価償却超過額の当期認容額" },
  { row: "13", label: "納税充当金から支出した事業税等の金額" },
  { row: "14", label: "受取配当等の益金不算入額" },
  { row: "15", label: "外国子会社から受ける剰余金の配当等の益金不算入額" },
  { row: "16", label: "受贈益の益金不算入額" },
  { row: "17", label: "適格現物分配に係る益金不算入額" },
  { row: "18", label: "法人税等の中間納付額及び過誤納に係る還付金額" },
  { row: "19", label: "所得税額等及び欠損金の繰戻しによる還付金額等" },
  { row: "20", label: "通算法人に係る減算額" },
  { row: "21", label: "減算の空欄" },
  { row: "22", label: "小計" },
  { row: "23", label: "仮計" },
  { row: "24", label: "対象純支払利子等の損金不算入額" },
  { row: "25", label: "超過利子額の損金算入額" },
  { row: "26", label: "仮計" },
  { row: "27", label: "寄附金の損金不算入額" },
  {
    row: "28",
    label:
      "沖縄の認定法人又は国家戦略特別区域における指定法人の所得の特別控除額又は要加算調整額の益金算入額",
  },
  { row: "29", label: "法人税額から控除される所得税額" },
  { row: "30", label: "税額控除の対象となる外国法人税の額" },
  { row: "31", label: "分配時調整外国税相当額及び外国関係会社等に係る控除対象所得税額等相当額" },
  { row: "32", label: "組合等損失額の損金不算入額又は組合等損失超過合計額の損金算入額" },
  {
    row: "33",
    label: "対外船舶運航事業者の日本船舶による収入金額に係る所得の金額の損金算入額又は益金算入額",
  },
  { row: "34", label: "合計" },
  { row: "35", label: "契約者配当の益金算入額" },
  {
    row: "36",
    label: "特定目的会社等の支払配当又は特定目的信託に係る受託法人の利益の分配等の損金算入額",
  },
  { row: "37", label: "中間申告における繰戻しによる還付に係る災害損失欠損金額の益金算入額" },
  {
    row: "38",
    label: "非適格合併又は残余財産の全部分配等による移転資産等の譲渡利益額又は譲渡損失額",
  },
  { row: "39", label: "差引計" },
  { row: "40", label: "更生欠損金又は民事再生等評価換えが行われる場合の再生等欠損金の損金算入額" },
  { row: "41", label: "通算対象欠損金額の損金算入額又は通算対象所得金額の益金算入額" },
  { row: "42", label: "当初配賦欠損金控除額の益金算入額" },
  { row: "43", label: "差引計" },
  { row: "44", label: "欠損金等の当期控除額" },
  { row: "45", label: "総計" },
  { row: "46", label: "新鉱床探鉱費又は海外新鉱床探鉱費の特別控除額" },
  { row: "47", label: "農業経営基盤強化準備金積立額の損金算入額" },
  { row: "48", label: "農用地等を取得した場合の圧縮額の損金算入額" },
  {
    row: "49",
    label:
      "関西国際空港用地整備準備金積立額、中部国際空港整備準備金積立額又は再投資等準備金積立額の損金算入額",
  },
  {
    row: "50",
    label:
      "特定事業活動として特別新事業開拓事業者の株式の取得をした場合の特別勘定繰入額の損金算入額又は特別勘定取崩額の益金算入額",
  },
  {
    row: "51",
    label: "残余財産の確定の日の属する事業年度に係る事業税及び特別法人事業税の損金算入額",
  },
  { row: "52", label: "所得金額又は欠損金額" },
];
const CAPITAL_REDUCED_RATE_CEILING_YEN = 100_000_000;
const REDUCED_BRACKET_YEN = 8_000_000;
const REDUCED_RATE_BPS = 1_500;
const STANDARD_RATE_BPS = 2_320;
const THOUSAND_YEN = 1_000;
const HUNDRED_YEN = 100;
const SME_CATEGORY = "中小法人";
const FULL_YEAR_MONTHS = 12;
const ROW_RETAINED_TOTAL = "31";
const EXPLICIT_ADD_ROWS = new Set(["2", "3", "4", "5", "7", "9", "10"]);
/** 行12–21は減算小計へ。行44・47は総計・所得計算の控除行（令和6年記載例）。 */
const EXPLICIT_SUBTRACT_ROWS = new Set([
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "44",
  "47",
]);
const RESERVED_EXPLICIT_ROWS = new Set([ROW_DEPRECIATION_EXCESS, ROW_ENTERTAINMENT_EXCESS]);

/** 令和6年版「申告書作成上の留意点」別表四記載例の行52所得。刊行の 50 のみ。 */
export const REIWA6_SCHEDULE4_EXAMPLE_INCOME_YEN = 50;

/**
 * 国税庁「法人税のあらましと申告の手引」設例の印刷円（別表一・次葉）。
 * https://www.nta.go.jp/publication/pamph/hojin/aramashi2025/pdf/01-05.pdf
 * 行番号は令六・四・一 別表一／別表一次葉（別表四の行52所得50とは別）。
 */
export const ARAMASHI_EXAMPLE_INCOME_YEN = 688_750;
export const ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN = 103_200;
export const ARAMASHI_EXAMPLE_LOCAL_BASE_YEN = 103_000;
export const ARAMASHI_EXAMPLE_LOCAL_TAX_YEN = 10_609;

export type OfficialAnnexForm =
  typeof FORM_BETSU_4 | typeof FORM_BETSU_5_1 | typeof FORM_BETSU_1 | typeof FORM_BETSU_1_LEAF;

export type OfficialAnnexColumn = "1" | "2" | "3" | "4";

export type OfficialAnnexLine = {
  form: OfficialAnnexForm;
  row: string;
  col?: OfficialAnnexColumn;
  label: string;
  amount_yen: number;
  blank_reason?: "該当なし";
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

function truncateYen(amount: number, unit: number): number {
  return Math.floor(amount / unit) * unit;
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

function betsu4(row: string, label: string, amountYen: number): OfficialAnnexLine {
  const line: OfficialAnnexLine = {
    form: FORM_BETSU_4,
    row,
    col: "1",
    label,
    amount_yen: amountYen,
  };
  if ((row === "46" || row === "49") && amountYen === 0) {
    line.blank_reason = "該当なし";
  }
  return line;
}

const LOCAL_CORPORATE_RATE_NUMERATOR = 103;
const LOCAL_CORPORATE_RATE_DENOMINATOR = 1000;

/**
 * 別表一次葉「51」＝別表一「28」の千円未満切捨て。
 * https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2024/pdf/r01-01.pdf
 */
export function localCorporateTaxBaseYen(corporateTaxYen: number): number {
  return truncateYen(Math.max(0, corporateTaxYen), THOUSAND_YEN);
}

/**
 * 別表一次葉「53」／別表一「31」＝(51)の10.3%（地方法人税法第10条）。
 * 百円切捨ては差引欄の別計算。
 */
export function localCorporateTaxAmountYen(corporateTaxYen: number): number {
  const base = localCorporateTaxBaseYen(corporateTaxYen);
  return Math.floor(
    (base * LOCAL_CORPORATE_RATE_NUMERATOR) / LOCAL_CORPORATE_RATE_DENOMINATOR,
  );
}

/** 差引地方法人税額。国税通則法119条に合わせ百円未満を切り捨てる。 */
export function localCorporateTaxYen(corporateTaxYen: number): number {
  return truncateYen(localCorporateTaxAmountYen(corporateTaxYen), HUNDRED_YEN);
}

/**
 * 令和6年版「申告書作成上の留意点」別表四の記載例。
 * 当期利益150、準備金の加算50、欠損金の控除100、準備金の損金算入50。所得は50。
 */
export function schedule4AgriculturalReserveExample(): OfficialAnnexLine[] {
  const amounts = schedule4Amounts({
    starting: 150,
    depreciationExcess: 0,
    entertainmentExcess: 0,
    mappedExplicit: [
      {
        id: "agri-reserve-add",
        kind: "add",
        amount_yen: 50,
        source: "explicit",
        label: "損金経理をした農業経営基盤強化準備金積立額",
        form: FORM_BETSU_4,
        row: "10",
      },
      {
        id: "loss-deduction",
        kind: "subtract",
        amount_yen: 100,
        source: "explicit",
        label: "欠損金等の当期控除額",
        form: FORM_BETSU_4,
        row: "44",
      },
      {
        id: "agri-reserve-sub",
        kind: "subtract",
        amount_yen: 50,
        source: "explicit",
        label: "農業経営基盤強化準備金積立額の損金算入額",
        form: FORM_BETSU_4,
        row: "47",
      },
    ],
  });
  return SCHEDULE_4_LINES.map((line) =>
    betsu4(line.row, line.label, schedule4Amount(amounts, line.row)),
  );
}

/**
 * 12 only when rows 46 and 49 stay on the sheet with 該当なし at 0 yen,
 * and line 52 equals the printed example income (not a label-only pin).
 */
export function scoreSchedule4WorkedExample(
  lines: readonly OfficialAnnexLine[],
  exampleIncomeYen: number | null,
): 0 | 12 {
  const sheet = lines.filter((line) => line.form === FORM_BETSU_4);
  const row46 = sheet.find((line) => line.row === "46");
  const row49 = sheet.find((line) => line.row === "49");
  const row52 = sheet.find((line) => line.row === "52");
  if (!row46 || !row49 || !row52) return 0;
  if (row46.amount_yen === 0 && row46.blank_reason !== "該当なし") return 0;
  if (row49.amount_yen === 0 && row49.blank_reason !== "該当なし") return 0;
  if (exampleIncomeYen == null || row52.amount_yen !== exampleIncomeYen) return 0;
  return 12;
}

function schedule4OfficialKey(line: OfficialAnnexLine): string {
  return `${line.row}\t${line.label}\t${line.amount_yen}\t${line.blank_reason ?? ""}`;
}

/**
 * 申告投影の別表四と令和6年記載例ピンの差分。空なら法定照合の証拠になる。
 * 行ラベルだけの自己ピンはここで空にならない。
 */
export function diffSchedule4OfficialExample(
  product: readonly OfficialAnnexLine[],
  official: readonly OfficialAnnexLine[] = schedule4AgriculturalReserveExample(),
): string[] {
  const productSheet = product.filter((line) => line.form === FORM_BETSU_4);
  const officialSheet = official.filter((line) => line.form === FORM_BETSU_4);
  const productKeys = new Set(productSheet.map(schedule4OfficialKey));
  const officialKeys = new Set(officialSheet.map(schedule4OfficialKey));
  const diff: string[] = [];
  const productRows = productSheet.map((line) => line.row);
  if (new Set(productRows).size !== productRows.length) diff.push("duplicate 別表四");
  for (const line of officialSheet) {
    if (!productKeys.has(schedule4OfficialKey(line))) {
      diff.push(`missing ${line.row} ${line.label} ${line.amount_yen}`);
    }
  }
  for (const line of productSheet) {
    if (!officialKeys.has(schedule4OfficialKey(line))) {
      diff.push(`extra ${line.row} ${line.label} ${line.amount_yen}`);
    }
  }
  return diff;
}

/** 申告投影が令和6年記載例と空差分で、記載例スコアが 12 のときだけ法定充足。 */
export function schedule4StatutoryMet(officialLines: readonly OfficialAnnexLine[]): boolean {
  return (
    diffSchedule4OfficialExample(officialLines).length === 0 &&
    scoreSchedule4WorkedExample(officialLines, REIWA6_SCHEDULE4_EXAMPLE_INCOME_YEN) === 12
  );
}

/**
 * あらまし設例の法人税・地方法人税を公式行へ投影する。
 * 円は刊行物のみ。別表四行52の所得50は含めない。
 */
export function schedule1NationalLocalExample(): OfficialAnnexLine[] {
  return [
    {
      form: FORM_BETSU_1,
      row: ROW_RETURN_INCOME,
      label: "所得金額又は欠損金額",
      amount_yen: ARAMASHI_EXAMPLE_INCOME_YEN,
    },
    {
      form: FORM_BETSU_1,
      row: ROW_CORPORATE_TAX,
      label: "所得の金額に対する法人税額",
      amount_yen: ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN,
    },
    {
      form: FORM_BETSU_1,
      row: ROW_LOCAL_TAX_BASE,
      label: BETSU1_LOCAL_BASE_LABEL,
      amount_yen: ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN,
    },
    {
      form: FORM_BETSU_1,
      row: ROW_LOCAL_CORPORATE_TAX,
      label: BETSU1_LOCAL_TAX_LABEL,
      amount_yen: ARAMASHI_EXAMPLE_LOCAL_TAX_YEN,
    },
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_REDUCED_BASE,
      label: LEAF_REDUCED_BASE_LABEL,
      amount_yen: truncateYen(ARAMASHI_EXAMPLE_INCOME_YEN, THOUSAND_YEN),
    },
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_REDUCED_TAX,
      label: LEAF_REDUCED_TAX_LABEL,
      amount_yen: ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN,
    },
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_LEAF_LOCAL_BASE,
      label: LEAF_LOCAL_BASE_LABEL,
      amount_yen: ARAMASHI_EXAMPLE_LOCAL_BASE_YEN,
    },
    {
      form: FORM_BETSU_1_LEAF,
      row: ROW_LEAF_LOCAL_TAX,
      label: LEAF_LOCAL_TAX_LABEL,
      amount_yen: ARAMASHI_EXAMPLE_LOCAL_TAX_YEN,
    },
  ];
}

function schedule1OfficialKey(line: OfficialAnnexLine): string {
  return `${line.form}\t${line.row}\t${line.label}\t${line.amount_yen}`;
}

function isSchedule1NationalLocalLine(line: OfficialAnnexLine): boolean {
  if (line.form === FORM_BETSU_1) {
    return (
      line.row === ROW_RETURN_INCOME ||
      line.row === ROW_CORPORATE_TAX ||
      line.row === ROW_LOCAL_TAX_BASE ||
      line.row === ROW_LOCAL_CORPORATE_TAX
    );
  }
  if (line.form === FORM_BETSU_1_LEAF) {
    return (
      line.row === ROW_REDUCED_BASE ||
      line.row === ROW_REDUCED_TAX ||
      line.row === ROW_LEAF_LOCAL_BASE ||
      line.row === ROW_LEAF_LOCAL_TAX
    );
  }
  return false;
}

/**
 * 投影と外部ピン（刊行円）の差分。空なら法人税・地方法人税の双方が公式行＋円で一致。
 * 行ラベルだけの自己ピンは金額不一致で空にならない。
 */
export function diffSchedule1NationalLocalExample(
  product: readonly OfficialAnnexLine[],
  official: readonly OfficialAnnexLine[],
): string[] {
  if (official.length === 0) return ["empty pin"];
  const productSheet = product.filter(isSchedule1NationalLocalLine);
  const officialSheet = official.filter(isSchedule1NationalLocalLine);
  const productKeys = new Set(productSheet.map(schedule1OfficialKey));
  const officialKeys = new Set(officialSheet.map(schedule1OfficialKey));
  const diff: string[] = [];
  const productRows = productSheet.map((line) => `${line.form}:${line.row}`);
  if (new Set(productRows).size !== productRows.length) diff.push("duplicate 別表一/次葉");
  for (const line of officialSheet) {
    if (!productKeys.has(schedule1OfficialKey(line))) {
      diff.push(`missing ${line.form} ${line.row} ${line.label} ${line.amount_yen}`);
    }
  }
  for (const line of productSheet) {
    if (!officialKeys.has(schedule1OfficialKey(line))) {
      diff.push(`extra ${line.form} ${line.row} ${line.label} ${line.amount_yen}`);
    }
  }
  return diff;
}

/**
 * 12 only when the pin includes both 別表一「2」and「31」with matching yen,
 * and the product diff against that pin is empty.
 */
export function scoreNationalLocalWorkedExample(
  product: readonly OfficialAnnexLine[],
  pinned: readonly OfficialAnnexLine[],
): 0 | 12 {
  const hasNational = pinned.some(
    (line) =>
      line.form === FORM_BETSU_1 &&
      line.row === ROW_CORPORATE_TAX &&
      line.amount_yen === ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN,
  );
  const hasLocal = pinned.some(
    (line) =>
      line.form === FORM_BETSU_1 &&
      line.row === ROW_LOCAL_CORPORATE_TAX &&
      line.amount_yen === ARAMASHI_EXAMPLE_LOCAL_TAX_YEN,
  );
  if (!hasNational || !hasLocal) return 0;
  if (pinned.some((line) => line.row === "地方法人税")) return 0;
  if (diffSchedule1NationalLocalExample(product, pinned).length !== 0) return 0;
  return 12;
}

/** 法人税と地方法人税の双方が公式行番号＋刊行円の空差分のときだけ充足。 */
export function corporateNationalLocalStatutoryMet(
  product: readonly OfficialAnnexLine[],
  pinned: readonly OfficialAnnexLine[],
): boolean {
  return scoreNationalLocalWorkedExample(product, pinned) === 12;
}

function schedule4Amount(amounts: Map<string, number>, row: string): number {
  return amounts.get(row) ?? 0;
}

/** 行23の仮計から行24–51を通り、行52を別計算する。未計算の法定行は 0。 */
function schedule4Amounts(input: {
  starting: number;
  depreciationExcess: number;
  entertainmentExcess: number;
  mappedExplicit: TaxAdjustmentWorksheetLine[];
}): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const line of SCHEDULE_4_LINES) amounts.set(line.row, 0);
  amounts.set("1", input.starting);
  amounts.set("6", input.depreciationExcess);
  amounts.set("8", input.entertainmentExcess);
  for (const line of input.mappedExplicit) {
    if (!line.row) continue;
    amounts.set(line.row, schedule4Amount(amounts, line.row) + line.amount_yen);
  }
  const additionRows = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const subtractionRows = ["12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];
  const additions = additionRows.reduce((sum, row) => sum + schedule4Amount(amounts, row), 0);
  const subtractions = subtractionRows.reduce((sum, row) => sum + schedule4Amount(amounts, row), 0);
  amounts.set("11", additions);
  amounts.set("22", subtractions);
  const provisional = schedule4Amount(amounts, "1") + additions - subtractions;
  amounts.set("23", provisional);
  const afterInterest =
    provisional + schedule4Amount(amounts, "24") - schedule4Amount(amounts, "25");
  amounts.set("26", afterInterest);
  const combined =
    afterInterest +
    schedule4Amount(amounts, "27") +
    schedule4Amount(amounts, "28") +
    schedule4Amount(amounts, "29") +
    schedule4Amount(amounts, "30") +
    schedule4Amount(amounts, "31") +
    schedule4Amount(amounts, "32") +
    schedule4Amount(amounts, "33");
  amounts.set("34", combined);
  const afterDistribution =
    combined +
    schedule4Amount(amounts, "35") -
    schedule4Amount(amounts, "36") +
    schedule4Amount(amounts, "37") +
    schedule4Amount(amounts, "38");
  amounts.set("39", afterDistribution);
  const afterGroup =
    afterDistribution -
    schedule4Amount(amounts, "40") +
    schedule4Amount(amounts, "41") +
    schedule4Amount(amounts, "42");
  amounts.set("43", afterGroup);
  const total = afterGroup - schedule4Amount(amounts, "44");
  amounts.set("45", total);
  const income =
    total -
    schedule4Amount(amounts, "46") -
    schedule4Amount(amounts, "47") -
    schedule4Amount(amounts, "48") -
    schedule4Amount(amounts, "49") +
    schedule4Amount(amounts, "50") -
    schedule4Amount(amounts, "51");
  amounts.set("52", income);
  return amounts;
}

function betsu5(
  row: string,
  col: OfficialAnnexColumn,
  label: string,
  amountYen: number
): OfficialAnnexLine {
  return { form: FORM_BETSU_5_1, row, col, label, amount_yen: amountYen };
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
