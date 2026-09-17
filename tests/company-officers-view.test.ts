import { describe, expect, it } from "vitest";
import {
  buildCompanyOfficersView,
  extractCompanyOfficers,
  formatCompanyOfficersCeoReply,
  formatCompanyOfficersTodayLines,
} from "../src/lib/company-officers-view.js";
import { loadCompany } from "../src/lib/data.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("company officers view", () => {
  it("reads MAL representative directors from company.yaml without address", () => {
    setTenantId("mal");
    const company = loadCompany();
    const expectedNames = (company.directors ?? []).map((d) => d.name);
    expect(expectedNames.length).toBeGreaterThanOrEqual(1);

    const view = buildCompanyOfficersView();
    expect(view.coverage).toBe("registered");
    expect(view.officers.map((o) => o.name)).toEqual(expectedNames);
    expect(view.officers.every((o) => o.role === "代表取締役")).toBe(true);
    const reply = formatCompanyOfficersCeoReply(view);
    for (const name of expectedNames) expect(reply).toContain(name);
    expect(reply).toContain(company.name);
    expect(reply).not.toMatch(/〒|千代田区|二番町/);
    const today = formatCompanyOfficersTodayLines(view).join("\n");
    expect(today).toContain(expectedNames[0]!);
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
      representative: "〒100-0001 東京都千代田区サンプル1",
    });
    expect(officers).toEqual([]);
  });
});
