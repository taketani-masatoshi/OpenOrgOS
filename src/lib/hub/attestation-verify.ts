import type { WitnessAttestation } from "../../../schemas/protocol/witness-attestation.js";
import { verifyWitnessAttestationSignature } from "../protocol/witness-attestation-crypto.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import { getHubRegisteredOrgsPath } from "./paths.js";

const registeredOrgSchema = z.object({
  org_id: z.string(),
  org_uri: z.string().optional(),
  protocol_public_key: z.string(),
  registered_at: z.string(),
});

const registeredOrgsRegistrySchema = z.object({
  orgs: z.array(registeredOrgSchema).default([]),
});

export function loadRegisteredOrgs(): z.output<typeof registeredOrgsRegistrySchema> {
  const path = getHubRegisteredOrgsPath();
  if (!existsSync(path)) {
    return { orgs: [] };
  }
  return readYamlFile(path, registeredOrgsRegistrySchema);
}

function saveRegisteredOrg(entry: z.output<typeof registeredOrgSchema>): void {
  const registry = loadRegisteredOrgs();
  const idx = registry.orgs.findIndex((o) => o.org_id === entry.org_id);
  if (idx >= 0) {
    if (registry.orgs[idx]!.protocol_public_key !== entry.protocol_public_key) {
      throw new Error(
        `Org ${entry.org_id} public key mismatch — expected pinned key in registered-orgs.yaml`
      );
    }
    return;
  }
  registry.orgs.push(entry);
  writeYamlFile(getHubRegisteredOrgsPath(), registry);
}

export function verifyAndRegisterAttestationOrg(attestation: WitnessAttestation): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!verifyWitnessAttestationSignature(attestation)) {
    issues.push("invalid org_signature");
    return { ok: false, issues };
  }

  if (attestation.side === "sent" && attestation.org_ref.org_id !== attestation.origin.org_id) {
    issues.push("sent attestation org_ref must match origin");
  }
  if (attestation.side === "received" && attestation.org_ref.org_id !== attestation.destination.org_id) {
    issues.push("received attestation org_ref must match destination");
  }

  const registry = loadRegisteredOrgs();
  const existing = registry.orgs.find((o) => o.org_id === attestation.org_ref.org_id);
  if (existing) {
    if (existing.protocol_public_key !== attestation.org_public_key) {
      issues.push(`public key mismatch for org ${attestation.org_ref.org_id}`);
    }
  } else {
    try {
      saveRegisteredOrg({
        org_id: attestation.org_ref.org_id,
        org_uri: attestation.org_ref.org_uri,
        protocol_public_key: attestation.org_public_key,
        registered_at: new Date().toISOString(),
      });
    } catch (e) {
      issues.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { ok: issues.length === 0, issues };
}
