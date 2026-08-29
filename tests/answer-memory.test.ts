import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId, tenantDataPath } from "../src/lib/tenant.js";
import {
  appendChatTurn,
  loadChatThread,
  setChatHistoryMaxTurns,
} from "../src/lib/steward-chat/chat-thread.js";
import {
  formatAnswerMemoryBlock,
  isAnswerMemoryEnabled,
  jaccardScore,
  normalizeQuery,
  queryHash,
  reindexAnswerMemory,
  rememberAnswer,
  retrieveAnswerMemory,
  tokenizeQuery,
} from "../src/lib/steward-chat/answer-memory.js";

describe("answer memory", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env = { ...env };
    delete process.env.ORGOS_CHAT_ANSWER_MEMORY;
    const chatDir = tenantDataPath("chat");
    if (existsSync(chatDir)) rmSync(chatDir, { recursive: true, force: true });
    setChatHistoryMaxTurns(10);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("normalizes and hashes queries stably", () => {
    expect(normalizeQuery("  ＡＢＣ  支払  ")).toBe("abc 支払");
    expect(queryHash("Hello")).toBe(queryHash("hello"));
    expect(queryHash("a")).not.toBe(queryHash("b"));
  });

  it("scores similar Japanese queries via tokens", () => {
    const a = tokenizeQuery("来週の支払いリスクは？");
    const b = tokenizeQuery("来週の支払いリスクを教えて");
    expect(jaccardScore(a, b)).toBeGreaterThan(0.3);
  });

  it("prefers cloud over local for the same query hash", () => {
    rememberAnswer({
      query: "Wire の承認手順は？",
      answer: "local answer",
      agentId: "secretary",
      source: "local",
    });
    rememberAnswer({
      query: "Wire の承認手順は？",
      answer: "cloud precise answer",
      agentId: "secretary",
      source: "cloud",
    });
    const hits = retrieveAnswerMemory("Wire の承認手順は？", { agentId: "secretary" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.entry.source).toBe("cloud");
    expect(hits[0]?.entry.answer).toContain("cloud precise");
    expect(hits[0]?.exact).toBe(true);
  });

  it("excludes TTL-expired entries", () => {
    rememberAnswer({
      query: "古い質問",
      answer: "古い回答",
      agentId: "executive_steward",
      source: "cloud",
      at: "2020-01-01T00:00:00.000Z",
    });
    const hits = retrieveAnswerMemory("古い質問", {
      agentId: "executive_steward",
      now: new Date("2026-08-26T00:00:00.000Z"),
      settings: { enabled: true, ttl_days: 30, max_hits: 2, min_score: 0.35 },
    });
    expect(hits).toHaveLength(0);
  });

  it("disables via ORGOS_CHAT_ANSWER_MEMORY=0", () => {
    rememberAnswer({
      query: "テスト",
      answer: "回答",
      source: "cloud",
    });
    process.env.ORGOS_CHAT_ANSWER_MEMORY = "0";
    expect(isAnswerMemoryEnabled()).toBe(false);
    expect(retrieveAnswerMemory("テスト")).toHaveLength(0);
    expect(formatAnswerMemoryBlock(retrieveAnswerMemory("テスト"))).toBe("");
  });

  it("formats grounding block with Today-wins instructions", () => {
    rememberAnswer({
      query: "方針は？",
      answer: "短く答える",
      source: "cloud",
    });
    const block = formatAnswerMemoryBlock(retrieveAnswerMemory("方針は？"));
    expect(block).toContain("Prior cloud/local answers");
    expect(block).toContain("Today wins");
    expect(block).toContain("短く答える");
  });

  it("does not index deterministic replies", () => {
    expect(
      rememberAnswer({
        query: "従業員数は？",
        answer: "12名",
        source: "deterministic",
      })
    ).toBeNull();
    expect(retrieveAnswerMemory("従業員数は？")).toHaveLength(0);
  });

  it("reindexes from threads including legacy unknown source", () => {
    appendChatTurn("local:secretary", "demo", "手順は？", "こうする", {
      source: "cloud",
      model: "gpt-test",
    });
    appendChatTurn("local:secretary", "demo", "別の質問", "legacy answer");
    const thread = loadChatThread("local:secretary", "demo");
    expect(thread.messages.some((m) => m.source === "cloud")).toBe(true);
    expect(thread.messages.some((m) => m.role === "assistant" && !m.source)).toBe(true);

    const result = reindexAnswerMemory("demo");
    expect(result.threads).toBe(1);
    expect(result.indexed).toBeGreaterThanOrEqual(1);
    const hits = retrieveAnswerMemory("手順は？", { agentId: "secretary" });
    expect(hits[0]?.entry.answer).toContain("こうする");
  });

  it("loads legacy thread JSON without meta fields", () => {
    appendChatTurn("legacy-thread", "demo", "q", "a");
    const thread = loadChatThread("legacy-thread", "demo");
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[1]?.source).toBeUndefined();
  });
});
