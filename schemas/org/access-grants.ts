import { z } from "zod";
import { operatorPermissionSchema } from "./operator.js";

export const accessGrantStatusSchema = z.enum(["pending", "active", "revoked", "expired"]);

export const accessGrantSchema = z.object({
  grant_id: z.string().regex(/^GRN-\d{8}-\d{3}$/),
  approval_id: z.string().optional(),
  requester_id: z.string().min(1),
  target_operator_id: z.string().min(1),
  approved_by_operator_id: z.string().optional(),
  reason: z.string().min(1),
  allowed_agents: z.array(z.string().min(1)).default([]),
  data_path_globs: z.array(z.string().min(1)).default([]),
  extra_permissions: z.array(operatorPermissionSchema).default([]),
  valid_until: z.string().min(1),
  created_at: z.string().min(1),
  revoked_at: z.string().optional(),
  status: accessGrantStatusSchema.default("active"),
});

export const accessGrantRegistrySchema = z.object({
  version: z.literal("1"),
  grants: z.array(accessGrantSchema).default([]),
});

export type AccessGrant = z.output<typeof accessGrantSchema>;
export type AccessGrantRegistry = z.output<typeof accessGrantRegistrySchema>;
export type AccessGrantStatus = z.output<typeof accessGrantStatusSchema>;
