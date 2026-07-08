import type { EventEnvelope } from "../../../../../schemas/protocol/org-event.js";
import type { GovGatewayProfileBinding } from "../../../../../schemas/protocol/gov-gateway-adapter.js";
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

export type JpEgovAdapterOptions = {
  transport: GovGatewayTransport;
  binding?: GovGatewayProfileBinding;
  profileEntry: Record<string, unknown>;
};

const PROFILE_ID = "jp_egov_central" as const;

export function createJpEgovCentralAdapter(opts: JpEgovAdapterOptions): GovGatewayAdapter {
  const { transport, binding } = opts;

  return {
    profile_id: PROFILE_ID,

    async encode(envelope: EventEnvelope, ctx: EncodeContext): Promise<NativeMessage> {
      const body = encodeOpenOrgOsMime(envelope);
      const headers: Record<string, string> = {
        "Content-Type": OPENORGOS_ENVELOPE_MIME,
        "X-OpenOrgOS-Event-Id": envelope.event_id,
        "X-Gov-Gateway-Profile": PROFILE_ID,
      };
      if (binding?.api_base_url) {
        headers["X-Target-Base"] = binding.api_base_url;
      }
      if (ctx.tenant_id) {
        headers["X-Tenant-Id"] = ctx.tenant_id;
      }
      return {
        profile_id: PROFILE_ID,
        mime: OPENORGOS_ENVELOPE_MIME,
        body,
        headers,
        correlation_id: envelope.correlation_id ?? envelope.event_id,
        native_message_id: envelope.event_id,
        transport_style: "rest",
      };
    },

    async decode(native: NativeMessage, _ctx: DecodeContext): Promise<EventEnvelope> {
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
      return { ok: true, profile_id: PROFILE_ID, detail: "jp_egov_central adapter ready" };
    },
  };
}

export function parseJpEgovInboundBody(raw: unknown): NativeMessage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.format === "gov_gateway" && obj.profile_id === PROFILE_ID && obj.body) {
    return {
      profile_id: PROFILE_ID,
      mime: OPENORGOS_ENVELOPE_MIME,
      body: typeof obj.body === "string" ? obj.body : JSON.stringify(obj.body),
      headers: (obj.headers as Record<string, string>) ?? {},
      transport_style: "rest",
    };
  }
  return undefined;
}
