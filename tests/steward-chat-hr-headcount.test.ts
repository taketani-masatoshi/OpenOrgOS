import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFactRefusalGuard,
  handleFactChatMessage,
  listFactProviders,
  matchProviderByIntent,
} from "../src/lib/operator-facts/index.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat HR headcount fact provider", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches headcount intents", () => {
    expect(matchProviderByIntent("従業員数は何人？")?.id).toBe("hr_headcount");
    expect(matchProviderByIntent("社員は何名いますか")?.id).toBe("hr_headcount");
    expect(matchProviderByIntent("在籍人数を教えて")?.id).toBe("hr_headcount");
    expect(matchProviderByIntent("headcount please")?.id).toBe("hr_headcount");
    expect(matchProviderByIntent("従業員の数は？")?.id).toBe("hr_headcount");
    expect(matchProviderByIntent("従業員数に関するご質問")?.id).toBe("hr_headcount");
    expect(matchProviderByIntent("今日の天気は？")).toBeUndefined();
  });

  it("does not steal hire / onboarding as headcount", () => {
    const hire = "社員が入社した。名前は大谷です。手続きを進めてほしい。";
    expect(matchProviderByIntent(hire)).toBeUndefined();
    expect(handleFactChatMessage(hire).handled).toBe(false);

    expect(matchProviderByIntent("従業員を採用したい")).toBeUndefined();
    expect(matchProviderByIntent("退職手続きを進めて")).toBeUndefined();
    expect(matchProviderByIntent("社員の氏名を教えて")).toBeUndefined();

    const fake =
      "（システムが決定論パスを通じて情報を取得し、応答します。）\n\n現在の在籍人数は **XX名** です。";
    const guarded = applyFactRefusalGuard(hire, fake);
    expect(guarded.reply).not.toBe("4名");
    expect(guarded.guarded).toBe(false);
  });

  it("answers deterministically for mal with registered headcount", () => {
    const result = handleFactChatMessage("従業員数は何人？");
    expect(result.handled).toBe(true);
    expect(result.providerId).toBe("hr_headcount");
    expect(result.coverage).toBe("registered");
    expect(result.reply).toBe("4名");
    expect(result.reply).not.toMatch(/段燕燕|宮城|三塚|鈴木|秘書として|決定論パス|人員集計|職種別/);
    expect(result.work_order_ids).toBeUndefined();
  });

  it("recovers placeholder LLM essays via refusal guard", () => {
    const fake =
      "（システムが決定論パスを通じて情報を取得し、応答します。）\n\n現在の在籍人数は **XX名** です。\n\n（※ここにプラットフォームが計算した最新のL1集計値が入ります。）";
    const guarded = applyFactRefusalGuard("従業員の数は？", fake, {
      fromAgent: "secretary",
    });
    expect(guarded.guarded).toBe(true);
    expect(guarded.reply).toBe("4名");
    expect(guarded.reply).not.toMatch(/XX名|ここにプラットフォーム/);
  });

  it("recovers full CLI headcount dump into a CEO one-liner", () => {
    const dump = [
      "# 人員集計 — 株式会社MAL",
      "在籍（active + leave）: 4 名",
      "職種別",
      "この数値は loadEmployees() の決定論結果です。",
    ].join("\n");
    const guarded = applyFactRefusalGuard("従業員数を何人。という形で回答してください", dump);
    expect(guarded.guarded).toBe(true);
    expect(guarded.reply).toBe("4名");
  });

  it("escalates with Work Order when southwood has no employees", () => {
    setTenantId("southwood");
    const result = handleFactChatMessage("従業員数は？", {
      fromAgent: "secretary",
    });
    expect(result.handled).toBe(true);
    expect(result.coverage).toBe("unregistered");
    expect(result.work_order_ids?.length).toBeGreaterThan(0);
    expect(result.reply).toMatch(/IMP-\d{8}-\d+/);
    expect(result.reply).toMatch(/未登録|Work Order/);
  });
});

describe("operator facts registry", () => {
  it("has unique tool names and required fields", () => {
    const providers = listFactProviders();
    const tools = new Set(providers.map((p) => p.toolName));
    const ids = new Set(providers.map((p) => p.id));
    expect(tools.size).toBe(providers.length);
    expect(ids.size).toBe(providers.length);
    for (const p of providers) {
      expect(p.permission).toBeTruthy();
      expect(p.ownerAgent).toBeTruthy();
      expect(p.escalate.path).toBeTruthy();
      expect(p.groundingLabel).toBeTruthy();
      expect(typeof p.intent.test).toBe("function");
      expect(typeof p.topic.test).toBe("function");
    }
    expect(providers.some((p) => p.id === "hr_headcount")).toBe(true);
    expect(providers.some((p) => p.id === "finance_metrics")).toBe(true);
    expect(providers.some((p) => p.id === "contract_status")).toBe(true);
  });
});
