import { buildTodayContext, formatTodayContextMarkdown } from "../../steward-chat/today-context.js";
import { operatorPolicyExcerpt } from "../../operator-policy.js";
import { runOperatorAsk } from "../../operator-runtime/ask.js";
import { flushWireFromChat } from "../../steward-chat/wire-witness.js";
import { errorResult, jsonResult, textResult, type McpToolResult } from "../result.js";

export async function handleStewardToday(_args: Record<string, unknown>): Promise<McpToolResult> {
  const ctx = buildTodayContext();
  return textResult(formatTodayContextMarkdown(ctx));
}

export async function handleStewardAsk(args: Record<string, unknown>): Promise<McpToolResult> {
  const message = String(args.message ?? "").trim();
  if (!message) {
    return errorResult("message is required");
  }
  const ctx = buildTodayContext();
  const system = [
    operatorPolicyExcerpt(35),
    "",
    "## Today context",
    formatTodayContextMarkdown(ctx),
  ].join("\n");
  const result = await runOperatorAsk(message, system);
  return textResult(result.reply || result.detail, !result.ok);
}

export async function handleStewardApprove(_args: Record<string, unknown>): Promise<McpToolResult> {
  return errorResult(
    "steward_approve is not available. Humans approve via Chat/Wire UI or `org approval approve`."
  );
}

export async function handleStewardWireFlush(
  _args: Record<string, unknown>
): Promise<McpToolResult> {
  const result = await flushWireFromChat();
  return jsonResult(result);
}
