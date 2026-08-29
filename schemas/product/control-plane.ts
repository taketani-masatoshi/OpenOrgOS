import { z } from "zod";
import { ledgerPlanIdSchema } from "./ledger-product.js";

export const controlPlaneTenantStatusSchema = z.enum([
  "provisioning",
  "active",
  "suspended",
  "cancelled",
]);

export const controlPlaneTenantSchema = z.object({
  tenant_id: z.string().min(1),
  company_name: z.string().min(1),
  host_slug: z.string().min(1),
  plan: ledgerPlanIdSchema.optional(),
  status: controlPlaneTenantStatusSchema.default("active"),
  subscription_status: z.string().optional(),
  accountant_parent_id: z.string().optional(),
  host: z.string().optional(),
  purge_after: z.string().optional(),
  updated_at: z.string(),
});

export const controlPlaneFileSchema = z.object({
  version: z.literal(1),
  tenants: z.array(controlPlaneTenantSchema),
});

export type ControlPlaneTenant = z.infer<typeof controlPlaneTenantSchema>;
export type ControlPlaneFile = z.infer<typeof controlPlaneFileSchema>;
