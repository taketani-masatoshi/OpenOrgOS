import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { pushQueueEvent } from "../src/lib/queue-db.js";

describe("steward chat events stream", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let testPort = 19485;
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    testPort += 1;
    pushQueueEvent({
      type: "pipeline_daily_complete",
      ref: `daily-test-${testPort}`,
      status: "done",
      payload: { summary: "test pipeline" },
    });
    handle = startStewardChatServer({ host: "127.0.0.1", port: testPort });
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function loginCookie(): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  it("streams pipeline_daily_complete on connect when queue has event", async () => {
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/events/stream`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (let i = 0; i < 4; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
      if (text.includes("pipeline_daily_complete")) break;
    }
    await reader.cancel();
    expect(text).toContain("pipeline_daily_complete");
  });

  it("rejects unauthenticated events stream", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/events/stream`);
    expect(res.status).toBe(401);
  });
});
