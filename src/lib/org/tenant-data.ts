/**
 * Tenant Implementation data adapter — sole gateway from Core/Org to company.yaml.
 */
import { loadCompany } from "../data.js";
import { loadTenantConfig } from "../tenant.js";
import {
  orgAuthorizedPersonsSchema,
  orgCompanyBillingSchema,
  orgCompanyReportSchema,
  orgIdentityProfileSchema,
  type OrgAuthorizedPersons,
  type OrgCompanyBilling,
  type OrgCompanyReport,
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

export function loadOrgCompanyBilling(): OrgCompanyBilling {
  const company = loadCompany();
  return orgCompanyBillingSchema.parse({
    name: company.name,
    address: company.address,
    corporate_number: company.corporate_number,
  });
}

export function loadOrgCompanyReport(): OrgCompanyReport {
  const company = loadCompany();
  return orgCompanyReportSchema.parse({
    name: company.name,
    corporate_number: company.corporate_number,
    established_date: company.established_date,
    representative: company.representative,
    directors: (company.directors ?? []).map((d) => ({
      name: d.name,
      role: d.role,
    })),
    address: company.address,
  });
}
