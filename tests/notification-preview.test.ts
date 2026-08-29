import { describe, expect, it } from "vitest";
import { formatNotificationPreview } from "../apps/steward-chat/src/notificationPreview.ts";

describe("formatNotificationPreview", () => {
  it("strips markdown tables and symbols", () => {
    const raw = `# 現預金 — 株式会社MAL

**Path:** \`data/finance/cash-balance.yaml\`
**合計:** ￥10,000,000

| bank_account_id | 残高 |
|---|---:|
| BANK-001 | ￥6,500,000 |
| BANK-002 | ￥3,500,000 |
`;
    const out = formatNotificationPreview(raw);
    expect(out).not.toMatch(/[#*|]/);
    expect(out).not.toContain("Path:");
    expect(out).toContain("現預金");
    expect(out).toContain("￥10,000,000");
    expect(out.length).toBeLessThanOrEqual(89);
  });

  it("returns empty for blank input", () => {
    expect(formatNotificationPreview("   ")).toBe("");
  });
});
