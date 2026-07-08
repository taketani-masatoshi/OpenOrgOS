import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getWorkspaceRoot } from "../orgos-paths.js";

export interface McpAuditEntry {
  at: string;
  tool: string;
  operator_id: string;
  approver_id: string;
  ok: boolean;
  args_summary?: string;
  error?: string;
}

function auditLogPath(): string {
  const fromEnv = process.env.ORGOS_MCP_AUDIT_LOG?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), "data", ".orgos", "mcp-audit.jsonl");
}

function redactArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args).slice(0, 6);
  const parts = keys.map((k) => {
    const v = args[k];
    if (k === "message" && typeof v === "string") {
      return `message=${v.slice(0, 80)}${v.length > 80 ? "…" : ""}`;
    }
    return `${k}=${String(v).slice(0, 40)}`;
  });
  return parts.join(" ");
}

export function appendMcpAudit(entry: Omit<McpAuditEntry, "at">): void {
  if (process.env.ORGOS_MCP_AUDIT === "0") return;
  const path = auditLogPath();
  mkdirSync(dirname(path), { recursive: true });
  const line: McpAuditEntry = { at: new Date().toISOString(), ...entry };
  appendFileSync(path, `${JSON.stringify(line)}\n`, "utf-8");
}

export function auditMcpToolCall(
  tool: string,
  args: Record<string, unknown>,
  operatorId: string,
  approverId: string,
  run: () => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error?: string }> {
  return run()
    .then((result) => {
      appendMcpAudit({
        tool,
        operator_id: operatorId,
        approver_id: approverId,
        ok: result.ok,
        args_summary: redactArgs(args),
        error: result.error,
      });
      return result;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      appendMcpAudit({
        tool,
        operator_id: operatorId,
        approver_id: approverId,
        ok: false,
        args_summary: redactArgs(args),
        error: message,
      });
      throw err;
    });
}
