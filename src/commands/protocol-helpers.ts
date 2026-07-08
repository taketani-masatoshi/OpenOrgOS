import { setTenantId } from "../lib/tenant.js";

export function applyProtocolTenant(tenant?: string): void {
  if (tenant) setTenantId(tenant);
}
