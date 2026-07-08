import { z } from "zod";
import {
  transactionAmountSchema,
  transactionTypeSchema,
} from "./transaction-record.js";

export const pendingNoticeStatusSchema = z.enum([
  "pending_approval",
  "approved",
  "rejected",
  "transmitted",
]);

/** Outbound inter-org types that require operator propose → approver approve. */
export const noticeWireTypeSchema = z.enum([
  "contract.execution.notice",
  "obligation.acknowledged",
  "invoice.issued",
  "payment.instructed",
  "contract.executed",
  "contract.void.requested",
]);

export const pendingNoticeSchema = z.object({
  notice_id: z.string().regex(/^NOTICE-\d{8}-\d{3}$/),
  status: pendingNoticeStatusSchema,
  proposed_at: z.string().min(1),
  proposed_by: z.string().min(1),
  peer_id: z.string().regex(/^PEER-\d{3}$/),
  transaction_type: noticeWireTypeSchema,
  contract_id: z.string().optional(),
  invoice_id: z.string().optional(),
  broker_instruction: z.string().optional(),
  stakeholder_id: z.string().optional(),
  amount: transactionAmountSchema.optional(),
  correlation_event_id: z.string().uuid().optional(),
  message: z.string().optional(),
  approver_id: z.string().optional(),
  co_approver_id: z.string().optional(),
  approved_at: z.string().optional(),
  approval_policy_ref: z.string().optional(),
  approval_tier: z.enum(["A", "B", "C"]).optional(),
  transaction_id: z.string().optional(),
  event_id: z.string().optional(),
  rejected_at: z.string().optional(),
  reject_reason: z.string().optional(),
});

export const pendingNoticesRegistrySchema = z.object({
  as_of: z.string().optional(),
  notices: z.array(pendingNoticeSchema).default([]),
});

export type NoticeWireType = z.output<typeof noticeWireTypeSchema>;
export type PendingNotice = z.output<typeof pendingNoticeSchema>;
export type PendingNoticeStatus = z.output<typeof pendingNoticeStatusSchema>;
export type PendingNoticesRegistry = z.output<typeof pendingNoticesRegistrySchema>;