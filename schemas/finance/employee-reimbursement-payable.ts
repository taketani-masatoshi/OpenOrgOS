import { z } from "zod";

export const reimbursementBrokerEvidenceSchema = z.object({
  evidence_ref: z.string().min(1),
  instruction_path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  prepared_at: z.string().datetime(),
  prepared_by: z.string().min(1),
  source_bank_account_id: z.string().min(1),
  stakeholder_id: z.string().min(1),
  payee: z.string().min(1),
});

export const employeeReimbursementPayableSchema = z.object({
  claim_id: z.string().regex(/^ECL-\d{8}-\d{3}$/),
  person_id: z.string().min(1),
  employee_id: z.string().min(1),
  amount_yen: z.number().int().positive(),
  status: z.enum(["pending", "paid"]),
  due_date: z.string().date(),
  posted_month: z.string().regex(/^\d{4}-\d{2}$/),
  payment_ref: z.string().min(1).optional(),
  bank_statement_ref: z.string().min(1).optional(),
  settlement_evidence_ref: z.string().min(1).optional(),
  paid_at: z.string().datetime().optional(),
  broker_evidence: reimbursementBrokerEvidenceSchema.optional(),
  journal_entry_ids: z.array(z.string().min(1)).default([]),
});

export const employeeReimbursementPayablesFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: z.string().date().optional(),
  payables: z.array(employeeReimbursementPayableSchema).default([]),
});

export type ReimbursementBrokerEvidence = z.output<
  typeof reimbursementBrokerEvidenceSchema
>;
export type EmployeeReimbursementPayable = z.output<
  typeof employeeReimbursementPayableSchema
>;
export type EmployeeReimbursementPayablesFile = z.output<
  typeof employeeReimbursementPayablesFileSchema
>;
