/** Jurisdiction-pack modules — steward/jurisdiction-packs/{code}/modules/{id}/ */
export const JP_PACK_MODULE_IDS = [
  "jp_carbon_neutral_2050",
  "jp_women_empowerment",
  "jp_privacy_policy",
  "jp_subsidy_application",
  "jp_trademark_application",
  "jp_corporate_registration",
  "jp_medical_device",
] as const;

export type JpPackModuleId = (typeof JP_PACK_MODULE_IDS)[number];
