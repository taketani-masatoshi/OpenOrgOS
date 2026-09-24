import type {
  LaborContract,
  LaborDisclosures,
} from "../../../../../../schemas/jp-labor-contract.js";
import type { CheckItem } from "./checks.js";

/** 令和5年厚労省令39号: 労基則5条1項1号の2（更新上限）· 1号の3（変更の範囲）· 5項・6項（無期転換）の施行日 */
export const DISCLOSURE_AMENDMENT_2024_EFFECTIVE = "2024-04-01";

/** 令和8年厚労省令87号: パート有期法施行規則2条1項4号（法14条2項の説明を求めることができる旨）の施行日 */
export const TREATMENT_EXPLANATION_NOTICE_EFFECTIVE = "2026-10-01";

/** 有期雇用労働者へのパート有期法の適用（中小事業主）: 働き方改革関連法附則。これより前の締結は企業規模で判断が分かれる */
export const PART_TIME_FIXED_TERM_ACT_BASELINE = "2021-04-01";

export type DisclosureKey = keyof LaborDisclosures;

export interface DisclosureRequirement {
  key: DisclosureKey;
  label: string;
  basis: string;
}

export interface DisclosureContext {
  contract: LaborContract;
  /** true/false = 労契法18条の申込権がこの契約期間内に生じるか · null = 判定不能 */
  conversionRightArises: boolean | null;
}

const ALWAYS_REQUIRED: readonly DisclosureRequirement[] = [
  { key: "contract_period", label: "労働契約の期間", basis: "労基則5条1項1号・3項" },
  { key: "workplace", label: "就業の場所", basis: "労基則5条1項1号の3" },
  { key: "duties", label: "従事すべき業務", basis: "労基則5条1項1号の3" },
  { key: "working_hours", label: "始業及び終業の時刻", basis: "労基則5条1項2号" },
  { key: "overtime", label: "所定労働時間を超える労働の有無", basis: "労基則5条1項2号" },
  { key: "breaks", label: "休憩時間", basis: "労基則5条1項2号" },
  { key: "holidays", label: "休日", basis: "労基則5条1項2号" },
  { key: "leave", label: "休暇", basis: "労基則5条1項2号" },
  { key: "wage_calculation", label: "賃金の決定・計算・支払の方法", basis: "労基則5条1項3号" },
  { key: "wage_closing_and_payment", label: "賃金の締切り・支払の時期", basis: "労基則5条1項3号" },
  { key: "retirement", label: "退職に関する事項（解雇の事由を含む）", basis: "労基則5条1項4号" },
];

const CHANGE_SCOPE_REQUIRED: readonly DisclosureRequirement[] = [
  {
    key: "workplace_change_scope",
    label: "就業場所の変更の範囲",
    basis: "労基則5条1項1号の3（2024-04-01〜）",
  },
  {
    key: "duties_change_scope",
    label: "従事業務の変更の範囲",
    basis: "労基則5条1項1号の3（2024-04-01〜）",
  },
];

const PART_TIME_FIXED_TERM_REQUIRED: readonly DisclosureRequirement[] = [
  { key: "pay_raise", label: "昇給の有無", basis: "パート有期法6条1項・施行規則2条1項1号" },
  {
    key: "retirement_allowance",
    label: "退職手当の有無",
    basis: "パート有期法6条1項・施行規則2条1項2号",
  },
  { key: "bonus", label: "賞与の有無", basis: "パート有期法6条1項・施行規則2条1項3号" },
  {
    key: "consultation_desk",
    label: "雇用管理の改善等に関する相談窓口",
    basis: "パート有期法6条1項・施行規則2条1項",
  },
];

const CONVERSION_REQUIRED: readonly DisclosureRequirement[] = [
  {
    key: "conversion_application",
    label: "無期転換申込みに関する事項",
    basis: "労基則5条5項・6項（2024-04-01〜）",
  },
  {
    key: "post_conversion_terms",
    label: "無期転換後の労働条件",
    basis: "労基則5条5項・6項（2024-04-01〜）",
  },
];

function isPartTimeOrFixedTerm(contract: LaborContract): boolean {
  return contract.part_time || contract.contract_type === "fixed_term";
}

function isRenewableFixedTerm(contract: LaborContract): boolean {
  return contract.contract_type === "fixed_term" && contract.renewal !== "none";
}

function renewalRequirements(contract: LaborContract): DisclosureRequirement[] {
  if (!isRenewableFixedTerm(contract)) return [];
  const criteria: DisclosureRequirement = {
    key: "renewal_criteria",
    label: "有期労働契約を更新する場合の基準",
    basis: "労基則5条1項1号の2",
  };
  if (contract.concluded_on < DISCLOSURE_AMENDMENT_2024_EFFECTIVE) return [criteria];
  const cap: DisclosureRequirement = {
    key: "renewal_cap",
    label: "更新上限（通算契約期間・更新回数）の有無と内容",
    basis: "労基則5条1項1号の2（2024-04-01〜）",
  };
  return [criteria, cap];
}

function treatmentExplanationApplies(contract: LaborContract): boolean {
  return (
    contract.concluded_on >= TREATMENT_EXPLANATION_NOTICE_EFFECTIVE ||
    contract.start_date >= TREATMENT_EXPLANATION_NOTICE_EFFECTIVE
  );
}

function partTimeFixedTermRequirements(contract: LaborContract): DisclosureRequirement[] {
  if (!isPartTimeOrFixedTerm(contract)) return [];
  if (!treatmentExplanationApplies(contract)) return [...PART_TIME_FIXED_TERM_REQUIRED];
  const explanation: DisclosureRequirement = {
    key: "treatment_explanation_right",
    label: "待遇の相違の内容・理由の説明を求めることができる旨",
    basis: "パート有期法6条1項・施行規則2条1項4号（2026-10-01〜）",
  };
  return [...PART_TIME_FIXED_TERM_REQUIRED, explanation];
}

/** Written items that must appear in the notice for the given contract (conversion items excluded). */
export function requiredDisclosures(contract: LaborContract): DisclosureRequirement[] {
  const shift: DisclosureRequirement[] = contract.shift_work
    ? [{ key: "shift_rotation", label: "交替制勤務の就業時転換", basis: "労基則5条1項2号" }]
    : [];
  const changeScope =
    contract.concluded_on >= DISCLOSURE_AMENDMENT_2024_EFFECTIVE ? CHANGE_SCOPE_REQUIRED : [];
  return [
    ...ALWAYS_REQUIRED,
    ...changeScope,
    ...renewalRequirements(contract),
    ...shift,
    ...partTimeFixedTermRequirements(contract),
  ];
}

function presenceCheck(contract: LaborContract, requirement: DisclosureRequirement): CheckItem {
  const value = contract.disclosures[requirement.key];
  return {
    id: `disclosure-${requirement.key}`,
    label: requirement.label,
    status: value ? "ok" : "ng",
    detail: value ? "記載あり" : "未記載",
    basis: requirement.basis,
  };
}

function conversionDisclosureChecks(context: DisclosureContext): CheckItem[] {
  const { contract, conversionRightArises } = context;
  if (contract.contract_type !== "fixed_term") return [];
  if (contract.concluded_on < DISCLOSURE_AMENDMENT_2024_EFFECTIVE) return [];
  if (conversionRightArises === false) return [];
  if (conversionRightArises === null) {
    return [
      {
        id: "disclosure-conversion",
        label: "無期転換申込権の発生有無（明示要否）",
        status: "needs_review",
        detail: "通算契約期間を判定できない — 有期契約の履歴を確認",
        basis: "労基則5条5項・労契法18条",
      },
    ];
  }
  return CONVERSION_REQUIRED.map((requirement) => presenceCheck(contract, requirement));
}

function legalBaselineCheck(contract: LaborContract): CheckItem[] {
  if (
    !isPartTimeOrFixedTerm(contract) ||
    contract.concluded_on >= PART_TIME_FIXED_TERM_ACT_BASELINE
  )
    return [];
  return [
    {
      id: "disclosure-legal-baseline",
      label: "締結時点の適用法令",
      status: "needs_review",
      detail: `${PART_TIME_FIXED_TERM_ACT_BASELINE} より前の締結 — 当時の適用範囲（企業規模）を人間が確認`,
      basis: "働き方改革関連法附則",
    },
  ];
}

export function assessDisclosures(context: DisclosureContext): CheckItem[] {
  const { contract } = context;
  return [
    ...legalBaselineCheck(contract),
    ...requiredDisclosures(contract).map((requirement) => presenceCheck(contract, requirement)),
    ...conversionDisclosureChecks(context),
  ];
}
