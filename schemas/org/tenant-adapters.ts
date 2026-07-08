import { z } from "zod";

/** Tenant Implementation adapter — identity fields for protocol export. */
export const orgIdentityProfileSchema = z.object({
  display_name: z.string().min(1),
  jurisdiction: z.string().min(1),
  corporate_number: z.string().optional(),
});

/** Authorized natural persons for wire-governance approval (from tenant company data). */
export const orgAuthorizedPersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
});

export const orgAuthorizedPersonsSchema = z.object({
  representative: z.string().optional(),
  directors: z.array(orgAuthorizedPersonSchema).default([]),
});

export type OrgIdentityProfile = z.output<typeof orgIdentityProfileSchema>;
export type OrgAuthorizedPerson = z.output<typeof orgAuthorizedPersonSchema>;
export type OrgAuthorizedPersons = z.output<typeof orgAuthorizedPersonsSchema>;

/** Company fields for billing / PDF reports (tenant Implementation adapter). */
export const orgCompanyBillingSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  corporate_number: z.string().optional(),
});

export type OrgCompanyBilling = z.output<typeof orgCompanyBillingSchema>;

/** Company fields for statutory / management PDF reports. */
export const orgCompanyReportSchema = z.object({
  name: z.string().min(1),
  corporate_number: z.string().optional(),
  established_date: z.string().optional(),
  representative: z.string().optional(),
  directors: z.array(orgAuthorizedPersonSchema).optional(),
  address: z.string().optional(),
});

export type OrgCompanyReport = z.output<typeof orgCompanyReportSchema>;
