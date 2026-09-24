/** Wire trust-registry command handlers. */

export interface ProtocolTrustRegistryValidateOptions {
  json?: boolean;
}

export async function runProtocolTrustRegistryValidate(
  opts: ProtocolTrustRegistryValidateOptions = {}
): Promise<void> {
  const { validateWireTrustRegistry } = await import("../../lib/protocol/distribution/wire-trust-registry.js");
  const result = validateWireTrustRegistry();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Wire trust registry OK");
    for (const w of result.warnings) {
      console.log(`  [warn] ${w.code}: ${w.message}`);
    }
    return;
  }
  console.error("✗ Wire trust registry validation failed:");
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolTrustRegistryListOptions {
  json?: boolean;
}

export async function runProtocolTrustRegistryList(opts: ProtocolTrustRegistryListOptions = {}): Promise<void> {
  const { loadWireTrustRegistry } = await import("../../lib/protocol/distribution/wire-trust-registry.js");
  const registry = loadWireTrustRegistry();
  if (opts.json) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }
  console.log(`wire trust registry: ${registry.nodes.length} node(s)`);
  for (const node of registry.nodes) {
    console.log(`  · ${node.node_id}${node.did ? ` · ${node.did}` : ""}`);
  }
}

export interface ProtocolTrustRegistryResolveOptions {
  id: string;
  json?: boolean;
}

export async function runProtocolTrustRegistryResolve(opts: ProtocolTrustRegistryResolveOptions): Promise<void> {
  const { resolveWireTrustNode } = await import("../../lib/protocol/distribution/wire-trust-registry.js");
  const resolved = resolveWireTrustNode(opts.id);
  if (opts.json) {
    console.log(JSON.stringify(resolved ?? { found: false }, null, 2));
    if (!resolved) process.exit(1);
    return;
  }
  if (!resolved) {
    console.error(`✗ not found: ${opts.id}`);
    process.exit(1);
  }
  console.log(`✓ ${resolved.node.node_id} (matched by ${resolved.matched_by})`);
  if (resolved.node.did) console.log(`  did: ${resolved.node.did}`);
  if (resolved.node.node_uri) console.log(`  node_uri: ${resolved.node.node_uri}`);
  if (resolved.node.wire_url) console.log(`  wire_url: ${resolved.node.wire_url}`);
}

export interface ProtocolTrustRegistrySyncKeysOptions {
  nodeId?: string;
  wireUrl?: string;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function runProtocolTrustRegistrySyncKeys(
  opts: ProtocolTrustRegistrySyncKeysOptions = {}
): Promise<void> {
  const { syncWireTrustRegistryPublicKeys } = await import("../../lib/protocol/distribution/wire-trust-registry-sync.js"
  );
  const { results } = await syncWireTrustRegistryPublicKeys({
    nodeId: opts.nodeId,
    wireUrl: opts.wireUrl,
    force: opts.force,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify({ results }, null, 2));
    if (results.some((r) => r.status === "error")) process.exit(1);
    return;
  }
  for (const r of results) {
    console.log(
      `  [${r.status}] ${r.node_id}${r.wire_url ? ` @ ${r.wire_url}` : ""}${r.detail ? ` · ${r.detail}` : ""}`
    );
  }
  if (results.some((r) => r.status === "error")) process.exit(1);
  console.log(`✓ trust-registry sync-keys (${results.length} node(s))`);
}

export interface ProtocolTrustRegistryPinLocalOptions {
  tenant?: string;
  nodeId?: string;
  force?: boolean;
  dryRun?: boolean;
  bypassGovernance?: boolean;
  json?: boolean;
}

export async function runProtocolTrustRegistryPinLocal(
  opts: ProtocolTrustRegistryPinLocalOptions
): Promise<void> {
  const { getTenantId } = await import("../../lib/tenant.js");
  const tenant = opts.tenant ?? getTenantId();
  const { pinLocalWireTrustRegistryKeys } = await import("../../lib/protocol/distribution/wire-trust-registry-sync.js"
  );
  const { results } = pinLocalWireTrustRegistryKeys({
    tenant,
    nodeId: opts.nodeId,
    force: opts.force,
    dryRun: opts.dryRun,
    bypassGovernance: opts.bypassGovernance,
  });
  if (opts.json) {
    console.log(JSON.stringify({ results }, null, 2));
    if (results.some((r) => r.status === "error")) process.exit(1);
    return;
  }
  for (const r of results) {
    console.log(`  [${r.status}] ${r.node_id}${r.detail ? ` · ${r.detail}` : ""}`);
  }
  if (results.some((r) => r.status === "error")) process.exit(1);
  console.log("✓ trust-registry pin-local");
  console.log("  Next: orgos protocol trusted-hubs-sync-keys --jurisdiction JP --force");
}

export interface ProtocolTrustRegistrySubmitOptions {
  tenant: string;
  wireEmail?: string;
  corporateNumber?: string;
  requestedBy?: string;
  wireUrl?: string;
  json?: boolean;
}

export async function runProtocolTrustRegistrySubmit(
  opts: ProtocolTrustRegistrySubmitOptions
): Promise<void> {
  const { submitWireNodeGovernanceRequest } = await import("../../lib/protocol/distribution/wire-node-governance.js");
  const { loadWireGatewayConfig } = await import("../../lib/wire-gateway/validate.js");
  const gateway = loadWireGatewayConfig();
  if (!gateway) throw new Error(`wire-gateway.yaml missing for tenant ${opts.tenant}`);
  const request = submitWireNodeGovernanceRequest({
    tenantId: opts.tenant,
    gateway,
    wireEmail: opts.wireEmail,
    corporateNumber: opts.corporateNumber,
    requestedBy: opts.requestedBy,
    wireUrl: opts.wireUrl,
  });
  if (opts.json) {
    console.log(JSON.stringify(request, null, 2));
    return;
  }
  console.log(`✓ governance request submitted: ${request.request_id}`);
  console.log(`  tenant: ${request.tenant_id} · node: ${request.node_id}`);
  if (request.wire_email) console.log(`  wire_email: ${request.wire_email}`);
}

export interface ProtocolTrustRegistryDecideOptions {
  requestId: string;
  approve: boolean;
  reject?: boolean;
  decidedBy: string;
  note?: string;
  json?: boolean;
}

export async function runProtocolTrustRegistryDecide(
  opts: ProtocolTrustRegistryDecideOptions
): Promise<void> {
  const approve = opts.reject ? false : !!opts.approve;
  const { decideWireNodeGovernanceRequest } = await import("../../lib/protocol/distribution/wire-node-governance.js");
  const { request, node } = decideWireNodeGovernanceRequest({
    requestId: opts.requestId,
    approve,
    decidedBy: opts.decidedBy,
    note: opts.note,
  });
  if (opts.json) {
    console.log(JSON.stringify({ request, node }, null, 2));
    return;
  }
  console.log(`✓ request ${request.request_id} ${request.status}`);
  if (node) console.log(`  merged node: ${node.node_id}`);
}

export interface ProtocolTrustRegistryPendingOptions {
  json?: boolean;
}

export async function runProtocolTrustRegistryPending(
  opts: ProtocolTrustRegistryPendingOptions = {}
): Promise<void> {
  const { listPendingWireNodeRequests } = await import("../../lib/protocol/distribution/wire-node-governance.js");
  const pending = listPendingWireNodeRequests();
  if (opts.json) {
    console.log(JSON.stringify({ pending }, null, 2));
    return;
  }
  console.log(`${pending.length} pending wire node request(s)`);
  for (const r of pending) {
    console.log(`  · ${r.request_id} · ${r.tenant_id} · ${r.node_id}`);
  }
}


export {
  runProtocolTrustedHubsList,
  runProtocolTrustedHubsValidate,
  runProtocolTrustedHubsSyncKeys,
} from "./witness.js";
export type {
  ProtocolTrustedHubsListOptions,
  ProtocolTrustedHubsValidateOptions,
  ProtocolTrustedHubsSyncKeysOptions,
} from "./witness.js";

export {
  runProtocolTlsRotate,
  runProtocolTlsInitProposal3,
  runProtocolTlsVerify,
} from "./tls.js";
export type {
  ProtocolTlsRotateOptions,
  ProtocolTlsInitProposal3Options,
  ProtocolTlsVerifyOptions,
} from "./tls.js";
