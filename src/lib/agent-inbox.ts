import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { RelayStatus } from "../../schemas/agent-reporting.js";
import type { Handoff } from "../../schemas/routing.js";
import { getCatalogAgent } from "./agent-catalog.js";
import {
  ackRelay,
  listMissions,
  loadMission,
  type AgentMission,
} from "./agent-reporting.js";
import { listWorkOrders } from "./escalate.js";
import { getWorkspaceRoot } from "./orgos-paths.js";
import { getDocsReportsDir } from "./utils.js";

export type AgentInboxScope = "executive_steward" | "secretary";

export interface AgentInboxItem {
  mission_id: string;
  agent: AgentId;
  agent_label: string;
  subject: string;
  summary?: string;
  /** Repo-relative path under docs/reports/ when present. */
  summary_path?: string;
  work_order_id?: string;
  work_order_status?: Handoff["status"];
  submitted_at?: string;
  created_at: string;
  relay_steward: RelayStatus;
  /** True when Steward has not yet acked (`relay.steward.status === "pending"`). */
  unread: boolean;
}

export interface AgentInboxSnapshot {
  generated_at: string;
  for: AgentInboxScope;
  unread_count: number;
  /** Missions with a report (newest first). */
  items: AgentInboxItem[];
  /** Open orders without a report, or linked WO still pending/blocked. */
  pending_orders: AgentInboxItem[];
}

const DEFAULT_ITEM_LIMIT = 50;
const SUMMARY_BODY_MAX_BYTES = 20 * 1024;
const ALLOWED_SUMMARY_PREFIXES = ["agent-summaries/", "routing-queue/"] as const;

function repoRelativePath(absPath: string): string {
  return relative(getWorkspaceRoot(), absPath).replace(/\\/g, "/");
}

function agentLabel(agentId: AgentId): string {
  const entry = getCatalogAgent(agentId);
  return entry?.name_ja?.trim() || entry?.name?.trim() || agentId;
}

function toInboxItem(
  mission: AgentMission,
  woById: Map<string, Handoff>
): AgentInboxItem {
  const workOrderId = mission.order?.linked_work_order_id;
  const wo = workOrderId ? woById.get(workOrderId) : undefined;
  const summaryPath = mission.report?.summary_path
    ? mission.report.summary_path.startsWith("/")
      ? repoRelativePath(mission.report.summary_path)
      : mission.report.summary_path.replace(/\\/g, "/")
    : undefined;
  return {
    mission_id: mission.id,
    agent: mission.field_agent,
    agent_label: agentLabel(mission.field_agent),
    subject: mission.subject,
    summary: mission.report?.summary,
    summary_path: summaryPath,
    work_order_id: workOrderId,
    work_order_status: wo?.status,
    submitted_at: mission.report?.submitted_at,
    created_at: mission.created_at,
    relay_steward: mission.relay.steward.status,
    unread: mission.relay.steward.status === "pending" && Boolean(mission.report),
  };
}

function matchesScope(mission: AgentMission, scope: AgentInboxScope): boolean {
  if (scope === "executive_steward") return true;
  return mission.order?.from_actor === "secretary";
}

function isPendingOrder(mission: AgentMission, woById: Map<string, Handoff>): boolean {
  if (mission.report) return false;
  if (mission.status === "cancelled" || mission.status === "completed") return false;
  const workOrderId = mission.order?.linked_work_order_id;
  if (!workOrderId) {
    return mission.type === "order" && (mission.status === "ordered" || mission.status === "in_progress");
  }
  const wo = woById.get(workOrderId);
  if (!wo) return true;
  return wo.status === "pending" || wo.status === "blocked" || wo.status === "dispatched";
}

/**
 * Aggregate AgentMission reports + Work Order status for Steward/Secretary Web UI.
 * Deterministic · read-only · no LLM.
 */
export function buildAgentInbox(opts?: {
  for?: AgentInboxScope;
  limit?: number;
}): AgentInboxSnapshot {
  const scope = opts?.for ?? "executive_steward";
  const limit = Math.max(1, opts?.limit ?? DEFAULT_ITEM_LIMIT);
  const missions = listMissions({ skipInvalid: true }).filter((m) => matchesScope(m, scope));
  const woById = new Map(listWorkOrders("all").map((wo) => [wo.id, wo]));

  const withReport = missions
    .filter((m) => Boolean(m.report))
    .map((m) => toInboxItem(m, woById))
    .slice(0, limit);

  const pendingOrders = missions
    .filter((m) => isPendingOrder(m, woById))
    .map((m) => toInboxItem(m, woById))
    .slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    for: scope,
    unread_count: withReport.filter((i) => i.unread).length,
    items: withReport,
    pending_orders: pendingOrders,
  };
}

function clipText(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

/** Markdown digest for system prompt / CLI. Summaries clipped to keep local LLM context small. */
export function formatAgentInboxMarkdown(
  snapshot: AgentInboxSnapshot,
  opts?: { limit?: number; summaryMaxChars?: number }
): string {
  const limit = Math.max(1, opts?.limit ?? 8);
  const summaryMax = Math.max(40, opts?.summaryMaxChars ?? 400);
  const lines: string[] = [
    "## 委譲と回答",
    "",
    `**Scope:** ${snapshot.for} · **未読:** ${snapshot.unread_count} · **回答:** ${snapshot.items.length} · **依頼中:** ${snapshot.pending_orders.length}`,
    "",
  ];

  if (snapshot.for === "secretary" && snapshot.items.length === 0 && snapshot.pending_orders.length === 0) {
    lines.push(
      "秘書スコープは `order.from_actor === \"secretary\"` の案件のみです。",
      "Steward の委譲と回答（全 field agent 報告）とは別軸です。",
      ""
    );
  }

  lines.push("### 回答あり", "");
  const answers = snapshot.items.slice(0, limit);
  if (answers.length === 0) {
    lines.push("（なし）", "");
  } else {
    for (const item of answers) {
      const unread = item.unread ? " · 未読" : "";
      const wo = item.work_order_id
        ? ` · ${item.work_order_id}${item.work_order_status ? ` (${item.work_order_status})` : ""}`
        : "";
      lines.push(`- **${item.agent_label}** · ${item.subject}${unread}${wo}`);
      if (item.summary) {
        lines.push(`  ${clipText(item.summary, summaryMax)}`);
      }
      if (item.summary_path) {
        lines.push(`  Path: ${item.summary_path}`);
      }
    }
    lines.push("");
  }

  lines.push("### 依頼中", "");
  const pending = snapshot.pending_orders.slice(0, limit);
  if (pending.length === 0) {
    lines.push("（なし）", "");
  } else {
    for (const item of pending) {
      const wo = item.work_order_id
        ? ` · ${item.work_order_id}${item.work_order_status ? ` (${item.work_order_status})` : ""}`
        : "";
      lines.push(`- **${item.agent_label}** · ${item.subject}${wo}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Read L1 agent summary / routing-queue markdown.
 * Only paths under docs/reports/{agent-summaries,routing-queue}/ are allowed.
 */
export function readAgentSummaryBody(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("summary path must be repo-relative");
  }
  if (normalized.includes("..")) {
    throw new Error("summary path must not contain ..");
  }

  const reportsRel = repoRelativePath(getDocsReportsDir()).replace(/\\/g, "/");
  const underReports = normalized.startsWith(`${reportsRel}/`)
    ? normalized.slice(reportsRel.length + 1)
    : normalized.startsWith("docs/reports/")
      ? normalized.slice("docs/reports/".length)
      : normalized;

  if (!ALLOWED_SUMMARY_PREFIXES.some((p) => underReports.startsWith(p))) {
    throw new Error(
      "summary path must be under docs/reports/agent-summaries/ or docs/reports/routing-queue/"
    );
  }

  const abs = resolve(getDocsReportsDir(), underReports);
  const reportsRoot = resolve(getDocsReportsDir());
  if (!abs.startsWith(reportsRoot + "/") && abs !== reportsRoot) {
    throw new Error("summary path escapes docs/reports");
  }
  if (!existsSync(abs)) {
    throw new Error(`summary not found: ${normalized}`);
  }

  const raw = readFileSync(abs, "utf-8");
  if (Buffer.byteLength(raw, "utf-8") > SUMMARY_BODY_MAX_BYTES) {
    return raw.slice(0, SUMMARY_BODY_MAX_BYTES) + "\n\n…(truncated)";
  }
  return raw;
}

/** Mark Steward relay as acked and return the updated inbox item. */
export function ackAgentInboxItem(missionId: string, notes?: string): AgentInboxItem {
  const updated = ackRelay({ missionId, role: "steward", notes });
  const woById = new Map(listWorkOrders("all").map((wo) => [wo.id, wo]));
  return toInboxItem(updated, woById);
}

/** Load a single mission as an inbox item (throws if missing). */
export function getAgentInboxItem(missionId: string): AgentInboxItem {
  const mission = loadMission(missionId);
  const woById = new Map(listWorkOrders("all").map((wo) => [wo.id, wo]));
  return toInboxItem(mission, woById);
}
