/**
 * Won deal handoff — prospect → customer (no auto CTR).
 */
import type { CustomerAccount } from "../../schemas/customer-success/index.js";
import {
  loadCustomerAccounts,
  saveCustomerAccounts,
  loadSalesInquiries,
  saveSalesInquiries,
} from "./data.js";
import { findDeal, createDeal } from "./sales-deal-service.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";

export interface HandoffWonResult {
  deal_id: string;
  account_id: string;
  lifecycle: "customer";
  work_order_hint: string;
}

export function handoffWonDeal(opts: {
  dealId: string;
  actor?: string;
  dryRun?: boolean;
}): HandoffWonResult {
  const deal = findDeal(opts.dealId);
  if (!deal) throw new Error(`deal not found: ${opts.dealId}`);
  if (deal.stage !== "won") {
    throw new Error(`deal ${opts.dealId} must be stage won (current: ${deal.stage})`);
  }
  if (!deal.account_id) {
    throw new Error(`deal ${opts.dealId} has no account_id — run sales migrate-accounts first`);
  }

  const file = loadCustomerAccounts();
  if (!file) throw new Error("accounts.yaml not found");
  const idx = file.accounts.findIndex((a) => a.id === deal.account_id);
  if (idx < 0) throw new Error(`account ${deal.account_id} not found`);

  const account: CustomerAccount = {
    ...file.accounts[idx]!,
    lifecycle: "customer",
    health: file.accounts[idx]!.health ?? "healthy",
    health_declared_on: file.accounts[idx]!.health_declared_on ?? currentDate(),
    mrr_man: file.accounts[idx]!.mrr_man ?? deal.amount_man,
    last_contact_on: currentDate(),
  };

  if (!opts.dryRun) {
    file.accounts[idx] = account;
    saveCustomerAccounts(file);
    appendAuditEvent({
      event: "sales_handoff",
      ref: opts.dealId,
      actor: opts.actor,
      detail: `account:${deal.account_id}`,
    });
  }

  return {
    deal_id: opts.dealId,
    account_id: deal.account_id,
    lifecycle: "customer",
    work_order_hint: `Contract Agent: draft CTR for ${deal.title} (${deal.account_id}) — human approval required`,
  };
}

export function promoteInquiryToDeal(opts: {
  inquiryId: string;
  title?: string;
  owner?: string;
  owner_name?: string;
  actor?: string;
}): { deal_id: string; inquiry_id: string } {
  const inqFile = loadSalesInquiries();
  const inquiry = inqFile?.inquiries.find((i) => i.id === opts.inquiryId);
  if (!inquiry) throw new Error(`inquiry not found: ${opts.inquiryId}`);
  if (inquiry.status !== "qualified") {
    throw new Error(`inquiry must be qualified (current: ${inquiry.status})`);
  }

  const deal = createDeal(
    {
      title: opts.title ?? inquiry.subject,
      stage: "lead",
      account_id: inquiry.account_id,
      inquiry_id: inquiry.id,
      owner: opts.owner ?? inquiry.owner,
      owner_name: opts.owner_name ?? inquiry.owner_name ?? "operator",
      counterparty: inquiry.company,
      mail_thread_ids: inquiry.mail_thread_ids,
      gmail_thread_ids: inquiry.gmail_thread_ids,
      next_action: "初回商談設定",
      demo: inquiry.demo,
    },
    { operator_id: opts.actor },
  );

  inquiry.status = "closed";
  inquiry.notes = inquiry.notes
    ? `${inquiry.notes}\nPromoted to ${deal.id}`
    : `Promoted to ${deal.id}`;
  const idx = inqFile!.inquiries.findIndex((i) => i.id === opts.inquiryId);
  inqFile!.inquiries[idx] = inquiry;
  saveSalesInquiries(inqFile!);

  appendAuditEvent({
    event: "sales_handoff",
    ref: inquiry.id,
    actor: opts.actor,
    detail: `promoted:${deal.id}`,
  });

  return { deal_id: deal.id, inquiry_id: inquiry.id };
}
