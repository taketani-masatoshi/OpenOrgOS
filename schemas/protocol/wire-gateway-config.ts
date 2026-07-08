import { z } from "zod";
import { wireVersionSchema } from "./wire-message.js";
import { openOrgDidSchema } from "./openorg-did.js";

export const wireGatewayListenSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().int().positive().default(8443),
  tls_cert: z.string().optional(),
  tls_key: z.string().optional(),
});

export const wireGatewayInternalApiSchema = z.object({
  base_url: z.string().url(),
  bearer_token_file: z.string().optional(),
  bearer_token: z.string().optional(),
  mtls_ca: z.string().optional(),
  mtls_cert: z.string().optional(),
  mtls_key: z.string().optional(),
});

export const wireGatewaySecuritySchema = z.object({
  timestamp_skew_sec: z.number().int().positive().default(300),
  nonce_ttl_sec: z.number().int().positive().default(604_800),
  rate_limit_per_min: z.number().int().positive().default(120),
  mtls_required: z.boolean().default(false),
  ip_allowlist: z.array(z.string()).optional(),
});

export const wireGatewayOutboundSchema = z.object({
  poll_interval_ms: z.number().int().positive().default(5000),
});

export const wireGatewayAuditConfigSchema = z.object({
  path: z.string().default("data/protocol/wire-gateway-audit.jsonl"),
});

export const wireGatewayLegacySchema = z.object({
  enabled: z.boolean().default(false),
});

/** Gateway instance config — tenants/{id}/data/protocol/wire-gateway.yaml */
export const wireGatewayConfigSchema = z.object({
  wire_version: wireVersionSchema.default("0.1"),
  node_id: z.string().min(1),
  node_uri: z.string().optional(),
  display_name: z.string().optional(),
  /** OpenOrg DID (did:ooo:org:…) — derived from tenant when omitted. */
  did: openOrgDidSchema.optional(),
  /** URL of platform wire-trust-registry.yaml mirror. */
  trust_registry_url: z.string().url().optional(),
  listen: wireGatewayListenSchema.default({}),
  internal_api: wireGatewayInternalApiSchema,
  security: wireGatewaySecuritySchema.default({}),
  outbound: wireGatewayOutboundSchema.default({}),
  audit: wireGatewayAuditConfigSchema.default({}),
  legacy: wireGatewayLegacySchema.default({}),
});

export type WireGatewayConfig = z.output<typeof wireGatewayConfigSchema>;
