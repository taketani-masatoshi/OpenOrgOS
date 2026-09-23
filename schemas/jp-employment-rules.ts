import { z } from "zod";
import { isoDate } from "./iso-date.js";

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");
const employeeId = z.string().regex(/^EMP-\d{3,}$/);
const workplaceId = z.string().regex(/^WP-[A-Z0-9-]+$/);
const nonNegativeHours = z.number().min(0);

/** 労働基準法89条1号〜3号の絶対的必要記載事項 */
export const workRulesAbsoluteItem = z.enum([
  "start_end_time",
  "break_time",
  "holidays",
  "leave",
  "shift_rotation",
  "wage_determination",
  "wage_calculation_payment",
  "wage_cutoff_payment_date",
  "wage_raise",
  "retirement_including_dismissal",
]);

/** 労働基準法89条3号の2〜10号の相対的必要記載事項（定めをする場合に記載） */
export const workRulesRelativeItem = z.enum([
  "retirement_allowance",
  "bonus_minimum_wage",
  "worker_cost_burden",
  "safety_health",
  "vocational_training",
  "accident_compensation",
  "commendation_discipline",
  "other_common_rules",
]);

export const workRulesItem = z.union([workRulesAbsoluteItem, workRulesRelativeItem]);

export const agreementWorkCategory = z.enum([
  "general",
  "construction",
  "construction_disaster_recovery",
  "motor_vehicle_driving",
  "physician",
  "new_technology_rnd",
]);

export const notificationMethod = z.enum(["posting", "written_delivery", "electronic"]);

export const representativeSelectionMethod = z.enum([
  "vote",
  "show_of_hands",
  "discussion",
  "employer_appointed",
  "other",
]);

export const laborPartySchema = z.object({
  type: z.enum(["majority_union", "majority_representative"]),
  union_name: z.string().optional(),
  representative_employee_id: employeeId.optional(),
  selection_method: representativeSelectionMethod.optional(),
  representative_is_manager: z.boolean().optional(),
});

export const notificationSchema = z.object({
  method: notificationMethod,
  notified_on: isoDate,
});

export const employmentRulesSourcesFileSchema = z.object({
  retrieved_on: isoDate,
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["law", "ordinance", "guideline", "guide", "form"]),
      articles: z.array(z.string()).default([]),
      notes: z.string().optional(),
    })
  ),
  forms: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["work-rules", "agreement"]),
      name: z.string(),
      template: z.string(),
      legal_basis: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const workplacesFileSchema = z.object({
  as_of: isoDate.optional(),
  workplaces: z.array(
    z.object({
      id: workplaceId,
      name: z.string(),
      labor_standards_office: z.string().optional(),
      /** 常時使用する労働者数（事業場単位 · パート等を含む） */
      regular_headcount: z.number().int().min(0).nullable().optional(),
      headcount_as_of: isoDate.optional(),
      has_shift_work: z.boolean().default(false),
      notes: z.string().optional(),
    })
  ),
});

export const workRulesFileSchema = z.object({
  work_rules: z.array(
    z.object({
      workplace_id: workplaceId,
      title: z.string(),
      established_on: isoDate.optional(),
      last_revised_on: isoDate.optional(),
      filed_on: isoDate.optional(),
      opinion: z
        .object({
          heard_on: isoDate.optional(),
          letter_attached: z.boolean(),
          party: laborPartySchema.optional(),
        })
        .optional(),
      included_items: z.array(workRulesItem).default([]),
      adopted_policies: z.array(workRulesRelativeItem).default([]),
      notification: notificationSchema.optional(),
      notes: z.string().optional(),
    })
  ),
});

export const agreementSchema = z.object({
  id: z.string(),
  workplace_id: workplaceId,
  work_category: agreementWorkCategory.default("general"),
  /** 1年単位の変形労働時間制（対象期間3か月超）の適用有無 */
  variable_hours_over_3_months: z.boolean().default(false),
  covered_workers: z.string().optional(),
  extension_reasons: z.array(z.string()).default([]),
  period_start: isoDate,
  effective_from: isoDate,
  effective_to: isoDate,
  filed_on: isoDate.optional(),
  party: laborPartySchema,
  general: z.object({
    daily_hours: nonNegativeHours.optional(),
    monthly_hours: nonNegativeHours,
    annual_hours: nonNegativeHours,
    holiday_days_per_month: z.number().int().min(0).optional(),
  }),
  special_clause: z
    .object({
      monthly_total_hours: nonNegativeHours,
      annual_overtime_hours: nonNegativeHours,
      max_months_over_limit: z.number().int().min(0),
      circumstances: z.array(z.string()).default([]),
      health_measures: z.array(z.string()).default([]),
      premium_rate_percent: z.number().min(0).optional(),
      procedure: z.string().optional(),
    })
    .optional(),
  confirms_statutory_caps: z.boolean().default(false),
  notification: notificationSchema.optional(),
  notes: z.string().optional(),
});

export const agreementsFileSchema = z.object({
  agreements: z.array(agreementSchema),
});

export const overtimeMonthSchema = z.object({
  month: yearMonth,
  /** 法定労働時間を超える時間外労働（法定休日労働を除く） */
  overtime_hours: nonNegativeHours,
  /** 法定休日労働 */
  holiday_work_hours: nonNegativeHours.default(0),
});

export const overtimeRecordsFileSchema = z.object({
  records: z.array(
    z.object({
      employee_id: employeeId,
      agreement_id: z.string(),
      months: z.array(overtimeMonthSchema).min(1),
    })
  ),
});

export type WorkRulesAbsoluteItem = z.output<typeof workRulesAbsoluteItem>;
export type WorkRulesRelativeItem = z.output<typeof workRulesRelativeItem>;
export type WorkRulesItem = z.output<typeof workRulesItem>;
export type AgreementWorkCategory = z.output<typeof agreementWorkCategory>;
export type LaborParty = z.output<typeof laborPartySchema>;
export type Workplace = z.output<typeof workplacesFileSchema>["workplaces"][number];
export type WorkRulesRecord = z.output<typeof workRulesFileSchema>["work_rules"][number];
export type OvertimeAgreement = z.output<typeof agreementSchema>;
export type OvertimeMonth = z.output<typeof overtimeMonthSchema>;
export type OvertimeRecord = z.output<typeof overtimeRecordsFileSchema>["records"][number];
export type EmploymentRulesSources = z.output<typeof employmentRulesSourcesFileSchema>;
