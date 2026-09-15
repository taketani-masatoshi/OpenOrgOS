import { z } from "zod";

/**
 * 確定申告書B 所得控除の手入力正本（扶養判定エンジンは持たない）。
 * Path: data/finance/blue-return-income-deductions.yaml
 */
export const blueReturnIncomeDeductionsSchema = z.object({
  version: z.union([z.literal(1), z.number()]).default(1),
  calendar_year: z.number().int().min(2000).max(2100),
  social_insurance_yen: z.number().int().nonnegative().default(0),
  life_insurance_yen: z.number().int().nonnegative().default(0),
  earthquake_insurance_yen: z.number().int().nonnegative().default(0),
  /** 配偶者特別控除など、人が算定した控除額 */
  spouse_special_yen: z.number().int().nonnegative().default(0),
  /** 扶養控除合計（人数からの自動算定はしない） */
  dependents_yen: z.number().int().nonnegative().default(0),
  small_enterprise_mutual_yen: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});

export type BlueReturnIncomeDeductions = z.output<typeof blueReturnIncomeDeductionsSchema>;

/** ドラフト用簡易 cap（法令の完全実装ではない）。 */
export const LIFE_INSURANCE_DEDUCTION_CAP_YEN = 120_000;
export const EARTHQUAKE_INSURANCE_DEDUCTION_CAP_YEN = 50_000;
