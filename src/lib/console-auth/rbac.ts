import type { ServerResponse } from "node:http";
import {
  loadAuthorizedApprovers,
  normalizePersonName,
} from "../org/authorized-approvers.js";
import type { WireConsoleUser } from "../wire-console/auth/session.js";

export type ChatPermission = "chat:read" | "chat:ask" | "chat:approve" | "chat:wire";

const ALL_PERMISSIONS: ChatPermission[] = [
  "chat:read",
  "chat:ask",
  "chat:approve",
  "chat:wire",
];

function isAuthorizedApprover(approverId: string): boolean {
  const authorized = loadAuthorizedApprovers();
  if (authorized.length === 0) return false;
  const norm = normalizePersonName(approverId);
  return authorized.some((a) => a === norm || a.includes(norm) || norm.includes(a));
}

export function resolveChatPermissions(user: WireConsoleUser): ChatPermission[] {
  if (user.mode === "dev") return [...ALL_PERMISSIONS];
  const perms: ChatPermission[] = ["chat:read", "chat:ask"];
  if (isAuthorizedApprover(user.approver_id)) {
    perms.push("chat:approve", "chat:wire");
  }
  return perms;
}

export function hasChatPermission(user: WireConsoleUser, perm: ChatPermission): boolean {
  return resolveChatPermissions(user).includes(perm);
}

/** Returns false when forbidden (403 already sent). */
export function requireChatPermission(
  user: WireConsoleUser,
  perm: ChatPermission,
  res: ServerResponse
): boolean {
  if (hasChatPermission(user, perm)) return true;
  res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "forbidden", permission: perm }));
  return false;
}
