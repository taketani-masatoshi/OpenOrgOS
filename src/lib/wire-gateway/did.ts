import {
  deriveOpenOrgDidFromPublicKey,
  deriveOpenOrgDidFromTenant,
  isOpenOrgDid,
  resolveOpenOrgDid,
  type OpenOrgDid,
} from "../../../schemas/protocol/openorg-did.js";
import { exportProtocolPublicKeyBase64 } from "../protocol/signing.js";
import { loadTenantConfig } from "../tenant.js";
import type { WireGatewayConfig } from "../../../schemas/protocol/wire-gateway-config.js";

export {
  deriveOpenOrgDidFromPublicKey,
  deriveOpenOrgDidFromTenant,
  isOpenOrgDid,
  resolveOpenOrgDid,
  type OpenOrgDid,
};

export function resolveWireGatewayDid(config?: Pick<WireGatewayConfig, "did">): OpenOrgDid | undefined {
  const tenantId = loadTenantConfig().id;
  const publicKey = exportProtocolPublicKeyBase64();
  return resolveOpenOrgDid({
    configured: config?.did,
    tenantId,
    publicKeyBase64: publicKey,
  });
}

export interface WireNodeIdentityFields {
  node_id: string;
  node_uri?: string;
  display_name?: string;
  protocol_public_key: string;
  wire_version: "0.1";
  did?: OpenOrgDid;
  trust_registry_url?: string;
}

export function buildWireNodeIdentityFields(
  config: WireGatewayConfig,
  protocolPublicKey: string,
  trustRegistryUrl?: string
): WireNodeIdentityFields {
  const did = resolveOpenOrgDid({
    configured: config.did,
    tenantId: loadTenantConfig().id,
    publicKeyBase64: protocolPublicKey,
  });
  return {
    node_id: config.node_id,
    node_uri: config.node_uri,
    display_name: config.display_name,
    protocol_public_key: protocolPublicKey,
    wire_version: config.wire_version,
    did,
    trust_registry_url: trustRegistryUrl ?? config.trust_registry_url,
  };
}
