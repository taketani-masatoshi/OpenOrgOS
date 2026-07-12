import { resolveOpenOrgWireUrl, isDnsStyleNodeId, type OpenOrgDnsResolver } from "../../wire-gateway/openorg-dns.js";
import { findPeer, resolvePeerInboundEndpoints } from "../peers.js";

/** Augment peer endpoints with OpenOrg DNS resolution when peer has DNS-style node_id. */
export async function resolvePeerInboundEndpointsWithDns(
  peer: NonNullable<ReturnType<typeof findPeer>>,
  opts?: { dnsResolver?: OpenOrgDnsResolver }
): Promise<ReturnType<typeof resolvePeerInboundEndpoints>> {
  const endpoints = resolvePeerInboundEndpoints(peer);
  if (endpoints.length > 0) return endpoints;

  const nodeId =
    peer.did?.replace(/^did:ooo:org:/, "") ??
    peer.org_uri?.replace(/^steward:\/\/tenant\//, "");
  if (!nodeId || !isDnsStyleNodeId(nodeId)) return endpoints;

  const resolved = await resolveOpenOrgWireUrl(nodeId, { resolver: opts?.dnsResolver });
  if (!resolved.wire_url) return endpoints;

  return [
    {
      url: `${resolved.wire_url.replace(/\/$/, "")}/wire/v1/events`,
      transport: "wire_v1" as const,
      mode: "push" as const,
      priority: 1,
    },
  ];
}
