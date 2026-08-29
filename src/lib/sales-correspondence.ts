/**
 * Sales correspondence draft helpers.
 */
import {
  createCorrespondenceDraft,
  saveCorrespondenceDraft,
} from "./correspondence/draft.js";
import { findDeal } from "./sales-deal-service.js";
import { loadSalesInquiries } from "./data.js";
import { appendAuditEvent } from "./audit-log.js";

export function createSalesOutreachDraft(opts: {
  dealId: string;
  to: string;
  subject: string;
  body: string;
  actor: string;
}) {
  const deal = findDeal(opts.dealId);
  if (!deal) throw new Error(`deal not found: ${opts.dealId}`);
  const { draft } = createCorrespondenceDraft({
    channel: "email",
    createdBy: opts.actor,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    notes: `sales_outreach deal=${opts.dealId}`,
    proposeApproval: true,
  });
  const saved = saveCorrespondenceDraft({ ...draft, deal_id: opts.dealId });
  appendAuditEvent({
    event: "sales_stage_change",
    ref: opts.dealId,
    actor: opts.actor,
    detail: `draft:${saved.draft_id}`,
  });
  return saved;
}

export function createSalesInquiryResponseDraft(opts: {
  inquiryId: string;
  to: string;
  subject: string;
  body: string;
  actor: string;
}) {
  const inquiry = loadSalesInquiries()?.inquiries.find((i) => i.id === opts.inquiryId);
  if (!inquiry) throw new Error(`inquiry not found: ${opts.inquiryId}`);
  const { draft } = createCorrespondenceDraft({
    channel: "email",
    createdBy: opts.actor,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    notes: `sales_inquiry inquiry=${opts.inquiryId}`,
    proposeApproval: true,
  });
  const saved = saveCorrespondenceDraft({ ...draft, inquiry_id: opts.inquiryId });
  appendAuditEvent({
    event: "sales_stage_change",
    ref: opts.inquiryId,
    actor: opts.actor,
    detail: `draft:${saved.draft_id}`,
  });
  return saved;
}
