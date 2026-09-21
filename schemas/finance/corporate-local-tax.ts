import { z } from "zod";

export const corporateLocalTaxRateProfileSchema = z.object({
  schema: z.literal("orgos.jp.corporate-local-tax-rate.v1"),
  id: z.string().min(1),
  municipality_code: z.string().regex(/^\d{5,6}$/),
  effective_from: z.string().date(),
  effective_to: z.string().date().optional(),
  source_url: z.string().url(),
  checked_at: z.string().datetime(),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  certified: z.literal(true),
  resident_tax: z.object({
    prefectural_corporate_tax_bps: z.number().int().nonnegative(),
    municipal_corporate_tax_bps: z.number().int().nonnegative(),
    per_capita_yen: z.number().int().nonnegative(),
  }),
  enterprise_tax_brackets: z.array(z.object({
    up_to_yen: z.number().int().positive().nullable(),
    rate_bps: z.number().int().nonnegative(),
  })).min(1),
  special_corporate_business_tax_bps: z.number().int().nonnegative(),
});

export const corporateLocalTaxCalculationSchema = z.object({
  schema: z.literal("orgos.jp.corporate-local-tax-calculation.v1"),
  profile_id: z.string().min(1),
  municipality_code: z.string().min(1),
  fiscal_year_end: z.string().date(),
  national_corporate_tax_yen: z.number().int().nonnegative(),
  taxable_income_yen: z.number().int().nonnegative(),
  prefectural_resident_tax_yen: z.number().int().nonnegative(),
  municipal_resident_tax_yen: z.number().int().nonnegative(),
  per_capita_tax_yen: z.number().int().nonnegative(),
  enterprise_tax_yen: z.number().int().nonnegative(),
  special_corporate_business_tax_yen: z.number().int().nonnegative(),
  total_yen: z.number().int().nonnegative(),
  calculation_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export type CorporateLocalTaxRateProfile = z.output<typeof corporateLocalTaxRateProfileSchema>;
export type CorporateLocalTaxCalculation = z.output<typeof corporateLocalTaxCalculationSchema>;
