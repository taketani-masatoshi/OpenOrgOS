/**
 * L1 account list for Console (no email/phone).
 */
import {
  loadCustomerAccounts,
  loadCustomerContacts,
  loadSalesPipeline,
} from "./data.js";
import { collectSalesDedupeIssues } from "./sales-dedupe.js";

export interface CustomerAccountL1 {
  id: string;
  company: string;
  lifecycle: "prospect" | "customer";
  owner_name?: string;
  health?: string;
  contact_count: number;
  open_deals: number;
}

export interface CustomersAccountsView {
  accounts: CustomerAccountL1[];
  dedupe_warnings: Array<{ message: string; refs: string[] }>;
}

export function buildCustomersAccountsView(): CustomersAccountsView {
  const accounts = loadCustomerAccounts()?.accounts ?? [];
  const contacts = loadCustomerContacts()?.contacts ?? [];
  const deals = loadSalesPipeline()?.deals ?? [];

  const contactCount = new Map<string, number>();
  for (const c of contacts) {
    contactCount.set(c.account_id, (contactCount.get(c.account_id) ?? 0) + 1);
  }

  const openDeals = new Map<string, number>();
  for (const d of deals) {
    if (!d.account_id || d.demo) continue;
    if (d.stage === "won" || d.stage === "lost") continue;
    openDeals.set(d.account_id, (openDeals.get(d.account_id) ?? 0) + 1);
  }

  const dedupe = collectSalesDedupeIssues({ accounts, contacts, deals }).filter(
    (d) => d.severity === "warning",
  );

  return {
    accounts: accounts
      .filter((a) => a.demo !== true)
      .map((a) => ({
        id: a.id,
        company: a.company,
        lifecycle: a.lifecycle ?? "customer",
        owner_name: a.owner_name,
        health: a.health,
        contact_count: contactCount.get(a.id) ?? 0,
        open_deals: openDeals.get(a.id) ?? 0,
      })),
    dedupe_warnings: dedupe.map((d) => ({
      message: d.message,
      refs: d.refs,
    })),
  };
}
