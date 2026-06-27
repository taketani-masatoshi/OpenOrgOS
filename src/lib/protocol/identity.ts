import { randomUUID } from "node:crypto";
import type { EventEnvelope, OrgRef } from "../../../schemas/protocol/org-event.js";
import type { OrgIdentityDocument } from "../../../schemas/protocol/identity-exchange.js";
import { orgIdentityDocumentSchema } from "../../../schemas/protocol/identity-exchange.js";
import { loadOrgIdentityProfile } from "../org/identity-profile.js";
import { loadTenantConfig } from "../tenant.js";
import { exportProtocolPublicKeyBase64 } from "./signing.js";

export function ourOrgRef(): OrgRef {
  const tenant = loadTenantConfig();
  return { org_id: tenant.id, org_uri: `steward://tenant/${tenant.id}` };
}

export function buildIdentityDocument(options?: {
  stakeholderId?: string;
  omitCorporateNumber?: boolean;
}): OrgIdentityDocument {
  const profile = loadOrgIdentityProfile();
  const doc: OrgIdentityDocument = {
    org_ref: ourOrgRef(),
    jurisdiction: profile.jurisdiction,
    display_name: profile.display_name,
    issued_at: new Date().toISOString(),
  };
  if (!options?.omitCorporateNumber && profile.corporate_number) {
    doc.public_ids = { corporate_number: profile.corporate_number };
  }
  if (options?.stakeholderId) {
    doc.stakeholder_id = options.stakeholderId;
  }
  const publicKey = exportProtocolPublicKeyBase64();
  if (publicKey) {
    doc.protocol_public_key = publicKey;
  }
  return orgIdentityDocumentSchema.parse(doc);
}

export function buildIdentityEnvelope(
  doc: OrgIdentityDocument,
  destination?: OrgRef
): EventEnvelope {
  const now = new Date().toISOString();
  return {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin: doc.org_ref,
    destination,
    identity: { org_ref: doc.org_ref, document_version: doc.issued_at },
    event: {
      type: "org.identity.presented",
      payload: { identity: doc },
    },
    signature: null,
  };
}
