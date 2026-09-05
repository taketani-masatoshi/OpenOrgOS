import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import type { GovGatewayPeerBinding } from "../../../../schemas/protocol/gov-gateway-adapter.js";
import type { PeerEndpoint } from "../../../../schemas/protocol/peer-endpoint.js";
import { isGovGatewayEndpoint } from "../../../../schemas/protocol/peer-endpoint.js";
import { appendGovGatewayAuditBridge } from "./audit-bridge.js";
import {
  findProfileBinding,
  loadGovGatewayConfig,
  resolveAdapter,
} from "./config.js";
import type { EncodeContext, GatewayTarget } from "./types.js";

export type { GovGatewayPeerBinding };

export function mergeGovGatewayBinding(
  endpointBinding: GovGatewayPeerBinding,
  tenantBinding?: ReturnType<typeof findProfileBinding>
): GovGatewayPeerBinding & { security_server_url?: string; api_base_url?: string } {
  return {
    profile_id: endpointBinding.profile_id,
    service_code: endpointBinding.service_code ?? tenantBinding?.service_code,
    member_code: endpointBinding.member_code ?? tenantBinding?.member_code,
    subsystem_code: endpointBinding.subsystem_code ?? tenantBinding?.subsystem_code,
    security_server_url: tenantBinding?.security_server_url,
    api_base_url: tenantBinding?.api_base_url,
  };
}

export async function deliverEnvelopeViaGovGateway(options: {
  envelope: EventEnvelope;
  peerId: string;
  endpoint: PeerEndpoint;
  tenantId: string;
}): Promise<{
  ok: boolean;
  reason: string;
  httpStatus?: number;
  endpoint?: string;
  correlationId?: string;
}> {
  if (!isGovGatewayEndpoint(options.endpoint)) {
    return { ok: false, reason: "endpoint is not gov_gateway transport" };
  }

  const config = loadGovGatewayConfig();
  const profileId = options.endpoint.gov_gateway!.profile_id;
  const tenantBinding = findProfileBinding(config, profileId);
  const merged = mergeGovGatewayBinding(options.endpoint.gov_gateway!, tenantBinding);
  const adapter = resolveAdapter(profileId, tenantBinding);

  const encodeCtx: EncodeContext = {
    tenant_id: options.tenantId,
    peer_org_id: options.peerId,
    service_code: merged.service_code,
    member_code: merged.member_code,
    subsystem_code: merged.subsystem_code,
    participant_id: merged.member_code,
  };

  const native = await adapter.encode(options.envelope, encodeCtx);
  let endpointUrl = options.endpoint.url;
  try {
    if (profileId.startsWith("xroad")) {
      const { resolveXRoadDeliverUrl } = await import("./xroad-r1.js");
      endpointUrl = resolveXRoadDeliverUrl({
        peerUrl: options.endpoint.url,
        securityServerUrl: merged.security_server_url,
        serviceCode: merged.service_code,
      });
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      endpoint: options.endpoint.url,
    };
  }
  const target: GatewayTarget = {
    profile_id: profileId,
    endpoint_url: endpointUrl,
    service_code: merged.service_code,
    member_code: merged.member_code,
    subsystem_code: merged.subsystem_code,
    participant_id: merged.member_code,
  };

  const receipt = await adapter.deliver(native, target);

  if (config?.audit_bridge) {
    appendGovGatewayAuditBridge({
      event_id: options.envelope.event_id,
      profile_id: profileId,
      receipt,
      bridge: config.audit_bridge,
    });
  }

  if (receipt.ok) {
    return {
      ok: true,
      reason: receipt.detail ?? "ok",
      httpStatus: receipt.http_status,
      endpoint: endpointUrl,
      correlationId: receipt.correlation_id,
    };
  }

  return {
    ok: false,
    reason: receipt.detail ?? "gov gateway deliver failed",
    httpStatus: receipt.http_status,
    endpoint: endpointUrl,
  };
}

export {
  loadGovGatewayConfig,
  loadGovGatewayRegistry,
  resolveAdapter,
  validateGovGatewaySetup,
} from "./config.js";
export {
  decodeGovGatewayInbound,
  decodeGovGatewayInboundSync,
  isGovGatewayInboundBody,
  buildGovGatewayInboundWireBody,
} from "./ingest.js";
export { encodeOpenOrgOsMime, decodeOpenOrgOsMime, OPENORGOS_ENVELOPE_MIME } from "./encode-openorgos-mime.js";
export {
  HttpGovGatewayTransport,
  MockGovGatewayTransport,
  getDefaultGovGatewayTransport,
  setDefaultGovGatewayTransport,
  resetDefaultGovGatewayTransport,
} from "./transport-http.js";
export type {
  GovGatewayAdapter,
  NativeMessage,
  DeliveryReceipt,
  EncodeContext,
  DecodeContext,
  GatewayTarget,
  IngestResult,
  GovGatewayTransport,
} from "./types.js";
