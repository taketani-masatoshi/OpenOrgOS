import type { ServerResponse } from "node:http";
import type { OperatorPermission, OperatorRecord, OperatorRole } from "../../../schemas/org/operator.js";
import {
  findOperatorByApproverName,
  findOperatorById,
  findOperatorByKey,
  loadOperatorRegistry,
  registryHasApprovers,
  verifyOperatorKey,
} from "../org/operators.js";
import {
  loadAuthorizedApprovers,
  normalizePersonName,
} from "../org/authorized-approvers.js";
import type { WireConsoleUser } from "../wire-console/auth/session.js";
import type { ChatPermission } from "./rbac.js";

export type { OperatorPermission };

const ROLE_PERMISSIONS: Record<OperatorRole, OperatorPermission[]> = {
  ceo: [
    "chat:read",
    "chat:ask",
    "chat:approve",
    "chat:wire",
    "protocol:approve",
    "protocol:draft",
    "broker:transfer",
    "scheduling:write",
    "scheduling:approve",
    "escalate:plan",
    "escalate:run",
    "escalate:complete",
    "agent:dispatch",
    "agent:order",
    "agent:report",
    "agent:shell",
    "git:write",
  ],
  approver: [
    "chat:read",
    "chat:ask",
    "chat:approve",
    "chat:wire",
    "protocol:approve",
    "protocol:draft",
    "broker:transfer",
    "scheduling:write",
    "scheduling:approve",
    "agent:shell",
    "git:write",
  ],
  operator: [
    "chat:read",
    "chat:ask",
    "scheduling:write",
    "escalate:plan",
    "escalate:run",
    "escalate:complete",
    "agent:dispatch",
    "agent:order",
    "agent:report",
  ],
  readonly: ["chat:read"],
  mcp_service: ["chat:read", "chat:ask"],
};

export function isProdSecurityMode(): boolean {
  return (
    process.env.ORGOS_ENV === "production" ||
    process.env.ORGOS_PROD === "1" ||
    process.env.NODE_ENV === "production"
  );
}

export function isOperatorAuthBypassed(): boolean {
  if (process.env.STEWARD_OPERATOR_AUTH === "0") return true;
  if (
    process.env.ORGOS_ENV === "development" &&
    (process.env.ORGOS_TENANT === "demo" || process.env.ORGOS_TENANT?.trim() === "demo")
  ) {
    return true;
  }
  return false;
}

export function isOperatorAuthRequired(): boolean {
  if (isOperatorAuthBypassed()) return false;
  if (isProdSecurityMode()) return true;
  return process.env.STEWARD_OPERATOR_AUTH === "1";
}

export function resolveOperatorPermissions(record: OperatorRecord): OperatorPermission[] {
  const base = new Set<OperatorPermission>(ROLE_PERMISSIONS[record.role] ?? []);
  for (const p of record.permissions ?? []) base.add(p);
  return [...base];
}

export function operatorHasPermission(
  record: OperatorRecord | undefined,
  perm: OperatorPermission
): boolean {
  if (!record || record.status !== "active") return false;
  return resolveOperatorPermissions(record).includes(perm);
}

export function chatPermissionToOperatorPerm(perm: ChatPermission): OperatorPermission {
  return perm as OperatorPermission;
}

export function resolveOperatorFromSessionUser(user: WireConsoleUser): OperatorRecord | undefined {
  const byId = findOperatorById(user.operator_id);
  if (byId) return byId;
  return findOperatorByApproverName(user.approver_id);
}

export function resolveChatPermissionsFromRegistry(user: WireConsoleUser): ChatPermission[] {
  if (user.mode === "dev" && !isProdSecurityMode()) {
    return ["chat:read", "chat:ask", "chat:approve", "chat:wire"];
  }

  const record = resolveOperatorFromSessionUser(user);
  if (record) {
    const perms = resolveOperatorPermissions(record);
    return perms.filter((p): p is ChatPermission =>
      ["chat:read", "chat:ask", "chat:approve", "chat:wire"].includes(p)
    );
  }

  const legacy: ChatPermission[] = ["chat:read", "chat:ask"];
  if (isLegacyAuthorizedApprover(user.approver_id)) {
    legacy.push("chat:approve", "chat:wire");
  }
  return legacy;
}

function isLegacyAuthorizedApprover(approverId: string): boolean {
  const authorized = loadAuthorizedApprovers();
  if (authorized.length === 0) {
    return isProdSecurityMode() ? false : false;
  }
  const norm = normalizePersonName(approverId);
  return authorized.some((a) => a === norm || a.includes(norm) || norm.includes(a));
}

export function assertRegistryReadyForProd(): void {
  if (!isProdSecurityMode()) return;
  const reg = loadOperatorRegistry();
  if (!reg?.operators.length) {
    throw new Error(
      "Production requires data/org/operators.yaml with at least one active operator — run: orgos operator init-registry"
    );
  }
  if (!registryHasApprovers()) {
    throw new Error(
      "Production requires at least one ceo/approver operator in data/org/operators.yaml"
    );
  }
}

export interface AuthenticatedOperator {
  record: OperatorRecord;
  permissions: OperatorPermission[];
}

export function authenticateOperator(opts: {
  operatorId: string;
  key?: string;
}): AuthenticatedOperator | { error: string } {
  const record = findOperatorById(opts.operatorId);
  if (!record) {
    return { error: `Unknown operator_id "${opts.operatorId}"` };
  }
  if (record.status !== "active") {
    return { error: `Operator "${opts.operatorId}" is disabled` };
  }

  if (isOperatorAuthRequired()) {
    const key = opts.key?.trim() || process.env.ORGOS_OPERATOR_KEY?.trim();
    if (!key) {
      return {
        error:
          "Operator key required — set ORGOS_OPERATOR_KEY or pass --operator-key (or ~/.orgos/operators/<id>.key)",
      };
    }
    if (!verifyOperatorKey(record.key_hash, key)) {
      return { error: "Invalid operator key" };
    }
  }

  return { record, permissions: resolveOperatorPermissions(record) };
}

export function authenticateOperatorByKey(key: string): AuthenticatedOperator | undefined {
  const record = findOperatorByKey(key);
  if (!record) return undefined;
  if (!verifyOperatorKey(record.key_hash, key)) return undefined;
  return { record, permissions: resolveOperatorPermissions(record) };
}

export function requireOperatorPermission(
  auth: AuthenticatedOperator,
  perm: OperatorPermission
): void {
  if (!auth.permissions.includes(perm)) {
    throw new Error(
      `Operator "${auth.record.operator_id}" lacks permission ${perm} (role: ${auth.record.role})`
    );
  }
}

export function wirePermissionForAction(action: string): OperatorPermission {
  if (action.includes("approve") || action.includes("reject")) return "protocol:approve";
  if (action.includes("witness")) return "chat:wire";
  if (action.includes("propose") || action.includes("draft")) return "protocol:draft";
  if (action.includes("flush") || action.includes("deliver")) return "chat:wire";
  return "chat:wire";
}

export function requireWireConsolePermission(
  user: WireConsoleUser,
  perm: OperatorPermission,
  res: ServerResponse
): boolean {
  if (user.mode === "dev" && !isProdSecurityMode()) return true;

  const record = resolveOperatorFromSessionUser(user);
  if (record && resolveOperatorPermissions(record).includes(perm)) return true;

  const legacyPerms = resolveChatPermissionsFromRegistry(user);
  if (legacyPerms.includes(perm as ChatPermission)) return true;

  res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "forbidden", permission: perm }));
  return false;
}

export function mcpToolPermission(tool: string): OperatorPermission | undefined {
  if (tool === "steward_today") return "chat:read";
  if (tool === "steward_ask") return "chat:ask";
  if (tool === "steward_approve") return "chat:approve";
  if (tool.startsWith("steward_wire") || tool.startsWith("steward_witness")) return "chat:wire";
  return undefined;
}
