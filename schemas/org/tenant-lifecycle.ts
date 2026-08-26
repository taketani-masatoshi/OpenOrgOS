import { z } from "zod";

export const tenantLifecycleStatusSchema = z.enum([
  "active",
  "winding_down",
  "archived",
  "purged",
]);

export const tenantLifecycleSchema = z.object({
  version: z.literal("1"),
  status: tenantLifecycleStatusSchema.default("active"),
  declared_at: z.string().optional(),
  declared_by_operator_id: z.string().optional(),
  retention_until: z.string().optional(),
  archive_export_id: z.string().optional(),
});

export type TenantLifecycleStatus = z.output<typeof tenantLifecycleStatusSchema>;
export type TenantLifecycle = z.output<typeof tenantLifecycleSchema>;
