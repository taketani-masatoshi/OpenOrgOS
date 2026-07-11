import { join } from "node:path";
import { getDataDir, getDocsDir } from "../utils.js";

export function getProtocolDataDir(): string {
  return join(getDataDir(), "protocol");
}

export function getPeersYamlPath(): string {
  return join(getProtocolDataDir(), "peers.yaml");
}

export function getTransactionsRegistryPath(): string {
  return join(getProtocolDataDir(), "transactions-registry.yaml");
}

export function getProtocolOutboxDir(): string {
  return join(getDocsDir(), "protocol", "outbox");
}

export function getProtocolInboxDir(): string {
  return join(getDocsDir(), "protocol", "inbox");
}

export function getProtocolAuditChainPath(): string {
  return join(getProtocolDataDir(), "audit-chain.jsonl");
}

export function getPendingNoticesPath(): string {
  return join(getProtocolDataDir(), "pending-notices.yaml");
}

export function getProtocolSigningKeyPath(): string {
  return join(getProtocolDataDir(), "signing-key.pem");
}

export function getWitnessPoolYamlPath(): string {
  return join(getProtocolDataDir(), "witness-pool.yaml");
}

export function getWitnessPendingYamlPath(): string {
  return join(getProtocolDataDir(), "witness-pending.yaml");
}

export function getWitnessReceiptsDir(): string {
  return join(getProtocolDataDir(), "witness-receipts");
}

export function getWitnessReceiptPath(eventId: string, hubId: string): string {
  return join(getWitnessReceiptsDir(), eventId, `${hubId}.json`);
}

export function getWirePendingYamlPath(): string {
  return join(getProtocolDataDir(), "wire-pending.yaml");
}

export function getRelayStateYamlPath(): string {
  return join(getProtocolDataDir(), "relay-state.yaml");
}

export function getWireRelayYamlPath(): string {
  return join(getProtocolDataDir(), "wire-relay-queue.yaml");
}

/** Org C relay — envelope blobs referenced by wire-relay-queue entries. */
export function getProtocolRelayStoreDir(): string {
  return join(getProtocolDataDir(), "relay-store");
}

export function getWitnessTrustDir(): string {
  return join(getProtocolDataDir(), "witness-trust");
}

export function getWitnessTrustAuthorityYamlPath(): string {
  return join(getWitnessTrustDir(), "authority.yaml");
}

export function getWitnessTrustAuthorityKeyPath(): string {
  return join(getWitnessTrustDir(), "authority-key.pem");
}

export function getWitnessTrustBundlePath(): string {
  return join(getWitnessTrustDir(), "bundle.json");
}

export function getMeshRoutesYamlPath(): string {
  return join(getProtocolDataDir(), "mesh-routes.yaml");
}

export function getSigningKeyMetaPath(): string {
  return join(getProtocolDataDir(), "signing-key-meta.yaml");
}

export function getReconcileAlertsYamlPath(): string {
  return join(getProtocolDataDir(), "reconcile-alerts.yaml");
}

export function getWitnessTrustRevocationsPath(): string {
  return join(getWitnessTrustDir(), "revocations.json");
}

export function getGovGatewayYamlPath(): string {
  return join(getProtocolDataDir(), "gov-gateway.yaml");
}

export function getGovGatewayAuditPath(): string {
  return join(getProtocolDataDir(), "gov-gateway-audit.jsonl");
}

export function getDeliveryAttemptsPath(): string {
  return join(getProtocolDataDir(), "delivery-attempts.yaml");
}
