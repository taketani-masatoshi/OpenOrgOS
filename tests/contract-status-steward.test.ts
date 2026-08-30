import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildContractStatusView,
  formatContractStatusMarkdown,
} from "../src/lib/contract-status-view.js";
import {
  handleContractStatusChatMessage,
  isContractDetailRequest,
  isContractStatusChatIntent,
  looksLikeGenericRefusal,
  mentionsContractDomain,
} from "../src/lib/steward-chat/contract-status-intent.js";
import {
  handleStewardOrchestrateChatMessage,
  isStewardOrchestrateIntent,
} from "../src/lib/steward-chat/steward-orchestrate-intent.js";

const SAMPLE_REFUSAL = [
  "契約件数といった詳細なデータは、専用の Contract Agent が管理する領域（data/contracts/**）に存在します。",
  "",
  "経営統括エージェントのポリシー上、全契約データを直接参照することは禁止されており、また現在のコンテキストには「現状の総契約件数」を示すKPIやダッシュボードの情報が含まれていません。",
  "",
  "具体的な契約状況については、Contract Agent へ照会するか、関連する Agent Summary をご確認ください。",
].join("\n");

describe("contract status (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("detects contract KPI intents", () => {
    expect(isContractStatusChatIntent("現状の契約本数を教えて")).toBe(true);
    expect(isContractStatusChatIntent("直近の契約期限")).toBe(true);
    expect(isContractStatusChatIntent("解約できる期間の契約")).toBe(true);
    expect(isContractStatusChatIntent("契約は何本ありますか")).toBe(true);
    expect(isContractStatusChatIntent("契約書は何通ありますか")).toBe(true);
    expect(isContractStatusChatIntent("いま契約はいくつ？")).toBe(true);
    expect(isContractStatusChatIntent("直近で切れる契約は？")).toBe(true);
    expect(isContractStatusChatIntent("契約の更新期限は？")).toBe(true);
    expect(isContractStatusChatIntent("バーンレートは？")).toBe(false);
    expect(isContractStatusChatIntent("Contract に確認して")).toBe(false);
  });

  it("detects contract domain and detail requests independently of KPI intent", () => {
    expect(mentionsContractDomain("契約の状況は？")).toBe(true);
    expect(mentionsContractDomain("NDA を確認して")).toBe(true);
    expect(mentionsContractDomain("バーンレートは？")).toBe(false);
    expect(isContractDetailRequest("契約書の条項を確認して")).toBe(true);
    expect(isContractDetailRequest("現状の契約本数を教えて")).toBe(false);
  });

  it("detects policy refusal essays", () => {
    expect(looksLikeGenericRefusal(SAMPLE_REFUSAL)).toBe(true);
    expect(looksLikeGenericRefusal("契約本数は 15 です。")).toBe(false);
  });

  it("summarizes portfolio counts and alerts", () => {
    const view = buildContractStatusView();
    // The count follows the tenant's contract files, so the assertion is that
    // the view is internally consistent, not that the fixture has a fixed size.
    expect(view.total).toBeGreaterThan(0);
    expect(
      Object.values(view.by_status).reduce((sum, count) => sum + count, 0),
    ).toBe(view.total);
    expect(view.by_status.executed).toBeGreaterThan(0);
    expect(view.by_status.draft).toBeGreaterThan(0);
    const md = formatContractStatusMarkdown(view);
    expect(md).toContain("契約本数");
    expect(md).toContain("data/contracts/");
    expect(md).toContain("CTR-");
  });

  it("answers chat without LLM refusal", () => {
    const result = handleContractStatusChatMessage("現状の契約本数を教えて");
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.reply).toContain(`**${buildContractStatusView().total}**`);
    expect(result.reply).not.toMatch(/直接参照することは禁止/);
  });

  it("answers alternate phrasings deterministically", () => {
    for (const q of [
      "契約は何本ありますか",
      "契約書は何通ありますか",
      "いま契約はいくつ？",
      "直近で切れる契約は？",
    ]) {
      const result = handleContractStatusChatMessage(q);
      expect(result.handled, q).toBe(true);
      expect(result.reply, q).toMatch(/契約 \*\*\d+\*\* 件/);
    }
  });

  it("recovers from refusal essay via deterministic KPI when domain is mentioned", () => {
    // Mirrors applyKpiRefusalGuard recovery path without HTTP.
    expect(mentionsContractDomain("契約の状況を教えて")).toBe(true);
    expect(looksLikeGenericRefusal(SAMPLE_REFUSAL)).toBe(true);
    const recovery = handleContractStatusChatMessage("契約の状況を教えて\n契約本数");
    expect(recovery.handled).toBe(true);
    expect(recovery.reply).toContain(`**${buildContractStatusView().total}**`);
    expect(recovery.reply).not.toMatch(/ポリシー上/);
  });
});

describe("steward orchestrate multi-agent", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches Contract / Compliance orchestration phrases", () => {
    expect(isStewardOrchestrateIntent("Contract に確認して")).toBe(true);
    expect(isStewardOrchestrateIntent("契約エージェントへ照会して")).toBe(true);
    expect(isStewardOrchestrateIntent("Compliance に依頼して")).toBe(true);
    expect(isStewardOrchestrateIntent("Finance に確認して")).toBe(true);
    expect(isStewardOrchestrateIntent("契約書の条項を確認して")).toBe(true);
    expect(isStewardOrchestrateIntent("契約本数を教えて")).toBe(false);
  });

  it("creates a real Work Order for Contract confirmation", () => {
    const result = handleStewardOrchestrateChatMessage(
      "Contract に確認して。CTR-007 の更新方針を整理してほしい。"
    );
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.work_order_ids?.length).toBeGreaterThan(0);
    expect(result.reply).toMatch(/IMP-|Work Order/);
  });

  it("creates a Work Order for contract clause review", () => {
    const result = handleStewardOrchestrateChatMessage("契約書の条項を確認して");
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.work_order_ids?.length).toBeGreaterThan(0);
    expect(result.reply).toMatch(/IMP-|Work Order/);
  });

  it("force-orchestrates on refusal fallback for detail requests", () => {
    const result = handleStewardOrchestrateChatMessage("覚書の本文を読んで", {
      force: true,
      path: "data/contracts/",
      routeBoost: "契約本文・条項の確認（拒否ガードからの委譲）",
    });
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.work_order_ids?.length).toBeGreaterThan(0);
  });
});
