import { mcpToolPermission } from "../console-auth/operator-rbac.js";
import type { OperatorPermission } from "../../../schemas/org/operator.js";
import { mcpOperatorPermissions } from "../steward-chat/wire-witness.js";
import { errorResult, type McpToolResult } from "./result.js";
import { listStewardMcpTools, type McpToolDefinition } from "./tools/definitions.js";
import { checkMcpRateLimit, resetMcpRateLimitState } from "./tools/rate-limit.js";
import {
  handleStewardApprove,
  handleStewardAsk,
  handleStewardToday,
  handleStewardWireFlush,
} from "./tools/steward.js";
import {
  handleStewardWitnessFlush,
  handleStewardWitnessRegister,
  handleStewardWitnessVerify,
} from "./tools/witness.js";
import {
  handleLedgerProposeBankMatch,
  handleLedgerProposeManualEntry,
  handleLedgerToday,
  handleLedgerTrialBalance,
} from "./tools/ledger.js";

export type { McpToolDefinition, McpToolResult };
export { listStewardMcpTools, resetMcpRateLimitState };

type McpToolHandler = (args: Record<string, unknown>) => Promise<McpToolResult>;

const MCP_TOOL_HANDLERS: Record<string, McpToolHandler> = {
  steward_today: handleStewardToday,
  steward_ask: handleStewardAsk,
  steward_approve: handleStewardApprove,
  steward_wire_flush: handleStewardWireFlush,
  steward_witness_register: handleStewardWitnessRegister,
  steward_witness_verify: handleStewardWitnessVerify,
  steward_witness_flush: handleStewardWitnessFlush,
  ledger_today: handleLedgerToday,
  ledger_trial_balance: handleLedgerTrialBalance,
  ledger_propose_manual_entry: handleLedgerProposeManualEntry,
  ledger_propose_bank_match: handleLedgerProposeBankMatch,
};

export async function callStewardMcpTool(
  tool: string,
  args: Record<string, unknown> = {},
  opts?: { token?: string }
): Promise<McpToolResult> {
  if (!checkMcpRateLimit(tool)) {
    return errorResult("mcp_rate_limit_exceeded");
  }

  const token = opts?.token;
  const requiredPerm = mcpToolPermission(tool);
  if (requiredPerm) {
    const perms = mcpOperatorPermissions(token) as OperatorPermission[];
    if (!perms.includes(requiredPerm)) {
      return errorResult(
        `forbidden: operator lacks permission ${requiredPerm} for tool ${tool}`,
      );
    }
  }

  const handler = MCP_TOOL_HANDLERS[tool];
  if (!handler) {
    return errorResult(`Unknown tool: ${tool}`);
  }
  return handler(args);
}
