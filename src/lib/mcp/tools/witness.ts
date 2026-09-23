import {
  flushWitnessPendingFromChat,
  registerWitnessFromChat,
  verifyWitnessFromChat,
} from "../../steward-chat/wire-witness.js";
import type { WitnessAttestationSide } from "../../../../schemas/protocol/witness-attestation.js";
import { errorResult, jsonResult, type McpToolResult } from "../result.js";

export async function handleStewardWitnessRegister(
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const eventId = String(args.event_id ?? "").trim();
  const side = args.side as WitnessAttestationSide;
  if (!eventId || (side !== "sent" && side !== "received")) {
    return errorResult("event_id and side (sent|received) required");
  }
  const result = await registerWitnessFromChat(eventId, side);
  return jsonResult(result);
}

export async function handleStewardWitnessVerify(
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const eventId = String(args.event_id ?? "").trim();
  if (!eventId) {
    return errorResult("event_id is required");
  }
  const result = await verifyWitnessFromChat(eventId);
  return jsonResult(result);
}

export async function handleStewardWitnessFlush(
  _args: Record<string, unknown>,
): Promise<McpToolResult> {
  const result = await flushWitnessPendingFromChat();
  return jsonResult(result);
}
