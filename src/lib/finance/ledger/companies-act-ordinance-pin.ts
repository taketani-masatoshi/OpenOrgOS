/**
 * Ordinance display labels for Companies Act statements (product-shipped).
 * Labels follow e-Gov 会社計算規則. Yen amounts live only in test fixtures.
 * src/ must not import tests/fixtures.
 *
 * SSOT: labels+order live ONLY here. Dev fixtures may supply parallel `amounts[]`
 * (nullable yen) that `withCompaniesActDevAmounts` merges by index — fixtures
 * must not redefine article/label strings.
 */
export type CompaniesActPinLine = {
  article: string;
  label: string;
  /** Development fixture yen only. Absent → label-only check for that line. */
  example_yen?: number;
};

export const COMPANIES_ACT_ORDINANCE_LABEL_PIN: readonly CompaniesActPinLine[] = [
  { article: "第七十四条", label: "流動資産" },
  { article: "第七十四条", label: "固定資産" },
  { article: "第七十四条", label: "繰延資産" },
  { article: "第七十五条", label: "流動負債" },
  { article: "第七十五条", label: "固定負債" },
  { article: "第七十六条", label: "資本金" },
  { article: "第七十六条", label: "資本剰余金" },
  { article: "第七十六条", label: "利益剰余金" },
  { article: "第七十六条", label: "自己株式" },
  { article: "第七十六条", label: "評価・換算差額等" },
  { article: "第七十六条", label: "新株予約権" },
  { article: "第八十八条", label: "売上高" },
  { article: "第八十八条", label: "売上原価" },
  { article: "第八十九条", label: "売上総利益金額" },
  { article: "第八十八条", label: "販売費及び一般管理費" },
  { article: "第九十条", label: "営業利益金額" },
  { article: "第八十八条", label: "営業外収益" },
  { article: "第八十八条", label: "営業外費用" },
  { article: "第九十一条", label: "経常利益金額" },
  { article: "第八十八条", label: "特別利益" },
  { article: "第八十八条", label: "特別損失" },
  { article: "第九十二条", label: "税引前当期純利益金額" },
  { article: "第九十三条", label: "法人税等" },
  { article: "第九十四条", label: "当期純利益金額" },
  { article: "第九十六条", label: "当期首残高" },
  { article: "第百五条", label: "剰余金の配当" },
  { article: "第九十四条", label: "当期純利益金額" },
  { article: "第九十六条", label: "当期末残高" },
  { article: "第百条", label: "継続企業の前提に関する注記" },
  { article: "第百一条", label: "重要な会計方針に係る事項に関する注記" },
  { article: "第百二条の三", label: "表示方法の変更に関する注記" },
  { article: "第百七条", label: "税効果会計に関する注記" },
  { article: "第百十二条", label: "関連当事者との取引に関する注記" },
  { article: "第百十三条", label: "一株当たり情報に関する注記" },
  { article: "第百十四条", label: "重要な後発事象に関する注記" },
];

/** Merge development-fixture yen onto the product ordinance pin (labels stay SSOT). */
export function withCompaniesActDevAmounts(
  amounts: ReadonlyArray<number | null | undefined>,
): CompaniesActPinLine[] {
  if (amounts.length !== COMPANIES_ACT_ORDINANCE_LABEL_PIN.length) {
    throw new Error(
      `dev amounts length ${amounts.length} != ordinance pin ${COMPANIES_ACT_ORDINANCE_LABEL_PIN.length}`,
    );
  }
  return COMPANIES_ACT_ORDINANCE_LABEL_PIN.map((line, index) => {
    const yen = amounts[index];
    return yen == null ? { ...line } : { ...line, example_yen: yen };
  });
}
