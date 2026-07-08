import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { startStewardMcpHttpServer } from "../src/lib/mcp/http-server.js";
import { callStewardMcpTool, resetMcpRateLimitState } from "../src/lib/mcp/tools.js";

describe("mcp abnormal paths", () => {
  const env = { ...process.env };
  let handle: Awaited<ReturnType<typeof startStewardMcpHttpServer>> | undefined;

  beforeEach(() => {
    process.env.ORGOS_MCP_TOKEN = "abnormal-test-token";
    delete process.env.ORGOS_MCP_AUTH;
    resetMcpRateLimitState();
  });

  afterEach(async () => {
    if (handle) {
      await Promise.race([
        new Promise<void>((resolve) => handle!.close(resolve)),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      handle = undefined;
    }
    process.env = { ...env };
  });

  it("M-01: rejects wrong Bearer token", async () => {
    handle = await startStewardMcpHttpServer({ host: "127.0.0.1", port: 0 });
    const res = await fetch(`${handle.url}/health`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("M-02: rejects unknown MCP path with Bearer", async () => {
    handle = await startStewardMcpHttpServer({ host: "127.0.0.1", port: 0 });
    const res = await fetch(`${handle.url}/mcp/unknown`, {
      headers: { Authorization: "Bearer abnormal-test-token" },
    });
    expect(res.status).toBe(404);
  });

  it("M-03: steward_witness_verify rejects missing event_id", async () => {
    process.env.ORGOS_MCP_RATE_LIMIT = "0";
    const result = await callStewardMcpTool("steward_witness_verify", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/event_id/i);
  });

  it("M-04: unknown tool returns error", async () => {
    process.env.ORGOS_MCP_RATE_LIMIT = "0";
    const result = await callStewardMcpTool("steward_no_such_tool", {});
    expect(result.isError).toBe(true);
  });
});
