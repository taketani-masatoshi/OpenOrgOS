import { z } from "zod";

/** Catalog ids under steward/modules/{id}/ — extend when adding modules. */
export const moduleAgentId = z.enum([
  "rental",
  "hospitality",
  "professional_services",
  "venture_capital",
  "saas_subscription",
  "event_space",
  "ecommerce",
  "restaurant",
  "retail_store",
  "clinic",
  "logistics",
  "staffing",
  "construction",
  "education",
  "membership",
]);

export const moduleBillingSchema = z.object({
  docs_base: z.string(),
  invoice_number_prefix: z.string().regex(/^[A-Z0-9_-]+$/).default("RENT"),
  template_id: z.string().default("rent-monthly"),
  sender_email: z.string().optional(),
  tenant_name: z.string().optional(),
  tenant_email: z.string().optional(),
  bank_account: z.string().optional(),
});

export const tenantModuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  enabled: z.boolean(),
  agent: moduleAgentId,
  property_ids: z.array(z.string().regex(/^PROP-\d{3,}$/)).optional(),
  docs_root: z.string().optional(),
  data_root: z.string().optional(),
  operations_public: z.string().optional(),
  operations_secrets: z.string().optional(),
  summary_dir: z.string().optional(),
  billing: z.record(z.string().regex(/^PROP-\d{3,}$/), moduleBillingSchema).optional(),
  notes: z.string().optional(),
});

export const modulesFileSchema = z.object({
  modules: z.array(tenantModuleSchema).min(1),
});

export type ModuleBilling = z.infer<typeof moduleBillingSchema>;
export type ModuleAgentId = z.infer<typeof moduleAgentId>;
export type TenantModule = z.infer<typeof tenantModuleSchema>;
export type ModulesFile = z.infer<typeof modulesFileSchema>;
