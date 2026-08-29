import { describe, expect, it } from "vitest";
import {
  buildCompanyOfficersView,
  extractCompanyOfficers,
  formatCompanyOfficersCeoReply,
  formatCompanyOfficersTodayLines,
} from "../src/lib/company-officers-view.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("company officers view", () => {
  it("reads MAL representative directors from company.yaml without address", () => {
    setTenantId("mal");
    const view = buildCompanyOfficersView();
    expect(view.coverage).toBe("registered");
    expect(view.officers.map((o) => o.name)).toEqual(["段燕燕", "宮城万貴子"]);
    expect(view.officers.every((o) => o.role === "代表取締役")).toBe(true);
    const reply = formatCompanyOfficersCeoReply(view);
    expect(reply).toContain("段燕燕");
    expect(reply).toContain("宮城万貴子");
    expect(reply).toContain("株式会社MAL");
    expect(reply).not.toMatch(/〒|千代田区|二番町/);
    const today = formatCompanyOfficersTodayLines(view).join("\n");
    expect(today).toContain("段燕燕");
    expect(today).not.toMatch(/〒|千代田区/);
  });

  it("marks demo as unregistered when directors and representative are absent", () => {
    setTenantId("demo");
    const view = buildCompanyOfficersView();
    expect(view.coverage).toBe("unregistered");
    expect(view.officers).toEqual([]);
    expect(formatCompanyOfficersCeoReply(view)).toBe("未登録");
  });

  it("splits representative string when directors array is empty", () => {
    const officers = extractCompanyOfficers({
      name: "テスト株式会社",
      representative: "山田太郎、鈴木花子",
    });
    expect(officers).toEqual([
      { name: "山田太郎", role: "代表取締役" },
      { name: "鈴木花子", role: "代表取締役" },
    ]);
  });

  it("ignores address-like representative values", () => {
    const officers = extractCompanyOfficers({
      name: "テスト株式会社",
      representative: "〒102-0084 東京都千代田区二番町1",
    });
    expect(officers).toEqual([]);
  });
});
