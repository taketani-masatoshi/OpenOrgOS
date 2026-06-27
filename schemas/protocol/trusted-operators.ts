import { z } from "zod";

export const revocationSlaPolicySchema = z.object({
  max_hours: z.number().int().positive().default(24),
  escalation_hours: z.number().int().positive().default(4),
});

export const trustedOperatorStatusSchema = z.enum(["active", "suspended", "revoked"]);

export const trustedOperatorEntrySchema = z.object({
  operator_id: z.string().regex(/^OP-[A-Z0-9-]+$/),
  org_name: z.string().min(1),
  org_uri: z.string().url().optional(),
  jurisdiction: z.string().min(2),
  hub_ids: z.array(z.string().min(1)).default([]),
  status: trustedOperatorStatusSchema.default("active"),
  certified_at: z.string().min(1),
  certified_by: z.string().regex(/^WTA-[A-Z0-9-]+$/),
  revocation_sla_hours: z.number().int().positive().optional(),
  revoked_at: z.string().optional(),
  revoke_reason: z.string().optional(),
});

export const governanceRequestStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const governanceRequestSchema = z.object({
  request_id: z.string().uuid(),
  operator_id: z.string().regex(/^OP-[A-Z0-9-]+$/),
  org_name: z.string().min(1),
  jurisdiction: z.string().min(2),
  hub_ids: z.array(z.string().min(1)).default([]),
  requested_at: z.string().min(1),
  requested_by: z.string().min(1),
  status: governanceRequestStatusSchema.default("pending"),
  decided_at: z.string().optional(),
  decided_by: z.string().optional(),
  decision_note: z.string().optional(),
});

export const trustedOperatorsRegistrySchema = z.object({
  version: z.literal("1"),
  revocation_sla: revocationSlaPolicySchema.default({ max_hours: 24, escalation_hours: 4 }),
  committee_id: z.string().min(1).default("ORGOS-JP-COMMITTEE"),
  operators: z.array(trustedOperatorEntrySchema).default([]),
  governance_requests: z.array(governanceRequestSchema).default([]),
});

export type RevocationSlaPolicy = z.output<typeof revocationSlaPolicySchema>;
export type TrustedOperatorEntry = z.output<typeof trustedOperatorEntrySchema>;
export type GovernanceRequest = z.output<typeof governanceRequestSchema>;
export type TrustedOperatorsRegistry = z.output<typeof trustedOperatorsRegistrySchema>;
