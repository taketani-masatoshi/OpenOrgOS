import { countryModuleSchema, type CountryModule } from "../country-module.js";

export const JP_COUNTRY_MODULE: CountryModule = countryModuleSchema.parse({
  module_id: "jp",
  country_code_alpha2: "JP",
  country_code_alpha3: "JPN",
  country_code_numeric: "392",
  version: "1.0.0",
  default_locale: "ja-JP",
  default_currency: "JPY",
  postal_code_rule_id: "jp-postal-7",
  address_format_id: "jp-standard",
  tax_profile_id: "jp-tax",
  bank_account_scheme_ids: ["jp-domestic-account", "iso-9362-bic"],
  enabled: true,
  standards: {
    jis_prefecture: "JIS X 0401",
    jis_municipality: "JIS X 0402",
    postal_authority: "Japan Post postal code data",
    locality_authority: "J-LIS nationwide town-and-address file",
  },
});

export const COUNTRY_MODULES: Record<string, CountryModule> = { jp: JP_COUNTRY_MODULE };

export function getCountryModule(moduleId: string): CountryModule {
  const module = COUNTRY_MODULES[moduleId.toLowerCase()];
  if (!module || !module.enabled) throw new Error(`Country module is not enabled: ${moduleId}`);
  return module;
}
