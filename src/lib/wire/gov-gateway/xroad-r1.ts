/**
 * X-Road /r1 URL helpers and client trust checks.
 * Path: src/lib/wire/gov-gateway/xroad-r1.ts
 */
import { loadPeersRegistry } from "../../protocol/peers.js";
import { findProfileBinding, loadGovGatewayConfig } from "./config.js";
import type { GovGatewayProfileId } from "../../../../schemas/protocol/gov-gateway-adapter.js";

/**
 * Build Security Server REST path:
 * `/r1/{instance}/{memberClass}/{memberCode}/{subsystem}/{service}`
 * or accept a full service_code already containing that path tail.
 */
export function buildXRoadR1Path(parts: {
  instance?: string;
  memberClass?: string;
  memberCode?: string;
  subsystem?: string;
  service?: string;
  /** Full service path like EE/COM/PARTNER/wire/notice-deliver */
  serviceCode?: string;
}): string {
  if (parts.serviceCode?.trim()) {
    const code = parts.serviceCode.replace(/^\/+/, "").replace(/^r1\//, "");
    return `/r1/${code}`;
  }
  const instance = parts.instance ?? "EE";
  const memberClass = parts.memberClass ?? "COM";
  const memberCode = parts.memberCode ?? "OPENORGOS";
  const subsystem = parts.subsystem ?? "wire";
  const service = parts.service ?? "notice-deliver";
  return `/r1/${instance}/${memberClass}/${memberCode}/${subsystem}/${service}`;
}

/** Resolve absolute deliver URL: absolute peer URL wins; relative → SS + /r1/... */
export function resolveXRoadDeliverUrl(opts: {
  peerUrl: string;
  securityServerUrl?: string;
  serviceCode?: string;
}): string {
  const peer = opts.peerUrl.trim();
  try {
    const parsed = new URL(peer);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return peer;
    }
  } catch {
    /* relative */
  }
  const base = opts.securityServerUrl?.replace(/\/+$/, "");
  if (!base) {
    throw new Error("Relative peer URL requires security_server_url on gov-gateway binding");
  }
  if (peer.startsWith("/r1/")) {
    return `${base}${peer}`;
  }
  if (peer.startsWith("r1/")) {
    return `${base}/${peer}`;
  }
  const path = buildXRoadR1Path({ serviceCode: opts.serviceCode ?? peer });
  return `${base}${path}`;
}

function normalizeClient(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * True when X-Road-Client matches a trusted peer member, profile binding, or
 * explicit trusted_xroad_clients entry.
 */
export function isTrustedXRoadClient(
  clientHeader: string | undefined,
  profileId?: GovGatewayProfileId,
): boolean {
  if (!clientHeader?.trim()) return false;
  const client = normalizeClient(clientHeader);
  const config = loadGovGatewayConfig();
  for (const allowed of config?.trusted_xroad_clients ?? []) {
    if (normalizeClient(allowed) === client) return true;
  }

  if (profileId) {
    const binding = findProfileBinding(config, profileId);
    if (binding?.member_code) {
      const own = binding.subsystem_code
        ? `${binding.member_code}/${binding.subsystem_code}`
        : binding.member_code;
      if (normalizeClient(own) === client) return true;
      if (normalizeClient(binding.member_code) === client) return true;
    }
  }

  for (const peer of loadPeersRegistry().peers) {
    for (const ep of peer.inbound_endpoints ?? []) {
      if (ep.transport !== "gov_gateway" || !ep.gov_gateway) continue;
      const member = ep.gov_gateway.member_code;
      if (!member) continue;
      const withSub = ep.gov_gateway.subsystem_code
        ? `${member}/${ep.gov_gateway.subsystem_code}`
        : member;
      if (normalizeClient(withSub) === client || normalizeClient(member) === client) {
        return true;
      }
    }
  }

  return false;
}
