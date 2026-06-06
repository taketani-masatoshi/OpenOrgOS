import { z } from "zod";
import { dateString, riskLevel } from "./common.js";

export const contractType = z.enum([
  "rental",
  "management",
  "cleaning",
  "ota",
  "insurance",
  "construction",
  "outsourcing",
  "advisory",
  "system",
  "nda",
  "partnership",
]);

export const contractRiskSchema = z.object({
  renewal_deadline: dateString.optional(),
  termination_deadline: dateString.optional(),
  risk_level: riskLevel.optional(),
  notes: z.string().optional(),
});

export const contractSchema = z.object({
  id: z.string().regex(/^CTR-\d{3,}$/),
  name: z.string().min(1),
  counterparty: z.string().min(1),
  type: contractType,
  start_date: dateString,
  end_date: dateString.optional(),
  auto_renewal: z.boolean().default(false),
  owner: z.string().optional(),
  property_id: z.string().optional(),
  monthly_cost: z.number().nonnegative().optional(),
  risk: contractRiskSchema.optional(),
});

export type Contract = z.infer<typeof contractSchema>;
export type ContractType = z.infer<typeof contractType>;
