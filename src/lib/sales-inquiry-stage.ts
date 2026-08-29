/**
 * Inquiry status transitions — pure + persist.
 */
import type { SalesInquiry, SalesInquiryStatus } from "../../schemas/sales.js";
import {
  loadSalesInquiries,
  saveSalesInquiries,
} from "./data.js";
import { appendAuditEvent } from "./audit-log.js";

const ALLOWED: Record<SalesInquiryStatus, readonly SalesInquiryStatus[]> = {
  new: ["triaged", "closed"],
  triaged: ["responded", "qualified", "closed"],
  responded: ["qualified", "closed"],
  qualified: ["closed"],
  closed: [],
};

export class SalesInquiryStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesInquiryStageError";
  }
}

export function canTransitionInquiry(
  from: SalesInquiryStatus,
  to: SalesInquiryStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function setInquiryStatus(opts: {
  inquiryId: string;
  toStatus: SalesInquiryStatus;
  actor?: string;
}): SalesInquiry {
  const file = loadSalesInquiries();
  const inquiry = file?.inquiries.find((i) => i.id === opts.inquiryId);
  if (!inquiry || !file) {
    throw new SalesInquiryStageError(`inquiry not found: ${opts.inquiryId}`);
  }
  if (!canTransitionInquiry(inquiry.status, opts.toStatus)) {
    throw new SalesInquiryStageError(
      `illegal inquiry transition ${inquiry.status} → ${opts.toStatus}`,
    );
  }
  const next: SalesInquiry = { ...inquiry, status: opts.toStatus };
  const idx = file.inquiries.findIndex((i) => i.id === opts.inquiryId);
  file.inquiries[idx] = next;
  saveSalesInquiries(file);
  appendAuditEvent({
    event: "sales_stage_change",
    ref: opts.inquiryId,
    actor: opts.actor,
    detail: `inquiry:${inquiry.status}→${opts.toStatus}`,
  });
  return next;
}
