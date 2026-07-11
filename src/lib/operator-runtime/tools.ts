import { buildTodayContext, formatTodayContextMarkdown } from "../steward-chat/today-context.js";
import { approveFromStewardChat } from "../steward-chat/wire-approve.js";
import { mcpOperatorUser } from "../steward-chat/wire-witness.js";
import { findOperatorById } from "../org/operators.js";
import {
  operatorHasPermission,
  resolveOperatorPermissions,
  type OperatorPermission,
} from "../console-auth/operator-rbac.js";
import { generateJpBankCashflow } from "../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import { runValidateReport } from "../../commands/validate.js";
import { validateCashflowRequest } from "../jp-bank-corporate/cashflow-request.js";

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
        name: "operator_validate_status",
        description:
          "Run read-only OrgOS validation and return L1-safe counts, repo-relative paths, and messages",
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
    {
      type: "function",
      function: {
        name: "operator_generate_cashflow",
        description:
          "Generate a deterministic L1 cashflow summary. Preview by default; write requires write=true.",
        parameters: {
          type: "object",
          properties: {
            granularity: { type: "string", enum: ["daily", "weekly", "monthly"] },
            horizon: { type: "string", description: "Horizon such as 30d, 13w, or 3m" },
            format: { type: "string", enum: ["md", "csv", "json"] },
            write: { type: "boolean", description: "Write the generated schedule (default false)" },
          },
          required: ["granularity", "horizon", "format", "write"],
          additionalProperties: false,
        },
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

function contextHasPermission(
  ctx: OperatorToolContext,
  permission: OperatorPermission
): boolean {
  return operatorHasPermission(
    ctx.operatorId ? findOperatorById(ctx.operatorId) : undefined,
    permission
  );
}

export function listOperatorToolDefinitions(
  ctx?: OperatorToolContext
): OperatorToolDefinition[] {
  const tools = readOnlyTools().filter(
    (tool) =>
      (tool.function.name !== "operator_generate_cashflow" ||
        ctx == null ||
        contextHasPermission(ctx, "chat:ask")) &&
      (tool.function.name !== "operator_validate_status" ||
        ctx == null ||
        contextHasPermission(ctx, "chat:read"))
  );
  if (
    isOperatorToolsWriteEnabled(ctx) &&
    (ctx == null || contextHasPermission(ctx, "chat:approve"))
  ) {
    tools.push(...writeTools());
  }
  return tools;
}

async function execOperatorToday(): Promise<OperatorToolResult> {
  const ctx = buildTodayContext();
  return { ok: true, content: formatTodayContextMarkdown(ctx) };
}

async function execOperatorValidateStatus(
  ctx: OperatorToolContext
): Promise<OperatorToolResult> {
  if (!contextHasPermission(ctx, "chat:read")) {
    return { ok: false, content: "Operator lacks chat:read" };
  }
  const report = runValidateReport();
  return { ok: true, content: JSON.stringify(report) };
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

async function execOperatorGenerateCashflow(
  args: Record<string, unknown>,
  ctx: OperatorToolContext
): Promise<OperatorToolResult> {
  const validation = validateCashflowRequest(args);
  if (!validation.ok) {
    return {
      ok: false,
      content: validation.error,
    };
  }
  const parsed = validation.request;
  if (!contextHasPermission(ctx, "chat:ask")) {
    return { ok: false, content: "Operator lacks chat:ask" };
  }
  if (
    parsed.write &&
    (process.env.ORGOS_LLM_TOOLS_WRITE !== "1" ||
      !contextHasPermission(ctx, "git:write"))
  ) {
    return {
      ok: false,
      content: "Cashflow write disabled or operator lacks git:write",
    };
  }
  try {
    const result = generateJpBankCashflow(parsed);
    return {
      ok: true,
      content: JSON.stringify({
        summary: parsed.write
          ? "Cashflow schedule generated and written."
          : "Cashflow schedule preview generated.",
        path: result.output_path,
        shortfall_date: result.schedule.shortfall_date ?? null,
        runway_days: result.schedule.runway_days ?? null,
        required_funding_amount:
          result.schedule.required_funding_amount ?? null,
        required_funding_by_date:
          result.schedule.required_funding_by_date ?? null,
        wrote: result.wrote,
      }),
    };
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
    case "operator_validate_status":
      return execOperatorValidateStatus(ctx);
    case "operator_list_approvals":
      return execOperatorListApprovals();
    case "operator_list_wire_pending":
      return execOperatorListWirePending();
    case "operator_generate_cashflow":
      return execOperatorGenerateCashflow(args, ctx);
    case "operator_approve":
      if (
        !isOperatorToolsWriteEnabled(ctx) ||
        !contextHasPermission(ctx, "chat:approve")
      ) {
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
