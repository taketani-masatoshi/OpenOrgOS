/** Jurisdiction-pack modules — steward/jurisdiction-packs/{code}/modules/{id}/ */
export const JP_PACK_MODULE_IDS = [
  "jp_carbon_neutral_2050",
  "jp_women_empowerment",
  "jp_privacy_policy",
  "jp_subsidy_application",
  "jp_trademark_application",
  "jp_corporate_registration",
  "jp_medical_device",
  "jp_permit_registry",
  "jp_permit_application",
  "jp_minpaku",
  "jp_certification",
  "jp_inspection",
  "jp_bank_corporate",
  "jp_tax_corporate",
  "jp_tax_consumption",
  "jp_consumption_refund",
  "jp_invoice_qualified",
  "jp_withholding_statutory",
  "jp_payroll",
  "jp_social_insurance",
] as const;

export type JpPackModuleId = (typeof JP_PACK_MODULE_IDS)[number];
