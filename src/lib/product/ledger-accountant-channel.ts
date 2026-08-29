import {
  listAccountantClientTenants,
  loadControlPlane,
  syncControlPlaneFromProductTenants,
} from "./ledger-control-plane.js";

export type AccountantFleetSnapshot = {
  accountant_tenant_id: string;
  clients: ReturnType<typeof listAccountantClientTenants>;
  all_product_tenants: Array<{
    tenant_id: string;
    company_name: string;
    plan: string | null;
    host: string | null;
  }>;
};

/** Accountant multi-client fleet channel (P4). */
export function buildAccountantFleetSnapshot(
  accountantTenantId: string,
): AccountantFleetSnapshot {
  syncControlPlaneFromProductTenants();
  const controlPlane = loadControlPlane();
  const clients = listAccountantClientTenants(accountantTenantId);
  return {
    accountant_tenant_id: accountantTenantId,
    clients,
    all_product_tenants: controlPlane.tenants.map((row) => ({
      tenant_id: row.tenant_id,
      company_name: row.company_name,
      plan: row.plan ?? null,
      host: row.host ?? null,
    })),
  };
}
