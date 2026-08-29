import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  handleSalesInboundChatMessage,
  isSalesInboundChatIntent,
  isSalesInboundDetailRequest,
  isSalesInboundKpiTopic,
  looksLikeSalesInboundPolicyRefusal,
  mentionsInboundDomain,
} from "../src/lib/steward-chat/sales-inbound-intent.js";
import { isSalesPipelineChatIntent } from "../src/lib/steward-chat/sales-pipeline-intent.js";
import { salesInboundProvider } from "../src/lib/operator-facts/providers/sales-inbound.js";
import { matchProviderByIntent } from "../src/lib/operator-facts/registry.js";

describe("sales inbound steward chat (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects inbound KPI intents", () => {
    expect(isSalesInboundChatIntent("問合せの状況は？")).toBe(true);
    expect(isSalesInboundChatIntent("インバウンド問い合わせは何件？")).toBe(true);
    expect(isSalesInboundChatIntent("未対応の問合せ")).toBe(true);
    expect(isSalesInboundChatIntent("INQ-2026-001")).toBe(true);
    expect(isSalesInboundChatIntent("商談の状況は？")).toBe(false);
    expect(isSalesInboundChatIntent("パイプラインは何件？")).toBe(false);
  });

  it("does not collide with sales pipeline intent", () => {
    expect(isSalesPipelineChatIntent("商談の状況は？")).toBe(true);
    expect(isSalesInboundChatIntent("商談の状況は？")).toBe(false);
  });

  it("detects inbound domain and detail requests", () => {
    expect(mentionsInboundDomain("提携の問合せ")).toBe(true);
    expect(isSalesInboundDetailRequest("問合せの返信文案を確認")).toBe(true);
    expect(isSalesInboundDetailRequest("問合せの状況は？")).toBe(false);
  });

  it("returns deterministic CEO reply without L2 contact fields", () => {
    const result = handleSalesInboundChatMessage("問合せの状況は？");
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/問合せ/);
    expect(result.reply).not.toMatch(/@/);
    expect(result.reply).not.toMatch(/03-/);
  });

  it("fact provider returns registered coverage", () => {
    const result = salesInboundProvider.run();
    expect(result.ok).toBe(true);
    expect(result.coverage).toBe("registered");
    expect(result.view?.total_inquiries).toBeGreaterThanOrEqual(0);
    expect(result.structuredKey).toBe("sales_inbound");
  });

  it("registers operator_sales_inbound fact provider", () => {
    const provider = matchProviderByIntent("問合せの状況は？");
    expect(provider?.toolName).toBe("operator_sales_inbound");
  });

  it("formats provider view as markdown", () => {
    const result = salesInboundProvider.run();
    const md = salesInboundProvider.format(result.view);
    expect(md).toMatch(/インバウンド問合せ/);
    expect(md).not.toMatch(/@/);
  });

  it("detects kpi topic alias and policy refusal", () => {
    expect(isSalesInboundKpiTopic("問合せの状況は？")).toBe(true);
    expect(
      looksLikeSalesInboundPolicyRefusal(
        "Sales Inbound Agent に委譲してください",
      ),
    ).toBe(true);
  });
});
