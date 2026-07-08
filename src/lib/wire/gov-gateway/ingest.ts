import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import type { GovGatewayProfileId } from "../../../../schemas/protocol/gov-gateway-adapter.js";
import { eventEnvelopeSchema } from "../../../../schemas/protocol/org-event.js";
import { OPENORGOS_ENVELOPE_MIME, decodeOpenOrgOsMime } from "./encode-openorgos-mime.js";
import { resolveAdapter } from "./config.js";
import { parseXRoadInboundBody } from "./adapters/xroad-v7.js";
import { parseJpEgovInboundBody } from "./adapters/jp-egov-central.js";
import { parseGe3gInboundBody } from "./adapters/ge-3g.js";
import type { GovGatewayInboundWireBody, IngestResult, NativeMessage } from "./types.js";

function parseNativeMessage(raw: unknown): NativeMessage | undefined {
  return (
    parseXRoadInboundBody(raw) ??
    parseJpEgovInboundBody(raw) ??
    parseGe3gInboundBody(raw)
  );
}

function decodeNativeBody(native: NativeMessage): EventEnvelope {
  if (native.profile_id === "ge_gov_gateway_3g") {
    const text =
      typeof native.body === "string"
        ? native.body
        : new TextDecoder().decode(native.body);
    const parsed = JSON.parse(text) as { payload?: string | Record<string, unknown> };
    const payload = parsed.payload;
    if (typeof payload === "string") {
      return decodeOpenOrgOsMime(payload);
    }
    if (payload && typeof payload === "object") {
      return decodeOpenOrgOsMime(JSON.stringify(payload));
    }
  }
  return decodeOpenOrgOsMime(native.body);
}

/** Sync decode for webhook ingest path. */
export function decodeGovGatewayInboundSync(
  raw: unknown,
  _tenantId: string
): IngestResult {
  const wrapped = parseNativeMessage(raw);
  if (wrapped) {
    try {
      const envelope = decodeNativeBody(wrapped);
      return {
        ok: true,
        envelope,
        profile_id: wrapped.profile_id,
        native_message_id: wrapped.native_message_id,
      };
    } catch (e) {
      return {
        ok: false,
        profile_id: wrapped.profile_id,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const profileId = obj.profile_id as GovGatewayProfileId | undefined;
    if (obj.format === "gov_gateway" && profileId) {
      return { ok: false, profile_id: profileId, reason: "invalid gov_gateway body" };
    }
  }

  const direct = eventEnvelopeSchema.safeParse(raw);
  if (direct.success) {
    return { ok: true, envelope: direct.data };
  }

  if (typeof raw === "string") {
    try {
      return { ok: true, envelope: decodeOpenOrgOsMime(raw) };
    } catch {
      /* fall through */
    }
  }

  return { ok: false, reason: "not a gov gateway or envelope payload" };
}

export async function decodeGovGatewayInbound(
  raw: unknown,
  tenantId: string
): Promise<IngestResult> {
  const wrapped = parseNativeMessage(raw);
  if (wrapped) {
    try {
      const adapter = resolveAdapter(wrapped.profile_id);
      const envelope = await adapter.decode(wrapped, {
        tenant_id: tenantId,
        profile_id: wrapped.profile_id,
      });
      return {
        ok: true,
        envelope,
        profile_id: wrapped.profile_id,
        native_message_id: wrapped.native_message_id,
      };
    } catch (e) {
      return {
        ok: false,
        profile_id: wrapped.profile_id,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return decodeGovGatewayInboundSync(raw, tenantId);
}

export function isGovGatewayInboundBody(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  if (obj.format === "gov_gateway") return true;
  const envelopeTry = eventEnvelopeSchema.safeParse(raw);
  if (envelopeTry.success) return false;
  return false;
}

export function buildGovGatewayInboundWireBody(
  native: NativeMessage
): GovGatewayInboundWireBody {
  return {
    format: "gov_gateway",
    profile_id: native.profile_id,
    headers: native.headers,
    body: typeof native.body === "string" ? native.body : new TextDecoder().decode(native.body),
    mime: native.mime ?? OPENORGOS_ENVELOPE_MIME,
    transport_style: native.transport_style,
  };
}

export type { EventEnvelope };
