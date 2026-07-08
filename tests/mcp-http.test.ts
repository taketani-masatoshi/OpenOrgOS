import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { startStewardMcpHttpServer } from "../src/lib/mcp/http-server.js";
import { listStewardMcpTools } from "../src/lib/mcp/tools.js";

describe("mcp http server", () => {
  const env = { ...process.env };
  let handle: Awaited<ReturnType<typeof startStewardMcpHttpServer>> | undefined;

  beforeEach(() => {
    process.env.ORGOS_MCP_TOKEN = "test-http-mcp-token";
    delete process.env.ORGOS_MCP_AUTH;
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

  it("requires Bearer token on /health when auth enabled", async () => {
    handle = await startStewardMcpHttpServer({ host: "127.0.0.1", port: 0 });
    const res = await fetch(`${handle.url}/health`);
    expect(res.status).toBe(401);
  });

  it("returns health with valid Bearer", async () => {
    handle = await startStewardMcpHttpServer({ host: "127.0.0.1", port: 0 });
    const res = await fetch(`${handle.url}/health`, {
      headers: { Authorization: "Bearer test-http-mcp-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("orgos-mcp-http");
  });

  it("exposes witness tool and accepts MCP SSE connection", async () => {
    const names = listStewardMcpTools().map((t) => t.name);
    expect(names).toContain("steward_witness_register");

    handle = await startStewardMcpHttpServer({ host: "127.0.0.1", port: 0 });
    const headers = { Authorization: "Bearer test-http-mcp-token" };

    const controller = new AbortController();
    const sseRes = await fetch(`${handle.url}/mcp/sse`, { headers, signal: controller.signal });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

    const reader = sseRes.body!.getReader();
    const { value } = await reader.read();
    expect(value).toBeTruthy();
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
});
