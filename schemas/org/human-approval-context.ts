import { z } from "zod";

export const humanApprovalSourceSchema = z.enum(["cli", "chat_ui", "wire_ui"]);

export const humanApprovalContextSchema = z.object({
  version: z.literal(1),
  context_id: z.string().min(1),
  approval_id: z.string().min(1),
  operator_id: z.string().min(1),
  source: humanApprovalSourceSchema,
  nonce: z.string().min(16),
  issued_at: z.string().min(1),
  expires_at: z.string().min(1),
  subject_digest: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
});

export type HumanApprovalSource = z.output<typeof humanApprovalSourceSchema>;
export type HumanApprovalContext = z.output<typeof humanApprovalContextSchema>;
