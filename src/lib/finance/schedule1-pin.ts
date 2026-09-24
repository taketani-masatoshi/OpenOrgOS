/**
 * 別表一 / 次葉 worked-example pin (あらまし印刷円) and empty-diff scoring.
 */
import {
  ARAMASHI_EXAMPLE_CORPORATE_TAX_YEN,
  ARAMASHI_EXAMPLE_INCOME_YEN,
  ARAMASHI_EXAMPLE_LOCAL_BASE_YEN,
  ARAMASHI_EXAMPLE_LOCAL_TAX_YEN,
  BETSU1_LOCAL_BASE_LABEL,
  BETSU1_LOCAL_TAX_LABEL,
  FORM_BETSU_1,
  FORM_BETSU_1_LEAF,
  HUNDRED_YEN,
  LEAF_LOCAL_BASE_LABEL,
  LEAF_LOCAL_TAX_LABEL,
  LEAF_REDUCED_BASE_LABEL,
  LEAF_REDUCED_TAX_LABEL,
  ROW_CORPORATE_TAX,
  ROW_LEAF_LOCAL_BASE,
  ROW_LEAF_LOCAL_TAX,
  ROW_LOCAL_CORPORATE_TAX,
  ROW_LOCAL_TAX_BASE,
  ROW_REDUCED_BASE,
  ROW_REDUCED_TAX,
  ROW_RETURN_INCOME,
  THOUSAND_YEN,
  truncateYen,
  type OfficialAnnexLine,
} from "./corporate-tax-annex.js";

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

