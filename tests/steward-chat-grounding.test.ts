import { afterEach, describe, expect, it } from "vitest";
import {
  formatChatGroundingBlock,
  isChatGroundingEnabled,
} from "../src/lib/steward-chat/chat-grounding.js";

describe("chat grounding", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("includes mandatory anti-hallucination rules by default", () => {
    delete process.env.ORGOS_CHAT_GROUNDING;
    expect(isChatGroundingEnabled()).toBe(true);
    const block = formatChatGroundingBlock();
    expect(block).toContain("## Grounding rules (mandatory)");
    expect(block).toContain("未確認");
    expect(block).toContain("¥XX,XXX");
    expect(block).toContain("orgos dashboard");
    expect(block).toContain("Work Order");
  });

  it("disables grounding block when ORGOS_CHAT_GROUNDING=0", () => {
    process.env.ORGOS_CHAT_GROUNDING = "0";
    expect(isChatGroundingEnabled()).toBe(false);
    expect(formatChatGroundingBlock()).toBe("");
  });
});
