import {
  chatCashflowStructuredSchema,
  type ChatCashflowStructured,
} from "../../../schemas/steward-chat.js";
import {
  executeOperatorTool,
  type OperatorToolContext,
  type OperatorToolResult,
} from "../operator-runtime/tools.js";
import { parseCashflowChatIntent } from "./cashflow-request.js";

export interface CashflowChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  structured?: ChatCashflowStructured;
}

type CashflowToolExecutor = (
  name: string,
  argsJson: string,
  ctx: OperatorToolContext
) => Promise<OperatorToolResult>;

function formatNullable(value: string | number | null): string {
  return value == null ? "なし" : String(value);
}

function formatCashflowReply(
  summary: string,
  structured: ChatCashflowStructured
): string {
  return [
    summary,
    `Path: \`${structured.cashflow_path}\``,
    `資金ショート日: ${formatNullable(structured.cashflow_shortfall_date)}`,
    `Runway（日）: ${formatNullable(structured.cashflow_runway_days)}`,
    `必要調達額: ${formatNullable(structured.cashflow_required_funding_amount)}`,
    `必要調達期限: ${formatNullable(structured.cashflow_required_funding_by_date)}`,
    `wrote: ${structured.cashflow_wrote}`,
  ].join("\n");
}

export async function handleCashflowChatMessage(
  message: string,
  ctx: OperatorToolContext,
  execute: CashflowToolExecutor = executeOperatorTool
): Promise<CashflowChatResult> {
  const intent = parseCashflowChatIntent(message);
  if (!intent.intent) return { handled: false };
  if (!intent.ok) {
    return { handled: true, ok: false, reply: `資金繰り表を生成できません: ${intent.error}` };
  }

  const toolResult = await execute(
    "operator_generate_cashflow",
    JSON.stringify(intent.request),
    ctx
  );
  if (!toolResult.ok) {
    return {
      handled: true,
      ok: false,
      reply: `資金繰り表を生成できません: ${toolResult.content}`,
    };
  }

  try {
    const payload = JSON.parse(toolResult.content) as Record<string, unknown>;
    const structured = chatCashflowStructuredSchema.parse({
      cashflow_path: payload.path,
      cashflow_shortfall_date: payload.shortfall_date,
      cashflow_runway_days: payload.runway_days,
      cashflow_required_funding_amount: payload.required_funding_amount,
      cashflow_required_funding_by_date: payload.required_funding_by_date,
      cashflow_wrote: payload.wrote,
    });
    return {
      handled: true,
      ok: true,
      reply: formatCashflowReply(String(payload.summary ?? "資金繰り表を生成しました。"), structured),
      structured,
    };
  } catch {
    return {
      handled: true,
      ok: false,
      reply: "資金繰り表を生成できません: 安全な要約を作成できませんでした。",
    };
  }
}
