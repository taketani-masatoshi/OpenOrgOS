/**
 * Merge customer accounts — rewrites CONTACT / DEAL / INQ / QUOTE FKs.
 */
import {
  loadCustomerAccounts,
  saveCustomerAccounts,
  loadCustomerContacts,
  saveCustomerContacts,
  loadSalesPipeline,
  saveSalesPipeline,
  loadSalesInquiries,
  saveSalesInquiries,
  loadSalesQuotes,
  saveSalesQuotes,
} from "./data.js";
import { appendAuditEvent } from "./audit-log.js";

export interface AccountMergeResult {
  from_id: string;
  into_id: string;
  contacts_moved: number;
  deals_updated: number;
  inquiries_updated: number;
  quotes_updated: number;
  dry_run: boolean;
}

export function mergeCustomerAccounts(opts: {
  fromId: string;
  intoId: string;
  actor?: string;
  dryRun?: boolean;
}): AccountMergeResult {
  if (opts.fromId === opts.intoId) {
    throw new Error("from and into must differ");
  }
  const accountsFile = loadCustomerAccounts();
  if (!accountsFile) throw new Error("accounts.yaml not found");
  const from = accountsFile.accounts.find((a) => a.id === opts.fromId);
  const into = accountsFile.accounts.find((a) => a.id === opts.intoId);
  if (!from) throw new Error(`from account not found: ${opts.fromId}`);
  if (!into) throw new Error(`into account not found: ${opts.intoId}`);

  const contactsFile = loadCustomerContacts() ?? { version: 1 as const, contacts: [] };
  let contacts_moved = 0;
  for (const c of contactsFile.contacts) {
    if (c.account_id === opts.fromId) {
      c.account_id = opts.intoId;
      contacts_moved++;
    }
  }

  const pipeline = loadSalesPipeline();
  let deals_updated = 0;
  if (pipeline) {
    for (const d of pipeline.deals) {
      if (d.account_id === opts.fromId) {
        d.account_id = opts.intoId;
        deals_updated++;
      }
    }
  }

  const inquiries = loadSalesInquiries();
  let inquiries_updated = 0;
  if (inquiries) {
    for (const i of inquiries.inquiries) {
      if (i.account_id === opts.fromId) {
        i.account_id = opts.intoId;
        inquiries_updated++;
      }
    }
  }

  const quotes = loadSalesQuotes();
  let quotes_updated = 0;
  if (quotes) {
    for (const q of quotes.quotes) {
      if (q.account_id === opts.fromId) {
        q.account_id = opts.intoId;
        quotes_updated++;
      }
    }
  }

  const domains = new Set([
    ...(into.email_domains ?? []),
    ...(from.email_domains ?? []),
  ]);

  if (!opts.dryRun) {
    into.email_domains = domains.size ? [...domains] : into.email_domains;
    accountsFile.accounts = accountsFile.accounts.filter((a) => a.id !== opts.fromId);
    const intoIdx = accountsFile.accounts.findIndex((a) => a.id === opts.intoId);
    accountsFile.accounts[intoIdx] = into;
    saveCustomerAccounts(accountsFile);
    saveCustomerContacts(contactsFile);
    if (pipeline) saveSalesPipeline(pipeline);
    if (inquiries) saveSalesInquiries(inquiries);
    if (quotes) saveSalesQuotes(quotes);
    appendAuditEvent({
      event: "sales_dedupe_merge",
      ref: opts.intoId,
      actor: opts.actor,
      detail: `merged_from:${opts.fromId}`,
    });
  }

  return {
    from_id: opts.fromId,
    into_id: opts.intoId,
    contacts_moved,
    deals_updated,
    inquiries_updated,
    quotes_updated,
    dry_run: Boolean(opts.dryRun),
  };
}
