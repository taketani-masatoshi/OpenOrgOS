import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFactRefusalGuard,
  handleFactChatMessage,
  matchProviderByIntent,
  matchProviderByTopic,
} from "../src/lib/operator-facts/index.js";
import {
  buildTodayContext,
  formatTodayContextMarkdown,
} from "../src/lib/steward-chat/today-context.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat company officers fact provider", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches representative-director identity questions", () => {
    expect(matchProviderByIntent("株式会社MALの代表取締役は誰？")?.id).toBe(
      "company_officers"
    );
    expect(matchProviderByIntent("代表取締役の名前は？")?.id).toBe(
      "company_officers"
    );
    expect(
      matchProviderByIntent(
        "rules/company_context.md　を参照して、株式会社MALの代表取締役の氏名を教えて。"
      )?.id
    ).toBe("company_officers");
    expect(
      matchProviderByIntent("どのエージェントに聞けば代表取締役の氏名はわかる？")
        ?.id
    ).toBe("company_officers");
    expect(matchProviderByIntent("who is the representative director")?.id).toBe(
      "company_officers"
    );
  });

  it("does not steal board-meeting or headcount phrasing", () => {
    expect(matchProviderByIntent("組織を変えたい。取締役会を開きたい。")).toBeUndefined();
    expect(matchProviderByIntent("取締役会でCOOを任命したい。")).toBeUndefined();
    expect(matchProviderByIntent("従業員数は何人？")?.id).toBe("hr_headcount");
    expect(matchProviderByTopic("取締役会を開きたい")?.id).not.toBe(
      "company_officers"
    );
  });

  it("answers deterministically for mal without address", () => {
    const result = handleFactChatMessage("株式会社MALの代表取締役は誰？");
    expect(result.handled).toBe(true);
    expect(result.providerId).toBe("company_officers");
    expect(result.coverage).toBe("registered");
    expect(result.reply).toMatch(/段燕燕/);
    expect(result.reply).toMatch(/宮城万貴子/);
    expect(result.reply).not.toMatch(/〒|千代田区|確認できません|コンテキスト/);
    expect(result.work_order_ids).toBeUndefined();
  });

  it("recovers the current LLM refusal via the fact guard", () => {
    const fake = "現在のコンテキストからは、代表取締役様の氏名は確認できません。";
    const guarded = applyFactRefusalGuard("株式会社MALの代表取締役は誰？", fake);
    expect(guarded.guarded).toBe(true);
    expect(guarded.reply).toMatch(/段燕燕/);
    expect(guarded.reply).not.toMatch(/確認できません/);
  });

  it("injects L0 officers into Today so the LLM path is also grounded", () => {
    const markdown = formatTodayContextMarkdown(buildTodayContext());
    expect(markdown).toContain("## 会社概要（loadCompany · 決定論 · L0）");
    expect(markdown).toContain("段燕燕");
    expect(markdown).toContain("宮城万貴子");
    expect(markdown).not.toMatch(/〒102|千代田区二番町/);
  });

  it("returns 未登録 for demo without filing a Work Order", () => {
    setTenantId("demo");
    const result = handleFactChatMessage("代表取締役は誰？");
    expect(result.handled).toBe(true);
    expect(result.coverage).toBe("unregistered");
    expect(result.reply).toBe("未登録");
    expect(result.work_order_ids).toBeUndefined();
  });
});
