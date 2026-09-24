/**
 * All-or-nothing scores for the sole-prop core.
 * Callers pass the external pin. This module does not read fixture files.
 */

export type BlueReturnRoleLine = {
  print: string;
  role: string;
};

export type BlueReturnLinePin = {
  opening_inventory_print: string;
  taxes_and_dues_print: string;
  expense_prints: string[];
  lines: BlueReturnRoleLine[];
  reject: BlueReturnRoleLine[];
};

/**
 * 貸借対照表作成の手引き。期末の元入金は期首と同額。
 * 翌期首は期末＋青色申告特別控除前の所得＋事業主借－事業主貸。
 */
export function nextOpeningCapitalYen(input: {
  closingCapitalYen: number;
  incomeBeforeBlueYen: number;
  ownerAdvancesYen: number;
  ownerDrawingsYen: number;
}): number {
  return (
    input.closingCapitalYen +
    input.incomeBeforeBlueYen +
    input.ownerAdvancesYen -
    input.ownerDrawingsYen
  );
}

const HANDGUIDE_EXPENSES: { print: string; label: string }[] = [
  { print: "⑧", label: "租税公課" },
  { print: "⑨", label: "荷造運賃" },
  { print: "⑩", label: "水道光熱費" },
  { print: "⑪", label: "旅費交通費" },
  { print: "⑫", label: "通信費" },
  { print: "⑬", label: "広告宣伝費" },
  { print: "⑭", label: "接待交際費" },
  { print: "⑮", label: "損害保険料" },
  { print: "⑯", label: "修繕費" },
  { print: "⑰", label: "消耗品費" },
  { print: "⑱", label: "減価償却費" },
  { print: "⑲", label: "福利厚生費" },
  { print: "⑳", label: "給料賃金" },
  { print: "㉑", label: "外注工賃" },
  { print: "㉒", label: "利子割引料" },
  { print: "㉓", label: "地代家賃" },
  { print: "㉔", label: "貸倒金" },
  { print: "㉕", label: "" },
  { print: "㉖", label: "" },
  { print: "㉗", label: "" },
  { print: "㉘", label: "" },
  { print: "㉙", label: "" },
  { print: "㉚", label: "雑費" },
];

export type BlueReturnAmountLine = {
  print: string;
  label: string;
  amount_yen: number;
};

/** 手引きの損益計算書の科目金額から、青色申告決算書の⑧〜㉛と所得を出す。 */
export function blueReturnFromAccounts(
  accounts: Readonly<Record<string, number>>,
): BlueReturnAmountLine[] {
  const expenses = HANDGUIDE_EXPENSES.map((line) => ({
    print: line.print,
    label: line.label,
    amount_yen: line.label === "" ? 0 : (accounts[line.label] ?? 0),
  }));
  const expenseTotal = expenses.reduce((sum, line) => sum + line.amount_yen, 0);
  const sales = accounts["売上"] ?? 0;
  const purchases = accounts["仕入"] ?? 0;
  const reversal = accounts["貸倒引当金繰戻額"] ?? 0;
  const provision = accounts["貸倒引当金繰入額"] ?? 0;
  const familyWages = accounts["専従者給与"] ?? 0;
  const income = sales - purchases - expenseTotal + reversal - provision - familyWages;
  return [
    { print: "①", label: "売上", amount_yen: sales },
    { print: "③", label: "仕入", amount_yen: purchases },
    ...expenses,
    { print: "㉛", label: "経費計", amount_yen: expenseTotal },
    { print: "専従者給与", label: "専従者給与", amount_yen: familyWages },
    { print: "所得", label: "青色申告特別控除前の所得金額", amount_yen: income },
  ];
}

export function scoreBlueReturnExample(
  actual: readonly BlueReturnAmountLine[],
  printed: readonly BlueReturnAmountLine[],
): 0 | 22 {
  if (actual.length === 0 || actual.length !== printed.length) return 0;
  for (let index = 0; index < printed.length; index += 1) {
    const got = actual[index];
    const expected = printed[index];
    if (!got || !expected) return 0;
    if (got.print !== expected.print || got.label !== expected.label) return 0;
    if (got.amount_yen !== expected.amount_yen) return 0;
  }
  return 22;
}

export function scoreOwnerCapital(input: {
  openingYen: number;
  closingYen: number;
  incomeYen: number;
  capitalTransferYen: number;
  incomeIsSeparateLine: boolean;
}): 0 | 18 {
  if (!input.incomeIsSeparateLine) return 0;
  if (input.openingYen !== input.closingYen) return 0;
  if (input.incomeYen !== 0 && input.capitalTransferYen === input.incomeYen) return 0;
  if (input.capitalTransferYen !== 0) return 0;
  return 18;
}

/**
 * Role / print-mark layout only. Not statutory sufficiency for 青色申告決算書 —
 * that requires an empty official page yen diff (see sole-prop-blue-return-page).
 */
export function scoreBlueReturnLines(
  actual: BlueReturnRoleLine[],
  pin: BlueReturnLinePin,
): 0 | 22 {
  const roleAt = (print: string) => actual.find((line) => line.print === print)?.role;
  if (roleAt(pin.opening_inventory_print) !== "opening_inventory") return 0;
  if (roleAt(pin.taxes_and_dues_print) !== "taxes_and_dues") return 0;
  for (const banned of pin.reject) {
    if (actual.some((line) => line.print === banned.print && line.role === banned.role)) return 0;
  }
  for (const expected of pin.lines) {
    if (roleAt(expected.print) !== expected.role) return 0;
  }
  const expenseRoles = new Set(["expense", "taxes_and_dues", "depreciation", "wages"]);
  const expensePrints = actual
    .filter((line) => expenseRoles.has(line.role))
    .map((line) => line.print);
  if (expensePrints.length !== pin.expense_prints.length) return 0;
  for (let index = 0; index < pin.expense_prints.length; index += 1) {
    if (expensePrints[index] !== pin.expense_prints[index]) return 0;
  }
  return 22;
}

export type IncomeTaxReturnLine = {
  id: string;
  label?: string;
  amount_yen: number | null;
};

export type BasicDeductionBand = {
  max_income_yen: number | null;
  deduction_yen: number;
};

export function basicDeductionFromBands(
  totalIncomeYen: number,
  bands: BasicDeductionBand[],
): number | null {
  if (bands.length === 0) return null;
  for (const band of bands) {
    if (band.max_income_yen == null || totalIncomeYen <= band.max_income_yen) {
      return band.deduction_yen;
    }
  }
  return null;
}

/** Official return-form line id + printed yen (e.g. No.1199). Caller supplies the pin. */
export type IncomeTaxYenPin = {
  id: string;
  amount_yen: number;
};

export type IncomeTaxYenDiffLine = IncomeTaxYenPin & { actual_yen: number | null };

/** Diff projected return lines against the caller's official yen pin. */
export function incomeTaxReturnYenDiff(
  lines: readonly IncomeTaxReturnLine[],
  pinned: readonly IncomeTaxYenPin[],
): IncomeTaxYenDiffLine[] {
  const byId = new Map(lines.map((line) => [line.id, line.amount_yen]));
  const diff: IncomeTaxYenDiffLine[] = [];
  for (const pin of pinned) {
    const actual = byId.get(pin.id);
    if (actual === undefined || actual !== pin.amount_yen) {
      diff.push({ ...pin, actual_yen: actual ?? null });
    }
  }
  return diff;
}

/**
 * 20 only when every pinned official yen line matches the projected return.
 * Rate-band / table self-match alone is not statutory marks — empty pin → 0.
 */
export function scoreIncomeTaxReturn(input: {
  lines: IncomeTaxReturnLine[];
  requiredLineIds: string[];
  pinnedYen: readonly IncomeTaxYenPin[];
}): 0 | 20 {
  if (input.pinnedYen.length === 0) return 0;
  if (input.lines.length === 0 || input.requiredLineIds.length === 0) return 0;
  if (!input.requiredLineIds.includes("basic_deduction")) return 0;
  if (!input.pinnedYen.some((row) => row.id === "basic_deduction")) return 0;
  const byId = new Map(input.lines.map((line) => [line.id, line]));
  for (const id of input.requiredLineIds) {
    const line = byId.get(id);
    if (!line || line.amount_yen == null) return 0;
  }
  if (incomeTaxReturnYenDiff(input.lines, input.pinnedYen).length !== 0) return 0;
  const basic = byId.get("basic_deduction")?.amount_yen;
  const deduction = byId.get("deduction")?.amount_yen;
  if (basic == null || deduction == null || deduction < basic) return 0;
  return 20;
}

export function scoreMonthlyClose(input: {
  canLock: boolean;
  bankGateFailed: boolean;
  ownerCapitalInRevenue: boolean;
}): 0 | 12 {
  if (input.ownerCapitalInRevenue) return 0;
  if (!input.bankGateFailed) return 0;
  if (input.canLock) return 0;
  return 12;
}

/**
 * Rate / expected-yen self-match is not statutory marks.
 * Official form-line + printed-yen empty diff lives in sole-prop-local-tax
 * (`scoreSolePropLocalTax`). This stub always returns 0 so callers cannot
 * treat self-consistency as the 12-point local-tax award.
 */
export function scoreLocalTax(_input: {
  inhabitantIncomeYen: number | null;
  enterpriseTaxYen: number | null;
  perCapitaYen: number | null;
  expectedInhabitantIncomeYen: number;
  expectedEnterpriseTaxYen: number;
  expectedPerCapitaYen: number;
  missingCapitalHeadcountCompletedAsZero: boolean;
}): 0 | 12 {
  return 0;
}
