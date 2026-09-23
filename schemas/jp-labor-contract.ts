import { z } from "zod";

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, { message: "not a calendar date" });

export const laborAsOfDate = isoDate;

export const laborContractType = z.enum(["indefinite", "fixed_term"]);

export const laborContractRenewal = z.enum(["none", "may_renew", "auto_renew"]);

/** 労基法14条1項: standard = 3年上限 · advanced_professional = 1号 · project_completion = 一定の事業の完了に必要な期間 */
export const laborContractTermBasis = z.enum([
  "standard",
  "advanced_professional",
  "project_completion",
]);

export const laborWageUnit = z.enum(["hourly", "daily", "weekly", "monthly", "piece_rate"]);

export const laborRenewalIntent = z.enum(["renew", "not_renew", "undecided"]);

/** 無期転換の特例（有期雇用特別措置法の認定 · 大学教員等任期法 / 科技イノベ活性化法の10年特例） */
export const laborConversionSpecialMeasure = z.enum([
  "none",
  "fixed_term_special_measures_act",
  "researcher_ten_year_exception",
]);

export const laborRenewalCapType = z.enum(["none", "total_period_months", "renewal_count"]);

const disclosureText = z.string().trim().min(1);

/** 労働条件通知書の記載内容（労基則5条 · パート有期法6条 · 同施行規則2条） */
export const laborDisclosuresSchema = z.object({
  contract_period: disclosureText.optional(),
  renewal_criteria: disclosureText.optional(),
  renewal_cap: disclosureText.optional(),
  workplace: disclosureText.optional(),
  workplace_change_scope: disclosureText.optional(),
  duties: disclosureText.optional(),
  duties_change_scope: disclosureText.optional(),
  working_hours: disclosureText.optional(),
  overtime: disclosureText.optional(),
  breaks: disclosureText.optional(),
  holidays: disclosureText.optional(),
  leave: disclosureText.optional(),
  shift_rotation: disclosureText.optional(),
  wage_calculation: disclosureText.optional(),
  wage_closing_and_payment: disclosureText.optional(),
  retirement: disclosureText.optional(),
  pay_raise: disclosureText.optional(),
  retirement_allowance: disclosureText.optional(),
  bonus: disclosureText.optional(),
  consultation_desk: disclosureText.optional(),
  treatment_explanation_right: disclosureText.optional(),
  conversion_application: disclosureText.optional(),
  post_conversion_terms: disclosureText.optional(),
});

export const laborWageSchema = z.object({
  unit: laborWageUnit,
  base_amount: z.number().nonnegative(),
  /** 最低賃金の対象となる手当（精皆勤・通勤・家族手当、割増賃金、賞与等は含めない） */
  minimum_wage_eligible_allowances: z.number().nonnegative().default(0),
  daily_scheduled_hours: z.number().positive().optional(),
  weekly_scheduled_hours: z.number().positive().optional(),
  monthly_average_scheduled_hours: z.number().positive().optional(),
});

export const laborRenewalCapSchema = z.object({
  type: laborRenewalCapType.default("none"),
  value: z.number().int().positive().optional(),
  introduced_or_shortened_after_initial: z.boolean().default(false),
  reason_explained_on: isoDate.optional(),
});

export const laborContractSchema = z.object({
  id: z.string(),
  employee_id: z.string(),
  contract_type: laborContractType,
  part_time: z.boolean().default(false),
  concluded_on: isoDate,
  start_date: isoDate,
  end_date: isoDate.optional(),
  renewal: laborContractRenewal.default("none"),
  term_basis: laborContractTermBasis.default("standard"),
  age_at_conclusion: z.number().int().nonnegative().optional(),
  probation_months: z.number().nonnegative().optional(),
  shift_work: z.boolean().default(false),
  workplace_prefecture: z.string(),
  wage: laborWageSchema,
  disclosures: laborDisclosuresSchema.default({}),
  renewal_cap: laborRenewalCapSchema.default({ type: "none" }),
  renewal_intent: laborRenewalIntent.default("undecided"),
  non_renewal_specified_in_advance: z.boolean().default(false),
  conversion_special_measure: laborConversionSpecialMeasure.default("none"),
  notes: z.string().optional(),
});

export const laborContractsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  contracts: z.array(laborContractSchema),
});

export const fixedTermHistoryFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  periods: z.array(
    z.object({
      employee_id: z.string(),
      contract_id: z.string().optional(),
      start_date: isoDate,
      end_date: isoDate,
      notes: z.string().optional(),
    })
  ),
});

export const minimumWagesFileSchema = z.object({
  fiscal_year_label: z.string(),
  source_url: z.string().url(),
  retrieved_on: isoDate,
  /** この日より後の判定は新しい改定が発効している可能性があるため needs_review */
  verified_through: isoDate,
  rates: z.array(
    z.object({
      prefecture: z.string(),
      hourly_yen: z.number().int().positive(),
      effective_from: isoDate,
    })
  ),
});

export const laborContractSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["law", "ordinance", "notice", "guide", "data"]),
      retrieved_on: isoDate,
      notes: z.string().optional(),
    })
  ),
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      template: z.string(),
      legal_basis: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export type LaborContract = z.output<typeof laborContractSchema>;
export type LaborDisclosures = z.output<typeof laborDisclosuresSchema>;
export type LaborWage = z.output<typeof laborWageSchema>;
export type LaborRenewalCap = z.output<typeof laborRenewalCapSchema>;
export type FixedTermHistoryPeriod = z.output<typeof fixedTermHistoryFileSchema>["periods"][number];
export type MinimumWagesFile = z.output<typeof minimumWagesFileSchema>;
export type MinimumWageRate = MinimumWagesFile["rates"][number];
export type LaborContractSources = z.output<typeof laborContractSourcesFileSchema>;
