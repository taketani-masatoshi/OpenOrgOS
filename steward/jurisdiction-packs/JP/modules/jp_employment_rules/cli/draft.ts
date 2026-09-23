import type {
  AgreementWorkCategory,
  LaborParty,
  OvertimeAgreement,
  WorkRulesRecord,
  Workplace,
} from "../../../../../../schemas/jp-employment-rules.js";
import { statutoryLimits } from "./agreement-rules.js";
import { WORK_RULES_HEADCOUNT_THRESHOLD, type RuleCheck } from "./legal-limits.js";
import { RELATIVE_ITEM_LABELS, isWorkRulesRequired } from "./work-rules-rules.js";

export type DraftKind = "work-rules" | "agreement";

export interface DraftSourceUrls {
  law: string;
  modelWorkRules: string;
  forms: string;
}

const WORK_CATEGORY_LABELS: Record<AgreementWorkCategory, string> = {
  general: "一般",
  construction: "工作物の建設の事業",
  construction_disaster_recovery: "災害時の復旧・復興の事業（附則139条1項）",
  motor_vehicle_driving: "自動車の運転の業務（附則140条）",
  physician: "医業に従事する医師（附則141条）",
  new_technology_rnd: "新たな技術・商品・役務の研究開発業務（36条11項）",
};

export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return Object.entries(vars).reduce((out, [key, value]) => out.replaceAll(`{{${key}}}`, value), template);
}

/** 施行規則16条1項・2項。業種別（附則139〜141条）の様式は主要様式ページで確認する */
export function agreementFormLabel(agreement: OvertimeAgreement): string {
  if (agreement.work_category === "new_technology_rnd") return "様式第9号の3（施行規則16条2項）";
  if (agreement.work_category === "general" || agreement.work_category === "construction") {
    return agreement.special_clause ? "様式第9号の2（特別条項 · 施行規則16条1項）" : "様式第9号（一般条項 · 施行規則16条1項）";
  }
  return "業種別様式 — 厚生労働省 主要様式ページで確認（needs_review）";
}

export function findingsBlock(checks: readonly RuleCheck[]): string {
  const findings = checks.filter((c) => c.status !== "ok");
  if (!findings.length) return "- 検出事項なし（最終確認は人間が行う）";
  return findings.map((c) => `- [${c.status}] ${c.label} — ${c.detail}`).join("\n");
}

function relativeItemsBlock(rules: WorkRulesRecord | undefined): string {
  const adopted = new Set(rules?.adopted_policies ?? []);
  return Object.entries(RELATIVE_ITEM_LABELS)
    .map(([item, label]) => `- [${adopted.has(item as keyof typeof RELATIVE_ITEM_LABELS) ? "x" : " "}] ${label}`)
    .join("\n");
}

function partyLabel(party: LaborParty | undefined): string {
  if (!party) return "未記録";
  if (party.type === "majority_union") return `過半数組合: ${party.union_name ?? "（名称未記録）"}`;
  return `過半数代表者: ${party.representative_employee_id ?? "（未記録）"} · 選出方法 ${party.selection_method ?? "未記録"}`;
}

function obligationLabel(headcount: number | null | undefined): string {
  if (headcount == null) return "作成・届出義務: 要確認（人数未登録）";
  if (isWorkRulesRequired(headcount)) return "作成・届出義務あり（労基法89条）";
  return `作成・届出義務なし（${WORK_RULES_HEADCOUNT_THRESHOLD}人未満）`;
}

export function buildWorkRulesDraftVars(input: {
  companyName: string;
  workplace: Workplace;
  rules?: WorkRulesRecord;
  checks: readonly RuleCheck[];
  generatedOn: string;
  urls: DraftSourceUrls;
}): Record<string, string> {
  const { workplace, rules } = input;
  const headcount = workplace.regular_headcount;
  const obligation = obligationLabel(headcount);
  return {
    company_name: input.companyName,
    workplace_name: workplace.name,
    workplace_id: workplace.id,
    headcount_label: headcount == null ? "未登録" : `${headcount}人`,
    obligation_label: obligation,
    generated_on: input.generatedOn,
    shift_section: workplace.has_shift_work ? "- 交替制の就業時転換（2組以上に分けて交替に就業させる場合）" : "",
    relative_items_block: relativeItemsBlock(rules),
    opinion_label: partyLabel(rules?.opinion?.party),
    findings_block: findingsBlock(input.checks),
    source_model_url: input.urls.modelWorkRules,
    source_law_url: input.urls.law,
  };
}

function specialBlock(agreement: OvertimeAgreement): string {
  const special = agreement.special_clause;
  if (!special) return "- 特別条項なし（限度時間内のみ）";
  return [
    `- 臨時的に限度時間を超えて労働させることができる場合: ${special.circumstances.join("、") || "（未記録）"}`,
    `- 1か月の時間外＋休日労働: ${special.monthly_total_hours}時間`,
    `- 1年の時間外労働: ${special.annual_overtime_hours}時間`,
    `- 限度時間を超えることができる回数: ${special.max_months_over_limit}回`,
    `- 限度時間超の割増賃金率: ${special.premium_rate_percent ?? "（未記録）"}%`,
    `- 健康・福祉確保措置: ${special.health_measures.join("、") || "（未記録）"}`,
    `- 限度時間を超える場合の手続: ${special.procedure ?? "（未記録）"}`,
  ].join("\n");
}

function hoursLabel(hours: number | undefined): string {
  return hours === undefined ? "（未記録）" : `${hours}時間`;
}

export function buildAgreementDraftVars(input: {
  companyName: string;
  workplace?: Workplace;
  agreement: OvertimeAgreement;
  checks: readonly RuleCheck[];
  generatedOn: string;
  urls: DraftSourceUrls;
}): Record<string, string> {
  const { agreement } = input;
  const limits = statutoryLimits(agreement.variable_hours_over_3_months);
  return {
    agreement_id: agreement.id,
    generated_on: input.generatedOn,
    form_label: agreementFormLabel(agreement),
    company_name: input.companyName,
    workplace_name: input.workplace?.name ?? "（事業場未登録）",
    workplace_id: agreement.workplace_id,
    labor_standards_office: input.workplace?.labor_standards_office ?? "（未記録）",
    work_category_label: WORK_CATEGORY_LABELS[agreement.work_category],
    covered_workers: agreement.covered_workers ?? "（未記録）",
    extension_reasons: agreement.extension_reasons.join("、") || "（未記録）",
    period_start: agreement.period_start,
    effective_from: agreement.effective_from,
    effective_to: agreement.effective_to,
    general_daily: hoursLabel(agreement.general.daily_hours),
    general_monthly: hoursLabel(agreement.general.monthly_hours),
    general_annual: hoursLabel(agreement.general.annual_hours),
    statutory_monthly: `${limits.monthly}時間`,
    statutory_annual: `${limits.annual}時間`,
    holiday_days: agreement.general.holiday_days_per_month === undefined ? "（未記録）" : `${agreement.general.holiday_days_per_month}日`,
    special_block: specialBlock(agreement),
    party_block: `- ${partyLabel(agreement.party)}`,
    caps_checkbox: agreement.confirms_statutory_caps ? "x" : " ",
    findings_block: findingsBlock(input.checks),
    source_forms_url: input.urls.forms,
    source_law_url: input.urls.law,
  };
}
