import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpOperatorUser } from "../steward-chat/wire-witness.js";
import { auditMcpToolCall } from "./audit.js";
import { callStewardMcpTool, listStewardMcpTools } from "./tools.js";

export function createStewardMcpServer(): Server {
  const server = new Server(
    { name: "orgos-steward", version: "0.8.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listStewardMcpTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const user = mcpOperatorUser();
    const tool = request.params.name;

    let output: { content: { type: "text"; text: string }[]; isError?: boolean } | undefined;
    const audited = await auditMcpToolCall(tool, args, user.operator_id, user.approver_id, async () => {
      try {
        output = await callStewardMcpTool(tool, args);
        return { ok: !output.isError, error: output.isError ? output.content[0]?.text : undefined };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output = { content: [{ type: "text", text: message }], isError: true };
        return { ok: false, error: message };
      }
    });
    if (!audited.ok && !output) {
      return { content: [{ type: "text" as const, text: audited.error ?? "failed" }], isError: true };
    }
    return output!;
  });

  return server;
}

export async function startStewardMcpServer(): Promise<void> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createStewardMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
