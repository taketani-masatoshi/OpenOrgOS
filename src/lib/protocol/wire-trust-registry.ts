import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  wireTrustRegistrySchema,
  type WireTrustNodeStatus,
  type WireTrustRegistry,
  type WireTrustRegistryNode,
} from "../../../schemas/protocol/wire-trust-registry.js";
import { isOpenOrgDid, isPkPrefixedOpenOrgDid, isPkDidRequired } from "../../../schemas/protocol/openorg-did.js";
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

function isJpJurisdiction(node: WireTrustRegistryNode): boolean {
  const j = (node.witness_jurisdiction ?? "JP").trim().toUpperCase();
  return j === "JP" || j === "JPN" || j === "JAPAN";
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
  const seenTenantIds = new Set<string>();
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

    if (!node.tenant_id?.trim()) {
      issues.push({
        code: "missing-tenant-id",
        message: `${node.node_id}: tenant_id is required (OOO adopter directory)`,
      });
    } else if (seenTenantIds.has(node.tenant_id)) {
      issues.push({
        code: "duplicate-tenant-id",
        message: `Duplicate tenant_id: ${node.tenant_id}`,
      });
    } else {
      seenTenantIds.add(node.tenant_id);
    }

    if (node.tenant_id && node.node_uri) {
      const expected = `steward://tenant/${node.tenant_id}`;
      if (node.node_uri !== expected) {
        issues.push({
          code: "node-uri-tenant-mismatch",
          message: `${node.node_id}: node_uri ${node.node_uri} must equal ${expected}`,
        });
      }
    }

    if (node.did) {
      if (!isOpenOrgDid(node.did)) {
        issues.push({ code: "invalid-did", message: `Invalid DID for ${node.node_id}: ${node.did}` });
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

    const status = node.status ?? "active";
    if (status === "active") {
      if (!node.wire_url?.trim()) {
        issues.push({
          code: "active-missing-wire-url",
          message: `${node.node_id}: active adopter requires wire_url`,
        });
      }
      if (isJpJurisdiction(node) && !node.corporate_number?.trim()) {
        issues.push({
          code: "active-jp-missing-corporate-number",
          message: `${node.node_id}: active JP adopter requires corporate_number`,
        });
      }
    }

    if (!node.protocol_public_key?.trim()) {
      const item = {
        code: "missing-public-key",
        message: `${node.node_id}: protocol_public_key empty (pin before production)`,
      };
      if (strict || status === "active") issues.push(item);
      else warnings.push(item);
    }
  }

  return { ok: issues.length === 0, issues, warnings };
}

export interface ResolvedWireNode {
  node: WireTrustRegistryNode;
  matched_by: "node_id" | "did" | "node_uri" | "tenant_id" | "tenant_from_uri";
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
  }
  for (const node of reg.nodes) {
    if (node.tenant_id === normalized) {
      return { node, matched_by: "tenant_id" };
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

export interface WireAdopterSummary {
  tenant_id: string;
  node_id: string;
  display_name?: string;
  corporate_number?: string;
  wire_url?: string;
  did?: string;
  status: WireTrustNodeStatus;
  witness_jurisdiction?: string;
}

export function listWireAdopters(opts?: {
  jurisdiction?: string;
  status?: WireTrustNodeStatus | "all";
  registry?: WireTrustRegistry;
}): WireAdopterSummary[] {
  const reg = opts?.registry ?? loadWireTrustRegistry();
  const statusFilter = opts?.status ?? "active";
  const jurisdiction = opts?.jurisdiction?.trim().toUpperCase();

  return reg.nodes
    .filter((n) => {
      const status = n.status ?? "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (jurisdiction) {
        const j = (n.witness_jurisdiction ?? "JP").trim().toUpperCase();
        if (j !== jurisdiction && !(jurisdiction === "JP" && (j === "JPN" || j === "JAPAN"))) {
          return false;
        }
      }
      return true;
    })
    .map((n) => ({
      tenant_id: n.tenant_id,
      node_id: n.node_id,
      display_name: n.display_name,
      corporate_number: n.corporate_number,
      wire_url: n.wire_url,
      did: n.did,
      status: n.status ?? "active",
      witness_jurisdiction: n.witness_jurisdiction,
    }));
}

/** Active adopter with a wire_url — eligible for Wire peer registration. */
export function isWireReadyAdopter(node: WireTrustRegistryNode | undefined): boolean {
  if (!node) return false;
  return (node.status ?? "active") === "active" && Boolean(node.wire_url?.trim());
}

export interface NodeIdentifierPeer {
  peer_node_id: string;
  peer_node_uri?: string;
  peer_did?: string;
}

/** Match Wire sender/receiver against peer table or trust registry entry. */
export function nodeIdentifierMatches(
  claimed: string,
  peer: NodeIdentifierPeer
): boolean {
  if (peer.peer_node_id === claimed) return true;
  if (peer.peer_node_uri === claimed) return true;
  if (peer.peer_did === claimed) return true;

  const tenantFromUri = peer.peer_node_uri?.match(/^steward:\/\/tenant\/([^/]+)$/)?.[1];
  if (tenantFromUri && tenantFromUri === claimed) return true;

  const resolved = resolveWireTrustNode(claimed);
  if (!resolved) return false;

  if (resolved.node.tenant_id === peer.peer_node_id) return true;
  if (resolved.node.node_id === peer.peer_node_id) return true;
  if (resolved.node.did && resolved.node.did === peer.peer_did) return true;
  if (resolved.node.node_uri && resolved.node.node_uri === peer.peer_node_uri) return true;

  return false;
}
