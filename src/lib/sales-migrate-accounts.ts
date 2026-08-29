/**
 * Migrate embedded party on deals → CUST + CONTACT + account_id.
 */
import type { CustomerAccount, CustomerContact } from "../../schemas/customer-success/index.js";
import type { SalesDeal } from "../../schemas/sales.js";
import {
  loadCustomerAccounts,
  saveCustomerAccounts,
  loadCustomerContacts,
  saveCustomerContacts,
  loadSalesPipeline,
  saveSalesPipeline,
} from "./data.js";
import { normalizeCompanyName } from "./sales-dedupe.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";

export interface MigrateAccountsResult {
  accounts_created: number;
  contacts_created: number;
  deals_updated: number;
  dry_run: boolean;
}

function extractDomain(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = email.slice(at + 1).toLowerCase();
  if (domain.endsWith("gmail.com") || domain.endsWith("yahoo.co.jp")) return undefined;
  return domain;
}

function nextCustId(accounts: CustomerAccount[], year = currentDate().slice(0, 4)): string {
  let max = 0;
  const prefix = `CUST-${year}-`;
  for (const a of accounts) {
    if (!a.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(a.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function nextContactId(contacts: CustomerContact[], year = currentDate().slice(0, 4)): string {
  let max = 0;
  const prefix = `CONTACT-${year}-`;
  for (const c of contacts) {
    if (!c.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(c.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function findOrCreateAccount(
  accounts: CustomerAccount[],
  company: string,
  deal: SalesDeal,
): { account: CustomerAccount; created: boolean } {
  const norm = normalizeCompanyName(company);
  const existing = accounts.find((a) => normalizeCompanyName(a.company) === norm);
  if (existing) return { account: existing, created: false };

  const email = deal.party?.contact_email;
  const domain = email ? extractDomain(email) : undefined;
  const year = currentDate().slice(0, 4);
  const account: CustomerAccount = {
    id: nextCustId(accounts, year),
    company,
    lifecycle: deal.stage === "won" ? "customer" : "prospect",
    email_domains: domain ? [domain] : undefined,
    owner: deal.owner,
    owner_name: deal.owner_name,
    health: deal.stage === "won" ? "healthy" : undefined,
    health_declared_on: deal.stage === "won" ? currentDate() : undefined,
    tags: deal.tags,
    demo: deal.demo,
  };
  accounts.push(account);
  return { account, created: true };
}

export function migrateSalesAccounts(opts?: {
  dryRun?: boolean;
  actor?: string;
}): MigrateAccountsResult {
  const dryRun = opts?.dryRun ?? false;
  const pipeline = loadSalesPipeline();
  if (!pipeline) {
    return { accounts_created: 0, contacts_created: 0, deals_updated: 0, dry_run: dryRun };
  }

  const accountsFile = loadCustomerAccounts() ?? { version: 1 as const, accounts: [] };
  const contactsFile = loadCustomerContacts() ?? { version: 1 as const, contacts: [] };
  let accountsCreated = 0;
  let contactsCreated = 0;
  let dealsUpdated = 0;

  for (const deal of pipeline.deals) {
    if (deal.account_id) continue;
    const company = deal.counterparty ?? deal.party?.company;
    if (!company) continue;

    const { account, created } = findOrCreateAccount(accountsFile.accounts, company, deal);
    if (created) accountsCreated++;

    const contactIds = [...(deal.contact_ids ?? [])];
    if (deal.party?.contact_name) {
      const existingContact = contactsFile.contacts.find(
        (c) =>
          c.account_id === account.id &&
          c.name === deal.party!.contact_name &&
          (!deal.party!.contact_email || c.email === deal.party!.contact_email),
      );
      if (!existingContact) {
        const contact: CustomerContact = {
          id: nextContactId(contactsFile.contacts),
          account_id: account.id,
          name: deal.party.contact_name,
          title: deal.party.contact_title,
          email: deal.party.contact_email,
          phone: deal.party.contact_phone,
          primary: true,
          demo: deal.demo,
        };
        contactsFile.contacts.push(contact);
        contactIds.push(contact.id);
        contactsCreated++;
      } else if (!contactIds.includes(existingContact.id)) {
        contactIds.push(existingContact.id);
      }
    }

    deal.account_id = account.id;
    if (contactIds.length) deal.contact_ids = contactIds;
    dealsUpdated++;
  }

  if (!dryRun && (accountsCreated || contactsCreated || dealsUpdated)) {
    saveCustomerAccounts(accountsFile);
    saveCustomerContacts(contactsFile);
    saveSalesPipeline(pipeline);
    appendAuditEvent({
      event: "sales_handoff",
      ref: "migrate-accounts",
      actor: opts?.actor,
      detail: `accounts=${accountsCreated} contacts=${contactsCreated} deals=${dealsUpdated}`,
    });
  }

  return {
    accounts_created: accountsCreated,
    contacts_created: contactsCreated,
    deals_updated: dealsUpdated,
    dry_run: dryRun,
  };
}
