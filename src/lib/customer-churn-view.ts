/**
 * Churn · dormant · at-risk customer view (derived from CS SoT — no new enums).
 */
import type {
  CustomerAccount,
  CustomerChurnEvent,
  CustomerHealthStatus,
} from "../../schemas/customer-success/index.js";
import {
  loadCompany,
  loadCustomerAccounts,
  loadCustomerChurnEvents,
} from "./data.js";
import { excludeDemo } from "./demo-filter.js";
import { currentDate, daysBetween } from "./utils.js";

const DEFAULT_DORMANT_DAYS = 90;

export interface CustomerChurnRow {
  account_id: string;
  company: string;
  health: CustomerHealthStatus;
  last_contact_on?: string;
  days_since_contact?: number;
  renewal_date?: string;
  reason: "churned" | "at_risk" | "critical" | "dormant";
  summary: string;
}

export interface CustomerChurnEventRow {
  event_id: string;
  account_id: string;
  company: string;
  event_type: string;
  occurred_on: string;
  summary: string;
}

export interface CustomerChurnView {
  company_name: string;
  as_of: string;
  dormant_days: number;
  include_demo: boolean;
  at_risk_count: number;
  critical_count: number;
  churned_count: number;
  dormant_count: number;
  accounts: CustomerChurnRow[];
  recent_events: CustomerChurnEventRow[];
  notes: string[];
}

function filterAccounts(
  accounts: CustomerAccount[],
  includeDemo: boolean,
): CustomerAccount[] {
  return excludeDemo(accounts, includeDemo);
}

function accountCompany(
  accountId: string,
  byId: Map<string, CustomerAccount>,
): string {
  return byId.get(accountId)?.company ?? accountId;
}

function classifyAccount(
  account: CustomerAccount,
  asOf: string,
  dormantDays: number,
): CustomerChurnRow | null {
  if (account.health === "churned") {
    return {
      account_id: account.id,
      company: account.company,
      health: account.health ?? "healthy",
      last_contact_on: account.last_contact_on,
      renewal_date: account.renewal_date,
      reason: "churned",
      summary: "解約済み（health: churned）",
    };
  }
  if (account.health === "critical") {
    return {
      account_id: account.id,
      company: account.company,
      health: account.health ?? "healthy",
      last_contact_on: account.last_contact_on,
      renewal_date: account.renewal_date,
      reason: "critical",
      summary: "危険（health: critical）",
    };
  }
  if (account.health === "at_risk") {
    return {
      account_id: account.id,
      company: account.company,
      health: account.health ?? "healthy",
      last_contact_on: account.last_contact_on,
      renewal_date: account.renewal_date,
      reason: "at_risk",
      summary: "要注意（health: at_risk）",
    };
  }
  if (account.last_contact_on) {
    const since = daysBetween(account.last_contact_on, asOf);
    if (since >= dormantDays) {
      return {
        account_id: account.id,
        company: account.company,
        health: account.health ?? "healthy",
        last_contact_on: account.last_contact_on,
        days_since_contact: since,
        renewal_date: account.renewal_date,
        reason: "dormant",
        summary: `休眠候補（最終接触から ${since} 日）`,
      };
    }
  }
  return null;
}

export function buildCustomerChurnView(opts?: {
  dormantDays?: number;
  includeDemo?: boolean;
  eventLimit?: number;
}): CustomerChurnView {
  const includeDemo = opts?.includeDemo ?? false;
  const dormantDays = opts?.dormantDays ?? DEFAULT_DORMANT_DAYS;
  const eventLimit = opts?.eventLimit ?? 20;
  const company = loadCompany();
  const asOf = currentDate();
  const allAccounts = loadCustomerAccounts()?.accounts ?? [];
  const accounts = filterAccounts(allAccounts, includeDemo);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const rows: CustomerChurnRow[] = [];
  for (const account of accounts) {
    const row = classifyAccount(account, asOf, dormantDays);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => {
    const order = { critical: 0, at_risk: 1, churned: 2, dormant: 3 };
    const d = order[a.reason] - order[b.reason];
    if (d !== 0) return d;
    return a.company.localeCompare(b.company, "ja");
  });

  const eventsRaw = loadCustomerChurnEvents()?.events ?? [];
  const recent_events: CustomerChurnEventRow[] = eventsRaw
    .filter((e) => includeDemo || !byId.get(e.account_id)?.demo)
    .slice(-eventLimit)
    .reverse()
    .map((e: CustomerChurnEvent) => ({
      event_id: e.id,
      account_id: e.account_id,
      company: accountCompany(e.account_id, byId),
      event_type: e.event,
      occurred_on: e.occurred_on,
      summary: e.reason_code,
    }));

  const notes: string[] = [];
  if (!includeDemo && allAccounts.some((a) => a.demo === true)) {
    notes.push("demo: true の顧客を集計から除外しています。");
  }
  notes.push(
    `休眠は last_contact_on が ${dormantDays} 日超（healthy でも接触途絶えで表示）。`,
  );

  return {
    company_name: company.name,
    as_of: asOf,
    dormant_days: dormantDays,
    include_demo: includeDemo,
    at_risk_count: rows.filter((r) => r.reason === "at_risk").length,
    critical_count: rows.filter((r) => r.reason === "critical").length,
    churned_count: rows.filter((r) => r.reason === "churned").length,
    dormant_count: rows.filter((r) => r.reason === "dormant").length,
    accounts: rows,
    recent_events,
    notes,
  };
}
