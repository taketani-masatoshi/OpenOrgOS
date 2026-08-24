import { z } from "zod";

/** Org approval subject_type for tenant modules/standards toggles. */
export const TENANT_CONFIG_SUBJECT = "tenant.config" as const;

export const tenantConfigChangeIdSchema = z
  .string()
  .regex(/^CFG-\d{8}-\d{3}$/);

export const tenantConfigTargetSchema = z.enum(["standards", "modules"]);

export const tenantConfigChangeStatusSchema = z.enum([
  "pending_approval",
  "applied",
  "rejected",
  "cancelled",
]);

export const tenantConfigChangeSchema = z.object({
  change_id: tenantConfigChangeIdSchema,
  target: tenantConfigTargetSchema,
  target_id: z.string().min(1),
  from_enabled: z.boolean(),
  to_enabled: z.boolean(),
  status: tenantConfigChangeStatusSchema,
  approval_id: z.string().min(1),
  proposed_by: z.string().min(1),
  message: z.string().min(1),
  proposed_at: z.string().min(1),
  applied_at: z.string().optional(),
  rejected_at: z.string().optional(),
  side_effects_plan: z.array(z.string()).default([]),
  apply_warnings: z.array(z.string()).optional(),
});

export const tenantConfigChangeFileSchema = z.object({
  as_of: z.string().optional(),
  changes: z.array(tenantConfigChangeSchema).default([]),
});

export type TenantConfigTarget = z.output<typeof tenantConfigTargetSchema>;
export type TenantConfigChangeStatus = z.output<typeof tenantConfigChangeStatusSchema>;
export type TenantConfigChange = z.output<typeof tenantConfigChangeSchema>;
export type TenantConfigChangeFile = z.output<typeof tenantConfigChangeFileSchema>;
