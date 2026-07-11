import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  wireNodeGovernanceRegistrySchema,
  type WireNodeGovernanceRequest,
  type WireNodeGovernanceRegistry,
} from "../../../schemas/protocol/wire-node-governance.js";
import {
  wireTrustRegistrySchema,
  type WireTrustRegistryNode,
} from "../../../schemas/protocol/wire-trust-registry.js";
import { STEWARD_PLATFORM_DIR } from "../steward-paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import { getWireTrustRegistryPath, validateWireTrustRegistry, loadWireTrustRegistry } from "./wire-trust-registry.js";
import { isTenantInWireTrustRegistry } from "./wire-node-governance-gate.js";
import { setTenantId } from "../tenant.js";
import { getDataDir } from "../utils.js";
import { loadWireGatewayConfig } from "../wire-gateway/validate.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "./signing.js";
import { resolveOpenOrgDid, resolveWireNodeDid } from "../../../schemas/protocol/openorg-did.js";
import { isInternalEmailDomain } from "../correspondence/internal-domains.js";
import { companySchema } from "../../../schemas/company.js";
import YAML from "yaml";

const GOVERNANCE_PATH = join(STEWARD_PLATFORM_DIR, "protocol", "wire-node-governance.yaml");

export function getWireNodeGovernancePath(): string {
  return GOVERNANCE_PATH;
}

export function loadWireNodeGovernanceRegistry(path?: string): WireNodeGovernanceRegistry {
  const target = path ?? GOVERNANCE_PATH;
  if (!existsSync(target)) {
    return wireNodeGovernanceRegistrySchema.parse({
      version: "1",
      governance_requests: [],
    });
  }
  return readYamlFile(target, wireNodeGovernanceRegistrySchema);
}

export function saveWireNodeGovernanceRegistry(
  registry: WireNodeGovernanceRegistry,
  path?: string
): void {
  writeYamlFile(path ?? GOVERNANCE_PATH, registry);
}

function loadTenantCompanyProfile(tenantId: string): { corporate_number?: string; display_name?: string } {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return {};
  setTenantId(tenantId);
  const doc = YAML.parse(readFileSync(path, "utf-8"));
  const parsed = companySchema.safeParse(doc);
  if (!parsed.success) return {};
  return {
    corporate_number: parsed.data.corporate_number,
    display_name: parsed.data.name,
  };
}

export interface SubmitWireNodeRequestOptions {
  tenantId: string;
  wireEmail?: string;
  corporateNumber?: string;
  requestedBy?: string;
  wireUrl?: string;
  requireInternalDomain?: boolean;
  trustRegistryPath?: string;
  governancePath?: string;
}

export function submitWireNodeGovernanceRequest(
  opts: SubmitWireNodeRequestOptions
): WireNodeGovernanceRequest {
  setTenantId(opts.tenantId);
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) throw new Error("protocol signing key unavailable");

  const gateway = loadWireGatewayConfig();
  if (!gateway) {
    throw new Error(`wire-gateway.yaml missing for tenant ${opts.tenantId}`);
  }

  const company = loadTenantCompanyProfile(opts.tenantId);
  const corporateNumber = opts.corporateNumber ?? company.corporate_number;
  const wireEmail = opts.wireEmail?.trim();
  if (wireEmail && opts.requireInternalDomain !== false && !isInternalEmailDomain(wireEmail)) {
    throw new Error(`wire_email must use internal domain: ${wireEmail}`);
  }

  const did = resolveWireNodeDid({
    publicKeyBase64: publicKey,
    configured: gateway.did,
    tenantId: opts.tenantId,
    requirePk: true,
  });
  const nodeUri = gateway.node_uri ?? `steward://tenant/${opts.tenantId}`;
  const displayName = gateway.display_name ?? company.display_name ?? opts.tenantId;

  const reg = loadWireNodeGovernanceRegistry(opts.governancePath);
  const trust = opts.trustRegistryPath
    ? readYamlFile(opts.trustRegistryPath, wireTrustRegistrySchema)
    : loadWireTrustRegistry();

  for (const req of reg.governance_requests) {
    if (req.status !== "pending" && req.status !== "approved") continue;
    if (req.did === did) {
      throw new Error(`pending/active governance request already exists for DID ${did}`);
    }
    if (corporateNumber && req.corporate_number === corporateNumber) {
      throw new Error(`pending/active request for corporate_number ${corporateNumber}`);
    }
  }

  for (const node of trust.nodes) {
    if (node.did === did) {
      throw new Error(`DID already registered in wire-trust-registry: ${did}`);
    }
    if (corporateNumber && node.corporate_number === corporateNumber) {
      throw new Error(`corporate_number already registered: ${corporateNumber}`);
    }
  }

  const request: WireNodeGovernanceRequest = {
    request_id: randomUUID(),
    tenant_id: opts.tenantId,
    node_id: gateway.node_id,
    did,
    node_uri: nodeUri,
    display_name: displayName,
    jurisdiction: "JP",
    protocol_public_key: publicKey,
    wire_url: opts.wireUrl ?? gateway.internal_api.base_url.replace(/\/$/, ""),
    wire_email: wireEmail,
    corporate_number: corporateNumber,
    requested_at: new Date().toISOString(),
    requested_by: opts.requestedBy ?? `operator:${opts.tenantId}`,
    status: "pending",
  };

  reg.governance_requests.push(request);
  saveWireNodeGovernanceRegistry(reg, opts.governancePath);
  return request;
}

export function decideWireNodeGovernanceRequest(opts: {
  requestId: string;
  approve: boolean;
  decidedBy: string;
  note?: string;
  governancePath?: string;
  trustRegistryPath?: string;
}): { request: WireNodeGovernanceRequest; node?: WireTrustRegistryNode } {
  const reg = loadWireNodeGovernanceRegistry(opts.governancePath);
  const req = reg.governance_requests.find((r) => r.request_id === opts.requestId);
  if (!req) throw new Error(`Governance request ${opts.requestId} not found`);
  if (req.status !== "pending") throw new Error(`Request ${opts.requestId} already ${req.status}`);

  req.status = opts.approve ? "approved" : "rejected";
  req.decided_at = new Date().toISOString();
  req.decided_by = opts.decidedBy;
  req.decision_note = opts.note;

  let node: WireTrustRegistryNode | undefined;
  if (opts.approve) {
    const trustPath = opts.trustRegistryPath ?? getWireTrustRegistryPath();
    const trust = readYamlFile(trustPath, wireTrustRegistrySchema);
    const approvedNode: WireTrustRegistryNode = {
      node_id: req.node_id,
      did: req.did,
      node_uri: req.node_uri,
      display_name: req.display_name,
      protocol_public_key: req.protocol_public_key,
      wire_url: req.wire_url,
      wire_email: req.wire_email,
      corporate_number: req.corporate_number,
      witness_jurisdiction: req.jurisdiction,
    };
    node = approvedNode;
    const existingIdx = trust.nodes.findIndex((n) => n.node_id === req.node_id);
    if (existingIdx >= 0) trust.nodes[existingIdx] = approvedNode;
    else trust.nodes.push(approvedNode);

    const validation = validateWireTrustRegistry(trust);
    if (!validation.ok) {
      throw new Error(
        `trust registry validation failed: ${validation.issues.map((i) => i.message).join("; ")}`
      );
    }
    writeYamlFile(trustPath, trust);
  }

  saveWireNodeGovernanceRegistry(reg, opts.governancePath);
  return { request: req, node };
}

export function listPendingWireNodeRequests(): WireNodeGovernanceRequest[] {
  return loadWireNodeGovernanceRegistry().governance_requests.filter((r) => r.status === "pending");
}

export function isTenantWireNodeRegistryApproved(tenantId: string): boolean {
  return isTenantInWireTrustRegistry(tenantId);
}
