import { z } from "zod";
import { witnessHubEntrySchema } from "./witness-pool.js";

export const trustedHubsJurisdictionSchema = z.object({
  jurisdiction: z.string().min(1),
  notes: z.string().optional(),
  hubs: z.array(witnessHubEntrySchema).default([]),
});

export const trustedHubsRegistrySchema = z.object({
  version: z.string().default("1"),
  jurisdictions: z.array(trustedHubsJurisdictionSchema).default([]),
});

export type TrustedHubsJurisdiction = z.output<typeof trustedHubsJurisdictionSchema>;
export type TrustedHubsRegistry = z.output<typeof trustedHubsRegistrySchema>;
