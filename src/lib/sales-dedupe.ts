/**
 * Sales dedupe — company, contact, open deals.
 */
import type { CustomerAccount, CustomerContact } from "../../schemas/customer-success/index.js";
import type { SalesDeal } from "../../schemas/sales.js";
import { isOpenSalesDeal } from "../../schemas/sales.js";

export interface DedupeIssue {
  severity: "warning" | "error";
  kind: "account_company" | "account_domain" | "contact_email" | "open_deal";
  message: string;
  refs: string[];
}

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/株式会社|（株）|\(株\)|有限会社|合同会社/g, "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function collectAccountDedupeIssues(accounts: CustomerAccount[]): DedupeIssue[] {
  const issues: DedupeIssue[] = [];
  const byNorm = new Map<string, string[]>();
  const byDomain = new Map<string, string[]>();

  for (const a of accounts) {
    const norm = normalizeCompanyName(a.company);
    const ids = byNorm.get(norm) ?? [];
    ids.push(a.id);
    byNorm.set(norm, ids);

    for (const domain of a.email_domains ?? []) {
      const d = domain.trim().toLowerCase();
      const domIds = byDomain.get(d) ?? [];
      domIds.push(a.id);
      byDomain.set(d, domIds);
    }
  }

  for (const [norm, ids] of byNorm) {
    if (ids.length > 1) {
      issues.push({
        severity: "warning",
        kind: "account_company",
        message: `duplicate normalized company name "${norm}"`,
        refs: [...new Set(ids)].sort(),
      });
    }
  }

  for (const [domain, ids] of byDomain) {
    const unique = [...new Set(ids)];
    if (unique.length > 1) {
      issues.push({
        severity: "warning",
        kind: "account_domain",
        message: `email domain ${domain} shared by multiple accounts`,
        refs: unique.sort(),
      });
    }
  }

  return issues;
}

export function collectContactDedupeIssues(contacts: CustomerContact[]): DedupeIssue[] {
  const issues: DedupeIssue[] = [];
  const byKey = new Map<string, string[]>();

  for (const c of contacts) {
    if (!c.email) continue;
    const key = `${c.account_id}:${normalizeEmail(c.email)}`;
    const ids = byKey.get(key) ?? [];
    ids.push(c.id);
    byKey.set(key, ids);
  }

  for (const [, ids] of byKey) {
    if (ids.length > 1) {
      issues.push({
        severity: "error",
        kind: "contact_email",
        message: "duplicate contact email on same account",
        refs: [...new Set(ids)].sort(),
      });
    }
  }

  return issues;
}

export function collectOpenDealDedupeIssues(deals: SalesDeal[]): DedupeIssue[] {
  const issues: DedupeIssue[] = [];
  const byKey = new Map<string, string[]>();

  for (const d of deals) {
    if (!isOpenSalesDeal(d) || !d.account_id) continue;
    const key = `${d.account_id}:${normalizeTitle(d.title)}`;
    const ids = byKey.get(key) ?? [];
    ids.push(d.id);
    byKey.set(key, ids);
  }

  for (const [, ids] of byKey) {
    if (ids.length > 1) {
      issues.push({
        severity: "warning",
        kind: "open_deal",
        message: "similar open deals for same account",
        refs: [...new Set(ids)].sort(),
      });
    }
  }

  return issues;
}

export function collectSalesDedupeIssues(opts: {
  accounts: CustomerAccount[];
  contacts: CustomerContact[];
  deals: SalesDeal[];
  strict?: boolean;
}): DedupeIssue[] {
  const all = [
    ...collectAccountDedupeIssues(opts.accounts),
    ...collectContactDedupeIssues(opts.contacts),
    ...collectOpenDealDedupeIssues(opts.deals),
  ];
  if (opts.strict) {
    return all.map((i) =>
      i.severity === "warning" ? { ...i, severity: "error" as const } : i,
    );
  }
  return all;
}
