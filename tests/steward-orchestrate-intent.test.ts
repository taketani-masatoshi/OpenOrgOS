import { beforeEach, describe, expect, it } from "vitest";
import {
  handleStewardOrchestrateChatMessage,
  isStewardOrchestrateIntent,
} from "../src/lib/steward-chat/steward-orchestrate-intent.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward orchestrate intent", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects explicit orchestration phrases", () => {
    expect(isStewardOrchestrateIntent("Finance に確認して")).toBe(true);
    expect(isStewardOrchestrateIntent("財務エージェントへ照会して")).toBe(true);
    expect(isStewardOrchestrateIntent("人事に確認して")).toBe(true);
    expect(isStewardOrchestrateIntent("HR エージェントへ照会")).toBe(true);
    expect(isStewardOrchestrateIntent("天気はどう？")).toBe(false);
  });

  it("creates a real Work Order instead of simulating a report", () => {
    const result = handleStewardOrchestrateChatMessage(
      "Finance に確認して。資金繰りの前提をレビューしてほしい。"
    );
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.work_order_ids?.length).toBeGreaterThan(0);
    expect(result.reply).toContain("実在の Work Order");
    expect(result.reply).toMatch(/IMP-\d{8}-\d+/);
    expect(result.reply).not.toMatch(/シミュレーション|¥XX|historical_finance/);
  });

  it("routes HR orchestration to human_resources", () => {
    const result = handleStewardOrchestrateChatMessage(
      "人事に確認して。在籍人員マスタの整備状況をレビューしてほしい。"
    );
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.work_order_ids?.length).toBeGreaterThan(0);
    expect(result.reply).toMatch(/human_resources|IMP-/);
  });
});
