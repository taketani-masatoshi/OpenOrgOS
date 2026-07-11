import { z } from "zod";
import { openOrgDidSchema } from "./openorg-did.js";

export const organizationCertificateAttestationSchema = z.object({
  version: z.literal("1").default("1"),
  org_did: openOrgDidSchema,
  spki_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  authority_id: z.string().regex(/^WTA-[A-Z0-9-]+$/),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  authority_signature: z.string().min(1),
});

export type OrganizationCertificateAttestation = z.output<
  typeof organizationCertificateAttestationSchema
>;
