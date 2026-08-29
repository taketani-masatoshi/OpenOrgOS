/**
 * Gmail / mail thread → INQ / DEAL linking.
 */
import type { MailTriageEntry } from "../../schemas/correspondence/mail-triage.js";
import type { SalesDeal, SalesInquiry } from "../../schemas/sales.js";
import {
  loadCustomerAccounts,
  loadCustomerContacts,
  loadSalesInquiries,
  loadSalesPipeline,
  saveSalesInquiries,
  saveSalesPipeline,
} from "./data.js";
import { loadMailTriageQueue } from "./correspondence/mail-triage-queue.js";
import { appendAuditEvent } from "./audit-log.js";
import { extractEmailDomain } from "./sales-mail-utils.js";

export interface MailLinkCandidate {
  kind: "deal" | "inquiry";
  id: string;
  company: string;
  score: number;
}

export interface MailLinkResult {
  auto_linked: Array<{ triage_id: string; target_kind: "deal" | "inquiry"; target_id: string }>;
  ambiguous: Array<{ triage_id: string; candidates: MailLinkCandidate[] }>;
  skipped: string[];
}

function extractDomainFromFrom(from: string): string | undefined {
  const m = from.match(/<([^>]+)>/);
  const email = (m?.[1] ?? from).trim().toLowerCase();
  return extractEmailDomain(email);
}

function scoreCandidates(domain: string | undefined): MailLinkCandidate[] {
  const out: MailLinkCandidate[] = [];
  if (!domain) return out;

  const accounts = loadCustomerAccounts()?.accounts ?? [];
  const accountIds = new Set(
    accounts
      .filter((a) => (a.email_domains ?? []).some((d) => d.toLowerCase() === domain))
      .map((a) => a.id),
  );

  const contacts = loadCustomerContacts()?.contacts ?? [];
  for (const c of contacts) {
    if (c.email && extractEmailDomain(c.email) === domain) {
      accountIds.add(c.account_id);
    }
  }

  const deals = loadSalesPipeline()?.deals ?? [];
  for (const d of deals) {
    if (d.account_id && accountIds.has(d.account_id)) {
      out.push({
        kind: "deal",
        id: d.id,
        company: d.counterparty ?? d.party?.company ?? d.account_id,
        score: 80,
      });
    }
  }

  const inquiries = loadSalesInquiries()?.inquiries ?? [];
  for (const i of inquiries) {
    if (i.account_id && accountIds.has(i.account_id)) {
      out.push({ kind: "inquiry", id: i.id, company: i.company, score: 70 });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

function appendThreadsToDeal(deal: SalesDeal, entry: MailTriageEntry): SalesDeal {
  const mail = new Set(deal.mail_thread_ids ?? []);
  for (const id of entry.mail_thread_ids) mail.add(id);
  const gmail = new Set(deal.gmail_thread_ids ?? []);
  if (entry.gmail_thread_id) gmail.add(entry.gmail_thread_id);
  return {
    ...deal,
    mail_thread_ids: mail.size ? [...mail] : undefined,
    gmail_thread_ids: gmail.size ? [...gmail] : undefined,
  };
}

function appendThreadsToInquiry(inq: SalesInquiry, entry: MailTriageEntry): SalesInquiry {
  const mail = new Set(inq.mail_thread_ids ?? []);
  for (const id of entry.mail_thread_ids) mail.add(id);
  const gmail = new Set(inq.gmail_thread_ids ?? []);
  if (entry.gmail_thread_id) gmail.add(entry.gmail_thread_id);
  return {
    ...inq,
    mail_thread_ids: mail.size ? [...mail] : undefined,
    gmail_thread_ids: gmail.size ? [...gmail] : undefined,
  };
}

export function linkMailTriageEntry(
  entry: MailTriageEntry,
  opts?: { forceTarget?: { kind: "deal" | "inquiry"; id: string }; actor?: string },
): { linked: boolean; ambiguous?: MailLinkCandidate[]; target?: MailLinkCandidate } {
  const domain = extractDomainFromFrom(entry.from);
  const candidates = scoreCandidates(domain);

  let target: MailLinkCandidate | undefined;
  if (opts?.forceTarget) {
    target = candidates.find((c) => c.kind === opts.forceTarget!.kind && c.id === opts.forceTarget!.id);
    if (!target) {
      target = {
        kind: opts.forceTarget.kind,
        id: opts.forceTarget.id,
        company: opts.forceTarget.id,
        score: 100,
      };
    }
  } else if (candidates.length === 1) {
    target = candidates[0];
  } else if (candidates.length > 1) {
    return { linked: false, ambiguous: candidates };
  } else {
    return { linked: false };
  }

  if (target.kind === "deal") {
    const file = loadSalesPipeline();
    const idx = file?.deals.findIndex((d) => d.id === target!.id) ?? -1;
    if (idx < 0 || !file) return { linked: false };
    file.deals[idx] = appendThreadsToDeal(file.deals[idx]!, entry);
    saveSalesPipeline(file);
  } else {
    const file = loadSalesInquiries();
    const idx = file?.inquiries.findIndex((i) => i.id === target!.id) ?? -1;
    if (idx < 0 || !file) return { linked: false };
    file.inquiries[idx] = appendThreadsToInquiry(file.inquiries[idx]!, entry);
    saveSalesInquiries(file);
  }

  appendAuditEvent({
    event: "sales_mail_link",
    ref: entry.id,
    actor: opts?.actor,
    detail: `${target.kind}:${target.id}`,
  });
  return { linked: true, target };
}

export function countAmbiguousMailLinks(): number {
  const queue = loadMailTriageQueue();
  let count = 0;
  for (const entry of queue.entries) {
    if (entry.routing !== "sales_inbound" && entry.routing !== "secretary") continue;
    const domain = extractDomainFromFrom(entry.from);
    const candidates = scoreCandidates(domain);
    if (candidates.length > 1) count += 1;
  }
  return count;
}

export function runSalesMailLinkFromTriage(opts?: {
  actor?: string;
}): MailLinkResult {
  const queue = loadMailTriageQueue();
  const result: MailLinkResult = { auto_linked: [], ambiguous: [], skipped: [] };

  for (const entry of queue.entries) {
    if (entry.routing !== "sales_inbound" && entry.routing !== "secretary") {
      result.skipped.push(entry.id);
      continue;
    }
    const r = linkMailTriageEntry(entry, { actor: opts?.actor });
    if (r.linked && r.target) {
      result.auto_linked.push({
        triage_id: entry.id,
        target_kind: r.target.kind,
        target_id: r.target.id,
      });
    } else if (r.ambiguous) {
      result.ambiguous.push({ triage_id: entry.id, candidates: r.ambiguous });
    } else {
      result.skipped.push(entry.id);
    }
  }

  return result;
}
