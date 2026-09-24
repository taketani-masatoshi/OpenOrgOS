export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
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
  {
    name: "ledger_today",
    description:
      "Ledger today summary — unmatched bank rows, month-close checklist, journal count (read-only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ledger_trial_balance",
    description: "Trial balance summary as_of YYYY-MM-DD (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        as_of: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "ledger_propose_manual_entry",
    description: "Propose a two-line manual journal (does NOT post — approve in Workbench)",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string" },
        debit_account: { type: "string" },
        credit_account: { type: "string" },
        amount_yen: { type: "number" },
        occurred_at: { type: "string" },
      },
      required: ["description", "debit_account", "credit_account", "amount_yen"],
    },
  },
  {
    name: "ledger_propose_bank_match",
    description: "List bank reconciliation proposals (read-only; approve in Workbench)",
    inputSchema: { type: "object", properties: {} },
  },
];

export function listStewardMcpTools(): McpToolDefinition[] {
  return MCP_TOOL_DEFINITIONS;
}
