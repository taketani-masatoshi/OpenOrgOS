/**
 * Shared corporate tax annex forms, row ids, and OfficialAnnexLine types.
 * Worked-example pins and worksheet evaluation import from here.
 */
export const CORPORATE_TAX_FORM_EDITION = "reiwa6-apr1-end";

export const FORM_BETSU_4 = "別表四";
export const FORM_BETSU_5_1 = "別表五（一）";
export const FORM_BETSU_1 = "別表一";
export const FORM_BETSU_1_LEAF = "別表一次葉";
export const ROW_CURRENT_PROFIT = "1";
export const ROW_DEPRECIATION_EXCESS = "6";
export const ROW_ENTERTAINMENT_EXCESS = "8";
export const ROW_TAXABLE_INCOME = "52";
/** 別表五（一）「繰越損益金（損は赤）」。令七様式でも同じ行。 */
export const ROW_CARRYOVER_EARNINGS = "25";
export const ROW_RETURN_INCOME = "1";
export const ROW_CORPORATE_TAX = "2";
/**
 * 別表一・地方法人税計算欄。令六・四・一。
 * https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2024/pdf/r01-01.pdf
 * https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2024/pdf/01-01-j.pdf
 */
export const ROW_LOCAL_TAX_BASE = "28";
export const ROW_LOCAL_CORPORATE_TAX = "31";
/** 別表一次葉。令六・四・一。年800万円以下・15%・その他・23.2%。 */
export const ROW_REDUCED_BASE = "45";
export const ROW_REDUCED_TAX = "48";
export const ROW_RESIDUAL_BASE = "47";
export const ROW_RESIDUAL_TAX = "50";
/** 別表一次葉・地方法人税額の計算。行51←別表一「28」、行53＝(51)×10.3%。 */
export const ROW_LEAF_LOCAL_BASE = "51";
export const ROW_LEAF_LOCAL_TAX = "53";
export const LEAF_REDUCED_BASE_LABEL = "(1)のうち中小法人等の年800万円相当額以下の金額";
export const LEAF_REDUCED_TAX_LABEL = "(45)の15％又は19％相当額";
export const LEAF_RESIDUAL_BASE_LABEL = "その他の所得金額";
export const LEAF_RESIDUAL_TAX_LABEL = "(47)の19％又は23.2％相当額";
export const LEAF_LOCAL_BASE_LABEL = "所得の金額に対する法人税額";
export const LEAF_LOCAL_TAX_LABEL = "(51)の10.3％相当額";
export const BETSU1_LOCAL_BASE_LABEL = "所得の金額に対する法人税額";
export const BETSU1_LOCAL_TAX_LABEL = "地方法人税額";

/**
 * 別表四の区分。国税庁 令六・四・一以後終了事業年度分（itiran2024/pdf/04.pdf）。
 * 行10・行21は記載の仕方の加算・減算の空欄。
 */
export const SCHEDULE_4_LINES: readonly { row: string; label: string }[] = [
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
export const CAPITAL_REDUCED_RATE_CEILING_YEN = 100_000_000;
export const REDUCED_BRACKET_YEN = 8_000_000;
export const REDUCED_RATE_BPS = 1_500;
export const STANDARD_RATE_BPS = 2_320;
export const THOUSAND_YEN = 1_000;
export const HUNDRED_YEN = 100;
export const SME_CATEGORY = "中小法人";
export const FULL_YEAR_MONTHS = 12;
export const ROW_RETAINED_TOTAL = "31";
export const EXPLICIT_ADD_ROWS = new Set(["2", "3", "4", "5", "7", "9", "10"]);
/** 行12–21は減算小計へ。行44・47は総計・所得計算の控除行（令和6年記載例）。 */
export const EXPLICIT_SUBTRACT_ROWS = new Set([
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
export const RESERVED_EXPLICIT_ROWS = new Set([ROW_DEPRECIATION_EXCESS, ROW_ENTERTAINMENT_EXCESS]);

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

export function truncateYen(amount: number, unit: number): number {
  return Math.floor(amount / unit) * unit;
}
