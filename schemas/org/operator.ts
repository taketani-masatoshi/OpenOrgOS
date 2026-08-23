import { z } from "zod";

export const operatorRoleSchema = z.enum([
  "ceo",
  "approver",
  "operator",
  "readonly",
  "mcp_service",
  "auditor",
]);

export const operatorStatusSchema = z.enum(["active", "disabled"]);

export const operatorPermissionSchema = z.enum([
  "chat:read",
  "chat:ask",
  "chat:approve",
  "chat:wire",
  "protocol:approve",
  "protocol:draft",
  "broker:transfer",
  "finance:reconcile",
  "scheduling:write",
  "scheduling:approve",
  "escalate:plan",
  "escalate:run",
  "escalate:complete",
  "agent:dispatch",
  "agent:order",
  "agent:report",
  "agent:shell",
  "git:write",
  "audit:read",
  "llm:admin",
  "llm:approve",
  "receipt:issue",
  "events:write",
]);

export const operatorRecordSchema = z.object({
  operator_id: z.string().min(1),
  display_name: z.string().min(1),
  role: operatorRoleSchema,
  stakeholder_id: z.string().optional(),
  /** org-chart node id (department / headquarters). */
  org_unit_id: z.string().optional(),
  /** Empty = profile default (ceo: all roster agents; operator: none until grant/list set). */
  allowed_agents: z.array(z.string().min(1)).optional(),
  /** Empty = no path write restriction for ceo; operators should set or rely on grants. */
  data_path_globs: z.array(z.string().min(1)).optional(),
  status: operatorStatusSchema.default("active"),
  permissions: z.array(operatorPermissionSchema).optional(),
  key_hash: z.string().optional(),
  approver_name: z.string().optional(),
  email: z.string().email().optional(),
  webauthn_credential_ids: z.array(z.string()).optional(),
});

export const operatorRegistrySchema = z.object({
  version: z.literal("1"),
  operators: z.array(operatorRecordSchema),
});

export type OperatorRole = z.output<typeof operatorRoleSchema>;
export type OperatorStatus = z.output<typeof operatorStatusSchema>;
export type OperatorPermission = z.output<typeof operatorPermissionSchema>;
export type OperatorRecord = z.output<typeof operatorRecordSchema>;
export type OperatorRegistry = z.output<typeof operatorRegistrySchema>;
