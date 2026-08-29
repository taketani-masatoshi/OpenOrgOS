/**
 * OrgOS case status for correspondence compose / post-send updates.
 */
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { SalesDeal, SalesInquiry } from "../../../schemas/sales.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import {
  loadSalesInquiries,
  loadSalesPipeline,
  saveSalesInquiries,
  saveSalesPipeline,
} from "../data.js";
import { findSchedulingCase, updateSchedulingCase } from "../scheduling-coordination/store.js";
import { currentDate } from "../utils.js";
import { appendAuditEvent } from "../audit-log.js";

export type CorrespondenceCaseKind = "inquiry" | "deal" | "scheduling";

export interface CorrespondenceCaseRef {
  kind: CorrespondenceCaseKind;
  id: string;
  status: string;
  next_action?: string;
  next_action_due?: string;
  mail_thread_ids: string[];
  gmail_thread_ids: string[];
  company?: string;
  subject?: string;
}

export function parseCaseRefFromDraft(
  draft: Pick<CorrespondenceDraft, "inquiry_id" | "deal_id" | "notes">,
): CorrespondenceCaseRef | undefined {
  if (draft.inquiry_id) {
    const ref = loadCorrespondenceCaseRef(draft.inquiry_id);
    if (ref) return ref;
  }
  if (draft.deal_id) {
    const ref = loadCorrespondenceCaseRef(draft.deal_id);
    if (ref) return ref;
  }
  const fromNotes = draft.notes?.match(
    /\bcase:(INQ-\d{4}-\d{3}|DEAL-\d{4}-\d{3}|SCH-\d{4}-\d{3})\b/,
  )?.[1];
  if (fromNotes) return loadCorrespondenceCaseRef(fromNotes);
  const sch = draft.notes?.match(/\bscheduling-case:(SCH-\d{4}-\d{3})\b/)?.[1];
  if (sch) return loadCorrespondenceCaseRef(sch);
  return undefined;
}

export function loadCorrespondenceCaseRef(id: string): CorrespondenceCaseRef | undefined {
  if (id.startsWith("INQ-")) {
    const inq = loadSalesInquiries()?.inquiries.find((i) => i.id === id);
    if (!inq) return undefined;
    return inquiryToRef(inq);
  }
  if (id.startsWith("DEAL-")) {
    const deal = loadSalesPipeline()?.deals.find((d) => d.id === id);
    if (!deal) return undefined;
    return dealToRef(deal);
  }
  if (id.startsWith("SCH-")) {
    const sch = findSchedulingCase(id);
    if (!sch) return undefined;
    return schedulingToRef(sch);
  }
  return undefined;
}

function inquiryToRef(inq: SalesInquiry): CorrespondenceCaseRef {
  return {
    kind: "inquiry",
    id: inq.id,
    status: inq.status,
    next_action: inq.next_action,
    next_action_due: inq.next_action_due,
    mail_thread_ids: inq.mail_thread_ids ?? [],
    gmail_thread_ids: inq.gmail_thread_ids ?? [],
    company: inq.company,
    subject: inq.subject,
  };
}

function dealToRef(deal: SalesDeal): CorrespondenceCaseRef {
  return {
    kind: "deal",
    id: deal.id,
    status: deal.stage,
    next_action: deal.next_action,
    next_action_due: deal.next_action_due,
    mail_thread_ids: deal.mail_thread_ids ?? [],
    gmail_thread_ids: deal.gmail_thread_ids ?? [],
    company: deal.counterparty ?? deal.party?.company,
    subject: deal.title,
  };
}

function schedulingToRef(sch: SchedulingCase): CorrespondenceCaseRef {
  return {
    kind: "scheduling",
    id: sch.id,
    status: sch.status,
    next_action: sch.next_action,
    next_action_due: sch.reminder_due_at?.slice(0, 10),
    mail_thread_ids: sch.mail_thread_ids ?? [],
    gmail_thread_ids: [],
    subject: sch.title,
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function handleCorrespondenceCaseSent(
  draft: CorrespondenceDraft,
  opts?: { nextActionDue?: string; actor?: string },
): CorrespondenceCaseRef | undefined {
  const caseRef = parseCaseRefFromDraft(draft);
  if (!caseRef) return undefined;

  const due = opts?.nextActionDue ?? addDays(currentDate(), 7);

  if (caseRef.kind === "inquiry") {
    const file = loadSalesInquiries();
    const idx = file?.inquiries.findIndex((i) => i.id === caseRef.id) ?? -1;
    if (idx < 0 || !file) return caseRef;
    const inq = file.inquiries[idx]!;
    if (inq.status === "new" || inq.status === "triaged") {
      file.inquiries[idx] = {
        ...inq,
        status: "responded",
        next_action: inq.next_action ?? "フォローアップ確認",
        next_action_due: due,
      };
      saveSalesInquiries(file);
      appendAuditEvent({
        event: "sales_intake",
        ref: inq.id,
        actor: opts?.actor ?? draft.sent_by,
        detail: `responded via ${draft.draft_id}`,
      });
    }
    return loadCorrespondenceCaseRef(caseRef.id);
  }

  if (caseRef.kind === "deal") {
    const file = loadSalesPipeline();
    const idx = file?.deals.findIndex((d) => d.id === caseRef.id) ?? -1;
    if (idx < 0 || !file) return caseRef;
    const deal = file.deals[idx]!;
    file.deals[idx] = {
      ...deal,
      next_action: deal.next_action ?? "先方返信待ち",
      next_action_due: due,
      stage_entered_on: deal.stage_entered_on ?? currentDate(),
      tags: Array.from(new Set([...(deal.tags ?? []), "outbound_sent"])),
    };
    saveSalesPipeline(file);
    appendAuditEvent({
      event: "sales_stage_change",
      ref: deal.id,
      actor: opts?.actor ?? draft.sent_by,
      detail: `follow-up via ${draft.draft_id}; next_action_due=${due}`,
    });
    return loadCorrespondenceCaseRef(caseRef.id);
  }

  if (caseRef.kind === "scheduling") {
    const sch = findSchedulingCase(caseRef.id);
    if (sch) {
      updateSchedulingCase(sch.id, sch.revision, (current) => ({
        ...current,
        reminder_due_at: due,
      }));
    }
    return loadCorrespondenceCaseRef(caseRef.id);
  }

  return caseRef;
}
