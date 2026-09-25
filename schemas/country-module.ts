import { z } from "zod";
import { iso3166Alpha2Schema, iso3166Alpha3Schema, iso3166Numeric3Schema } from "./standards.js";

export const countryModuleSchema = z.object({
  module_id: z.string().regex(/^[a-z]{2}(?:-[a-z0-9-]+)?$/),
  country_code_alpha2: iso3166Alpha2Schema,
  country_code_alpha3: iso3166Alpha3Schema,
  country_code_numeric: iso3166Numeric3Schema,
  version: z.string().min(1),
  default_locale: z.string().min(2),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
  postal_code_rule_id: z.string().min(1),
  address_format_id: z.string().min(1),
  tax_profile_id: z.string().optional(),
  bank_account_scheme_ids: z.array(z.string()).default([]),
  enabled: z.boolean().default(false),
  standards: z.object({
    jis_prefecture: z.string().optional(),
    jis_municipality: z.string().optional(),
    postal_authority: z.string().optional(),
    locality_authority: z.string().optional(),
  }).default({}),
});

export type CountryModule = z.output<typeof countryModuleSchema>;

export const commonStandardsContract = {
  country: "ISO 3166-1 / 3166-2",
  currency: "ISO 4217",
  language: "ISO 639 + BCP 47",
  date_time: "ISO 8601",
  phone: "ITU-T E.164",
  iban: "ISO 13616",
  bic: "ISO 9362",
  lei: "ISO 17442",
  location: "UN/LOCODE",
} as const;
