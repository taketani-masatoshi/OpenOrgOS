import type { LaborContract } from "../../../../../../schemas/jp-labor-contract.js";
import {
  DISCLOSURE_AMENDMENT_2024_EFFECTIVE,
  requiredDisclosures,
  type DisclosureKey,
} from "./disclosures.js";

export const MISSING_VALUE = "（要記載）";
export const NOT_APPLICABLE_VALUE = "—（該当なし）";

/** Wage amounts are L2 — tracked drafts carry a placeholder, the signed original lives in records/. */
export const WAGE_AMOUNT_PLACEHOLDER = "（金額は L2 台帳から人間が記入 · tracked 出力しない）";

const CONTRACT_TYPE_LABELS: Record<LaborContract["contract_type"], string> = {
  indefinite: "期間の定めなし",
  fixed_term: "期間の定めあり",
};

const WAGE_UNIT_LABELS: Record<LaborContract["wage"]["unit"], string> = {
  hourly: "時間給",
  daily: "日給",
  weekly: "週給",
  monthly: "月給",
  piece_rate: "出来高払",
};

const DISCLOSURE_KEYS: readonly DisclosureKey[] = [
  "contract_period",
  "renewal_criteria",
  "renewal_cap",
  "workplace",
  "workplace_change_scope",
  "duties",
  "duties_change_scope",
  "working_hours",
  "overtime",
  "breaks",
  "holidays",
  "leave",
  "shift_rotation",
  "wage_calculation",
  "wage_closing_and_payment",
  "retirement",
  "pay_raise",
  "retirement_allowance",
  "bonus",
  "consultation_desk",
  "treatment_explanation_right",
  "conversion_application",
  "post_conversion_terms",
];

export interface DraftInput {
  contract: LaborContract;
  companyName: string;
  generatedOn: string;
  conversionRightArises: boolean | null;
}

function conversionItemsRequired(input: DraftInput): boolean {
  const { contract } = input;
  if (contract.contract_type !== "fixed_term") return false;
  if (contract.concluded_on < DISCLOSURE_AMENDMENT_2024_EFFECTIVE) return false;
  return input.conversionRightArises !== false;
}

function requiredKeys(input: DraftInput): Set<DisclosureKey> {
  const keys = new Set(requiredDisclosures(input.contract).map((requirement) => requirement.key));
  if (conversionItemsRequired(input)) {
    keys.add("conversion_application");
    keys.add("post_conversion_terms");
  }
  return keys;
}

function disclosureValue(
  contract: LaborContract,
  key: DisclosureKey,
  required: Set<DisclosureKey>
): string {
  const value = contract.disclosures[key];
  if (value) return value;
  return required.has(key) ? MISSING_VALUE : NOT_APPLICABLE_VALUE;
}

function periodText(contract: LaborContract): string {
  if (contract.contract_type === "indefinite")
    return `${CONTRACT_TYPE_LABELS.indefinite}（${contract.start_date} から）`;
  return `${CONTRACT_TYPE_LABELS.fixed_term}（${contract.start_date} 〜 ${contract.end_date ?? MISSING_VALUE}）`;
}

export function missingRequiredItems(input: DraftInput): DisclosureKey[] {
  return [...requiredKeys(input)].filter((key) => !input.contract.disclosures[key]);
}

export function buildDraftVars(input: DraftInput): Record<string, string> {
  const { contract } = input;
  const required = requiredKeys(input);
  const disclosures = Object.fromEntries(
    DISCLOSURE_KEYS.map((key) => [key, disclosureValue(contract, key, required)])
  );
  return {
    ...disclosures,
    company_name: input.companyName,
    contract_id: contract.id,
    employee_id: contract.employee_id,
    concluded_on: contract.concluded_on,
    generated_on: input.generatedOn,
    contract_period_dates: periodText(contract),
    probation: contract.probation_months ? `${contract.probation_months}か月` : "なし",
    workplace_prefecture: contract.workplace_prefecture,
    wage_unit: WAGE_UNIT_LABELS[contract.wage.unit],
    wage_amount: WAGE_AMOUNT_PLACEHOLDER,
  };
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{{${key}}}`, value),
    template
  );
}
