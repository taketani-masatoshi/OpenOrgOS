import { z } from "zod";
import { transactionAmountSchema } from "../protocol/transaction-record.js";
import { noticeWireTypeSchema } from "../protocol/pending-notice.js";
import { orgActivityScopeSchema } from "./scope.js";
import { orgApprovalTierSchema } from "./tier.js";

export const orgApprovalStatusSchema = z.enum([
  "pending_approval",
  "approved",
  "rejected",
  "completed",
]);

export const orgApprovalIdSchema = z.string().regex(/^(APR|NOTICE)-\d{8}-\d{3}$/);

export const orgWireOutboundDetailsSchema = z.object({
  peer_id: z.string().regex(/^PEER-\d{3}$/),
  transaction_type: noticeWireTypeSchema,
  contract_id: z.string().optional(),
  invoice_id: z.string().optional(),
  broker_instruction: z.string().optional(),
  stakeholder_id: z.string().optional(),
  correlation_event_id: z.string().uuid().optional(),
  company_event_id: z.string().regex(/^EVT-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  transaction_id: z.string().optional(),
  wire_event_id: z.string().uuid().optional(),
});

export const orgApprovalRequestSchema = z
  .object({
    approval_id: orgApprovalIdSchema,
    scope: orgActivityScopeSchema,
    status: orgApprovalStatusSchema,
    proposed_at: z.string().min(1),
    proposed_by: z.string().min(1),
    subject_type: z.string().min(1),
    subject_ref: z.string().optional(),
    amount: transactionAmountSchema.optional(),
    message: z.string().optional(),
    approval_policy_ref: z.string().optional(),
    approval_tier: orgApprovalTierSchema.optional(),
    approver_id: z.string().optional(),
    co_approver_id: z.string().optional(),
    approved_at: z.string().optional(),
    rejected_at: z.string().optional(),
    reject_reason: z.string().optional(),
    audit_event_id: z.string().uuid().optional(),
    wire: orgWireOutboundDetailsSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.scope === "wire" && !val.wire) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wire scope requires wire details",
        path: ["wire"],
      });
    }
  });

export const orgApprovalRegistrySchema = z.object({
  as_of: z.string().optional(),
  approvals: z.array(orgApprovalRequestSchema).default([]),
});

export type OrgApprovalStatus = z.output<typeof orgApprovalStatusSchema>;
export type OrgWireOutboundDetails = z.output<typeof orgWireOutboundDetailsSchema>;
export type OrgApprovalRequest = z.output<typeof orgApprovalRequestSchema>;
export type OrgApprovalRegistry = z.output<typeof orgApprovalRegistrySchema>;
