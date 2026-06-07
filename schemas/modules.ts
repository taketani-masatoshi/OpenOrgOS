import { z } from "zod";

/** Catalog ids under steward/modules/{id}/ — extend when adding modules. */
export const moduleAgentId = z.enum([
  "rental",
  "hospitality",
  "professional_services",
  "venture_capital",
]);

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
  notes: z.string().optional(),
});

export const modulesFileSchema = z.object({
  modules: z.array(tenantModuleSchema).min(1),
});

export type ModuleAgentId = z.infer<typeof moduleAgentId>;
export type TenantModule = z.infer<typeof tenantModuleSchema>;
export type ModulesFile = z.infer<typeof modulesFileSchema>;
