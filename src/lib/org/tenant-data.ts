/**
 * Tenant Implementation data adapter — sole gateway from Core/Org to company.yaml.
 */
import { loadCompany } from "../data.js";
import { loadTenantConfig } from "../tenant.js";
import {
  orgAuthorizedPersonsSchema,
  orgIdentityProfileSchema,
  type OrgAuthorizedPersons,
  type OrgIdentityProfile,
} from "../../../schemas/org/tenant-adapters.js";

export function loadOrgIdentityProfile(): OrgIdentityProfile {
  const tenant = loadTenantConfig();
  const company = loadCompany();
  return orgIdentityProfileSchema.parse({
    display_name: company.name,
    jurisdiction: tenant.jurisdiction ?? "JP",
    corporate_number: company.corporate_number,
  });
}

export function loadOrgAuthorizedPersons(): OrgAuthorizedPersons {
  const company = loadCompany();
  return orgAuthorizedPersonsSchema.parse({
    representative: company.representative,
    directors: (company.directors ?? []).map((d) => ({
      name: d.name,
      role: d.role,
    })),
  });
}
