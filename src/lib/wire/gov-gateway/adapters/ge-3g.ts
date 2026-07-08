import type { EventEnvelope } from "../../../../../schemas/protocol/org-event.js";
import type { GovGatewayProfileBinding } from "../../../../../schemas/protocol/gov-gateway-adapter.js";
import type { GovGatewayProfileDocument } from "../../../../../schemas/protocol/gov-gateway-profile.js";
import {
  decodeOpenOrgOsMime,
  encodeOpenOrgOsMime,
  OPENORGOS_ENVELOPE_MIME,
} from "../encode-openorgos-mime.js";
import type {
  DecodeContext,
  EncodeContext,
  GatewayTarget,
  GovGatewayAdapter,
  GovGatewayTransport,
  NativeMessage,
} from "../types.js";

export type Ge3gAdapterOptions = {
  transport: GovGatewayTransport;
  binding?: GovGatewayProfileBinding;
  profileDoc: GovGatewayProfileDocument;
};

const PROFILE_ID = "ge_gov_gateway_3g" as const;
const DEFAULT_SERVICE = "wire.notice-deliver";

export function createGe3gAdapter(opts: Ge3gAdapterOptions): GovGatewayAdapter {
  const { transport, binding } = opts;

  return {
    profile_id: PROFILE_ID,

    async encode(envelope: EventEnvelope, ctx: EncodeContext): Promise<NativeMessage> {
      const payload = encodeOpenOrgOsMime(envelope);
      const participantId =
        ctx.participant_id ?? binding?.member_code ?? envelope.origin.org_id;
      const serviceId = ctx.service_code ?? binding?.service_code ?? DEFAULT_SERVICE;
      const wrapper = {
        service_id: serviceId,
        participant_id: participantId,
        payload,
        event_id: envelope.event_id,
      };
      return {
        profile_id: PROFILE_ID,
        mime: "application/json",
        body: JSON.stringify(wrapper),
        headers: {
          "Content-Type": "application/json",
          "X-Gov-Gateway-Profile": PROFILE_ID,
          "X-3G-Transaction-Ref": envelope.event_id,
        },
        correlation_id: envelope.correlation_id ?? envelope.event_id,
        native_message_id: envelope.event_id,
        transport_style: "rest",
      };
    },

    async decode(native: NativeMessage, _ctx: DecodeContext): Promise<EventEnvelope> {
      const text = typeof native.body === "string" ? native.body : new TextDecoder().decode(native.body);
      const parsed = JSON.parse(text) as { payload?: string | Record<string, unknown> };
      const payload = parsed.payload;
      if (typeof payload === "string") {
        return decodeOpenOrgOsMime(payload);
      }
      if (payload && typeof payload === "object") {
        return decodeOpenOrgOsMime(JSON.stringify(payload));
      }
      return decodeOpenOrgOsMime(native.body);
    },

    async deliver(native: NativeMessage, target: GatewayTarget) {
      const result = await transport.post(target.endpoint_url, native.headers, native.body);
      return {
        ok: result.ok,
        http_status: result.http_status,
        correlation_id: result.correlation_id ?? native.correlation_id,
        native_message_id: result.native_message_id ?? native.native_message_id,
        detail: result.detail,
      };
    },

    async health() {
      return { ok: true, profile_id: PROFILE_ID, detail: "ge_gov_gateway_3g adapter ready" };
    },
  };
}

export function parseGe3gInboundBody(raw: unknown): NativeMessage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.format === "gov_gateway" && obj.profile_id === PROFILE_ID && obj.body) {
    return {
      profile_id: PROFILE_ID,
      mime: "application/json",
      body: typeof obj.body === "string" ? obj.body : JSON.stringify(obj.body),
      headers: (obj.headers as Record<string, string>) ?? {},
      transport_style: "rest",
    };
  }
  return undefined;
}
