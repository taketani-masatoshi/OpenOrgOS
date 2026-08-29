import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  handleSalesPipelineChatMessage,
  isSalesDetailRequest,
  isSalesPipelineChatIntent,
  mentionsSalesDomain,
} from "../src/lib/steward-chat/sales-pipeline-intent.js";
import { salesPipelineProvider } from "../src/lib/operator-facts/providers/sales-pipeline.js";

describe("sales pipeline steward chat (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects sales KPI intents", () => {
    expect(isSalesPipelineChatIntent("商談の状況は？")).toBe(true);
    expect(isSalesPipelineChatIntent("パイプラインは何件？")).toBe(true);
    expect(isSalesPipelineChatIntent("加重パイプライン")).toBe(true);
    expect(isSalesPipelineChatIntent("受注予測を教えて")).toBe(true);
    expect(isSalesPipelineChatIntent("バーンレートは？")).toBe(false);
  });

  it("detects sales domain and detail requests", () => {
    expect(mentionsSalesDomain("営業の状況")).toBe(true);
    expect(isSalesDetailRequest("営業メールの条項を確認")).toBe(true);
    expect(isSalesDetailRequest("商談の状況は？")).toBe(false);
  });

  it("returns deterministic CEO reply without L2 contact fields", () => {
    const result = handleSalesPipelineChatMessage("商談の状況は？");
    expect(result.handled).toBe(true);
    expect(result.reply).toMatch(/商談/);
    expect(result.reply).not.toMatch(/@/);
    expect(result.reply).not.toMatch(/03-/);
  });

  it("fact provider returns registered coverage", () => {
    const result = salesPipelineProvider.run();
    expect(result.ok).toBe(true);
    expect(result.coverage).toBe("registered");
    expect(result.view?.open_deals).toBeGreaterThanOrEqual(0);
  });
});
