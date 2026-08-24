import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  instructionAuditEntrySchema,
  type InstructionAuditEntry,
} from "../../../schemas/org/instruction-audit.js";
import { getWorkspaceRoot } from "../orgos-paths.js";

const MAX_DETAIL = 120;

export function instructionAuditLogPath(): string {
  const fromEnv = process.env.ORGOS_INSTRUCTION_AUDIT_LOG?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), "data", ".orgos", "instruction-audit.jsonl");
}

export function isInstructionAuditEnabled(): boolean {
  return process.env.ORGOS_INSTRUCTION_AUDIT !== "0";
}

export function redactAuditDetail(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_DETAIL) return oneLine;
  return `${oneLine.slice(0, MAX_DETAIL)}…`;
}

export function appendInstructionAudit(
  entry: Omit<InstructionAuditEntry, "at" | "detail_redacted"> & {
    at?: string;
    detail?: string;
    detail_redacted?: string;
  }
): void {
  if (!isInstructionAuditEnabled()) return;
  const path = instructionAuditLogPath();
  mkdirSync(dirname(path), { recursive: true });
  const line = instructionAuditEntrySchema.parse({
    at: entry.at ?? new Date().toISOString(),
    actor_operator_id: entry.actor_operator_id,
    action: entry.action,
    ok: entry.ok,
    agent_id: entry.agent_id,
    grant_id: entry.grant_id,
    correlation_id: entry.correlation_id,
    detail_redacted: entry.detail_redacted ?? redactAuditDetail(entry.detail),
  });
  appendFileSync(path, `${JSON.stringify(line)}\n`, "utf-8");
}

export function listInstructionAudit(opts?: {
  limit?: number;
  actor?: string;
}): InstructionAuditEntry[] {
  const path = instructionAuditLogPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  const parsed: InstructionAuditEntry[] = [];
  for (const line of lines) {
    try {
      const row = instructionAuditEntrySchema.parse(JSON.parse(line));
      if (opts?.actor && row.actor_operator_id !== opts.actor) continue;
      parsed.push(row);
    } catch {
      /* skip corrupt */
    }
  }
  const limit = opts?.limit ?? 100;
  return parsed.slice(-limit);
}

/** Doctor helper — warn if log is unexpectedly writable as group/other. */
export function instructionAuditPermHint(): { path: string; mode?: string; ok: boolean } {
  const path = instructionAuditLogPath();
  if (!existsSync(path)) return { path, ok: true };
  try {
    const mode = (statSync(path).mode & 0o777).toString(8).padStart(3, "0");
    const worldWritable = (statSync(path).mode & 0o002) !== 0;
    return { path, mode, ok: !worldWritable };
  } catch {
    return { path, ok: true };
  }
}
