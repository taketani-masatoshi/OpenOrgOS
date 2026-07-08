import { z } from "zod";

export const protocolTlsCredentialsSchema = z.object({
  cert_path: z.string().min(1).optional(),
  key_path: z.string().min(1).optional(),
  ca_path: z.string().optional(),
  reject_unauthorized: z.boolean().default(true),
});

export const protocolApiClientConfigSchema = z.object({
  tls: protocolTlsCredentialsSchema.optional(),
  /** Optional org_uri pins for relay/trust peers (mTLS subject verification). */
  allowed_relay_org_uris: z.array(z.string()).optional(),
});

export const protocolApiServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().nonnegative().default(9476),
  tls: protocolTlsCredentialsSchema.optional(),
  /** Require client certificate on relay · inbox · outbox routes. */
  mtls_required: z.boolean().default(false),
  /** Allowed client org_uri values (from cert SAN URI or CN steward://tenant/…). */
  mtls_allowed_org_uris: z.array(z.string()).default([]),
  /** Trust bundle is served over HTTPS when tls is set; readable without client cert. */
  trust_bundle_public: z.boolean().default(true),
});

export type ProtocolTlsCredentials = z.output<typeof protocolTlsCredentialsSchema>;
export type ProtocolApiClientConfig = z.output<typeof protocolApiClientConfigSchema>;
export type ProtocolApiServerConfig = z.output<typeof protocolApiServerConfigSchema>;
