import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ContractProtocolConfig } from "../../../schemas/protocol/contract-protocol.js";
import { contractSchema } from "../../../schemas/contract.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { loadProtocolRegistry } from "./registry.js";

const CORE_WIRE_EVENT_TYPES = new Set([
  "org.identity.presented",
  "org.authority.delegated",
  "org.transaction.recorded",
  "org.audit.attested",
  "org.witness.attestation.registered",
  "org.witness.receipt.issued",
]);

export interface PeerProtocolPolicy {
  peer_id: string;
  contract_ids: string[];
  allowed_event_types?: string[];
  allowed_transaction_types?: string[];
  allowed_payload_namespaces?: string[];
}

function mergeProtocolPolicy(
  base: PeerProtocolPolicy | undefined,
  protocol: ContractProtocolConfig,
  contractId: string,
  peerId: string
): PeerProtocolPolicy {
  const next: PeerProtocolPolicy = base ?? { peer_id: peerId, contract_ids: [] };
  if (!next.contract_ids.includes(contractId)) {
    next.contract_ids.push(contractId);
  }
  if (protocol.allowed_event_types?.length) {
    next.allowed_event_types = [
      ...new Set([...(next.allowed_event_types ?? []), ...protocol.allowed_event_types]),
    ];
  }
  if (protocol.allowed_transaction_types?.length) {
    next.allowed_transaction_types = [
      ...new Set([
        ...(next.allowed_transaction_types ?? []),
        ...protocol.allowed_transaction_types,
      ]),
    ];
  }
  if (protocol.allowed_payload_namespaces?.length) {
    next.allowed_payload_namespaces = [
      ...new Set([
        ...(next.allowed_payload_namespaces ?? []),
        ...protocol.allowed_payload_namespaces,
      ]),
    ];
  }
  return next;
}

export function resolvePeerProtocolPolicy(peerId: string): PeerProtocolPolicy | undefined {
  const contractsDir = join(getDataDir(), "contracts");
  if (!existsSync(contractsDir)) return undefined;

  let policy: PeerProtocolPolicy | undefined;
  for (const file of readdirSync(contractsDir)) {
    if (!file.endsWith(".yaml")) continue;
    const contractId = file.replace(/\.yaml$/, "");
    try {
      const contract = contractSchema.parse(readYamlFile(join(contractsDir, file), contractSchema));
      const protocol = contract.protocol;
      if (!protocol) continue;
      if (protocol.peer_id === peerId) {
        policy = mergeProtocolPolicy(policy, protocol, contractId, peerId);
      }
    } catch {
      /* skip invalid contract files during policy scan */
    }
  }
  return policy;
}

function matchesNamespace(transactionType: string, namespace: string): boolean {
  return (
    transactionType === namespace ||
    transactionType.startsWith(`${namespace}.`) ||
    transactionType.startsWith(`committee.${namespace.replace(/^steward\./, "")}`)
  );
}

export function assertEventTypeAllowedForPeer(peerId: string, eventType: string): void {
  const policy = resolvePeerProtocolPolicy(peerId);
  if (!policy?.allowed_event_types?.length) return;
  if (CORE_WIRE_EVENT_TYPES.has(eventType)) return;
  if (policy.allowed_event_types.includes(eventType)) return;
  throw new Error(
    `Event type ${eventType} not allowed for peer ${peerId} — contract protocol whitelist: ${policy.allowed_event_types.join(", ")}`
  );
}

export function assertTransactionPayloadAllowedForPeer(
  peerId: string,
  transactionType: string
): void {
  const policy = resolvePeerProtocolPolicy(peerId);
  if (!policy) return;

  if (policy.allowed_transaction_types?.length) {
    if (!policy.allowed_transaction_types.includes(transactionType)) {
      throw new Error(
        `Transaction type ${transactionType} not allowed for peer ${peerId} — whitelist: ${policy.allowed_transaction_types.join(", ")}`
      );
    }
    return;
  }

  if (policy.allowed_payload_namespaces?.length) {
    const ok = policy.allowed_payload_namespaces.some((ns) =>
      matchesNamespace(transactionType, ns)
    );
    if (!ok) {
      throw new Error(
        `Transaction type ${transactionType} not in allowed namespaces for peer ${peerId}: ${policy.allowed_payload_namespaces.join(", ")}`
      );
    }
  }
}

export function assertEnvelopeAllowedForPeer(
  peerId: string,
  eventType: string,
  payload?: Record<string, unknown>
): void {
  assertEventTypeAllowedForPeer(peerId, eventType);
  if (eventType === "org.transaction.recorded" && payload?.transaction_type) {
    assertTransactionPayloadAllowedForPeer(peerId, String(payload.transaction_type));
  }
  const registryIssue = validateEventTypeAgainstPlatform(eventType);
  if (registryIssue) {
    throw new Error(registryIssue);
  }
}

function validateEventTypeAgainstPlatform(eventType: string): string | null {
  const registry = loadProtocolRegistry();
  if (registry.core_event_types.includes(eventType)) return null;
  if (eventType.startsWith("committee.")) return null;
  for (const ns of registry.payload_namespaces) {
    if (eventType.startsWith(`${ns}.`)) return null;
  }
  return `event type ${eventType} not in platform protocol registry`;
}
