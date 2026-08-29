import { z } from "zod";
import { monthString } from "../../../../../../schemas/common.js";
import {
  consumptionTaxClaimKindSchema,
  consumptionTaxGateSchema,
} from "../../../../../../schemas/finance/consumption-tax.js";

export const consumptionRefundClaimStatusSchema = z.enum([
  "draft",
  "blocked",
  "advisor_review",
  "ready_to_file",
  "filed_by_human",
  "received",
  "rejected",
]);

export const consumptionRefundClaimSchema = z.object({
  id: z.string().regex(/^CLAIM-\d{4}-\d{2}-[a-z_]+$/),
  kind: consumptionTaxClaimKindSchema,
  period: monthString,
  assessment_period: monthString,
  amount_yen: z.number().int().nonnegative(),
  status: consumptionRefundClaimStatusSchema,
  gate: consumptionTaxGateSchema,
  gate_reason: z.string().min(1),
  exception_basis: z.string().min(1).optional(),
  evidence_paths: z.array(z.string().min(1)).default([]),
  refund_bank_account_id: z.string().min(1).optional(),
  filed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  received_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expected_received_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  journal_entry_id: z.string().regex(/^JE-[A-Z0-9-]+$/).optional(),
});

export const consumptionRefundClaimsFileSchema = z.object({
  entity: z.string().min(1),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  claims: z.array(consumptionRefundClaimSchema).default([]),
});

export type ConsumptionRefundClaim = z.output<typeof consumptionRefundClaimSchema>;
export type ConsumptionRefundClaimStatus = z.output<typeof consumptionRefundClaimStatusSchema>;
export type ConsumptionRefundClaimsFile = z.output<typeof consumptionRefundClaimsFileSchema>;
