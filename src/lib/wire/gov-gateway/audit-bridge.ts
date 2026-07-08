import { appendJsonl } from "../../jsonl-store.js";
import { getGovGatewayAuditPath } from "../../protocol/paths.js";
import type { DeliveryReceipt } from "./types.js";
import type { GovGatewayProfileId } from "../../../../schemas/protocol/gov-gateway-adapter.js";
import type { govGatewayAuditBridgeSchema } from "../../../../schemas/protocol/gov-gateway-adapter.js";
import type { z } from "zod";

type AuditBridge = z.output<typeof govGatewayAuditBridgeSchema>;

export function appendGovGatewayAuditBridge(options: {
  event_id: string;
  profile_id: GovGatewayProfileId;
  receipt: DeliveryReceipt;
  bridge?: AuditBridge;
}): void {
  const mapField = options.bridge?.map_native_id_to ?? "correlation_id";
  const nativeId = options.receipt.correlation_id ?? options.receipt.native_message_id;
  const record = {
    recorded_at: new Date().toISOString(),
    event_id: options.event_id,
    profile_id: options.profile_id,
    ok: options.receipt.ok,
    http_status: options.receipt.http_status,
    [mapField]: nativeId,
    detail: options.receipt.detail,
  };
  appendJsonl(getGovGatewayAuditPath(), record);
}
