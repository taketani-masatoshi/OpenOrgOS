import { z } from "zod";
import { orgApprovalTierSchema } from "../org/tier.js";

export const quorumModeSchema = z.enum(["any_of_n", "k_of_n", "all_of_n"]);

export const witnessHubEntrySchema = z.object({
  hub_id: z.string().min(1),
  hub_url: z.string().url(),
  hub_public_key: z.string().min(1),
  priority: z.number().int().default(1),
});

export const wireApprovalTierSchema = orgApprovalTierSchema;

export const witnessWireGovernancePolicySchema = z.object({
  require_quorum_for_tiers: z.array(wireApprovalTierSchema).default([]),
  warn_only: z.boolean().default(true),
});

const witnessPoolConfigBaseSchema = z.object({
  enabled: z.boolean().default(false),
  quorum: z
    .object({
      mode: quorumModeSchema.default("any_of_n"),
      k: z.number().int().positive().optional(),
    })
    .default({ mode: "any_of_n" }),
  hubs: z.array(witnessHubEntrySchema).default([]),
  register_on: z.enum(["approve", "ingest", "both"]).default("both"),
  wire_governance_policy: witnessWireGovernancePolicySchema.optional(),
});

/** Legacy YAML key `reg004_policy` → `wire_governance_policy` (read-only compat). */
export const witnessPoolConfigSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const doc = raw as Record<string, unknown>;
  if (doc.reg004_policy && !doc.wire_governance_policy) {
    return { ...doc, wire_governance_policy: doc.reg004_policy };
  }
  return doc;
}, witnessPoolConfigBaseSchema);

export type QuorumMode = z.output<typeof quorumModeSchema>;
export type WireApprovalTierWire = z.output<typeof wireApprovalTierSchema>;
export type WitnessWireGovernancePolicy = z.output<typeof witnessWireGovernancePolicySchema>;
export type WitnessHubEntry = z.output<typeof witnessHubEntrySchema>;
export type WitnessPoolConfig = z.output<typeof witnessPoolConfigSchema>;

export function resolveWitnessWireGovernancePolicy(
  pool: WitnessPoolConfig
): WitnessWireGovernancePolicy | undefined {
  return pool.wire_governance_policy;
}
