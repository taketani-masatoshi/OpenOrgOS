import { buildTodayContext, formatTodayContextMarkdown } from "../steward-chat/today-context.js";
import { operatorPolicyExcerpt } from "../operator-policy.js";
import { runOperatorAsk } from "../operator-runtime/ask.js";
import {
  flushWitnessPendingFromChat,
  flushWireFromChat,
  mcpOperatorPermissions,
  registerWitnessFromChat,
  verifyWitnessFromChat,
} from "../steward-chat/wire-witness.js";
import type { WitnessAttestationSide } from "../../../schemas/protocol/witness-attestation.js";
import { mcpToolPermission } from "../console-auth/operator-rbac.js";
import type { OperatorPermission } from "../../../schemas/org/operator.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "steward_today",
    description: "OrgOS Today context — decisions, approvals, wire, witness, inbox (L1)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "steward_ask",
    description: "Ask the OrgOS Operator about the company using Today context",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "CEO question in natural language" },
      },
      required: ["message"],
    },
  },
  {
    name: "steward_wire_flush",
    description: "Flush pending wire delivery queue for the active tenant",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "steward_witness_register",
    description: "Register witness attestation (sent or received) for an event_id",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "Envelope event_id (UUID)" },
        side: { type: "string", enum: ["sent", "received"] },
      },
      required: ["event_id", "side"],
    },
  },
  {
    name: "steward_witness_verify",
    description: "Verify cached witness receipts and quorum for event_id",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "Envelope event_id (UUID)" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "steward_witness_flush",
    description: "Retry failed witness attestations in pending queue",
    inputSchema: { type: "object", properties: {} },
  },
];

export function listStewardMcpTools(): McpToolDefinition[] {
  return MCP_TOOL_DEFINITIONS;
}

function isMcpRateLimitDisabled(): boolean {
  return process.env.ORGOS_MCP_RATE_LIMIT === "0";
}

function mcpRateLimitMax(): number {
  const raw = process.env.ORGOS_MCP_RATE_LIMIT_MAX?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

const mcpCallWindows = new Map<string, number[]>();

/** Reset in-memory MCP rate counters (tests only). */
export function resetMcpRateLimitState(): void {
  mcpCallWindows.clear();
}

function checkMcpRateLimit(tool: string): boolean {
  if (isMcpRateLimitDisabled()) return true;
  const windowMs = 60_000;
  const max = mcpRateLimitMax();
  const now = Date.now();
  const key = tool;

  let timestamps = mcpCallWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    mcpCallWindows.set(key, timestamps);
  }

  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0]! < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= max) return false;
  timestamps.push(now);
  return true;
}

export async function callStewardMcpTool(
  tool: string,
  args: Record<string, unknown> = {},
  opts?: { token?: string }
): Promise<McpToolResult> {
  if (!checkMcpRateLimit(tool)) {
    return {
      content: [{ type: "text", text: "mcp_rate_limit_exceeded" }],
      isError: true,
    };
  }

  const token = opts?.token;
  const requiredPerm = mcpToolPermission(tool);
  if (requiredPerm) {
    const perms = mcpOperatorPermissions(token) as OperatorPermission[];
    if (!perms.includes(requiredPerm)) {
      return {
        content: [
          {
            type: "text",
            text: `forbidden: operator lacks permission ${requiredPerm} for tool ${tool}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (tool === "steward_today") {
    const ctx = buildTodayContext();
    return { content: [{ type: "text", text: formatTodayContextMarkdown(ctx) }] };
  }

  if (tool === "steward_ask") {
    const message = String(args.message ?? "").trim();
    if (!message) {
      return { content: [{ type: "text", text: "message is required" }], isError: true };
    }
    const ctx = buildTodayContext();
    const system = [
      operatorPolicyExcerpt(35),
      "",
      "## Today context",
      formatTodayContextMarkdown(ctx),
    ].join("\n");
    const result = await runOperatorAsk(message, system);
    return {
      content: [{ type: "text", text: result.reply || result.detail }],
      isError: !result.ok,
    };
  }

  if (tool === "steward_approve") {
    return {
      content: [
        {
          type: "text",
          text: "steward_approve is not available. Humans approve via Chat/Wire UI or `org approval approve`.",
        },
      ],
      isError: true,
    };
  }

  if (tool === "steward_wire_flush") {
    const result = await flushWireFromChat();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (tool === "steward_witness_register") {
    const eventId = String(args.event_id ?? "").trim();
    const side = args.side as WitnessAttestationSide;
    if (!eventId || (side !== "sent" && side !== "received")) {
      return {
        content: [{ type: "text", text: "event_id and side (sent|received) required" }],
        isError: true,
      };
    }
    const result = await registerWitnessFromChat(eventId, side);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (tool === "steward_witness_verify") {
    const eventId = String(args.event_id ?? "").trim();
    if (!eventId) {
      return { content: [{ type: "text", text: "event_id is required" }], isError: true };
    }
    const result = await verifyWitnessFromChat(eventId);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (tool === "steward_witness_flush") {
    const result = await flushWitnessPendingFromChat();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${tool}` }],
    isError: true,
  };
}
