import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFactRefusalGuard,
  handleFactChatMessage,
  matchProviderByIntent,
} from "../src/lib/operator-facts/index.js";
import { formatTodayContextMarkdown, buildTodayContext } from "../src/lib/steward-chat/today-context.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat cash counterparties", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches CEO list phrasing and not finance KPI or agent handoff", () => {
    expect(
      matchProviderByIntent(
        "取引先一覧を提示してください。具体的には、当社に入金したり、出金したりしている相手の一覧を出してください。"
      )?.id
    ).toBe("cash_counterparties");
    expect(matchProviderByIntent("主要な取引先の一覧を提示してください。")?.id).toBe(
      "cash_counterparties"
    );
    expect(matchProviderByIntent("現在の現預金残高は？")?.id).toBe("finance_metrics");
    expect(matchProviderByIntent("Contract に確認して")?.id).toBeUndefined();
  });

  it("answers mal cash counterparties without filing a Work Order", () => {
    const result = handleFactChatMessage(
      "取引先一覧を提示してください。具体的には、当社に入金したり、出金したりしている相手の一覧を出してください。"
    );
    expect(result.handled).toBe(true);
    expect(result.providerId).toBe("cash_counterparties");
    expect(result.coverage).toBe("registered");
    expect(result.reply).toMatch(/宿泊OTA/);
    expect(result.reply).toMatch(/番町テナント/);
    expect(result.reply).toMatch(/竹谷/);
    expect(result.reply).not.toMatch(/BANK-|orgos |Path:|IMP-|委譲したふり|オーケストレーション/);
    expect(result.work_order_ids).toBeUndefined();
  });

  it("recovers a policy refusal via the fact guard", () => {
    const fake = "取引先の一覧は専用の Contract Agent が管理する領域にあり、確認できません。";
    const guarded = applyFactRefusalGuard("取引先一覧を提示してください。", fake);
    expect(guarded.guarded).toBe(true);
    expect(guarded.reply).toMatch(/入出金のある相手/);
    expect(guarded.reply).not.toMatch(/確認できません|orgos /);
  });

  it("injects L1 counterparties into Today without account numbers", () => {
    const markdown = formatTodayContextMarkdown(buildTodayContext());
    expect(markdown).toContain("## 入出金相手（売掛・買掛・通帳 · 決定論 · L1）");
    expect(markdown).toMatch(/竹谷/);
    expect(markdown).not.toMatch(/BANK-001/);
  });
});
