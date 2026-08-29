import { describe, expect, it } from "vitest";
import {
  collectAccountDedupeIssues,
  normalizeCompanyName,
} from "../src/lib/sales-dedupe.js";

describe("sales-dedupe", () => {
  it("normalizes company names", () => {
    expect(normalizeCompanyName("株式会社テスト")).toBe(
      normalizeCompanyName("（株）テスト"),
    );
  });

  it("flags duplicate normalized companies", () => {
    const issues = collectAccountDedupeIssues([
      { id: "CUST-2026-001", company: "株式会社テスト", lifecycle: "prospect" },
      { id: "CUST-2026-002", company: "（株）テスト", lifecycle: "prospect" },
    ]);
    expect(issues.some((i) => i.kind === "account_company")).toBe(true);
  });
});
