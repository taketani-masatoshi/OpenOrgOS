import { buildFleetHealthReport } from "./ledger-fleet-health.js";
import { loadControlPlane, syncControlPlaneFromProductTenants } from "./ledger-control-plane.js";
import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";
import { loadLedgerSubscription } from "./ledger-subscription.js";
import { runWithTenantId } from "../tenant.js";
import { buildOnboardingReport } from "./ledger-onboarding.js";
import { buildProductReadinessReport } from "./ledger-product-readiness.js";
import { buildBillingIssuesReport } from "./ledger-billing-issues.js";

export type OpsDashboardSnapshot = {
  generated_at: string;
  readiness: ReturnType<typeof buildProductReadinessReport>;
  fleet_health: ReturnType<typeof buildFleetHealthReport>;
  billing_issues: ReturnType<typeof buildBillingIssuesReport>;
  control_plane_tenant_count: number;
  ledger_product_tenant_count: number;
  tenants: Array<{
    tenant_id: string;
    company_name: string;
    plan: string | null;
    subscription_status: string | null;
    host: string | null;
    onboarding_complete: boolean;
    onboarding_steps: string;
  }>;
};

export function buildOpsDashboardSnapshot(): OpsDashboardSnapshot {
  syncControlPlaneFromProductTenants();
  const readiness = buildProductReadinessReport();
  const fleetHealth = buildFleetHealthReport();
  const controlPlane = loadControlPlane();

  const tenants = listLedgerProductTenantIds().map((tenantId) =>
    runWithTenantId(tenantId, () => {
      const cp = controlPlane.tenants.find((row) => row.tenant_id === tenantId);
      const sub = loadLedgerSubscription();
      const onboarding = buildOnboardingReport();
      return {
        tenant_id: tenantId,
        company_name: cp?.company_name ?? tenantId,
        plan: sub?.plan ?? cp?.plan ?? null,
        subscription_status: sub?.status ?? cp?.subscription_status ?? null,
        host: cp?.host ?? null,
        onboarding_complete: onboarding.complete,
        onboarding_steps: `${onboarding.completed_count}/${onboarding.total_count}`,
      };
    }),
  );

  return {
    generated_at: new Date().toISOString(),
    readiness,
    fleet_health: fleetHealth,
    billing_issues: buildBillingIssuesReport(),
    control_plane_tenant_count: controlPlane.tenants.length,
    ledger_product_tenant_count: listLedgerProductTenantIds().length,
    tenants,
  };
}

export { buildAccountantFleetSnapshot } from "./ledger-accountant-channel.js";
export type { AccountantFleetSnapshot } from "./ledger-accountant-channel.js";
