import type { EventEnvelope } from "../../../../../schemas/protocol/org-event.js";
import type { GovGatewayProfileBinding, GovGatewayProfileId } from "../../../../../schemas/protocol/gov-gateway-adapter.js";
import type { GovGatewayProfileDocument } from "../../../../../schemas/protocol/gov-gateway-profile.js";
import {
  bodyToString,
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

export type XRoadAdapterOptions = {
  transport: GovGatewayTransport;
  binding?: GovGatewayProfileBinding;
  profileDoc: GovGatewayProfileDocument;
  profileId: GovGatewayProfileId;
};

function resolveClientCode(ctx: EncodeContext, binding?: GovGatewayProfileBinding): string {
  const member = ctx.member_code ?? binding?.member_code ?? "EE/DEV/OPENORGOS";
  const subsystem = ctx.subsystem_code ?? binding?.subsystem_code ?? "wire";
  return `${member}/${subsystem}`;
}

function resolveServiceCode(ctx: EncodeContext, binding?: GovGatewayProfileBinding): string {
  return ctx.service_code ?? binding?.service_code ?? "EE/DEV/OPENORGOS/wire/notice-deliver";
}

export function createXRoadV7Adapter(opts: XRoadAdapterOptions): GovGatewayAdapter {
  const { transport, binding, profileId } = opts;

  return {
    profile_id: profileId,

    async encode(envelope: EventEnvelope, ctx: EncodeContext): Promise<NativeMessage> {
      const body = encodeOpenOrgOsMime(envelope);
      const client = resolveClientCode(ctx, binding);
      const service = resolveServiceCode(ctx, binding);
      return {
        profile_id: profileId,
        mime: OPENORGOS_ENVELOPE_MIME,
        body,
        headers: {
          "Content-Type": OPENORGOS_ENVELOPE_MIME,
          "X-Road-Client": client,
          "X-Road-Service": service,
          "X-Request-Id": envelope.event_id,
        },
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
      return { ok: true, profile_id: profileId, detail: "xroad adapter ready" };
    },
  };
}

export function nativeMessageFromXRoadWire(body: {
  profile_id: GovGatewayProfileId;
  headers?: Record<string, string>;
  body: string | Record<string, unknown>;
}): NativeMessage {
  const payload =
    typeof body.body === "string" ? body.body : JSON.stringify(body.body);
  return {
    profile_id: body.profile_id,
    mime: OPENORGOS_ENVELOPE_MIME,
    body: payload,
    headers: body.headers ?? {},
    transport_style: "rest",
    native_message_id: body.headers?.["X-Request-Id"],
    correlation_id: body.headers?.["X-Request-Id"],
  };
}

const XROAD_PROFILES = new Set<string>(["xroad_v7", "xroad_v6", "xroad_v7_dj"]);

/**
 * Parse inbound X-Road body.
 * Supports:
 * 1. Wrapped: `{ format: "gov_gateway", profile_id, headers, body }`
 * 2. Native REST: `{ profile_id?, headers: { X-Road-* }, body }` (no format wrapper)
 */
export function parseXRoadInboundBody(raw: unknown): NativeMessage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;

  if (obj.format === "gov_gateway") {
    const profileId = obj.profile_id;
    if (typeof profileId !== "string" || !XROAD_PROFILES.has(profileId)) return undefined;
    if (!obj.body) return undefined;
    return nativeMessageFromXRoadWire({
      profile_id: profileId as GovGatewayProfileId,
      headers: (obj.headers as Record<string, string>) ?? {},
      body: obj.body as string | Record<string, unknown>,
    });
  }

  const headers = (obj.headers as Record<string, string> | undefined) ?? undefined;
  const hasXRoad =
    headers &&
    (Boolean(headers["X-Road-Client"] ?? headers["x-road-client"]) ||
      Boolean(headers["X-Road-Service"] ?? headers["x-road-service"]));
  if (!hasXRoad || obj.body === undefined) return undefined;

  const profileRaw = obj.profile_id;
  const profileId =
    typeof profileRaw === "string" && XROAD_PROFILES.has(profileRaw)
      ? (profileRaw as GovGatewayProfileId)
      : ("xroad_v7" as GovGatewayProfileId);

  return nativeMessageFromXRoadWire({
    profile_id: profileId,
    headers,
    body: obj.body as string | Record<string, unknown>,
  });
}

/** Build native message from HTTP request headers + raw body (producer listener). */
export function nativeMessageFromXRoadHttpRequest(opts: {
  profileId?: GovGatewayProfileId;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
}): NativeMessage {
  const pick = (name: string): string | undefined => {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(opts.headers)) {
      if (k.toLowerCase() === lower) {
        return Array.isArray(v) ? v[0] : v;
      }
    }
    return undefined;
  };
  const headers: Record<string, string> = {};
  for (const key of ["X-Road-Client", "X-Road-Service", "X-Request-Id", "Content-Type"]) {
    const value = pick(key);
    if (value) headers[key] = value;
  }
  return nativeMessageFromXRoadWire({
    profile_id: opts.profileId ?? "xroad_v7",
    headers,
    body: opts.bodyText,
  });
}

export { bodyToString };
