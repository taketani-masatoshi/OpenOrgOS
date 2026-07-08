import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { assertMcpAuthConfigured, isMcpAuthDisabled, requiredMcpToken } from "./auth.js";
import { findOperatorByKey, verifyOperatorKey } from "../org/operators.js";
import { createStewardMcpServer } from "./steward-server.js";

export interface McpHttpServerOptions {
  host?: string;
  port?: number;
}

export interface McpHttpServerHandle {
  url: string;
  port: number;
  close: (cb?: () => void) => void;
}

const transports = new Map<string, SSEServerTransport>();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function extractBearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization?.trim();
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

function validateBearer(req: IncomingMessage): boolean {
  if (isMcpAuthDisabled()) return true;
  const token = extractBearer(req);
  if (!token) return false;
  const expected = requiredMcpToken();
  if (expected && token === expected) return true;
  const op = findOperatorByKey(token);
  return Boolean(op && verifyOperatorKey(op.key_hash, token));
}

function unauthorized(res: ServerResponse): void {
  json(res, 401, { error: "unauthorized", detail: "Authorization: Bearer <ORGOS_MCP_TOKEN> required" });
}

export async function startStewardMcpHttpServer(
  opts: McpHttpServerOptions = {}
): Promise<McpHttpServerHandle> {
  assertMcpAuthConfigured();

  const host = opts.host ?? process.env.ORGOS_MCP_HTTP_HOST?.trim() ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env.ORGOS_MCP_HTTP_PORT ?? 9478);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${port}`);
      const pathname = url.pathname;

      if (pathname === "/health" && req.method === "GET") {
        if (!validateBearer(req)) {
          unauthorized(res);
          return;
        }
        json(res, 200, { ok: true, service: "orgos-mcp-http", tools: 7 });
        return;
      }

      if (!validateBearer(req)) {
        unauthorized(res);
        return;
      }

      if (pathname === "/mcp/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/mcp/message", res);
        const mcp = createStewardMcpServer();
        transport.onclose = () => {
          transports.delete(transport.sessionId);
        };
        await mcp.connect(transport);
        transports.set(transport.sessionId, transport);
        return;
      }

      if (pathname === "/mcp/message" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          json(res, 400, { error: "sessionId query param required" });
          return;
        }
        const transport = transports.get(sessionId);
        if (!transport) {
          json(res, 404, { error: "unknown session" });
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  const addr = server.address();
  const actualPort =
    typeof addr === "object" && addr && "port" in addr ? addr.port : port;
  const base = `http://${host}:${actualPort}`;
  return {
    url: base,
    port: actualPort,
    close: (cb) => server.close(cb),
  };
}
