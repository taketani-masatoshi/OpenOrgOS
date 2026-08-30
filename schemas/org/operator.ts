import { z } from "zod";

export const operatorRoleSchema = z.enum([
  "ceo",
  "approver",
  "operator",
  /** Employee seat: files own expense claims. No console, no chat, no approval. */
  "employee",
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
  /** Sign off a concluded ISO internal audit. Human seats only; never LLM/MCP. */
  "audit:sign",
  "llm:admin",
  "llm:approve",
  "receipt:issue",
  "events:write",
  "guard:admin",
  /** Employee seat: file own expense claims and read own envelope. Nothing else. */
  "expense:claim",
]);

export const operatorRecordSchema = z.object({
  operator_id: z.string().min(1),
  display_name: z.string().min(1),
  role: operatorRoleSchema,
  stakeholder_id: z.string().optional(),
  /** org-chart node id (department / headquarters). */
  org_unit_id: z.string().optional(),
  /** org-chart node id of the human behind this seat (budget person / claimant). */
  person_id: z.string().optional(),
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
  /** Tax advisor / guest readonly / liquidator — ISO date after which access is revoked. */
  guest_expires_at: z.string().optional(),
  /** standard = standing operator; liquidator = winding-down liquidation seat (guest_expires_at required). */
  seat_kind: z.enum(["standard", "liquidator"]).default("standard"),
}).superRefine((op, ctx) => {
  if (op.seat_kind === "liquidator" && !op.guest_expires_at?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "liquidator seat requires guest_expires_at",
      path: ["guest_expires_at"],
    });
  }
});

export const founderMigrationSchema = z.object({
  status: z.enum(["open", "grace", "closed"]).default("open"),
  grace_until: z.string().optional(),
  closed_at: z.string().optional(),
});

export const operatorLoginPolicySchema = z.object({
  /** Company domains allowed for Community SSO / operator email (e.g. malkk.com). Empty = no extra domain gate. */
  email_domains: z.array(z.string().min(1)).default([]),
  /** Founder migration seat only — at most one personal email (must match active ceo). Do not add new ones. */
  grandfather_emails: z.array(z.string().email()).max(1).default([]),
  founder_migration: founderMigrationSchema.optional(),
});

export const operatorRegistrySchema = z.object({
  version: z.literal("1"),
  login_policy: operatorLoginPolicySchema.optional(),
  operators: z.array(operatorRecordSchema),
});

export type OperatorRole = z.output<typeof operatorRoleSchema>;
export type OperatorStatus = z.output<typeof operatorStatusSchema>;
export type OperatorPermission = z.output<typeof operatorPermissionSchema>;
export type OperatorRecord = z.output<typeof operatorRecordSchema>;
export type OperatorLoginPolicy = z.output<typeof operatorLoginPolicySchema>;
export type FounderMigration = z.output<typeof founderMigrationSchema>;
export type OperatorRegistry = z.output<typeof operatorRegistrySchema>;
