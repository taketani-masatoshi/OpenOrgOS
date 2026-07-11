import { z } from "zod";

export const witnessTrustAuthoritySchema = z.object({
  authority_id: z.string().regex(/^WTA-[A-Z0-9-]+$/),
  org_name: z.string().min(1),
  org_uri: z.string().optional(),
  jurisdiction: z.string().min(2),
  public_key: z.string().min(1),
  issued_at: z.string().min(1),
});

export const witnessHubCertificateSchema = z.object({
  cert_id: z.string().uuid(),
  hub_id: z.string().min(1),
  hub_url: z.string().url(),
  hub_public_key: z.string().min(1),
  jurisdiction: z.string().min(2).optional(),
  issued_at: z.string().min(1),
  expires_at: z.string().optional(),
  authority_id: z.string().regex(/^WTA-[A-Z0-9-]+$/),
  authority_signature: z.string().min(1),
});

export const witnessTrustRevocationSchema = z.object({
  cert_id: z.string().uuid(),
  hub_id: z.string().min(1),
  revoked_at: z.string().min(1),
  reason: z.string().optional(),
  operator_id: z.string().optional(),
});

export const witnessTrustBundleSchema = z.object({
  version: z.literal("1"),
  authority: witnessTrustAuthoritySchema,
  certificates: z.array(witnessHubCertificateSchema).default([]),
  revocations: z.array(witnessTrustRevocationSchema).default([]),
  published_at: z.string().min(1),
  bundle_signature: z.string().min(1),
});

export type WitnessTrustAuthority = z.output<typeof witnessTrustAuthoritySchema>;
export type WitnessHubCertificate = z.output<typeof witnessHubCertificateSchema>;
export type WitnessTrustRevocation = z.output<typeof witnessTrustRevocationSchema>;
export type WitnessTrustBundle = z.output<typeof witnessTrustBundleSchema>;
