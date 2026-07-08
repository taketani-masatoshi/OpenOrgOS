import { z } from "zod";
import { witnessHubEntrySchema } from "./witness-pool.js";

/** Registry entry — hub_public_key may be empty until operator pins via sync-keys. */
export const trustedHubRegistryEntrySchema = z.object({
  hub_id: z.string().min(1),
  hub_url: z.string().url(),
  hub_public_key: z.string().default(""),
  priority: z.number().int().default(1),
});

export const trustedHubsJurisdictionSchema = z.object({
  jurisdiction: z.string().min(1),
  notes: z.string().optional(),
  hubs: z.array(trustedHubRegistryEntrySchema).default([]),
});

export const trustedHubsRegistrySchema = z.object({
  version: z.string().default("1"),
  jurisdictions: z.array(trustedHubsJurisdictionSchema).default([]),
});

export type TrustedHubsJurisdiction = z.output<typeof trustedHubsJurisdictionSchema>;
export type TrustedHubsRegistry = z.output<typeof trustedHubsRegistrySchema>;
