import { z } from "zod";
import { dateString, monthString } from "../common.js";

/** 青色特別控除の目標額。 */
export const blueReturnDeductionTargetSchema = z.enum(["550000", "650000"]);

/** 65万を狙う場合の提出経路（証跡は別 YAML）。 */
export const blueReturnDeductionPathSchema = z.enum(["etax", "denshi_yuryo", "unset"]);

/** 減価償却の既定方針（特例の仕訳自動分岐は別実装）。 */
export const blueReturnDepreciationPolicySchema = z.enum([
  "ordinary",
  "immediate_under_100k",
  "lump_sum_100_200k",
  "sme_under_300k",
]);

export const blueReturnHomeOfficeSchema = z.object({
  has_home_office: z.boolean(),
  /** 床面積・時間・その他。has_home_office=false なら省略可。 */
  allocation_method: z.enum(["floor_area", "time", "other", "n_a"]).optional(),
  business_pct: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export const blueReturnSetupConsumptionSchema = z.object({
  /** 免税 / 課税 など（tax-profile と突合）。 */
  status: z.string().min(1),
  method: z.enum(["standard", "simplified"]).optional(),
  invoice_registered: z.boolean(),
  invoice_registration_number: z.string().optional(),
  notes: z.string().optional(),
});

export const blueReturnTaxAdvisorHandoffSchema = z.object({
  deadline: dateString,
  owner: z.string().min(1),
  notes: z.string().optional(),
});

/** 事業所得以外（確定申告書B の所得金額等）。配当は総合課税の概算用。 */
export const blueReturnOtherIncomeSchema = z.object({
  dividend_yen: z.number().int().nonnegative().default(0),
  interest_yen: z.number().int().nonnegative().default(0),
  miscellaneous_yen: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});

/**
 * 個人事業主・青色申告の初期セットアップ回答正本。
 * Path: data/finance/blue-return-setup.yaml
 */
export const blueReturnSetupSchema = z.object({
  version: z.union([z.literal(1), z.number()]).default(1),
  calendar_year: z.number().int().min(2000).max(2100),
  opened_on: dateString.optional(),
  blue_return_approved: z.boolean().optional(),
  blue_return_applied_on: dateString.optional(),
  books_start_month: monthString.optional(),
  deduction_target: blueReturnDeductionTargetSchema.optional(),
  deduction_path: blueReturnDeductionPathSchema.optional(),
  consumption: blueReturnSetupConsumptionSchema.optional(),
  home_office: blueReturnHomeOfficeSchema.optional(),
  accounts_separated: z.boolean().optional(),
  has_blue_special_family_employees: z.boolean().optional(),
  depreciation_policy: blueReturnDepreciationPolicySchema.optional(),
  has_withholding_outsourcing: z.boolean().optional(),
  other_income: blueReturnOtherIncomeSchema.optional(),
  tax_advisor_handoff: blueReturnTaxAdvisorHandoffSchema.optional(),
  notes: z.string().optional(),
});

export type BlueReturnSetup = z.output<typeof blueReturnSetupSchema>;
export type BlueReturnDeductionTarget = z.output<typeof blueReturnDeductionTargetSchema>;
export type BlueReturnDepreciationPolicy = z.output<typeof blueReturnDepreciationPolicySchema>;
