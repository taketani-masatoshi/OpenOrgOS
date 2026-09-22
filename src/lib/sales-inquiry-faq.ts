/**
 * Inbound FAQ match + reply proposal (one step before send).
 * Path: src/lib/sales-inquiry-faq.ts
 *
 * L2 body/contact never appear in ProposeReport / CLI stdout — only refs.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  salesFaqFileSchema,
  type SalesFaqEntry,
  type SalesFaqFile,
  type SalesInquiry,
} from "../../schemas/index.js";
import { loadSalesInquiries } from "./data.js";
import { collectSalesInquiryAlerts } from "./sales-inbound-view.js";
import { getDataDir, readYamlFile } from "./utils.js";
import { createSalesInquiryResponseDraft } from "./sales-correspondence.js";
import { flattenProposeReport, makeProposeReport } from "./propose/report.js";

const FAQ_REL = "data/sales/inbound/faq.yaml";

export function loadSalesFaq(): SalesFaqFile | undefined {
  const path = join(getDataDir(), "sales", "inbound", "faq.yaml");
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, salesFaqFileSchema);
}

export function scoreFaqMatch(inquiry: SalesInquiry, entry: SalesFaqEntry): number {
  let score = 0;
  const hay = `${inquiry.subject}\n${inquiry.notes ?? ""}`.toLowerCase();
  const tags = new Set((inquiry.tags ?? []).map((t) => t.toLowerCase()));
  for (const tag of entry.tags) {
    if (tags.has(tag.toLowerCase())) score += 3;
  }
  for (const kw of entry.keywords) {
    if (hay.includes(kw.toLowerCase())) score += 2;
  }
  // Generic FAQ-003 (empty tags/keywords) is fallback only
  if (entry.tags.length === 0 && entry.keywords.length === 0) score += 0.1;
  return score;
}

export function matchFaq(
  inquiry: SalesInquiry,
  faq: SalesFaqFile,
): { entry: SalesFaqEntry; score: number } | undefined {
  let best: { entry: SalesFaqEntry; score: number } | undefined;
  for (const entry of faq.entries) {
    const score = scoreFaqMatch(inquiry, entry);
    if (!best || score > best.score) best = { entry, score };
  }
  if (!best || best.score < 1) {
    const fallback = faq.entries.find((e) => e.tags.length === 0 && e.keywords.length === 0);
    if (fallback) return { entry: fallback, score: 0.1 };
    return undefined;
  }
  return best;
}

export function renderFaqTemplates(
  entry: SalesFaqEntry,
  inquiry: SalesInquiry,
): { subject: string; body: string } {
  const map: Record<string, string> = {
    company: inquiry.company,
    subject: inquiry.subject,
    inquiry_id: inquiry.id,
  };
  const fill = (template: string) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "");
  return { subject: fill(entry.subject_template).trim(), body: fill(entry.body_template).trim() };
}

function resolveL2Refs(inquiry: SalesInquiry): {
  body_ref: string | null;
  reply_to_contact_ref: string | null;
  body_ref_exists: boolean;
  missing_refs: string[];
} {
  const missing_refs: string[] = [];
  const body_ref = inquiry.body_ref ?? null;
  const reply_to_contact_ref = inquiry.reply_to_contact_ref ?? null;
  let body_ref_exists = false;
  if (body_ref) {
    // Tenant-relative from tenant root (sibling of data/)
    const fromTenantRoot = join(getDataDir(), "..", body_ref);
    const fromData = join(getDataDir(), body_ref);
    body_ref_exists = existsSync(fromTenantRoot) || existsSync(fromData);
    if (!body_ref_exists) missing_refs.push(`body_ref:${body_ref}`);
  }
  return { body_ref, reply_to_contact_ref, body_ref_exists, missing_refs };
}

export type InquiryDeadlineGate = {
  blocked: boolean;
  reason: string | null;
  alert_type: string | null;
  days_remaining: number | null;
};

export function evaluateInquiryDeadlineGate(
  inquiry: SalesInquiry,
  asOf: string,
  slaDays: number,
): InquiryDeadlineGate {
  const alerts = collectSalesInquiryAlerts([inquiry], {
    asOf,
    staleDays: slaDays,
  });
  const hit = alerts[0];
  if (!hit) {
    return { blocked: false, reason: null, alert_type: null, days_remaining: null };
  }
  const overdue = hit.alert_type === "overdue_action" || hit.alert_type === "stale_new";
  return {
    blocked: overdue,
    reason: hit.summary,
    alert_type: hit.alert_type,
    days_remaining: hit.days_remaining,
  };
}

/** Propose FAQ reply — no send, no L2 body/contact values in the report. */
export function renderInquiryReplyProposeReport(input: {
  inquiryId: string;
  asOf?: string;
}): Record<string, unknown> {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const file = loadSalesInquiries();
  const inquiry = file?.inquiries.find((i) => i.id === input.inquiryId);
  const faq = loadSalesFaq();
  const inputs_ref: string[] = [];
  if (file) inputs_ref.push("data/sales/inbound/inquiries.yaml");
  if (faq) inputs_ref.push(FAQ_REL);

  if (!inquiry) {
    return flattenProposeReport(
      makeProposeReport({
        kind: "inquiry-reply-propose-report",
        depth: "L0",
        inputs_ref,
        human_gate: { apply: "human", sent: false },
        payload: {
          inquiryId: input.inquiryId,
          found: false,
          faq_id: null,
          proposed_subject: null,
          proposed_body_excerpt: null,
          draft_id: null,
          sent: false,
          deadline_gate: { blocked: false, reason: null, alert_type: null, days_remaining: null },
          l2: { body_ref: null, reply_to_contact_ref: null, chat_export: false },
          missing_refs: [`inquiry:${input.inquiryId}`],
        },
      }),
    );
  }

  const matched = faq ? matchFaq(inquiry, faq) : undefined;
  const rendered = matched ? renderFaqTemplates(matched.entry, inquiry) : undefined;
  const slaDays = faq?.first_response_sla_days ?? 3;
  const deadline_gate = evaluateInquiryDeadlineGate(inquiry, asOf, slaDays);
  const l2 = resolveL2Refs(inquiry);
  const excerpt = rendered
    ? rendered.body.split("\n").slice(0, 4).join("\n").slice(0, 200)
    : null;

  return flattenProposeReport(
    makeProposeReport({
      kind: "inquiry-reply-propose-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: {
        inquiryId: inquiry.id,
        company: inquiry.company,
        subject: inquiry.subject,
        status: inquiry.status,
        found: true,
        faq_id: matched?.entry.id ?? null,
        faq_title: matched?.entry.title ?? null,
        match_score: matched?.score ?? 0,
        proposed_subject: rendered?.subject ?? null,
        /** Short L1 excerpt of the FAQ template only — not the inquiry vault body */
        proposed_body_excerpt: excerpt,
        proposed_next_action: matched?.entry.next_action ?? "回答下書きを承認待ち",
        draft_id: null,
        sent: false,
        deadline_gate,
        l2: {
          body_ref: l2.body_ref,
          reply_to_contact_ref: l2.reply_to_contact_ref,
          body_ref_exists: l2.body_ref_exists,
          /** Explicit: never dump L2 into chat */
          chat_export: false,
          access_hint: "Privacy Mode で @file 参照のみ。チャットへの本文・連絡先転記は禁止",
        },
        missing_refs: l2.missing_refs,
      },
    }),
  );
}

/**
 * Write correspondence draft from FAQ (or explicit subject/body).
 * Does not send. Requires human approval path afterward.
 */
export function writeInquiryReplyDraft(input: {
  inquiryId: string;
  to: string;
  actor: string;
  asOf?: string;
  subject?: string;
  body?: string;
}): {
  draft_id: string;
  report: Record<string, unknown>;
} {
  const propose = renderInquiryReplyProposeReport({
    inquiryId: input.inquiryId,
    asOf: input.asOf,
  });
  if (!propose.found) {
    throw new Error(`inquiry not found: ${input.inquiryId}`);
  }
  const faq = loadSalesFaq();
  const inquiry = loadSalesInquiries()?.inquiries.find((i) => i.id === input.inquiryId);
  if (!inquiry) throw new Error(`inquiry not found: ${input.inquiryId}`);
  const matched = faq ? matchFaq(inquiry, faq) : undefined;
  const rendered = matched ? renderFaqTemplates(matched.entry, inquiry) : undefined;
  const subject = input.subject ?? (rendered?.subject as string | undefined);
  const body = input.body ?? (rendered?.body as string | undefined);
  if (!subject || !body) {
    throw new Error("no FAQ match and no --subject/--body; cannot draft");
  }
  // Never append vault body to draft automatically — human @file if needed
  const draft = createSalesInquiryResponseDraft({
    inquiryId: input.inquiryId,
    to: input.to,
    subject,
    body:
      body +
      (inquiry.body_ref
        ? `\n\n---\n（注: 問合せ本文は body_ref=${inquiry.body_ref} — 下書きに自動転記していません）\n`
        : ""),
    actor: input.actor,
  });
  const report = {
    ...propose,
    draft_id: draft.draft_id,
    sent: false,
    human_gate: { apply: "human", sent: false },
  };
  return { draft_id: draft.draft_id, report };
}

/** Batch SLA overdue → propose reports (no send). */
export function renderInquirySlaGateReport(input?: { asOf?: string }): Record<string, unknown> {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const file = loadSalesInquiries();
  const faq = loadSalesFaq();
  const inquiries = file?.inquiries ?? [];
  const slaDays = faq?.first_response_sla_days ?? 3;
  const blocked: Array<Record<string, unknown>> = [];
  for (const inquiry of inquiries) {
    if (inquiry.status === "closed" || inquiry.status === "responded") continue;
    const gate = evaluateInquiryDeadlineGate(inquiry, asOf, slaDays);
    if (!gate.blocked) continue;
    const propose = renderInquiryReplyProposeReport({ inquiryId: inquiry.id, asOf });
    blocked.push({
      inquiryId: inquiry.id,
      company: inquiry.company,
      deadline_gate: gate,
      faq_id: propose.faq_id,
      draft_id: null,
      sent: false,
    });
  }
  const inputs_ref: string[] = [];
  if (file) inputs_ref.push("data/sales/inbound/inquiries.yaml");
  if (faq) inputs_ref.push(FAQ_REL);
  return flattenProposeReport(
    makeProposeReport({
      kind: "inquiry-sla-gate-report",
      depth: inputs_ref.length > 0 ? "L2" : "L0",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: {
        as_of: asOf,
        blocked_count: blocked.length,
        blocked,
        sent: false,
        note: "期限超過は検知し回答下書き提案まで。送信・自動ブロック適用は人間",
      },
    }),
  );
}
