import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  appendChatTurn,
  appendChatUserMessage,
  historyForOperator,
  loadChatThread,
  setChatHistoryMaxTurns,
  getChatHistoryMaxTurns,
  chatHistoryMaxMessages,
  pruneAllChatThreadsToCurrentLimit,
  setMessageFeedback,
} from "../src/lib/steward-chat/chat-thread.js";
import { setTenantId } from "../src/lib/tenant.js";
import { existsSync, rmSync } from "node:fs";
import { tenantDataPath } from "../src/lib/tenant.js";

describe("chat thread store", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    const chatDir = tenantDataPath("chat");
    if (existsSync(chatDir)) rmSync(chatDir, { recursive: true, force: true });
    setChatHistoryMaxTurns(10);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("persists and trims conversation turns by settings", () => {
    setChatHistoryMaxTurns(5);
    const maxMessages = chatHistoryMaxMessages(5);
    let thread = loadChatThread("test-thread", "demo");
    for (let i = 0; i < 8; i++) {
      thread = appendChatTurn("test-thread", "demo", `q${i}`, `a${i}`);
    }
    expect(thread.messages.length).toBe(maxMessages);
    expect(getChatHistoryMaxTurns()).toBe(5);
    const reloaded = loadChatThread("test-thread", "demo");
    expect(reloaded.messages.length).toBe(maxMessages);
    expect(historyForOperator(reloaded).length).toBe(reloaded.messages.length);
    expect(reloaded.messages[0]?.content).toBe("q3");
  });

  it("prunes when max_turns is lowered", () => {
    setChatHistoryMaxTurns(20);
    for (let i = 0; i < 12; i++) {
      appendChatTurn("shrink-thread", "demo", `q${i}`, `a${i}`);
    }
    expect(loadChatThread("shrink-thread", "demo").messages.length).toBe(24);
    setChatHistoryMaxTurns(5);
    pruneAllChatThreadsToCurrentLimit("demo");
    expect(loadChatThread("shrink-thread", "demo").messages.length).toBe(10);
  });

  it("omits legacy tower-plan replies from operator history", () => {
    appendChatTurn(
      "tower-hist",
      "demo",
      "今日は何日？",
      "**司令塔プラン（確認待ち）**\n\n種別: **unknown** (no_match)",
    );
    appendChatTurn("tower-hist", "demo", "ping", "pong");
    const hist = historyForOperator(loadChatThread("tower-hist", "demo"));
    expect(hist.map((m) => m.content)).toEqual(["今日は何日？", "ping", "pong"]);
  });

  it("pairs concurrent user turns to the matching assistant reply", () => {
    appendChatUserMessage("parallel-thread", "demo", "one");
    appendChatUserMessage("parallel-thread", "demo", "two");
    const afterFirst = appendChatTurn("parallel-thread", "demo", "one", "ans1");
    expect(afterFirst.messages.map((m) => `${m.role}:${m.content}`)).toEqual([
      "user:one",
      "assistant:ans1",
      "user:two",
    ]);
    const afterSecond = appendChatTurn("parallel-thread", "demo", "two", "ans2");
    expect(afterSecond.messages.map((m) => `${m.role}:${m.content}`)).toEqual([
      "user:one",
      "assistant:ans1",
      "user:two",
      "assistant:ans2",
    ]);
  });

  it("persists user message before assistant without duplicating", () => {
    appendChatUserMessage("early-user", "demo", "hello");
    const mid = loadChatThread("early-user", "demo");
    expect(mid.messages).toHaveLength(1);
    expect(mid.messages[0]?.role).toBe("user");
    const done = appendChatTurn("early-user", "demo", "hello", "world");
    expect(done.messages).toHaveLength(2);
    expect(done.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(done.messages.map((m) => m.content)).toEqual(["hello", "world"]);
  });

  it("persists optional assistant source/model meta", () => {
    const done = appendChatTurn("meta-thread", "demo", "q", "a", {
      source: "cloud",
      model: "gpt-test",
      worker_id: "openai-1",
    });
    expect(done.messages[1]).toMatchObject({
      role: "assistant",
      content: "a",
      source: "cloud",
      model: "gpt-test",
      worker_id: "openai-1",
    });
    expect(loadChatThread("meta-thread", "demo").messages[1]?.source).toBe("cloud");
  });

  it("assigns turn_id for deterministic assistant replies (Good/Bad UI)", () => {
    const saved = appendChatTurn("det-turn", "demo", "従業員数は？", "12名", {
      source: "deterministic",
    });
    const assistant = saved.messages.find((m) => m.role === "assistant");
    expect(assistant?.turn_id).toBeTruthy();
    expect(assistant?.source).toBe("deterministic");
    const rated = setMessageFeedback("det-turn", "demo", assistant!.turn_id!, "good");
    expect(rated?.assistant.feedback).toBe("good");
  });
});
