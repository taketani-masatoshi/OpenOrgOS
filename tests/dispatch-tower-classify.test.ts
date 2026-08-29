import { describe, expect, it } from "vitest";
import { handleTowerChatMessage } from "../src/lib/dispatch-tower/chat-handler.js";
import { classifyWork } from "../src/lib/dispatch-tower/classify.js";

describe("dispatch-tower classify", () => {
  it("does not treat a date question as a work request", () => {
    const c = classifyWork("今日は何日？");
    expect(c.kind).toBe("unknown");
    expect(c.reason).toBe("not_work_request");
  });

  it("does not treat 教えて questions as work dispatch", () => {
    const c = classifyWork("モデル名を教えて");
    expect(c.kind).toBe("unknown");
    expect(c.reason).toBe("not_work_request");
  });

  it("still classifies approval language as judgment", () => {
    const c = classifyWork("この稟議を承認して");
    expect(c.kind).toBe("judgment");
  });

  it("lets Steward chat answer date questions instead of a tower plan", async () => {
    const result = await handleTowerChatMessage("今日は何日？", { toolCtx: {} });
    expect(result.handled).toBe(false);
    expect(result.reply).toBeUndefined();
  });

  it("answers cash counterparties as a live fact instead of homework", async () => {
    const text = "主要な取引先の一覧を提示してください。";
    expect(classifyWork(text).kind).toBe("fact_live");
    const result = await handleTowerChatMessage(text, { toolCtx: {} });
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/入出金のある相手/);
    expect(result.reply).not.toMatch(/orgos |Path:|委譲したふり/);
  });

  it("does not swallow polite agent-handoff phrases before orchestration", async () => {
    const text = "Finance に確認してください。";
    const result = await handleTowerChatMessage(text, { toolCtx: {} });
    expect(result.handled).toBe(false);
  });
});
