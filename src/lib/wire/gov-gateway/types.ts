import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import type { GovGatewayProfileId } from "../../../../schemas/protocol/gov-gateway-adapter.js";

export const OPENORGOS_ENVELOPE_MIME = "application/vnd.openorgos.envelope+json";

/** Opaque native message (X-Road SOAP/REST body, e-Gov JSON, 3G payload). */
export type NativeMessage = {
  profile_id: GovGatewayProfileId;
  mime: string;
  body: string | Uint8Array;
  headers: Record<string, string>;
  native_message_id?: string;
  correlation_id?: string;
  transport_style?: "rest" | "soap";
};

export type EncodeContext = {
  tenant_id: string;
  peer_org_id?: string;
  service_code?: string;
  member_code?: string;
  subsystem_code?: string;
  participant_id?: string;
};

export type DecodeContext = {
  tenant_id: string;
  profile_id: GovGatewayProfileId;
};

export type GatewayTarget = {
  profile_id: GovGatewayProfileId;
  endpoint_url: string;
  service_code?: string;
  member_code?: string;
  subsystem_code?: string;
  participant_id?: string;
};

export type DeliveryReceipt = {
  ok: boolean;
  native_message_id?: string;
  correlation_id?: string;
  http_status?: number;
  detail?: string;
};

export type AdapterHealth = {
  ok: boolean;
  profile_id: GovGatewayProfileId;
  latency_ms?: number;
  detail?: string;
};

export type IngestResult = {
  ok: boolean;
  envelope?: EventEnvelope;
  profile_id?: GovGatewayProfileId;
  native_message_id?: string;
  reason?: string;
};

export type GovGatewayTransportResult = {
  ok: boolean;
  http_status?: number;
  correlation_id?: string;
  native_message_id?: string;
  detail?: string;
};

/** HTTP/SOAP transport abstraction (mock or live). */
export interface GovGatewayTransport {
  post(
    url: string,
    headers: Record<string, string>,
    body: string | Uint8Array
  ): Promise<GovGatewayTransportResult>;
}

/**
 * National gateway wrapper — maps OpenOrgOS Wire ↔ X-Road / e-Gov / Georgia 3G.
 */
export interface GovGatewayAdapter {
  readonly profile_id: GovGatewayProfileId;
  encode(envelope: EventEnvelope, ctx: EncodeContext): Promise<NativeMessage>;
  decode(native: NativeMessage, ctx: DecodeContext): Promise<EventEnvelope>;
  deliver(native: NativeMessage, target: GatewayTarget): Promise<DeliveryReceipt>;
  health(): Promise<AdapterHealth>;
}

export type GovGatewayInboundWireBody = {
  format: "gov_gateway";
  profile_id: GovGatewayProfileId;
  headers?: Record<string, string>;
  body: string | Record<string, unknown>;
  mime?: string;
  transport_style?: "rest" | "soap";
};
