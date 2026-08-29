import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";
import { runWithTenantId } from "../tenant.js";
import { loadLedgerSubscription } from "./ledger-subscription.js";
import { buildFleetHealthReport } from "./ledger-fleet-health.js";

export type BillingIssue = {
  tenant_id: string;
  company_name: string;
  issue: "past_due" | "cancelled" | "trial_expired" | "unhealthy";
  detail: string;
};

export function buildBillingIssuesReport(): {
  checked_at: string;
  issues: BillingIssue[];
} {
  const health = buildFleetHealthReport();
  const issues: BillingIssue[] = [];

  for (const row of health.tenants) {
    if (!row.validate_ok) {
      issues.push({
        tenant_id: row.tenant_id,
        company_name: row.tenant_id,
        issue: "unhealthy",
        detail: `${row.error_count} validate errors`,
      });
    }
    if (row.subscription_status === "past_due") {
      issues.push({
        tenant_id: row.tenant_id,
        company_name: row.tenant_id,
        issue: "past_due",
        detail: "Stripe payment failed",
      });
    }
    if (row.trial_expired) {
      issues.push({
        tenant_id: row.tenant_id,
        company_name: row.tenant_id,
        issue: "trial_expired",
        detail: "Trial ended",
      });
    }
  }

  for (const tenantId of listLedgerProductTenantIds()) {
    const sub = runWithTenantId(tenantId, () => loadLedgerSubscription());
    if (sub?.status === "cancelled") {
      issues.push({
        tenant_id: tenantId,
        company_name: sub.company_name ?? tenantId,
        issue: "cancelled",
        detail: "Subscription cancelled",
      });
    }
  }

  return {
    checked_at: new Date().toISOString(),
    issues,
  };
}

export function countPastDueTenants(): number {
  return buildBillingIssuesReport().issues.filter((row) => row.issue === "past_due")
    .length;
}
