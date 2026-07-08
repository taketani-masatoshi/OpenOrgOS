import { buildTodayContext, formatTodayContextMarkdown } from "../steward-chat/today-context.js";
import { approveFromStewardChat } from "../steward-chat/wire-approve.js";
import { mcpOperatorUser } from "../steward-chat/wire-witness.js";
import { findOperatorById } from "../org/operators.js";
import { resolveOperatorPermissions } from "../console-auth/operator-rbac.js";

export interface OperatorToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OperatorToolResult {
  ok: boolean;
  content: string;
}

export interface OperatorToolContext {
  operatorId?: string;
  approverId?: string;
}

function readOnlyTools(): OperatorToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "operator_today",
        description: "Fetch OrgOS Today context — decisions, approvals, wire, witness, inbox, KPIs (L1)",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "operator_list_approvals",
        description: "List pending org approvals (id, scope, subject, status)",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "operator_list_wire_pending",
        description: "List wire pending items awaiting CEO approval",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
  ];
}

function writeTools(): OperatorToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "operator_approve",
        description: "Approve a pending org approval by approval_id (wire or internal)",
        parameters: {
          type: "object",
          properties: {
            approval_id: { type: "string", description: "Approval ID e.g. NOTICE-..." },
            flush: { type: "boolean", description: "Flush wire delivery after approve (default true)" },
          },
          required: ["approval_id"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function isOperatorToolsEnabled(): boolean {
  if (process.env.ORGOS_LLM_TOOLS === "0") return false;
  return true;
}

export function isOperatorToolsWriteEnabled(ctx?: { operatorId?: string }): boolean {
  if (process.env.ORGOS_LLM_TOOLS_WRITE !== "1") return false;
  if (ctx?.operatorId) {
    const op = findOperatorById(ctx.operatorId);
    if (op && !resolveOperatorPermissions(op).includes("chat:approve")) return false;
  }
  return true;
}

export function listOperatorToolDefinitions(): OperatorToolDefinition[] {
  const tools = readOnlyTools();
  if (isOperatorToolsWriteEnabled()) {
    tools.push(...writeTools());
  }
  return tools;
}

async function execOperatorToday(): Promise<OperatorToolResult> {
  const ctx = buildTodayContext();
  return { ok: true, content: formatTodayContextMarkdown(ctx) };
}

async function execOperatorListApprovals(): Promise<OperatorToolResult> {
  const ctx = buildTodayContext();
  if (ctx.approvals.length === 0) {
    return { ok: true, content: "No pending approvals." };
  }
  const lines = ctx.approvals.map(
    (a) => `- ${a.id} [${a.scope}] ${a.subject} (${a.status})`
  );
  return { ok: true, content: lines.join("\n") };
}

async function execOperatorListWirePending(): Promise<OperatorToolResult> {
  const ctx = buildTodayContext();
  if (ctx.wire_pending.length === 0) {
    return { ok: true, content: `Wire pending count: ${ctx.wire_pending_count} (no detail rows)` };
  }
  const lines = ctx.wire_pending.map(
    (w) =>
      `- ${w.subject} · ${w.counterparty} · ${w.status_label}${w.approval_id ? ` · id=${w.approval_id}` : ""}`
  );
  return { ok: true, content: lines.join("\n") };
}

async function execOperatorApprove(
  args: Record<string, unknown>,
  ctx: OperatorToolContext
): Promise<OperatorToolResult> {
  const approvalId = String(args.approval_id ?? "").trim();
  if (!approvalId) {
    return { ok: false, content: "approval_id is required" };
  }
  const user = mcpOperatorUser();
  if (ctx.operatorId) user.operator_id = ctx.operatorId;
  if (ctx.approverId) user.approver_id = ctx.approverId;
  try {
    const result = await approveFromStewardChat(approvalId, user, {
      flush: args.flush !== false,
    });
    return { ok: true, content: JSON.stringify(result, null, 2) };
  } catch (err) {
    return {
      ok: false,
      content: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executeOperatorTool(
  name: string,
  argsJson: string,
  ctx: OperatorToolContext = {}
): Promise<OperatorToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, content: "Invalid tool arguments JSON" };
  }

  switch (name) {
    case "operator_today":
      return execOperatorToday();
    case "operator_list_approvals":
      return execOperatorListApprovals();
    case "operator_list_wire_pending":
      return execOperatorListWirePending();
    case "operator_approve":
      if (!isOperatorToolsWriteEnabled(ctx)) {
        return { ok: false, content: "Write tools disabled or operator lacks chat:approve" };
      }
      return execOperatorApprove(args, ctx);
    default:
      return { ok: false, content: `Unknown tool: ${name}` };
  }
}

/** Mock LLM tool-call simulation for ORGOS_LLM_MOCK=1 */
export function mockToolCallForMessage(userMessage: string): {
  name: string;
  arguments: string;
} | null {
  const lower = userMessage.toLowerCase();
  if (lower.includes("承認") || lower.includes("approval")) {
    return { name: "operator_list_approvals", arguments: "{}" };
  }
  if (lower.includes("wire")) {
    return { name: "operator_list_wire_pending", arguments: "{}" };
  }
  return { name: "operator_today", arguments: "{}" };
}
