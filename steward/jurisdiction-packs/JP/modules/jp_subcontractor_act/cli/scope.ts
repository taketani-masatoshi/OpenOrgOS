import type {
  SubcontractCategory,
  SubcontractEntityType,
} from "../../../../../../schemas/jp-subcontractor-act.js";
import { isLegacyOrder, TORITEKI_EFFECTIVE_DATE } from "./rules.js";

/** 法第2条第8項第1号・第9項第1号 — 資本金3億円 */
export const CAPITAL_UPPER_DESIGNATED_YEN = 300_000_000;
/** 法第2条第8項第3号・第9項第3号 — 資本金5千万円 */
export const CAPITAL_UPPER_OTHER_YEN = 50_000_000;
/** 法第2条第8項第2号・第4号、第9項第2号・第4号 — 資本金1千万円 */
export const CAPITAL_LOWER_YEN = 10_000_000;
/** 法第2条第8項第5号・第9項第5号 — 常時使用する従業員300人 */
export const EMPLOYEE_THRESHOLD_DESIGNATED = 300;
/** 法第2条第8項第6号・第9項第6号 — 常時使用する従業員100人 */
export const EMPLOYEE_THRESHOLD_OTHER = 100;

export type CategoryGroup = "designated" | "other" | "excluded";
export type ScopeStatus = "covered" | "not_covered" | "needs_review";
export type ScopeBasis = "capital" | "employees";
type BasisOutcome = "covered" | "not_covered" | "unknown";

export interface PartySize {
  entity_type: SubcontractEntityType;
  capital_yen?: number;
  regular_employees?: number;
}

export interface ScopeInput {
  category: SubcontractCategory;
  ordered_on: string;
  principal: PartySize;
  supplier?: PartySize;
}

export interface ScopeResult {
  status: ScopeStatus;
  basis?: ScopeBasis;
  category_group: CategoryGroup;
  article?: string;
  reasons: string[];
}

interface BasisResult {
  outcome: BasisOutcome;
  article?: string;
  reason: string;
}

/**
 * 政令（平成13年政令第5号）指定: プログラム作成 · 運送 · 物品の倉庫保管 · 情報処理。
 * 製造・修理・特定運送委託は法第2条第8項第1号の「製造委託等」として同じ区分。
 */
const CATEGORY_GROUPS: Record<SubcontractCategory, CategoryGroup> = {
  manufacturing: "designated",
  repair: "designated",
  specific_transport: "designated",
  information_product_program: "designated",
  service_transport: "designated",
  service_warehousing: "designated",
  service_information_processing: "designated",
  information_product_other: "other",
  service_other: "other",
  construction_subcontract: "excluded",
};

export function categoryGroup(category: SubcontractCategory): CategoryGroup {
  return CATEGORY_GROUPS[category];
}

function supplierCapitalWithin(supplier: PartySize, limitYen: number): boolean | undefined {
  if (supplier.entity_type === "individual") return true;
  if (supplier.capital_yen === undefined) return undefined;
  return supplier.capital_yen <= limitYen;
}

function capitalArticle(group: CategoryGroup, upperTier: boolean): string {
  if (group === "designated")
    return upperTier ? "法第2条第8項第1号・第9項第1号" : "法第2条第8項第2号・第9項第2号";
  return upperTier ? "法第2条第8項第3号・第9項第3号" : "法第2条第8項第4号・第9項第4号";
}

export function evaluateCapitalBasis(
  group: CategoryGroup,
  principal: PartySize,
  supplier: PartySize
): BasisResult {
  if (principal.capital_yen === undefined)
    return { outcome: "unknown", reason: "委託事業者の資本金が未登録" };
  const upperYen = group === "designated" ? CAPITAL_UPPER_DESIGNATED_YEN : CAPITAL_UPPER_OTHER_YEN;
  if (principal.capital_yen <= CAPITAL_LOWER_YEN) {
    return { outcome: "not_covered", reason: "委託事業者の資本金が1千万円以下" };
  }
  const upperTier = principal.capital_yen > upperYen;
  const within = supplierCapitalWithin(supplier, upperTier ? upperYen : CAPITAL_LOWER_YEN);
  if (within === undefined) return { outcome: "unknown", reason: "受託側の資本金が未登録" };
  if (!within) return { outcome: "not_covered", reason: "受託側の資本金が区分上限を超える" };
  return {
    outcome: "covered",
    article: capitalArticle(group, upperTier),
    reason: `資本金基準（委託側 ${principal.capital_yen.toLocaleString("ja-JP")} 円）`,
  };
}

export function evaluateEmployeeBasis(
  group: CategoryGroup,
  principal: PartySize,
  supplier: PartySize
): BasisResult {
  const threshold =
    group === "designated" ? EMPLOYEE_THRESHOLD_DESIGNATED : EMPLOYEE_THRESHOLD_OTHER;
  const article =
    group === "designated" ? "法第2条第8項第5号・第9項第5号" : "法第2条第8項第6号・第9項第6号";
  if (principal.regular_employees === undefined)
    return { outcome: "unknown", reason: "委託事業者の従業員数が未登録" };
  if (principal.regular_employees <= threshold) {
    return { outcome: "not_covered", reason: `委託事業者の常時使用する従業員が${threshold}人以下` };
  }
  if (supplier.regular_employees === undefined)
    return { outcome: "unknown", reason: "受託側の従業員数が未登録" };
  if (supplier.regular_employees > threshold) {
    return { outcome: "not_covered", reason: `受託側の常時使用する従業員が${threshold}人超` };
  }
  return { outcome: "covered", article, reason: `従業員基準（${threshold}人）` };
}

function preliminaryScope(input: ScopeInput, group: CategoryGroup): ScopeResult | null {
  if (group === "excluded") {
    return {
      status: "not_covered",
      category_group: group,
      article: "法第2条第4項",
      reasons: ["建設工事の下請負は対象外（建設業法の規律 · 本モジュール対象外）"],
    };
  }
  if (isLegacyOrder(input.ordered_on)) {
    return {
      status: "needs_review",
      category_group: group,
      article: "令和7年法律第41号附則",
      reasons: [`施行日（${TORITEKI_EFFECTIVE_DATE}）前の発注 — 旧下請法の例による（人間確認）`],
    };
  }
  if (input.principal.entity_type !== "corporation") {
    return {
      status: "not_covered",
      category_group: group,
      reasons: ["委託事業者は法人に限る（法第2条第8項）"],
    };
  }
  return null;
}

/** 資本金基準を先に判定し、該当しない場合に従業員基準を適用（運用基準 第2-2(3)） */
export function determineScope(input: ScopeInput): ScopeResult {
  const group = categoryGroup(input.category);
  const preliminary = preliminaryScope(input, group);
  if (preliminary) return preliminary;
  const supplier = input.supplier;
  if (!supplier) {
    return {
      status: "needs_review",
      category_group: group,
      reasons: ["受託側の規模情報（subcontract-parties）が未登録"],
    };
  }

  const capital = evaluateCapitalBasis(group, input.principal, supplier);
  if (capital.outcome === "covered") {
    return {
      status: "covered",
      basis: "capital",
      category_group: group,
      article: capital.article,
      reasons: [capital.reason],
    };
  }
  const employees = evaluateEmployeeBasis(group, input.principal, supplier);
  if (employees.outcome === "covered") {
    return {
      status: "covered",
      basis: "employees",
      category_group: group,
      article: employees.article,
      reasons: [capital.reason, employees.reason],
    };
  }
  const undetermined = capital.outcome === "unknown" || employees.outcome === "unknown";
  return {
    status: undetermined ? "needs_review" : "not_covered",
    category_group: group,
    reasons: [capital.reason, employees.reason],
  };
}
