/**
 * Compatibility shim — OpenOrg DNS lives in protocol transport.
 * Default trust-registry lookup is bound here (distribution layer).
 */
import { resolveWireTrustNode } from "../protocol/distribution/wire-trust-registry.js";
import {
  resolveOpenOrgWireUrl as resolveOpenOrgWireUrlCore,
  type OpenOrgDnsResolver,
  type TrustWireUrlLookup,
} from "../protocol/transport/openorg-dns.js";

export {
  isDnsStyleNodeId,
  formatOpenOrgWireDnsTxt,
  type OpenOrgDnsResolver,
  type TrustWireUrlLookup,
} from "../protocol/transport/openorg-dns.js";

function defaultTrustLookup(nodeId: string): { wire_url?: string } | undefined {
  const trust = resolveWireTrustNode(nodeId);
  return trust?.node.wire_url ? { wire_url: trust.node.wire_url } : undefined;
}

export async function resolveOpenOrgWireUrl(
  nodeId: string,
  opts?: { resolver?: OpenOrgDnsResolver; trustLookup?: TrustWireUrlLookup }
): Promise<Awaited<ReturnType<typeof resolveOpenOrgWireUrlCore>>> {
  return resolveOpenOrgWireUrlCore(nodeId, {
    resolver: opts?.resolver,
    trustLookup: opts?.trustLookup ?? defaultTrustLookup,
  });
}
