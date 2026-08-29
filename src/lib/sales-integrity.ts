/**
 * Sales CRM cross-reference and dedupe validation.
 */
import {
  loadCustomerAccounts,
  loadCustomerContacts,
  loadSalesPipeline,
  loadSalesInquiries,
  loadSalesQuotes,
} from "./data.js";
import type { ValidationError } from "./data.js";
import { collectSalesDedupeIssues } from "./sales-dedupe.js";

export function collectSalesIntegrityIssues(opts?: { strict?: boolean }): ValidationError[] {
  const errors: ValidationError[] = [];
  const accounts = loadCustomerAccounts()?.accounts ?? [];
  const contacts = loadCustomerContacts()?.contacts ?? [];
  const deals = loadSalesPipeline()?.deals ?? [];
  const inquiries = loadSalesInquiries()?.inquiries ?? [];
  const quotes = loadSalesQuotes()?.quotes ?? [];

  const accountIds = new Set(accounts.map((a) => a.id));
  const dealIds = new Set(deals.map((d) => d.id));

  for (const d of deals) {
    if (d.account_id && !accountIds.has(d.account_id)) {
      errors.push({
        file: "data/sales/pipeline.yaml",
        message: `deal ${d.id} references unknown account_id ${d.account_id}`,
      });
    }
    for (const cid of d.contact_ids ?? []) {
      const contact = contacts.find((c) => c.id === cid);
      if (!contact) {
        errors.push({
          file: "data/sales/pipeline.yaml",
          message: `deal ${d.id} references unknown contact ${cid}`,
        });
      } else if (d.account_id && contact.account_id !== d.account_id) {
        errors.push({
          file: "data/sales/pipeline.yaml",
          message: `deal ${d.id} contact ${cid} belongs to different account`,
        });
      }
    }
  }

  for (const i of inquiries) {
    if (i.account_id && !accountIds.has(i.account_id)) {
      errors.push({
        file: "data/sales/inbound/inquiries.yaml",
        message: `inquiry ${i.id} references unknown account_id ${i.account_id}`,
      });
    }
  }

  for (const c of contacts) {
    if (!accountIds.has(c.account_id)) {
      errors.push({
        file: "data/customers/contacts.yaml",
        message: `contact ${c.id} references unknown account ${c.account_id}`,
      });
    }
  }

  for (const q of quotes) {
    if (!dealIds.has(q.deal_id)) {
      errors.push({
        file: "data/sales/quotes.yaml",
        message: `quote ${q.id} references unknown deal ${q.deal_id}`,
      });
    }
    if (!accountIds.has(q.account_id)) {
      errors.push({
        file: "data/sales/quotes.yaml",
        message: `quote ${q.id} references unknown account ${q.account_id}`,
      });
    }
  }

  for (const issue of collectSalesDedupeIssues({
    accounts,
    contacts,
    deals,
    strict: opts?.strict,
  })) {
    errors.push({
      file: "data/sales/",
      message: `[${issue.severity}] ${issue.kind}: ${issue.message} (${issue.refs.join(", ")})`,
    });
  }

  return errors;
}
