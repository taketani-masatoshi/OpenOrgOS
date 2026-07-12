import { z } from "zod";
import { CORE_BUSINESS_MODULE_IDS } from "./modules/core-ids.js";
import { JP_PACK_MODULE_IDS } from "./modules/pack-ids.js";

export { CORE_BUSINESS_MODULE_IDS, type CoreBusinessModuleId } from "./modules/core-ids.js";
export { JP_PACK_MODULE_IDS, type JpPackModuleId } from "./modules/pack-ids.js";

const ALL_MODULE_IDS = [...CORE_BUSINESS_MODULE_IDS, ...JP_PACK_MODULE_IDS] as const;

/** Catalog ids under steward/modules/{id}/ or jurisdiction-packs/.../modules/{id}/ */
export const moduleAgentId = z.enum(ALL_MODULE_IDS);

export const moduleBillingSchema = z.object({
  docs_base: z.string(),
  invoice_number_prefix: z.string().regex(/^[A-Z0-9_-]+$/).default("RENT"),
  template_id: z.string().default("rent-monthly"),
  sender_email: z.string().optional(),
  tenant_name: z.string().optional(),
  tenant_email: z.string().optional(),
  bank_account: z.string().optional(),
  collection_term_id: z.string().min(1).optional(),
});

export const tenantModuleSchema = z.object({
  /** Catalog module id. Convention: must equal `agent` (validated by validateModules). */
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  /** Runtime activation flag (roster). Catalog definitions live under steward/modules/. */
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

export type ModuleBilling = z.output<typeof moduleBillingSchema>;
export type ModuleAgentId = z.output<typeof moduleAgentId>;
export type TenantModule = z.output<typeof tenantModuleSchema>;
export type ModulesFile = z.output<typeof modulesFileSchema>;
