import { buildTodayContext, formatTodayContextMarkdown } from "../steward-chat/today-context.js";
import { findOperatorById } from "../org/operators.js";
import {
  operatorHasPermission,
  resolveOperatorPermissions,
  type OperatorPermission,
} from "../console-auth/operator-rbac.js";
import { generateJpBankCashflow } from "../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import { runValidateReport } from "../../commands/validate.js";
import { validateCashflowRequest } from "../jp-bank-corporate/cashflow-request.js";
import {
  findProviderByTool,
  listFactProviders,
  matchProviderByIntent,
} from "../operator-facts/registry.js";
import {
  handleChatCommandMessage,
  listCommandCatalog,
  resolveCommandPlan,
  saveCommandPlan,
} from "../operator-commands/index.js";

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

/** LLM / tool-loop must never execute final approval (operator-policy §4). */
export const OPERATOR_APPROVE_TOOL_DISABLED =
  "AI cannot approve. Humans approve via Chat/Wire UI or `org approval approve`.";

function factProviderTools(): OperatorToolDefinition[] {
  return listFactProviders().map((p) => ({
    type: "function" as const,
    function: {
      name: p.toolName,
      description: p.description,
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Optional original user question for month/context parsing",
          },
        },
        additionalProperties: false,
      },
    },
  }));
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
    ...factProviderTools(),
    {
      type: "function",
      function: {
        name: "operator_list_commands",
        description: "List chat-enabled OrgOS CLI commands (skill catalog)",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "operator_run_command",
        description:
          "Resolve and run a chat-enabled OrgOS skill/CLI command. Read commands execute; write returns a confirmation plan.",
        parameters: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Natural-language request or skill intent",
            },
            skill_id: {
              type: "string",
              description: "Optional skill id to force (from operator_list_commands)",
            },
          },
          required: ["message"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function isOperatorToolsEnabled(opts?: { supportsTools?: boolean }): boolean {
  if (process.env.ORGOS_LLM_TOOLS === "0") return false;
  if (process.env.ORGOS_LLM_TOOLS === "1") return true;
  // Default: enable only when the leased worker declares tool support.
  if (opts && opts.supportsTools === false) return false;
  if (opts && opts.supportsTools === true) return true;
  return true;
}

/** Non-approval writes only (e.g. cashflow). Never enables operator_approve. */
export function isOperatorToolsWriteEnabled(_ctx?: { operatorId?: string }): boolean {
  return process.env.ORGOS_LLM_TOOLS_WRITE === "1";
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
  const factToolNames = new Set(listFactProviders().map((p) => p.toolName));
  const tools = readOnlyTools().filter((tool) => {
    if (
      tool.function.name === "operator_generate_cashflow" &&
      ctx != null &&
      !contextHasPermission(ctx, "chat:ask")
    ) {
      return false;
    }
    if (
      tool.function.name === "operator_validate_status" &&
      ctx != null &&
      !contextHasPermission(ctx, "chat:read")
    ) {
      return false;
    }
    if (factToolNames.has(tool.function.name) && ctx != null) {
      const provider = findProviderByTool(tool.function.name);
      if (provider && !contextHasPermission(ctx, provider.permission)) {
        return false;
      }
    }
    return true;
  });
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

async function execFactProvider(
  name: string,
  args: Record<string, unknown>,
  ctx: OperatorToolContext
): Promise<OperatorToolResult | null> {
  const provider = findProviderByTool(name);
  if (!provider) return null;
  if (!contextHasPermission(ctx, provider.permission)) {
    return { ok: false, content: `Operator lacks ${provider.permission}` };
  }
  try {
    const result = provider.run(args);
    const content = result.reply ?? provider.format(result.view);
    return { ok: result.ok, content };
  } catch (err) {
    return {
      ok: false,
      content: err instanceof Error ? err.message : String(err),
    };
  }
}

async function execOperatorListCommands(ctx: OperatorToolContext): Promise<OperatorToolResult> {
  const op = ctx.operatorId ? findOperatorById(ctx.operatorId) : undefined;
  const permissions = op ? resolveOperatorPermissions(op) : undefined;
  const commands = listCommandCatalog(permissions);
  return {
    ok: true,
    content: JSON.stringify(
      commands.map((c) => ({
        skill_id: c.skill_id,
        label: c.label,
        kind: c.kind,
        cli_command: c.cli_command,
        permission: c.permission,
      })),
      null,
      2
    ),
  };
}

async function execOperatorRunCommand(
  args: Record<string, unknown>,
  ctx: OperatorToolContext
): Promise<OperatorToolResult> {
  const message = String(args.message ?? "").trim();
  if (!message) return { ok: false, content: "message is required" };
  const permissions = ctx.operatorId
    ? (() => {
        const op = findOperatorById(ctx.operatorId);
        return op ? resolveOperatorPermissions(op) : undefined;
      })()
    : undefined;
  const result = await handleChatCommandMessage({
    message,
    skillId: typeof args.skill_id === "string" ? args.skill_id : undefined,
    operatorId: ctx.operatorId,
    permissions,
  });
  if (!result.handled) {
    const plan = resolveCommandPlan({ message, permissions });
    return { ok: false, content: plan.message ?? "no command matched" };
  }
  if (result.plan && result.plan.status !== "ready") {
    saveCommandPlan(result.plan);
  }
  return {
    ok: result.run?.ok !== false,
    content: JSON.stringify(
      {
        reply: result.reply,
        plan: result.plan,
        run: result.run,
      },
      null,
      2
    ),
  };
}

export async function executeOperatorTool(
  name: string,
  argsJson: string,
  ctx: OperatorToolContext = {}
): Promise<OperatorToolResult> {
  let args: Record<string, unknown>;
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
    case "operator_list_commands":
      return execOperatorListCommands(ctx);
    case "operator_run_command":
      return execOperatorRunCommand(args, ctx);
    case "operator_approve":
      return { ok: false, content: OPERATOR_APPROVE_TOOL_DISABLED };
    default: {
      const fact = await execFactProvider(name, args, ctx);
      if (fact) return fact;
      return { ok: false, content: `Unknown tool: ${name}` };
    }
  }
}

/** Mock LLM tool-call simulation for ORGOS_LLM_MOCK=1 */
export function mockToolCallForMessage(userMessage: string): {
  name: string;
  arguments: string;
} | null {
  const lower = userMessage.toLowerCase();
  const fact = matchProviderByIntent(userMessage);
  if (fact) {
    return {
      name: fact.toolName,
      arguments: JSON.stringify({ message: userMessage }),
    };
  }
  if (lower.includes("承認") || lower.includes("approval")) {
    return { name: "operator_list_approvals", arguments: "{}" };
  }
  if (lower.includes("wire")) {
    return { name: "operator_list_wire_pending", arguments: "{}" };
  }
  return { name: "operator_today", arguments: "{}" };
}
