/** Cross-sector business modules — steward/modules/{id}/ */
export const CORE_BUSINESS_MODULE_IDS = [
  "rental",
  "hospitality",
  "professional_services",
  "venture_capital",
  "saas_subscription",
  "event_space",
  "event_operations",
  "ecommerce",
  "restaurant",
  "retail_store",
  "clinic",
  "logistics",
  "staffing",
  "construction",
  "education",
  "membership",
  "software_outsourcing",
  "real_estate_brokerage",
  "property_management",
  "travel_booking",
  "language_bridge",
] as const;

export type CoreBusinessModuleId = (typeof CORE_BUSINESS_MODULE_IDS)[number];
