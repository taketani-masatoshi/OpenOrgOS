import type {
  WorkRulesAbsoluteItem,
  WorkRulesItem,
  WorkRulesRecord,
  WorkRulesRelativeItem,
  Workplace,
} from "../../../../../../schemas/jp-employment-rules.js";
import {
  WORK_RULES_HEADCOUNT_THRESHOLD,
  evaluateLaborParty,
  type RuleCheck,
} from "./legal-limits.js";

export const ABSOLUTE_ITEM_LABELS: Record<WorkRulesAbsoluteItem, string> = {
  start_end_time: "始業及び終業の時刻",
  break_time: "休憩時間",
  holidays: "休日",
  leave: "休暇",
  shift_rotation: "交替制の就業時転換",
  wage_determination: "賃金の決定",
  wage_calculation_payment: "賃金の計算及び支払の方法",
  wage_cutoff_payment_date: "賃金の締切り及び支払の時期",
  wage_raise: "昇給",
  retirement_including_dismissal: "退職（解雇の事由を含む）",
};

export const RELATIVE_ITEM_LABELS: Record<WorkRulesRelativeItem, string> = {
  retirement_allowance: "退職手当",
  bonus_minimum_wage: "臨時の賃金等・最低賃金額",
  worker_cost_burden: "食費・作業用品等の負担",
  safety_health: "安全及び衛生",
  vocational_training: "職業訓練",
  accident_compensation: "災害補償・業務外の傷病扶助",
  commendation_discipline: "表彰及び制裁",
  other_common_rules: "その他全労働者に適用される定め",
};

export function itemLabel(item: WorkRulesItem): string {
  return item in ABSOLUTE_ITEM_LABELS
    ? ABSOLUTE_ITEM_LABELS[item as WorkRulesAbsoluteItem]
    : RELATIVE_ITEM_LABELS[item as WorkRulesRelativeItem];
}

export function isWorkRulesRequired(regularHeadcount: number): boolean {
  return regularHeadcount >= WORK_RULES_HEADCOUNT_THRESHOLD;
}

/** 89条1号の「交替制の就業時転換」は2組以上に分けて交替に就業させる場合のみ必要 */
export function requiredAbsoluteItems(hasShiftWork: boolean): WorkRulesAbsoluteItem[] {
  const all = Object.keys(ABSOLUTE_ITEM_LABELS) as WorkRulesAbsoluteItem[];
  return hasShiftWork ? all : all.filter((item) => item !== "shift_rotation");
}

export function missingAbsoluteItems(
  included: readonly WorkRulesItem[],
  hasShiftWork: boolean
): WorkRulesAbsoluteItem[] {
  const present = new Set(included);
  return requiredAbsoluteItems(hasShiftWork).filter((item) => !present.has(item));
}

export function missingRelativeItems(
  included: readonly WorkRulesItem[],
  adoptedPolicies: readonly WorkRulesRelativeItem[]
): WorkRulesRelativeItem[] {
  const present = new Set(included);
  return adoptedPolicies.filter((item) => !present.has(item));
}

function obligationCheck(workplace: Workplace): RuleCheck {
  const base = { id: "work-rules-required", label: "就業規則の作成・届出義務", basis: "労基法89条" };
  const headcount = workplace.regular_headcount;
  if (headcount == null) {
    return { ...base, status: "needs_review", detail: "常時使用する労働者数（事業場単位）が未登録" };
  }
  if (!isWorkRulesRequired(headcount)) {
    return { ...base, status: "ok", detail: `${headcount}人 — 義務なし（${WORK_RULES_HEADCOUNT_THRESHOLD}人未満）` };
  }
  return { ...base, status: "ok", detail: `${headcount}人 — 作成・届出義務あり` };
}

function filingCheck(rules: WorkRulesRecord): RuleCheck {
  const base = { id: "work-rules-filed", label: "労働基準監督署への届出", basis: "労基法89条 · 施行規則49条" };
  if (!rules.filed_on) return { ...base, status: "violation", detail: "届出日が未記録" };
  if (rules.last_revised_on && rules.last_revised_on > rules.filed_on) {
    return {
      ...base,
      status: "violation",
      detail: `変更（${rules.last_revised_on}）後の届出が未了（最終届出 ${rules.filed_on}）`,
    };
  }
  return { ...base, status: "ok", detail: `届出 ${rules.filed_on}` };
}

function opinionCheck(rules: WorkRulesRecord): RuleCheck[] {
  const base = { id: "opinion-attached", label: "意見書の添付", basis: "労基法90条" };
  if (!rules.opinion?.letter_attached) {
    return [{ ...base, status: "violation", detail: "過半数組合／過半数代表者の意見書が未添付" }];
  }
  const attached: RuleCheck = { ...base, status: "ok", detail: `意見聴取 ${rules.opinion.heard_on ?? "日付未記録"}` };
  return [attached, evaluateLaborParty(rules.opinion.party, "work_rules_opinion")];
}

function itemsChecks(workplace: Workplace, rules: WorkRulesRecord): RuleCheck[] {
  const absentAbsolute = missingAbsoluteItems(rules.included_items, workplace.has_shift_work);
  const absentRelative = missingRelativeItems(rules.included_items, rules.adopted_policies);
  return [
    {
      id: "absolute-items",
      label: "絶対的必要記載事項",
      basis: "労基法89条1号〜3号",
      status: absentAbsolute.length ? "violation" : "ok",
      detail: absentAbsolute.length ? `欠落: ${absentAbsolute.map(itemLabel).join("、")}` : "すべて記載",
    },
    {
      id: "relative-items",
      label: "相対的必要記載事項（定めをする場合）",
      basis: "労基法89条3号の2〜10号",
      status: absentRelative.length ? "violation" : "ok",
      detail: absentRelative.length
        ? `制度あり・規定なし: ${absentRelative.map(itemLabel).join("、")}`
        : `制度 ${rules.adopted_policies.length} 件すべて記載`,
    },
  ];
}

function notificationCheck(rules: WorkRulesRecord): RuleCheck {
  const base = { id: "notified", label: "労働者への周知", basis: "労基法106条 · 施行規則52条の2" };
  if (!rules.notification) return { ...base, status: "violation", detail: "周知方法・周知日が未記録" };
  const { method, notified_on } = rules.notification;
  if (rules.last_revised_on && notified_on < rules.last_revised_on) {
    return { ...base, status: "violation", detail: `改定（${rules.last_revised_on}）後の周知が未了（${notified_on}）` };
  }
  return { ...base, status: "ok", detail: `${method} · ${notified_on}` };
}

export function evaluateWorkplaceWorkRules(workplace: Workplace, rules?: WorkRulesRecord): RuleCheck[] {
  const obligation = obligationCheck(workplace);
  const headcount = workplace.regular_headcount;
  if (headcount == null || !isWorkRulesRequired(headcount)) return [obligation];
  if (!rules) {
    return [
      obligation,
      { id: "work-rules-exists", label: "就業規則の作成", basis: "労基法89条", status: "violation", detail: "就業規則が未登録" },
    ];
  }
  return [
    obligation,
    filingCheck(rules),
    ...opinionCheck(rules),
    ...itemsChecks(workplace, rules),
    notificationCheck(rules),
  ];
}
