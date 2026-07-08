import { z } from "zod";
import { witnessHubEntrySchema } from "./witness-pool.js";

export const hubGossipConfigSchema = z.object({
  enabled: z.boolean().default(true),
  interval_sec: z.number().int().positive().default(300),
});

export const hubFederationSchema = z.object({
  hub_id: z.string().min(1),
  hub_peers: z.array(witnessHubEntrySchema).default([]),
  gossip: hubGossipConfigSchema.default({ enabled: true, interval_sec: 300 }),
});

export type HubGossipConfig = z.output<typeof hubGossipConfigSchema>;
export type HubFederationConfig = z.output<typeof hubFederationSchema>;
