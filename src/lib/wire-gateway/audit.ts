import { appendJsonl } from "../jsonl-store.js";
import {
  wireGatewayAuditEntrySchema,
  type WireGatewayAuditEntry,
} from "../../../schemas/protocol/wire-gateway-audit.js";

export function appendWireGatewayAudit(path: string, entry: WireGatewayAuditEntry): void {
  const record = wireGatewayAuditEntrySchema.parse(entry);
  appendJsonl(path, record);
}
