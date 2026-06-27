import { z } from "zod";
import { resilienceSlaTierSchema } from "./resilience-sla.js";

export const contractWitnessHubRefSchema = z.object({
  hub_id: z.string().min(1),
  hub_url: z.string().url().optional(),
  trust_cert_id: z.string().uuid().optional(),
});

export const contractProtocolConfigSchema = z.object({
  resilience_sla: resilienceSlaTierSchema.default("silver"),
  witness_hubs: z.array(contractWitnessHubRefSchema).optional(),
  witness_trust_authority_url: z.string().url().optional(),
  witness_trust_bundle_url: z.string().url().optional(),
  relay_org_uri: z.string().optional(),
});

export type ContractWitnessHubRef = z.output<typeof contractWitnessHubRefSchema>;
export type ContractProtocolConfig = z.output<typeof contractProtocolConfigSchema>;
