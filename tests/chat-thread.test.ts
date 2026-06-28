import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  appendChatTurn,
  historyForOperator,
  loadChatThread,
  saveChatThread,
  CHAT_THREAD_MAX_TURNS,
} from "../src/lib/steward-chat/chat-thread.js";
import { setTenantId } from "../src/lib/tenant.js";
import { existsSync, rmSync } from "node:fs";
import { tenantDataPath } from "../src/lib/tenant.js";

describe("chat thread store", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    const dir = tenantDataPath("chat", "threads");
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("persists and trims conversation turns", () => {
    let thread = loadChatThread("test-thread", "demo");
    for (let i = 0; i < CHAT_THREAD_MAX_TURNS / 2 + 2; i++) {
      thread = appendChatTurn("test-thread", "demo", `q${i}`, `a${i}`);
    }
    expect(thread.messages.length).toBeLessThanOrEqual(CHAT_THREAD_MAX_TURNS);
    const reloaded = loadChatThread("test-thread", "demo");
    expect(reloaded.messages.length).toBe(thread.messages.length);
    expect(historyForOperator(reloaded).length).toBe(reloaded.messages.length);
  });
});
