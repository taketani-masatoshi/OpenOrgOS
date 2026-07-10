import { z } from "zod";
import { openOrgDidSchema } from "./openorg-did.js";

export const wireNodeGovernanceStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const wireNodeGovernanceRequestSchema = z.object({
  request_id: z.string().uuid(),
  tenant_id: z.string().min(1),
  node_id: z.string().min(1),
  did: openOrgDidSchema.optional(),
  node_uri: z.string().optional(),
  display_name: z.string().min(1),
  jurisdiction: z.string().min(2),
  protocol_public_key: z.string().min(1),
  wire_url: z.string().url().optional(),
  wire_email: z.string().email().optional(),
  corporate_number: z.string().optional(),
  requested_at: z.string().min(1),
  requested_by: z.string().min(1),
  status: wireNodeGovernanceStatusSchema.default("pending"),
  decided_at: z.string().optional(),
  decided_by: z.string().optional(),
  decision_note: z.string().optional(),
});

export const wireNodeGovernanceRegistrySchema = z.object({
  version: z.literal("1"),
  committee_id: z.string().min(1).default("ORGOS-JP-COMMITTEE"),
  governance_requests: z.array(wireNodeGovernanceRequestSchema).default([]),
});

export type WireNodeGovernanceRequest = z.output<typeof wireNodeGovernanceRequestSchema>;
export type WireNodeGovernanceRegistry = z.output<typeof wireNodeGovernanceRegistrySchema>;
