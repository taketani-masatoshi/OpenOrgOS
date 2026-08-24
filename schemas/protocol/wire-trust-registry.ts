import { z } from "zod";
import { openOrgDidSchema } from "./openorg-did.js";

export const wireTrustNodeStatusSchema = z.enum(["active", "suspended", "revoked"]);

export const wireTrustRegistryNodeSchema = z.object({
  node_id: z.string().min(1),
  /** OrgOS tenant workspace id — primary key for the Wire adopter directory. */
  tenant_id: z.string().min(1),
  status: wireTrustNodeStatusSchema.default("active"),
  did: openOrgDidSchema.optional(),
  node_uri: z.string().optional(),
  display_name: z.string().optional(),
  protocol_public_key: z.string().default(""),
  wire_url: z.string().url().optional(),
  wire_email: z.string().email().optional(),
  corporate_number: z.string().optional(),
  witness_jurisdiction: z.string().optional(),
  onboarded_at: z.string().optional(),
  notes: z.string().optional(),
});

export const wireTrustRegistrySchema = z.object({
  version: z.string().default("1"),
  publish_url: z.string().url().optional(),
  notes: z.string().optional(),
  nodes: z.array(wireTrustRegistryNodeSchema).default([]),
});

export type WireTrustNodeStatus = z.output<typeof wireTrustNodeStatusSchema>;
export type WireTrustRegistryNode = z.output<typeof wireTrustRegistryNodeSchema>;
export type WireTrustRegistry = z.output<typeof wireTrustRegistrySchema>;
