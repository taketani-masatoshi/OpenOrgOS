import { z } from "zod";

/** National government interoperability profiles wrapped by OpenOrgOS Wire. */
export const govGatewayProfileIdSchema = z.enum([
  "xroad_v7",
  "xroad_v6",
  "jp_egov_central",
  "jp_lgwan",
  "jp_gbiz",
  "ge_gov_gateway_3g",
  // Hub jurisdictions
  "ae_uae_api",
  "ae_open_finance",
  "ie_psb_api",
  "nz_api_standard",
  "tr_edevelop",
  "us_fed_api",
  "us_oscal",
  "cl_pisee",
  "cl_chileatiende",
  "eg_digital_egypt",
  "xroad_v7_dj",
  "za_sita_mios",
  "eu_edelivery_as4",
  // Major countries (no Hub)
  "cn_gov_data_exchange",
  "hk_iam_smart",
  "sg_apex",
  "au_apigovau",
  "au_agdis",
  "ru_smev4",
  "in_api_setu",
]);

export const govGatewayWitnessModeSchema = z.enum([
  "orgos_hub",
  "native",
  "both",
]);

export const govGatewayTransportSchema = z.enum([
  "gov_gateway",
  "openorgos_p2p",
  "relay",
  "wire_v1",
  "legacy_webhook",
]);

export const govGatewayPeerBindingSchema = z.object({
  profile_id: govGatewayProfileIdSchema,
  service_code: z.string().optional(),
  member_code: z.string().optional(),
  subsystem_code: z.string().optional(),
});

export const peerEndpointGovGatewaySchema = z.object({
  transport: z.literal("gov_gateway"),
  gov_gateway: govGatewayPeerBindingSchema,
});

export const govGatewayAuditBridgeSchema = z.object({
  map_native_id_to: z.enum(["correlation_id", "causation_id"]).default("correlation_id"),
  append_to: z.string().default("data/protocol/audit-chain.jsonl"),
});

export const govGatewayProfileBindingSchema = z.object({
  profile_id: govGatewayProfileIdSchema,
  adapter_ref: z.string().min(1),
  enabled: z.boolean().default(true),
  member_code: z.string().optional(),
  subsystem_code: z.string().optional(),
  service_code: z.string().optional(),
  security_server_url: z.string().url().optional(),
  api_base_url: z.string().url().optional(),
  notes: z.string().optional(),
});

export const govGatewayConfigSchema = z.object({
  enabled: z.boolean().default(false),
  default_profile: govGatewayProfileIdSchema.optional(),
  witness_mode: govGatewayWitnessModeSchema.default("orgos_hub"),
  hub_pool_ref: z.string().optional(),
  audit_bridge: govGatewayAuditBridgeSchema.optional(),
  profiles: z.array(govGatewayProfileBindingSchema).default([]),
  /**
   * Extra X-Road-Client identities allowed to call the producer listener.
   * Peers with gov_gateway.member_code and profile bindings are trusted automatically.
   */
  trusted_xroad_clients: z.array(z.string().min(1)).default([]),
});

export const govGatewayRegistryEntrySchema = z.object({
  profile_id: govGatewayProfileIdSchema,
  jurisdiction: z.string().length(2),
  display_name: z.string().min(1),
  native_standard: z.string().min(1),
  profile_ref: z.string().min(1),
  status: z.enum(["draft", "pilot", "production"]).default("draft"),
});

export const govGatewayRegistrySchema = z.object({
  version: z.literal("1"),
  adapters: z.array(govGatewayRegistryEntrySchema),
});

export type GovGatewayProfileId = z.output<typeof govGatewayProfileIdSchema>;
export type GovGatewayWitnessMode = z.output<typeof govGatewayWitnessModeSchema>;
export type GovGatewayConfig = z.output<typeof govGatewayConfigSchema>;
export type GovGatewayRegistry = z.output<typeof govGatewayRegistrySchema>;
export type GovGatewayPeerBinding = z.output<typeof govGatewayPeerBindingSchema>;
export type GovGatewayProfileBinding = z.output<typeof govGatewayProfileBindingSchema>;
