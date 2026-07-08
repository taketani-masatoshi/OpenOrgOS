import type { ServerResponse } from "node:http";
import type { WireConsoleUser } from "../wire-console/auth/session.js";
import { resolveChatPermissionsFromRegistry } from "./operator-rbac.js";

export type ChatPermission = "chat:read" | "chat:ask" | "chat:approve" | "chat:wire";

export function resolveChatPermissions(user: WireConsoleUser): ChatPermission[] {
  return resolveChatPermissionsFromRegistry(user);
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
