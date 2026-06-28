import { z } from "zod";
import { resilienceSlaTierSchema } from "./resilience-sla.js";

export const contractWitnessHubRefSchema = z.object({
  hub_id: z.string().min(1),
  hub_url: z.string().url().optional(),
  trust_cert_id: z.string().uuid().optional(),
});

export const contractProtocolConfigSchema = z.object({
  peer_id: z.string().regex(/^PEER-\d{3}$/).optional(),
  resilience_sla: resilienceSlaTierSchema.default("silver"),
  witness_hubs: z.array(contractWitnessHubRefSchema).optional(),
  witness_trust_authority_url: z.string().url().optional(),
  witness_trust_bundle_url: z.string().url().optional(),
  relay_org_uri: z.string().optional(),
  /** Peer wire: allowed EventEnvelope.event.type values (core types always permitted). */
  allowed_event_types: z.array(z.string().min(1)).optional(),
  /** Peer wire: allowed org.transaction.recorded payload transaction_type values. */
  allowed_transaction_types: z.array(z.string().min(1)).optional(),
  /** Peer wire: allowed payload namespace prefixes (e.g. steward.contract). */
  allowed_payload_namespaces: z.array(z.string().min(1)).optional(),
});

export type ContractWitnessHubRef = z.output<typeof contractWitnessHubRefSchema>;
export type ContractProtocolConfig = z.output<typeof contractProtocolConfigSchema>;
