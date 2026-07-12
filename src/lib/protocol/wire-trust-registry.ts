import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  wireTrustRegistrySchema,
  type WireTrustRegistry,
  type WireTrustRegistryNode,
} from "../../../schemas/protocol/wire-trust-registry.js";
import {
  isOpenOrgDid,
  isPkPrefixedOpenOrgDid,
  isPkDidRequired,
} from "../../../schemas/protocol/openorg-did.js";
import { STEWARD_PLATFORM_DIR } from "../steward-paths.js";
import { writeYamlFile, readYamlFile } from "../utils.js";

const REGISTRY_PATH = join(STEWARD_PLATFORM_DIR, "protocol", "wire-trust-registry.yaml");

export function getWireTrustRegistryPath(): string {
  return REGISTRY_PATH;
}

export function loadWireTrustRegistry(): WireTrustRegistry {
  if (!existsSync(REGISTRY_PATH)) {
    return wireTrustRegistrySchema.parse({ version: "1", nodes: [] });
  }
  return readYamlFile(REGISTRY_PATH, wireTrustRegistrySchema);
}

export function saveWireTrustRegistry(registry: WireTrustRegistry): void {
  writeYamlFile(REGISTRY_PATH, registry);
}

export interface WireTrustRegistryIssue {
  code: string;
  message: string;
}

export function validateWireTrustRegistry(registry?: WireTrustRegistry): {
  ok: boolean;
  issues: WireTrustRegistryIssue[];
  warnings: WireTrustRegistryIssue[];
} {
  const reg = registry ?? loadWireTrustRegistry();
  const issues: WireTrustRegistryIssue[] = [];
  const warnings: WireTrustRegistryIssue[] = [];
  const seenNodeIds = new Set<string>();
  const seenDids = new Set<string>();
  const seenCorporateNumbers = new Set<string>();
  const strict = process.env.ORGOS_STRICT_TRUST === "1";

  for (const node of reg.nodes) {
    if (seenNodeIds.has(node.node_id)) {
      issues.push({
        code: "duplicate-node-id",
        message: `Duplicate node_id: ${node.node_id}`,
      });
    }
    seenNodeIds.add(node.node_id);

    if (node.did) {
      if (!isOpenOrgDid(node.did)) {
        issues.push({
          code: "invalid-did",
          message: `Invalid DID for ${node.node_id}: ${node.did}`,
        });
      } else if (seenDids.has(node.did)) {
        issues.push({ code: "duplicate-did", message: `Duplicate DID: ${node.did}` });
      }
      seenDids.add(node.did);

      if (isPkDidRequired() && !isPkPrefixedOpenOrgDid(node.did)) {
        issues.push({
          code: "slug-did-disallowed",
          message: `${node.node_id}: pk-DID required (ORGOS_REQUIRE_PK_DID / ORGOS_STRICT_TRUST) — run wire-gateway did init --force`,
        });
      } else if (!isPkPrefixedOpenOrgDid(node.did)) {
        warnings.push({
          code: "slug-did-legacy",
          message: `${node.node_id}: slug DID ${node.did} — migrate to pk-DID via governance submit + wire-gateway did init --force`,
        });
      }
    }

    if (node.corporate_number) {
      if (seenCorporateNumbers.has(node.corporate_number)) {
        issues.push({
          code: "duplicate-corporate-number",
          message: `Duplicate corporate_number: ${node.corporate_number}`,
        });
      }
      seenCorporateNumbers.add(node.corporate_number);
    }

    if (!node.protocol_public_key?.trim()) {
      const item = {
        code: "missing-public-key",
        message: `${node.node_id}: protocol_public_key empty (pin before production)`,
      };
      if (strict) issues.push(item);
      else warnings.push(item);
    }
  }

  return { ok: issues.length === 0, issues, warnings };
}

export interface ResolvedWireNode {
  node: WireTrustRegistryNode;
  matched_by: "node_id" | "did" | "node_uri" | "tenant_from_uri";
}

export function resolveWireTrustNode(
  identifier: string,
  registry?: WireTrustRegistry
): ResolvedWireNode | undefined {
  const reg = registry ?? loadWireTrustRegistry();
  const normalized = identifier.trim();

  for (const node of reg.nodes) {
    if (node.node_id === normalized) {
      return { node, matched_by: "node_id" };
    }
    if (node.did === normalized) {
      return { node, matched_by: "did" };
    }
    if (node.node_uri === normalized) {
      return { node, matched_by: "node_uri" };
    }
    const tenant = node.node_uri?.match(/^steward:\/\/tenant\/([^/]+)$/)?.[1];
    if (tenant && tenant === normalized) {
      return { node, matched_by: "tenant_from_uri" };
    }
  }
  return undefined;
}

export interface NodeIdentifierPeer {
  peer_node_id: string;
  peer_node_uri?: string;
  peer_did?: string;
}

/** Match Wire sender/receiver against peer table or trust registry entry. */
export function nodeIdentifierMatches(claimed: string, peer: NodeIdentifierPeer): boolean {
  if (peer.peer_node_id === claimed) return true;
  if (peer.peer_node_uri === claimed) return true;
  if (peer.peer_did === claimed) return true;

  const tenantFromUri = peer.peer_node_uri?.match(/^steward:\/\/tenant\/([^/]+)$/)?.[1];
  if (tenantFromUri && tenantFromUri === claimed) return true;

  const resolved = resolveWireTrustNode(claimed);
  if (!resolved) return false;

  if (resolved.node.node_id === peer.peer_node_id) return true;
  if (resolved.node.did && resolved.node.did === peer.peer_did) return true;
  if (resolved.node.node_uri && resolved.node.node_uri === peer.peer_node_uri) return true;

  return false;
}
