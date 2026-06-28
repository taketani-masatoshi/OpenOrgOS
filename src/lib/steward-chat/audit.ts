import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getWorkspaceRoot } from "../orgos-paths.js";

export type ChatAuditAction =
  | "login"
  | "logout"
  | "message"
  | "approve"
  | "wire_flush"
  | "witness_register"
  | "witness_verify"
  | "witness_flush";

export interface ChatAuditEntry {
  at: string;
  action: ChatAuditAction;
  operator_id: string;
  approver_id: string;
  ok: boolean;
  path?: string;
  detail?: string;
}

export function isChatAuditEnabled(): boolean {
  return process.env.ORGOS_CHAT_AUDIT !== "0";
}

function auditLogPath(): string {
  const fromEnv = process.env.ORGOS_CHAT_AUDIT_LOG?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), "data", ".orgos", "chat-audit.jsonl");
}

function redactMessage(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function appendChatAudit(entry: Omit<ChatAuditEntry, "at">): void {
  if (!isChatAuditEnabled()) return;
  const path = auditLogPath();
  mkdirSync(dirname(path), { recursive: true });
  const line: ChatAuditEntry = { at: new Date().toISOString(), ...entry };
  appendFileSync(path, `${JSON.stringify(line)}\n`, "utf-8");
}

export function auditChatMessage(message: string): string {
  return redactMessage(message);
}
