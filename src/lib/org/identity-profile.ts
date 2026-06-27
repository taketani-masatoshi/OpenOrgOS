/**
 * Organization identity profile — tenant Implementation adapter.
 * Core protocol must not read company.yaml directly.
 */
import { loadCompany } from "../data.js";
import { loadTenantConfig } from "../tenant.js";

export interface OrgIdentityProfile {
  displayName: string;
  jurisdiction: string;
  corporateNumber?: string;
}

export function loadOrgIdentityProfile(): OrgIdentityProfile {
  const tenant = loadTenantConfig();
  const company = loadCompany();
  return {
    displayName: company.name,
    jurisdiction: tenant.jurisdiction ?? "JP",
    corporateNumber: company.corporate_number,
  };
}
