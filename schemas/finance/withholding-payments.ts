import { z } from "zod";

/** 報酬・料金等の支払源泉（給与以外）。提出用 XML は出さない。 */
export const withholdingPaymentCategorySchema = z.enum([
  "reward_fee", // 報酬・料金
  "fee_other",
]);

export const withholdingPaymentSchema = z.object({
  payment_id: z.string().min(1),
  payee_id: z.string().min(1).optional(),
  payee_name: z.string().min(1),
  category: withholdingPaymentCategorySchema.default("reward_fee"),
  paid_at: z.string().min(10),
  gross_yen: z.number().int().positive(),
  /** 明示税率。未指定時は報酬料金の原則 10.21% */
  withholding_rate_pct: z.number().min(0).max(100).optional(),
  withholding_yen: z.number().int().nonnegative().optional(),
  expense_account_code: z.string().regex(/^\d{4}$/).default("5100"),
  notes: z.string().optional(),
});

export const withholdingPaymentsFileSchema = z.object({
  version: z.union([z.number(), z.string()]).default(1),
  calendar_year: z.number().int().optional(),
  payments: z.array(withholdingPaymentSchema).default([]),
});

export type WithholdingPayment = z.output<typeof withholdingPaymentSchema>;
export type WithholdingPaymentsFile = z.output<typeof withholdingPaymentsFileSchema>;

/** 所得税法上の報酬・料金等（復興含む概算）。100万円以下は原則 10.21%。超過分は 20.42%（computeRewardFeeWithholdingYen）。 */
export const DEFAULT_REWARD_FEE_WITHHOLDING_RATE_PCT = 10.21;
