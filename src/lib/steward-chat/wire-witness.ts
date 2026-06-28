import { getTenantId } from "../tenant.js";
import type { WireConsoleUser } from "../wire-console/auth/session.js";
import { isWireConsoleEnabled } from "../wire-console/tenant-registry.js";
import {
  flushTenantWitnessPending,
  flushTenantWirePending,
  registerTenantWitness,
  verifyTenantWitness,
} from "../wire-console/tenant-actions.js";
import type { WitnessAttestationSide } from "../../../schemas/protocol/witness-attestation.js";

export async function registerWitnessFromChat(
  eventId: string,
  side: WitnessAttestationSide
) {
  const tenantId = getTenantId();
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console enabled`);
  }
  return registerTenantWitness(tenantId, eventId, side);
}

export async function verifyWitnessFromChat(eventId: string) {
  const tenantId = getTenantId();
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console enabled`);
  }
  return verifyTenantWitness(tenantId, eventId);
}

export async function flushWitnessPendingFromChat() {
  const tenantId = getTenantId();
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console enabled`);
  }
  return flushTenantWitnessPending(tenantId);
}

export async function flushWireFromChat() {
  const tenantId = getTenantId();
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console enabled`);
  }
  return flushTenantWirePending(tenantId);
}

export function mcpOperatorUser(): WireConsoleUser {
  return {
    operator_id: process.env.MCP_OPERATOR_ID?.trim() || "MCP Operator",
    approver_id: process.env.MCP_APPROVER_ID?.trim() || "CEO",
    mode: "dev",
  };
}
