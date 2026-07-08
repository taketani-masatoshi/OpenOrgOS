import { z } from "zod";
import { govGatewayProfileIdSchema } from "./gov-gateway-adapter.js";

export const openOrgOsMimeSchema = z.object({
  mime: z.literal("application/vnd.openorgos.envelope+json"),
  canonical: z.string().optional(),
});

export const govGatewayMessageFormatSchema = z
  .object({
    openorgos_envelope: openOrgOsMimeSchema.optional(),
    fallback: z.object({ mime: z.string() }).optional(),
    ministry_schema: z
      .object({
        mime: z.string(),
        mapping: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const govGatewayIdentityMappingSchema = z
  .object({
    org_id_to: z.string().optional(),
    org_uri_to: z.string().optional(),
  })
  .passthrough();

export const xroadProfileExtensionSchema = z
  .object({
    member_class: z.string().optional(),
    subsystem_suffix: z.string().optional(),
    service_codes: z.record(z.string()).optional(),
    headers: z
      .object({
        required: z.array(z.string()).optional(),
      })
      .optional(),
    correlation: z
      .object({
        request_id: z.string().optional(),
        correlation_id: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const gateway3gProfileExtensionSchema = z
  .object({
    participant_types: z.array(z.string()).optional(),
    service_registration_required: z.boolean().optional(),
    digital_signature_infrastructure: z.boolean().optional(),
    correlation: z
      .object({
        transaction_id: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

/** Single-profile document (EE · GE). */
export const govGatewaySingleProfileSchema = z
  .object({
    profile_id: govGatewayProfileIdSchema,
    jurisdiction: z.string().min(2),
    native_standard: z.string().optional(),
    version: z.string().optional(),
    transport: z.record(z.unknown()).optional(),
    message_format: govGatewayMessageFormatSchema.optional(),
    identity_mapping: govGatewayIdentityMappingSchema.optional(),
    xroad: xroadProfileExtensionSchema.optional(),
    gateway_3g: gateway3gProfileExtensionSchema.optional(),
    witness: z.record(z.unknown()).optional(),
    substance: z.record(z.unknown()).optional(),
  })
  .passthrough();

/** JP multi-profile document. */
export const govGatewayJpProfileEntrySchema = z
  .object({
    profile_id: govGatewayProfileIdSchema,
    display_name: z.string().optional(),
    transport: z.record(z.unknown()).optional(),
    auth: z.record(z.unknown()).optional(),
    message_format: govGatewayMessageFormatSchema.optional(),
    identity_mapping: govGatewayIdentityMappingSchema.optional(),
    audit: z.record(z.unknown()).optional(),
    services: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const govGatewayMultiProfileSchema = z
  .object({
    jurisdiction: z.string().min(2),
    native_standard: z.string().optional(),
    profiles: z.array(govGatewayJpProfileEntrySchema).min(1),
    witness: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const govGatewayProfileDocumentSchema = z.union([
  govGatewaySingleProfileSchema,
  govGatewayMultiProfileSchema,
]);

export type GovGatewayProfileDocument = z.output<typeof govGatewayProfileDocumentSchema>;
export type GovGatewaySingleProfile = z.output<typeof govGatewaySingleProfileSchema>;
export type GovGatewayJpProfileEntry = z.output<typeof govGatewayJpProfileEntrySchema>;

export function isMultiProfileDocument(
  doc: GovGatewayProfileDocument
): doc is z.output<typeof govGatewayMultiProfileSchema> {
  return "profiles" in doc && Array.isArray(doc.profiles);
}

export function resolveProfileEntry(
  doc: GovGatewayProfileDocument,
  profileId: string
): Record<string, unknown> | undefined {
  if (isMultiProfileDocument(doc)) {
    const entry = doc.profiles.find((p) => p.profile_id === profileId);
    return entry as Record<string, unknown> | undefined;
  }
  if (doc.profile_id === profileId) {
    return doc as Record<string, unknown>;
  }
  return undefined;
}
