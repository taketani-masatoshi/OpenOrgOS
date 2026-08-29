import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId, tenantDataPath } from "../src/lib/tenant.js";
import {
  appendChatTurn,
  loadChatThread,
  setMessageFeedback,
} from "../src/lib/steward-chat/chat-thread.js";
import {
  applyAnswerFeedback,
  rememberAnswer,
  retrieveAnswerMemory,
} from "../src/lib/steward-chat/answer-memory.js";
import { buildFaqIndex, lookupFaq, tryServeFaqAnswer } from "../src/lib/steward-chat/faq-index.js";
import { recordChatFeedback } from "../src/lib/steward-chat/chat-feedback.js";
import { resetFaqIdleScheduler } from "../src/lib/steward-chat/faq-idle.js";

describe("chat feedback and FAQ index", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env = { ...env };
    delete process.env.ORGOS_CHAT_ANSWER_MEMORY;
    const chatDir = tenantDataPath("chat");
    if (existsSync(chatDir)) rmSync(chatDir, { recursive: true, force: true });
    resetFaqIdleScheduler();
  });

  afterEach(() => {
    process.env = { ...env };
    resetFaqIdleScheduler();
  });

  it("suppresses bad-rated answers on the same query", () => {
    rememberAnswer({
      query: "手順は？",
      answer: "古い手順",
      agentId: "secretary",
      source: "cloud",
    });
    applyAnswerFeedback({
      query: "手順は？",
      answer: "古い手順",
      agentId: "secretary",
      rating: "bad",
    });
    expect(retrieveAnswerMemory("手順は？", { agentId: "secretary" })).toHaveLength(0);
  });

  it("boosts good-rated answers for retrieval", () => {
    rememberAnswer({
      query: "方針は？",
      answer: "短く答える",
      agentId: "executive_steward",
      source: "local",
    });
    applyAnswerFeedback({
      query: "方針は？",
      answer: "短く答える",
      agentId: "executive_steward",
      rating: "good",
    });
    const hits = retrieveAnswerMemory("方針は？", { agentId: "executive_steward" });
    expect(hits[0]?.entry.good_count).toBeGreaterThan(0);
    expect(hits[0]?.score).toBeGreaterThan(1);
  });

  it("builds FAQ from good-rated entries and serves exact match", () => {
    applyAnswerFeedback({
      query: "Wire 承認は？",
      answer: "CEO が PassKey で承認",
      agentId: "secretary",
      rating: "good",
    });
    const built = buildFaqIndex();
    expect(built.entries).toBe(1);
    const served = tryServeFaqAnswer("Wire 承認は？", { agentId: "secretary" });
    expect(served?.answer).toContain("PassKey");
    expect(lookupFaq("Wire 承認は？", { agentId: "secretary" })?.exact).toBe(true);
  });

  it("recordChatFeedback updates thread and memory", () => {
    const thread = appendChatTurn("fb-thread", "demo", "q1", "a1", { source: "cloud" });
    const turnId = thread.messages.find((m) => m.role === "assistant")?.turn_id;
    expect(turnId).toBeTruthy();
    const result = recordChatFeedback({
      threadId: "fb-thread",
      tenant: "demo",
      turnId: turnId!,
      rating: "good",
      agentId: "secretary",
    });
    expect(result.ok).toBe(true);
    const reloaded = loadChatThread("fb-thread", "demo");
    expect(reloaded.messages.find((m) => m.turn_id === turnId)?.feedback).toBe("good");
    expect(tryServeFaqAnswer("q1", { agentId: "secretary" })?.answer).toBe("a1");
  });

  it("setMessageFeedback rejects non-assistant turns", () => {
    appendChatTurn("bad-fb", "demo", "q", "a");
    const userTurn = loadChatThread("bad-fb", "demo").messages[0]?.turn_id;
    expect(userTurn).toBeTruthy();
    expect(setMessageFeedback("bad-fb", "demo", userTurn!, "good")).toBeNull();
  });
});
