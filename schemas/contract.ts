import { z } from "zod";
import { dateString, riskLevel } from "./common.js";

export const contractType = z.enum([
  "rental",
  "lease",
  "purchase",
  "director",
  "management",
  "cleaning",
  "ota",
  "insurance",
  "construction",
  "loan",
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

export const contractStatus = z.enum([
  "draft",
  "pending_signature",
  "executed",
  "terminated",
]);

export const counterpartyType = z.enum(["individual", "company"]);

export const contractDocumentsSchema = z.object({
  draft: z.string().optional(),
  executed: z.string().optional(),
  enrollment: z.string().optional(),
});

export const contractCompensationSchema = z.object({
  type: z.enum(["monthly", "hourly", "fixed", "milestone"]).optional(),
  amount: z.number().nonnegative().optional(),
  tax_included: z.boolean().optional(),
  payment_terms: z.string().optional(),
  invoice_registration: z.string().optional(),
});

export const contractSchema = z.object({
  id: z.string().regex(/^CTR-\d{3,}$/),
  name: z.string().min(1),
  counterparty: z.string().min(1),
  counterparty_type: counterpartyType.optional(),
  counterparty_address: z.string().optional(),
  type: contractType,
  status: contractStatus.default("draft"),
  start_date: dateString,
  end_date: dateString.optional(),
  auto_renewal: z.boolean().default(false),
  owner: z.string().optional(),
  property_id: z.string().optional(),
  monthly_cost: z.number().nonnegative().optional(),
  compensation: contractCompensationSchema.optional(),
  scope_summary: z.string().optional(),
  documents: contractDocumentsSchema.optional(),
  executed_date: dateString.optional(),
  conflict_approval_date: dateString.optional(),
  risk: contractRiskSchema.optional(),
  notes: z.string().optional(),
});

export type Contract = z.infer<typeof contractSchema>;
export type ContractType = z.infer<typeof contractType>;
