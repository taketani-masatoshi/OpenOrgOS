import type {
  TakkenTaxStatus,
  TakkenTransactionKind,
  TakkenTransactionRole,
} from "../../../../../../schemas/jp-takken.js";

/**
 * 金額は「税抜金額 × 100」の整数（0.01円単位の厳密値）で保持し、上限額への換算時にのみ 1円未満を切り捨てる。
 * 切捨ては上限を過大に示さないための本モジュールの方針。
 */
const PERCENT = 100;

export interface FeeBracket {
  readonly upToYen: number | null;
  readonly ratePercent: number;
}

/**
 * 報酬告示（昭和45年建設省告示第1552号 · 最終改正 令和6年国土交通省告示第949号）第二 —
 * 売買・交換の媒介（依頼者の一方につき）。告示の税込割合 5.5% · 4.4% · 3.3% を 1.1 で除した税抜割合。
 */
export const SALE_BROKERAGE_FEE_BRACKETS: readonly FeeBracket[] = [
  { upToYen: 2_000_000, ratePercent: 5 },
  { upToYen: 4_000_000, ratePercent: 4 },
  { upToYen: null, ratePercent: 3 },
];

/** 報酬告示 第三・第八 — 代理は媒介の計算額の2倍以内（相手方から受ける報酬との合計） */
export const AGENCY_MULTIPLIER = 2;
/** 報酬告示 第七 — 低廉な空家等: 代金・価額（税抜）800万円以下の宅地又は建物 */
export const LOW_COST_VACANT_PRICE_LIMIT_YEN = 8_000_000;
/** 報酬告示 第七 — 低廉な空家等の媒介: 依頼者の一方から 30万円の1.1倍以内 */
export const LOW_COST_VACANT_CAP_EXCL_TAX_YEN = 300_000;
/** 報酬告示 第四・第五 — 貸借: 依頼者の双方（代理は相手方を含む）合計で借賃1か月分の1.1倍以内 */
export const LEASE_COMBINED_CAP_PERCENT_OF_RENT = 100;
/** 報酬告示 第四後段 — 居住用建物の賃貸借の媒介: 依頼者の一方から借賃1か月分の0.55倍以内（承諾がある場合を除く） */
export const RESIDENTIAL_LEASE_ONE_PARTY_PERCENT_OF_RENT = 50;
/** 報酬告示 第二〜第十 — 課税事業者の上限は消費税等相当額（10%）を含む額 */
export const TAXABLE_CAP_PERCENT = 110;
/**
 * 報酬告示 第十一② · 宅地建物取引業法の解釈・運用の考え方 第46条第1項関係 —
 * 免税事業者は税抜金額に仕入れに係る消費税等相当額（税抜金額の0.04倍が限度）を加えた額以内
 */
export const EXEMPT_CAP_PERCENT = 104;

export interface FeeBracketLine {
  from_yen: number;
  to_yen: number | null;
  rate_percent: number;
  segment_yen: number;
  amount_excl_tax_yen: number;
}

export interface FeeQuery {
  kind: TakkenTransactionKind;
  role: TakkenTransactionRole;
  basisYen: number;
  taxStatus: TakkenTaxStatus;
  residential: boolean;
  lowCostVacantSpecial: boolean;
}

export interface FeeLimit {
  kind: TakkenTransactionKind;
  role: TakkenTransactionRole;
  tax_status: TakkenTaxStatus;
  basis_yen: number;
  basis_label: string;
  brackets: FeeBracketLine[];
  standard_excl_tax_yen: number;
  special_applied: boolean;
  per_client_cap_yen: number;
  combined_cap_yen: number | null;
  residential_one_party_cap_yen: number | null;
  basis_articles: string[];
  notes: string[];
  rounding: "floor_yen";
}

export function capFromBase(baseCentiYen: number, taxStatus: TakkenTaxStatus): number {
  const capPercent = taxStatus === "taxable" ? TAXABLE_CAP_PERCENT : EXEMPT_CAP_PERCENT;
  return Math.floor((baseCentiYen * capPercent) / (PERCENT * PERCENT));
}

function centiToYen(centiYen: number): number {
  return centiYen / PERCENT;
}

export function saleBrokerageBreakdown(priceYen: number): { lines: FeeBracketLine[]; baseCentiYen: number } {
  const lines: FeeBracketLine[] = [];
  let lowerYen = 0;
  for (const bracket of SALE_BROKERAGE_FEE_BRACKETS) {
    const upperYen = bracket.upToYen ?? Number.POSITIVE_INFINITY;
    const segmentYen = Math.max(0, Math.min(priceYen, upperYen) - lowerYen);
    const amountCenti = segmentYen * bracket.ratePercent;
    lines.push({
      from_yen: lowerYen,
      to_yen: bracket.upToYen,
      rate_percent: bracket.ratePercent,
      segment_yen: segmentYen,
      amount_excl_tax_yen: centiToYen(amountCenti),
    });
    lowerYen = upperYen;
  }
  const baseCentiYen = lines.reduce((sum, line) => sum + line.segment_yen * line.rate_percent, 0);
  return { lines, baseCentiYen };
}

/** 報酬告示 第二・第七 — 交換は価額に差があるときは多い方の価額 */
export function exchangeBasisYen(valueYen: number, counterValueYen?: number): number {
  return Math.max(valueYen, counterValueYen ?? 0);
}

export function isLowCostVacantEligible(kind: TakkenTransactionKind, basisYen: number): boolean {
  return kind !== "lease" && basisYen <= LOW_COST_VACANT_PRICE_LIMIT_YEN;
}

function exemptNote(taxStatus: TakkenTaxStatus): string[] {
  if (taxStatus === "taxable") return [];
  return ["免税事業者: 税抜金額 × 1.04 以内 — 上乗せ分は報酬の一部であり消費税として別途受領しない"];
}

function computeSaleFeeLimit(query: FeeQuery): FeeLimit {
  const { lines, baseCentiYen } = saleBrokerageBreakdown(query.basisYen);
  const eligible = isLowCostVacantEligible(query.kind, query.basisYen);
  const specialApplied = query.lowCostVacantSpecial && eligible;
  const specialBaseCenti = LOW_COST_VACANT_CAP_EXCL_TAX_YEN * PERCENT;
  const clientBaseCenti = specialApplied ? Math.max(baseCentiYen, specialBaseCenti) : baseCentiYen;
  const multiplier = query.role === "agency" ? AGENCY_MULTIPLIER : 1;
  const perClientCap = capFromBase(clientBaseCenti * multiplier, query.taxStatus);
  const notes = [...exemptNote(query.taxStatus)];
  if (query.lowCostVacantSpecial && !eligible) {
    notes.push("低廉な空家等の特例は代金・価額（税抜）800万円以下のみ — 通常計算を適用");
  }
  if (specialApplied) {
    notes.push("特例適用には媒介・代理契約の締結に際し、あらかじめ報酬額を依頼者に説明し合意することが必要");
  }
  if (query.role === "brokerage") notes.push("媒介の上限は依頼者の一方ごと（双方から受ける場合はそれぞれ）");
  return {
    kind: query.kind,
    role: query.role,
    tax_status: query.taxStatus,
    basis_yen: query.basisYen,
    basis_label: query.kind === "exchange" ? "交換価額（税抜 · 多い方）" : "売買代金（税抜）",
    brackets: lines,
    standard_excl_tax_yen: Math.floor(centiToYen(baseCentiYen)),
    special_applied: specialApplied,
    per_client_cap_yen: perClientCap,
    combined_cap_yen: query.role === "agency" ? perClientCap : null,
    residential_one_party_cap_yen: null,
    basis_articles: saleArticles(query.role, specialApplied),
    notes,
    rounding: "floor_yen",
  };
}

function saleArticles(role: TakkenTransactionRole, specialApplied: boolean): string[] {
  if (specialApplied) return role === "agency" ? ["報酬告示 第八"] : ["報酬告示 第七"];
  return role === "agency" ? ["報酬告示 第三"] : ["報酬告示 第二"];
}

function computeLeaseFeeLimit(query: FeeQuery): FeeLimit {
  const combinedBaseCenti = query.basisYen * LEASE_COMBINED_CAP_PERCENT_OF_RENT;
  const combinedCap = capFromBase(combinedBaseCenti, query.taxStatus);
  const residentialBrokerage = query.role === "brokerage" && query.residential;
  const onePartyCap = residentialBrokerage
    ? capFromBase(query.basisYen * RESIDENTIAL_LEASE_ONE_PARTY_PERCENT_OF_RENT, query.taxStatus)
    : null;
  const notes = [...exemptNote(query.taxStatus)];
  if (query.lowCostVacantSpecial) notes.push("低廉な空家等の特例は売買・交換のみ — 貸借には適用しない");
  if (residentialBrokerage) {
    notes.push("居住用: 依頼者の一方から0.5か月分（税抜）以内 — 媒介の依頼を受けるに当たり承諾を得た場合を除く");
  }
  notes.push("長期の空家等（第九・第十）· 権利金（第六）の特例は本モジュール未実装 — 該当時は人間確認");
  return {
    kind: query.kind,
    role: query.role,
    tax_status: query.taxStatus,
    basis_yen: query.basisYen,
    basis_label: "借賃1か月分（税抜）",
    brackets: [],
    standard_excl_tax_yen: Math.floor(centiToYen(combinedBaseCenti)),
    special_applied: false,
    per_client_cap_yen: combinedCap,
    combined_cap_yen: combinedCap,
    residential_one_party_cap_yen: onePartyCap,
    basis_articles: [query.role === "agency" ? "報酬告示 第五" : "報酬告示 第四"],
    notes,
    rounding: "floor_yen",
  };
}

export function computeFeeLimit(query: FeeQuery): FeeLimit {
  return query.kind === "lease" ? computeLeaseFeeLimit(query) : computeSaleFeeLimit(query);
}
