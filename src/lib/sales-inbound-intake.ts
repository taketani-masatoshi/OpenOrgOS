/**
 * Mail triage → inbound inquiries.yaml intake (deterministic, L1 only).
 */
import type { MailTriageEntry } from "../../schemas/correspondence/mail-triage.js";
import type { SalesInquiry } from "../../schemas/index.js";
import { salesInquiriesFileSchema } from "../../schemas/sales.js";
import {
  loadSalesInquiries,
  saveSalesInquiries,
} from "./data.js";
import { currentDate } from "./utils.js";
import { appendAuditEvent } from "./audit-log.js";
import { linkMailTriageEntry } from "./sales-mail-link.js";
import {
  loadMailTriageQueue,
  saveMailTriageQueue,
} from "./correspondence/mail-triage-queue.js";

export interface InboundIntakeResult {
  created: string[];
  skipped: string[];
  dry_run: boolean;
}

function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function companyFromTriageEntry(entry: MailTriageEntry): string {
  const email = extractEmailAddress(entry.from);
  const domain = extractDomain(email);
  if (!domain) return "Unknown sender";
  const parts = domain.split(".");
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return domain;
}

function receivedOnFromEntry(entry: MailTriageEntry): string {
  const iso = entry.received_at?.slice(0, 10);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return currentDate();
}

export function nextInquiryId(
  inquiries: SalesInquiry[],
  year = currentDate().slice(0, 4),
): string {
  let max = 0;
  const prefix = `INQ-${year}-`;
  for (const i of inquiries) {
    if (!i.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(i.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function findExistingInquiryBySourceRef(
  inquiries: SalesInquiry[],
  sourceRef: string,
): SalesInquiry | undefined {
  return inquiries.find((i) => i.source_ref === sourceRef);
}

export function intakeInquiriesFromTriage(opts?: {
  dryRun?: boolean;
}): InboundIntakeResult {
  const dryRun = opts?.dryRun ?? false;
  const queue = loadMailTriageQueue();
  const file =
    loadSalesInquiries() ??
    salesInquiriesFileSchema.parse({ version: 1, inquiries: [] });
  const created: string[] = [];
  const skipped: string[] = [];
  let inquiries = [...file.inquiries];
  let queueChanged = false;

  for (const entry of queue.entries) {
    if (entry.routing !== "sales_inbound") continue;
    if (entry.handoff_status !== "pending") continue;
    if (entry.disposition === "spam") {
      skipped.push(entry.id);
      continue;
    }

    const sourceRef = entry.id;
    const existing = findExistingInquiryBySourceRef(inquiries, sourceRef);
    if (existing) {
      skipped.push(entry.id);
      continue;
    }

    if (entry.gmail_thread_id) {
      const byGmail = inquiries.find(
        (i) => i.gmail_thread_ids?.includes(entry.gmail_thread_id!),
      );
      if (byGmail) {
        skipped.push(entry.id);
        continue;
      }
    }

    const inquiryId = nextInquiryId(inquiries);
    const inquiry: SalesInquiry = {
      id: inquiryId,
      subject: entry.subject,
      status: "new",
      source: "email",
      source_ref: sourceRef,
      company: companyFromTriageEntry(entry),
      received_on: receivedOnFromEntry(entry),
      priority: entry.importance === "p0" || entry.importance === "p1" ? "high" : "normal",
      mail_thread_ids: entry.mail_thread_ids.length ? entry.mail_thread_ids : undefined,
      gmail_thread_ids: entry.gmail_thread_id ? [entry.gmail_thread_id] : undefined,
    };

    if (dryRun) {
      created.push(inquiryId);
      inquiries.push(inquiry);
      continue;
    }

    inquiries.push(inquiry);
    const idx = queue.entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      queue.entries[idx] = {
        ...queue.entries[idx],
        handoff_status: "handed_off",
        handoff_ref: inquiryId,
      };
      queueChanged = true;
    }
    created.push(inquiryId);
  }

  if (!dryRun && (created.length > 0 || queueChanged)) {
    saveSalesInquiries({
      version: 1,
      updated_at: new Date().toISOString(),
      inquiries,
    });
    if (queueChanged) saveMailTriageQueue(queue);
    for (const id of created) {
      appendAuditEvent({ event: "sales_intake", ref: id, detail: "inquiry_created" });
      const entry = queue.entries.find((e) => e.handoff_ref === id);
      if (entry) linkMailTriageEntry(entry, { forceTarget: { kind: "inquiry", id } });
    }
  }

  return { created, skipped, dry_run: dryRun };
}

export function runSalesInboundIntake(opts?: { dryRun?: boolean }): void {
  const result = intakeInquiriesFromTriage(opts);
  if (result.dry_run) {
    console.log(`[dry-run] 起票予定: ${result.created.length} 件`);
  } else {
    console.log(`起票完了: ${result.created.length} 件`);
  }
  if (result.created.length > 0) {
    for (const id of result.created) console.log(`  + ${id}`);
  }
  if (result.skipped.length > 0) {
    console.log(`スキップ: ${result.skipped.length} 件`);
  }
}
