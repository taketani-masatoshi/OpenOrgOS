import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  handleSalesOutboundChatMessage,
  isSalesOutboundChatIntent,
  isSalesOutboundDetailRequest,
  mentionsOutboundDomain,
} from "../src/lib/steward-chat/sales-outbound-intent.js";
import { isSalesPipelineChatIntent } from "../src/lib/steward-chat/sales-pipeline-intent.js";
import { isSalesInboundChatIntent } from "../src/lib/steward-chat/sales-inbound-intent.js";
import { salesOutboundProvider } from "../src/lib/operator-facts/providers/sales-outbound.js";

describe("sales outbound steward chat (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects outbound KPI intents", () => {
    expect(isSalesOutboundChatIntent("アウトバウンドの状況は？")).toBe(true);
    expect(isSalesOutboundChatIntent("コールドリストの接触率は？")).toBe(true);
    expect(isSalesOutboundChatIntent("新規開拓の件数")).toBe(true);
    expect(isSalesOutboundChatIntent("OUT-2026-001")).toBe(true);
    expect(isSalesOutboundChatIntent("商談の状況は？")).toBe(false);
    expect(isSalesOutboundChatIntent("問合せの状況は？")).toBe(false);
  });

  it("does not collide with sales pipeline or inbound intent", () => {
    expect(isSalesPipelineChatIntent("商談の状況は？")).toBe(true);
    expect(isSalesOutboundChatIntent("商談の状況は？")).toBe(false);
    expect(isSalesInboundChatIntent("問合せの状況は？")).toBe(true);
    expect(isSalesOutboundChatIntent("問合せの状況は？")).toBe(false);
  });

  it("detects outbound domain and detail requests", () => {
    expect(mentionsOutboundDomain("コールド outreach")).toBe(true);
    expect(mentionsOutboundDomain("ターゲットリストの精査")).toBe(true);
    expect(mentionsOutboundDomain("チェックリストを作って")).toBe(false);
    expect(
      isSalesOutboundDetailRequest("ターゲットリストの初回アプローチ文案を確認"),
    ).toBe(true);
    expect(isSalesOutboundDetailRequest("アウトバウンドの状況は？")).toBe(false);
  });

  it("returns deterministic CEO reply without L2 contact fields", () => {
    const result = handleSalesOutboundChatMessage("アウトバウンドの状況は？");
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/施策/);
    expect(result.reply).not.toMatch(/@/);
    expect(result.reply).not.toMatch(/03-/);
  });

  it("fact provider returns registered coverage with real campaigns", () => {
    const result = salesOutboundProvider.run();
    expect(result.ok).toBe(true);
    expect(result.coverage).toBe("registered");
    expect(result.view?.total_campaigns).toBeGreaterThan(0);
  });
});
