import { z } from "zod";

export const quorumModeSchema = z.enum(["any_of_n", "k_of_n", "all_of_n"]);

export const witnessHubEntrySchema = z.object({
  hub_id: z.string().min(1),
  hub_url: z.string().url(),
  hub_public_key: z.string().min(1),
  priority: z.number().int().default(1),
});

export const reg004TierSchema = z.enum(["A", "B", "C"]);

export const witnessReg004PolicySchema = z.object({
  require_quorum_for_tiers: z.array(reg004TierSchema).default([]),
  warn_only: z.boolean().default(true),
});

export const witnessPoolConfigSchema = z.object({
  enabled: z.boolean().default(false),
  quorum: z
    .object({
      mode: quorumModeSchema.default("any_of_n"),
      k: z.number().int().positive().optional(),
    })
    .default({ mode: "any_of_n" }),
  hubs: z.array(witnessHubEntrySchema).default([]),
  register_on: z.enum(["approve", "ingest", "both"]).default("both"),
  reg004_policy: witnessReg004PolicySchema.optional(),
});

export type QuorumMode = z.output<typeof quorumModeSchema>;
export type Reg004TierWire = z.output<typeof reg004TierSchema>;
export type WitnessReg004Policy = z.output<typeof witnessReg004PolicySchema>;
export type WitnessHubEntry = z.output<typeof witnessHubEntrySchema>;
export type WitnessPoolConfig = z.output<typeof witnessPoolConfigSchema>;
