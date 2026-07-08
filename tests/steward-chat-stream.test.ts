import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { setTenantId } from "../src/lib/tenant.js";

const TEST_PORT = 19480;

describe("steward chat message stream", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "0";
    process.env.ORGOS_LLM_MOCK = "1";
    process.env.ORGOS_CSRF = "0";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  it("streams SSE deltas and done event", async () => {
    process.env.ORGOS_LLM_STRUCTURED = "1";
    process.env.ORGOS_LLM_TELEMETRY = "1";
    handle = startStewardChatServer({ host: "127.0.0.1", port: TEST_PORT });
    baseUrl = handle.url;

    const res = await fetch(`${baseUrl}/chat/v1/message/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "テスト質問" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain("モック");
    expect(text).toContain('"structured"');
    expect(text).toContain('"telemetry"');
  });
});
