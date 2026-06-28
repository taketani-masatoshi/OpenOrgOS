import { startStewardMcpServer } from "../lib/mcp/steward-server.js";
import { startStewardMcpHttpServer } from "../lib/mcp/http-server.js";
import { assertMcpAuthConfigured } from "../lib/mcp/auth.js";
import { randomBytes } from "node:crypto";

export async function runMcpStart(): Promise<void> {
  assertMcpAuthConfigured();
  await startStewardMcpServer();
}

export async function runMcpServeHttp(opts: { host?: string; port?: number }): Promise<void> {
  const handle = await startStewardMcpHttpServer(opts);
  console.log(`OrgOS MCP HTTP · ${handle.url}/mcp/sse`);
  console.log("Authorization: Bearer $ORGOS_MCP_TOKEN");

  await new Promise<void>(() => {
    /* keep alive */
  });
}

export function runMcpRotateToken(): void {
  const token = randomBytes(32).toString("hex");
  console.log("New ORGOS_MCP_TOKEN (copy to MCP client env — do not commit):");
  console.log(token);
  console.log("");
  console.log("Rotation checklist:");
  console.log("  1. Update ORGOS_MCP_TOKEN in .cursor/mcp.json (or Open WebUI env)");
  console.log("  2. Reload MCP server (Cursor: restart MCP / reload window)");
  console.log("  3. Call steward_today to verify");
  console.log("  4. Remove old token from all env files");
  console.log("  5. Check data/.orgos/mcp-audit.jsonl for post-rotation activity");
  console.log("  Recommended cadence: every 90 days, or immediately if leaked");
}
