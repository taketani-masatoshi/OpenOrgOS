import { protocolRegistrySchema, type ProtocolRegistry } from "../../../schemas/protocol/registry.js";
import { PROTOCOL_REGISTRY_PATH } from "../steward-paths.js";
import { loadRegistryFile } from "../utils.js";

export { PROTOCOL_REGISTRY_PATH };

export function loadProtocolRegistry(): ProtocolRegistry {
  return loadRegistryFile(PROTOCOL_REGISTRY_PATH, protocolRegistrySchema, () =>
    protocolRegistrySchema.parse({
      protocol_version: "1",
      core_event_types: [
        "org.identity.presented",
        "org.authority.delegated",
        "org.transaction.recorded",
        "org.audit.attested",
        "org.witness.attestation.registered",
        "org.witness.receipt.issued",
      ],
      payload_namespaces: ["steward.contract", "steward.payment", "steward.invoice"],
    })
  );
}

export function resolveCoreEventScope(eventType: string): "internal" | "wire" | "both" | undefined {
  const registry = loadProtocolRegistry();
  return registry.core_event_scopes?.[eventType];
}

export function validateEnvelopeAgainstRegistry(eventType: string): string | null {
  const registry = loadProtocolRegistry();
  if (registry.core_event_types.includes(eventType)) return null;
  if (eventType.startsWith("committee.")) return null;
  for (const ns of registry.payload_namespaces) {
    if (eventType.startsWith(`${ns}.`)) return null;
  }
  return `event type ${eventType} not in protocol registry core types or payload namespaces`;
}
