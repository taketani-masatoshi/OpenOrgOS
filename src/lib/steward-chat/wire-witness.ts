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
import {
  authenticateOperatorByKey,
  isProdSecurityMode,
  resolveOperatorPermissions,
} from "../console-auth/operator-rbac.js";

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

export function mcpOperatorUser(token?: string): WireConsoleUser {
  const key = token?.trim() || process.env.ORGOS_MCP_TOKEN?.trim() || "";
  if (key) {
    const auth = authenticateOperatorByKey(key);
    if (auth) {
      return {
        operator_id: auth.record.operator_id,
        approver_id: auth.record.approver_name ?? auth.record.display_name,
        mode: isProdSecurityMode() ? "prod" : "dev",
      };
    }
  }

  const operatorId = process.env.MCP_OPERATOR_ID?.trim() || "MCP Operator";
  const approverId = process.env.MCP_APPROVER_ID?.trim() || "CEO";
  return {
    operator_id: operatorId,
    approver_id: approverId,
    mode: isProdSecurityMode() ? "prod" : "dev",
  };
}

export function mcpOperatorPermissions(token?: string): string[] {
  const key = token?.trim() || process.env.ORGOS_MCP_TOKEN?.trim() || "";
  if (key) {
    const auth = authenticateOperatorByKey(key);
    if (auth) return auth.permissions;
  }
  if (!isProdSecurityMode()) {
    return resolveOperatorPermissions({
      operator_id: "dev",
      display_name: "dev",
      role: "ceo",
      status: "active",
    });
  }
  return ["chat:read", "chat:ask"];
}
